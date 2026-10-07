<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('branch_stocks')) {
            Schema::create('branch_stocks', function (Blueprint $table) {
                $table->id();

                $table->foreignId('branch_id')
                    ->constrained('branches')
                    ->cascadeOnDelete();

                $table->foreignId('product_id')
                    ->constrained('products')
                    ->cascadeOnDelete();

                $table->integer('quantity')->default(0);
                $table->integer('alert_quantity')->default(0);

                $table->timestamps();

                $table->unique(['branch_id', 'product_id']);
            });
        } else {
            Schema::table('branch_stocks', function (Blueprint $table) {
                if (!Schema::hasColumn('branch_stocks', 'branch_id')) {
                    $table->foreignId('branch_id')
                        ->nullable()
                        ->after('id')
                        ->constrained('branches')
                        ->cascadeOnDelete();
                }

                if (!Schema::hasColumn('branch_stocks', 'product_id')) {
                    $table->foreignId('product_id')
                        ->nullable()
                        ->after('branch_id')
                        ->constrained('products')
                        ->cascadeOnDelete();
                }

                if (!Schema::hasColumn('branch_stocks', 'quantity')) {
                    $table->integer('quantity')->default(0)->after('product_id');
                }

                if (!Schema::hasColumn('branch_stocks', 'alert_quantity')) {
                    $table->integer('alert_quantity')->default(0)->after('quantity');
                }

                if (!Schema::hasColumn('branch_stocks', 'created_at')) {
                    $table->timestamps();
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Rolling back this migration could lose existing stock data,
        // so the table is intentionally not dropped.
    }
};