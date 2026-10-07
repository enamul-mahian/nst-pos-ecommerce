<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class ZktecoAttendanceService
{
    public function recordPacket(?object $device, string $serial, string $endpoint, string $method, array $query, string $raw, ?string $sourceIp = null): array
    {
        ksort($query);
        $packetHash = hash('sha256', implode('|', [
            (string) ($device->id ?? 0), $serial, $endpoint, strtoupper($method), json_encode($query), $raw,
        ]));

        if ($device) {
            DB::table('nst_zk_devices')->where('id', $device->id)->update([
                'last_seen_at' => now(),
                'last_seen_ip' => $sourceIp,
                'updated_at' => now(),
            ]);
        }

        $existing = DB::table('nst_zk_ingest_packets')->where('payload_hash', $packetHash)->first();
        if ($existing) {
            return ['packet' => $existing, 'duplicate' => true, 'events' => 0];
        }

        $packetId = DB::table('nst_zk_ingest_packets')->insertGetId([
            'device_id' => $device->id ?? null,
            'serial_number' => $serial ?: null,
            'endpoint' => $endpoint,
            'http_method' => strtoupper($method),
            'query_params' => $query ? json_encode($query, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            'raw_payload' => $raw !== '' ? $raw : null,
            'payload_hash' => $packetHash,
            'parse_status' => $device ? 'received' : 'unregistered_device',
            'parse_note' => $device ? null : 'Serial number is not registered or the device is inactive.',
            'source_ip' => $sourceIp,
            'received_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $packet = DB::table('nst_zk_ingest_packets')->find($packetId);
        if (!$device) {
            return ['packet' => $packet, 'duplicate' => false, 'events' => 0];
        }

        try {
            $normalized = $this->normalizePacket($device, $raw, $query, $endpoint);
            $inserted = 0;
            foreach ($normalized as $event) {
                if ($this->ingestEvent($device, $packetId, $event, $endpoint)) {
                    $inserted++;
                }
            }

            DB::table('nst_zk_ingest_packets')->where('id', $packetId)->update([
                'parse_status' => $normalized ? 'processed' : 'stored_unparsed',
                'parse_note' => $normalized ? sprintf('%d event(s) parsed; %d new event(s) stored.', count($normalized), $inserted) : 'Raw packet stored. No attendance event could be proven from this payload.',
                'updated_at' => now(),
            ]);

            return ['packet' => DB::table('nst_zk_ingest_packets')->find($packetId), 'duplicate' => false, 'events' => $inserted];
        } catch (Throwable $error) {
            DB::table('nst_zk_ingest_packets')->where('id', $packetId)->update([
                'parse_status' => 'parse_error',
                'parse_note' => Str::limit($error->getMessage(), 1000),
                'updated_at' => now(),
            ]);
            report($error);
            return ['packet' => DB::table('nst_zk_ingest_packets')->find($packetId), 'duplicate' => false, 'events' => 0, 'error' => $error->getMessage()];
        }
    }

    public function ingestGenericEvent(object $device, array $payload, string $endpoint = 'generic'): ?object
    {
        $event = $this->normalizeArrayEvent($payload, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        if (!$event) {
            return null;
        }
        $id = $this->ingestEvent($device, null, $event, $endpoint);
        return $id ? DB::table('nst_hr_attendance_events')->where('id', $id)->first() : null;
    }

    public function reprocessMapping(int $mappingId): int
    {
        $mapping = DB::table('nst_zk_employee_mappings')->where('id', $mappingId)->where('is_active', true)->first();
        if (!$mapping) {
            return 0;
        }

        $query = DB::table('nst_hr_attendance_events')
            ->where('device_id', $mapping->device_id)
            ->whereNull('employee_id')
            ->where(function ($q) use ($mapping) {
                $q->where('device_user_id', $mapping->device_user_id);
                if ($mapping->card_number) {
                    $q->orWhere('card_number', $mapping->card_number);
                }
            });

        $ids = $query->pluck('id');
        if ($ids->isEmpty()) {
            return 0;
        }

        DB::table('nst_hr_attendance_events')->whereIn('id', $ids)->update([
            'employee_id' => $mapping->employee_id,
            'processing_status' => 'accepted',
            'processing_note' => 'Mapped to NST employee and reprocessed.',
            'updated_at' => now(),
        ]);

        $dates = DB::table('nst_hr_attendance_events')->whereIn('id', $ids)
            ->selectRaw('DATE(event_time) as event_date')->distinct()->pluck('event_date');
        foreach ($dates as $date) {
            $this->rebuildDaily($mapping->employee_id, (string) $date);
        }

        return $ids->count();
    }

    public function rebuildDaily(int $employeeId, string $date): array
    {
        $events = DB::table('nst_hr_attendance_events')
            ->where('employee_id', $employeeId)
            ->whereDate('event_time', $date)
            ->where('processing_status', 'accepted')
            ->orderBy('event_time')
            ->orderBy('id')
            ->get();

        /*
         * SenseFace T1 sends Face and Fingerprint as separate ATTLOG events.
         * Require both factors within this window to create ONE verified action.
         * RFID/Card is optional.
         */
        $pairWindowSeconds = 30;
        $pendingFace = null;
        $pendingFinger = null;
        $actions = collect();

        foreach ($events as $event) {
            $isFace = (bool) $event->face_verified;
            $isFinger = (bool) $event->fingerprint_verified;

            if (!$isFace && !$isFinger) {
                continue;
            }

            if ($isFace) {
                $pendingFace = $event;
            }

            if ($isFinger) {
                $pendingFinger = $event;
            }

            if (!$pendingFace || !$pendingFinger) {
                continue;
            }

            $faceTime = Carbon::parse($pendingFace->event_time);
            $fingerTime = Carbon::parse($pendingFinger->event_time);
            $difference = abs($faceTime->timestamp - $fingerTime->timestamp);

            if ($difference > $pairWindowSeconds) {
                // Keep only the newer unmatched factor.
                if ($faceTime->gt($fingerTime)) {
                    $pendingFinger = null;
                } else {
                    $pendingFace = null;
                }
                continue;
            }

            $latestEvent = $faceTime->gte($fingerTime)
                ? $pendingFace
                : $pendingFinger;

            $otherEvent = $faceTime->gte($fingerTime)
                ? $pendingFinger
                : $pendingFace;

            $direction = in_array($latestEvent->direction, ['in', 'out'], true)
                ? $latestEvent->direction
                : (in_array($otherEvent->direction, ['in', 'out'], true)
                    ? $otherEvent->direction
                    : null);

            $actions->push((object) [
                'event_time' => max($faceTime->timestamp, $fingerTime->timestamp),
                'event_id' => $latestEvent->id,
                'direction' => $direction,
                'verification_mode' => 'face+fingerprint',
            ]);

            // Pair consumed. Duplicate Face/FP after this must wait for a new opposite factor.
            $pendingFace = null;
            $pendingFinger = null;
        }

        if ($actions->isEmpty()) {
            $existing = DB::table('nst_hr_attendance')
                ->where('employee_id', $employeeId)
                ->where('attendance_date', $date)
                ->first();

            if ($existing && str_starts_with((string) $existing->source, 'zkteco')) {
                DB::table('nst_hr_movement_logs')
                    ->where('employee_id', $employeeId)
                    ->where('movement_date', $date)
                    ->delete();

                DB::table('nst_hr_attendance')
                    ->where('id', $existing->id)
                    ->delete();
            }

            return [
                'status' => 'not_present',
                'reason' => 'No proven Face + Fingerprint pair exists for this date.',
            ];
        }

        /*
         * If the terminal supplies IN/OUT, preserve it.
         * SenseFace currently sends punch_state 255 with no direction,
         * so unmatched direction falls back to alternating IN / OUT.
         */
        $movementState = 'outside';

        foreach ($actions as $action) {
            if (!in_array($action->direction, ['in', 'out'], true)) {
                $action->direction = $movementState === 'outside' ? 'in' : 'out';
            }

            $movementState = $action->direction === 'in' ? 'inside' : 'outside';
        }

        $first = $actions->first(fn ($action) => $action->direction === 'in');

        if (!$first) {
            return [
                'status' => 'not_present',
                'reason' => 'No verified Face + Fingerprint IN action exists for this date.',
            ];
        }

        $employee = DB::table('nst_hr_employees')->where('id', $employeeId)->first();

        if (!$employee) {
            return ['status' => 'error', 'reason' => 'Employee not found.'];
        }

        $shift = $employee->shift_id
            ? DB::table('nst_hr_shifts')->where('id', $employee->shift_id)->first()
            : null;

        $firstTime = Carbon::createFromTimestamp($first->event_time);

        $lateMinutes = 0;
        if ($shift && $shift->starts_at) {
            $shiftStart = Carbon::parse($date . ' ' . $shift->starts_at);
            $graceEnd = $shiftStart->copy()->addMinutes((int) ($shift->grace_minutes ?? 0));

            if ($firstTime->greaterThan($graceEnd)) {
                $lateMinutes = max(
                    0,
                    (int) floor(($firstTime->timestamp - $shiftStart->timestamp) / 60)
                );
            }
        }

        DB::table('nst_hr_movement_logs')
            ->where('employee_id', $employeeId)
            ->where('movement_date', $date)
            ->delete();

        $state = 'inside';
        $insideStartedAt = $firstTime->copy();
        $openOut = null;
        $insideMinutes = 0;
        $outsideMinutes = 0;
        $exitCount = 0;
        $lastOut = null;
        $lastProcessedEventId = $first->event_id;

        $firstFound = false;

        foreach ($actions as $action) {
            $eventTime = Carbon::createFromTimestamp($action->event_time);

            if (!$firstFound) {
                if ($action === $first) {
                    $firstFound = true;
                }
                continue;
            }

            $lastProcessedEventId = $action->event_id;

            if ($action->direction === 'out') {
                if ($state === 'outside') {
                    continue;
                }

                $insideMinutes += max(
                    0,
                    (int) floor(($eventTime->timestamp - $insideStartedAt->timestamp) / 60)
                );

                $state = 'outside';
                $openOut = [
                    'time' => $eventTime->copy(),
                    'event_id' => $action->event_id,
                ];
                $lastOut = $eventTime->copy();

                continue;
            }

            if ($state === 'inside' || !$openOut) {
                continue;
            }

            $duration = max(
                0,
                (int) floor(($eventTime->timestamp - $openOut['time']->timestamp) / 60)
            );

            $outsideMinutes += $duration;
            $exitCount++;

            DB::table('nst_hr_movement_logs')->insert([
                'employee_id' => $employeeId,
                'movement_date' => $date,
                'out_time' => $openOut['time']->format('Y-m-d H:i:s'),
                'in_time' => $eventTime->format('Y-m-d H:i:s'),
                'outside_duration_minutes' => $duration,
                'out_event_id' => $openOut['event_id'],
                'in_event_id' => $action->event_id,
                'status' => 'closed',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $state = 'inside';
            $insideStartedAt = $eventTime->copy();
            $openOut = null;
        }

        $today = now()->toDateString();
        $dayIsPast = $date < $today;
        $shiftEnd = null;

        if ($shift && $shift->ends_at) {
            $shiftEnd = Carbon::parse($date . ' ' . $shift->ends_at);

            if (
                (bool) ($shift->is_night_shift ?? false)
                || ($shift->starts_at && $shift->ends_at <= $shift->starts_at)
            ) {
                $shiftEnd->addDay();
            }
        }

        $dayFinalizable = $dayIsPast
            || ($date === $today && $shiftEnd && now()->greaterThan($shiftEnd));

        if ($state === 'outside' && $openOut) {
            DB::table('nst_hr_movement_logs')->insert([
                'employee_id' => $employeeId,
                'movement_date' => $date,
                'out_time' => $openOut['time']->format('Y-m-d H:i:s'),
                'in_time' => null,
                'outside_duration_minutes' => null,
                'out_event_id' => $openOut['event_id'],
                'in_event_id' => null,
                'status' => $dayFinalizable ? 'final_exit' : 'open',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } elseif ($state === 'inside' && $date === $today) {
            $insideMinutes += max(
                0,
                (int) floor((now()->timestamp - $insideStartedAt->timestamp) / 60)
            );
        }

        $earlyLeave = 0;
        $overtime = 0;

        if ($dayFinalizable && $state === 'outside' && $lastOut && $shiftEnd) {
            if ($lastOut->lt($shiftEnd)) {
                $earlyLeave = max(
                    0,
                    (int) floor(($shiftEnd->timestamp - $lastOut->timestamp) / 60)
                );
            } elseif ($lastOut->gt($shiftEnd)) {
                $overtime = max(
                    0,
                    (int) floor(($lastOut->timestamp - $shiftEnd->timestamp) / 60)
                );
            }
        }

        $existing = DB::table('nst_hr_attendance')
            ->where('employee_id', $employeeId)
            ->where('attendance_date', $date)
            ->first();

        if (
            $existing
            && !str_starts_with((string) $existing->source, 'zkteco')
            && $existing->corrected_by
        ) {
            return [
                'status' => 'manual_override',
                'attendance_id' => $existing->id,
                'reason' => 'Manual corrected attendance has priority over automatic rebuild.',
            ];
        }

        $payload = [
            'check_in' => $firstTime->format('H:i:s'),
            'check_out' => ($state === 'outside' && $lastOut)
                ? $lastOut->format('H:i:s')
                : null,
            'late_minutes' => $lateMinutes,
            'overtime_minutes' => $overtime,
            'total_inside_minutes' => $insideMinutes,
            'total_outside_minutes' => $outsideMinutes,
            'exit_count' => $exitCount,
            'early_leave_minutes' => $earlyLeave,
            'status' => $lateMinutes > 0 ? 'late' : 'present',
            'source' => 'zkteco',
            'note' => 'Automatic attendance from Face + Fingerprint verified ZKTeco actions. Card is optional.',
            'corrected_by' => null,
            'approved_at' => now(),
            'approved_by' => null,
            'first_attendance_verified_at' => $firstTime->format('Y-m-d H:i:s'),
            'first_verification_mode' => 'face+fingerprint',
            'first_device_event_id' => $first->event_id,
            'last_device_event_id' => $lastProcessedEventId,
            'movement_state' => $state,
            'attendance_open' => $state === 'inside' || !$dayFinalizable,
            'updated_at' => now(),
        ];

        $keys = [
            'employee_id' => $employeeId,
            'attendance_date' => $date,
        ];

        if (!$existing) {
            $payload['created_at'] = now();
        }

        DB::table('nst_hr_attendance')->updateOrInsert($keys, $payload);

        $attendance = DB::table('nst_hr_attendance')->where($keys)->first();

        return [
            'status' => 'present',
            'attendance_id' => $attendance->id ?? null,
            'movement_state' => $state,
            'verified_actions' => $actions->count(),
        ];
    }

    private function normalizePacket(object $device, string $raw, array $query, string $endpoint): array
    {
        $events = [];
        $trimmed = trim($raw);
        if ($trimmed !== '') {
            $decoded = json_decode($trimmed, true);
            if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
                $rows = array_is_list($decoded) ? $decoded : ($decoded['events'] ?? [$decoded]);
                foreach ($rows as $row) {
                    if (is_array($row) && ($normalized = $this->normalizeArrayEvent($row, json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)))) {
                        $events[] = $normalized;
                    }
                }
                return $events;
            }
        }

        $table = strtoupper((string) ($query['table'] ?? $query['Table'] ?? ''));
        foreach (preg_split('/\r\n|\r|\n/', $raw) ?: [] as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $kv = $this->parseKeyValueLine($line);
            if ($kv && ($normalized = $this->normalizeArrayEvent($kv, $line))) {
                $events[] = $normalized;
                continue;
            }

            if ($table && !str_contains($table, 'ATT') && !str_contains($table, 'TRAN')) {
                continue;
            }

            $parts = str_contains($line, "\t") ? explode("\t", $line) : str_getcsv($line);
            if (isset($parts[0]) && strtoupper(trim((string) $parts[0])) === 'ATTLOG') {
                array_shift($parts);
            }
            if (count($parts) < 2) {
                continue;
            }

            $candidate = [
                'device_user_id' => trim((string) ($parts[0] ?? '')),
                'event_time' => trim((string) ($parts[1] ?? '')),
                'punch_state' => isset($parts[2]) ? trim((string) $parts[2]) : null,
                'verification_code' => isset($parts[3]) ? trim((string) $parts[3]) : null,
                'work_code' => isset($parts[4]) ? trim((string) $parts[4]) : null,
            ];
            if ($normalized = $this->normalizeArrayEvent($candidate, $line)) {
                $events[] = $normalized;
            }
        }

        return $events;
    }

    private function normalizeArrayEvent(array $row, string $raw): ?array
    {
        $flat = [];
        array_walk_recursive($row, function ($value, $key) use (&$flat) {
            $flat[strtolower((string) $key)] = $value;
        });

        $user = $this->firstValue($flat, ['device_user_id', 'pin', 'userid', 'user_id', 'uid', 'enrollid', 'enroll_id', 'person_id', 'employee_id']);
        $time = $this->firstValue($flat, ['event_time', 'timestamp', 'datetime', 'punch_time', 'check_time', 'att_time', 'time']);
        if (!$time) {
            return null;
        }
        try {
            $eventTime = Carbon::parse((string) $time);
        } catch (Throwable) {
            return null;
        }

        $factors = $this->firstValue($flat, ['factors', 'verified_factors', 'auth_factors']);
        if (is_string($factors)) {
            $factors = preg_split('/[,+|;]/', $factors) ?: [];
        }

        return [
            'device_user_id' => $user !== null ? trim((string) $user) : null,
            'card_number' => $this->nullableString($this->firstValue($flat, ['card_number', 'cardno', 'card_no', 'card', 'rfid', 'rfid_card'])),
            'event_time' => $eventTime->format('Y-m-d H:i:s'),
            'event_type' => $this->nullableString($this->firstValue($flat, ['event_type', 'type'])) ?: 'verification',
            'verification_mode' => $this->nullableString($this->firstValue($flat, ['verification_mode', 'verify_mode', 'auth_mode', 'verification'])),
            'verification_code' => $this->nullableString($this->firstValue($flat, ['verification_code', 'verify_code', 'verifytype', 'verify_type', 'verify'])),
            'face_verified' => $this->nullableBool($this->firstValue($flat, ['face_verified', 'face_ok', 'face_success'])),
            'fingerprint_verified' => $this->nullableBool($this->firstValue($flat, ['fingerprint_verified', 'fp_verified', 'finger_verified', 'fingerprint_ok'])),
            'card_verified' => $this->nullableBool($this->firstValue($flat, ['card_verified', 'rfid_verified', 'card_ok'])),
            'factors' => is_array($factors) ? $factors : [],
            'direction' => $this->normalizeDirection($this->firstValue($flat, ['direction', 'in_out', 'inout', 'entry_exit'])),
            'punch_state' => $this->nullableString($this->firstValue($flat, ['punch_state', 'status', 'att_state', 'state'])),
            'event_unique_id' => $this->nullableString($this->firstValue($flat, ['event_unique_id', 'transaction_id', 'transactionid', 'event_id', 'log_id', 'record_id', 'recordid'])),
            'raw' => $raw,
        ];
    }

    private function ingestEvent(object $device, ?int $packetId, array $event, string $endpoint): int|false
    {
        $verificationMap = $this->decodeJson($device->verification_code_map ?? null, []);
        $punchMap = $this->decodeJson($device->punch_state_map ?? null, []);

        $factors = array_values(array_unique(array_filter(array_map(fn ($factor) => $this->normalizeFactor($factor), $event['factors'] ?? []))));
        $code = $event['verification_code'] ?? null;
        if ($code !== null && isset($verificationMap[(string) $code])) {
            $mapped = $verificationMap[(string) $code];
            if (is_string($mapped)) {
                $mapped = preg_split('/[,+|;]/', $mapped) ?: [];
            }
            if (is_array($mapped)) {
                foreach ($mapped as $factor) {
                    if ($normalized = $this->normalizeFactor($factor)) {
                        $factors[] = $normalized;
                    }
                }
            }
        }

        $mode = strtolower((string) ($event['verification_mode'] ?? ''));
        if ($mode !== '' && (str_contains($mode, '+') || preg_match('/\band\b/i', $mode))) {
            foreach (['card' => ['card', 'rfid'], 'fingerprint' => ['fingerprint', 'finger', 'fp'], 'face' => ['face', 'facial']] as $factor => $needles) {
                foreach ($needles as $needle) {
                    if (str_contains($mode, $needle)) {
                        $factors[] = $factor;
                        break;
                    }
                }
            }
        }
        $factors = array_values(array_unique($factors));

        $face = $event['face_verified'] ?? null;
        $finger = $event['fingerprint_verified'] ?? null;
        $card = $event['card_verified'] ?? null;
        if (in_array('face', $factors, true)) $face = true;
        if (in_array('fingerprint', $factors, true)) $finger = true;
        if (in_array('card', $factors, true)) $card = true;
        $threeFactor = $face === true && $finger === true && $card === true;

        $direction = null;
        $directionSource = null;
        if (($device->direction_role ?? null) === 'entry') {
            $direction = 'in'; $directionSource = 'device_role';
        } elseif (($device->direction_role ?? null) === 'exit') {
            $direction = 'out'; $directionSource = 'device_role';
        } elseif (in_array($event['direction'] ?? null, ['in', 'out'], true)) {
            $direction = $event['direction']; $directionSource = 'payload';
        } elseif (($event['punch_state'] ?? null) !== null && isset($punchMap[(string) $event['punch_state']])) {
            $mappedDirection = $this->normalizeDirection($punchMap[(string) $event['punch_state']]);
            if ($mappedDirection) {
                $direction = $mappedDirection; $directionSource = 'configured_punch_map';
            }
        }

        $mapping = null;
        if (!empty($event['device_user_id'])) {
            $mapping = DB::table('nst_zk_employee_mappings')
                ->where('device_id', $device->id)->where('device_user_id', $event['device_user_id'])->where('is_active', true)->first();
        }
        if (!$mapping && !empty($event['card_number'])) {
            $mapping = DB::table('nst_zk_employee_mappings')
                ->where('device_id', $device->id)->where('card_number', $event['card_number'])->where('is_active', true)->first();
        }

        $canonical = [
            'device_id' => (int) $device->id,
            'event_unique_id' => $event['event_unique_id'] ?? null,
            'device_user_id' => $event['device_user_id'] ?? null,
            'event_time' => $event['event_time'],
            'verification_code' => $code,
            'punch_state' => $event['punch_state'] ?? null,
            'direction' => $direction,
            'raw_hash' => hash('sha256', (string) ($event['raw'] ?? '')),
        ];
        $fingerprint = hash('sha256', json_encode($canonical, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        $existing = DB::table('nst_hr_attendance_events')->where('event_fingerprint', $fingerprint)->first();
        if ($existing) {
            return false;
        }

        $processingStatus = $mapping ? 'accepted' : 'unmapped_employee';
        $processingNote = $mapping ? null : 'Device event stored but no active employee mapping matched its Device User ID/Card.';
        $id = DB::table('nst_hr_attendance_events')->insertGetId([
            'device_id' => $device->id,
            'packet_id' => $packetId,
            'employee_id' => $mapping->employee_id ?? null,
            'device_user_id' => $event['device_user_id'] ?? null,
            'card_number' => $event['card_number'] ?? null,
            'event_time' => $event['event_time'],
            'event_type' => $event['event_type'] ?? 'verification',
            'verification_mode' => $event['verification_mode'] ?? null,
            'verification_code' => $code,
            'face_verified' => $face,
            'fingerprint_verified' => $finger,
            'card_verified' => $card,
            'three_factor_verified' => $threeFactor,
            'direction' => $direction,
            'direction_source' => $directionSource,
            'punch_state' => $event['punch_state'] ?? null,
            'event_unique_id' => $event['event_unique_id'] ?? null,
            'event_fingerprint' => $fingerprint,
            'source_protocol' => $device->protocol ?? 'push',
            'source_endpoint' => $endpoint,
            'processing_status' => $processingStatus,
            'processing_note' => $processingNote,
            'raw_payload' => $event['raw'] ?? null,
            'received_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        if ($mapping) {
            $this->rebuildDaily((int) $mapping->employee_id, Carbon::parse($event['event_time'])->toDateString());
        }
        return $id;
    }

    private function parseKeyValueLine(string $line): array
    {
        $pairs = [];
        foreach (preg_split('/[\t;]/', $line) ?: [] as $part) {
            if (!str_contains($part, '=')) continue;
            [$key, $value] = array_map('trim', explode('=', $part, 2));
            if ($key !== '') $pairs[$key] = $value;
        }
        return count($pairs) >= 2 ? $pairs : [];
    }

    private function firstValue(array $flat, array $keys): mixed
    {
        foreach ($keys as $key) {
            if (array_key_exists($key, $flat) && $flat[$key] !== '' && $flat[$key] !== null) {
                return $flat[$key];
            }
        }
        return null;
    }

    private function nullableString(mixed $value): ?string
    {
        if ($value === null || $value === '') return null;
        return trim((string) $value);
    }

    private function nullableBool(mixed $value): ?bool
    {
        if ($value === null || $value === '') return null;
        if (is_bool($value)) return $value;
        $value = strtolower(trim((string) $value));
        if (in_array($value, ['1', 'true', 'yes', 'y', 'ok', 'success', 'verified'], true)) return true;
        if (in_array($value, ['0', 'false', 'no', 'n', 'fail', 'failed', 'unverified'], true)) return false;
        return null;
    }

    private function normalizeDirection(mixed $value): ?string
    {
        if ($value === null || $value === '') return null;
        $value = strtolower(trim((string) $value));
        if (in_array($value, ['in', 'entry', 'checkin', 'check-in', 'enter'], true)) return 'in';
        if (in_array($value, ['out', 'exit', 'checkout', 'check-out', 'leave'], true)) return 'out';
        return null;
    }

    private function normalizeFactor(mixed $factor): ?string
    {
        $factor = strtolower(trim((string) $factor));
        if (in_array($factor, ['card', 'rfid', 'id_card', 'ic_card'], true)) return 'card';
        if (in_array($factor, ['fingerprint', 'finger', 'fp'], true)) return 'fingerprint';
        if (in_array($factor, ['face', 'facial', 'face_recognition'], true)) return 'face';
        return null;
    }

    private function decodeJson(mixed $value, array $fallback): array
    {
        if (is_array($value)) return $value;
        if (!$value) return $fallback;
        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? $decoded : $fallback;
    }
}
