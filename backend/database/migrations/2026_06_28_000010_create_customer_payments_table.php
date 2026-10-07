<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('customer_payments')) {
            return;
        }

        Schema::create('customer_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('payment_method')->default('cash');
            $table->string('provider_name')->nullable();
            $table->string('transaction_id')->nullable();
            $table->decimal('amount', 15, 2)->default(0);
            $table->decimal('previous_balance', 15, 2)->default(0);
            $table->decimal('new_balance', 15, 2)->default(0);
            $table->decimal('extra_amount', 15, 2)->default(0);
            $table->text('note')->nullable();
            $table->foreignId('collected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_payments');
    }
};