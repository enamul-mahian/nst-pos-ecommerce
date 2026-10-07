<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('sales') && ! Schema::hasColumn('sales', 'customer_email')) {
            Schema::table('sales', function (Blueprint $table) {
                $table->string('customer_email', 255)->nullable()->after('customer_phone');
            });
        }
    }

    public function down(): void
    {
        // Data-safe: invoice email history is intentionally preserved.
    }
};
