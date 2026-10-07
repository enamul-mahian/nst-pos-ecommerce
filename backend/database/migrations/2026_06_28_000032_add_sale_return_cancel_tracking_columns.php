<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function addColumnIfMissing(string $table, string $column, callable $callback): void
    {
        if (!Schema::hasColumn($table, $column)) {
            Schema::table($table, function (Blueprint $tableBlueprint) use ($callback) {
                $callback($tableBlueprint);
            });
        }
    }

    public function up(): void
    {
        if (!Schema::hasTable('sales')) {
            return;
        }

        $this->addColumnIfMissing('sales', 'cancel_reason', function (Blueprint $table) {
            $table->text('cancel_reason')->nullable()->after('note');
        });

        $this->addColumnIfMissing('sales', 'return_reason', function (Blueprint $table) {
            $table->text('return_reason')->nullable()->after('cancel_reason');
        });

        $this->addColumnIfMissing('sales', 'cancelled_at', function (Blueprint $table) {
            $table->timestamp('cancelled_at')->nullable()->after('return_reason');
        });

        $this->addColumnIfMissing('sales', 'returned_at', function (Blueprint $table) {
            $table->timestamp('returned_at')->nullable()->after('cancelled_at');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('sales')) {
            return;
        }

        Schema::table('sales', function (Blueprint $table) {
            foreach (['returned_at', 'cancelled_at', 'return_reason', 'cancel_reason'] as $column) {
                if (Schema::hasColumn('sales', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
