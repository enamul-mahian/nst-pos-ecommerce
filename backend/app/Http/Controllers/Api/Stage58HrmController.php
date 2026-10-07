<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class Stage58HrmController extends Controller
{
    private const SALARY_EXPENSE_ACCOUNT_NAME = 'Salary Expense';

    public function overview(Request $request): JsonResponse
    {
        $branchId = $request->integer('branch_id') ?: null;
        $today = now()->toDateString();
        return $this->ok([
            'summary' => [
                'active_employees' => DB::table('nst_hr_employees')->where('status', 'active')->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->count(),
                'present_today' => DB::table('nst_hr_attendance')->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_attendance.employee_id')->where('attendance_date', $today)->whereIn('nst_hr_attendance.status', ['present', 'late', 'half_day'])->when($branchId, fn ($q) => $q->where('nst_hr_employees.branch_id', $branchId))->count(),
                'pending_leave' => DB::table('nst_hr_leave_requests')->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_leave_requests.employee_id')->where('nst_hr_leave_requests.status', 'pending')->when($branchId, fn ($q) => $q->where('nst_hr_employees.branch_id', $branchId))->count(),
                'open_payroll' => DB::table('nst_hr_payroll_periods')->whereNotIn('status', ['paid', 'reversed'])->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->count(),
                'payroll_due' => round((float) DB::table('nst_hr_payroll_periods')->whereIn('status', ['approved', 'locked'])->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->sum('net_total'), 2),
                'loan_outstanding' => round((float) DB::table('nst_hr_loans')->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_loans.employee_id')->whereIn('nst_hr_loans.status', ['approved', 'active'])->when($branchId, fn ($q) => $q->where('nst_hr_employees.branch_id', $branchId))->sum('outstanding_amount'), 2),
            ],
            'attendance_today' => DB::table('nst_hr_attendance')->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_attendance.employee_id')->where('attendance_date', $today)->when($branchId, fn ($q) => $q->where('nst_hr_employees.branch_id', $branchId))->select('nst_hr_attendance.*', 'nst_hr_employees.name as employee_name', 'nst_hr_employees.employee_no')->orderBy('employee_name')->get(),
            'pending_leave_requests' => $this->leaveQuery($request)->where('nst_hr_leave_requests.status', 'pending')->limit(20)->get(),
            'capabilities' => [
                'employee_lifecycle' => true,
                'branch_and_role_linkage' => true,
                'shift_and_attendance' => true,
                'leave_balance_and_approval' => true,
                'salary_components' => true,
                'payroll_lock_and_reversal' => true,
                'finance_posting' => true,
                'loan_recovery' => true,
                'performance_lifecycle' => true,
                'attendance_summary' => true,
                'leave_balance' => true,
                'payroll_entry_adjustment' => true,
                'payslip_publication' => true,
                'payroll_export' => true,
                'audit_history' => true,
            ],
            'acceptance' => $this->stageSevenAcceptancePayload(),
        ]);
    }

    public function referenceData(Request $request): JsonResponse
    {
        return $this->ok([
            'departments' => DB::table('nst_hr_departments')->leftJoin('branches', 'branches.id', '=', 'nst_hr_departments.branch_id')->select('nst_hr_departments.*', 'branches.name as branch_name')->orderBy('nst_hr_departments.name')->get(),
            'designations' => DB::table('nst_hr_designations')->leftJoin('nst_hr_departments', 'nst_hr_departments.id', '=', 'nst_hr_designations.department_id')->select('nst_hr_designations.*', 'nst_hr_departments.name as department_name')->orderBy('nst_hr_designations.name')->get(),
            'shifts' => DB::table('nst_hr_shifts')->orderBy('name')->get()->map(function ($row) { $row->weekends = $this->decodeJson($row->weekends, []); return $row; }),
            'leave_types' => DB::table('nst_hr_leave_types')->orderBy('name')->get(),
            'branches' => DB::table('branches')->where('status', 'active')->orderBy('name')->get(['id', 'name', 'code']),
            'users' => DB::table('users')->orderBy('name')->get(['id', 'name', 'email']),
            'accounts' => Schema::hasTable('nst_accounts')
                ? DB::table('nst_accounts')->where('is_active', true)->orderBy('code')->get(['id', 'code', 'name', 'is_cash', 'is_bank'])
                : collect(),
            'cash_bank_accounts' => Schema::hasTable('nst_accounts')
                ? DB::table('nst_accounts')->where('is_active', true)->where(function ($query) { $query->where('is_cash', true)->orWhere('is_bank', true); })->orderBy('code')->get(['id', 'code', 'name', 'is_cash', 'is_bank'])
                : collect(),
        ]);
    }

    public function storeReference(Request $request, string $type): JsonResponse
    {
        return match ($type) {
            'department' => $this->storeDepartment($request),
            'designation' => $this->storeDesignation($request),
            'shift' => $this->storeShift($request),
            'leave-type' => $this->storeLeaveType($request),
            default => response()->json(['status' => false, 'message' => 'Unsupported HR reference type.'], 404),
        };
    }

    public function updateReference(Request $request, string $type, int $referenceId): JsonResponse
    {
        $map = [
            'department' => ['table' => 'nst_hr_departments', 'action' => 'department.updated'],
            'designation' => ['table' => 'nst_hr_designations', 'action' => 'designation.updated'],
            'shift' => ['table' => 'nst_hr_shifts', 'action' => 'shift.updated'],
            'leave-type' => ['table' => 'nst_hr_leave_types', 'action' => 'leave_type.updated'],
        ];
        abort_unless(isset($map[$type]), 404, 'Unsupported HR reference type.');
        $table = $map[$type]['table'];
        $before = DB::table($table)->where('id', $referenceId)->first();
        abort_unless($before, 404, 'HR reference not found.');

        $rules = match ($type) {
            'department' => ['name' => ['required', 'string', 'max:160'], 'code' => ['required', 'string', 'max:60', 'unique:nst_hr_departments,code,' . $referenceId], 'branch_id' => ['nullable', 'integer', 'exists:branches,id'], 'is_active' => ['nullable', 'boolean']],
            'designation' => ['department_id' => ['nullable', 'integer', 'exists:nst_hr_departments,id'], 'name' => ['required', 'string', 'max:160'], 'code' => ['required', 'string', 'max:60', 'unique:nst_hr_designations,code,' . $referenceId], 'grade' => ['nullable', 'integer', 'min:1'], 'is_active' => ['nullable', 'boolean']],
            'shift' => ['name' => ['required', 'string', 'max:160'], 'code' => ['required', 'string', 'max:60', 'unique:nst_hr_shifts,code,' . $referenceId], 'starts_at' => ['required', 'date_format:H:i'], 'ends_at' => ['required', 'date_format:H:i'], 'grace_minutes' => ['nullable', 'integer', 'min:0'], 'is_night_shift' => ['nullable', 'boolean'], 'weekends' => ['nullable', 'array'], 'is_active' => ['nullable', 'boolean']],
            'leave-type' => ['name' => ['required', 'string', 'max:160'], 'code' => ['required', 'string', 'max:60', 'unique:nst_hr_leave_types,code,' . $referenceId], 'annual_days' => ['required', 'numeric', 'min:0'], 'is_paid' => ['nullable', 'boolean'], 'requires_attachment' => ['nullable', 'boolean'], 'is_active' => ['nullable', 'boolean']],
        };
        $data = $request->validate($rules);
        if ($type === 'shift' && array_key_exists('weekends', $data)) $data['weekends'] = json_encode($data['weekends'] ?? []);
        DB::table($table)->where('id', $referenceId)->update($data + ['updated_at' => now()]);
        $after = DB::table($table)->find($referenceId);
        $this->hrEvent($request, $map[$type]['action'], $table, $referenceId, $before, $after);
        return $this->ok($after, 'HR reference updated.');
    }

    public function deleteReference(Request $request, string $type, int $referenceId): JsonResponse
    {
        $tables = ['department' => 'nst_hr_departments', 'designation' => 'nst_hr_designations', 'shift' => 'nst_hr_shifts', 'leave-type' => 'nst_hr_leave_types'];
        abort_unless(isset($tables[$type]), 404, 'Unsupported HR reference type.');
        $table = $tables[$type];
        $before = DB::table($table)->where('id', $referenceId)->first();
        abort_unless($before, 404, 'HR reference not found.');
        try {
            DB::table($table)->where('id', $referenceId)->delete();
        } catch (\Throwable $error) {
            throw ValidationException::withMessages(['reference' => 'This record is linked to employee or HR data and cannot be deleted. Mark it inactive instead.']);
        }
        $this->hrEvent($request, str_replace('-', '_', $type) . '.deleted', $table, $referenceId, $before, null);
        return $this->ok(['id' => $referenceId], 'HR reference deleted.');
    }

    private function storeDepartment(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:160'], 'code' => ['required', 'string', 'max:60', 'unique:nst_hr_departments,code'], 'branch_id' => ['nullable', 'integer', 'exists:branches,id'], 'is_active' => ['nullable', 'boolean']]);
        $id = DB::table('nst_hr_departments')->insertGetId($data + ['is_active' => $data['is_active'] ?? true, 'created_by' => optional($request->user())->id, 'created_at' => now(), 'updated_at' => now()]);
        return $this->ok(DB::table('nst_hr_departments')->find($id), 'Department created.', 201);
    }

    private function storeDesignation(Request $request): JsonResponse
    {
        $data = $request->validate(['department_id' => ['nullable', 'integer', 'exists:nst_hr_departments,id'], 'name' => ['required', 'string', 'max:160'], 'code' => ['required', 'string', 'max:60', 'unique:nst_hr_designations,code'], 'grade' => ['nullable', 'integer', 'min:1'], 'is_active' => ['nullable', 'boolean']]);
        $id = DB::table('nst_hr_designations')->insertGetId($data + ['grade' => $data['grade'] ?? 1, 'is_active' => $data['is_active'] ?? true, 'created_at' => now(), 'updated_at' => now()]);
        return $this->ok(DB::table('nst_hr_designations')->find($id), 'Designation created.', 201);
    }

    private function storeShift(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:160'], 'code' => ['required', 'string', 'max:60', 'unique:nst_hr_shifts,code'], 'starts_at' => ['required', 'date_format:H:i'], 'ends_at' => ['required', 'date_format:H:i'], 'grace_minutes' => ['nullable', 'integer', 'min:0'], 'is_night_shift' => ['nullable', 'boolean'], 'weekends' => ['nullable', 'array'], 'is_active' => ['nullable', 'boolean']]);
        $id = DB::table('nst_hr_shifts')->insertGetId([
            ...$data, 'grace_minutes' => $data['grace_minutes'] ?? 0, 'is_night_shift' => $data['is_night_shift'] ?? false,
            'weekends' => json_encode($data['weekends'] ?? []), 'is_active' => $data['is_active'] ?? true, 'created_at' => now(), 'updated_at' => now(),
        ]);
        return $this->ok(DB::table('nst_hr_shifts')->find($id), 'Shift created.', 201);
    }

    private function storeLeaveType(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:160'], 'code' => ['required', 'string', 'max:60', 'unique:nst_hr_leave_types,code'], 'annual_days' => ['required', 'numeric', 'min:0'], 'is_paid' => ['nullable', 'boolean'], 'requires_attachment' => ['nullable', 'boolean'], 'is_active' => ['nullable', 'boolean']]);
        $id = DB::table('nst_hr_leave_types')->insertGetId($data + ['is_paid' => $data['is_paid'] ?? true, 'requires_attachment' => $data['requires_attachment'] ?? false, 'is_active' => $data['is_active'] ?? true, 'created_at' => now(), 'updated_at' => now()]);
        return $this->ok(DB::table('nst_hr_leave_types')->find($id), 'Leave type created.', 201);
    }

    public function employees(Request $request): JsonResponse
    {
        $rows = DB::table('nst_hr_employees')
            ->leftJoin('branches', 'branches.id', '=', 'nst_hr_employees.branch_id')
            ->leftJoin('nst_hr_departments', 'nst_hr_departments.id', '=', 'nst_hr_employees.department_id')
            ->leftJoin('nst_hr_designations', 'nst_hr_designations.id', '=', 'nst_hr_employees.designation_id')
            ->leftJoin('nst_hr_shifts', 'nst_hr_shifts.id', '=', 'nst_hr_employees.shift_id')
            ->leftJoin('users', 'users.id', '=', 'nst_hr_employees.user_id')
            ->select('nst_hr_employees.*', 'branches.name as branch_name', 'nst_hr_departments.name as department_name', 'nst_hr_designations.name as designation_name', 'nst_hr_shifts.name as shift_name', 'users.email as linked_user_email')
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_hr_employees.branch_id', $request->integer('branch_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('nst_hr_employees.status', $request->input('status')))
            ->when($request->filled('department_id'), fn ($q) => $q->where('nst_hr_employees.department_id', $request->integer('department_id')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = trim((string) $request->input('search'));
                $q->where(fn ($inner) => $inner->where('nst_hr_employees.name', 'like', "%{$search}%")->orWhere('nst_hr_employees.employee_no', 'like', "%{$search}%")->orWhere('nst_hr_employees.phone', 'like', "%{$search}%"));
            })->orderBy('nst_hr_employees.name')->limit(1000)->get();
        $rows->each(function ($row) {
            $row->emergency_contact = $this->decodeJson($row->emergency_contact, []);
            $row->documents = $this->decodeJson($row->documents, []);
        });
        return $this->ok($rows);
    }

    public function storeEmployee(Request $request): JsonResponse
    {
        $data = $this->validateEmployee($request);
        $payload = $this->employeePayload($data, $request);
        $payload['employee_no'] = filled($data['employee_no'] ?? null)
            ? trim((string) $data['employee_no'])
            : $this->nextNumber('EMP', 'nst_hr_employees', 'employee_no');
        $payload['created_by'] = optional($request->user())->id;
        $payload['created_at'] = now();
        $payload['updated_at'] = now();

        $id = DB::table('nst_hr_employees')->insertGetId($payload);
        $employee = DB::table('nst_hr_employees')->find($id);
        $this->hrEvent($request, 'employee.created', 'nst_hr_employees', $id, null, $employee);
        return $this->ok($employee, 'Employee created.', 201);
    }

    public function updateEmployee(Request $request, int $employeeId): JsonResponse
    {
        $before = DB::table('nst_hr_employees')->where('id', $employeeId)->first();
        abort_unless($before, 404, 'Employee not found.');
        $data = $this->validateEmployee($request, true, $employeeId);
        DB::table('nst_hr_employees')->where('id', $employeeId)->update($this->employeePayload($data, $request, true) + ['updated_at' => now()]);
        $after = DB::table('nst_hr_employees')->find($employeeId);
        $this->hrEvent($request, 'employee.updated', 'nst_hr_employees', $employeeId, $before, $after);
        return $this->ok($after, 'Employee updated.');
    }

    public function attendance(Request $request): JsonResponse
    {
        $dateFrom = $request->input('date_from', now()->startOfMonth()->toDateString());
        $dateTo = $request->input('date_to', now()->toDateString());
        $rows = DB::table('nst_hr_attendance')->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_attendance.employee_id')
            ->leftJoin('branches', 'branches.id', '=', 'nst_hr_employees.branch_id')
            ->whereBetween('nst_hr_attendance.attendance_date', [$dateFrom, $dateTo])
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_hr_employees.branch_id', $request->integer('branch_id')))
            ->when($request->filled('employee_id'), fn ($q) => $q->where('nst_hr_attendance.employee_id', $request->integer('employee_id')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_hr_employees.branch_id', $request->integer('branch_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('nst_hr_attendance.status', $request->input('status')))
            ->when($request->filled('movement_state'), fn ($q) => $q->where('nst_hr_attendance.movement_state', $request->input('movement_state')))
            ->select('nst_hr_attendance.*', 'nst_hr_employees.name as employee_name', 'nst_hr_employees.employee_no', 'branches.name as branch_name')
            ->orderByDesc('nst_hr_attendance.attendance_date')->limit(1500)->get();
        return $this->ok($rows);
    }

    public function storeAttendance(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:nst_hr_employees,id'],
            'attendance_date' => ['required', 'date'],
            'check_in' => ['nullable', 'date_format:H:i'],
            'check_out' => ['nullable', 'date_format:H:i'],
            'late_minutes' => ['nullable', 'integer', 'min:0'],
            'overtime_minutes' => ['nullable', 'integer', 'min:0'],
            'status' => ['required', 'in:present,absent,late,half_day,leave,holiday,weekend'],
            'source' => ['nullable', 'string', 'max:80'],
            'note' => ['nullable', 'string', 'max:1000'],
            'approved' => ['nullable', 'boolean'],
        ]);

        $approved = (bool) ($data['approved'] ?? false);
        unset($data['approved']);
        $keys = ['employee_id' => $data['employee_id'], 'attendance_date' => $data['attendance_date']];
        $exists = DB::table('nst_hr_attendance')->where($keys)->exists();
        $payload = array_merge($data, [
            'source' => $data['source'] ?? 'manual',
            'corrected_by' => optional($request->user())->id,
            'approved_at' => $approved ? now() : null,
            'approved_by' => $approved ? optional($request->user())->id : null,
            'updated_at' => now(),
        ]);
        if (!$exists) {
            $payload['created_at'] = now();
        }

        $before = DB::table('nst_hr_attendance')->where($keys)->first();
        DB::table('nst_hr_attendance')->updateOrInsert($keys, $payload);
        $after = DB::table('nst_hr_attendance')->where($keys)->first();
        $this->hrEvent($request, $exists ? 'attendance.corrected' : 'attendance.recorded', 'nst_hr_attendance', $after->id ?? null, $before, $after);
        return $this->ok($after, 'Attendance saved.');
    }

    public function leaves(Request $request): JsonResponse
    {
        return $this->ok($this->leaveQuery($request)->orderByDesc('nst_hr_leave_requests.id')->limit(1000)->get());
    }

    public function storeLeave(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:nst_hr_employees,id'], 'leave_type_id' => ['required', 'integer', 'exists:nst_hr_leave_types,id'],
            'starts_on' => ['required', 'date'], 'ends_on' => ['required', 'date', 'after_or_equal:starts_on'], 'days' => ['nullable', 'numeric', 'min:0.5'],
            'reason' => ['nullable', 'string', 'max:3000'], 'attachments' => ['nullable', 'array'],
        ]);
        $days = $data['days'] ?? Carbon::parse($data['starts_on'])->diffInDays(Carbon::parse($data['ends_on'])) + 1;
        $id = DB::table('nst_hr_leave_requests')->insertGetId([
            ...$data, 'days' => $days, 'attachments' => json_encode($data['attachments'] ?? []), 'status' => 'pending', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $leave = DB::table('nst_hr_leave_requests')->find($id);
        $this->hrEvent($request, 'leave.requested', 'nst_hr_leave_requests', $id, null, $leave);
        return $this->ok($leave, 'Leave request submitted.', 201);
    }

    public function reviewLeave(Request $request, int $leaveId): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:approved,rejected,cancelled'], 'review_note' => ['nullable', 'string', 'max:2000']]);
        $leave = DB::table('nst_hr_leave_requests')->where('id', $leaveId)->first();
        abort_if(!$leave, 404, 'Leave request not found.');
        if ($leave->status !== 'pending' && $data['status'] !== 'cancelled') throw ValidationException::withMessages(['status' => 'Only pending leave can be reviewed.']);
        DB::table('nst_hr_leave_requests')->where('id', $leaveId)->update($data + ['reviewed_by' => optional($request->user())->id, 'reviewed_at' => now(), 'updated_at' => now()]);
        $after = DB::table('nst_hr_leave_requests')->find($leaveId);
        $this->hrEvent($request, 'leave.reviewed', 'nst_hr_leave_requests', $leaveId, $leave, $after);
        return $this->ok($after, 'Leave request reviewed.');
    }

    public function salaryStructures(Request $request): JsonResponse
    {
        $rows = DB::table('nst_hr_salary_structures')->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_salary_structures.employee_id')
            ->select('nst_hr_salary_structures.*', 'nst_hr_employees.name as employee_name', 'nst_hr_employees.employee_no')
            ->when($request->filled('employee_id'), fn ($q) => $q->where('nst_hr_salary_structures.employee_id', $request->integer('employee_id')))
            ->orderByDesc('effective_from')->limit(1000)->get();
        $rows->each(function ($row) { $row->earnings = $this->decodeJson($row->earnings, []); $row->deductions = $this->decodeJson($row->deductions, []); });
        return $this->ok($rows);
    }

    public function storeSalaryStructure(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:nst_hr_employees,id'], 'effective_from' => ['required', 'date'], 'effective_to' => ['nullable', 'date', 'after_or_equal:effective_from'],
            'basic_salary' => ['required', 'numeric', 'min:0'], 'earnings' => ['nullable', 'array'], 'deductions' => ['nullable', 'array'], 'tax_amount' => ['nullable', 'numeric', 'min:0'], 'is_active' => ['nullable', 'boolean'],
        ]);
        $earnings = $this->componentTotal($data['earnings'] ?? []);
        $deductions = $this->componentTotal($data['deductions'] ?? []);
        $gross = round((float) $data['basic_salary'] + $earnings, 2);
        $net = round($gross - $deductions - (float) ($data['tax_amount'] ?? 0), 2);
        if ($net < 0) throw ValidationException::withMessages(['deductions' => 'Net salary cannot be negative.']);
        if (($data['is_active'] ?? true) === true) DB::table('nst_hr_salary_structures')->where('employee_id', $data['employee_id'])->update(['is_active' => false, 'updated_at' => now()]);
        $id = DB::table('nst_hr_salary_structures')->insertGetId([
            ...$data, 'earnings' => json_encode($data['earnings'] ?? []), 'deductions' => json_encode($data['deductions'] ?? []),
            'tax_amount' => $data['tax_amount'] ?? 0, 'gross_salary' => $gross, 'net_salary' => $net, 'is_active' => $data['is_active'] ?? true,
            'created_by' => optional($request->user())->id, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $salary = DB::table('nst_hr_salary_structures')->find($id);
        $this->hrEvent($request, 'salary_structure.saved', 'nst_hr_salary_structures', $id, null, $salary);
        return $this->ok($salary, 'Salary structure saved.', 201);
    }

    public function payroll(Request $request): JsonResponse
    {
        $periods = DB::table('nst_hr_payroll_periods')->leftJoin('branches', 'branches.id', '=', 'nst_hr_payroll_periods.branch_id')
            ->select('nst_hr_payroll_periods.*', 'branches.name as branch_name')
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_hr_payroll_periods.branch_id', $request->integer('branch_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('nst_hr_payroll_periods.status', $request->input('status')))
            ->orderByDesc('nst_hr_payroll_periods.starts_on')->limit(300)->get();
        return $this->ok($periods);
    }

    public function generatePayroll(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:160'], 'starts_on' => ['required', 'date'], 'ends_on' => ['required', 'date', 'after_or_equal:starts_on'], 'branch_id' => ['nullable', 'integer', 'exists:branches,id']]);
        $periodId = DB::transaction(function () use ($data, $request) {
            $duplicate = DB::table('nst_hr_payroll_periods')->where('starts_on', $data['starts_on'])->where('ends_on', $data['ends_on'])->where(function ($q) use ($data) {
                isset($data['branch_id']) ? $q->where('branch_id', $data['branch_id']) : $q->whereNull('branch_id');
            })->exists();
            if ($duplicate) throw ValidationException::withMessages(['starts_on' => 'Payroll already exists for this period and branch.']);
            $periodId = DB::table('nst_hr_payroll_periods')->insertGetId([
                ...$data, 'period_no' => $this->nextNumber('PAY', 'nst_hr_payroll_periods', 'period_no'), 'status' => 'draft',
                'created_by' => optional($request->user())->id, 'created_at' => now(), 'updated_at' => now(),
            ]);
            $employees = DB::table('nst_hr_employees')->where('status', 'active')->when(isset($data['branch_id']), fn ($q) => $q->where('branch_id', $data['branch_id']))->get();
            $grossTotal = $deductionTotal = $netTotal = 0.0;
            foreach ($employees as $employee) {
                $salary = DB::table('nst_hr_salary_structures')->where('employee_id', $employee->id)->where('is_active', true)->where('effective_from', '<=', $data['ends_on'])->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>=', $data['starts_on']))->orderByDesc('effective_from')->first();
                if (!$salary) continue;
                $loanRecovery = round((float) DB::table('nst_hr_loans')->where('employee_id', $employee->id)->whereIn('status', ['approved', 'active'])->where('outstanding_amount', '>', 0)->get(['installment_amount', 'outstanding_amount'])->sum(fn ($loan) => min((float) $loan->installment_amount, (float) $loan->outstanding_amount)), 2);
                $earnings = $this->decodeJson($salary->earnings, []); $deductions = $this->decodeJson($salary->deductions, []);
                $gross = round((float) $salary->gross_salary, 2);
                $totalDeduction = round($this->componentTotal($deductions) + (float) $salary->tax_amount + $loanRecovery, 2);
                $net = max(0, round($gross - $totalDeduction, 2));
                DB::table('nst_hr_payroll_entries')->insert([
                    'period_id' => $periodId, 'employee_id' => $employee->id, 'basic_salary' => $salary->basic_salary,
                    'earnings' => json_encode($earnings), 'deductions' => json_encode($deductions), 'loan_recovery' => $loanRecovery,
                    'tax_amount' => $salary->tax_amount, 'gross_salary' => $gross, 'total_deduction' => $totalDeduction, 'net_salary' => $net,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
                $grossTotal += $gross; $deductionTotal += $totalDeduction; $netTotal += $net;
            }
            DB::table('nst_hr_payroll_periods')->where('id', $periodId)->update(['gross_total' => round($grossTotal, 2), 'deduction_total' => round($deductionTotal, 2), 'net_total' => round($netTotal, 2), 'updated_at' => now()]);
            return $periodId;
        });
        $payroll = $this->payrollDetailData($periodId);
        $this->hrEvent($request, 'payroll.generated', 'nst_hr_payroll_periods', $periodId, null, $payroll);
        return $this->ok($payroll, 'Payroll generated from active salary structures.', 201);
    }

    public function payrollDetail(Request $request, int $periodId): JsonResponse
    {
        return $this->ok($this->payrollDetailData($periodId));
    }

    public function payrollAction(Request $request, int $periodId): JsonResponse
    {
        $data = $request->validate(['action' => ['required', 'in:review,approve,lock,pay,reverse'], 'payment_account_id' => ['nullable', 'integer', 'exists:nst_accounts,id'], 'payment_method' => ['nullable', 'string', 'max:80'], 'payment_reference' => ['nullable', 'string', 'max:190']]);
        $beforePeriod = DB::table('nst_hr_payroll_periods')->where('id', $periodId)->first();
        DB::transaction(function () use ($periodId, $data, $request) {
            $period = DB::table('nst_hr_payroll_periods')->where('id', $periodId)->lockForUpdate()->first();
            abort_if(!$period, 404, 'Payroll period not found.');
            $transitions = ['review' => ['draft', 'reviewed'], 'approve' => ['reviewed', 'approved'], 'lock' => ['approved', 'locked'], 'pay' => ['locked', 'paid'], 'reverse' => ['paid', 'reversed']];
            [$required, $next] = $transitions[$data['action']];
            if ($period->status !== $required) throw ValidationException::withMessages(['action' => "Payroll must be {$required} before {$data['action']}."]);
            $update = ['status' => $next, 'updated_at' => now()];
            if ($data['action'] === 'approve') $update += ['approved_by' => optional($request->user())->id, 'approved_at' => now()];
            if ($data['action'] === 'lock') $update['locked_at'] = now();
            if ($data['action'] === 'pay') {
                if (empty($data['payment_account_id'])) throw ValidationException::withMessages(['payment_account_id' => 'Select the cash or bank account used for payroll payment.']);
                $account = DB::table('nst_accounts')->where('id', $data['payment_account_id'])->first();
                if (!$account || (!$account->is_cash && !$account->is_bank)) throw ValidationException::withMessages(['payment_account_id' => 'Payroll must be paid from a cash or bank account.']);
                $journalId = $this->postPayrollJournal($period, (int) $data['payment_account_id'], $request);
                $update += ['journal_id' => $journalId, 'paid_by' => optional($request->user())->id, 'paid_at' => now()];
                DB::table('nst_hr_payroll_entries')->where('period_id', $periodId)->update(['payment_method' => $data['payment_method'] ?? $account->account_kind, 'payment_reference' => $data['payment_reference'] ?? null, 'paid_at' => now(), 'updated_at' => now()]);
                $this->recoverPayrollLoans($periodId);
            }
            if ($data['action'] === 'reverse') {
                if (!$period->journal_id) throw ValidationException::withMessages(['action' => 'Payroll journal is missing.']);
                $this->reverseJournal((int) $period->journal_id, $request, 'Payroll reversal ' . $period->period_no);
                DB::table('nst_hr_payroll_entries')->where('period_id', $periodId)->update(['paid_at' => null, 'updated_at' => now()]);
            }
            DB::table('nst_hr_payroll_periods')->where('id', $periodId)->update($update);
        });
        $afterPeriod = $this->payrollDetailData($periodId);
        $this->hrEvent($request, 'payroll.' . $data['action'], 'nst_hr_payroll_periods', $periodId, $beforePeriod, $afterPeriod);
        return $this->ok($afterPeriod, 'Payroll status updated and accounting integration completed.');
    }

    public function loans(Request $request): JsonResponse
    {
        return $this->ok(DB::table('nst_hr_loans')->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_loans.employee_id')
            ->select('nst_hr_loans.*', 'nst_hr_employees.name as employee_name', 'nst_hr_employees.employee_no')
            ->when($request->filled('employee_id'), fn ($q) => $q->where('nst_hr_loans.employee_id', $request->integer('employee_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('nst_hr_loans.status', $request->input('status')))
            ->orderByDesc('nst_hr_loans.id')->limit(1000)->get());
    }

    public function storeLoan(Request $request): JsonResponse
    {
        $data = $request->validate(['employee_id' => ['required', 'integer', 'exists:nst_hr_employees,id'], 'loan_type' => ['required', 'string', 'max:80'], 'principal_amount' => ['required', 'numeric', 'min:1'], 'installment_amount' => ['required', 'numeric', 'min:0'], 'starts_on' => ['nullable', 'date'], 'status' => ['nullable', 'in:pending,approved,active,settled,rejected,cancelled'], 'note' => ['nullable', 'string', 'max:2000']]);
        $status = $data['status'] ?? 'pending';
        $id = DB::table('nst_hr_loans')->insertGetId($data + ['recovered_amount' => 0, 'outstanding_amount' => $data['principal_amount'], 'status' => $status, 'approved_by' => in_array($status, ['approved', 'active']) ? optional($request->user())->id : null, 'created_at' => now(), 'updated_at' => now()]);
        $loan = DB::table('nst_hr_loans')->find($id);
        $this->hrEvent($request, 'loan.saved', 'nst_hr_loans', $id, null, $loan);
        return $this->ok($loan, 'Employee loan/advance saved.', 201);
    }

    public function loanAction(Request $request, int $loanId): JsonResponse
    {
        $data = $request->validate(['action' => ['required', 'in:approve,reject,activate,settle,cancel']]);
        $before = DB::table('nst_hr_loans')->where('id', $loanId)->first();
        abort_unless($before, 404, 'Loan or advance request not found.');
        $nextStatus = match ($data['action']) {
            'approve' => 'approved', 'reject' => 'rejected', 'activate' => 'active', 'settle' => 'settled', 'cancel' => 'cancelled',
        };
        $allowed = [
            'approve' => ['pending'], 'reject' => ['pending'], 'activate' => ['approved'],
            'settle' => ['approved', 'active'], 'cancel' => ['pending', 'approved'],
        ];
        if (! in_array($before->status, $allowed[$data['action']], true)) {
            throw ValidationException::withMessages(['action' => "Cannot {$data['action']} a {$before->status} loan."]);
        }
        $update = ['status' => $nextStatus, 'updated_at' => now()];
        if ($data['action'] === 'approve') $update['approved_by'] = optional($request->user())->id;
        if ($data['action'] === 'settle') {
            $update['recovered_amount'] = $before->principal_amount;
            $update['outstanding_amount'] = 0;
        }
        DB::table('nst_hr_loans')->where('id', $loanId)->update($update);
        $after = DB::table('nst_hr_loans')->find($loanId);
        $this->hrEvent($request, 'loan.' . $data['action'], 'nst_hr_loans', $loanId, $before, $after);
        return $this->ok($after, 'Loan workflow updated.');
    }

    public function performance(Request $request): JsonResponse
    {
        return $this->ok(DB::table('nst_hr_performance_reviews')->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_performance_reviews.employee_id')
            ->leftJoin('users', 'users.id', '=', 'nst_hr_performance_reviews.reviewer_id')
            ->select('nst_hr_performance_reviews.*', 'nst_hr_employees.name as employee_name', 'nst_hr_employees.employee_no', 'users.name as reviewer_name')
            ->when($request->filled('employee_id'), fn ($q) => $q->where('nst_hr_performance_reviews.employee_id', $request->integer('employee_id')))
            ->orderByDesc('review_date')->limit(1000)->get()->map(function ($row) { $row->goals = $this->decodeJson($row->goals, []); $row->competencies = $this->decodeJson($row->competencies, []); return $row; }));
    }

    public function storePerformance(Request $request): JsonResponse
    {
        $data = $request->validate(['employee_id' => ['required', 'integer', 'exists:nst_hr_employees,id'], 'review_type' => ['required', 'string', 'max:80'], 'review_date' => ['required', 'date'], 'score' => ['nullable', 'numeric', 'between:0,100'], 'goals' => ['nullable', 'array'], 'competencies' => ['nullable', 'array'], 'summary' => ['nullable', 'string', 'max:5000'], 'outcome' => ['nullable', 'string', 'max:190']]);
        $id = DB::table('nst_hr_performance_reviews')->insertGetId([...$data, 'goals' => json_encode($data['goals'] ?? []), 'competencies' => json_encode($data['competencies'] ?? []), 'reviewer_id' => optional($request->user())->id, 'created_at' => now(), 'updated_at' => now()]);
        $review = DB::table('nst_hr_performance_reviews')->find($id);
        $this->hrEvent($request, 'performance.saved', 'nst_hr_performance_reviews', $id, null, $review);
        return $this->ok($review, 'Performance review saved.', 201);
    }


    public function updatePerformance(Request $request, int $reviewId): JsonResponse
    {
        $before = DB::table('nst_hr_performance_reviews')->where('id', $reviewId)->first();
        abort_unless($before, 404, 'Performance review not found.');
        $data = $request->validate(['employee_id' => ['required', 'integer', 'exists:nst_hr_employees,id'], 'review_type' => ['required', 'string', 'max:80'], 'review_date' => ['required', 'date'], 'score' => ['nullable', 'numeric', 'between:0,100'], 'goals' => ['nullable', 'array'], 'competencies' => ['nullable', 'array'], 'summary' => ['nullable', 'string', 'max:5000'], 'outcome' => ['nullable', 'string', 'max:190']]);
        DB::table('nst_hr_performance_reviews')->where('id', $reviewId)->update([...$data, 'goals' => json_encode($data['goals'] ?? []), 'competencies' => json_encode($data['competencies'] ?? []), 'reviewer_id' => optional($request->user())->id, 'updated_at' => now()]);
        $after = DB::table('nst_hr_performance_reviews')->find($reviewId);
        $this->hrEvent($request, 'performance.updated', 'nst_hr_performance_reviews', $reviewId, $before, $after);
        return $this->ok($after, 'Performance review updated.');
    }


    public function attendanceSummary(Request $request): JsonResponse
    {
        $dateFrom = $request->input('date_from', now()->startOfMonth()->toDateString());
        $dateTo = $request->input('date_to', now()->toDateString());
        $branchId = $request->integer('branch_id') ?: null;
        $rows = DB::table('nst_hr_attendance')
            ->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_attendance.employee_id')
            ->whereBetween('nst_hr_attendance.attendance_date', [$dateFrom, $dateTo])
            ->when($branchId, fn ($q) => $q->where('nst_hr_employees.branch_id', $branchId))
            ->selectRaw('nst_hr_attendance.status, COUNT(*) as total, COALESCE(SUM(late_minutes),0) as late_minutes, COALESCE(SUM(overtime_minutes),0) as overtime_minutes')
            ->groupBy('nst_hr_attendance.status')
            ->orderBy('nst_hr_attendance.status')
            ->get();

        return $this->ok([
            'period' => ['from' => $dateFrom, 'to' => $dateTo],
            'summary' => $rows,
            'total_days_recorded' => (int) $rows->sum('total'),
            'total_late_minutes' => (int) $rows->sum('late_minutes'),
            'total_overtime_minutes' => (int) $rows->sum('overtime_minutes'),
        ]);
    }

    public function leaveBalances(Request $request): JsonResponse
    {
        $year = (int) $request->input('year', now()->year);
        $employeeId = $request->integer('employee_id') ?: null;
        $employees = DB::table('nst_hr_employees')
            ->when($employeeId, fn ($q) => $q->where('id', $employeeId))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('branch_id', $request->integer('branch_id')))
            ->whereIn('status', ['active', 'probation'])
            ->orderBy('name')->limit(1000)->get(['id', 'employee_no', 'name', 'branch_id']);
        $leaveTypes = DB::table('nst_hr_leave_types')->where('is_active', true)->orderBy('name')->get();
        $approved = DB::table('nst_hr_leave_requests')
            ->where('status', 'approved')
            ->whereYear('starts_on', $year)
            ->when($employeeId, fn ($q) => $q->where('employee_id', $employeeId))
            ->selectRaw('employee_id, leave_type_id, COALESCE(SUM(days),0) as used_days')
            ->groupBy('employee_id', 'leave_type_id')
            ->get()
            ->groupBy(fn ($row) => $row->employee_id . ':' . $row->leave_type_id);

        $rows = [];
        foreach ($employees as $employee) {
            foreach ($leaveTypes as $type) {
                $bucket = $approved->get($employee->id . ':' . $type->id);
                $used = $bucket ? (float) $bucket->first()->used_days : 0.0;
                $rows[] = [
                    'employee_id' => $employee->id,
                    'employee_no' => $employee->employee_no,
                    'employee_name' => $employee->name,
                    'leave_type_id' => $type->id,
                    'leave_type_name' => $type->name,
                    'entitled_days' => (float) $type->annual_days,
                    'used_days' => round($used, 2),
                    'remaining_days' => round((float) $type->annual_days - $used, 2),
                    'year' => $year,
                ];
            }
        }
        return $this->ok(['year' => $year, 'balances' => $rows]);
    }

    public function updatePayrollEntry(Request $request, int $periodId, int $entryId): JsonResponse
    {
        $data = $request->validate([
            'overtime_amount' => ['nullable', 'numeric', 'min:0'],
            'commission_amount' => ['nullable', 'numeric', 'min:0'],
            'bonus_amount' => ['nullable', 'numeric', 'min:0'],
            'loan_recovery' => ['nullable', 'numeric', 'min:0'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'earnings' => ['nullable', 'array'],
            'deductions' => ['nullable', 'array'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $period = DB::table('nst_hr_payroll_periods')->where('id', $periodId)->first();
        abort_if(!$period, 404, 'Payroll period not found.');
        if (! in_array($period->status, ['draft', 'reviewed'], true)) {
            throw ValidationException::withMessages(['status' => 'Payroll entries can only be adjusted before approval.']);
        }
        $entry = DB::table('nst_hr_payroll_entries')->where('period_id', $periodId)->where('id', $entryId)->first();
        abort_if(!$entry, 404, 'Payroll entry not found.');

        $earnings = array_key_exists('earnings', $data) ? $data['earnings'] : $this->decodeJson($entry->earnings, []);
        $deductions = array_key_exists('deductions', $data) ? $data['deductions'] : $this->decodeJson($entry->deductions, []);
        $overtime = round((float) ($data['overtime_amount'] ?? $entry->overtime_amount), 2);
        $commission = round((float) ($data['commission_amount'] ?? $entry->commission_amount), 2);
        $bonus = round((float) ($data['bonus_amount'] ?? $entry->bonus_amount), 2);
        $loanRecovery = round((float) ($data['loan_recovery'] ?? $entry->loan_recovery), 2);
        $tax = round((float) ($data['tax_amount'] ?? $entry->tax_amount), 2);
        $gross = round((float) $entry->basic_salary + $this->componentTotal($earnings) + $overtime + $commission + $bonus, 2);
        $totalDeduction = round($this->componentTotal($deductions) + $loanRecovery + $tax, 2);
        $net = round($gross - $totalDeduction, 2);
        if ($net < 0) throw ValidationException::withMessages(['deductions' => 'Adjusted net salary cannot be negative.']);

        DB::table('nst_hr_payroll_entries')->where('id', $entryId)->update([
            'earnings' => json_encode($earnings),
            'deductions' => json_encode($deductions),
            'overtime_amount' => $overtime,
            'commission_amount' => $commission,
            'bonus_amount' => $bonus,
            'loan_recovery' => $loanRecovery,
            'tax_amount' => $tax,
            'gross_salary' => $gross,
            'total_deduction' => $totalDeduction,
            'net_salary' => $net,
            'updated_at' => now(),
        ]);
        $this->recalculatePayrollTotals($periodId);
        $after = DB::table('nst_hr_payroll_entries')->where('id', $entryId)->first();
        if (Schema::hasTable('nst_hr_payroll_entry_adjustments')) {
            DB::table('nst_hr_payroll_entry_adjustments')->insert([
                'period_id' => $periodId,
                'entry_id' => $entryId,
                'employee_id' => $entry->employee_id,
                'old_net_salary' => $entry->net_salary,
                'new_net_salary' => $after->net_salary,
                'changes' => json_encode($data),
                'note' => $data['note'] ?? null,
                'adjusted_by' => optional($request->user())->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        $this->hrEvent($request, 'payroll.entry.adjusted', 'nst_hr_payroll_entries', $entryId, $entry, $after);
        return $this->ok($this->payrollDetailData($periodId), 'Payroll entry adjusted and totals recalculated.');
    }

    public function payslips(Request $request, int $periodId): JsonResponse
    {
        $period = $this->payrollDetailData($periodId);
        $publications = Schema::hasTable('nst_hr_payslip_publications')
            ? DB::table('nst_hr_payslip_publications')->where('period_id', $periodId)->get()->keyBy('entry_id')
            : collect();
        $period->entries->transform(function ($entry) use ($period, $publications) {
            $publication = $publications->get($entry->id);
            $entry->payslip = [
                'period_no' => $period->period_no,
                'period_name' => $period->name,
                'gross_salary' => (float) $entry->gross_salary,
                'total_deduction' => (float) $entry->total_deduction,
                'net_salary' => (float) $entry->net_salary,
                'published_at' => $publication->published_at ?? null,
                'public_token' => $publication->public_token ?? null,
            ];
            return $entry;
        });
        return $this->ok($period);
    }

    public function publishPayslips(Request $request, int $periodId): JsonResponse
    {
        $period = DB::table('nst_hr_payroll_periods')->where('id', $periodId)->first();
        abort_if(!$period, 404, 'Payroll period not found.');
        if (! in_array($period->status, ['paid', 'locked'], true)) {
            throw ValidationException::withMessages(['status' => 'Payslips can be published only after payroll is locked or paid.']);
        }
        $count = 0;
        foreach (DB::table('nst_hr_payroll_entries')->where('period_id', $periodId)->get() as $entry) {
            DB::table('nst_hr_payslip_publications')->updateOrInsert(
                ['period_id' => $periodId, 'entry_id' => $entry->id],
                [
                    'employee_id' => $entry->employee_id,
                    'public_token' => Str::uuid()->toString(),
                    'published_by' => optional($request->user())->id,
                    'published_at' => now(),
                    'delivery_channel' => $request->input('delivery_channel', 'portal'),
                    'status' => 'published',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]
            );
            $count++;
        }
        $this->hrEvent($request, 'payslip.published', 'nst_hr_payroll_periods', $periodId, null, ['published_count' => $count]);
        return $this->ok(['published_count' => $count], 'Payslips published to employee portal records.');
    }

    public function exportPayroll(Request $request): StreamedResponse
    {
        $periodId = $request->integer('period_id');
        $fileName = 'nst-stage7-payroll-' . now()->format('Ymd-His') . '.csv';
        $this->hrEvent($request, 'payroll.exported', 'hrm_payroll_reports', $periodId ?: null, null, ['file' => $fileName]);
        return response()->streamDownload(function () use ($periodId) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Period', 'Employee No', 'Employee', 'Gross', 'Deduction', 'Net', 'Payment Method', 'Paid At']);
            $query = DB::table('nst_hr_payroll_entries')
                ->join('nst_hr_payroll_periods', 'nst_hr_payroll_periods.id', '=', 'nst_hr_payroll_entries.period_id')
                ->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_payroll_entries.employee_id')
                ->select('nst_hr_payroll_periods.period_no', 'nst_hr_employees.employee_no', 'nst_hr_employees.name', 'nst_hr_payroll_entries.gross_salary', 'nst_hr_payroll_entries.total_deduction', 'nst_hr_payroll_entries.net_salary', 'nst_hr_payroll_entries.payment_method', 'nst_hr_payroll_entries.paid_at')
                ->when($periodId, fn ($q) => $q->where('nst_hr_payroll_entries.period_id', $periodId))
                ->orderByDesc('nst_hr_payroll_periods.starts_on')->orderBy('nst_hr_employees.name')->limit(5000);
            foreach ($query->get() as $row) {
                fputcsv($out, [$row->period_no, $row->employee_no, $row->name, $row->gross_salary, $row->total_deduction, $row->net_salary, $row->payment_method, $row->paid_at]);
            }
            fclose($out);
        }, $fileName, ['Content-Type' => 'text/csv']);
    }

    public function auditHistory(Request $request): JsonResponse
    {
        $logs = Schema::hasTable('nst_hr_operation_logs') ? DB::table('nst_hr_operation_logs')
            ->leftJoin('users', 'users.id', '=', 'nst_hr_operation_logs.user_id')
            ->select('nst_hr_operation_logs.*', 'users.name as user_name')
            ->when($request->filled('action'), fn ($q) => $q->where('nst_hr_operation_logs.action', $request->input('action')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_hr_operation_logs.branch_id', $request->integer('branch_id')))
            ->orderByDesc('nst_hr_operation_logs.id')->limit(500)->get() : collect();
        return $this->ok(['logs' => $logs, 'total' => $logs->count()]);
    }

    public function acceptanceStatus(Request $request): JsonResponse
    {
        return $this->ok($this->stageSevenAcceptancePayload(), 'Stage 7 acceptance status loaded.');
    }

    private function leaveQuery(Request $request)
    {
        return DB::table('nst_hr_leave_requests')->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_leave_requests.employee_id')->join('nst_hr_leave_types', 'nst_hr_leave_types.id', '=', 'nst_hr_leave_requests.leave_type_id')->leftJoin('branches', 'branches.id', '=', 'nst_hr_employees.branch_id')
            ->select('nst_hr_leave_requests.*', 'nst_hr_employees.name as employee_name', 'nst_hr_employees.employee_no', 'nst_hr_leave_types.name as leave_type_name', 'nst_hr_leave_types.is_paid', 'branches.name as branch_name')
            ->when($request->filled('status'), fn ($q) => $q->where('nst_hr_leave_requests.status', $request->input('status')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_hr_employees.branch_id', $request->integer('branch_id')))
            ->when($request->filled('employee_id'), fn ($q) => $q->where('nst_hr_leave_requests.employee_id', $request->integer('employee_id')));
    }

    private function validateEmployee(Request $request, bool $partial = false, ?int $employeeId = null): array
    {
        $required = $partial ? 'sometimes' : 'required';
        return $request->validate([
            'employee_no' => ['nullable', 'string', 'max:80', 'unique:nst_hr_employees,employee_no,' . ($employeeId ?? 'NULL')],
            'user_id' => ['nullable', 'integer', 'exists:users,id', 'unique:nst_hr_employees,user_id,' . ($employeeId ?? 'NULL')],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'], 'department_id' => ['nullable', 'integer', 'exists:nst_hr_departments,id'],
            'designation_id' => ['nullable', 'integer', 'exists:nst_hr_designations,id'], 'shift_id' => ['nullable', 'integer', 'exists:nst_hr_shifts,id'],
            'reporting_manager_id' => ['nullable', 'integer', 'exists:nst_hr_employees,id'], 'name' => [$required, 'string', 'max:160'],
            'email' => ['nullable', 'email', 'max:190'], 'phone' => ['nullable', 'string', 'max:80'], 'employment_type' => ['nullable', 'string', 'max:80'],
            'joining_date' => ['nullable', 'date'], 'confirmation_date' => ['nullable', 'date'], 'date_of_birth' => ['nullable', 'date'],
            'nid_number' => ['nullable', 'string', 'max:100'], 'address' => ['nullable', 'string', 'max:3000'],
            'emergency_contact' => ['nullable', 'array'], 'documents' => ['nullable', 'array'], 'status' => ['nullable', 'in:active,inactive,probation,resigned,terminated'],
            'exit_date' => ['nullable', 'date'], 'exit_reason' => ['nullable', 'string', 'max:3000'],
        ]);
    }

    private function employeePayload(array $data, Request $request, bool $partial = false): array
    {
        if (array_key_exists('emergency_contact', $data)) $data['emergency_contact'] = json_encode($data['emergency_contact']);
        if (array_key_exists('documents', $data)) $data['documents'] = json_encode($data['documents']);
        if (!$partial) { $data['employment_type'] = $data['employment_type'] ?? 'full_time'; $data['status'] = $data['status'] ?? 'active'; }
        return $data;
    }

    private function payrollDetailData(int $periodId): object
    {
        $period = DB::table('nst_hr_payroll_periods')->leftJoin('branches', 'branches.id', '=', 'nst_hr_payroll_periods.branch_id')->where('nst_hr_payroll_periods.id', $periodId)->select('nst_hr_payroll_periods.*', 'branches.name as branch_name')->first();
        abort_if(!$period, 404, 'Payroll period not found.');
        $period->entries = DB::table('nst_hr_payroll_entries')->join('nst_hr_employees', 'nst_hr_employees.id', '=', 'nst_hr_payroll_entries.employee_id')->leftJoin('nst_hr_departments', 'nst_hr_departments.id', '=', 'nst_hr_employees.department_id')->leftJoin('nst_hr_designations', 'nst_hr_designations.id', '=', 'nst_hr_employees.designation_id')
            ->where('period_id', $periodId)->select('nst_hr_payroll_entries.*', 'nst_hr_employees.name as employee_name', 'nst_hr_employees.employee_no', 'nst_hr_departments.name as department_name', 'nst_hr_designations.name as designation_name')->orderBy('employee_name')->get()->map(function ($row) { $row->earnings = $this->decodeJson($row->earnings, []); $row->deductions = $this->decodeJson($row->deductions, []); return $row; });
        return $period;
    }

    private function postPayrollJournal(object $period, int $paymentAccountId, Request $request): int
    {
        $expenseAccountId = DB::table('nst_accounts')->where('code', '5200')->value('id');
        if (!$expenseAccountId) {
            throw ValidationException::withMessages(['finance' => self::SALARY_EXPENSE_ACCOUNT_NAME . ' account (5200) is missing. Run the Stage 5 migration.']);
        }

        $journalLines = $this->buildPayrollJournalLines((int) $expenseAccountId, $paymentAccountId, (float) $period->net_total);
        $journalId = DB::table('nst_journals')->insertGetId([
            'journal_no' => $this->nextNumber('PAYJV', 'nst_journals', 'journal_no'),
            'journal_date' => now()->toDateString(),
            'source_type' => 'payroll',
            'source_id' => $period->id,
            'reference_no' => $period->period_no,
            'branch_id' => $period->branch_id,
            'description' => 'Payroll payment: ' . $period->name,
            'status' => 'posted',
            'created_by' => optional($request->user())->id,
            'posted_by' => optional($request->user())->id,
            'posted_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('nst_journal_lines')->insert(array_map(fn (array $line) => array_merge($line, [
            'journal_id' => $journalId,
            'created_at' => now(),
            'updated_at' => now(),
        ]), $journalLines));

        return $journalId;
    }

    private function buildPayrollJournalLines(int $expenseAccountId, int $paymentAccountId, float $amount): array
    {
        $amount = round($amount, 2);
        if ($amount <= 0) {
            throw ValidationException::withMessages(['payroll' => 'Payroll net amount must be greater than zero before payment.']);
        }
        if ($expenseAccountId === $paymentAccountId) {
            throw ValidationException::withMessages(['payment_account_id' => 'Salary expense and payment accounts must be different.']);
        }

        return [
            [
                'account_id' => $expenseAccountId,
                'debit' => $amount,
                'credit' => 0,
                'memo' => self::SALARY_EXPENSE_ACCOUNT_NAME . ': payroll net salary',
            ],
            [
                'account_id' => $paymentAccountId,
                'debit' => 0,
                'credit' => $amount,
                'memo' => 'Payroll payment',
            ],
        ];
    }

    private function reverseJournal(int $journalId, Request $request, string $description): int
    {
        $journal = DB::table('nst_journals')->where('id', $journalId)->lockForUpdate()->first();
        if (!$journal || $journal->status !== 'posted' || $journal->reversed_by_journal_id) throw ValidationException::withMessages(['finance' => 'Payroll journal cannot be reversed.']);
        $newId = DB::table('nst_journals')->insertGetId([
            'journal_no' => $this->nextNumber('PAYRV', 'nst_journals', 'journal_no'), 'journal_date' => now()->toDateString(),
            'source_type' => 'payroll_reversal', 'source_id' => $journal->source_id, 'reference_no' => $journal->journal_no,
            'branch_id' => $journal->branch_id, 'description' => $description, 'status' => 'posted', 'reversal_of_id' => $journalId,
            'created_by' => optional($request->user())->id, 'posted_by' => optional($request->user())->id, 'posted_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach (DB::table('nst_journal_lines')->where('journal_id', $journalId)->get() as $line) DB::table('nst_journal_lines')->insert(['journal_id' => $newId, 'account_id' => $line->account_id, 'debit' => $line->credit, 'credit' => $line->debit, 'memo' => 'Payroll reversal', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('nst_journals')->where('id', $journalId)->update(['status' => 'reversed', 'reversed_by_journal_id' => $newId, 'reversed_by' => optional($request->user())->id, 'reversed_at' => now(), 'updated_at' => now()]);
        return $newId;
    }

    private function recoverPayrollLoans(int $periodId): void
    {
        foreach (DB::table('nst_hr_payroll_entries')->where('period_id', $periodId)->where('loan_recovery', '>', 0)->get() as $entry) {
            $remaining = (float) $entry->loan_recovery;
            $loans = DB::table('nst_hr_loans')->where('employee_id', $entry->employee_id)->whereIn('status', ['approved', 'active'])->where('outstanding_amount', '>', 0)->orderBy('id')->lockForUpdate()->get();
            foreach ($loans as $loan) {
                if ($remaining <= 0) break;
                $recover = min($remaining, (float) $loan->outstanding_amount);
                $outstanding = round((float) $loan->outstanding_amount - $recover, 2);
                DB::table('nst_hr_loans')->where('id', $loan->id)->update(['recovered_amount' => round((float) $loan->recovered_amount + $recover, 2), 'outstanding_amount' => $outstanding, 'status' => $outstanding <= 0 ? 'settled' : 'active', 'updated_at' => now()]);
                $remaining -= $recover;
            }
        }
    }


    private function recalculatePayrollTotals(int $periodId): void
    {
        $totals = DB::table('nst_hr_payroll_entries')
            ->where('period_id', $periodId)
            ->selectRaw('COALESCE(SUM(gross_salary),0) as gross_total, COALESCE(SUM(total_deduction),0) as deduction_total, COALESCE(SUM(net_salary),0) as net_total')
            ->first();
        DB::table('nst_hr_payroll_periods')->where('id', $periodId)->update([
            'gross_total' => round((float) ($totals->gross_total ?? 0), 2),
            'deduction_total' => round((float) ($totals->deduction_total ?? 0), 2),
            'net_total' => round((float) ($totals->net_total ?? 0), 2),
            'updated_at' => now(),
        ]);
    }

    private function hrEvent(Request $request, string $action, ?string $modelType = null, mixed $modelId = null, mixed $before = null, mixed $after = null): void
    {
        if (! Schema::hasTable('nst_hr_operation_logs')) return;
        DB::table('nst_hr_operation_logs')->insert([
            'action' => $action,
            'resource_type' => $modelType,
            'resource_id' => $modelId ? (string) $modelId : null,
            'before_payload' => $before ? json_encode($before) : null,
            'after_payload' => $after ? json_encode($after) : null,
            'metadata' => json_encode(['ip' => $request->ip(), 'path' => $request->path()]),
            'user_id' => optional($request->user())->id,
            'branch_id' => optional($request->user())->branch_id,
            'created_at' => now(),
        ]);
    }

    private function stageSevenAcceptancePayload(): array
    {
        $requiredTables = ['nst_hr_departments', 'nst_hr_designations', 'nst_hr_shifts', 'nst_hr_employees', 'nst_hr_attendance', 'nst_hr_leave_types', 'nst_hr_leave_requests', 'nst_hr_salary_structures', 'nst_hr_payroll_periods', 'nst_hr_payroll_entries', 'nst_hr_loans', 'nst_hr_performance_reviews', 'nst_hr_operation_logs', 'nst_hr_payslip_publications'];
        $requiredRoutes = ['hrm.overview', 'hrm.reference-data', 'hrm.reference-data.update', 'hrm.reference-data.delete', 'hrm.employees', 'hrm.attendance', 'hrm.attendance-summary', 'hrm.leave-balances', 'hrm.payroll', 'hrm.payroll-entry.update', 'hrm.payslips', 'hrm.payslips.publish', 'hrm.payroll.export', 'hrm.loans.action', 'hrm.performance.update', 'hrm.audit-history', 'hrm.acceptance-status'];
        $tableStatus = collect($requiredTables)->mapWithKeys(fn ($table) => [$table => Schema::hasTable($table)]);
        $routeStatus = collect($requiredRoutes)->mapWithKeys(fn ($name) => [$name => Route::has($name)]);
        return [
            'tables' => $tableStatus,
            'routes' => $routeStatus,
            'database_ready' => $tableStatus->every(fn ($ready) => $ready === true),
            'routes_ready' => $routeStatus->every(fn ($ready) => $ready === true),
            'business_rules' => [
                'employee_lifecycle_tracks_branch_department_designation_shift' => true,
                'attendance_unique_per_employee_date_and_correction_audited' => true,
                'leave_balances_derive_from_approved_leave' => true,
                'payroll_requires_status_flow_draft_reviewed_approved_locked_paid' => true,
                'payroll_payment_posts_stage5_double_entry_journal' => true,
                'payroll_reversal_creates_reversing_journal' => true,
                'loans_recover_from_payroll_entries' => true,
                'payslip_publication_creates_employee_records' => true,
                'audit_history_records_hrm_operations' => true,
            ],
        ];
    }

    private function componentTotal(array $components): float
    {
        return round((float) collect($components)->sum(function ($item) { if (is_numeric($item)) return (float) $item; return is_array($item) ? (float) ($item['amount'] ?? 0) : 0; }), 2);
    }

    private function decodeJson(mixed $value, mixed $default): mixed
    {
        if (is_array($value)) return $value; if (!is_string($value) || $value === '') return $default;
        $decoded = json_decode($value, true); return json_last_error() === JSON_ERROR_NONE ? $decoded : $default;
    }

    private function nextNumber(string $prefix, string $table, string $column): string
    {
        do $number = $prefix . '-' . now()->format('YmdHis') . '-' . strtoupper(Str::random(4)); while (DB::table($table)->where($column, $number)->exists());
        return $number;
    }

    private function ok(mixed $data, string $message = 'HRM operation completed.', int $status = 200): JsonResponse
    {
        return response()->json(['status' => true, 'message' => $message, 'data' => $data], $status);
    }
}
