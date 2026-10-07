<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('used_purchases', function (Blueprint $table) {
            if (!Schema::hasColumn('used_purchases', 'salesman_id')) {
                $table->foreignId('salesman_id')
                    ->nullable()
                    ->after('branch_id')
                    ->constrained('users')
                    ->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('used_purchases', function (Blueprint $table) {
            if (Schema::hasColumn('used_purchases', 'salesman_id')) {
                $table->dropConstrainedForeignId('salesman_id');
            }
        });
    }
};
