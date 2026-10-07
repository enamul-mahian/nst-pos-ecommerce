<?php

namespace App\Services;

use App\Models\BranchStock;
use App\Models\Customer;
use App\Models\CustomerOrder;
use App\Models\CustomerOrderTimelineEvent;
use App\Models\DeviceUnit;
use App\Models\OrderDelivery;
use App\Models\PaymentTransaction;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SalePayment;
use App\Models\StockMovement;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

class WebSaleConversionService
{
    public function convert(CustomerOrder $order, int $branchId, int $staffId, ?int $assignedStaffId = null): Sale
    {
        return DB::transaction(function () use ($order, $branchId, $staffId, $assignedStaffId) {
            $lockedOrder = CustomerOrder::query()
                ->whereKey($order->getKey())
                ->lockForUpdate()
                ->firstOrFail();

            if ($lockedOrder->sale_id) {
                return Sale::query()->findOrFail($lockedOrder->sale_id);
            }

            if (in_array($lockedOrder->status, ['cancelled', 'rejected'], true)) {
                throw new HttpException(422, 'Cancelled or rejected orders cannot be converted to a sale.');
            }

            $isCod = $lockedOrder->payment_method === 'cash_on_delivery';
            $isPaid = in_array($lockedOrder->payment_status, ['approved', 'paid'], true);

            if (! $isCod && ! $isPaid) {
                throw new HttpException(422, 'Online payment must be verified before the order can be converted.');
            }

            $items = $lockedOrder->items()->orderBy('id')->get();
            if ($items->isEmpty()) {
                throw new HttpException(422, 'The web order does not contain any saleable items.');
            }

            $prepared = [];
            $profitAmount = 0.0;

            foreach ($items as $orderItem) {
                $quantity = max(1, (int) $orderItem->quantity);
                $product = Product::query()->whereKey($orderItem->product_id)->lockForUpdate()->first();

                if (! $product) {
                    throw new HttpException(422, "Product is no longer available: {$orderItem->product_name}.");
                }

                $variant = null;
                if ($orderItem->variant_id) {
                    $variant = ProductVariant::query()
                        ->whereKey($orderItem->variant_id)
                        ->where('product_id', $product->id)
                        ->lockForUpdate()
                        ->first();

                    if (! $variant) {
                        throw new HttpException(422, "Selected variant is no longer available: {$orderItem->product_name}.");
                    }
                }

                $stockQuery = BranchStock::query()
                    ->where('branch_id', $branchId)
                    ->where('product_id', $product->id);

                if (Schema::hasColumn('branch_stocks', 'product_variant_id')) {
                    $variant
                        ? $stockQuery->where('product_variant_id', $variant->id)
                        : $stockQuery->whereNull('product_variant_id');
                }

                $branchStock = $stockQuery->lockForUpdate()->first();
                if (! $branchStock || (int) $branchStock->quantity < $quantity) {
                    throw new HttpException(422, "{$orderItem->product_name} does not have enough stock in the selected branch.");
                }

                $devices = $this->availableDevices($product, $variant, $branchId, $quantity);
                $purchaseCost = $devices->count() === $quantity
                    ? (float) $devices->sum(fn (DeviceUnit $device) => (float) ($device->purchase_cost ?? 0))
                    : ((float) ($variant?->purchase_price ?: $product->purchase_price ?: 0) * $quantity);

                $lineTotal = (float) $orderItem->line_total;
                $profitAmount += $lineTotal - $purchaseCost;

                $prepared[] = compact('orderItem', 'product', 'variant', 'branchStock', 'devices', 'quantity', 'purchaseCost', 'lineTotal');
            }

            $invoiceAllocation = app(BranchInvoiceService::class)->allocate($branchId, $staffId);
            $invoice = $invoiceAllocation['invoice_no'];
            $paidAmount = $isPaid ? min((float) $lockedOrder->paid_amount, (float) $lockedOrder->total_amount) : 0.0;
            $dueAmount = max((float) $lockedOrder->total_amount - $paidAmount, 0.0);

            $sale = Sale::query()->create([
                'invoice_no' => $invoice,
                'branch_invoice_profile_id' => $invoiceAllocation['profile_id'],
                'invoice_profile_snapshot' => $invoiceAllocation['snapshot'],
                'public_token' => sha1(uniqid('nst_web_invoice_', true)),
                'branch_id' => $branchId,
                'customer_id' => $lockedOrder->customer_id,
                'customer_name' => $lockedOrder->customer_name,
                'customer_phone' => $lockedOrder->customer_phone,
                'subtotal' => $lockedOrder->subtotal,
                'discount' => $lockedOrder->discount_amount,
                'invoice_discount_amount' => $lockedOrder->discount_amount,
                'delivery_charge' => $lockedOrder->delivery_charge,
                'total' => max((float) $lockedOrder->subtotal - (float) $lockedOrder->discount_amount, 0),
                'final_amount' => $lockedOrder->total_amount,
                'amount_in_words' => app(NumberToWordsService::class)->taka((float) $lockedOrder->total_amount),
                'paid_amount' => $paidAmount,
                'due_amount' => $dueAmount,
                'profit_amount' => $profitAmount,
                'payment_method' => $lockedOrder->payment_method,
                'payment_status' => $dueAmount > 0 ? ($paidAmount > 0 ? 'partial' : 'due') : 'paid',
                'status' => 'processing',
                'sold_by' => $staffId,
                'payment_received_by' => $isPaid ? $staffId : null,
                'home_delivery' => true,
                'source' => 'web_sale',
                'customer_order_id' => $lockedOrder->id,
                'delivery_status' => 'pending',
                'note' => "Converted from {$lockedOrder->order_no}",
            ]);

            foreach ($prepared as $row) {
                $this->commitItem($sale, $row, $staffId);
            }

            if ($paidAmount > 0) {
                SalePayment::query()->create([
                    'sale_id' => $sale->id,
                    'payment_method' => $lockedOrder->payment_method,
                    'provider_name' => $lockedOrder->payment_method === 'sslcommerz' ? 'SSLCOMMERZ' : null,
                    'transaction_id' => $lockedOrder->transaction_id,
                    'amount' => $paidAmount,
                    'received_by' => $staffId,
                    'note' => "Verified web payment for {$lockedOrder->order_no}",
                ]);
            }

            if ($lockedOrder->customer_id && $dueAmount > 0) {
                $customer = Customer::query()->whereKey($lockedOrder->customer_id)->lockForUpdate()->first();
                if ($customer) {
                    $customer->forceFill([
                        'current_balance' => round((float) $customer->current_balance + $dueAmount, 2),
                        'updated_by' => $staffId,
                    ])->save();
                }
            }

            if (Schema::hasTable('payment_transactions')) {
                PaymentTransaction::query()
                    ->where('customer_order_id', $lockedOrder->id)
                    ->where('status', 'paid')
                    ->update(['sale_id' => $sale->id]);
            }

            if (Schema::hasTable('order_deliveries')) {
                OrderDelivery::query()->firstOrCreate(
                    ['customer_order_id' => $lockedOrder->id],
                    [
                        'sale_id' => $sale->id,
                        'status' => 'pending',
                        'delivery_address' => $lockedOrder->delivery_address,
                        'updated_by' => $staffId,
                    ]
                );
            }

            $lockedOrder->forceFill([
                'sale_id' => $sale->id,
                'invoice_no' => $invoice,
                'branch_id' => $branchId,
                'assigned_staff_id' => $assignedStaffId ?: $staffId,
                'status' => 'processing',
                'custom_status' => 'Authorized Processing',
                'reserved_at' => now(),
                'authorized_at' => now(),
                'delivery_status' => 'pending',
            ])->save();

            if (Schema::hasTable('customer_order_timeline_events')) {
                CustomerOrderTimelineEvent::query()->create([
                    'customer_order_id' => $lockedOrder->id,
                    'event_type' => 'sale_authorized',
                    'status' => 'processing',
                    'title' => 'Order authorized and stock allocated',
                    'description' => "POS invoice {$invoice} created from the web order.",
                    'customer_visible' => true,
                    'metadata' => ['sale_id' => $sale->id, 'invoice_no' => $invoice, 'branch_id' => $branchId],
                    'created_by' => $staffId,
                    'event_at' => now(),
                ]);
            }

            return $sale->fresh(['items.deviceUnit', 'payments', 'branch', 'customer']);
        }, 3);
    }

    private function availableDevices(Product $product, ?ProductVariant $variant, int $branchId, int $quantity): Collection
    {
        if (! Schema::hasTable('device_units')) {
            return collect();
        }

        $base = DeviceUnit::query()
            ->where('branch_id', $branchId)
            ->where('product_id', $product->id)
            ->when(
                $variant && Schema::hasColumn('device_units', 'product_variant_id'),
                fn ($query) => $query->where('product_variant_id', $variant->id)
            );

        $trackedCount = (clone $base)->count();
        if ($trackedCount === 0) {
            return collect();
        }

        $devices = $base
            ->whereIn('status', ['available', 'ready_for_sale'])
            ->when(Schema::hasColumn('device_units', 'saleable'), fn ($query) => $query->where('saleable', true))
            ->orderBy('id')->limit($quantity)->lockForUpdate()->get();
        if ($devices->count() !== $quantity) {
            throw new HttpException(422, "{$product->name} requires {$quantity} available IMEI/device units in the selected branch.");
        }

        return $devices;
    }

    private function commitItem(Sale $sale, array $row, int $staffId): void
    {
        /** @var Product $product */
        $product = $row['product'];
        /** @var ProductVariant|null $variant */
        $variant = $row['variant'];
        /** @var BranchStock $branchStock */
        $branchStock = $row['branchStock'];
        /** @var Collection<int, DeviceUnit> $devices */
        $devices = $row['devices'];
        $quantity = (int) $row['quantity'];
        $orderItem = $row['orderItem'];
        $purchaseCost = (float) $row['purchaseCost'];
        $lineTotal = (float) $row['lineTotal'];
        $unitPrice = (float) $orderItem->unit_price;

        if ($devices->count() === $quantity) {
            $perUnitTotal = $quantity > 0 ? round($lineTotal / $quantity, 2) : 0;
            foreach ($devices as $device) {
                $deviceCost = (float) ($device->purchase_cost ?? 0);
                $saleItem = SaleItem::query()->create($this->safeSaleItem([
                    'sale_id' => $sale->id,
                    'product_id' => $product->id,
                    'product_variant_id' => $variant?->id,
                    'branch_stock_id' => $branchStock->id,
                    'device_unit_id' => $device->id,
                    'product_name' => $orderItem->product_name,
                    'sku' => $orderItem->sku ?: $variant?->sku ?: $product->sku,
                    'imei_1' => $device->imei_1,
                    'imei_2' => $device->imei_2,
                    'device_barcode' => $device->barcode,
                    'ram' => $device->ram ?: $variant?->ram,
                    'storage' => $device->storage ?: $variant?->storage,
                    'color' => $device->color_name ?: $variant?->color_name,
                    'country_region' => $device->country_region ?: $variant?->country_region ?: $variant?->region,
                    'sim_type' => $device->sim_type ?: $variant?->sim_type,
                    'network_carrier' => $device->network_carrier ?: $variant?->network_carrier ?: $variant?->sim_network,
                    'condition' => $device->condition ?: $product->condition,
                    'branch_id' => $sale->branch_id,
                    'quantity' => 1,
                    'purchase_price' => $deviceCost,
                    'rate' => $unitPrice,
                    'sale_price' => $unitPrice,
                    'total' => $perUnitTotal,
                    'profit_amount' => $perUnitTotal - $deviceCost,
                ]));

                $device->forceFill([
                    'status' => 'sold',
                    'saleable' => false,
                    'website_published' => false,
                    'sale_id' => $sale->id,
                    'sale_item_id' => $saleItem->id,
                    'sold_at' => now(),
                    'updated_by' => $staffId,
                ])->save();
            }
        } else {
            SaleItem::query()->create($this->safeSaleItem([
                'sale_id' => $sale->id,
                'product_id' => $product->id,
                'product_variant_id' => $variant?->id,
                'branch_stock_id' => $branchStock->id,
                'product_name' => $orderItem->product_name,
                'sku' => $orderItem->sku ?: $variant?->sku ?: $product->sku,
                'ram' => $variant?->ram,
                'storage' => $variant?->storage,
                'color' => $variant?->color_name,
                'country_region' => $variant?->country_region ?: $variant?->region,
                'sim_type' => $variant?->sim_type,
                'network_carrier' => $variant?->network_carrier ?: $variant?->sim_network,
                'condition' => $product->condition,
                'branch_id' => $sale->branch_id,
                'quantity' => $quantity,
                'purchase_price' => $quantity > 0 ? round($purchaseCost / $quantity, 2) : 0,
                'rate' => $unitPrice,
                'sale_price' => $unitPrice,
                'total' => $lineTotal,
                'profit_amount' => $lineTotal - $purchaseCost,
            ]));
        }

        $before = (int) $branchStock->quantity;
        $after = $before - $quantity;
        $branchStock->forceFill(['quantity' => $after])->save();

        $nextProductStock = (int) ($product->stock_quantity ?? 0) - $quantity;
        if ($nextProductStock < 0) {
            throw new HttpException(409, "Catalog stock is inconsistent for {$product->name}; the sale was not committed.");
        }
        $product->forceFill([
            'stock_quantity' => $nextProductStock,
            'status' => $nextProductStock === 0 ? 'out_of_stock' : 'active',
        ])->save();

        if ($variant) {
            $nextVariantStock = (int) ($variant->stock_quantity ?? 0) - $quantity;
            if ($nextVariantStock < 0) {
                throw new HttpException(409, "Variant stock is inconsistent for {$product->name}; the sale was not committed.");
            }
            $variant->forceFill(['stock_quantity' => $nextVariantStock])->save();
        }

        if (Schema::hasTable('stock_movements')) {
            StockMovement::query()->create([
                'movement_no' => 'SM-WEB-' . now()->format('YmdHis') . '-' . strtoupper(Str::random(5)),
                'branch_id' => $sale->branch_id,
                'product_id' => $product->id,
                'product_variant_id' => $variant?->id,
                'user_id' => $staffId,
                'type' => 'sale',
                'quantity_change' => -$quantity,
                'quantity_before' => $before,
                'quantity_after' => $after,
                'reference_type' => Sale::class,
                'reference_id' => $sale->id,
                'note' => "Web order allocated to invoice {$sale->invoice_no}",
                'movement_at' => now(),
            ]);
        }
    }

    private function safeSaleItem(array $payload): array
    {
        foreach (array_keys($payload) as $column) {
            if (! Schema::hasColumn('sale_items', $column)) {
                unset($payload[$column]);
            }
        }

        return $payload;
    }
}
