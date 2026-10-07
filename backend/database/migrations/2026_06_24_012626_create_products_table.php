<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->id();

            $table->string('name');
            $table->string('slug')->unique();
            $table->string('sku')->unique()->nullable();
            $table->string('barcode')->unique()->nullable();

            $table->string('brand')->nullable();
            $table->string('model')->nullable();
            $table->string('category')->nullable();

            $table->enum('condition', [
                'new',
                'used',
                'pre_owned',
                'refurbished'
            ])->default('new');

            $table->text('description')->nullable();

            $table->decimal('purchase_price', 12, 2)->default(0);
            $table->decimal('sale_price', 12, 2)->default(0);
            $table->decimal('discount_price', 12, 2)->nullable();

            $table->integer('stock_quantity')->default(0);
            $table->integer('low_stock_alert')->default(5);

            $table->string('image')->nullable();

            $table->enum('status', [
                'active',
                'inactive',
                'out_of_stock'
            ])->default('active');

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};