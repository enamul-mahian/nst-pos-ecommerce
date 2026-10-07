<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('used_purchases', function (Blueprint $table) {
            $afterColumn = Schema::hasColumn('used_purchases', 'purchase_type') ? 'purchase_type' : 'id';

            if (!Schema::hasColumn('used_purchases', 'seller_type')) {
                $table->string('seller_type')->default('customer')->after($afterColumn);
            }

            if (!Schema::hasColumn('used_purchases', 'customer_id')) {
                $table->foreignId('customer_id')
                    ->nullable()
                    ->after('seller_type')
                    ->constrained('customers')
                    ->nullOnDelete();
            }

            if (!Schema::hasColumn('used_purchases', 'supplier_id')) {
                $table->foreignId('supplier_id')
                    ->nullable()
                    ->after('customer_id')
                    ->constrained('suppliers')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('used_purchases', function (Blueprint $table) {
            if (Schema::hasColumn('used_purchases', 'supplier_id')) {
                $table->dropConstrainedForeignId('supplier_id');
            }

            if (Schema::hasColumn('used_purchases', 'customer_id')) {
                $table->dropConstrainedForeignId('customer_id');
            }

            if (Schema::hasColumn('used_purchases', 'seller_type')) {
                $table->dropColumn('seller_type');
            }
        });
    }
};
