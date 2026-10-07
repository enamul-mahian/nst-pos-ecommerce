<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BranchStock;
use App\Models\Customer;
use App\Models\DeviceUnit;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleExchange;
use App\Models\SaleExchangeItem;
use App\Models\SaleItem;
use App\Models\SalePayment;
use App\Models\StockMovement;
use App\Services\AccessControlService;
use App\Services\ReleaseScopeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ExchangeController extends Controller
{
    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly ReleaseScopeService $releaseScope,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = SaleExchange::with(['sale:id,invoice_no,customer_name,customer_phone', 'branch:id,name,code', 'customer:id,name,phone', 'processor:id,name', 'items'])
            ->latest('id');

        if (! $this->accessControl->isSuperAdmin($request->user()) && ! $this->releaseScope->allowsAll($request)) {
            $query->whereIn('branch_id', $this->releaseScope->branchIds($request) ?: [-1]);
        }

        foreach (['branch_id', 'status', 'sale_id'] as $field) {
            if ($request->filled($field)) {
                $query->where($field, $request->input($field));
            }
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('exchange_no', 'like', "%{$search}%")
                    ->orWhereHas('sale', fn ($s) => $s->where('invoice_no', 'like', "%{$search}%")
                        ->orWhere('customer_name', 'like', "%{$search}%")
                        ->orWhere('customer_phone', 'like', "%{$search}%"));
            });
        }

        return response()->json(['status' => true, 'data' => $query->paginate(min(100, max(10, (int) $request->input('per_page', 30))))]);
    }

    public function options(Request $request, Sale $sale): JsonResponse
    {
        $this->ensureBranchAccess($request, (int) $sale->branch_id);
        $sale->load(['items.product:id,name,sku', 'items.variant:id,variant_name,sku', 'items.deviceUnit:id,imei_1,imei_2,barcode,status']);

        $alreadyReturned = SaleExchangeItem::query()
            ->where('item_type', 'return')
            ->whereIn('sale_exchange_id', SaleExchange::where('sale_id', $sale->id)->where('status', '<>', 'cancelled')->pluck('id'))
            ->selectRaw('sale_item_id, SUM(quantity) as quantity')
            ->groupBy('sale_item_id')
            ->pluck('quantity', 'sale_item_id');

        $items = $sale->items->map(function (SaleItem $item) use ($alreadyReturned) {
            $returned = (int) ($alreadyReturned[$item->id] ?? 0);
            return [
                'id' => $item->id,
                'product_id' => $item->product_id,
                'product_variant_id' => $item->product_variant_id,
                'product_name' => $item->product_name,
                'sku' => $item->sku,
                'imei_1' => $item->imei_1,
                'imei_2' => $item->imei_2,
                'device_barcode' => $item->device_barcode,
                'device_unit_id' => $item->device_unit_id,
                'sold_quantity' => (int) $item->quantity,
                'already_exchanged_quantity' => $returned,
                'exchangeable_quantity' => max((int) $item->quantity - $returned, 0),
                'unit_credit' => (float) $item->quantity > 0 ? round((float) $item->total / (int) $item->quantity, 2) : 0,
            ];
        });

        return response()->json(['status' => true, 'data' => ['sale' => $sale, 'items' => $items]]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sale_id' => ['required', 'exists:sales,id'],
            'reason' => ['required', 'string', 'max:190'],
            'note' => ['nullable', 'string', 'max:2000'],
            'payment_method' => ['nullable', 'string', 'max:60'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'returned_items' => ['required', 'array', 'min:1'],
            'returned_items.*.sale_item_id' => ['required', 'exists:sale_items,id'],
            'returned_items.*.quantity' => ['required', 'integer', 'min:1'],
            'returned_items.*.condition_note' => ['nullable', 'string', 'max:1000'],
            'replacement_items' => ['required', 'array', 'min:1'],
            'replacement_items.*.product_id' => ['required', 'exists:products,id'],
            'replacement_items.*.product_variant_id' => ['nullable', 'exists:product_variants,id'],
            'replacement_items.*.quantity' => ['required', 'integer', 'min:1'],
            'replacement_items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'replacement_items.*.device_unit_ids' => ['nullable', 'array'],
            'replacement_items.*.device_unit_ids.*' => ['integer', 'exists:device_units,id'],
        ]);

        $sale = Sale::findOrFail($validated['sale_id']);
        $this->ensureBranchAccess($request, (int) $sale->branch_id);
        abort_unless(in_array($sale->status, ['completed', 'processing'], true), 422, 'Only active completed or processing sales can be exchanged.');

        $exchange = DB::transaction(function () use ($request, $validated, $sale) {
            $lockedSale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();
            $exchange = SaleExchange::create([
                'exchange_no' => $this->exchangeNo(),
                'sale_id' => $lockedSale->id,
                'branch_id' => $lockedSale->branch_id,
                'customer_id' => $lockedSale->customer_id,
                'reason' => $validated['reason'],
                'note' => $validated['note'] ?? null,
                'payment_method' => $validated['payment_method'] ?? null,
                'status' => 'processing',
                'processed_by' => $request->user()?->id,
            ]);

            $returnedValue = 0.0;
            $returnedDeviceIds = collect();
            foreach ($validated['returned_items'] as $row) {
                $item = SaleItem::whereKey($row['sale_item_id'])->where('sale_id', $lockedSale->id)->lockForUpdate()->firstOrFail();
                $previouslyReturned = (int) SaleExchangeItem::query()
                    ->where('item_type', 'return')
                    ->where('sale_item_id', $item->id)
                    ->whereIn('sale_exchange_id', SaleExchange::where('sale_id', $lockedSale->id)->where('status', '<>', 'cancelled')->pluck('id'))
                    ->sum('quantity');
                $available = (int) $item->quantity - $previouslyReturned;
                abort_if((int) $row['quantity'] > $available, 422, "{$item->product_name} exchange quantity exceeds the remaining sold quantity.");

                $unitCredit = (int) $item->quantity > 0 ? round((float) $item->total / (int) $item->quantity, 2) : 0;
                $lineTotal = round($unitCredit * (int) $row['quantity'], 2);
                $returnedValue += $lineTotal;

                $device = null;
                if ($item->device_unit_id) {
                    abort_unless((int) $row['quantity'] === 1, 422, 'An IMEI/device sale item can only be exchanged as quantity 1.');
                    $device = DeviceUnit::whereKey($item->device_unit_id)->lockForUpdate()->firstOrFail();
                    abort_unless((int) $device->sale_id === (int) $lockedSale->id && $device->status === 'sold', 422, 'Returned device is not linked to this sale or is no longer sold.');
                    $returnedDeviceIds->push((int) $device->id);
                    $device->update([
                        'status' => 'available',
                        'sale_id' => null,
                        'sale_item_id' => null,
                        'sold_at' => null,
                        'returned_at' => now(),
                        'return_reason' => 'Exchange: ' . $validated['reason'],
                        'return_note' => $row['condition_note'] ?? null,
                        'updated_by' => $request->user()?->id,
                    ]);
                }

                if (! $device) {
                    $this->changeStock(
                        $request,
                        $lockedSale->branch_id,
                        $item->product_id,
                        $item->product_variant_id,
                        (int) $row['quantity'],
                        'return_in',
                        'sale_exchange',
                        $exchange->id,
                        'Exchange return ' . $exchange->exchange_no
                    );
                    $this->changeCatalogStock(
                        $item->product_id,
                        $item->product_variant_id,
                        (int) $row['quantity']
                    );
                }

                SaleExchangeItem::create([
                    'sale_exchange_id' => $exchange->id,
                    'item_type' => 'return',
                    'sale_item_id' => $item->id,
                    'product_id' => $item->product_id,
                    'product_variant_id' => $item->product_variant_id,
                    'device_unit_id' => $device?->id,
                    'product_name' => $item->product_name,
                    'sku' => $item->sku,
                    'imei_1' => $item->imei_1,
                    'barcode' => $item->device_barcode,
                    'quantity' => $row['quantity'],
                    'unit_price' => $unitCredit,
                    'line_total' => $lineTotal,
                    'condition_note' => $row['condition_note'] ?? null,
                ]);
            }

            $replacementValue = 0.0;
            foreach ($validated['replacement_items'] as $row) {
                $product = Product::whereKey($row['product_id'])->lockForUpdate()->firstOrFail();
                $variant = null;
                if (! empty($row['product_variant_id'])) {
                    $variant = ProductVariant::whereKey($row['product_variant_id'])->where('product_id', $product->id)->lockForUpdate()->firstOrFail();
                }

                $quantity = (int) $row['quantity'];
                $unitPrice = round((float) $row['unit_price'], 2);
                $lineTotal = round($unitPrice * $quantity, 2);
                $replacementValue += $lineTotal;
                $devices = $this->replacementDevices($lockedSale->branch_id, $product->id, $variant?->id, $quantity, collect($row['device_unit_ids'] ?? []), $returnedDeviceIds);

                $this->changeStock($request, $lockedSale->branch_id, $product->id, $variant?->id, -$quantity, 'sale', 'sale_exchange', $exchange->id, 'Exchange replacement ' . $exchange->exchange_no);
                $this->changeCatalogStock($product->id, $variant?->id, -$quantity);

                if ($devices->count() === $quantity) {
                    foreach ($devices as $device) {
                        $device->update([
                            'status' => 'sold',
                            'sale_id' => $lockedSale->id,
                            'sale_item_id' => null,
                            'sold_at' => now(),
                            'returned_at' => null,
                            'return_reason' => null,
                            'return_note' => null,
                            'updated_by' => $request->user()?->id,
                        ]);
                        SaleExchangeItem::create([
                            'sale_exchange_id' => $exchange->id,
                            'item_type' => 'replacement',
                            'product_id' => $product->id,
                            'product_variant_id' => $variant?->id,
                            'device_unit_id' => $device->id,
                            'product_name' => trim($product->name . ($variant ? ' - ' . $variant->display_name : '')),
                            'sku' => $variant?->sku ?: $product->sku,
                            'imei_1' => $device->imei_1,
                            'barcode' => $device->barcode,
                            'quantity' => 1,
                            'unit_price' => $unitPrice,
                            'line_total' => $unitPrice,
                        ]);
                    }
                } else {
                    SaleExchangeItem::create([
                        'sale_exchange_id' => $exchange->id,
                        'item_type' => 'replacement',
                        'product_id' => $product->id,
                        'product_variant_id' => $variant?->id,
                        'product_name' => trim($product->name . ($variant ? ' - ' . $variant->display_name : '')),
                        'sku' => $variant?->sku ?: $product->sku,
                        'quantity' => $quantity,
                        'unit_price' => $unitPrice,
                        'line_total' => $lineTotal,
                    ]);
                }
            }

            $difference = round($replacementValue - $returnedValue, 2);
            $paid = round((float) ($validated['paid_amount'] ?? 0), 2);
            abort_if($difference <= 0 && $paid > 0, 422, 'No payment is required when the replacement value does not exceed returned credit.');
            abort_if($paid > max($difference, 0), 422, 'Paid amount cannot exceed the exchange payable amount.');
            $due = max(round($difference - $paid, 2), 0);
            $refund = max(round(-$difference, 2), 0);

            $exchange->update([
                'returned_value' => $returnedValue,
                'replacement_value' => $replacementValue,
                'difference_amount' => $difference,
                'paid_amount' => $paid,
                'due_amount' => $due,
                'refund_amount' => $refund,
                'status' => 'completed',
                'completed_at' => now(),
            ]);

            if ($paid > 0) {
                SalePayment::create([
                    'sale_id' => $lockedSale->id,
                    'payment_method' => $validated['payment_method'] ?? 'cash',
                    'provider_name' => 'Exchange ' . $exchange->exchange_no,
                    'amount' => $paid,
                    'received_by' => $request->user()?->id,
                    'note' => 'Additional payment for exchange ' . $exchange->exchange_no,
                ]);
            }

            if ($lockedSale->customer_id && $due > 0) {
                $customer = Customer::whereKey($lockedSale->customer_id)->lockForUpdate()->first();
                if ($customer) {
                    $customer->update(['current_balance' => round((float) $customer->current_balance + $due, 2), 'updated_by' => $request->user()?->id]);
                }
            }

            return $exchange;
        });

        return response()->json([
            'status' => true,
            'message' => 'Sale exchange completed successfully.',
            'data' => $this->load($exchange),
        ], 201);
    }

    public function show(Request $request, SaleExchange $exchange): JsonResponse
    {
        $this->ensureBranchAccess($request, (int) $exchange->branch_id);
        return response()->json(['status' => true, 'data' => $this->load($exchange)]);
    }

    private function replacementDevices(int $branchId, int $productId, ?int $variantId, int $quantity, Collection $requestedIds, Collection $excludedIds): Collection
    {
        $base = DeviceUnit::query()->where('branch_id', $branchId)->where('product_id', $productId)
            ->when(
                Schema::hasColumn('device_units', 'product_variant_id'),
                fn ($q) => $variantId ? $q->where('product_variant_id', $variantId) : $q->whereNull('product_variant_id')
            )
            ->when($excludedIds->isNotEmpty(), fn ($q) => $q->whereNotIn('id', $excludedIds->all()));
        $trackedCount = (clone $base)->count();

        if ($requestedIds->isNotEmpty()) {
            $ids = $requestedIds->map(fn ($id) => (int) $id)->unique()->values();
            abort_unless($ids->count() === $quantity, 422, 'Replacement quantity and selected IMEI/device count must be equal.');
            $devices = (clone $base)
                ->whereIn('id', $ids)
                ->whereIn('status', ['available', 'ready_for_sale'])
                ->when(
                    Schema::hasColumn('device_units', 'saleable'),
                    fn ($query) => $query->where('saleable', true)
                )
                ->lockForUpdate()
                ->get();
            abort_unless($devices->count() === $quantity, 422, 'One or more selected replacement devices are not available in this branch.');
            return $devices;
        }

        if ($trackedCount > 0) {
            abort(422, 'This replacement product is IMEI/device tracked. Select each replacement device.');
        }

        return collect();
    }

    private function changeStock(Request $request, int $branchId, int $productId, ?int $variantId, int $delta, string $type, string $referenceType, int $referenceId, string $note): void
    {
        $stock = BranchStock::where('branch_id', $branchId)->where('product_id', $productId)
            ->where(function ($q) use ($variantId) { $variantId ? $q->where('product_variant_id', $variantId) : $q->whereNull('product_variant_id'); })
            ->lockForUpdate()->first();

        if (! $stock) {
            abort_if($delta < 0, 422, 'Replacement stock is unavailable in the selected branch.');
            $stock = BranchStock::create([
                'branch_id' => $branchId, 'product_id' => $productId, 'product_variant_id' => $variantId,
                'quantity' => 0, 'reserved_quantity' => 0, 'low_stock_alert' => 5, 'alert_quantity' => 5, 'status' => 'active',
            ]);
            $stock = BranchStock::whereKey($stock->id)->lockForUpdate()->firstOrFail();
        }

        $before = (int) $stock->quantity;
        $after = $before + $delta;
        abort_if($after < 0, 422, 'Replacement stock is not sufficient in the selected branch.');
        $stock->update(['quantity' => $after]);

        StockMovement::create([
            'movement_no' => $this->movementNo(), 'branch_id' => $branchId, 'product_id' => $productId,
            'product_variant_id' => $variantId, 'user_id' => $request->user()?->id, 'type' => $type,
            'quantity_change' => $delta, 'quantity_before' => $before, 'quantity_after' => $after,
            'reference_type' => $referenceType, 'reference_id' => $referenceId, 'note' => $note, 'movement_at' => now(),
        ]);
    }

    private function changeCatalogStock(int $productId, ?int $variantId, int $delta): void
    {
        $product = Product::whereKey($productId)->lockForUpdate()->first();
        if ($product) {
            $next = (int) ($product->stock_quantity ?? 0) + $delta;
            abort_if($next < 0, 409, 'Catalog stock is inconsistent; the exchange was rolled back.');
            $product->update(['stock_quantity' => $next, 'status' => $next > 0 ? 'active' : 'out_of_stock']);
        }
        if ($variantId) {
            $variant = ProductVariant::whereKey($variantId)->lockForUpdate()->first();
            if ($variant) {
                $nextVariant = (int) ($variant->stock_quantity ?? 0) + $delta;
                abort_if($nextVariant < 0, 409, 'Variant stock is inconsistent; the exchange was rolled back.');
                $variant->update(['stock_quantity' => $nextVariant]);
            }
        }
    }

    private function load(SaleExchange $exchange): SaleExchange
    {
        return $exchange->fresh()->load([
            'sale.items', 'branch:id,name,code', 'customer:id,name,phone,email', 'processor:id,name',
            'items.saleItem', 'items.product:id,name,sku', 'items.variant:id,variant_name,sku', 'items.deviceUnit:id,imei_1,imei_2,barcode,status',
        ]);
    }

    private function ensureBranchAccess(Request $request, int $branchId): void
    {
        if ($this->accessControl->isSuperAdmin($request->user())) {
            return;
        }
        $this->releaseScope->assertBranch($request, $branchId, 'You cannot process an exchange for this branch.');
    }

    private function exchangeNo(): string
    {
        do { $no = 'EX-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6)); }
        while (SaleExchange::where('exchange_no', $no)->exists());
        return $no;
    }

    private function movementNo(): string
    {
        do { $no = 'SM-' . now()->format('ymd') . '-' . strtoupper(Str::random(7)); }
        while (StockMovement::where('movement_no', $no)->exists());
        return $no;
    }
}
