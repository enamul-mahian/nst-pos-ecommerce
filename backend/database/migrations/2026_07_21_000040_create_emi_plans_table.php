<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('emi_plans')) {
            return;
        }

        Schema::create('emi_plans', function (Blueprint $table) {
            $table->id();
            $table->string('bank_name');
            $table->string('card_type')->nullable();
            $table->unsignedInteger('months')->default(12);
            $table->decimal('interest_rate', 8, 2)->default(0);
            $table->decimal('processing_fee_percent', 8, 2)->default(0);
            $table->decimal('fixed_processing_fee', 12, 2)->default(0);
            $table->decimal('minimum_amount', 12, 2)->default(0);
            $table->string('status', 30)->default('active')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('emi_plans');
    }
};
