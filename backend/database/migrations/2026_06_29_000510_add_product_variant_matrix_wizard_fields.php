<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->ensureProductWizardColumns();
        $this->ensureProductVariantMatrixColumns();
        $this->ensureTrackingColumns();
        $this->createDefaultVariantsForOldProducts();
    }

    private function addColumnIfMissing(string $table, string $column, callable $callback): void
    {
        if (!Schema::hasTable($table) || Schema::hasColumn($table, $column)) {
            return;
        }

        Schema::table($table, function (Blueprint $tableBlueprint) use ($callback) {
            $callback($tableBlueprint);
        });
    }

    private function ensureProductWizardColumns(): void
    {
        if (!Schema::hasTable('products')) {
            return;
        }

        $this->addColumnIfMissing('products', 'product_type', fn (Blueprint $table) => $table->string('product_type')->nullable()->after('condition'));
        $this->addColumnIfMissing('products', 'source_type', fn (Blueprint $table) => $table->string('source_type')->nullable()->after('product_type'));
        $this->addColumnIfMissing('products', 'battery_health', fn (Blueprint $table) => $table->string('battery_health')->nullable()->after('source_type'));
        $this->addColumnIfMissing('products', 'notes', fn (Blueprint $table) => $table->text('notes')->nullable()->after('battery_health'));
        $this->addColumnIfMissing('products', 'meta_keywords', fn (Blueprint $table) => $table->text('meta_keywords')->nullable()->after('meta_description'));
        $this->addColumnIfMissing('products', 'og_title', fn (Blueprint $table) => $table->string('og_title')->nullable()->after('canonical_url'));
        $this->addColumnIfMissing('products', 'og_description', fn (Blueprint $table) => $table->text('og_description')->nullable()->after('og_title'));
        $this->addColumnIfMissing('products', 'schema_data', fn (Blueprint $table) => $table->longText('schema_data')->nullable()->after('og_image'));
        $this->addColumnIfMissing('products', 'ram_options', fn (Blueprint $table) => $table->json('ram_options')->nullable()->after('storage_options'));
        $this->addColumnIfMissing('products', 'variant_type_options', fn (Blueprint $table) => $table->json('variant_type_options')->nullable()->after('region_options'));
        $this->addColumnIfMissing('products', 'feature_blocks', fn (Blueprint $table) => $table->json('feature_blocks')->nullable()->after('key_features'));
        $this->addColumnIfMissing('products', 'specification_groups', fn (Blueprint $table) => $table->json('specification_groups')->nullable()->after('specifications'));
    }

    private function ensureProductVariantMatrixColumns(): void
    {
        if (!Schema::hasTable('product_variants')) {
            return;
        }

        $this->addColumnIfMissing('product_variants', 'color_name', fn (Blueprint $table) => $table->string('color_name')->nullable()->after('condition'));
        $this->addColumnIfMissing('product_variants', 'region', fn (Blueprint $table) => $table->string('region')->nullable()->after('color_name'));
        $this->addColumnIfMissing('product_variants', 'variant_type', fn (Blueprint $table) => $table->string('variant_type')->nullable()->after('region'));
        $this->addColumnIfMissing('product_variants', 'ram', fn (Blueprint $table) => $table->string('ram')->nullable()->after('variant_type'));
        $this->addColumnIfMissing('product_variants', 'storage', fn (Blueprint $table) => $table->string('storage')->nullable()->after('ram'));
        $this->addColumnIfMissing('product_variants', 'product_type', fn (Blueprint $table) => $table->string('product_type')->nullable()->after('storage'));
        $this->addColumnIfMissing('product_variants', 'market_price', fn (Blueprint $table) => $table->decimal('market_price', 15, 2)->nullable()->after('sale_price'));
        $this->addColumnIfMissing('product_variants', 'attributes', fn (Blueprint $table) => $table->json('attributes')->nullable()->after('warranty'));

        try {
            Schema::table('product_variants', function (Blueprint $table) {
                $table->index(['product_id', 'status'], 'pv_product_status_idx');
            });
        } catch (Throwable $e) {
            // Index may already exist on some local databases.
        }
    }

    private function ensureTrackingColumns(): void
    {
        foreach (['branch_stocks', 'purchase_items', 'sale_items', 'device_units'] as $tableName) {
            if (!Schema::hasTable($tableName)) {
                continue;
            }

            $this->addColumnIfMissing($tableName, 'product_variant_id', function (Blueprint $table) use ($tableName) {
                $after = Schema::hasColumn($tableName, 'product_id') ? 'product_id' : null;
                $column = $table->unsignedBigInteger('product_variant_id')->nullable();
                if ($after) {
                    $column->after($after);
                }
            });
        }

        if (Schema::hasTable('device_units')) {
            $this->addColumnIfMissing('device_units', 'color_name', fn (Blueprint $table) => $table->string('color_name')->nullable()->after('sku'));
            $this->addColumnIfMissing('device_units', 'region', fn (Blueprint $table) => $table->string('region')->nullable()->after('color_name'));
            $this->addColumnIfMissing('device_units', 'variant_type', fn (Blueprint $table) => $table->string('variant_type')->nullable()->after('region'));
            $this->addColumnIfMissing('device_units', 'ram', fn (Blueprint $table) => $table->string('ram')->nullable()->after('variant_type'));
            $this->addColumnIfMissing('device_units', 'storage', fn (Blueprint $table) => $table->string('storage')->nullable()->after('ram'));
            $this->addColumnIfMissing('device_units', 'condition', fn (Blueprint $table) => $table->string('condition')->nullable()->after('storage'));
            $this->addColumnIfMissing('device_units', 'battery_health', fn (Blueprint $table) => $table->string('battery_health')->nullable()->after('condition'));
        }
    }

    private function createDefaultVariantsForOldProducts(): void
    {
        if (!Schema::hasTable('products') || !Schema::hasTable('product_variants')) {
            return;
        }

        $products = DB::table('products')
            ->select(['id', 'name', 'sku', 'barcode', 'condition', 'purchase_price', 'sale_price', 'regular_price', 'discount_price', 'stock_quantity', 'low_stock_alert', 'warranty', 'status'])
            ->orderBy('id')
            ->get();

        foreach ($products as $product) {
            $exists = DB::table('product_variants')->where('product_id', $product->id)->exists();

            if ($exists) {
                continue;
            }

            DB::table('product_variants')->insert([
                'product_id' => $product->id,
                'variant_name' => 'Default Variant',
                'condition' => $product->condition ?: 'new',
                'sku' => $product->sku ?: ('NSTV-' . str_pad((string) $product->id, 6, '0', STR_PAD_LEFT)),
                'barcode_mode' => 'auto',
                'barcode' => $product->barcode ?: ('NSTV' . str_pad((string) $product->id, 10, '0', STR_PAD_LEFT)),
                'purchase_price' => (float) ($product->purchase_price ?? 0),
                'sale_price' => (float) ($product->sale_price ?? 0),
                'market_price' => (float) ($product->regular_price ?? $product->sale_price ?? 0),
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

    public function down(): void
    {
        // Safe migration: no destructive rollback. Existing business data stays intact.
    }
};
