<?php

namespace App\Services;

use App\Models\BranchStock;
use App\Models\DeviceUnit;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ProductVariantMatrixService
{
    public function ensureDefaultVariant(Product $product): ProductVariant
    {
        $variant = ProductVariant::where('product_id', $product->id)->orderBy('id')->first();

        if ($variant) {
            return $variant;
        }

        return ProductVariant::create([
            'product_id' => $product->id,
            'variant_name' => 'Default Variant',
            'attribute_values' => ['Default' => 'Default Variant'],
            'condition' => $product->condition ?: 'new',
            'sku' => $this->uniqueValue('product_variants', 'sku', ($product->sku ?: 'NSTV') . '-DEF-' . $product->id),
            'barcode_mode' => 'auto',
            'barcode' => $this->uniqueValue('product_variants', 'barcode', ($product->barcode ?: 'NSTV') . '-V-' . $product->id),
            'purchase_price' => (float) ($product->purchase_price ?? 0),
            'sale_price' => (float) ($product->sale_price ?? 0),
            'regular_price' => $product->regular_price,
            'discount_price' => $product->discount_price,
            'stock_quantity' => (int) ($product->stock_quantity ?? 0),
            'low_stock_alert' => (int) ($product->low_stock_alert ?? 5),
            'warranty' => $product->warranty,
            'status' => $product->status ?: 'active',
        ]);
    }

    public function formatVariant(ProductVariant $variant, ?int $branchId = null): array
    {
        $product = $variant->relationLoaded('product') ? $variant->product : $variant->product()->first();
        $branchStockQty = $this->branchStockQuantity((int) $variant->id, $branchId);
        $availableDeviceQty = $this->availableDeviceQuantity((int) $variant->id, $branchId);
        $totalStock = max($branchStockQty, $availableDeviceQty, (int) ($variant->stock_quantity ?? 0));

        return [
            'id' => $variant->id,
            'product_id' => $variant->product_id,
            'product_name' => $product?->name,
            'product_sku' => $product?->sku,
            'product_barcode' => $product?->barcode,
            'variant_name' => $variant->variant_name,
            'display_name' => $variant->display_name,
            'attribute_text' => $variant->attribute_text,
            'attribute_values' => $variant->attribute_values ?: [],
            'storage' => $variant->storage,
            'ram' => $variant->ram ?: $variant->ram_storage,
            'color' => $variant->color_name ?: $variant->color,
            'country_region' => $variant->country_region ?: $variant->region ?: $variant->region_variant,
            'sim_type' => $variant->sim_type,
            'network_carrier' => $variant->network_carrier ?: $variant->sim_network,
            'region_variant' => $variant->region_variant,
            'ram_storage' => $variant->ram_storage,
            'sim_network' => $variant->sim_network,
            'condition' => $variant->condition ?: $product?->condition,
            'sku' => $variant->sku,
            'barcode' => $variant->barcode,
            'purchase_price' => (float) ($variant->purchase_price ?? 0),
            'sale_price' => (float) ($variant->sale_price ?: $variant->discount_price ?: $variant->regular_price ?: $product?->sale_price ?: 0),
            'regular_price' => (float) ($variant->regular_price ?? 0),
            'discount_price' => (float) ($variant->discount_price ?? 0),
            'branch_stock_quantity' => $branchStockQty,
            'available_device_count' => $availableDeviceQty,
            'stock_quantity' => $totalStock,
            'total_stock' => $totalStock,
            'warranty' => $variant->warranty,
            'warranty_period_months' => $variant->warranty_period_months,
            'warranty_terms' => $variant->warranty_terms,
            'status' => $variant->status,
        ];
    }

    public function branchStockQuantity(int $variantId, ?int $branchId = null): int
    {
        if (! Schema::hasTable('branch_stocks') || ! Schema::hasColumn('branch_stocks', 'product_variant_id')) {
            return 0;
        }

        $query = BranchStock::where('product_variant_id', $variantId);

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        return (int) $query->sum('quantity');
    }

    public function availableDeviceQuantity(int $variantId, ?int $branchId = null): int
    {
        if (! Schema::hasTable('device_units') || ! Schema::hasColumn('device_units', 'product_variant_id')) {
            return 0;
        }

        $query = DeviceUnit::where('product_variant_id', $variantId)
            ->whereIn('status', ['available', 'ready_for_sale'])
            ->when(Schema::hasColumn('device_units', 'saleable'), fn ($q) => $q->where('saleable', true));

        if ($branchId) {
            $query->where('branch_id', $branchId);
        }

        return (int) $query->count();
    }

    public function recomputeProductStock(int $productId): void
    {
        if (! Schema::hasTable('product_variants')) {
            return;
        }

        $variants = ProductVariant::where('product_id', $productId)->get();

        foreach ($variants as $variant) {
            $variant->update([
                'stock_quantity' => max($this->branchStockQuantity((int) $variant->id), $this->availableDeviceQuantity((int) $variant->id)),
            ]);
        }

        if (Schema::hasColumn('products', 'stock_quantity')) {
            $total = (int) ProductVariant::where('product_id', $productId)->sum('stock_quantity');
            Product::where('id', $productId)->update([
                'stock_quantity' => $total,
            ]);
        }
    }

    public function uniqueValue(string $table, string $column, string $base): string
    {
        $value = Str::upper(Str::slug((string) $base, '-'));
        if ($value === '') {
            $value = 'NST-' . random_int(100000, 999999);
        }
        $value = Str::limit($value, 90, '');
        $candidate = $value;
        $counter = 1;

        while (DB::table($table)->where($column, $candidate)->exists()) {
            $candidate = Str::limit($value . '-' . $counter, 100, '');
            $counter++;
        }

        return $candidate;
    }
}
