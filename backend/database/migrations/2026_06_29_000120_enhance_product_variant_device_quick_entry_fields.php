<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('product_variants')) {
            Schema::table('product_variants', function (Blueprint $table) {
                if (! Schema::hasColumn('product_variants', 'color_name')) {
                    $table->string('color_name')->nullable()->after('variant_name');
                }
                if (! Schema::hasColumn('product_variants', 'region')) {
                    $table->string('region')->nullable()->after('color_name');
                }
                if (! Schema::hasColumn('product_variants', 'sim_network')) {
                    $table->string('sim_network')->nullable()->after('region');
                }
                if (! Schema::hasColumn('product_variants', 'ram')) {
                    $table->string('ram')->nullable()->after('sim_network');
                }
                if (! Schema::hasColumn('product_variants', 'storage')) {
                    $table->string('storage')->nullable()->after('ram');
                }
                if (! Schema::hasColumn('product_variants', 'product_type')) {
                    $table->string('product_type')->nullable()->after('storage');
                }
                if (! Schema::hasColumn('product_variants', 'market_price')) {
                    $table->decimal('market_price', 15, 2)->default(0)->after('sale_price');
                }
                if (! Schema::hasColumn('product_variants', 'branch_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('market_price');
                    $table->index('branch_id');
                }
                if (! Schema::hasColumn('product_variants', 'imei_1')) {
                    $table->string('imei_1')->nullable()->after('branch_id');
                    $table->index('imei_1');
                }
                if (! Schema::hasColumn('product_variants', 'imei_2')) {
                    $table->string('imei_2')->nullable()->after('imei_1');
                    $table->index('imei_2');
                }
                if (! Schema::hasColumn('product_variants', 'battery_health')) {
                    $table->unsignedTinyInteger('battery_health')->nullable()->after('imei_2');
                }
            });
        }

        if (Schema::hasTable('device_units')) {
            Schema::table('device_units', function (Blueprint $table) {
                if (! Schema::hasColumn('device_units', 'product_variant_id')) {
                    $table->unsignedBigInteger('product_variant_id')->nullable()->after('product_id');
                    $table->index('product_variant_id');
                }
                if (! Schema::hasColumn('device_units', 'color_name')) {
                    $table->string('color_name')->nullable()->after('sku');
                }
                if (! Schema::hasColumn('device_units', 'region')) {
                    $table->string('region')->nullable()->after('color_name');
                }
                if (! Schema::hasColumn('device_units', 'sim_network')) {
                    $table->string('sim_network')->nullable()->after('region');
                }
                if (! Schema::hasColumn('device_units', 'ram')) {
                    $table->string('ram')->nullable()->after('sim_network');
                }
                if (! Schema::hasColumn('device_units', 'storage')) {
                    $table->string('storage')->nullable()->after('ram');
                }
                if (! Schema::hasColumn('device_units', 'battery_health')) {
                    $table->unsignedTinyInteger('battery_health')->nullable()->after('storage');
                }
            });
        }

        if (Schema::hasTable('branch_stocks') && ! Schema::hasColumn('branch_stocks', 'product_variant_id')) {
            Schema::table('branch_stocks', function (Blueprint $table) {
                $table->unsignedBigInteger('product_variant_id')->nullable()->after('product_id');
                $table->index('product_variant_id');
            });
        }
    }

    public function down(): void
    {
        // Safe migration: no destructive rollback to protect live stock/device data.
    }
};
