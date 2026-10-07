<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('brands') || Schema::hasColumn('brands', 'page_settings')) {
            return;
        }

        Schema::table('brands', function (Blueprint $table) {
            $table->json('page_settings')->nullable()->after('website');
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('brands') || ! Schema::hasColumn('brands', 'page_settings')) {
            return;
        }

        Schema::table('brands', function (Blueprint $table) {
            $table->dropColumn('page_settings');
        });
    }
};
