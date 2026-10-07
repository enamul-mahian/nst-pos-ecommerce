<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('purchases')) {
            return;
        }

        Schema::table('purchases', function (Blueprint $table) {
            if (!Schema::hasColumn('purchases', 'cash_paid_amount')) {
                $table->decimal('cash_paid_amount', 15, 2)->default(0)->after('paid_amount');
            }

            if (!Schema::hasColumn('purchases', 'advance_applied_amount')) {
                $table->decimal('advance_applied_amount', 15, 2)->default(0)->after('cash_paid_amount');
            }

            if (!Schema::hasColumn('purchases', 'supplier_advance_before')) {
                $table->decimal('supplier_advance_before', 15, 2)->default(0)->after('advance_applied_amount');
            }

            if (!Schema::hasColumn('purchases', 'supplier_advance_after')) {
                $table->decimal('supplier_advance_after', 15, 2)->default(0)->after('supplier_advance_before');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('purchases')) {
            return;
        }

        Schema::table('purchases', function (Blueprint $table) {
            foreach ([
                'cash_paid_amount',
                'advance_applied_amount',
                'supplier_advance_before',
                'supplier_advance_after',
            ] as $column) {
                if (Schema::hasColumn('purchases', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};