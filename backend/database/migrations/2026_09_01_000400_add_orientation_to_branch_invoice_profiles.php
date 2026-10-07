<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('branch_invoice_profiles') && ! Schema::hasColumn('branch_invoice_profiles', 'orientation')) {
            Schema::table('branch_invoice_profiles', function (Blueprint $table) {
                $table->string('orientation', 20)->default('portrait')->after('layout');
            });
        }
    }

    public function down(): void
    {
        // Data-safe rollback: preserve branch invoice orientation for historical invoice configuration.
    }
};
