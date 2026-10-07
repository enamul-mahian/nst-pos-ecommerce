<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\BranchStock;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use App\Services\AccessControlService;
use App\Services\ReleaseScopeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class BranchStockController extends Controller
{
    private const COUNTED_DEVICE_STATUSES = ['available', 'reserved', 'booked'];

    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly ReleaseScopeService $releaseScope,
    ) {
    }

    public function branchStock(Request $request, Branch $branch): JsonResponse
    {
        $this->ensureBranchAccess($request, (int) $branch->id);

        $stocks = BranchStock::query()
            ->with(['product:id,name,sku,barcode,brand,category,brand_id,category_id,supplier_id,purchase_price,sale_price,regular_price,discount_price,status', 'variant:id,product_id,variant_name,sku,barcode,stock_quantity'])
            ->where('branch_id', $branch->id)
            ->orderByDesc('id')
            ->get();

        $deviceCounts = DB::table('device_units')
            ->whereNull('deleted_at')
            ->where('branch_id', $branch->id)
            ->whereIn('status', self::COUNTED_DEVICE_STATUSES)
            ->select('product_id', 'product_variant_id', DB::raw('COUNT(*) as total'))
            ->groupBy('product_id', 'product_variant_id')
            ->get()
            ->keyBy(fn ($row) => $this->stockKey((int) $row->product_id, $row->product_variant_id ? (int) $row->product_variant_id : null));

        $canSeeCost = $this->accessControl->canViewPurchasePrice($request->user());
        $items = $stocks->map(function (BranchStock $stock) use ($deviceCounts, $canSeeCost) {
            $product = $stock->product;
            $variant = $stock->variant;
            $serialized = (int) data_get($deviceCounts->get($this->stockKey((int) $stock->product_id, $stock->product_variant_id ? (int) $stock->product_variant_id : null)), 'total', 0);
            $threshold = (int) ($stock->alert_quantity ?? $stock->low_stock_alert ?? 0);
            $available = max(0, (int) $stock->quantity - (int) $stock->reserved_quantity);

            return [
                'id' => $stock->id,
                'branch_id' => $stock->branch_id,
                'product_id' => $stock->product_id,
                'product_variant_id' => $stock->product_variant_id,
                'quantity' => (int) $stock->quantity,
                'reserved_quantity' => (int) $stock->reserved_quantity,
                'available_quantity' => $available,
                'serialized_device_count' => $serialized,
                'has_serialized_drift' => $serialized > 0 && $serialized !== (int) $stock->quantity,
                'alert_quantity' => $threshold,
                'is_low_stock' => $available <= $threshold,
                'shelf_location' => $stock->shelf_location,
                'status' => $stock->status,
                'note' => $stock->note,
                'last_counted_at' => $stock->last_counted_at,
                'last_reconciled_at' => $stock->last_reconciled_at,
                'product' => $product ? [
                    'id' => $product->id,
                    'name' => $product->name,
                    'sku' => $product->sku,
                    'barcode' => $product->barcode,
                    'brand' => $product->brand,
                    'category' => $product->category,
                    'sale_price' => $product->sale_price,
                    'purchase_price' => $canSeeCost ? $product->purchase_price : null,
                ] : null,
                'variant' => $variant ? [
                    'id' => $variant->id,
                    'variant_name' => $variant->variant_name,
                    'sku' => $variant->sku,
                    'barcode' => $variant->barcode,
                ] : null,
                'product_name' => $product?->name,
                'product_sku' => $variant?->sku ?: $product?->sku,
                'product_barcode' => $variant?->barcode ?: $product?->barcode,
                'purchase_price' => $canSeeCost ? ($product?->purchase_price ?? 0) : null,
                'sale_price' => $product?->sale_price ?? 0,
                'created_at' => $stock->created_at,
                'updated_at' => $stock->updated_at,
            ];
        })->values();

        return response()->json([
            'success' => true,
            'message' => 'Branch stock loaded successfully.',
            'data' => [
                'branch' => $branch->only(['id', 'name', 'code', 'phone', 'email', 'address', 'manager_id', 'status']),
                'stocks' => $items,
                'items' => $items,
                'total_items' => $items->count(),
                'total_quantity' => (int) $items->sum('quantity'),
                'reserved_quantity' => (int) $items->sum('reserved_quantity'),
                'available_quantity' => (int) $items->sum('available_quantity'),
                'low_stock_rows' => $items->where('is_low_stock', true)->count(),
                'drift_rows' => $items->where('has_serialized_drift', true)->count(),
                'can_manage_stock' => true,
                'can_see_purchase_cost' => $canSeeCost,
            ],
            'branch' => $branch,
            'stocks' => $items,
            'items' => $items,
        ]);
    }

    public function branchProducts(Request $request, Branch $branch): JsonResponse
    {
        $this->ensureBranchAccess($request, (int) $branch->id);
        $products = Product::query()
            ->whereIn('id', BranchStock::query()->where('branch_id', $branch->id)->pluck('product_id'))
            ->with('variants')
            ->orderBy('name')
            ->get();
        return response()->json(['success' => true, 'data' => $products, 'products' => $products]);
    }

    public function assignStock(Request $request, Branch $branch): JsonResponse
    {
        $this->ensureBranchAccess($request, (int) $branch->id);
        $validated = $request->validate([
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'product_variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'quantity' => ['required', 'integer', 'min:1'],
            'note' => ['required', 'string', 'max:1000'],
        ]);
        $this->validateVariant($validated);

        $stock = DB::transaction(function () use ($request, $branch, $validated) {
            $stock = $this->stockQuery((int) $branch->id, (int) $validated['product_id'], $validated['product_variant_id'] ?? null)
                ->lockForUpdate()->first();
            if (! $stock) {
                $stock = BranchStock::create([
                    'branch_id' => $branch->id,
                    'product_id' => $validated['product_id'],
                    'product_variant_id' => $validated['product_variant_id'] ?? null,
                    'quantity' => 0,
                    'reserved_quantity' => 0,
                    'low_stock_alert' => 5,
                    'alert_quantity' => 5,
                    'status' => 'active',
                ]);
                $stock = BranchStock::query()->whereKey($stock->id)->lockForUpdate()->firstOrFail();
            }
            $before = (int) $stock->quantity;
            $after = $before + (int) $validated['quantity'];
            $stock->update(['quantity' => $after, 'status' => 'active']);
            $this->adjustAggregate((int) $validated['product_id'], $validated['product_variant_id'] ?? null, (int) $validated['quantity']);
            $this->movement($request, $stock, (int) $validated['quantity'], $before, $after, 'manual_assign', $validated['note']);
            return $stock;
        });

        return response()->json(['success' => true, 'message' => 'Branch stock assigned with movement history.', 'data' => $stock->fresh()]);
    }

    public function updateStock(Request $request, BranchStock $branchStock): JsonResponse
    {
        $this->ensureBranchAccess($request, (int) $branchStock->branch_id);
        $validated = $request->validate([
            'quantity' => ['required', 'integer', 'min:0'],
            'note' => ['required', 'string', 'max:1000'],
        ]);

        $updated = DB::transaction(function () use ($request, $branchStock, $validated) {
            $stock = BranchStock::query()->whereKey($branchStock->id)->lockForUpdate()->firstOrFail();
            $serializedCount = DB::table('device_units')
                ->whereNull('deleted_at')
                ->where('branch_id', $stock->branch_id)
                ->where('product_id', $stock->product_id)
                ->where(function ($q) use ($stock) {
                    $stock->product_variant_id ? $q->where('product_variant_id', $stock->product_variant_id) : $q->whereNull('product_variant_id');
                })
                ->whereIn('status', self::COUNTED_DEVICE_STATUSES)
                ->count();
            abort_if($serializedCount > 0 && (int) $validated['quantity'] < $serializedCount, 422, 'Quantity cannot be lower than the active serialized device count. Use device status actions first.');
            abort_if((int) $validated['quantity'] < (int) $stock->reserved_quantity, 422, 'Quantity cannot be lower than reserved quantity.');

            $before = (int) $stock->quantity;
            $after = (int) $validated['quantity'];
            $delta = $after - $before;
            $stock->update([
                'quantity' => $after,
                'last_counted_at' => now(),
                'last_counted_by' => $request->user()?->id,
                'note' => trim(($stock->note ? $stock->note . "\n" : '') . '[Physical count] ' . $validated['note']),
            ]);
            if ($delta !== 0) {
                $this->adjustAggregate((int) $stock->product_id, $stock->product_variant_id ? (int) $stock->product_variant_id : null, $delta);
                $this->movement($request, $stock, $delta, $before, $after, 'physical_count_set', $validated['note']);
            }
            return $stock;
        });

        return response()->json(['success' => true, 'message' => 'Branch stock count updated and audited.', 'data' => $updated->fresh()]);
    }

    public function removeStock(Request $request, BranchStock $branchStock): JsonResponse
    {
        abort_unless($this->accessControl->isSuperAdmin($request->user()), 403, 'Only Super Admin can remove an empty branch stock row.');
        abort_if((int) $branchStock->quantity !== 0 || (int) $branchStock->reserved_quantity !== 0, 422, 'Only an empty stock row can be removed.');
        $serialized = DB::table('device_units')
            ->whereNull('deleted_at')
            ->where('branch_id', $branchStock->branch_id)
            ->where('product_id', $branchStock->product_id)
            ->where(function ($q) use ($branchStock) {
                $branchStock->product_variant_id ? $q->where('product_variant_id', $branchStock->product_variant_id) : $q->whereNull('product_variant_id');
            })
            ->whereIn('status', self::COUNTED_DEVICE_STATUSES)->exists();
        abort_if($serialized, 422, 'This row still has active serialized devices.');
        $branchStock->delete();
        return response()->json(['success' => true, 'message' => 'Empty branch stock row removed.']);
    }

    private function validateVariant(array $validated): void
    {
        if (! empty($validated['product_variant_id'])) {
            abort_unless(ProductVariant::query()->whereKey($validated['product_variant_id'])->where('product_id', $validated['product_id'])->exists(), 422, 'Selected variant does not belong to the selected product.');
        }
    }

    private function stockQuery(int $branchId, int $productId, ?int $variantId)
    {
        return BranchStock::query()->where('branch_id', $branchId)->where('product_id', $productId)
            ->where(function ($q) use ($variantId) {
                $variantId ? $q->where('product_variant_id', $variantId) : $q->whereNull('product_variant_id');
            });
    }

    private function adjustAggregate(int $productId, ?int $variantId, int $delta): void
    {
        $product = Product::query()->whereKey($productId)->lockForUpdate()->firstOrFail();
        $next = (int) ($product->stock_quantity ?? 0) + $delta;
        abort_if($next < 0, 422, 'This stock count would make product aggregate stock negative.');
        $product->forceFill(['stock_quantity' => $next, 'status' => $next > 0 ? 'active' : 'out_of_stock'])->save();
        if ($variantId) {
            $variant = ProductVariant::query()->whereKey($variantId)->lockForUpdate()->firstOrFail();
            $variantNext = (int) ($variant->stock_quantity ?? 0) + $delta;
            abort_if($variantNext < 0, 422, 'This stock count would make variant aggregate stock negative.');
            $variant->forceFill(['stock_quantity' => $variantNext])->save();
        }
    }

    private function movement(Request $request, BranchStock $stock, int $delta, int $before, int $after, string $type, string $note): void
    {
        StockMovement::create([
            'movement_no' => $this->movementNo(),
            'branch_id' => $stock->branch_id,
            'product_id' => $stock->product_id,
            'product_variant_id' => $stock->product_variant_id,
            'user_id' => $request->user()?->id,
            'type' => $type,
            'quantity_change' => $delta,
            'quantity_before' => $before,
            'quantity_after' => $after,
            'reference_type' => 'branch_stock',
            'reference_id' => $stock->id,
            'note' => $note,
            'movement_at' => now(),
        ]);
    }

    private function ensureBranchAccess(Request $request, int $branchId): void
    {
        if ($this->accessControl->isSuperAdmin($request->user())) {
            return;
        }
        $this->releaseScope->assertBranch($request, $branchId, 'This branch is outside your inventory scope.');
    }

    private function stockKey(int $productId, ?int $variantId): string
    {
        return $productId . ':' . ($variantId ?: 0);
    }

    private function movementNo(): string
    {
        do {
            $no = 'SM-' . now()->format('ymd') . '-' . strtoupper(Str::random(7));
        } while (StockMovement::query()->where('movement_no', $no)->exists());
        return $no;
    }
}
