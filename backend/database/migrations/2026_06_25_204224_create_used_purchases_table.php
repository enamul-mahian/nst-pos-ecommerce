<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('used_purchases', function (Blueprint $table) {
            $table->id();

            $table->string('customer_name');
            $table->string('customer_phone')->nullable();
            $table->string('customer_nid')->nullable();

            $table->string('product_name');
            $table->string('brand')->nullable();
            $table->string('model')->nullable();

            $table->string('imei_1')->nullable();
            $table->string('imei_2')->nullable();

            $table->decimal('purchase_price', 12, 2)->default(0);

            $table->string('condition')->default('good');
            $table->text('notes')->nullable();

            $table->string('status')->default('purchased');

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('used_purchases');
    }
};