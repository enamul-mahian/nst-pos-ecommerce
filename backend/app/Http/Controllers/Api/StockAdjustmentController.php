<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BranchStock;
use App\Models\DeviceUnit;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockAdjustment;
use App\Models\StockMovement;
use App\Services\AccessControlService;
use App\Services\ReleaseScopeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class StockAdjustmentController extends Controller
{
    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly ReleaseScopeService $releaseScope,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = StockAdjustment::with(['branch:id,name,code', 'product:id,name,sku', 'variant:id,variant_name,sku', 'deviceUnit:id,sku,imei_1,barcode,status', 'creator:id,name', 'poster:id,name'])
            ->latest('id');

        $this->applyBranchScope($request, $query);

        foreach (['status', 'direction', 'branch_id', 'product_id'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('adjustment_no', 'like', "%{$search}%")
                    ->orWhere('reason', 'like', "%{$search}%")
                    ->orWhereHas('product', fn ($p) => $p->where('name', 'like', "%{$search}%")->orWhere('sku', 'like', "%{$search}%"))
                    ->orWhereHas('deviceUnit', fn ($d) => $d->where('imei_1', 'like', "%{$search}%")->orWhere('barcode', 'like', "%{$search}%"));
            });
        }

        return response()->json([
            'status' => true,
            'data' => $query->paginate(min(100, max(10, (int) $request->input('per_page', 30)))),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validatePayload($request);
        $this->validateRelationships($validated);
        $this->ensureBranchAccess($request, (int) $validated['branch_id']);

        $adjustment = StockAdjustment::create([
            'adjustment_no' => $this->uniqueNo(),
            'branch_id' => $validated['branch_id'],
            'product_id' => $validated['product_id'],
            'product_variant_id' => $validated['product_variant_id'] ?? null,
            'device_unit_id' => $validated['device_unit_id'] ?? null,
            'direction' => $validated['direction'],
            'quantity' => $validated['quantity'],
            'reason' => $validated['reason'],
            'note' => $validated['note'] ?? null,
            'status' => 'draft',
            'created_by' => $request->user()?->id,
        ]);

        if ($request->boolean('post_now')) {
            return $this->post($request, $adjustment);
        }

        return response()->json([
            'status' => true,
            'message' => 'Stock adjustment draft created successfully.',
            'data' => $this->load($adjustment),
        ], 201);
    }

    public function show(Request $request, StockAdjustment $stockAdjustment): JsonResponse
    {
        $this->ensureBranchAccess($request, (int) $stockAdjustment->branch_id);
        return response()->json(['status' => true, 'data' => $this->load($stockAdjustment)]);
    }

    public function update(Request $request, StockAdjustment $stockAdjustment): JsonResponse
    {
        abort_unless($stockAdjustment->status === 'draft', 422, 'Only draft adjustments can be edited.');
        $this->ensureBranchAccess($request, (int) $stockAdjustment->branch_id);
        $validated = $this->validatePayload($request);
        $this->validateRelationships($validated);
        $this->ensureBranchAccess($request, (int) $validated['branch_id']);

        $stockAdjustment->update([
            'branch_id' => $validated['branch_id'],
            'product_id' => $validated['product_id'],
            'product_variant_id' => $validated['product_variant_id'] ?? null,
            'device_unit_id' => $validated['device_unit_id'] ?? null,
            'direction' => $validated['direction'],
            'quantity' => $validated['quantity'],
            'reason' => $validated['reason'],
            'note' => $validated['note'] ?? null,
        ]);

        return response()->json(['status' => true, 'message' => 'Stock adjustment updated.', 'data' => $this->load($stockAdjustment)]);
    }

    public function post(Request $request, StockAdjustment $stockAdjustment): JsonResponse
    {
        $this->ensureBranchAccess($request, (int) $stockAdjustment->branch_id);
        abort_unless($stockAdjustment->status === 'draft', 422, 'Only draft adjustments can be posted.');

        $posted = DB::transaction(function () use ($request, $stockAdjustment) {
            $adjustment = StockAdjustment::whereKey($stockAdjustment->id)->lockForUpdate()->firstOrFail();
            abort_unless($adjustment->status === 'draft', 422, 'This adjustment has already been processed.');

            $stock = BranchStock::where('branch_id', $adjustment->branch_id)
                ->where('product_id', $adjustment->product_id)
                ->where(function ($q) use ($adjustment) {
                    $adjustment->product_variant_id
                        ? $q->where('product_variant_id', $adjustment->product_variant_id)
                        : $q->whereNull('product_variant_id');
                })
                ->lockForUpdate()
                ->first();

            if (! $stock) {
                $stock = BranchStock::create([
                    'branch_id' => $adjustment->branch_id,
                    'product_id' => $adjustment->product_id,
                    'product_variant_id' => $adjustment->product_variant_id,
                    'quantity' => 0,
                    'reserved_quantity' => 0,
                    'low_stock_alert' => 5,
                    'alert_quantity' => 5,
                    'status' => 'active',
                ]);
                $stock = BranchStock::whereKey($stock->id)->lockForUpdate()->firstOrFail();
            }

            $before = (int) $stock->quantity;
            $delta = $adjustment->direction === 'increase' ? (int) $adjustment->quantity : -(int) $adjustment->quantity;
            $after = $before + $delta;
            abort_if($after < 0, 422, 'Adjustment would make branch stock negative.');

            $metadata = [];
            if ($adjustment->device_unit_id) {
                abort_unless((int) $adjustment->quantity === 1, 422, 'A device-unit adjustment must have quantity 1.');
                $unit = DeviceUnit::whereKey($adjustment->device_unit_id)->lockForUpdate()->firstOrFail();
                abort_unless((int) $unit->product_id === (int) $adjustment->product_id, 422, 'Device unit does not belong to the selected product.');
                if ($adjustment->product_variant_id) {
                    abort_unless((int) $unit->product_variant_id === (int) $adjustment->product_variant_id, 422, 'Device unit does not belong to the selected variant.');
                }

                $metadata['device_status_before'] = $unit->status;
                $metadata['device_branch_before'] = $unit->branch_id;
                $unit->update([
                    'branch_id' => $adjustment->branch_id,
                    'status' => $adjustment->direction === 'increase' ? 'available' : $this->negativeDeviceStatus($adjustment->reason),
                    'updated_by' => $request->user()?->id,
                    'note' => trim(($unit->note ? $unit->note . "\n" : '') . 'Adjustment ' . $adjustment->adjustment_no . ': ' . $adjustment->reason),
                ]);
            }

            $stock->update(['quantity' => $after]);
            $this->updateAggregateStock($adjustment->product_id, $adjustment->product_variant_id, $delta);
            $adjustment->update([
                'quantity_before' => $before,
                'quantity_after' => $after,
                'metadata' => $metadata,
                'status' => 'posted',
                'posted_by' => $request->user()?->id,
                'posted_at' => now(),
            ]);

            StockMovement::create([
                'movement_no' => $this->movementNo(),
                'branch_id' => $adjustment->branch_id,
                'product_id' => $adjustment->product_id,
                'product_variant_id' => $adjustment->product_variant_id,
                'user_id' => $request->user()?->id,
                'type' => $delta > 0 ? 'adjustment_in' : 'adjustment_out',
                'quantity_change' => $delta,
                'quantity_before' => $before,
                'quantity_after' => $after,
                'reference_type' => 'stock_adjustment',
                'reference_id' => $adjustment->id,
                'note' => $adjustment->reason . ($adjustment->note ? ': ' . $adjustment->note : ''),
                'movement_at' => now(),
            ]);

            return $adjustment;
        });

        return response()->json(['status' => true, 'message' => 'Stock adjustment posted successfully.', 'data' => $this->load($posted)]);
    }

    public function reverse(Request $request, StockAdjustment $stockAdjustment): JsonResponse
    {
        $validated = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $this->ensureBranchAccess($request, (int) $stockAdjustment->branch_id);
        abort_unless($stockAdjustment->status === 'posted', 422, 'Only posted adjustments can be reversed.');

        $reversed = DB::transaction(function () use ($request, $stockAdjustment, $validated) {
            $adjustment = StockAdjustment::whereKey($stockAdjustment->id)->lockForUpdate()->firstOrFail();
            abort_unless($adjustment->status === 'posted', 422, 'This adjustment has already been reversed.');

            $stock = BranchStock::where('branch_id', $adjustment->branch_id)
                ->where('product_id', $adjustment->product_id)
                ->where(function ($q) use ($adjustment) {
                    $adjustment->product_variant_id
                        ? $q->where('product_variant_id', $adjustment->product_variant_id)
                        : $q->whereNull('product_variant_id');
                })
                ->lockForUpdate()->firstOrFail();

            $before = (int) $stock->quantity;
            $delta = $adjustment->direction === 'increase' ? -(int) $adjustment->quantity : (int) $adjustment->quantity;
            $after = $before + $delta;
            abort_if($after < 0, 422, 'Reversal would make branch stock negative.');
            $stock->update(['quantity' => $after]);
            $this->updateAggregateStock($adjustment->product_id, $adjustment->product_variant_id, $delta);

            if ($adjustment->device_unit_id) {
                $unit = DeviceUnit::whereKey($adjustment->device_unit_id)->lockForUpdate()->first();
                if ($unit) {
                    $unit->update([
                        'status' => data_get($adjustment->metadata, 'device_status_before', 'available'),
                        'branch_id' => data_get($adjustment->metadata, 'device_branch_before', $adjustment->branch_id),
                        'updated_by' => $request->user()?->id,
                    ]);
                }
            }

            $adjustment->update([
                'status' => 'reversed',
                'reversed_by' => $request->user()?->id,
                'reversed_at' => now(),
                'note' => trim(($adjustment->note ? $adjustment->note . "\n" : '') . 'Reversal: ' . $validated['reason']),
            ]);

            StockMovement::create([
                'movement_no' => $this->movementNo(),
                'branch_id' => $adjustment->branch_id,
                'product_id' => $adjustment->product_id,
                'product_variant_id' => $adjustment->product_variant_id,
                'user_id' => $request->user()?->id,
                'type' => $delta > 0 ? 'adjustment_in' : 'adjustment_out',
                'quantity_change' => $delta,
                'quantity_before' => $before,
                'quantity_after' => $after,
                'reference_type' => 'stock_adjustment_reversal',
                'reference_id' => $adjustment->id,
                'note' => 'Reversal of ' . $adjustment->adjustment_no . ': ' . $validated['reason'],
                'movement_at' => now(),
            ]);

            return $adjustment;
        });

        return response()->json(['status' => true, 'message' => 'Stock adjustment reversed.', 'data' => $this->load($reversed)]);
    }

    private function validatePayload(Request $request): array
    {
        return $request->validate([
            'branch_id' => ['required', 'exists:branches,id'],
            'product_id' => ['required', 'exists:products,id'],
            'product_variant_id' => ['nullable', 'exists:product_variants,id'],
            'device_unit_id' => ['nullable', 'exists:device_units,id'],
            'direction' => ['required', Rule::in(['increase', 'decrease'])],
            'quantity' => ['required', 'integer', 'min:1'],
            'reason' => ['required', Rule::in(['physical_count', 'damage', 'loss', 'found', 'data_correction', 'return', 'service', 'other'])],
            'note' => ['nullable', 'string', 'max:2000'],
            'post_now' => ['nullable', 'boolean'],
        ]);
    }

    private function validateRelationships(array $validated): void
    {
        if (! empty($validated['product_variant_id'])) {
            $belongs = ProductVariant::query()
                ->whereKey($validated['product_variant_id'])
                ->where('product_id', $validated['product_id'])
                ->exists();
            abort_unless($belongs, 422, 'Selected variant does not belong to the selected product.');
        }

        if (! empty($validated['device_unit_id'])) {
            abort_unless((int) $validated['quantity'] === 1, 422, 'A device-unit adjustment must have quantity 1.');
            $device = DeviceUnit::query()->find($validated['device_unit_id']);
            abort_unless($device && (int) $device->product_id === (int) $validated['product_id'], 422, 'Selected device does not belong to the selected product.');
            if (! empty($validated['product_variant_id'])) {
                abort_unless((int) $device->product_variant_id === (int) $validated['product_variant_id'], 422, 'Selected device does not belong to the selected variant.');
            }
        }
    }

    private function updateAggregateStock(int $productId, ?int $variantId, int $delta): void
    {
        $product = Product::query()->whereKey($productId)->lockForUpdate()->firstOrFail();
        $nextProductQuantity = (int) ($product->stock_quantity ?? 0) + $delta;
        abort_if($nextProductQuantity < 0, 422, 'Adjustment would make total product stock negative.');
        $product->forceFill([
            'stock_quantity' => $nextProductQuantity,
            'status' => $nextProductQuantity > 0 ? 'active' : 'out_of_stock',
        ])->save();

        if ($variantId) {
            $variant = ProductVariant::query()->whereKey($variantId)->lockForUpdate()->firstOrFail();
            $nextVariantQuantity = (int) ($variant->stock_quantity ?? 0) + $delta;
            abort_if($nextVariantQuantity < 0, 422, 'Adjustment would make variant stock negative.');
            $variant->forceFill(['stock_quantity' => $nextVariantQuantity])->save();
        }
    }

    private function load(StockAdjustment $adjustment): StockAdjustment
    {
        return $adjustment->fresh()->load(['branch:id,name,code', 'product:id,name,sku', 'variant:id,variant_name,sku', 'deviceUnit:id,sku,imei_1,imei_2,barcode,status', 'creator:id,name', 'poster:id,name', 'reverser:id,name']);
    }

    private function applyBranchScope(Request $request, $query): void
    {
        if ($this->accessControl->isSuperAdmin($request->user()) || $this->releaseScope->allowsAll($request)) {
            return;
        }

        $query->whereIn('branch_id', $this->releaseScope->branchIds($request) ?: [-1]);
    }

    private function ensureBranchAccess(Request $request, int $branchId): void
    {
        if ($this->accessControl->isSuperAdmin($request->user())) {
            return;
        }

        $this->releaseScope->assertBranch($request, $branchId, 'You cannot adjust stock for this branch.');
    }

    private function negativeDeviceStatus(string $reason): string
    {
        return match ($reason) {
            'damage' => 'damaged',
            'loss' => 'lost',
            'service' => 'in_service',
            'return' => 'returned',
            default => 'inactive',
        };
    }

    private function uniqueNo(): string
    {
        do {
            $no = 'ADJ-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6));
        } while (StockAdjustment::where('adjustment_no', $no)->exists());
        return $no;
    }

    private function movementNo(): string
    {
        do {
            $no = 'SM-' . now()->format('ymd') . '-' . strtoupper(Str::random(7));
        } while (StockMovement::where('movement_no', $no)->exists());
        return $no;
    }
}
