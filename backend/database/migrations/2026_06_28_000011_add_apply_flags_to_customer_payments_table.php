<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('customer_payments')) {
            return;
        }

        Schema::table('customer_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('customer_payments', 'is_applied_to_sales')) {
                $table->boolean('is_applied_to_sales')->default(false)->after('extra_amount');
            }

            if (!Schema::hasColumn('customer_payments', 'applied_at')) {
                $table->timestamp('applied_at')->nullable()->after('is_applied_to_sales');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('customer_payments')) {
            return;
        }

        Schema::table('customer_payments', function (Blueprint $table) {
            if (Schema::hasColumn('customer_payments', 'applied_at')) {
                $table->dropColumn('applied_at');
            }

            if (Schema::hasColumn('customer_payments', 'is_applied_to_sales')) {
                $table->dropColumn('is_applied_to_sales');
            }
        });
    }
};