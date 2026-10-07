<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BranchStock;
use App\Models\DeviceUnit;
use App\Models\StockMovement;
use App\Models\StockTransferRequest;
use App\Models\StockTransferRequestItem;
use App\Services\AccessControlService;
use App\Services\ReleaseScopeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class StockTransferRequestController extends Controller
{
    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly ReleaseScopeService $releaseScope,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = StockTransferRequest::with([
            'fromBranch:id,name,code', 'toBranch:id,name,code', 'requestedBy:id,name',
            'approvedBy:id,name', 'items.product:id,name,sku', 'items.variant:id,variant_name,sku',
        ])->latest('id');

        $this->scopeTransferQuery($request, $query);

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('branch_id')) {
            $branchId = (int) $request->input('branch_id');
            $query->where(fn ($q) => $q->where('to_branch_id', $branchId)->orWhere('from_branch_id', $branchId));
        }
        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('request_no', 'like', "%{$search}%")
                    ->orWhere('request_note', 'like', "%{$search}%")
                    ->orWhere('admin_note', 'like', "%{$search}%");
            });
        }

        $result = $query->paginate(min(100, max(10, (int) $request->input('per_page', 30))));
        $result->getCollection()->transform(fn ($transfer) => $this->appendDeviceSummary($transfer));

        return response()->json(['status' => true, 'message' => 'Stock transfer requests fetched successfully.', 'data' => $result]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'from_branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'to_branch_id' => ['required', 'integer', 'exists:branches,id'],
            'request_note' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.product_variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'items.*.requested_quantity' => ['required', 'integer', 'min:1'],
            'items.*.note' => ['nullable', 'string', 'max:1000'],
        ]);

        abort_if(! empty($validated['from_branch_id']) && (int) $validated['from_branch_id'] === (int) $validated['to_branch_id'], 422, 'Source and destination branches must be different.');
        $this->ensureBranchAccess($request, (int) $validated['to_branch_id']);
        if (! empty($validated['from_branch_id']) && ! $this->accessControl->isSuperAdmin($request->user())) {
            $this->ensureBranchAccess($request, (int) $validated['from_branch_id']);
        }

        $transfer = DB::transaction(function () use ($request, $validated) {
            $transfer = StockTransferRequest::create([
                'request_no' => $this->requestNo(),
                'from_branch_id' => $validated['from_branch_id'] ?? null,
                'to_branch_id' => $validated['to_branch_id'],
                'requested_by' => $request->user()?->id,
                'status' => 'pending',
                'request_note' => $validated['request_note'] ?? null,
                'requested_at' => now(),
            ]);

            foreach ($validated['items'] as $item) {
                StockTransferRequestItem::create([
                    'stock_transfer_request_id' => $transfer->id,
                    'product_id' => $item['product_id'],
                    'product_variant_id' => $item['product_variant_id'] ?? null,
                    'requested_quantity' => $item['requested_quantity'],
                    'approved_quantity' => 0,
                    'assigned_quantity' => 0,
                    'received_quantity' => 0,
                    'source_quantity_snapshot' => 0,
                    'in_transit_quantity' => 0,
                    'note' => $item['note'] ?? null,
                ]);
            }

            return $transfer;
        });

        return response()->json(['status' => true, 'message' => 'Stock transfer request created successfully.', 'data' => $this->loadTransfer($transfer)], 201);
    }

    public function show(Request $request, StockTransferRequest $stockTransferRequest): JsonResponse
    {
        $this->ensureTransferAccess($request, $stockTransferRequest);
        return response()->json(['status' => true, 'message' => 'Stock transfer request fetched successfully.', 'data' => $this->loadTransfer($stockTransferRequest)]);
    }

    public function approve(Request $request, StockTransferRequest $stockTransferRequest): JsonResponse
    {
        $validated = $request->validate([
            'admin_note' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.id' => ['required', 'integer', 'exists:stock_transfer_request_items,id'],
            'items.*.approved_quantity' => ['required', 'integer', 'min:0'],
        ]);

        abort_unless($stockTransferRequest->status === 'pending', 422, 'Only pending requests can be approved.');

        $updated = DB::transaction(function () use ($request, $validated, $stockTransferRequest) {
            $transfer = StockTransferRequest::query()->whereKey($stockTransferRequest->id)->lockForUpdate()->firstOrFail();
            abort_unless($transfer->status === 'pending', 422, 'This transfer has already been processed.');

            $items = $transfer->items()->lockForUpdate()->get()->keyBy('id');
            $approvedTotal = 0;
            foreach ($validated['items'] as $payload) {
                $item = $items->get((int) $payload['id']);
                abort_unless($item, 422, 'An approval item does not belong to this transfer request.');
                $approved = (int) $payload['approved_quantity'];
                abort_if($approved > (int) $item->requested_quantity, 422, 'Approved quantity cannot exceed requested quantity.');
                $item->update(['approved_quantity' => $approved]);
                $approvedTotal += $approved;
            }
            abort_if($approvedTotal < 1, 422, 'At least one item must be approved.');

            $transfer->update([
                'status' => 'approved',
                'approved_by' => $request->user()?->id,
                'admin_note' => $validated['admin_note'] ?? null,
                'approved_at' => now(),
            ]);
            return $transfer;
        });

        return response()->json(['status' => true, 'message' => 'Stock transfer request approved successfully.', 'data' => $this->loadTransfer($updated)]);
    }

    public function reject(Request $request, StockTransferRequest $stockTransferRequest): JsonResponse
    {
        $validated = $request->validate(['admin_note' => ['required', 'string', 'max:2000']]);
        abort_unless(in_array($stockTransferRequest->status, ['pending', 'approved'], true), 422, 'This request cannot be rejected now.');

        $stockTransferRequest->update([
            'status' => 'rejected',
            'approved_by' => $request->user()?->id,
            'admin_note' => $validated['admin_note'],
            'cancelled_at' => now(),
        ]);

        return response()->json(['status' => true, 'message' => 'Stock transfer request rejected.', 'data' => $this->loadTransfer($stockTransferRequest)]);
    }

    public function assign(Request $request, StockTransferRequest $stockTransferRequest): JsonResponse
    {
        $validated = $request->validate([
            'dispatch_note' => ['nullable', 'string', 'max:2000'],
            'items' => ['nullable', 'array'],
            'items.*.id' => ['required_with:items', 'integer', 'exists:stock_transfer_request_items,id'],
            'items.*.device_unit_ids' => ['nullable', 'array'],
            'items.*.device_unit_ids.*' => ['integer', 'exists:device_units,id'],
        ]);

        abort_unless($stockTransferRequest->status === 'approved', 422, 'Only approved requests can be assigned.');
        $deviceMap = collect($validated['items'] ?? [])->keyBy(fn ($row) => (int) $row['id']);

        $updated = DB::transaction(function () use ($request, $stockTransferRequest, $validated, $deviceMap) {
            $transfer = StockTransferRequest::query()->whereKey($stockTransferRequest->id)->lockForUpdate()->firstOrFail();
            abort_unless($transfer->status === 'approved', 422, 'This transfer has already been dispatched.');
            $items = $transfer->items()->lockForUpdate()->get();
            $assignedTotal = 0;

            foreach ($items as $item) {
                $quantity = (int) $item->approved_quantity;
                if ($quantity < 1) {
                    continue;
                }

                $sourceBefore = 0;
                if ($transfer->from_branch_id) {
                    $sourceBefore = $this->decreaseSourceStock($transfer, $item, $quantity, $request->user()?->id);
                }

                $selectedDeviceIds = collect(data_get($deviceMap->get((int) $item->id), 'device_unit_ids', []))
                    ->map(fn ($id) => (int) $id)->unique()->values();
                abort_if($selectedDeviceIds->count() > $quantity, 422, 'Selected device count cannot exceed assigned quantity.');

                foreach ($selectedDeviceIds as $deviceId) {
                    $unit = DeviceUnit::query()->whereKey($deviceId)->lockForUpdate()->firstOrFail();
                    abort_unless((int) $unit->product_id === (int) $item->product_id, 422, 'Selected device does not belong to the transfer product.');
                    if ($item->product_variant_id) {
                        abort_unless((int) $unit->product_variant_id === (int) $item->product_variant_id, 422, 'Selected device does not belong to the transfer variant.');
                    }
                    if ($transfer->from_branch_id) {
                        abort_unless((int) $unit->branch_id === (int) $transfer->from_branch_id, 422, 'Selected device is not in the source branch.');
                    } else {
                        abort_unless(empty($unit->branch_id), 422, 'Prime-stock transfer device must not already belong to a branch.');
                    }
                    abort_unless(in_array((string) $unit->status, ['available', 'reserved', 'booked'], true), 422, 'Selected device is not transferable from its current status.');

                    DB::table('stock_transfer_device_units')->insert([
                        'stock_transfer_request_id' => $transfer->id,
                        'stock_transfer_request_item_id' => $item->id,
                        'device_unit_id' => $unit->id,
                        'from_branch_id' => $transfer->from_branch_id,
                        'to_branch_id' => $transfer->to_branch_id,
                        'status' => 'assigned',
                        'assigned_by' => $request->user()?->id,
                        'assigned_at' => now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $unit->update([
                        'status' => 'transferred',
                        'updated_by' => $request->user()?->id,
                        'note' => trim(($unit->note ? $unit->note . "\n" : '') . 'In transit under ' . $transfer->request_no),
                    ]);
                }

                $item->update([
                    'source_quantity_snapshot' => $sourceBefore,
                    'assigned_quantity' => $quantity,
                    'in_transit_quantity' => $quantity,
                ]);
                $assignedTotal += $quantity;
            }

            abort_if($assignedTotal < 1, 422, 'No approved quantity is available to assign.');
            $transfer->update([
                'status' => 'assigned',
                'assigned_at' => now(),
                'dispatched_by' => $request->user()?->id,
                'dispatch_note' => $validated['dispatch_note'] ?? null,
            ]);
            return $transfer;
        });

        return response()->json(['status' => true, 'message' => 'Stock dispatched and marked in transit. Destination stock will increase only after receiving.', 'data' => $this->loadTransfer($updated)]);
    }

    public function receive(Request $request, StockTransferRequest $stockTransferRequest): JsonResponse
    {
        $validated = $request->validate(['receive_note' => ['nullable', 'string', 'max:2000']]);
        abort_unless($stockTransferRequest->status === 'assigned', 422, 'Only in-transit stock can be received.');
        $this->ensureBranchAccess($request, (int) $stockTransferRequest->to_branch_id);

        $updated = DB::transaction(function () use ($request, $stockTransferRequest, $validated) {
            $transfer = StockTransferRequest::query()->whereKey($stockTransferRequest->id)->lockForUpdate()->firstOrFail();
            abort_unless($transfer->status === 'assigned', 422, 'This transfer has already been received.');
            $items = $transfer->items()->lockForUpdate()->get();

            foreach ($items as $item) {
                $quantity = (int) $item->in_transit_quantity;
                if ($quantity < 1) {
                    continue;
                }
                $this->increaseDestinationStock($transfer, $item, $quantity, $request->user()?->id);
                $item->update(['received_quantity' => $quantity, 'in_transit_quantity' => 0]);
            }

            if (Schema::hasTable('stock_transfer_device_units')) {
                $links = DB::table('stock_transfer_device_units')
                    ->where('stock_transfer_request_id', $transfer->id)
                    ->where('status', 'assigned')
                    ->lockForUpdate()
                    ->get();
                foreach ($links as $link) {
                    $device = DeviceUnit::query()->whereKey($link->device_unit_id)->lockForUpdate()->first();
                    if ($device) {
                        $usedCondition = in_array(strtolower((string) ($device->condition ?? 'new')), ['used', 'pre_owned', 'pre-owned', 'refurbished', 'buyback'], true);
                        if ($usedCondition) {
                            $device->forceFill([
                                'branch_id' => $transfer->to_branch_id,
                                'status' => 'ready_for_sale',
                                'saleable' => true,
                                'updated_by' => $request->user()?->id,
                            ])->save();
                        } else {
                            $device->forceFill([
                                'branch_id' => $transfer->to_branch_id,
                                'status' => 'available',
                                'saleable' => true,
                                'updated_by' => $request->user()?->id,
                            ])->save();
                        }
                    }
                    DB::table('stock_transfer_device_units')->where('id', $link->id)->update([
                        'status' => 'received',
                        'received_by' => $request->user()?->id,
                        'received_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }

            $transfer->update([
                'status' => 'received',
                'received_at' => now(),
                'received_by' => $request->user()?->id,
                'receive_note' => $validated['receive_note'] ?? null,
            ]);
            return $transfer;
        });

        return response()->json(['status' => true, 'message' => 'Stock received and destination inventory updated successfully.', 'data' => $this->loadTransfer($updated)]);
    }

    public function cancel(Request $request, StockTransferRequest $stockTransferRequest): JsonResponse
    {
        abort_unless($stockTransferRequest->status === 'pending', 422, 'Only pending requests can be cancelled.');
        $this->ensureTransferAccess($request, $stockTransferRequest);
        $stockTransferRequest->update(['status' => 'cancelled', 'cancelled_at' => now()]);
        return response()->json(['status' => true, 'message' => 'Stock transfer request cancelled.', 'data' => $this->loadTransfer($stockTransferRequest)]);
    }

    private function decreaseSourceStock(StockTransferRequest $transfer, StockTransferRequestItem $item, int $quantity, ?int $userId): int
    {
        $stock = $this->stockQuery((int) $transfer->from_branch_id, (int) $item->product_id, $item->product_variant_id ? (int) $item->product_variant_id : null)
            ->lockForUpdate()->first();
        abort_unless($stock, 422, 'Source branch stock row is missing.');
        $before = (int) $stock->quantity;
        $available = $before - (int) $stock->reserved_quantity;
        abort_if($available < $quantity, 422, 'Source branch does not have enough available stock.');
        $after = $before - $quantity;
        $stock->update(['quantity' => $after]);
        $this->movement($transfer, $item, (int) $transfer->from_branch_id, -$quantity, $before, $after, 'transfer_out', $userId, 'Stock dispatched from ' . $transfer->request_no);
        return $before;
    }

    private function increaseDestinationStock(StockTransferRequest $transfer, StockTransferRequestItem $item, int $quantity, ?int $userId): void
    {
        $stock = $this->stockQuery((int) $transfer->to_branch_id, (int) $item->product_id, $item->product_variant_id ? (int) $item->product_variant_id : null)
            ->lockForUpdate()->first();
        if (! $stock) {
            $stock = BranchStock::create([
                'branch_id' => $transfer->to_branch_id,
                'product_id' => $item->product_id,
                'product_variant_id' => $item->product_variant_id,
                'quantity' => 0,
                'reserved_quantity' => 0,
                'low_stock_alert' => 5,
                'alert_quantity' => 5,
                'status' => 'active',
            ]);
            $stock = BranchStock::query()->whereKey($stock->id)->lockForUpdate()->firstOrFail();
        }
        $before = (int) $stock->quantity;
        $after = $before + $quantity;
        $stock->update(['quantity' => $after]);
        $this->movement($transfer, $item, (int) $transfer->to_branch_id, $quantity, $before, $after, 'transfer_in', $userId, 'Stock received from ' . $transfer->request_no);
    }

    private function stockQuery(int $branchId, int $productId, ?int $variantId)
    {
        return BranchStock::query()
            ->where('branch_id', $branchId)
            ->where('product_id', $productId)
            ->where(function ($q) use ($variantId) {
                $variantId ? $q->where('product_variant_id', $variantId) : $q->whereNull('product_variant_id');
            });
    }

    private function movement(StockTransferRequest $transfer, StockTransferRequestItem $item, int $branchId, int $delta, int $before, int $after, string $type, ?int $userId, string $note): void
    {
        StockMovement::create([
            'movement_no' => $this->movementNo(),
            'branch_id' => $branchId,
            'product_id' => $item->product_id,
            'product_variant_id' => $item->product_variant_id,
            'stock_transfer_request_id' => $transfer->id,
            'user_id' => $userId,
            'type' => $type,
            'quantity_change' => $delta,
            'quantity_before' => $before,
            'quantity_after' => $after,
            'reference_type' => 'stock_transfer_request',
            'reference_id' => $transfer->id,
            'note' => $note,
            'movement_at' => now(),
        ]);
    }

    private function loadTransfer(StockTransferRequest $transfer): StockTransferRequest
    {
        $loaded = $transfer->fresh()->load([
            'fromBranch:id,name,code', 'toBranch:id,name,code', 'requestedBy:id,name',
            'approvedBy:id,name', 'items.product:id,name,sku', 'items.variant:id,variant_name,sku',
            'stockMovements',
        ]);
        return $this->appendDeviceSummary($loaded);
    }

    private function appendDeviceSummary(StockTransferRequest $transfer): StockTransferRequest
    {
        if (! Schema::hasTable('stock_transfer_device_units')) {
            $transfer->setAttribute('device_units', []);
            $transfer->setAttribute('serialized_device_count', 0);
            return $transfer;
        }

        $rows = DB::table('stock_transfer_device_units as link')
            ->join('device_units as du', 'du.id', '=', 'link.device_unit_id')
            ->where('link.stock_transfer_request_id', $transfer->id)
            ->select('link.*', 'du.imei_1', 'du.imei_2', 'du.barcode', 'du.sku', 'du.product_name')
            ->orderBy('link.id')->get();
        $transfer->setAttribute('device_units', $rows);
        $transfer->setAttribute('serialized_device_count', $rows->count());
        return $transfer;
    }

    private function scopeTransferQuery(Request $request, $query): void
    {
        if ($this->accessControl->isSuperAdmin($request->user()) || $this->releaseScope->allowsAll($request)) {
            return;
        }
        $branchIds = $this->releaseScope->branchIds($request) ?: [-1];
        $query->where(fn ($q) => $q->whereIn('to_branch_id', $branchIds)->orWhereIn('from_branch_id', $branchIds));
    }

    private function ensureTransferAccess(Request $request, StockTransferRequest $transfer): void
    {
        if ($this->accessControl->isSuperAdmin($request->user()) || $this->releaseScope->allowsAll($request)) {
            return;
        }
        $ids = $this->releaseScope->branchIds($request);
        abort_unless(in_array((int) $transfer->to_branch_id, $ids, true) || ($transfer->from_branch_id && in_array((int) $transfer->from_branch_id, $ids, true)), 403, 'This stock transfer is outside your branch scope.');
    }

    private function ensureBranchAccess(Request $request, int $branchId): void
    {
        if ($this->accessControl->isSuperAdmin($request->user())) {
            return;
        }
        $this->releaseScope->assertBranch($request, $branchId, 'This branch is outside your stock-transfer scope.');
    }

    private function requestNo(): string
    {
        do {
            $no = 'STR-' . now()->format('ymd') . '-' . strtoupper(Str::random(6));
        } while (StockTransferRequest::query()->where('request_no', $no)->exists());
        return $no;
    }

    private function movementNo(): string
    {
        do {
            $no = 'SM-' . now()->format('ymd') . '-' . strtoupper(Str::random(7));
        } while (StockMovement::query()->where('movement_no', $no)->exists());
        return $no;
    }
}
