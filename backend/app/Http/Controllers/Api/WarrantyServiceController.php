<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\WarrantyServiceJob;
use App\Models\DeviceUnit;
use App\Models\WarrantyServiceJobLog;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class WarrantyServiceController extends Controller
{
    private array $statuses = [
        'received',
        'checking',
        'sent_to_service_center',
        'repairing',
        'waiting_for_parts',
        'ready_to_deliver',
        'delivered',
        'rejected',
        'cancelled',
    ];

    public function summary(Request $request)
    {
        if (!Schema::hasTable('warranty_service_jobs')) {
            return response()->json([
                'success' => true,
                'data' => $this->emptySummary(),
                'message' => 'Please run migration first.',
            ]);
        }

        $query = $this->filteredQuery($request);
        $rows = (clone $query)->get(['status', 'total_amount', 'paid_amount', 'due_amount']);

        $statusCounts = collect($this->statuses)->mapWithKeys(fn ($status) => [
            $status => $rows->where('status', $status)->count(),
        ]);

        return response()->json([
            'success' => true,
            'data' => [
                'total_jobs' => $rows->count(),
                'open_jobs' => $rows->whereNotIn('status', ['delivered', 'rejected', 'cancelled'])->count(),
                'ready_to_deliver' => $rows->where('status', 'ready_to_deliver')->count(),
                'delivered' => $rows->where('status', 'delivered')->count(),
                'total_amount' => round((float) $rows->sum('total_amount'), 2),
                'paid_amount' => round((float) $rows->sum('paid_amount'), 2),
                'due_amount' => round((float) $rows->sum('due_amount'), 2),
                'status_counts' => $statusCounts,
            ],
        ]);
    }

    public function index(Request $request)
    {
        if (!Schema::hasTable('warranty_service_jobs')) {
            return response()->json([
                'success' => true,
                'message' => 'warranty_service_jobs table not found yet. Please run migration.',
                'data' => [],
                'summary' => $this->emptySummary(),
            ]);
        }

        $perPage = max(10, min((int) $request->get('per_page', 20), 100));

        $query = $this->filteredQuery($request)
            ->with([
                'branch:id,name,code',
                'customer:id,name,phone,email',
                'receiver:id,name,email',
                'technician:id,name,email',
                'deliveredBy:id,name,email',
                'deviceUnit:id,imei_1,imei_2,barcode,status,service_status,latest_service_job_id',
            ]);

        $summaryQuery = clone $query;

        $jobs = $query
            ->orderByRaw("FIELD(status, 'received','checking','sent_to_service_center','repairing','waiting_for_parts','ready_to_deliver','delivered','rejected','cancelled')")
            ->orderByDesc('id')
            ->paginate($perPage);

        $summaryRows = $summaryQuery->get(['status', 'total_amount', 'paid_amount', 'due_amount']);

        return response()->json([
            'success' => true,
            'data' => $jobs->items(),
            'summary' => [
                'total_jobs' => $summaryRows->count(),
                'open_jobs' => $summaryRows->whereNotIn('status', ['delivered', 'rejected', 'cancelled'])->count(),
                'ready_to_deliver' => $summaryRows->where('status', 'ready_to_deliver')->count(),
                'total_amount' => round((float) $summaryRows->sum('total_amount'), 2),
                'paid_amount' => round((float) $summaryRows->sum('paid_amount'), 2),
                'due_amount' => round((float) $summaryRows->sum('due_amount'), 2),
            ],
            'current_page' => $jobs->currentPage(),
            'last_page' => $jobs->lastPage(),
            'per_page' => $jobs->perPage(),
            'total' => $jobs->total(),
        ]);
    }

    public function show(WarrantyServiceJob $warrantyService)
    {
        return response()->json([
            'success' => true,
            'data' => $warrantyService->load([
                'branch:id,name,code',
                'customer:id,name,phone,email',
                'sale:id,invoice_no,final_amount,paid_amount,due_amount,status',
                'saleItem:id,sale_id,product_id,product_name,imei_1,imei_2,barcode',
                'deviceUnit:id,imei_1,imei_2,barcode,status,service_status,latest_service_job_id',
                'receiver:id,name,email',
                'technician:id,name,email',
                'deliveredBy:id,name,email',
                'logs.user:id,name,email',
            ]),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validatePayload($request);

        $job = DB::transaction(function () use ($request, $validated) {
            $device = $this->devicePayload($validated['device_unit_id'] ?? null);
            $financial = $this->calculateFinancial($validated);

            $job = WarrantyServiceJob::create(array_merge($validated, $device, $financial, [
                'job_no' => $this->makeJobNo(),
                'status' => $validated['status'] ?? 'received',
                'received_by' => $request->user()?->id,
                'received_at' => now(),
            ]));

            $this->writeLog($job, $request, 'created', null, $job->status, $validated['note'] ?? null);
            $this->syncDeviceServiceState($job);

            return $job->fresh()->load([
                'branch:id,name,code',
                'customer:id,name,phone,email',
                'deviceUnit:id,imei_1,imei_2,barcode,status,service_status,latest_service_job_id',
                'receiver:id,name,email',
                'technician:id,name,email',
            ]);
        });

        return response()->json([
            'success' => true,
            'message' => 'Warranty/Service job created successfully.',
            'data' => $job,
        ], 201);
    }

    public function update(Request $request, WarrantyServiceJob $warrantyService)
    {
        $validated = $this->validatePayload($request, false);

        $job = DB::transaction(function () use ($request, $warrantyService, $validated) {
            $oldStatus = $warrantyService->status;
            $device = $this->devicePayload($validated['device_unit_id'] ?? $warrantyService->device_unit_id);
            $financial = $this->calculateFinancial(array_merge($warrantyService->toArray(), $validated));

            $warrantyService->update(array_merge($validated, $device, $financial));

            $this->writeLog($warrantyService, $request, 'updated', $oldStatus, $warrantyService->fresh()->status, $request->note);
            $this->syncDeviceServiceState($warrantyService->fresh());

            return $warrantyService->fresh()->load([
                'branch:id,name,code',
                'customer:id,name,phone,email',
                'deviceUnit:id,imei_1,imei_2,barcode,status,service_status,latest_service_job_id',
                'receiver:id,name,email',
                'technician:id,name,email',
            ]);
        });

        return response()->json([
            'success' => true,
            'message' => 'Warranty/Service job updated successfully.',
            'data' => $job,
        ]);
    }

    public function updateStatus(Request $request, WarrantyServiceJob $warrantyService)
    {
        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in($this->statuses)],
            'note' => ['nullable', 'string'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'payment_method' => ['nullable', 'string', 'max:100'],
            'transaction_id' => ['nullable', 'string', 'max:150'],
        ]);

        $job = DB::transaction(function () use ($request, $warrantyService, $validated) {
            $oldStatus = $warrantyService->status;
            $payload = ['status' => $validated['status']];

            if (array_key_exists('assigned_to', $validated)) {
                $payload['assigned_to'] = $validated['assigned_to'];
            }

            if (array_key_exists('payment_method', $validated)) {
                $payload['payment_method'] = $validated['payment_method'];
            }

            if (array_key_exists('transaction_id', $validated)) {
                $payload['transaction_id'] = $validated['transaction_id'];
            }

            if (in_array($validated['status'], ['ready_to_deliver'], true)) {
                $payload['completed_at'] = $warrantyService->completed_at ?: now();
            }

            if ($validated['status'] === 'delivered') {
                $payload['delivered_at'] = now();
                $payload['delivered_by'] = $request->user()?->id;
            }

            $warrantyService->update($payload);

            $this->writeLog($warrantyService, $request, 'status_changed', $oldStatus, $validated['status'], $validated['note'] ?? null);
            $this->syncDeviceServiceState($warrantyService->fresh());

            return $warrantyService->fresh()->load(['branch:id,name,code', 'deviceUnit:id,imei_1,imei_2,barcode,status,service_status,latest_service_job_id', 'logs.user:id,name,email']);
        });

        return response()->json([
            'success' => true,
            'message' => 'Service status updated successfully.',
            'data' => $job,
        ]);
    }

    public function receivePayment(Request $request, WarrantyServiceJob $warrantyService)
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'payment_method' => ['nullable', 'string', 'max:100'],
            'transaction_id' => ['nullable', 'string', 'max:150'],
            'note' => ['nullable', 'string'],
        ]);

        $job = DB::transaction(function () use ($request, $warrantyService, $validated) {
            $paid = round((float) $warrantyService->paid_amount + (float) $validated['amount'], 2);
            $total = round((float) $warrantyService->total_amount, 2);
            $due = max(0, round($total - $paid, 2));

            $warrantyService->update([
                'paid_amount' => min($paid, $total),
                'due_amount' => $due,
                'payment_method' => $validated['payment_method'] ?? $warrantyService->payment_method,
                'transaction_id' => $validated['transaction_id'] ?? $warrantyService->transaction_id,
            ]);

            $this->writeLog($warrantyService, $request, 'payment_received', $warrantyService->status, $warrantyService->status, $validated['note'] ?? ('Payment received: ' . $validated['amount']), [
                'amount' => $validated['amount'],
                'payment_method' => $validated['payment_method'] ?? null,
                'transaction_id' => $validated['transaction_id'] ?? null,
            ]);

            return $warrantyService->fresh()->load(['logs.user:id,name,email']);
        });

        return response()->json([
            'success' => true,
            'message' => 'Service payment received successfully.',
            'data' => $job,
        ]);
    }

    public function searchDevices(Request $request)
    {
        if (!Schema::hasTable('device_units')) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $search = trim((string) $request->get('q', ''));

        if (strlen($search) < 2) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $query = DB::table('device_units')
            ->leftJoin('sales', function ($join) {
                if (Schema::hasTable('sales') && Schema::hasColumn('device_units', 'sale_id')) {
                    $join->on('sales.id', '=', 'device_units.sale_id');
                }
            })
            ->leftJoin('customers', function ($join) {
                if (Schema::hasTable('customers') && Schema::hasColumn('sales', 'customer_id')) {
                    $join->on('customers.id', '=', 'sales.customer_id');
                }
            });

        $query->where(function ($q) use ($search) {
            foreach (['imei_1', 'imei_2', 'barcode', 'imei_1_barcode', 'imei_2_barcode', 'product_name', 'sku'] as $column) {
                if (Schema::hasColumn('device_units', $column)) {
                    $q->orWhere("device_units.$column", 'like', "%{$search}%");
                }
            }

            if (Schema::hasTable('sales') && Schema::hasColumn('sales', 'invoice_no')) {
                $q->orWhere('sales.invoice_no', 'like', "%{$search}%");
            }

            if (Schema::hasTable('customers')) {
                foreach (['name', 'phone', 'email'] as $column) {
                    if (Schema::hasColumn('customers', $column)) {
                        $q->orWhere("customers.$column", 'like', "%{$search}%");
                    }
                }
            }
        });

        if (Schema::hasColumn('device_units', 'deleted_at')) {
            $query->whereNull('device_units.deleted_at');
        }

        $rows = $query
            ->select('device_units.id', 'device_units.product_id', 'device_units.branch_id')
            ->when(Schema::hasColumn('device_units', 'sale_item_id'), fn ($q) => $q->addSelect('device_units.sale_item_id'))
            ->when(Schema::hasColumn('device_units', 'product_name'), fn ($q) => $q->addSelect('device_units.product_name'))
            ->when(Schema::hasColumn('device_units', 'sku'), fn ($q) => $q->addSelect('device_units.sku'))
            ->when(Schema::hasColumn('device_units', 'imei_1'), fn ($q) => $q->addSelect('device_units.imei_1'))
            ->when(Schema::hasColumn('device_units', 'imei_2'), fn ($q) => $q->addSelect('device_units.imei_2'))
            ->when(Schema::hasColumn('device_units', 'barcode'), fn ($q) => $q->addSelect('device_units.barcode'))
            ->when(Schema::hasColumn('device_units', 'status'), fn ($q) => $q->addSelect('device_units.status'))
            ->when(Schema::hasColumn('device_units', 'service_status'), fn ($q) => $q->addSelect('device_units.service_status'))
            ->when(Schema::hasTable('sales'), fn ($q) => $q->addSelect('sales.id as sale_id', 'sales.invoice_no'))
            ->when(Schema::hasTable('customers'), fn ($q) => $q->addSelect('customers.id as customer_id', 'customers.name as customer_name', 'customers.phone as customer_phone'))
            ->orderByDesc('device_units.id')
            ->limit(20)
            ->get();

        return response()->json([
            'success' => true,
            'data' => $rows,
        ]);
    }

    private function filteredQuery(Request $request)
    {
        $query = WarrantyServiceJob::query();

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('warranty_type')) {
            $query->where('warranty_type', $request->warranty_type);
        }

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }

        if ($request->filled('assigned_to')) {
            $query->where('assigned_to', $request->assigned_to);
        }

        if ($request->filled('date_from')) {
            $query->whereDate('received_at', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('received_at', '<=', $request->date_to);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                foreach (['job_no', 'customer_name', 'customer_phone', 'product_name', 'imei_1', 'imei_2', 'barcode', 'issue_type', 'issue_description'] as $column) {
                    $q->orWhere($column, 'like', "%{$search}%");
                }
            });
        }

        return $query;
    }

    private function validatePayload(Request $request, bool $creating = true): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'sale_id' => ['nullable', 'integer', 'exists:sales,id'],
            'sale_item_id' => ['nullable', 'integer', 'exists:sale_items,id'],
            'device_unit_id' => ['nullable', 'integer', 'exists:device_units,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'customer_name' => [$required, 'nullable', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'product_name' => ['nullable', 'string', 'max:255'],
            'imei_1' => ['nullable', 'string', 'max:100'],
            'imei_2' => ['nullable', 'string', 'max:100'],
            'barcode' => ['nullable', 'string', 'max:100'],
            'warranty_type' => ['nullable', 'string', Rule::in(['warranty', 'paid_service', 'out_of_warranty', 'replacement_check'])],
            'issue_type' => ['nullable', 'string', 'max:150'],
            'issue_description' => [$required, 'nullable', 'string'],
            'priority' => ['nullable', 'string', Rule::in(['low', 'normal', 'high', 'urgent'])],
            'status' => ['nullable', 'string', Rule::in($this->statuses)],
            'estimated_cost' => ['nullable', 'numeric', 'min:0'],
            'service_charge' => ['nullable', 'numeric', 'min:0'],
            'parts_cost' => ['nullable', 'numeric', 'min:0'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:100'],
            'transaction_id' => ['nullable', 'string', 'max:150'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'expected_delivery_date' => ['nullable', 'date'],
            'technician_note' => ['nullable', 'string'],
            'resolution_note' => ['nullable', 'string'],
            'delivery_note' => ['nullable', 'string'],
            'note' => ['nullable', 'string'],
        ]);
    }

    private function devicePayload(?int $deviceUnitId): array
    {
        if (!$deviceUnitId || !Schema::hasTable('device_units')) {
            return [];
        }

        $device = DB::table('device_units')->where('id', $deviceUnitId)->first();

        if (!$device) {
            return [];
        }

        $sale = null;
        $customer = null;

        if (Schema::hasTable('sales') && isset($device->sale_id) && $device->sale_id) {
            $sale = DB::table('sales')->where('id', $device->sale_id)->first();

            if ($sale && Schema::hasTable('customers') && isset($sale->customer_id) && $sale->customer_id) {
                $customer = DB::table('customers')->where('id', $sale->customer_id)->first();
            }
        }

        return array_filter([
            'branch_id' => $device->branch_id ?? null,
            'product_id' => $device->product_id ?? null,
            'sale_id' => $device->sale_id ?? null,
            'sale_item_id' => $device->sale_item_id ?? null,
            'customer_id' => $customer->id ?? ($sale->customer_id ?? null),
            'customer_name' => $customer->name ?? $sale->customer_name ?? null,
            'customer_phone' => $customer->phone ?? $sale->customer_phone ?? null,
            'product_name' => $device->product_name ?? null,
            'imei_1' => $device->imei_1 ?? null,
            'imei_2' => $device->imei_2 ?? null,
            'barcode' => $device->barcode ?? null,
        ], fn ($value) => $value !== null && $value !== '');
    }

    private function calculateFinancial(array $payload): array
    {
        $serviceCharge = round((float) ($payload['service_charge'] ?? 0), 2);
        $partsCost = round((float) ($payload['parts_cost'] ?? 0), 2);
        $discount = round((float) ($payload['discount_amount'] ?? 0), 2);
        $paid = round((float) ($payload['paid_amount'] ?? 0), 2);
        $total = max(0, round($serviceCharge + $partsCost - $discount, 2));

        return [
            'warranty_type' => $payload['warranty_type'] ?? 'warranty',
            'priority' => $payload['priority'] ?? 'normal',
            'estimated_cost' => round((float) ($payload['estimated_cost'] ?? $total), 2),
            'service_charge' => $serviceCharge,
            'parts_cost' => $partsCost,
            'discount_amount' => $discount,
            'total_amount' => $total,
            'paid_amount' => min($paid, $total),
            'due_amount' => max(0, round($total - min($paid, $total), 2)),
        ];
    }

    private function syncDeviceServiceState(WarrantyServiceJob $job): void
    {
        if (!$job->device_unit_id || !Schema::hasTable('device_units')) {
            return;
        }

        $update = [];
        $columns = Schema::getColumnListing('device_units');

        if (in_array('service_status', $columns, true)) {
            $update['service_status'] = in_array($job->status, ['delivered', 'rejected', 'cancelled'], true)
                ? 'closed'
                : 'in_service';
        }

        if (in_array('latest_service_job_id', $columns, true)) {
            $update['latest_service_job_id'] = $job->id;
        }

        if (!empty($update)) {
            $device = DeviceUnit::query()->lockForUpdate()->find($job->device_unit_id);
            if ($device) {
                $device->forceFill($update)->save();
            }
        }
    }

    private function writeLog(WarrantyServiceJob $job, Request $request, string $action, ?string $fromStatus, ?string $toStatus, ?string $note = null, array $meta = []): void
    {
        if (!Schema::hasTable('warranty_service_job_logs')) {
            return;
        }

        WarrantyServiceJobLog::create([
            'warranty_service_job_id' => $job->id,
            'user_id' => $request->user()?->id,
            'action' => $action,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'note' => $note,
            'meta' => $meta ?: null,
        ]);
    }

    private function makeJobNo(): string
    {
        $prefix = 'SRV-' . now()->format('ymd') . '-';
        $last = WarrantyServiceJob::withTrashed()
            ->where('job_no', 'like', $prefix . '%')
            ->orderByDesc('id')
            ->value('job_no');

        $next = 1;
        if ($last) {
            $next = ((int) substr($last, -4)) + 1;
        }

        return $prefix . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }

    private function emptySummary(): array
    {
        return [
            'total_jobs' => 0,
            'open_jobs' => 0,
            'ready_to_deliver' => 0,
            'delivered' => 0,
            'total_amount' => 0,
            'paid_amount' => 0,
            'due_amount' => 0,
            'status_counts' => [],
        ];
    }
}
