<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class NstAttendanceActionService
{
    /*
     * Rules:
     * - Face verification code = 15
     * - Fingerprint verification code = 1
     * - Face + Fingerprint within 10 seconds = verified action
     * - Unmatched fingerprint older than 10 seconds = automatic state toggle
     * - Card is optional and NEVER required
     * - First action starts IN, then state alternates IN/OUT.
     */
    public function rebuild(int $employeeId, string $date): array
    {
        $events = DB::table('nst_hr_attendance_events')
            ->where('employee_id', $employeeId)
            ->whereDate('event_time', $date)
            ->orderBy('event_time')
            ->orderBy('id')
            ->get();

        DB::table('nst_hr_attendance_actions')
            ->where('employee_id', $employeeId)
            ->where('action_date', $date)
            ->delete();

        if ($events->isEmpty()) {
            return ['employee_id'=>$employeeId,'date'=>$date,'actions'=>0];
        }

        $fingerprints = [];
        $faces = [];

        foreach ($events as $event) {
            if ((int)$event->verification_code === 1) {
                $fingerprints[] = $event;
            } elseif ((int)$event->verification_code === 15) {
                $faces[] = $event;
            }
        }

        $usedFaceIds = [];
        $candidates = [];

        /*
         * Build a real biometric action only from a fingerprint and
         * a face occurring within <= 10 seconds.
         */
        foreach ($fingerprints as $fp) {
            $fpTime = Carbon::parse($fp->event_time);
            $match = null;
            $bestSeconds = 999;

            foreach ($faces as $face) {
                if (in_array((int)$face->id, $usedFaceIds, true)) {
                    continue;
                }

                $faceTime = Carbon::parse($face->event_time);
                $seconds = abs($fpTime->diffInSeconds($faceTime));

                if ($seconds <= 10 && $seconds < $bestSeconds) {
                    $match = $face;
                    $bestSeconds = $seconds;
                }
            }

            if ($match) {
                $usedFaceIds[] = (int)$match->id;

                // Use the later biometric timestamp as completion time.
                $actionTime = Carbon::parse($fp->event_time)->greaterThan(
                    Carbon::parse($match->event_time)
                ) ? Carbon::parse($fp->event_time) : Carbon::parse($match->event_time);

                $candidates[] = [
                    'time' => $actionTime,
                    'fp' => $fp,
                    'face' => $match,
                    'auto' => false,
                ];
            } else {
                /*
                 * No face inside 10 seconds.
                 * Only turn into fallback once it is definitely older
                 * than 10 seconds. This avoids premature action.
                 */
                if ($fpTime->copy()->addSeconds(10)->lte(now())) {
                    $candidates[] = [
                        'time' => $fpTime->copy()->addSeconds(10),
                        'fp' => $fp,
                        'face' => null,
                        'auto' => true,
                    ];
                }
            }
        }

        usort($candidates, fn($a,$b) => $a['time']->timestamp <=> $b['time']->timestamp);

        /*
         * Ignore accidental duplicate biometric actions occurring
         * within 15 seconds of the previous completed action.
         */
        $deduped = [];
        foreach ($candidates as $candidate) {
            $previous = end($deduped);

            if ($previous) {
                $gap = abs($previous['time']->diffInSeconds($candidate['time']));
                if ($gap <= 15) {
                    /*
                     * Prefer a fully verified Face+Fingerprint action
                     * over auto fallback when both overlap.
                     */
                    if ($previous['auto'] && !$candidate['auto']) {
                        array_pop($deduped);
                        $deduped[] = $candidate;
                    }
                    continue;
                }
            }

            $deduped[] = $candidate;
        }

        $state = 'outside';
        $actions = [];

        foreach ($deduped as $candidate) {
            if ($state === 'outside') {
                $type = $candidate['auto'] ? 'auto_in' : 'in';
                $state = 'inside';
            } else {
                $type = $candidate['auto'] ? 'auto_out' : 'out';
                $state = 'outside';
            }

            $card = $candidate['fp']->card_number
                ?? ($candidate['face']->card_number ?? null);

            $id = DB::table('nst_hr_attendance_actions')->insertGetId([
                'employee_id' => $employeeId,
                'device_id' => $candidate['fp']->device_id ?? ($candidate['face']->device_id ?? null),
                'action_date' => $date,
                'action_time' => $candidate['time']->format('Y-m-d H:i:s'),
                'action_type' => $type,
                'verification_type' => $candidate['auto'] ? 'fingerprint-fallback' : 'face+fingerprint',
                'fingerprint_event_id' => $candidate['fp']->id ?? null,
                'face_event_id' => $candidate['face']->id ?? null,
                'card_number' => $card,
                'auto_generated' => $candidate['auto'],
                'source' => 'zkteco',
                'note' => $candidate['auto']
                    ? 'Fingerprint received but no Face was received within 10 seconds.'
                    : 'Face + Fingerprint verified within 10 seconds.',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $actions[] = DB::table('nst_hr_attendance_actions')->find($id);
        }

        $this->syncDailyAttendance($employeeId, $date, $actions);

        return [
            'employee_id' => $employeeId,
            'date' => $date,
            'actions' => count($actions),
            'state' => $state,
        ];
    }

    private function syncDailyAttendance(int $employeeId, string $date, array $actions): void
    {
        if (!$actions) {
            return;
        }

        $firstIn = collect($actions)->first(fn($a) =>
            in_array($a->action_type, ['in','auto_in'], true)
        );

        if (!$firstIn) {
            return;
        }

        $ins = collect($actions)->filter(fn($a) =>
            in_array($a->action_type, ['in','auto_in'], true)
        )->values();

        $outs = collect($actions)->filter(fn($a) =>
            in_array($a->action_type, ['out','auto_out','half_day_out'], true)
        )->values();

        $state = in_array(end($actions)->action_type, ['in','auto_in'], true)
            ? 'inside'
            : 'outside';

        $insideMinutes = 0;
        $outsideMinutes = 0;
        $openIn = null;
        $openOut = null;

        foreach ($actions as $action) {
            $time = Carbon::parse($action->action_time);

            if (in_array($action->action_type, ['in','auto_in'], true)) {
                if ($openOut) {
                    $outsideMinutes += max(0, $openOut->diffInMinutes($time));
                    $openOut = null;
                }
                $openIn = $time;
            }

            if (in_array($action->action_type, ['out','auto_out','half_day_out'], true)) {
                if ($openIn) {
                    $insideMinutes += max(0, $openIn->diffInMinutes($time));
                    $openIn = null;
                }
                $openOut = $time;
            }
        }

        if ($state === 'inside' && $openIn) {
            $insideMinutes += max(
                0,
                $openIn->diffInMinutes(
                    Carbon::parse($date.' '.now()->format('H:i:s'))
                )
            );
        }

        if ($state === 'outside' && $openOut) {
            $outsideMinutes += max(
                0,
                $openOut->diffInMinutes(
                    Carbon::parse($date.' '.now()->format('H:i:s'))
                )
            );
        }

        $lastOut = $outs->last();
        $lastAction = end($actions);

        /*
         * Half-day integration:
         * If the existing HR leave workflow has already marked attendance
         * half_day, preserve it. Do not overwrite approved HR decisions.
         */
        $existing = DB::table('nst_hr_attendance')
            ->where('employee_id', $employeeId)
            ->where('attendance_date', $date)
            ->first();

        $status = ($existing && $existing->status === 'half_day')
            ? 'half_day'
            : 'present';

        $payload = [
            'check_in' => Carbon::parse($firstIn->action_time)->format('H:i:s'),

            /*
             * check_out only represents the latest currently-final OUT.
             * If employee returned IN, dashboard correctly shows "—".
             */
            'check_out' => $state === 'outside' && $lastOut
                ? Carbon::parse($lastOut->action_time)->format('H:i:s')
                : null,

            'total_inside_minutes' => $insideMinutes,
            'total_outside_minutes' => $outsideMinutes,
            'exit_count' => $outs->count(),
            'in_count' => $ins->count(),
            'out_count' => $outs->count(),
            'movement_state' => $state,
            'attendance_open' => $state === 'inside' ? 1 : 0,
            'status' => $status,
            'source' => 'zkteco',
            'first_attendance_verified_at' => $firstIn->action_time,
            'first_verification_mode' => $firstIn->verification_type,
            'last_action_type' => $lastAction->action_type,
            'final_out_at' => $state === 'outside' && $lastOut
                ? $lastOut->action_time
                : null,
            'note' => 'NST biometric attendance: Face + Fingerprint primary; Card optional; 10-second fingerprint fallback enabled.',
            'updated_at' => now(),
        ];

        if (!$existing) {
            $payload['employee_id'] = $employeeId;
            $payload['attendance_date'] = $date;
            $payload['late_minutes'] = 0;
            $payload['overtime_minutes'] = 0;
            $payload['early_leave_minutes'] = 0;
            $payload['created_at'] = now();

            DB::table('nst_hr_attendance')->insert($payload);
        } else {
            DB::table('nst_hr_attendance')
                ->where('id', $existing->id)
                ->update($payload);
        }

        /*
         * Recreate movement periods from actions.
         */
        DB::table('nst_hr_movement_logs')
            ->where('employee_id', $employeeId)
            ->where('movement_date', $date)
            ->delete();

        $pendingOut = null;

        foreach ($actions as $action) {
            if (in_array($action->action_type, ['out','auto_out','half_day_out'], true)) {
                $pendingOut = $action;
                continue;
            }

            if (in_array($action->action_type, ['in','auto_in'], true) && $pendingOut) {
                $out = Carbon::parse($pendingOut->action_time);
                $in = Carbon::parse($action->action_time);

                DB::table('nst_hr_movement_logs')->insert([
                    'employee_id' => $employeeId,
                    'movement_date' => $date,
                    'out_time' => $out->format('Y-m-d H:i:s'),
                    'in_time' => $in->format('Y-m-d H:i:s'),
                    'outside_duration_minutes' => max(0, $out->diffInMinutes($in)),
                    'out_event_id' => $pendingOut->face_event_id ?: $pendingOut->fingerprint_event_id,
                    'in_event_id' => $action->face_event_id ?: $action->fingerprint_event_id,
                    'status' => 'closed',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);

                $pendingOut = null;
            }
        }

        if ($pendingOut) {
            DB::table('nst_hr_movement_logs')->insert([
                'employee_id' => $employeeId,
                'movement_date' => $date,
                'out_time' => $pendingOut->action_time,
                'in_time' => null,
                'outside_duration_minutes' => 0,
                'out_event_id' => $pendingOut->face_event_id ?: $pendingOut->fingerprint_event_id,
                'in_event_id' => null,
                'status' => 'open',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function rebuildPending(): array
    {
        $rows = DB::table('nst_hr_attendance_events')
            ->whereNotNull('employee_id')
            ->whereDate('event_time', '>=', now()->copy()->subDays(2)->toDateString())
            ->selectRaw('employee_id, DATE(event_time) action_date')
            ->distinct()
            ->get();

        $done = 0;

        foreach ($rows as $row) {
            $this->rebuild((int)$row->employee_id, (string)$row->action_date);
            $done++;
        }

        return ['days_rebuilt' => $done];
    }
}
