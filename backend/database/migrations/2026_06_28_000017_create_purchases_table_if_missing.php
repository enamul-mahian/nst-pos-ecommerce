<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('purchases')) {
            return;
        }

        Schema::create('purchases', function (Blueprint $table) {
            $table->id();

            $table->foreignId('supplier_id')
                ->nullable()
                ->constrained('suppliers')
                ->nullOnDelete();

            $table->string('purchase_no')->nullable()->unique();
            $table->string('purchase_number')->nullable();
            $table->string('invoice_no')->nullable();
            $table->string('reference_no')->nullable();

            $table->date('purchase_date')->nullable();

            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->decimal('tax_amount', 15, 2)->default(0);
            $table->decimal('shipping_amount', 15, 2)->default(0);

            $table->decimal('final_amount', 15, 2)->default(0);
            $table->decimal('total_amount', 15, 2)->default(0);
            $table->decimal('grand_total', 15, 2)->default(0);
            $table->decimal('bill_amount', 15, 2)->default(0);
            $table->decimal('net_amount', 15, 2)->default(0);

            $table->decimal('paid_amount', 15, 2)->default(0);
            $table->decimal('total_paid', 15, 2)->default(0);

            $table->decimal('cash_paid_amount', 15, 2)->default(0);
            $table->decimal('advance_applied_amount', 15, 2)->default(0);

            $table->decimal('due_amount', 15, 2)->default(0);
            $table->decimal('current_due', 15, 2)->default(0);
            $table->decimal('balance_due', 15, 2)->default(0);

            $table->decimal('supplier_advance_before', 15, 2)->default(0);
            $table->decimal('supplier_advance_after', 15, 2)->default(0);

            $table->string('payment_method')->nullable();
            $table->string('transaction_id')->nullable();

            $table->string('payment_status')->default('due');
            $table->string('status')->default('completed');

            $table->text('note')->nullable();

            $table->foreignId('created_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->foreignId('updated_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamps();

            $table->index('supplier_id');
            $table->index('payment_status');
            $table->index('status');
            $table->index('purchase_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchases');
    }
};