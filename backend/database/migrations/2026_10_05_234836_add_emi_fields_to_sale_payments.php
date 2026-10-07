<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('sale_payments')) {
            return;
        }

        Schema::table('sale_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('sale_payments', 'emi_bank_name')) {
                $table->string('emi_bank_name', 190)->nullable();
            }

            if (!Schema::hasColumn('sale_payments', 'emi_months')) {
                $table->unsignedSmallInteger('emi_months')->nullable();
            }

            if (!Schema::hasColumn('sale_payments', 'emi_reference')) {
                $table->string('emi_reference', 255)->nullable();
            }
        });
    }

    public function down(): void
    {
        // Production-safe, intentionally non-destructive.
    }
};
