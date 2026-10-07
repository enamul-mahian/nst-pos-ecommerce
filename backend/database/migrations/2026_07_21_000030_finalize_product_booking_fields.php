<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('products')) {
            return;
        }

        if (! Schema::hasColumn('products', 'minimum_booking_type')) {
            Schema::table('products', fn (Blueprint $table) => $table->string('minimum_booking_type', 20)->default('fixed'));
        }
        if (! Schema::hasColumn('products', 'minimum_booking_value')) {
            Schema::table('products', fn (Blueprint $table) => $table->decimal('minimum_booking_value', 12, 2)->nullable());
        }
    }

    public function down(): void
    {
        // Booking configuration is retained for backward compatibility.
    }
};
