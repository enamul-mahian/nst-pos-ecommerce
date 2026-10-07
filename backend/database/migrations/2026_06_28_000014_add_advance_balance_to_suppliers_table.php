<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('suppliers')) {
            return;
        }

        Schema::table('suppliers', function (Blueprint $table) {
            if (!Schema::hasColumn('suppliers', 'advance_balance')) {
                if (Schema::hasColumn('suppliers', 'current_balance')) {
                    $table->decimal('advance_balance', 15, 2)->default(0)->after('current_balance');
                } else {
                    $table->decimal('advance_balance', 15, 2)->default(0);
                }
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('suppliers')) {
            return;
        }

        Schema::table('suppliers', function (Blueprint $table) {
            if (Schema::hasColumn('suppliers', 'advance_balance')) {
                $table->dropColumn('advance_balance');
            }
        });
    }
};