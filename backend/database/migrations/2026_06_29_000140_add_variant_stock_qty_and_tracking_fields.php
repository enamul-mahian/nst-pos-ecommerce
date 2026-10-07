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
                if (! Schema::hasColumn('product_variants', 'stock_entry_type')) {
                    $table->string('stock_entry_type')->default('opening_stock')->after('stock_quantity');
                }
                if (! Schema::hasColumn('product_variants', 'opening_stock_quantity')) {
                    $table->unsignedInteger('opening_stock_quantity')->default(0)->after('stock_entry_type');
                }
                if (! Schema::hasColumn('product_variants', 'imei_tracking')) {
                    $table->boolean('imei_tracking')->default(true)->after('opening_stock_quantity');
                }
            });
        }
    }

    public function down(): void
    {
        // Safe migration: no destructive rollback to protect stock data.
    }
};
