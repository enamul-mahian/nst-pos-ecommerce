<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            if (!Schema::hasColumn('products', 'barcode_mode')) {
                $table->enum('barcode_mode', ['auto', 'manual'])
                    ->default('manual')
                    ->after('barcode');
            }
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            if (Schema::hasColumn('products', 'barcode_mode')) {
                $table->dropColumn('barcode_mode');
            }
        });
    }
};