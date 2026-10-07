<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_movements', function (Blueprint $table) {
            $table->id();

            $table->string('movement_no')->unique();

            $table->foreignId('branch_id')
                ->nullable()
                ->constrained('branches')
                ->nullOnDelete();

            $table->foreignId('product_id')
                ->constrained('products')
                ->cascadeOnDelete();

            $table->foreignId('product_variant_id')
                ->nullable()
                ->constrained('product_variants')
                ->nullOnDelete();

            $table->foreignId('stock_transfer_request_id')
                ->nullable()
                ->constrained('stock_transfer_requests')
                ->nullOnDelete();

            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->enum('type', [
                'initial',
                'purchase',
                'sale',
                'transfer_in',
                'transfer_out',
                'adjustment_in',
                'adjustment_out',
                'return_in',
                'damage_out',
                'request_approved',
                'request_assigned',
            ]);

            $table->integer('quantity_change')->default(0);
            $table->integer('quantity_before')->default(0);
            $table->integer('quantity_after')->default(0);

            $table->string('reference_type')->nullable();
            $table->unsignedBigInteger('reference_id')->nullable();

            $table->text('note')->nullable();

            $table->timestamp('movement_at')->nullable();

            $table->timestamps();

            $table->index(['branch_id', 'product_id']);
            $table->index(['branch_id', 'product_variant_id']);
            $table->index(['type', 'movement_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_movements');
    }
};