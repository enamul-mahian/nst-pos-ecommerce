<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('products')) {
            Schema::table('products', function (Blueprint $table) {
                if (!Schema::hasColumn('products', 'category_id')) {
                    $table->foreignId('category_id')
                        ->nullable()
                        ->after('category')
                        ->constrained('categories')
                        ->nullOnDelete();
                }

                if (!Schema::hasColumn('products', 'brand_id')) {
                    $table->foreignId('brand_id')
                        ->nullable()
                        ->after('brand')
                        ->constrained('brands')
                        ->nullOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('products')) {
            Schema::table('products', function (Blueprint $table) {
                if (Schema::hasColumn('products', 'category_id')) {
                    $table->dropConstrainedForeignId('category_id');
                }

                if (Schema::hasColumn('products', 'brand_id')) {
                    $table->dropConstrainedForeignId('brand_id');
                }
            });
        }
    }
};