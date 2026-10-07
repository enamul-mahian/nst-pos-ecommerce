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
        if (!Schema::hasTable('sale_items')) {
            return;
        }

        $this->addColumnIfMissing('sale_items', 'device_unit_id', function (Blueprint $table) {
            $table->unsignedBigInteger('device_unit_id')->nullable()->index();
        });

        $this->addColumnIfMissing('sale_items', 'device_barcode', function (Blueprint $table) {
            $table->string('device_barcode')->nullable();
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('sale_items')) {
            return;
        }

        Schema::table('sale_items', function (Blueprint $table) {
            if (Schema::hasColumn('sale_items', 'device_barcode')) {
                $table->dropColumn('device_barcode');
            }

            if (Schema::hasColumn('sale_items', 'device_unit_id')) {
                $table->dropColumn('device_unit_id');
            }
        });
    }
};
