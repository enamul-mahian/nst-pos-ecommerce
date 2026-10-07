<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        $this->createVariantGroupTables();
        $this->ensureProductVariantColumns();
        $this->ensureLinkedVariantColumns();
        $this->ensureDefaultVariants();
        $this->backfillExistingRows();
        $this->refreshVariantAndProductStock();
    }

    public function down(): void
    {
        // Data-safe migration. Rollback intentionally keeps columns/tables to avoid losing stock mapping.
    }

    private function createVariantGroupTables(): void
    {
        if (! Schema::hasTable('product_variant_groups')) {
            Schema::create('product_variant_groups', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('product_id');
                $table->string('name');
                $table->string('slug')->nullable();
                $table->unsignedInteger('sort_order')->default(0);
                $table->boolean('is_required')->default(true);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->index(['product_id', 'slug']);
            });
        }

        if (! Schema::hasTable('product_variant_options')) {
            Schema::create('product_variant_options', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('product_id');
                $table->unsignedBigInteger('variant_group_id');
                $table->string('value');
                $table->string('slug')->nullable();
                $table->string('image')->nullable();
                $table->string('hex_color', 50)->nullable();
                $table->unsignedInteger('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->index(['product_id', 'variant_group_id']);
                $table->index(['product_id', 'slug']);
            });
        }
    }

    private function ensureProductVariantColumns(): void
    {
        if (! Schema::hasTable('product_variants')) {
            Schema::create('product_variants', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('product_id');
                $table->string('variant_name')->nullable();
                $table->json('attribute_values')->nullable();
                $table->string('color')->nullable();
                $table->string('storage')->nullable();
                $table->string('region_variant')->nullable();
                $table->string('ram_storage')->nullable();
                $table->string('sim_network')->nullable();
                $table->string('condition')->default('new');
                $table->string('sku')->nullable()->unique();
                $table->string('barcode_mode')->default('auto');
                $table->string('barcode')->nullable()->unique();
                $table->decimal('purchase_price', 15, 2)->default(0);
                $table->decimal('sale_price', 15, 2)->default(0);
                $table->decimal('regular_price', 15, 2)->nullable();
                $table->decimal('discount_price', 15, 2)->nullable();
                $table->integer('stock_quantity')->default(0);
                $table->integer('reserved_quantity')->default(0);
                $table->integer('low_stock_alert')->default(5);
                $table->string('warranty')->nullable();
                $table->unsignedInteger('warranty_period_months')->nullable();
                $table->text('warranty_terms')->nullable();
                $table->string('image')->nullable();
                $table->string('status')->default('active');
                $table->timestamps();
                $table->index(['product_id', 'status']);
            });

            return;
        }

        Schema::table('product_variants', function (Blueprint $table) {
            $columns = Schema::getColumnListing('product_variants');

            if (! in_array('attribute_values', $columns, true)) {
                $table->json('attribute_values')->nullable()->after('variant_name');
            }
            if (! in_array('color', $columns, true)) {
                $table->string('color')->nullable()->after('attribute_values');
            }
            if (! in_array('storage', $columns, true)) {
                $table->string('storage')->nullable()->after('color');
            }
            if (! in_array('region_variant', $columns, true)) {
                $table->string('region_variant')->nullable()->after('storage');
            }
            if (! in_array('ram_storage', $columns, true)) {
                $table->string('ram_storage')->nullable()->after('region_variant');
            }
            if (! in_array('sim_network', $columns, true)) {
                $table->string('sim_network')->nullable()->after('ram_storage');
            }
            if (! in_array('reserved_quantity', $columns, true)) {
                $table->integer('reserved_quantity')->default(0)->after('stock_quantity');
            }
            if (! in_array('warranty_period_months', $columns, true)) {
                $table->unsignedInteger('warranty_period_months')->nullable()->after('warranty');
            }
            if (! in_array('warranty_terms', $columns, true)) {
                $table->text('warranty_terms')->nullable()->after('warranty_period_months');
            }
            if (! in_array('image', $columns, true)) {
                $table->string('image')->nullable()->after('warranty_terms');
            }
        });
    }

    private function ensureLinkedVariantColumns(): void
    {
        foreach (['branch_stocks', 'device_units', 'purchase_items', 'sale_items'] as $tableName) {
            if (! Schema::hasTable($tableName) || Schema::hasColumn($tableName, 'product_variant_id')) {
                continue;
            }

            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                $after = Schema::hasColumn($tableName, 'product_id') ? 'product_id' : 'id';
                $table->unsignedBigInteger('product_variant_id')->nullable()->after($after)->index();
            });
        }
    }

    private function ensureDefaultVariants(): void
    {
        if (! Schema::hasTable('products') || ! Schema::hasTable('product_variants')) {
            return;
        }

        $products = DB::table('products')->select('id', 'name', 'sku', 'barcode', 'condition', 'purchase_price', 'sale_price', 'regular_price', 'discount_price', 'stock_quantity', 'low_stock_alert', 'warranty', 'status')->get();

        foreach ($products as $product) {
            $exists = DB::table('product_variants')->where('product_id', $product->id)->exists();

            if ($exists) {
                continue;
            }

            $sku = $this->uniqueValue('product_variants', 'sku', ($product->sku ?: 'NSTV') . '-DEF-' . $product->id);
            $barcode = $this->uniqueValue('product_variants', 'barcode', ($product->barcode ?: 'NSTV') . '-V-' . $product->id);

            DB::table('product_variants')->insert([
                'product_id' => $product->id,
                'variant_name' => 'Default Variant',
                'attribute_values' => json_encode(['Default' => 'Default Variant'], JSON_UNESCAPED_UNICODE),
                'condition' => $product->condition ?: 'new',
                'sku' => $sku,
                'barcode_mode' => 'auto',
                'barcode' => $barcode,
                'purchase_price' => (float) ($product->purchase_price ?? 0),
                'sale_price' => (float) ($product->sale_price ?? 0),
                'regular_price' => $product->regular_price,
                'discount_price' => $product->discount_price,
                'stock_quantity' => (int) ($product->stock_quantity ?? 0),
                'low_stock_alert' => (int) ($product->low_stock_alert ?? 5),
                'warranty' => $product->warranty,
                'status' => $product->status ?: 'active',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function backfillExistingRows(): void
    {
        if (! Schema::hasTable('product_variants')) {
            return;
        }

        foreach (['branch_stocks', 'device_units', 'purchase_items', 'sale_items'] as $tableName) {
            if (! Schema::hasTable($tableName) || ! Schema::hasColumn($tableName, 'product_id') || ! Schema::hasColumn($tableName, 'product_variant_id')) {
                continue;
            }

            $rows = DB::table($tableName)->select('id', 'product_id')->whereNull('product_variant_id')->whereNotNull('product_id')->get();

            foreach ($rows as $row) {
                $variantId = DB::table('product_variants')->where('product_id', $row->product_id)->orderBy('id')->value('id');

                if ($variantId) {
                    DB::table($tableName)->where('id', $row->id)->update(['product_variant_id' => $variantId]);
                }
            }
        }
    }

    private function refreshVariantAndProductStock(): void
    {
        if (! Schema::hasTable('product_variants')) {
            return;
        }

        $variants = DB::table('product_variants')->select('id', 'product_id', 'stock_quantity')->get();

        foreach ($variants as $variant) {
            $branchQty = 0;
            if (Schema::hasTable('branch_stocks') && Schema::hasColumn('branch_stocks', 'product_variant_id')) {
                $branchQty = (int) DB::table('branch_stocks')->where('product_variant_id', $variant->id)->sum('quantity');
            }

            $availableDeviceQty = 0;
            if (Schema::hasTable('device_units') && Schema::hasColumn('device_units', 'product_variant_id')) {
                $availableDeviceQty = (int) DB::table('device_units')
                    ->where('product_variant_id', $variant->id)
                    ->where('status', 'available')
                    ->count();
            }

            $qty = max($branchQty, $availableDeviceQty, (int) ($variant->stock_quantity ?? 0));
            DB::table('product_variants')->where('id', $variant->id)->update(['stock_quantity' => $qty, 'updated_at' => now()]);
        }

        if (! Schema::hasTable('products') || ! Schema::hasColumn('products', 'stock_quantity')) {
            return;
        }

        $productIds = DB::table('product_variants')->distinct()->pluck('product_id');
        foreach ($productIds as $productId) {
            $total = (int) DB::table('product_variants')->where('product_id', $productId)->sum('stock_quantity');
            DB::table('products')->where('id', $productId)->update([
                'stock_quantity' => $total,
                'updated_at' => now(),
            ]);
        }
    }

    private function uniqueValue(string $table, string $column, string $base): string
    {
        $value = Str::limit(Str::upper(Str::slug((string) $base, '-')), 80, '');
        if ($value === '') {
            $value = 'NSTV-' . random_int(100000, 999999);
        }

        $candidate = $value;
        $counter = 1;

        while (DB::table($table)->where($column, $candidate)->exists()) {
            $candidate = Str::limit($value . '-' . $counter, 100, '');
            $counter++;
        }

        return $candidate;
    }
};
