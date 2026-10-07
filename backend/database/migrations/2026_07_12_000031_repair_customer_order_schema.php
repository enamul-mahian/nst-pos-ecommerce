<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('customer_orders')) {
            return;
        }

        $this->addIfMissing('customer_orders', 'order_no', fn (Blueprint $table) => $table->string('order_no', 60)->nullable()->index());
        $this->addIfMissing('customer_orders', 'customer_id', fn (Blueprint $table) => $table->unsignedBigInteger('customer_id')->nullable()->index());
        $this->addIfMissing('customer_orders', 'user_id', fn (Blueprint $table) => $table->unsignedBigInteger('user_id')->nullable()->index());
        $this->addIfMissing('customer_orders', 'branch_id', fn (Blueprint $table) => $table->unsignedBigInteger('branch_id')->nullable()->index());
        $this->addIfMissing('customer_orders', 'status', fn (Blueprint $table) => $table->string('status', 60)->default('order_recorded')->index());
        $this->addIfMissing('customer_orders', 'custom_status', fn (Blueprint $table) => $table->string('custom_status', 190)->default('Order Recorded'));
        $this->addIfMissing('customer_orders', 'payment_method', fn (Blueprint $table) => $table->string('payment_method', 60)->default('cash_on_delivery')->index());
        $this->addIfMissing('customer_orders', 'payment_status', fn (Blueprint $table) => $table->string('payment_status', 60)->default('cod_pending')->index());
        $this->addIfMissing('customer_orders', 'transaction_id', fn (Blueprint $table) => $table->string('transaction_id', 190)->nullable()->index());
        $this->addIfMissing('customer_orders', 'paid_amount', fn (Blueprint $table) => $table->decimal('paid_amount', 15, 2)->default(0));
        $this->addIfMissing('customer_orders', 'subtotal', fn (Blueprint $table) => $table->decimal('subtotal', 15, 2)->default(0));
        $this->addIfMissing('customer_orders', 'discount_amount', fn (Blueprint $table) => $table->decimal('discount_amount', 15, 2)->default(0));
        $this->addIfMissing('customer_orders', 'delivery_charge', fn (Blueprint $table) => $table->decimal('delivery_charge', 15, 2)->default(0));
        $this->addIfMissing('customer_orders', 'total_amount', fn (Blueprint $table) => $table->decimal('total_amount', 15, 2)->default(0));
        $this->addIfMissing('customer_orders', 'customer_name', fn (Blueprint $table) => $table->string('customer_name')->default('Customer'));
        $this->addIfMissing('customer_orders', 'customer_phone', fn (Blueprint $table) => $table->string('customer_phone', 60)->default('')->index());
        $this->addIfMissing('customer_orders', 'customer_email', fn (Blueprint $table) => $table->string('customer_email')->nullable());
        $this->addIfMissing('customer_orders', 'delivery_address', fn (Blueprint $table) => $table->text('delivery_address')->nullable());
        $this->addIfMissing('customer_orders', 'current_location', fn (Blueprint $table) => $table->string('current_location')->nullable());
        $this->addIfMissing('customer_orders', 'latitude', fn (Blueprint $table) => $table->decimal('latitude', 10, 7)->nullable());
        $this->addIfMissing('customer_orders', 'longitude', fn (Blueprint $table) => $table->decimal('longitude', 10, 7)->nullable());
        $this->addIfMissing('customer_orders', 'promo_code', fn (Blueprint $table) => $table->string('promo_code', 100)->nullable());
        $this->addIfMissing('customer_orders', 'customer_note', fn (Blueprint $table) => $table->text('customer_note')->nullable());
        $this->addIfMissing('customer_orders', 'source', fn (Blueprint $table) => $table->string('source', 60)->default('website'));
        $this->addIfMissing('customer_orders', 'status_history', fn (Blueprint $table) => $table->json('status_history')->nullable());
        $this->addIfMissing('customer_orders', 'payment_reviewed_by', fn (Blueprint $table) => $table->unsignedBigInteger('payment_reviewed_by')->nullable()->index());
        $this->addIfMissing('customer_orders', 'payment_reviewed_at', fn (Blueprint $table) => $table->timestamp('payment_reviewed_at')->nullable());
        $this->addIfMissing('customer_orders', 'payment_rejection_reason', fn (Blueprint $table) => $table->text('payment_rejection_reason')->nullable());
        $this->addIfMissing('customer_orders', 'placed_at', fn (Blueprint $table) => $table->timestamp('placed_at')->nullable());
        $this->addIfMissing('customer_orders', 'created_at', fn (Blueprint $table) => $table->timestamp('created_at')->nullable());
        $this->addIfMissing('customer_orders', 'updated_at', fn (Blueprint $table) => $table->timestamp('updated_at')->nullable());
        $this->addIfMissing('customer_orders', 'deleted_at', fn (Blueprint $table) => $table->softDeletes());

        if (Schema::hasColumn('customer_orders', 'id') && Schema::hasColumn('customer_orders', 'order_no')) {
            DB::table('customer_orders')->whereNull('order_no')->orderBy('id')->chunkById(200, function ($rows) {
                foreach ($rows as $row) {
                    DB::table('customer_orders')->where('id', $row->id)->update([
                        'order_no' => 'NST-WEB-LEGACY-' . str_pad((string) $row->id, 6, '0', STR_PAD_LEFT),
                    ]);
                }
            });
        }

        if (! Schema::hasTable('customer_order_items')) {
            Schema::create('customer_order_items', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('customer_order_id')->index();
                $table->unsignedBigInteger('product_id')->nullable()->index();
                $table->unsignedBigInteger('variant_id')->nullable()->index();
                $table->string('sku', 190)->nullable();
                $table->string('product_name')->default('Product');
                $table->string('variant_name')->nullable();
                $table->string('color')->nullable();
                $table->string('storage')->nullable();
                $table->unsignedInteger('quantity')->default(1);
                $table->decimal('unit_price', 15, 2)->default(0);
                $table->decimal('line_total', 15, 2)->default(0);
                $table->text('image_url')->nullable();
                $table->json('snapshot')->nullable();
                $table->timestamps();
            });
        } else {
            $this->addIfMissing('customer_order_items', 'customer_order_id', fn (Blueprint $table) => $table->unsignedBigInteger('customer_order_id')->nullable()->index());
            $this->addIfMissing('customer_order_items', 'product_id', fn (Blueprint $table) => $table->unsignedBigInteger('product_id')->nullable()->index());
            $this->addIfMissing('customer_order_items', 'variant_id', fn (Blueprint $table) => $table->unsignedBigInteger('variant_id')->nullable()->index());
            $this->addIfMissing('customer_order_items', 'sku', fn (Blueprint $table) => $table->string('sku', 190)->nullable());
            $this->addIfMissing('customer_order_items', 'product_name', fn (Blueprint $table) => $table->string('product_name')->default('Product'));
            $this->addIfMissing('customer_order_items', 'variant_name', fn (Blueprint $table) => $table->string('variant_name')->nullable());
            $this->addIfMissing('customer_order_items', 'color', fn (Blueprint $table) => $table->string('color')->nullable());
            $this->addIfMissing('customer_order_items', 'storage', fn (Blueprint $table) => $table->string('storage')->nullable());
            $this->addIfMissing('customer_order_items', 'quantity', fn (Blueprint $table) => $table->unsignedInteger('quantity')->default(1));
            $this->addIfMissing('customer_order_items', 'unit_price', fn (Blueprint $table) => $table->decimal('unit_price', 15, 2)->default(0));
            $this->addIfMissing('customer_order_items', 'line_total', fn (Blueprint $table) => $table->decimal('line_total', 15, 2)->default(0));
            $this->addIfMissing('customer_order_items', 'image_url', fn (Blueprint $table) => $table->text('image_url')->nullable());
            $this->addIfMissing('customer_order_items', 'snapshot', fn (Blueprint $table) => $table->json('snapshot')->nullable());
            $this->addIfMissing('customer_order_items', 'created_at', fn (Blueprint $table) => $table->timestamp('created_at')->nullable());
            $this->addIfMissing('customer_order_items', 'updated_at', fn (Blueprint $table) => $table->timestamp('updated_at')->nullable());
        }
    }

    public function down(): void
    {
        // Additive compatibility repair only. Intentionally non-destructive on rollback.
    }

    private function addIfMissing(string $tableName, string $columnName, callable $definition): void
    {
        if (Schema::hasColumn($tableName, $columnName)) {
            return;
        }

        Schema::table($tableName, function (Blueprint $table) use ($definition) {
            $definition($table);
        });
    }
};
