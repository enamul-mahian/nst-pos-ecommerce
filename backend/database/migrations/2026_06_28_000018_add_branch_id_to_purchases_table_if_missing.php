<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('purchases')) {
            return;
        }

        Schema::table('purchases', function (Blueprint $table) {
            if (!Schema::hasColumn('purchases', 'branch_id')) {
                if (Schema::hasColumn('purchases', 'supplier_id')) {
                    $table->unsignedBigInteger('branch_id')->nullable()->after('supplier_id');
                } else {
                    $table->unsignedBigInteger('branch_id')->nullable();
                }

                $table->index('branch_id');
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('purchases')) {
            return;
        }

        Schema::table('purchases', function (Blueprint $table) {
            if (Schema::hasColumn('purchases', 'branch_id')) {
                $table->dropColumn('branch_id');
            }
        });
    }
};