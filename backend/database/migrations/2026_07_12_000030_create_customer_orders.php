<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('customer_orders')) {
            Schema::create('customer_orders', function (Blueprint $table) {
                $table->id();
                $table->string('order_no', 60)->unique();
                $table->unsignedBigInteger('customer_id')->nullable()->index();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->string('status', 60)->default('order_recorded')->index();
                $table->string('custom_status', 190)->default('Order Recorded');
                $table->string('payment_method', 60)->default('cash_on_delivery')->index();
                $table->string('payment_status', 60)->default('cod_pending')->index();
                $table->string('transaction_id', 190)->nullable()->index();
                $table->decimal('paid_amount', 15, 2)->default(0);
                $table->decimal('subtotal', 15, 2)->default(0);
                $table->decimal('discount_amount', 15, 2)->default(0);
                $table->decimal('delivery_charge', 15, 2)->default(0);
                $table->decimal('total_amount', 15, 2)->default(0);
                $table->string('customer_name');
                $table->string('customer_phone', 60)->index();
                $table->string('customer_email')->nullable();
                $table->text('delivery_address');
                $table->string('current_location')->nullable();
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->string('promo_code', 100)->nullable();
                $table->text('customer_note')->nullable();
                $table->string('source', 60)->default('website');
                $table->json('status_history')->nullable();
                $table->unsignedBigInteger('payment_reviewed_by')->nullable()->index();
                $table->timestamp('payment_reviewed_at')->nullable();
                $table->text('payment_rejection_reason')->nullable();
                $table->timestamp('placed_at')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (! Schema::hasTable('customer_order_items')) {
            Schema::create('customer_order_items', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('customer_order_id')->index();
                $table->unsignedBigInteger('product_id')->nullable()->index();
                $table->unsignedBigInteger('variant_id')->nullable()->index();
                $table->string('sku', 190)->nullable();
                $table->string('product_name');
                $table->string('variant_name')->nullable();
                $table->string('color')->nullable();
                $table->string('storage')->nullable();
                $table->unsignedInteger('quantity')->default(1);
                $table->decimal('unit_price', 15, 2)->default(0);
                $table->decimal('line_total', 15, 2)->default(0);
                $table->text('image_url')->nullable();
                $table->json('snapshot')->nullable();
                $table->timestamps();

                $table->foreign('customer_order_id')
                    ->references('id')
                    ->on('customer_orders')
                    ->cascadeOnDelete();
            });
        }

        if (Schema::hasTable('registration_promo_codes')) {
            Schema::table('registration_promo_codes', function (Blueprint $table) {
                if (! Schema::hasColumn('registration_promo_codes', 'customer_order_id')) {
                    $table->unsignedBigInteger('customer_order_id')->nullable()->index();
                }
                if (! Schema::hasColumn('registration_promo_codes', 'order_applied_at')) {
                    $table->timestamp('order_applied_at')->nullable();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('registration_promo_codes')) {
            Schema::table('registration_promo_codes', function (Blueprint $table) {
                $drop = [];
                if (Schema::hasColumn('registration_promo_codes', 'customer_order_id')) {
                    $drop[] = 'customer_order_id';
                }
                if (Schema::hasColumn('registration_promo_codes', 'order_applied_at')) {
                    $drop[] = 'order_applied_at';
                }
                if ($drop !== []) {
                    $table->dropColumn($drop);
                }
            });
        }

        Schema::dropIfExists('customer_order_items');
        Schema::dropIfExists('customer_orders');
    }
};
