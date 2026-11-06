<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Customer money received beyond what they owe (due collection) is kept as advance instead of being lost. */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('customers') && ! Schema::hasColumn('customers', 'advance_balance')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->decimal('advance_balance', 15, 2)->default(0);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('customers') && Schema::hasColumn('customers', 'advance_balance')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->dropColumn('advance_balance');
            });
        }
    }
};
