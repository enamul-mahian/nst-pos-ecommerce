<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('purchase_items')) {
            return;
        }

        Schema::create('purchase_items', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('purchase_id')->nullable();
            $table->unsignedBigInteger('supplier_id')->nullable();
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->unsignedBigInteger('product_id')->nullable();

            $table->string('product_name')->nullable();
            $table->string('sku')->nullable();
            $table->string('barcode')->nullable();

            $table->decimal('quantity', 15, 2)->default(1);
            $table->decimal('unit_cost', 15, 2)->default(0);
            $table->decimal('line_total', 15, 2)->default(0);

            $table->unsignedInteger('device_count')->default(0);

            $table->text('note')->nullable();

            $table->timestamps();

            $table->index('purchase_id');
            $table->index('supplier_id');
            $table->index('branch_id');
            $table->index('product_id');
            $table->index('sku');
            $table->index('barcode');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_items');
    }
};