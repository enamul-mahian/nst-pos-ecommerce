<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('used_purchases', function (Blueprint $table) {
            if (!Schema::hasColumn('used_purchases', 'purchase_type')) {
                $table->string('purchase_type')->default('used')->after('id');
            }

            if (!Schema::hasColumn('used_purchases', 'branch_id')) {
                $table->foreignId('branch_id')
                    ->nullable()
                    ->after('purchase_type')
                    ->constrained('branches')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('used_purchases', 'brand_id')) {
                $table->foreignId('brand_id')
                    ->nullable()
                    ->after('product_name')
                    ->constrained('brands')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('used_purchases', 'battery_health')) {
                $table->unsignedTinyInteger('battery_health')->nullable()->after('imei_2');
            }
        });
    }

    public function down(): void
    {
        Schema::table('used_purchases', function (Blueprint $table) {
            if (Schema::hasColumn('used_purchases', 'battery_health')) {
                $table->dropColumn('battery_health');
            }

            if (Schema::hasColumn('used_purchases', 'brand_id')) {
                $table->dropConstrainedForeignId('brand_id');
            }

            if (Schema::hasColumn('used_purchases', 'branch_id')) {
                $table->dropConstrainedForeignId('branch_id');
            }

            if (Schema::hasColumn('used_purchases', 'purchase_type')) {
                $table->dropColumn('purchase_type');
            }
        });
    }
};