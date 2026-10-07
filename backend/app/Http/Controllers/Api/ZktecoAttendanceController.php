<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ZktecoAttendanceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ZktecoAttendanceController extends Controller
{
    public function __construct(private readonly ZktecoAttendanceService $service)
    {
    }

    public function cdata(Request $request)
    {
        $serial = $this->serialFromRequest($request);
        $device = $this->findActiveDevice($serial);
        $this->service->recordPacket($device, $serial, '/iclock/cdata', $request->method(), $request->query(), $request->getContent(), $request->ip());
        return response('OK', 200)->header('Content-Type', 'text/plain; charset=UTF-8');
    }

    public function getRequest(Request $request)
    {
        $serial = $this->serialFromRequest($request);
        $device = $this->findActiveDevice($serial);
        $this->service->recordPacket($device, $serial, '/iclock/getrequest', $request->method(), $request->query(), $request->getContent(), $request->ip());
        return response('OK', 200)->header('Content-Type', 'text/plain; charset=UTF-8');
    }

    public function deviceCommand(Request $request)
    {
        $serial = $this->serialFromRequest($request);
        $device = $this->findActiveDevice($serial);
        $this->service->recordPacket($device, $serial, '/iclock/devicecmd', $request->method(), $request->query(), $request->getContent(), $request->ip());
        return response('OK', 200)->header('Content-Type', 'text/plain; charset=UTF-8');
    }

    public function registry(Request $request)
    {
        $serial = $this->serialFromRequest($request);
        $device = $this->findActiveDevice($serial);
        $this->service->recordPacket($device, $serial, '/iclock/registry', $request->method(), $request->query(), $request->getContent(), $request->ip());
        return response('OK', 200)->header('Content-Type', 'text/plain; charset=UTF-8');
    }

    public function genericPush(Request $request, string $serial): JsonResponse
    {
        $device = $this->findActiveDevice($serial);
        if (!$device) {
            return response()->json(['status' => false, 'message' => 'Unknown or inactive device.'], 404);
        }
        if ($device->token_hash) {
            $token = (string) ($request->header('X-NST-Device-Token') ?: $request->query('token', ''));
            if (!$token || !hash_equals((string) $device->token_hash, hash('sha256', $token))) {
                return response()->json(['status' => false, 'message' => 'Invalid device token.'], 401);
            }
        }

        $payload = $request->json()->all();
        if (!$payload) {
            return response()->json(['status' => false, 'message' => 'JSON event payload is required.'], 422);
        }
        $event = $this->service->ingestGenericEvent($device, $payload, '/zkteco/push/' . $serial);
        if (!$event) {
            return response()->json(['status' => false, 'message' => 'Payload stored no provable event time.'], 422);
        }
        return response()->json(['status' => true, 'data' => $event]);
    }

    public function status(Request $request): JsonResponse
    {
        $onlineCutoff = now()->subMinutes(10);
        return $this->ok([
            'devices_total' => DB::table('nst_zk_devices')->count(),
            'devices_active' => DB::table('nst_zk_devices')->where('is_active', true)->count(),
            'devices_online' => DB::table('nst_zk_devices')->where('is_active', true)->where('last_seen_at', '>=', $onlineCutoff)->count(),
            'employee_mappings' => DB::table('nst_zk_employee_mappings')->where('is_active', true)->count(),
            'events_today' => DB::table('nst_hr_attendance_events')->whereDate('event_time', now()->toDateString())->count(),
            'three_factor_today' => DB::table('nst_hr_attendance_events')->whereDate('event_time', now()->toDateString())->where('three_factor_verified', true)->count(),
            'unmapped_events' => DB::table('nst_hr_attendance_events')->whereNull('employee_id')->count(),
            'unparsed_packets' => DB::table('nst_zk_ingest_packets')->whereIn('parse_status', ['stored_unparsed', 'parse_error', 'unregistered_device'])->count(),
            'present_today' => DB::table('nst_hr_attendance')->where('attendance_date', now()->toDateString())->whereIn('status', ['present', 'late', 'half_day'])->where('source', 'zkteco')->count(),
            'receiver_paths' => [
                'adms_root' => url('/iclock/cdata'),
                'api_push' => url('/api/zkteco/push/{SERIAL_NUMBER}'),
            ],
            'rules' => [
                'first_attendance' => 'Face + Fingerprint are primary. RFID/Card is optional and may be assigned later.',
                'movement' => 'Subsequent movement requires a proven Card event plus explicit direction from device role/payload/configured punch-state map.',
                'blind_alternation' => false,
                'biometric_templates_stored' => false,
            ],
        ]);
    }

    public function devices(): JsonResponse
    {
        $rows = DB::table('nst_zk_devices')->orderByDesc('is_active')->orderBy('name')->get()->map(function ($row) {
            $row->verification_code_map = $this->decodeJson($row->verification_code_map, []);
            $row->punch_state_map = $this->decodeJson($row->punch_state_map, []);
            $row->capabilities = $this->decodeJson($row->capabilities, []);
            return $row;
        });
        return $this->ok($rows);
    }

    public function storeDevice(Request $request): JsonResponse
    {
        $data = $this->validateDevice($request);
        [$verificationMap, $punchMap] = $this->buildMaps($data);
        $plainToken = Str::random(48);
        $id = DB::table('nst_zk_devices')->insertGetId([
            'name' => $data['name'],
            'model' => $data['model'] ?? null,
            'serial_number' => trim($data['serial_number']),
            'device_code' => $data['device_code'] ?? null,
            'protocol' => $data['protocol'] ?? 'ta_push',
            'terminal_mode' => $data['terminal_mode'] ?? 'attendance',
            'direction_role' => $data['direction_role'] ?? 'bidirectional',
            'timezone' => $data['timezone'] ?? config('app.timezone', 'Asia/Dhaka'),
            'ip_address' => $data['ip_address'] ?? null,
            'port' => $data['port'] ?? null,
            'verification_code_map' => json_encode($verificationMap),
            'punch_state_map' => json_encode($punchMap),
            'capabilities' => json_encode($data['capabilities'] ?? []),
            'token_hash' => hash('sha256', $plainToken),
            'is_active' => $data['is_active'] ?? true,
            'notes' => $data['notes'] ?? null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $device = DB::table('nst_zk_devices')->find($id);
        return $this->ok(['device' => $device, 'device_token' => $plainToken], 'ZKTeco device registered. Save the token only if you will use the generic JSON receiver.', 201);
    }

    public function updateDevice(Request $request, int $deviceId): JsonResponse
    {
        $before = DB::table('nst_zk_devices')->where('id', $deviceId)->first();
        abort_unless($before, 404, 'ZKTeco device not found.');
        $data = $this->validateDevice($request, $deviceId);
        [$verificationMap, $punchMap] = $this->buildMaps($data, $before);
        $payload = [
            'name' => $data['name'],
            'model' => $data['model'] ?? null,
            'serial_number' => trim($data['serial_number']),
            'device_code' => $data['device_code'] ?? null,
            'protocol' => $data['protocol'] ?? $before->protocol,
            'terminal_mode' => $data['terminal_mode'] ?? $before->terminal_mode,
            'direction_role' => $data['direction_role'] ?? $before->direction_role,
            'timezone' => $data['timezone'] ?? $before->timezone,
            'ip_address' => $data['ip_address'] ?? null,
            'port' => $data['port'] ?? null,
            'verification_code_map' => json_encode($verificationMap),
            'punch_state_map' => json_encode($punchMap),
            'capabilities' => json_encode($data['capabilities'] ?? $this->decodeJson($before->capabilities, [])),
            'is_active' => $data['is_active'] ?? (bool) $before->is_active,
            'notes' => $data['notes'] ?? null,
            'updated_at' => now(),
        ];
        $plainToken = null;
        if ($request->boolean('rotate_token')) {
            $plainToken = Str::random(48);
            $payload['token_hash'] = hash('sha256', $plainToken);
        }
        DB::table('nst_zk_devices')->where('id', $deviceId)->update($payload);
        $device = DB::table('nst_zk_devices')->find($deviceId);

        $mappedEmployeeIds = DB::table('nst_zk_employee_mappings')->where('device_id', $deviceId)->where('is_active', true)->pluck('employee_id')->unique();
        foreach ($mappedEmployeeIds as $employeeId) {
            $dates = DB::table('nst_hr_attendance_events')->where('employee_id', $employeeId)->selectRaw('DATE(event_time) as event_date')->distinct()->pluck('event_date');
            foreach ($dates as $date) $this->service->rebuildDaily((int) $employeeId, (string) $date);
        }

        return $this->ok(['device' => $device, 'device_token' => $plainToken], 'ZKTeco device updated.');
    }

    public function mappings(Request $request): JsonResponse
    {
        $rows = DB::table('nst_zk_employee_mappings')
            ->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_zk_employee_mappings.employee_id')
            ->join('nst_zk_devices', 'nst_zk_devices.id', '=', 'nst_zk_employee_mappings.device_id')
            ->when($request->filled('device_id'), fn ($q) => $q->where('nst_zk_employee_mappings.device_id', $request->integer('device_id')))
            ->select('nst_zk_employee_mappings.*', 'nst_hr_employees.employee_no', 'nst_hr_employees.name as employee_name', 'nst_zk_devices.name as device_name', 'nst_zk_devices.serial_number')
            ->orderBy('nst_zk_devices.name')->orderBy('nst_hr_employees.name')->get();
        return $this->ok($rows);
    }

    public function storeMapping(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:nst_hr_employees,id'],
            'device_id' => ['required', 'integer', 'exists:nst_zk_devices,id'],
            'device_user_id' => ['required', 'string', 'max:190'],
            'card_number' => ['nullable', 'string', 'max:190'],
            'is_active' => ['nullable', 'boolean'],
        ]);
        $existing = DB::table('nst_zk_employee_mappings')->where('device_id', $data['device_id'])->where('device_user_id', trim($data['device_user_id']))->first();
        $payload = [
            'employee_id' => $data['employee_id'],
            'device_id' => $data['device_id'],
            'device_user_id' => trim($data['device_user_id']),
            'card_number' => isset($data['card_number']) ? trim((string) $data['card_number']) ?: null : null,
            'is_active' => $data['is_active'] ?? true,
            'updated_at' => now(),
        ];
        if ($existing) {
            DB::table('nst_zk_employee_mappings')->where('id', $existing->id)->update($payload);
            $id = $existing->id;
        } else {
            $payload['created_at'] = now();
            $id = DB::table('nst_zk_employee_mappings')->insertGetId($payload);
        }
        $reprocessed = $this->service->reprocessMapping((int) $id);
        return $this->ok(['mapping' => DB::table('nst_zk_employee_mappings')->find($id), 'reprocessed_events' => $reprocessed], 'Employee-device mapping saved.');
    }

    public function deleteMapping(int $mappingId): JsonResponse
    {
        $mapping = DB::table('nst_zk_employee_mappings')->where('id', $mappingId)->first();
        abort_unless($mapping, 404, 'Mapping not found.');
        DB::table('nst_zk_employee_mappings')->where('id', $mappingId)->update(['is_active' => false, 'updated_at' => now()]);
        return $this->ok(['id' => $mappingId], 'Mapping deactivated.');
    }

    public function events(Request $request): JsonResponse
    {
        $rows = DB::table('nst_hr_attendance_events')
            ->leftJoin('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_attendance_events.employee_id')
            ->leftJoin('nst_zk_devices', 'nst_zk_devices.id', '=', 'nst_hr_attendance_events.device_id')
            ->when($request->filled('employee_id'), fn ($q) => $q->where('nst_hr_attendance_events.employee_id', $request->integer('employee_id')))
            ->when($request->filled('device_id'), fn ($q) => $q->where('nst_hr_attendance_events.device_id', $request->integer('device_id')))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('nst_hr_attendance_events.event_time', '>=', $request->input('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('nst_hr_attendance_events.event_time', '<=', $request->input('date_to')))
            ->select('nst_hr_attendance_events.*', 'nst_hr_employees.employee_no', 'nst_hr_employees.name as employee_name', 'nst_zk_devices.name as device_name', 'nst_zk_devices.serial_number')
            ->orderByDesc('nst_hr_attendance_events.event_time')->limit(min(2000, max(10, $request->integer('limit', 300))))->get();
        return $this->ok($rows);
    }

    public function packets(Request $request): JsonResponse
    {
        $rows = DB::table('nst_zk_ingest_packets')
            ->leftJoin('nst_zk_devices', 'nst_zk_devices.id', '=', 'nst_zk_ingest_packets.device_id')
            ->select('nst_zk_ingest_packets.*', 'nst_zk_devices.name as device_name')
            ->orderByDesc('nst_zk_ingest_packets.received_at')->limit(min(500, max(10, $request->integer('limit', 100))))->get();
        return $this->ok($rows);
    }

    public function movements(Request $request): JsonResponse
    {
        $dateFrom = $request->input('date_from', now()->startOfMonth()->toDateString());
        $dateTo = $request->input('date_to', now()->toDateString());
        $rows = DB::table('nst_hr_movement_logs')
            ->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_movement_logs.employee_id')
            ->when($request->filled('employee_id'), fn ($q) => $q->where('nst_hr_movement_logs.employee_id', $request->integer('employee_id')))
            ->whereBetween('movement_date', [$dateFrom, $dateTo])
            ->select('nst_hr_movement_logs.*', 'nst_hr_employees.employee_no', 'nst_hr_employees.name as employee_name')
            ->orderByDesc('movement_date')->orderBy('out_time')->limit(3000)->get();
        return $this->ok($rows);
    }

    public function report(Request $request): JsonResponse
    {
        $dateFrom = $request->input('date_from', now()->startOfMonth()->toDateString());
        $dateTo = $request->input('date_to', now()->toDateString());
        $attendance = DB::table('nst_hr_attendance')
            ->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_attendance.employee_id')
            ->leftJoin('branches', 'branches.id', '=', 'nst_hr_employees.branch_id')
            ->whereBetween('attendance_date', [$dateFrom, $dateTo])
            ->when($request->filled('employee_id'), fn ($q) => $q->where('nst_hr_attendance.employee_id', $request->integer('employee_id')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_hr_employees.branch_id', $request->integer('branch_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('nst_hr_attendance.status', $request->input('status')))
            ->when($request->filled('movement_state'), fn ($q) => $q->where('nst_hr_attendance.movement_state', $request->input('movement_state')))
            ->select('nst_hr_attendance.*', 'nst_hr_employees.employee_no', 'nst_hr_employees.name as employee_name', 'branches.name as branch_name')
            ->orderByDesc('attendance_date')->orderBy('nst_hr_employees.name')->get();
        $movements = DB::table('nst_hr_movement_logs')
            ->whereBetween('movement_date', [$dateFrom, $dateTo])
            ->when($request->filled('employee_id'), fn ($q) => $q->where('employee_id', $request->integer('employee_id')))
            ->orderBy('movement_date')->orderBy('out_time')->get()->groupBy(fn ($row) => $row->employee_id . ':' . $row->movement_date);

        return $this->ok([
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'attendance' => $attendance->map(function ($row) use ($movements) {
                $row->movements = $movements->get($row->employee_id . ':' . $row->attendance_date, collect())->values();

                $fmt = function ($value) {
                    if (!$value) return null;
                    try {
                        return \Carbon\Carbon::parse($value)->format('h:i A');
                    } catch (\Throwable $e) {
                        return $value;
                    }
                };

                $row->check_in_display = $fmt($row->check_in);
                $row->check_out_display = $fmt($row->check_out);
                $row->final_out_display = $fmt($row->final_out_at ?? null);

                $row->movements = $row->movements->map(function ($movement) use ($fmt) {
                    $movement->out_time_display = $fmt($movement->out_time);
                    $movement->in_time_display = $fmt($movement->in_time);
                    return $movement;
                })->values();

                $row->actions = DB::table('nst_hr_attendance_actions')
                    ->where('employee_id', $row->employee_id)
                    ->where('action_date', $row->attendance_date)
                    ->orderBy('action_time')
                    ->get()
                    ->map(function ($action) use ($fmt) {
                        $action->action_time_display = $fmt($action->action_time);
                        return $action;
                    });
                return $row;
            }),
            'totals' => [
                'records' => $attendance->count(),
                'present' => $attendance->whereIn('status', ['present', 'late', 'half_day'])->count(),
                'late_minutes' => (int) $attendance->sum('late_minutes'),
                'early_leave_minutes' => (int) $attendance->sum('early_leave_minutes'),
                'outside_minutes' => (int) $attendance->sum('total_outside_minutes'),
                'inside_minutes' => (int) $attendance->sum('total_inside_minutes'),
                'temporary_exits' => (int) $attendance->sum('exit_count'),
            ],
        ]);
    }

    public function rebuild(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['nullable', 'integer', 'exists:nst_hr_employees,id'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
        ]);
        $dateFrom = $data['date_from'] ?? now()->startOfMonth()->toDateString();
        $dateTo = $data['date_to'] ?? now()->toDateString();
        $pairs = DB::table('nst_hr_attendance_events')->whereNotNull('employee_id')
            ->whereBetween('event_time', [$dateFrom . ' 00:00:00', $dateTo . ' 23:59:59'])
            ->when(!empty($data['employee_id']), fn ($q) => $q->where('employee_id', $data['employee_id']))
            ->selectRaw('employee_id, DATE(event_time) as event_date')->distinct()->get();
        $results = [];
        foreach ($pairs as $pair) {
            $results[] = $this->service->rebuildDaily((int) $pair->employee_id, (string) $pair->event_date);
        }
        return $this->ok(['days_rebuilt' => count($results), 'results' => $results], 'Attendance rebuilt from immutable device events.');
    }

    private function serialFromRequest(Request $request): string
    {
        return trim((string) ($request->query('SN') ?: $request->query('sn') ?: $request->input('SN') ?: $request->input('serial_number') ?: $request->header('X-Device-Serial', '')));
    }

    private function findActiveDevice(string $serial): ?object
    {
        if ($serial === '') return null;
        return DB::table('nst_zk_devices')->where('is_active', true)->where(function ($q) use ($serial) {
            $q->where('serial_number', $serial)->orWhere('device_code', $serial);
        })->first();
    }

    private function validateDevice(Request $request, ?int $deviceId = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:190'],
            'model' => ['nullable', 'string', 'max:190'],
            'serial_number' => ['required', 'string', 'max:190', Rule::unique('nst_zk_devices', 'serial_number')->ignore($deviceId)],
            'device_code' => ['nullable', 'string', 'max:100'],
            'protocol' => ['nullable', 'in:ta_push,ac_push,push_sdk,generic'],
            'terminal_mode' => ['nullable', 'in:attendance,access_control,hybrid'],
            'direction_role' => ['nullable', 'in:entry,exit,bidirectional'],
            'timezone' => ['nullable', 'timezone'],
            'ip_address' => ['nullable', 'string', 'max:64'],
            'port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'three_factor_codes' => ['nullable'],
            'card_codes' => ['nullable'],
            'fingerprint_codes' => ['nullable'],
            'face_codes' => ['nullable'],
            'punch_in_codes' => ['nullable'],
            'punch_out_codes' => ['nullable'],
            'verification_code_map' => ['nullable', 'array'],
            'punch_state_map' => ['nullable', 'array'],
            'capabilities' => ['nullable', 'array'],
            'is_active' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:3000'],
            'rotate_token' => ['nullable', 'boolean'],
        ]);
    }

    private function buildMaps(array $data, ?object $before = null): array
    {
        $simpleVerificationProvided = array_key_exists('three_factor_codes', $data) || array_key_exists('card_codes', $data) || array_key_exists('fingerprint_codes', $data) || array_key_exists('face_codes', $data);
        $simplePunchProvided = array_key_exists('punch_in_codes', $data) || array_key_exists('punch_out_codes', $data);
        $verification = isset($data['verification_code_map']) ? $data['verification_code_map'] : ($simpleVerificationProvided ? [] : $this->decodeJson($before->verification_code_map ?? null, []));
        $punch = isset($data['punch_state_map']) ? $data['punch_state_map'] : ($simplePunchProvided ? [] : $this->decodeJson($before->punch_state_map ?? null, []));

        foreach ([
            'three_factor_codes' => ['card', 'fingerprint', 'face'],
            'card_codes' => ['card'],
            'fingerprint_codes' => ['fingerprint'],
            'face_codes' => ['face'],
        ] as $field => $factors) {
            if (!array_key_exists($field, $data)) continue;
            foreach ($this->codeList($data[$field]) as $code) {
                $existing = $verification[(string) $code] ?? [];
                if (is_string($existing)) $existing = preg_split('/[,+|;]/', $existing) ?: [];
                $verification[(string) $code] = array_values(array_unique(array_merge((array) $existing, $factors)));
            }
        }
        if (array_key_exists('punch_in_codes', $data)) foreach ($this->codeList($data['punch_in_codes']) as $code) $punch[(string) $code] = 'in';
        if (array_key_exists('punch_out_codes', $data)) foreach ($this->codeList($data['punch_out_codes']) as $code) $punch[(string) $code] = 'out';
        return [$verification, $punch];
    }

    private function codeList(mixed $value): array
    {
        if (is_array($value)) return array_values(array_filter(array_map(fn ($v) => trim((string) $v), $value), fn ($v) => $v !== ''));
        if ($value === null || $value === '') return [];
        return array_values(array_filter(array_map('trim', preg_split('/[,;|\s]+/', (string) $value) ?: []), fn ($v) => $v !== ''));
    }

    private function decodeJson(mixed $value, array $fallback): array
    {
        if (is_array($value)) return $value;
        if (!$value) return $fallback;
        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? $decoded : $fallback;
    }

    private function ok(mixed $data, string $message = 'OK', int $status = 200): JsonResponse
    {
        return response()->json(['status' => true, 'message' => $message, 'data' => $data], $status);
    }
}
