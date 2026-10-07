<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_variants', function (Blueprint $table) {
            if (!Schema::hasColumn('product_variants', 'branch_id')) {
                $table->unsignedBigInteger('branch_id')->nullable()->after('product_id');
            }
            if (!Schema::hasColumn('product_variants', 'supplier_id')) {
                $table->unsignedBigInteger('supplier_id')->nullable()->after('branch_id');
            }
            if (!Schema::hasColumn('product_variants', 'color_name')) {
                $table->string('color_name')->nullable()->after('status');
            }
            if (!Schema::hasColumn('product_variants', 'region')) {
                $table->string('region')->nullable()->after('color_name');
            }
            if (!Schema::hasColumn('product_variants', 'sim_network')) {
                $table->string('sim_network')->nullable()->after('region');
            }
            if (!Schema::hasColumn('product_variants', 'ram')) {
                $table->string('ram')->nullable()->after('sim_network');
            }
            if (!Schema::hasColumn('product_variants', 'storage')) {
                $table->string('storage')->nullable()->after('ram');
            }
            if (!Schema::hasColumn('product_variants', 'market_price')) {
                $table->decimal('market_price', 14, 2)->nullable()->after('sale_price');
            }
            if (!Schema::hasColumn('product_variants', 'imei_1')) {
                $table->string('imei_1')->nullable()->after('barcode');
            }
            if (!Schema::hasColumn('product_variants', 'imei_2')) {
                $table->string('imei_2')->nullable()->after('imei_1');
            }
            if (!Schema::hasColumn('product_variants', 'battery_health')) {
                $table->unsignedTinyInteger('battery_health')->nullable()->after('storage');
            }
            if (!Schema::hasColumn('product_variants', 'device_status')) {
                $table->string('device_status')->default('inactive')->after('status');
            }
            if (!Schema::hasColumn('product_variants', 'short_note')) {
                $table->text('short_note')->nullable()->after('warranty');
            }
            if (!Schema::hasColumn('product_variants', 'opening_stock_quantity')) {
                $table->integer('opening_stock_quantity')->default(0)->after('stock_quantity');
            }
            if (!Schema::hasColumn('product_variants', 'imei_tracking')) {
                $table->boolean('imei_tracking')->default(true)->after('opening_stock_quantity');
            }
        });

        Schema::table('product_images', function (Blueprint $table) {
            if (!Schema::hasColumn('product_images', 'product_variant_id')) {
                $table->unsignedBigInteger('product_variant_id')->nullable()->after('product_id');
            }
            if (!Schema::hasColumn('product_images', 'variant_key')) {
                $table->string('variant_key')->nullable()->after('product_variant_id');
            }
        });

        Schema::table('device_units', function (Blueprint $table) {
            if (!Schema::hasColumn('device_units', 'product_variant_id')) {
                $table->unsignedBigInteger('product_variant_id')->nullable()->after('product_id');
            }
            if (!Schema::hasColumn('device_units', 'color_name')) {
                $table->string('color_name')->nullable()->after('sku');
            }
            if (!Schema::hasColumn('device_units', 'region')) {
                $table->string('region')->nullable()->after('color_name');
            }
            if (!Schema::hasColumn('device_units', 'sim_network')) {
                $table->string('sim_network')->nullable()->after('region');
            }
            if (!Schema::hasColumn('device_units', 'ram')) {
                $table->string('ram')->nullable()->after('sim_network');
            }
            if (!Schema::hasColumn('device_units', 'storage')) {
                $table->string('storage')->nullable()->after('ram');
            }
            if (!Schema::hasColumn('device_units', 'battery_health')) {
                $table->unsignedTinyInteger('battery_health')->nullable()->after('storage');
            }
            if (!Schema::hasColumn('device_units', 'activation_status')) {
                $table->string('activation_status')->default('inactive')->after('status');
            }
            if (!Schema::hasColumn('device_units', 'market_price')) {
                $table->decimal('market_price', 14, 2)->nullable()->after('selling_price');
            }
        });

        Schema::table('branch_stocks', function (Blueprint $table) {
            if (!Schema::hasColumn('branch_stocks', 'product_variant_id')) {
                $table->unsignedBigInteger('product_variant_id')->nullable()->after('product_id');
            }
        });
    }

    public function down(): void
    {
        // Safe migration: no destructive rollback for production/demo data.
    }
};
