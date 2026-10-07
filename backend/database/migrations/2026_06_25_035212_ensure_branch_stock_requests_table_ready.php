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
        if (!Schema::hasTable('branch_stock_requests')) {
            Schema::create('branch_stock_requests', function (Blueprint $table) {
                $table->id();

                $table->foreignId('branch_id')
                    ->constrained('branches')
                    ->cascadeOnDelete();

                $table->foreignId('product_id')
                    ->constrained('products')
                    ->cascadeOnDelete();

                $table->foreignId('requested_by')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();

                $table->foreignId('responded_by')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();

                $table->integer('requested_quantity')->default(0);
                $table->integer('approved_quantity')->nullable();

                $table->enum('status', ['pending', 'approved', 'rejected'])
                    ->default('pending');

                $table->text('note')->nullable();
                $table->text('admin_note')->nullable();

                $table->timestamp('responded_at')->nullable();

                $table->timestamps();
            });
        } else {
            Schema::table('branch_stock_requests', function (Blueprint $table) {
                if (!Schema::hasColumn('branch_stock_requests', 'branch_id')) {
                    $table->foreignId('branch_id')
                        ->nullable()
                        ->after('id')
                        ->constrained('branches')
                        ->cascadeOnDelete();
                }

                if (!Schema::hasColumn('branch_stock_requests', 'product_id')) {
                    $table->foreignId('product_id')
                        ->nullable()
                        ->after('branch_id')
                        ->constrained('products')
                        ->cascadeOnDelete();
                }

                if (!Schema::hasColumn('branch_stock_requests', 'requested_by')) {
                    $table->foreignId('requested_by')
                        ->nullable()
                        ->after('product_id')
                        ->constrained('users')
                        ->nullOnDelete();
                }

                if (!Schema::hasColumn('branch_stock_requests', 'responded_by')) {
                    $table->foreignId('responded_by')
                        ->nullable()
                        ->after('requested_by')
                        ->constrained('users')
                        ->nullOnDelete();
                }

                if (!Schema::hasColumn('branch_stock_requests', 'requested_quantity')) {
                    $table->integer('requested_quantity')
                        ->default(0)
                        ->after('responded_by');
                }

                if (!Schema::hasColumn('branch_stock_requests', 'approved_quantity')) {
                    $table->integer('approved_quantity')
                        ->nullable()
                        ->after('requested_quantity');
                }

                if (!Schema::hasColumn('branch_stock_requests', 'status')) {
                    $table->enum('status', ['pending', 'approved', 'rejected'])
                        ->default('pending')
                        ->after('approved_quantity');
                }

                if (!Schema::hasColumn('branch_stock_requests', 'note')) {
                    $table->text('note')->nullable()->after('status');
                }

                if (!Schema::hasColumn('branch_stock_requests', 'admin_note')) {
                    $table->text('admin_note')->nullable()->after('note');
                }

                if (!Schema::hasColumn('branch_stock_requests', 'responded_at')) {
                    $table->timestamp('responded_at')->nullable()->after('admin_note');
                }

                if (!Schema::hasColumn('branch_stock_requests', 'created_at')) {
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
        // The table is not dropped on rollback to keep existing stock request data safe.
    }
};