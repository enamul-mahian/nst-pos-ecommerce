<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('supplier_payments')) {
            return;
        }

        Schema::table('supplier_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('supplier_payments', 'payment_slip_path')) {
                $table->string('payment_slip_path')->nullable()->after('transaction_id');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('supplier_payments')) {
            return;
        }

        Schema::table('supplier_payments', function (Blueprint $table) {
            if (Schema::hasColumn('supplier_payments', 'payment_slip_path')) {
                $table->dropColumn('payment_slip_path');
            }
        });
    }
};