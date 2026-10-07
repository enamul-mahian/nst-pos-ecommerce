<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('used_purchases', function (Blueprint $table) {
            if (!Schema::hasColumn('used_purchases', 'ready_product_id')) {
                $table->foreignId('ready_product_id')
                    ->nullable()
                    ->after('status')
                    ->constrained('products')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('used_purchases', 'ready_sale_price')) {
                $table->decimal('ready_sale_price', 12, 2)
                    ->nullable()
                    ->after('purchase_price');
            }

            if (!Schema::hasColumn('used_purchases', 'converted_to_stock_at')) {
                $table->timestamp('converted_to_stock_at')
                    ->nullable()
                    ->after('ready_product_id');
            }

            if (!Schema::hasColumn('used_purchases', 'converted_by')) {
                $table->foreignId('converted_by')
                    ->nullable()
                    ->after('converted_to_stock_at')
                    ->constrained('users')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('used_purchases', function (Blueprint $table) {
            if (Schema::hasColumn('used_purchases', 'converted_by')) {
                $table->dropConstrainedForeignId('converted_by');
            }

            if (Schema::hasColumn('used_purchases', 'converted_to_stock_at')) {
                $table->dropColumn('converted_to_stock_at');
            }

            if (Schema::hasColumn('used_purchases', 'ready_sale_price')) {
                $table->dropColumn('ready_sale_price');
            }

            if (Schema::hasColumn('used_purchases', 'ready_product_id')) {
                $table->dropConstrainedForeignId('ready_product_id');
            }
        });
    }
};
