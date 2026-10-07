<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('expenses')) {
            Schema::create('expenses', function (Blueprint $table) {
                $table->id();
                $table->string('expense_no')->unique();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->string('title');
                $table->string('category')->nullable();
                $table->decimal('amount', 15, 2)->default(0);
                $table->string('payment_method')->default('cash');
                $table->string('provider_name')->nullable();
                $table->string('transaction_id')->nullable();
                $table->date('expense_date')->nullable();
                $table->text('note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();

                $table->index(['branch_id', 'expense_date']);
                $table->index(['category', 'expense_date']);
            });

            return;
        }

        Schema::table('expenses', function (Blueprint $table) {
            if (!Schema::hasColumn('expenses', 'expense_no')) {
                $table->string('expense_no')->nullable()->unique()->after('id');
            }

            if (!Schema::hasColumn('expenses', 'branch_id')) {
                $table->foreignId('branch_id')->nullable()->after('expense_no')->constrained('branches')->nullOnDelete();
            }

            if (!Schema::hasColumn('expenses', 'title')) {
                $table->string('title')->nullable()->after('branch_id');
            }

            if (!Schema::hasColumn('expenses', 'category')) {
                $table->string('category')->nullable()->after('title');
            }

            if (!Schema::hasColumn('expenses', 'amount')) {
                $table->decimal('amount', 15, 2)->default(0)->after('category');
            }

            if (!Schema::hasColumn('expenses', 'payment_method')) {
                $table->string('payment_method')->default('cash')->after('amount');
            }

            if (!Schema::hasColumn('expenses', 'provider_name')) {
                $table->string('provider_name')->nullable()->after('payment_method');
            }

            if (!Schema::hasColumn('expenses', 'transaction_id')) {
                $table->string('transaction_id')->nullable()->after('provider_name');
            }

            if (!Schema::hasColumn('expenses', 'expense_date')) {
                $table->date('expense_date')->nullable()->after('transaction_id');
            }

            if (!Schema::hasColumn('expenses', 'note')) {
                $table->text('note')->nullable()->after('expense_date');
            }

            if (!Schema::hasColumn('expenses', 'created_by')) {
                $table->foreignId('created_by')->nullable()->after('note')->constrained('users')->nullOnDelete();
            }

            if (!Schema::hasColumn('expenses', 'updated_by')) {
                $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            }

            if (!Schema::hasColumn('expenses', 'deleted_at')) {
                $table->softDeletes();
            }
        });
    }

    public function down(): void
    {
        // Safe migration: do not drop user financial data automatically.
    }
};
