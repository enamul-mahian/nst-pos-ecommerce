<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_transfer_request_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('stock_transfer_request_id')
                ->constrained('stock_transfer_requests')
                ->cascadeOnDelete();

            $table->foreignId('product_id')
                ->constrained('products')
                ->cascadeOnDelete();

            $table->foreignId('product_variant_id')
                ->nullable()
                ->constrained('product_variants')
                ->nullOnDelete();

            $table->integer('requested_quantity')->default(0);
            $table->integer('approved_quantity')->default(0);
            $table->integer('assigned_quantity')->default(0);
            $table->integer('received_quantity')->default(0);

            $table->text('note')->nullable();

            $table->timestamps();

            $table->index(
                ['stock_transfer_request_id', 'product_id'],
                'str_items_req_product_idx'
            );

            $table->index(
                ['product_variant_id'],
                'str_items_variant_idx'
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_transfer_request_items');
    }
};