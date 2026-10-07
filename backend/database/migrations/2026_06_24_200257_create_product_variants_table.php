<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();

            $table->foreignId('product_id')
                ->constrained()
                ->cascadeOnDelete();

            $table->string('variant_name')->nullable();

            $table->enum('condition', [
                'new',
                'used',
                'pre_owned',
                'refurbished',
            ])->default('new');

            $table->string('sku')->unique()->nullable();

            $table->enum('barcode_mode', ['auto', 'manual'])->default('auto');
            $table->string('barcode')->unique()->nullable();

            $table->decimal('purchase_price', 12, 2)->default(0);
            $table->decimal('sale_price', 12, 2)->default(0);
            $table->decimal('regular_price', 12, 2)->nullable();
            $table->decimal('discount_price', 12, 2)->nullable();

            $table->integer('stock_quantity')->default(0);
            $table->integer('low_stock_alert')->default(5);

            $table->string('warranty')->nullable();

            $table->enum('status', [
                'active',
                'inactive',
                'out_of_stock',
            ])->default('active');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_variants');
    }
};