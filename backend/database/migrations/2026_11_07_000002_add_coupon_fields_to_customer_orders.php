<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('customer_orders')) {
            return;
        }

        Schema::table('customer_orders', function (Blueprint $table) {
            if (! Schema::hasColumn('customer_orders', 'coupon_code')) {
                $table->string('coupon_code', 80)->nullable()->index();
            }
            if (! Schema::hasColumn('customer_orders', 'coupon_discount')) {
                $table->decimal('coupon_discount', 15, 2)->default(0);
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('customer_orders')) {
            return;
        }

        Schema::table('customer_orders', function (Blueprint $table) {
            if (Schema::hasColumn('customer_orders', 'coupon_code')) {
                $table->dropColumn('coupon_code');
            }
            if (Schema::hasColumn('customer_orders', 'coupon_discount')) {
                $table->dropColumn('coupon_discount');
            }
        });
    }
};
