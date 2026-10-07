<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function addColumnIfMissing(string $tableName, string $columnName, callable $callback): void
    {
        if (!Schema::hasTable($tableName) || Schema::hasColumn($tableName, $columnName)) {
            return;
        }

        Schema::table($tableName, function (Blueprint $table) use ($callback) {
            $callback($table);
        });
    }

    public function up(): void
    {
        if (Schema::hasTable('sale_items')) {
            $this->addColumnIfMissing('sale_items', 'device_unit_id', function (Blueprint $table) {
                $table->unsignedBigInteger('device_unit_id')->nullable()->index()->after('used_purchase_id');
            });

            $this->addColumnIfMissing('sale_items', 'device_barcode', function (Blueprint $table) {
                $table->string('device_barcode')->nullable()->after('imei_2');
            });
        }

        if (Schema::hasTable('device_units')) {
            $this->addColumnIfMissing('device_units', 'sale_id', function (Blueprint $table) {
                $table->unsignedBigInteger('sale_id')->nullable()->index()->after('status');
            });

            $this->addColumnIfMissing('device_units', 'sale_item_id', function (Blueprint $table) {
                $table->unsignedBigInteger('sale_item_id')->nullable()->index()->after('sale_id');
            });

            $this->addColumnIfMissing('device_units', 'sold_at', function (Blueprint $table) {
                $table->timestamp('sold_at')->nullable()->after('sale_item_id');
            });

            $this->addColumnIfMissing('device_units', 'returned_at', function (Blueprint $table) {
                $table->timestamp('returned_at')->nullable()->after('sold_at');
            });
        }
    }

    public function down(): void
    {
        // Safe hotfix migration: no destructive rollback.
    }
};
