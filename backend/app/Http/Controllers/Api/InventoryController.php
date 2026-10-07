<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BranchStock;
use App\Models\DeviceUnit;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use App\Services\AccessControlService;
use App\Services\ReleaseScopeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class InventoryController extends Controller
{
    private const COUNTED_DEVICE_STATUSES = ['available', 'reserved', 'booked'];
    private const ALLOWED_DEVICE_STATUSES = [
        'available', 'reserved', 'booked', 'returned', 'supplier_return', 'damaged',
        'warranty_claim', 'in_service', 'service_completed', 'transferred', 'lost', 'inactive',
    ];

    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly ReleaseScopeService $releaseScope,
    ) {
    }

    public function overview(Request $request): JsonResponse
    {
        $this->assertCoreTables();
        $stockRows = $this->stockRows($request);
        $deviceRows = $this->deviceRows($request);
        $issues = $this->collectIssues($request, $stockRows, $deviceRows);

        $statusCounts = $deviceRows->groupBy(fn ($row) => (string) ($row->status ?? 'unknown'))
            ->map(fn ($rows) => $rows->count());

        $availableStock = $stockRows->sum(fn ($row) => max(0, (int) $row->quantity - (int) $row->reserved_quantity));
        $thresholdCount = $stockRows->filter(fn ($row) => max(0, (int) $row->quantity - (int) $row->reserved_quantity) <= (int) $row->threshold)->count();

        $transferQuery = DB::table('stock_transfer_requests');
        $this->scopeTransferQuery($request, $transferQuery);
        $transferCounts = $transferQuery
            ->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        $canSeeCost = $this->accessControl->canViewPurchasePrice($request->user());
        $stockValue = null;
        if ($canSeeCost && Schema::hasColumn('device_units', 'purchase_cost')) {
            $stockValue = round((float) $deviceRows
                ->filter(fn ($row) => in_array((string) ($row->status ?? ''), self::COUNTED_DEVICE_STATUSES, true))
                ->sum(fn ($row) => (float) ($row->purchase_cost ?? 0)), 2);
        }

        return response()->json([
            'status' => true,
            'data' => [
                'summary' => [
                    'branch_stock_rows' => $stockRows->count(),
                    'total_quantity' => (int) $stockRows->sum('quantity'),
                    'reserved_quantity' => (int) $stockRows->sum('reserved_quantity'),
                    'available_quantity' => (int) $availableStock,
                    'low_stock_rows' => $thresholdCount,
                    'negative_rows' => $stockRows->where('quantity', '<', 0)->count(),
                    'device_units' => $deviceRows->count(),
                    'available_devices' => (int) ($statusCounts['available'] ?? 0),
                    'reserved_devices' => (int) (($statusCounts['reserved'] ?? 0) + ($statusCounts['booked'] ?? 0)),
                    'service_devices' => (int) (($statusCounts['in_service'] ?? 0) + ($statusCounts['warranty_claim'] ?? 0)),
                    'damaged_devices' => (int) ($statusCounts['damaged'] ?? 0),
                    'lost_devices' => (int) ($statusCounts['lost'] ?? 0),
                    'in_transit_transfers' => (int) ($transferCounts['assigned'] ?? 0),
                    'pending_transfers' => (int) (($transferCounts['pending'] ?? 0) + ($transferCounts['approved'] ?? 0)),
                    'reconciliation_issues' => count($issues),
                    'available_stock_value' => $stockValue,
                    'can_see_purchase_cost' => $canSeeCost,
                ],
                'device_status_counts' => $statusCounts,
                'transfer_status_counts' => $transferCounts,
                'branches' => $this->branchSummaries($stockRows, $deviceRows),
                'low_stock' => $this->lowStockRows($stockRows)->take(12)->values(),
                'recent_movements' => $this->movementRows($request, 12),
                'reconciliation' => $this->issueSummary($issues),
            ],
        ]);
    }

    public function branches(Request $request): JsonResponse
    {
        $this->assertCoreTables();
        return response()->json([
            'status' => true,
            'data' => $this->branchSummaries($this->stockRows($request), $this->deviceRows($request)),
        ]);
    }

    public function lowStock(Request $request): JsonResponse
    {
        $this->assertCoreTables();
        $rows = $this->lowStockRows($this->stockRows($request));

        if ($request->filled('search')) {
            $search = mb_strtolower(trim((string) $request->input('search')));
            $rows = $rows->filter(function ($row) use ($search) {
                return str_contains(mb_strtolower((string) ($row['product_name'] ?? '')), $search)
                    || str_contains(mb_strtolower((string) ($row['sku'] ?? '')), $search)
                    || str_contains(mb_strtolower((string) ($row['branch_name'] ?? '')), $search);
            });
        }

        return response()->json(['status' => true, 'data' => $rows->values()]);
    }

    public function movements(Request $request): JsonResponse
    {
        $this->assertCoreTables();
        $query = DB::table('stock_movements as sm')
            ->leftJoin('branches as b', 'b.id', '=', 'sm.branch_id')
            ->leftJoin('products as p', 'p.id', '=', 'sm.product_id')
            ->leftJoin('product_variants as pv', 'pv.id', '=', 'sm.product_variant_id')
            ->select([
                'sm.*', 'b.name as branch_name', 'b.code as branch_code',
                'p.name as product_name', 'p.sku as product_sku',
                'pv.variant_name', 'pv.sku as variant_sku',
            ]);

        $this->scopeBranchColumn($request, $query, 'sm.branch_id');

        foreach (['branch_id', 'product_id', 'type', 'reference_type'] as $field) {
            if ($request->filled($field)) {
                $query->where('sm.' . $field, $request->input($field));
            }
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('sm.movement_no', 'like', "%{$search}%")
                    ->orWhere('sm.note', 'like', "%{$search}%")
                    ->orWhere('p.name', 'like', "%{$search}%")
                    ->orWhere('p.sku', 'like', "%{$search}%");
            });
        }

        $orderColumn = Schema::hasColumn('stock_movements', 'movement_at') ? 'sm.movement_at' : 'sm.id';

        return response()->json([
            'status' => true,
            'data' => $query->orderByDesc($orderColumn)->paginate(min(100, max(10, (int) $request->input('per_page', 30)))),
        ]);
    }

    public function reconciliation(Request $request): JsonResponse
    {
        $this->assertCoreTables();
        $issues = $this->collectIssues($request, $this->stockRows($request), $this->deviceRows($request));

        return response()->json([
            'status' => true,
            'data' => [
                'summary' => $this->issueSummary($issues),
                'issues' => $issues,
                'safe_fixable' => collect($issues)->whereIn('type', ['reserved_exceeds_quantity', 'invalid_stock_status', 'invalid_threshold'])->count(),
            ],
        ]);
    }

    public function reconcile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mode' => ['required', Rule::in(['dry_run', 'apply_safe_fixes'])],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        if ($validated['mode'] === 'apply_safe_fixes') {
            abort_unless($this->accessControl->isSuperAdmin($request->user()), 403, 'Only Super Admin can apply inventory reconciliation fixes.');
        }

        $this->assertCoreTables();
        $beforeIssues = $this->collectIssues($request, $this->stockRows($request), $this->deviceRows($request));
        $fixed = 0;

        if ($validated['mode'] === 'apply_safe_fixes') {
            DB::transaction(function () use ($request, $beforeIssues, &$fixed) {
                foreach ($beforeIssues as $issue) {
                    if (($issue['type'] ?? '') === 'reserved_exceeds_quantity' && ! empty($issue['branch_stock_id'])) {
                        $stock = BranchStock::query()->lockForUpdate()->find($issue['branch_stock_id']);
                        if ($stock && (int) $stock->reserved_quantity > max(0, (int) $stock->quantity)) {
                            $stock->update([
                                'reserved_quantity' => max(0, (int) $stock->quantity),
                                'last_reconciled_at' => now(),
                                'last_reconciled_by' => $request->user()?->id,
                            ]);
                            $fixed++;
                        }
                    }
                    if (($issue['type'] ?? '') === 'invalid_stock_status' && ! empty($issue['branch_stock_id'])) {
                        $stock = BranchStock::query()->lockForUpdate()->find($issue['branch_stock_id']);
                        if ($stock && ! in_array((string) $stock->status, ['active', 'inactive'], true)) {
                            $stock->update([
                                'status' => 'active',
                                'last_reconciled_at' => now(),
                                'last_reconciled_by' => $request->user()?->id,
                            ]);
                            $fixed++;
                        }
                    }
                    if (($issue['type'] ?? '') === 'invalid_threshold' && ! empty($issue['branch_stock_id'])) {
                        $stock = BranchStock::query()->lockForUpdate()->find($issue['branch_stock_id']);
                        if ($stock && (int) ($stock->alert_quantity ?: $stock->low_stock_alert) < 0) {
                            $stock->update([
                                'low_stock_alert' => 0,
                                'alert_quantity' => 0,
                                'last_reconciled_at' => now(),
                                'last_reconciled_by' => $request->user()?->id,
                            ]);
                            $fixed++;
                        }
                    }
                }
            });
        }

        $afterIssues = $this->collectIssues($request, $this->stockRows($request), $this->deviceRows($request));
        $runNo = 'REC-' . now()->format('Ymd-His') . '-' . strtoupper(Str::random(4));

        if (Schema::hasTable('inventory_reconciliations')) {
            DB::table('inventory_reconciliations')->insert([
                'run_no' => $runNo,
                'mode' => $validated['mode'],
                'status' => 'completed',
                'issues_found' => count($beforeIssues),
                'issues_fixed' => $fixed,
                'summary' => json_encode($this->issueSummary($afterIssues)),
                'details' => json_encode([
                    'note' => $validated['note'] ?? null,
                    'remaining_issues' => $afterIssues,
                ]),
                'created_by' => $request->user()?->id,
                'completed_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json([
            'status' => true,
            'message' => $validated['mode'] === 'dry_run'
                ? 'Inventory reconciliation dry run completed.'
                : 'Safe inventory reconciliation fixes applied.',
            'data' => [
                'run_no' => $runNo,
                'mode' => $validated['mode'],
                'issues_found' => count($beforeIssues),
                'issues_fixed' => $fixed,
                'remaining_issues' => count($afterIssues),
                'summary' => $this->issueSummary($afterIssues),
                'issues' => $afterIssues,
            ],
        ]);
    }

    public function updateThreshold(Request $request, BranchStock $branchStock): JsonResponse
    {
        $this->ensureBranchAccess($request, (int) $branchStock->branch_id);
        $validated = $request->validate([
            'alert_quantity' => ['required', 'integer', 'min:0', 'max:1000000'],
            'shelf_location' => ['nullable', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $branchStock->update([
            'low_stock_alert' => $validated['alert_quantity'],
            'alert_quantity' => $validated['alert_quantity'],
            'shelf_location' => $validated['shelf_location'] ?? $branchStock->shelf_location,
            'note' => $validated['note'] ?? $branchStock->note,
            'last_counted_at' => now(),
            'last_counted_by' => $request->user()?->id,
        ]);

        return response()->json(['status' => true, 'message' => 'Inventory threshold updated.', 'data' => $branchStock->fresh()]);
    }

    public function updateDeviceStatus(Request $request, DeviceUnit $deviceUnit): JsonResponse
    {
        $validated = $request->validate([
            'status' => ['required', Rule::in(self::ALLOWED_DEVICE_STATUSES)],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'note' => ['required', 'string', 'max:1000'],
        ]);

        abort_if($validated['status'] === 'sold', 422, 'Sold status can only be assigned through a completed sale.');
        $oldBranchId = $deviceUnit->branch_id ? (int) $deviceUnit->branch_id : null;
        $newBranchId = array_key_exists('branch_id', $validated) && $validated['branch_id'] !== null
            ? (int) $validated['branch_id']
            : $oldBranchId;

        if ($oldBranchId) {
            $this->ensureBranchAccess($request, $oldBranchId);
        } elseif (! $this->accessControl->isSuperAdmin($request->user())) {
            abort(403, 'Prime stock device status can be changed only by Super Admin.');
        }
        if ($newBranchId) {
            $this->ensureBranchAccess($request, $newBranchId);
        }

        $updated = DB::transaction(function () use ($request, $deviceUnit, $validated, $oldBranchId, $newBranchId) {
            $unit = DeviceUnit::query()->whereKey($deviceUnit->id)->lockForUpdate()->firstOrFail();
            $oldStatus = (string) $unit->status;
            $newStatus = (string) $validated['status'];
            $oldCounted = in_array($oldStatus, self::COUNTED_DEVICE_STATUSES, true);
            $newCounted = in_array($newStatus, self::COUNTED_DEVICE_STATUSES, true);

            if ($oldCounted && (! $newCounted || $oldBranchId !== $newBranchId)) {
                $this->adjustBranchStock($oldBranchId, (int) $unit->product_id, $unit->product_variant_id ? (int) $unit->product_variant_id : null, -1, $request, 'device_status_out', $unit->id, $validated['note']);
            }
            if ($newCounted && (! $oldCounted || $oldBranchId !== $newBranchId)) {
                $this->adjustBranchStock($newBranchId, (int) $unit->product_id, $unit->product_variant_id ? (int) $unit->product_variant_id : null, 1, $request, 'device_status_in', $unit->id, $validated['note']);
            }
            if ($oldCounted !== $newCounted) {
                $this->adjustAggregateStock((int) $unit->product_id, $unit->product_variant_id ? (int) $unit->product_variant_id : null, $newCounted ? 1 : -1);
            }

            $serviceStatus = match ($newStatus) {
                'in_service' => 'under_service',
                'warranty_claim' => 'warranty_claim',
                'service_completed' => 'service_completed',
                default => $unit->service_status,
            };

            $unit->update([
                'status' => $newStatus,
                'branch_id' => $newBranchId,
                'service_status' => $serviceStatus,
                'updated_by' => $request->user()?->id,
                'note' => trim(($unit->note ? $unit->note . "\n" : '') . '[Inventory status] ' . $oldStatus . ' → ' . $newStatus . ': ' . $validated['note']),
            ]);

            return $unit->fresh();
        });

        return response()->json(['status' => true, 'message' => 'Device inventory status updated.', 'data' => $updated]);
    }

    private function assertCoreTables(): void
    {
        foreach (['branch_stocks', 'device_units', 'stock_movements', 'stock_transfer_requests'] as $table) {
            abort_unless(Schema::hasTable($table), 503, "Required inventory table is missing: {$table}");
        }
    }

    private function stockRows(Request $request)
    {
        $query = DB::table('branch_stocks as bs')
            ->leftJoin('branches as b', 'b.id', '=', 'bs.branch_id')
            ->leftJoin('products as p', 'p.id', '=', 'bs.product_id')
            ->leftJoin('product_variants as pv', 'pv.id', '=', 'bs.product_variant_id')
            ->select([
                'bs.*', 'b.name as branch_name', 'b.code as branch_code',
                'p.name as product_name', 'p.sku as product_sku', 'p.barcode as product_barcode',
                'pv.variant_name', 'pv.sku as variant_sku', 'pv.barcode as variant_barcode',
                DB::raw('COALESCE(bs.alert_quantity, bs.low_stock_alert, 0) as threshold'),
            ]);
        $this->scopeBranchColumn($request, $query, 'bs.branch_id');
        return $query->get();
    }

    private function deviceRows(Request $request)
    {
        $query = DB::table('device_units')->whereNull('deleted_at');
        $this->scopeBranchColumn($request, $query, 'branch_id', true);
        return $query->get();
    }

    private function lowStockRows($stockRows)
    {
        return $stockRows
            ->filter(function ($row) {
                $available = max(0, (int) $row->quantity - (int) $row->reserved_quantity);
                return $available <= (int) $row->threshold;
            })
            ->sortBy(fn ($row) => max(0, (int) $row->quantity - (int) $row->reserved_quantity))
            ->map(function ($row) {
                return [
                    'id' => $row->id,
                    'branch_id' => $row->branch_id,
                    'branch_name' => $row->branch_name,
                    'branch_code' => $row->branch_code,
                    'product_id' => $row->product_id,
                    'product_variant_id' => $row->product_variant_id,
                    'product_name' => $row->product_name,
                    'variant_name' => $row->variant_name,
                    'sku' => $row->variant_sku ?: $row->product_sku,
                    'quantity' => (int) $row->quantity,
                    'reserved_quantity' => (int) $row->reserved_quantity,
                    'available_quantity' => max(0, (int) $row->quantity - (int) $row->reserved_quantity),
                    'threshold' => (int) $row->threshold,
                    'shelf_location' => $row->shelf_location,
                    'status' => $row->status,
                ];
            });
    }

    private function branchSummaries($stockRows, $deviceRows): array
    {
        $deviceByBranch = $deviceRows->groupBy(fn ($row) => (string) ($row->branch_id ?? 'prime'));

        return $stockRows->groupBy('branch_id')->map(function ($rows, $branchId) use ($deviceByBranch) {
            $devices = $deviceByBranch->get((string) $branchId, collect());
            return [
                'branch_id' => (int) $branchId,
                'branch_name' => $rows->first()->branch_name,
                'branch_code' => $rows->first()->branch_code,
                'stock_rows' => $rows->count(),
                'quantity' => (int) $rows->sum('quantity'),
                'reserved_quantity' => (int) $rows->sum('reserved_quantity'),
                'available_quantity' => (int) $rows->sum(fn ($row) => max(0, (int) $row->quantity - (int) $row->reserved_quantity)),
                'low_stock_rows' => $rows->filter(fn ($row) => max(0, (int) $row->quantity - (int) $row->reserved_quantity) <= (int) $row->threshold)->count(),
                'serialized_devices' => $devices->count(),
                'available_devices' => $devices->where('status', 'available')->count(),
                'reserved_devices' => $devices->whereIn('status', ['reserved', 'booked'])->count(),
                'service_devices' => $devices->whereIn('status', ['in_service', 'warranty_claim'])->count(),
            ];
        })->values()->all();
    }

    private function movementRows(Request $request, int $limit): array
    {
        $query = DB::table('stock_movements as sm')
            ->leftJoin('branches as b', 'b.id', '=', 'sm.branch_id')
            ->leftJoin('products as p', 'p.id', '=', 'sm.product_id')
            ->select('sm.*', 'b.name as branch_name', 'p.name as product_name');
        $this->scopeBranchColumn($request, $query, 'sm.branch_id');
        $orderColumn = Schema::hasColumn('stock_movements', 'movement_at') ? 'sm.movement_at' : 'sm.id';
        return $query->orderByDesc($orderColumn)->limit($limit)->get()->all();
    }

    private function collectIssues(Request $request, $stockRows, $deviceRows): array
    {
        $issues = [];
        $deviceCounts = $deviceRows
            ->filter(fn ($row) => in_array((string) ($row->status ?? ''), self::COUNTED_DEVICE_STATUSES, true) && ! empty($row->branch_id) && ! empty($row->product_id))
            ->groupBy(fn ($row) => implode(':', [(int) $row->branch_id, (int) $row->product_id, (int) ($row->product_variant_id ?? 0)]))
            ->map->count();

        foreach ($stockRows as $row) {
            if ((int) $row->quantity < 0) {
                $issues[] = $this->issue('negative_stock', 'critical', 'Branch stock quantity is negative.', $row);
            }
            if ((int) $row->reserved_quantity > max(0, (int) $row->quantity)) {
                $issues[] = $this->issue('reserved_exceeds_quantity', 'high', 'Reserved quantity exceeds stock quantity.', $row);
            }
            if (! in_array((string) $row->status, ['active', 'inactive'], true)) {
                $issues[] = $this->issue('invalid_stock_status', 'medium', 'Branch stock status is invalid.', $row);
            }
            if ((int) $row->threshold < 0) {
                $issues[] = $this->issue('invalid_threshold', 'medium', 'Low-stock threshold cannot be negative.', $row);
            }

            $key = implode(':', [(int) $row->branch_id, (int) $row->product_id, (int) ($row->product_variant_id ?? 0)]);
            $serializedCount = (int) ($deviceCounts[$key] ?? 0);
            if ($serializedCount > 0 && $serializedCount !== (int) $row->quantity) {
                $issues[] = $this->issue('serialized_stock_drift', 'high', 'Branch quantity does not match counted serialized devices.', $row, [
                    'serialized_count' => $serializedCount,
                    'difference' => (int) $row->quantity - $serializedCount,
                ]);
            }
        }

        $validProductIds = DB::table('products')->pluck('id')->map(fn ($id) => (int) $id)->flip();
        $validBranchIds = DB::table('branches')->pluck('id')->map(fn ($id) => (int) $id)->flip();
        foreach ($deviceRows as $device) {
            if (! empty($device->product_id) && ! $validProductIds->has((int) $device->product_id)) {
                $issues[] = [
                    'type' => 'orphan_device_product', 'severity' => 'critical',
                    'message' => 'Device unit references a missing product.', 'device_unit_id' => $device->id,
                    'imei' => $device->imei_1, 'barcode' => $device->barcode,
                ];
            }
            if (! empty($device->branch_id) && ! $validBranchIds->has((int) $device->branch_id)) {
                $issues[] = [
                    'type' => 'orphan_device_branch', 'severity' => 'critical',
                    'message' => 'Device unit references a missing branch.', 'device_unit_id' => $device->id,
                    'imei' => $device->imei_1, 'barcode' => $device->barcode,
                ];
            }
        }

        foreach (['imei_1', 'imei_2'] as $imeiColumn) {
            $duplicates = $deviceRows->filter(fn ($row) => ! empty($row->{$imeiColumn}) && in_array((string) ($row->status ?? ''), self::COUNTED_DEVICE_STATUSES, true))
                ->groupBy(fn ($row) => trim((string) $row->{$imeiColumn}))
                ->filter(fn ($rows) => $rows->count() > 1);
            foreach ($duplicates as $imei => $rows) {
                $issues[] = [
                    'type' => 'duplicate_active_imei', 'severity' => 'critical',
                    'message' => 'The same active IMEI is attached to more than one stock device.',
                    'imei' => $imei, 'device_unit_ids' => $rows->pluck('id')->values()->all(),
                ];
            }
        }

        return $issues;
    }

    private function issue(string $type, string $severity, string $message, object $row, array $extra = []): array
    {
        return $extra + [
            'type' => $type,
            'severity' => $severity,
            'message' => $message,
            'branch_stock_id' => $row->id,
            'branch_id' => $row->branch_id,
            'branch_name' => $row->branch_name,
            'product_id' => $row->product_id,
            'product_name' => $row->product_name,
            'product_variant_id' => $row->product_variant_id,
            'variant_name' => $row->variant_name,
            'quantity' => (int) $row->quantity,
            'reserved_quantity' => (int) $row->reserved_quantity,
        ];
    }

    private function issueSummary(array $issues): array
    {
        $collection = collect($issues);
        return [
            'total' => $collection->count(),
            'critical' => $collection->where('severity', 'critical')->count(),
            'high' => $collection->where('severity', 'high')->count(),
            'medium' => $collection->where('severity', 'medium')->count(),
            'by_type' => $collection->groupBy('type')->map->count(),
        ];
    }

    private function scopeBranchColumn(Request $request, $query, string $column, bool $includePrimeForSuperAdmin = false): void
    {
        if ($this->accessControl->isSuperAdmin($request->user()) || $this->releaseScope->allowsAll($request)) {
            return;
        }
        $ids = $this->releaseScope->branchIds($request);
        $query->whereIn($column, $ids ?: [-1]);
    }

    private function scopeTransferQuery(Request $request, $query): void
    {
        if ($this->accessControl->isSuperAdmin($request->user()) || $this->releaseScope->allowsAll($request)) {
            return;
        }
        $ids = $this->releaseScope->branchIds($request) ?: [-1];
        $query->where(function ($q) use ($ids) {
            $q->whereIn('from_branch_id', $ids)->orWhereIn('to_branch_id', $ids);
        });
    }

    private function ensureBranchAccess(Request $request, int $branchId): void
    {
        if ($this->accessControl->isSuperAdmin($request->user())) {
            return;
        }
        $this->releaseScope->assertBranch($request, $branchId, 'This branch is outside your inventory scope.');
    }

    private function adjustBranchStock(?int $branchId, int $productId, ?int $variantId, int $delta, Request $request, string $type, int $deviceUnitId, string $note): void
    {
        if (! $branchId) {
            return;
        }

        $stock = BranchStock::query()
            ->where('branch_id', $branchId)
            ->where('product_id', $productId)
            ->where(function ($q) use ($variantId) {
                $variantId ? $q->where('product_variant_id', $variantId) : $q->whereNull('product_variant_id');
            })
            ->lockForUpdate()
            ->first();

        if (! $stock) {
            abort_if($delta < 0, 422, 'Branch stock row does not exist for this device.');
            $stock = BranchStock::create([
                'branch_id' => $branchId,
                'product_id' => $productId,
                'product_variant_id' => $variantId,
                'quantity' => 0,
                'reserved_quantity' => 0,
                'low_stock_alert' => 5,
                'alert_quantity' => 5,
                'status' => 'active',
            ]);
            $stock = BranchStock::query()->whereKey($stock->id)->lockForUpdate()->firstOrFail();
        }

        $before = (int) $stock->quantity;
        $after = $before + $delta;
        abort_if($after < 0, 422, 'Device status change would make branch stock negative.');
        $stock->update(['quantity' => $after]);

        StockMovement::create([
            'movement_no' => $this->movementNo(),
            'branch_id' => $branchId,
            'product_id' => $productId,
            'product_variant_id' => $variantId,
            'user_id' => $request->user()?->id,
            'type' => $type,
            'quantity_change' => $delta,
            'quantity_before' => $before,
            'quantity_after' => $after,
            'reference_type' => 'device_unit',
            'reference_id' => $deviceUnitId,
            'note' => $note,
            'movement_at' => now(),
        ]);
    }

    private function adjustAggregateStock(int $productId, ?int $variantId, int $delta): void
    {
        $product = Product::query()->whereKey($productId)->lockForUpdate()->firstOrFail();
        $next = max(0, (int) ($product->stock_quantity ?? 0) + $delta);
        $product->forceFill(['stock_quantity' => $next, 'status' => $next > 0 ? 'active' : 'out_of_stock'])->save();

        if ($variantId) {
            $variant = ProductVariant::query()->whereKey($variantId)->lockForUpdate()->first();
            if ($variant) {
                $variant->forceFill(['stock_quantity' => max(0, (int) ($variant->stock_quantity ?? 0) + $delta)])->save();
            }
        }
    }

    private function movementNo(): string
    {
        do {
            $no = 'SM-' . now()->format('ymd') . '-' . strtoupper(Str::random(7));
        } while (StockMovement::query()->where('movement_no', $no)->exists());
        return $no;
    }
}
