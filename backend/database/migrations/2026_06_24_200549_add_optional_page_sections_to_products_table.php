<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            if (!Schema::hasColumn('products', 'color_options')) {
                $table->json('color_options')->nullable();
            }

            if (!Schema::hasColumn('products', 'region_options')) {
                $table->json('region_options')->nullable();
            }

            if (!Schema::hasColumn('products', 'storage_options')) {
                $table->json('storage_options')->nullable();
            }

            if (!Schema::hasColumn('products', 'key_specs')) {
                $table->json('key_specs')->nullable();
            }

            if (!Schema::hasColumn('products', 'page_options')) {
                $table->json('page_options')->nullable();
            }

            if (!Schema::hasColumn('products', 'add_ons')) {
                $table->json('add_ons')->nullable();
            }

            if (!Schema::hasColumn('products', 'care_packages')) {
                $table->json('care_packages')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $columns = [
                'color_options',
                'region_options',
                'storage_options',
                'key_specs',
                'page_options',
                'add_ons',
                'care_packages',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('products', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};