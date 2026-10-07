<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->createFinanceCompletionTables();
        $this->ensureFinanceFoundationAccounts();
    }

    private function createFinanceCompletionTables(): void
    {
        if (!Schema::hasTable('nst_finance_expense_categories')) {
            Schema::create('nst_finance_expense_categories', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('code', 80)->unique();
                $table->foreignId('default_expense_account_id')->nullable();
                $table->boolean('requires_approval')->default(false);
                $table->boolean('is_active')->default(true);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->foreign('default_expense_account_id', 'nfe_cat_acc_fk')->references('id')->on('nst_accounts')->nullOnDelete();
            });
        }

        if (!Schema::hasTable('nst_finance_expenses')) {
            Schema::create('nst_finance_expenses', function (Blueprint $table) {
                $table->id();
                $table->string('expense_no', 100)->unique();
                $table->date('expense_date');
                $table->foreignId('category_id')->nullable()->constrained('nst_finance_expense_categories')->nullOnDelete();
                $table->foreignId('expense_account_id')->constrained('nst_accounts')->restrictOnDelete();
                $table->foreignId('payment_account_id')->nullable()->constrained('nst_accounts')->nullOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->string('vendor_name')->nullable();
                $table->decimal('amount', 16, 2)->default(0);
                $table->decimal('tax_amount', 16, 2)->default(0);
                $table->decimal('total_amount', 16, 2)->default(0);
                $table->string('payment_method', 80)->nullable();
                $table->enum('status', ['draft', 'approved', 'paid', 'rejected', 'void'])->default('draft');
                $table->string('attachment_path', 500)->nullable();
                $table->json('recurring_rule')->nullable();
                $table->foreignId('journal_id')->nullable()->constrained('nst_journals')->nullOnDelete();
                $table->text('note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('paid_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('approved_at')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
                $table->index(['expense_date', 'status']);
                $table->index(['branch_id', 'status']);
            });
        }

        if (!Schema::hasTable('nst_finance_transfers')) {
            Schema::create('nst_finance_transfers', function (Blueprint $table) {
                $table->id();
                $table->string('transfer_no', 100)->unique();
                $table->date('transfer_date');
                $table->foreignId('from_account_id')->constrained('nst_accounts')->restrictOnDelete();
                $table->foreignId('to_account_id')->constrained('nst_accounts')->restrictOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->decimal('amount', 16, 2)->default(0);
                $table->decimal('fee_amount', 16, 2)->default(0);
                $table->enum('status', ['draft', 'posted', 'void'])->default('posted');
                $table->foreignId('journal_id')->nullable()->constrained('nst_journals')->nullOnDelete();
                $table->text('note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('posted_at')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
                $table->index(['transfer_date', 'status']);
                $table->index(['branch_id', 'status']);
            });
        }

        if (!Schema::hasTable('nst_finance_due_payments')) {
            Schema::create('nst_finance_due_payments', function (Blueprint $table) {
                $table->id();
                $table->string('payment_no', 100)->unique();
                $table->date('payment_date');
                $table->enum('payment_direction', ['customer_collection', 'supplier_payment', 'refund', 'adjustment']);
                $table->enum('party_type', ['customer', 'supplier', 'other']);
                $table->unsignedBigInteger('party_id')->nullable();
                $table->foreignId('account_id')->constrained('nst_accounts')->restrictOnDelete();
                $table->foreignId('cash_bank_account_id')->constrained('nst_accounts')->restrictOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->decimal('amount', 16, 2)->default(0);
                $table->string('method', 80)->nullable();
                $table->string('reference_no')->nullable();
                $table->enum('status', ['draft', 'posted', 'void'])->default('posted');
                $table->foreignId('journal_id')->nullable()->constrained('nst_journals')->nullOnDelete();
                $table->text('note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('posted_at')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
                $table->index(['party_type', 'party_id']);
                $table->index(['payment_date', 'payment_direction']);
            });
        }

        $this->ensureExpenseCategoryForeignKey();

        if (!Schema::hasTable('nst_finance_operation_logs')) {
            Schema::create('nst_finance_operation_logs', function (Blueprint $table) {
                $table->id();
                $table->string('action', 120)->index();
                $table->string('resource_type', 160)->nullable();
                $table->string('resource_id', 100)->nullable()->index();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->json('before_payload')->nullable();
                $table->json('after_payload')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamp('created_at')->nullable();
                $table->index(['created_at', 'action']);
            });
        }
    }

    private function ensureExpenseCategoryForeignKey(): void
    {
        if (!Schema::hasTable('nst_finance_expense_categories') || !Schema::hasTable('nst_accounts')) {
            return;
        }

        if (!Schema::hasColumn('nst_finance_expense_categories', 'default_expense_account_id')) {
            return;
        }

        if ($this->foreignKeyExists('nst_finance_expense_categories', 'nfe_cat_acc_fk')) {
            return;
        }

        try {
            Schema::table('nst_finance_expense_categories', function (Blueprint $table) {
                $table->foreign('default_expense_account_id', 'nfe_cat_acc_fk')
                    ->references('id')
                    ->on('nst_accounts')
                    ->nullOnDelete();
            });
        } catch (\Throwable $exception) {
            $message = strtolower($exception->getMessage());
            if (!str_contains($message, 'duplicate') && !str_contains($message, 'already exists')) {
                throw $exception;
            }
        }
    }

    private function foreignKeyExists(string $table, string $constraint): bool
    {
        // Driver-agnostic lookup (information_schema only exists on MySQL/MariaDB/PostgreSQL).
        return collect(Schema::getForeignKeys($table))
            ->contains(fn (array $foreignKey) => strcasecmp((string) ($foreignKey['name'] ?? ''), $constraint) === 0);
    }

    private function ensureFinanceFoundationAccounts(): void
    {
        if (!Schema::hasTable('nst_account_groups') || !Schema::hasTable('nst_accounts')) {
            return;
        }

        $now = now();
        foreach ([
            ['name' => 'Assets', 'code' => 'ASSET', 'type' => 'asset'],
            ['name' => 'Liabilities', 'code' => 'LIABILITY', 'type' => 'liability'],
            ['name' => 'Equity', 'code' => 'EQUITY', 'type' => 'equity'],
            ['name' => 'Income', 'code' => 'INCOME', 'type' => 'income'],
            ['name' => 'Expenses', 'code' => 'EXPENSE', 'type' => 'expense'],
        ] as $index => $group) {
            DB::table('nst_account_groups')->updateOrInsert(
                ['code' => $group['code']],
                $group + ['is_system' => true, 'is_active' => true, 'sort_order' => $index + 1, 'updated_at' => $now, 'created_at' => $now]
            );
        }

        $groupIds = DB::table('nst_account_groups')->pluck('id', 'code');
        foreach ([
            ['name' => 'Cash in Hand', 'code' => '1000', 'group' => 'ASSET', 'kind' => 'cash', 'cash' => true, 'bank' => false],
            ['name' => 'Bank Account', 'code' => '1010', 'group' => 'ASSET', 'kind' => 'bank', 'cash' => false, 'bank' => true],
            ['name' => 'Gateway Clearing / Suspense', 'code' => '1090', 'group' => 'ASSET', 'kind' => 'clearing', 'cash' => false, 'bank' => false],
            ['name' => 'Customer Receivable', 'code' => '1100', 'group' => 'ASSET', 'kind' => 'receivable', 'cash' => false, 'bank' => false],
            ['name' => 'Inventory Asset', 'code' => '1200', 'group' => 'ASSET', 'kind' => 'inventory', 'cash' => false, 'bank' => false],
            ['name' => 'Supplier Payable', 'code' => '2000', 'group' => 'LIABILITY', 'kind' => 'payable', 'cash' => false, 'bank' => false],
            ['name' => 'Customer Advance / Preorder Liability', 'code' => '2100', 'group' => 'LIABILITY', 'kind' => 'advance', 'cash' => false, 'bank' => false],
            ['name' => 'Owner Equity', 'code' => '3000', 'group' => 'EQUITY', 'kind' => 'equity', 'cash' => false, 'bank' => false],
            ['name' => 'Sales Revenue', 'code' => '4000', 'group' => 'INCOME', 'kind' => 'income', 'cash' => false, 'bank' => false],
            ['name' => 'Service Revenue', 'code' => '4100', 'group' => 'INCOME', 'kind' => 'income', 'cash' => false, 'bank' => false],
            ['name' => 'Delivery Charge Income', 'code' => '4200', 'group' => 'INCOME', 'kind' => 'income', 'cash' => false, 'bank' => false],
            ['name' => 'Cost of Goods Sold', 'code' => '5000', 'group' => 'EXPENSE', 'kind' => 'expense', 'cash' => false, 'bank' => false],
            ['name' => 'Operating Expense', 'code' => '5100', 'group' => 'EXPENSE', 'kind' => 'expense', 'cash' => false, 'bank' => false],
            ['name' => 'Salary Expense', 'code' => '5200', 'group' => 'EXPENSE', 'kind' => 'expense', 'cash' => false, 'bank' => false],
            ['name' => 'Delivery Expense', 'code' => '5300', 'group' => 'EXPENSE', 'kind' => 'expense', 'cash' => false, 'bank' => false],
            ['name' => 'Gateway Charge Expense', 'code' => '5400', 'group' => 'EXPENSE', 'kind' => 'expense', 'cash' => false, 'bank' => false],
        ] as $account) {
            if (!isset($groupIds[$account['group']])) {
                continue;
            }
            DB::table('nst_accounts')->updateOrInsert(
                ['code' => $account['code']],
                [
                    'group_id' => $groupIds[$account['group']],
                    'name' => $account['name'],
                    'account_kind' => $account['kind'],
                    'currency' => 'BDT',
                    'opening_balance' => 0,
                    'opening_side' => 'debit',
                    'is_cash' => $account['cash'],
                    'is_bank' => $account['bank'],
                    'is_system' => true,
                    'is_active' => true,
                    'updated_at' => $now,
                    'created_at' => $now,
                ]
            );
        }

        if (Schema::hasTable('nst_finance_expense_categories')) {
            $expenseAccountId = DB::table('nst_accounts')->where('code', '5100')->value('id');
            foreach ([
                ['name' => 'Office Expense', 'code' => 'OFFICE'],
                ['name' => 'Rent and Utilities', 'code' => 'RENT_UTILITIES'],
                ['name' => 'Delivery Expense', 'code' => 'DELIVERY'],
                ['name' => 'Gateway Charge', 'code' => 'GATEWAY_CHARGE'],
                ['name' => 'Repair and Maintenance', 'code' => 'REPAIR_MAINTENANCE'],
                ['name' => 'Marketing Expense', 'code' => 'MARKETING'],
            ] as $category) {
                DB::table('nst_finance_expense_categories')->updateOrInsert(
                    ['code' => $category['code']],
                    $category + ['default_expense_account_id' => $expenseAccountId, 'requires_approval' => false, 'is_active' => true, 'updated_at' => $now, 'created_at' => $now]
                );
            }
        }
    }

    public function down(): void
    {
        foreach (['nst_finance_operation_logs', 'nst_finance_due_payments', 'nst_finance_transfers', 'nst_finance_expenses', 'nst_finance_expense_categories'] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
