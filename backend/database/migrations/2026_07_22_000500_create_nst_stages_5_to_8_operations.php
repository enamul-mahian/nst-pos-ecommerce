<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->createFinanceTables();
        $this->createCrmTables();
        $this->createHrmTables();
        $this->createCmsTables();
        $this->seedFinanceFoundation();
        $this->seedHrmFoundation();
    }

    private function createFinanceTables(): void
    {
        if (!Schema::hasTable('nst_account_groups')) {
            Schema::create('nst_account_groups', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('code', 50)->unique();
                $table->enum('type', ['asset', 'liability', 'equity', 'income', 'expense']);
                $table->foreignId('parent_id')->nullable()->constrained('nst_account_groups')->nullOnDelete();
                $table->boolean('is_system')->default(false);
                $table->boolean('is_active')->default(true);
                $table->unsignedInteger('sort_order')->default(0);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('nst_accounts')) {
            Schema::create('nst_accounts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('group_id')->constrained('nst_account_groups')->restrictOnDelete();
                $table->string('name');
                $table->string('code', 50)->unique();
                $table->string('account_kind')->default('ledger');
                $table->string('currency', 10)->default('BDT');
                $table->decimal('opening_balance', 16, 2)->default(0);
                $table->enum('opening_side', ['debit', 'credit'])->default('debit');
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->string('bank_name')->nullable();
                $table->string('bank_account_no')->nullable();
                $table->boolean('is_cash')->default(false);
                $table->boolean('is_bank')->default(false);
                $table->boolean('is_system')->default(false);
                $table->boolean('is_active')->default(true);
                $table->json('meta')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(['branch_id', 'is_active']);
            });
        }

        if (!Schema::hasTable('nst_journals')) {
            Schema::create('nst_journals', function (Blueprint $table) {
                $table->id();
                $table->string('journal_no', 80)->unique();
                $table->date('journal_date');
                $table->string('source_type')->default('manual');
                $table->unsignedBigInteger('source_id')->nullable();
                $table->string('reference_no')->nullable();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->text('description')->nullable();
                $table->enum('status', ['draft', 'posted', 'reversed', 'cancelled'])->default('draft');
                $table->foreignId('reversal_of_id')->nullable()->constrained('nst_journals')->nullOnDelete();
                $table->foreignId('reversed_by_journal_id')->nullable()->constrained('nst_journals')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('posted_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('reversed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('posted_at')->nullable();
                $table->timestamp('reversed_at')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
                $table->index(['journal_date', 'status']);
                $table->index(['source_type', 'source_id']);
            });
        }

        if (!Schema::hasTable('nst_journal_lines')) {
            Schema::create('nst_journal_lines', function (Blueprint $table) {
                $table->id();
                $table->foreignId('journal_id')->constrained('nst_journals')->cascadeOnDelete();
                $table->foreignId('account_id')->constrained('nst_accounts')->restrictOnDelete();
                $table->decimal('debit', 16, 2)->default(0);
                $table->decimal('credit', 16, 2)->default(0);
                $table->string('party_type')->nullable();
                $table->unsignedBigInteger('party_id')->nullable();
                $table->text('memo')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
                $table->index(['account_id', 'created_at']);
                $table->index(['party_type', 'party_id']);
            });
        }

        if (!Schema::hasTable('nst_cash_sessions')) {
            Schema::create('nst_cash_sessions', function (Blueprint $table) {
                $table->id();
                $table->string('session_no', 80)->unique();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->foreignId('cashier_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('cash_account_id')->nullable()->constrained('nst_accounts')->nullOnDelete();
                $table->decimal('opening_amount', 16, 2)->default(0);
                $table->decimal('system_closing_amount', 16, 2)->nullable();
                $table->decimal('counted_closing_amount', 16, 2)->nullable();
                $table->decimal('variance_amount', 16, 2)->nullable();
                $table->json('denominations')->nullable();
                $table->enum('status', ['open', 'submitted', 'approved', 'rejected'])->default('open');
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('opened_at');
                $table->timestamp('closed_at')->nullable();
                $table->timestamp('approved_at')->nullable();
                $table->text('note')->nullable();
                $table->timestamps();
                $table->index(['branch_id', 'status']);
            });
        }

        if (!Schema::hasTable('nst_payment_reconciliations')) {
            Schema::create('nst_payment_reconciliations', function (Blueprint $table) {
                $table->id();
                $table->string('provider')->default('manual');
                $table->string('channel')->default('cash');
                $table->string('external_reference')->nullable();
                $table->string('internal_reference')->nullable();
                $table->decimal('expected_amount', 16, 2)->default(0);
                $table->decimal('received_amount', 16, 2)->default(0);
                $table->decimal('variance_amount', 16, 2)->default(0);
                $table->enum('status', ['unidentified', 'pending', 'matched', 'variance', 'rejected'])->default('pending');
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->foreignId('matched_journal_id')->nullable()->constrained('nst_journals')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('resolved_at')->nullable();
                $table->json('payload')->nullable();
                $table->text('note')->nullable();
                $table->timestamps();
                $table->index(['provider', 'status']);
            });
        }
    }

    private function createCrmTables(): void
    {
        if (!Schema::hasTable('nst_crm_profiles')) {
            Schema::create('nst_crm_profiles', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->unique()->constrained('customers')->cascadeOnDelete();
                $table->json('contacts')->nullable();
                $table->json('addresses')->nullable();
                $table->json('documents')->nullable();
                $table->json('tags')->nullable();
                $table->json('consents')->nullable();
                $table->string('segment')->nullable();
                $table->string('loyalty_tier')->default('Member');
                $table->integer('loyalty_points')->default(0);
                $table->string('referral_code')->nullable()->unique();
                $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->timestamp('last_contacted_at')->nullable();
                $table->timestamp('next_follow_up_at')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('nst_crm_leads')) {
            Schema::create('nst_crm_leads', function (Blueprint $table) {
                $table->id();
                $table->string('lead_no', 80)->unique();
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->string('name');
                $table->string('phone')->nullable();
                $table->string('email')->nullable();
                $table->string('source')->default('manual');
                $table->string('interest')->nullable();
                $table->decimal('estimated_value', 16, 2)->default(0);
                $table->enum('stage', ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'])->default('new');
                $table->string('priority')->default('normal');
                $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->timestamp('next_follow_up_at')->nullable();
                $table->timestamp('converted_at')->nullable();
                $table->text('note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
                $table->index(['stage', 'assigned_to']);
            });
        }

        if (!Schema::hasTable('nst_crm_activities')) {
            Schema::create('nst_crm_activities', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->foreignId('lead_id')->nullable()->constrained('nst_crm_leads')->nullOnDelete();
                $table->string('activity_type')->default('note');
                $table->string('subject');
                $table->text('details')->nullable();
                $table->enum('status', ['planned', 'completed', 'cancelled'])->default('planned');
                $table->timestamp('due_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->json('attachments')->nullable();
                $table->timestamps();
                $table->index(['status', 'due_at']);
            });
        }

        if (!Schema::hasTable('nst_crm_segments')) {
            Schema::create('nst_crm_segments', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('code', 80)->unique();
                $table->json('rules');
                $table->boolean('is_dynamic')->default(true);
                $table->boolean('is_active')->default(true);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('nst_crm_loyalty_entries')) {
            Schema::create('nst_crm_loyalty_entries', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
                $table->integer('points');
                $table->string('entry_type')->default('adjustment');
                $table->string('reference_type')->nullable();
                $table->unsignedBigInteger('reference_id')->nullable();
                $table->text('note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(['customer_id', 'created_at']);
            });
        }

        if (!Schema::hasTable('nst_crm_feedback')) {
            Schema::create('nst_crm_feedback', function (Blueprint $table) {
                $table->id();
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->string('channel')->default('manual');
                $table->string('type')->default('feedback');
                $table->unsignedTinyInteger('rating')->nullable();
                $table->smallInteger('nps_score')->nullable();
                $table->text('message')->nullable();
                $table->enum('status', ['open', 'reviewing', 'resolved', 'closed'])->default('open');
                $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(['status', 'rating']);
            });
        }
    }

    private function createHrmTables(): void
    {
        if (!Schema::hasTable('nst_hr_departments')) {
            Schema::create('nst_hr_departments', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('code', 60)->unique();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->foreignId('manager_employee_id')->nullable();
                $table->boolean('is_active')->default(true);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('nst_hr_designations')) {
            Schema::create('nst_hr_designations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('department_id')->nullable()->constrained('nst_hr_departments')->nullOnDelete();
                $table->string('name');
                $table->string('code', 60)->unique();
                $table->unsignedInteger('grade')->default(1);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('nst_hr_shifts')) {
            Schema::create('nst_hr_shifts', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('code', 60)->unique();
                $table->time('starts_at');
                $table->time('ends_at');
                $table->unsignedInteger('grace_minutes')->default(0);
                $table->boolean('is_night_shift')->default(false);
                $table->json('weekends')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('nst_hr_employees')) {
            Schema::create('nst_hr_employees', function (Blueprint $table) {
                $table->id();
                $table->string('employee_no', 80)->unique();
                $table->foreignId('user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->foreignId('department_id')->nullable()->constrained('nst_hr_departments')->nullOnDelete();
                $table->foreignId('designation_id')->nullable()->constrained('nst_hr_designations')->nullOnDelete();
                $table->foreignId('shift_id')->nullable()->constrained('nst_hr_shifts')->nullOnDelete();
                $table->foreignId('reporting_manager_id')->nullable()->constrained('nst_hr_employees')->nullOnDelete();
                $table->string('name');
                $table->string('email')->nullable();
                $table->string('phone')->nullable();
                $table->string('employment_type')->default('full_time');
                $table->date('joining_date')->nullable();
                $table->date('confirmation_date')->nullable();
                $table->date('date_of_birth')->nullable();
                $table->string('nid_number')->nullable();
                $table->text('address')->nullable();
                $table->json('emergency_contact')->nullable();
                $table->json('documents')->nullable();
                $table->enum('status', ['active', 'inactive', 'probation', 'resigned', 'terminated'])->default('active');
                $table->date('exit_date')->nullable();
                $table->text('exit_reason')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
                $table->index(['branch_id', 'status']);
            });
        }

        if (!Schema::hasTable('nst_hr_attendance')) {
            Schema::create('nst_hr_attendance', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_id')->constrained('nst_hr_employees')->cascadeOnDelete();
                $table->date('attendance_date');
                $table->time('check_in')->nullable();
                $table->time('check_out')->nullable();
                $table->unsignedInteger('late_minutes')->default(0);
                $table->unsignedInteger('overtime_minutes')->default(0);
                $table->string('status')->default('present');
                $table->string('source')->default('manual');
                $table->text('note')->nullable();
                $table->foreignId('corrected_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('approved_at')->nullable();
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->unique(['employee_id', 'attendance_date']);
            });
        }

        if (!Schema::hasTable('nst_hr_leave_types')) {
            Schema::create('nst_hr_leave_types', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('code', 60)->unique();
                $table->decimal('annual_days', 8, 2)->default(0);
                $table->boolean('is_paid')->default(true);
                $table->boolean('requires_attachment')->default(false);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('nst_hr_leave_requests')) {
            Schema::create('nst_hr_leave_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_id')->constrained('nst_hr_employees')->cascadeOnDelete();
                $table->foreignId('leave_type_id')->constrained('nst_hr_leave_types')->restrictOnDelete();
                $table->date('starts_on');
                $table->date('ends_on');
                $table->decimal('days', 8, 2);
                $table->text('reason')->nullable();
                $table->json('attachments')->nullable();
                $table->enum('status', ['pending', 'approved', 'rejected', 'cancelled'])->default('pending');
                $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('reviewed_at')->nullable();
                $table->text('review_note')->nullable();
                $table->timestamps();
                $table->index(['status', 'starts_on']);
            });
        }

        if (!Schema::hasTable('nst_hr_salary_structures')) {
            Schema::create('nst_hr_salary_structures', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_id')->constrained('nst_hr_employees')->cascadeOnDelete();
                $table->date('effective_from');
                $table->date('effective_to')->nullable();
                $table->decimal('basic_salary', 16, 2)->default(0);
                $table->json('earnings')->nullable();
                $table->json('deductions')->nullable();
                $table->decimal('tax_amount', 16, 2)->default(0);
                $table->decimal('gross_salary', 16, 2)->default(0);
                $table->decimal('net_salary', 16, 2)->default(0);
                $table->boolean('is_active')->default(true);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(['employee_id', 'effective_from']);
            });
        }

        if (!Schema::hasTable('nst_hr_payroll_periods')) {
            Schema::create('nst_hr_payroll_periods', function (Blueprint $table) {
                $table->id();
                $table->string('period_no', 80)->unique();
                $table->string('name');
                $table->date('starts_on');
                $table->date('ends_on');
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->enum('status', ['draft', 'reviewed', 'approved', 'locked', 'paid', 'reversed'])->default('draft');
                $table->decimal('gross_total', 16, 2)->default(0);
                $table->decimal('deduction_total', 16, 2)->default(0);
                $table->decimal('net_total', 16, 2)->default(0);
                $table->foreignId('journal_id')->nullable()->constrained('nst_journals')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('paid_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('approved_at')->nullable();
                $table->timestamp('locked_at')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->timestamps();
                $table->unique(['starts_on', 'ends_on', 'branch_id']);
            });
        }

        if (!Schema::hasTable('nst_hr_payroll_entries')) {
            Schema::create('nst_hr_payroll_entries', function (Blueprint $table) {
                $table->id();
                $table->foreignId('period_id')->constrained('nst_hr_payroll_periods')->cascadeOnDelete();
                $table->foreignId('employee_id')->constrained('nst_hr_employees')->restrictOnDelete();
                $table->decimal('basic_salary', 16, 2)->default(0);
                $table->json('earnings')->nullable();
                $table->json('deductions')->nullable();
                $table->decimal('overtime_amount', 16, 2)->default(0);
                $table->decimal('commission_amount', 16, 2)->default(0);
                $table->decimal('bonus_amount', 16, 2)->default(0);
                $table->decimal('loan_recovery', 16, 2)->default(0);
                $table->decimal('tax_amount', 16, 2)->default(0);
                $table->decimal('gross_salary', 16, 2)->default(0);
                $table->decimal('total_deduction', 16, 2)->default(0);
                $table->decimal('net_salary', 16, 2)->default(0);
                $table->string('payment_method')->nullable();
                $table->string('payment_reference')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->timestamps();
                $table->unique(['period_id', 'employee_id']);
            });
        }

        if (!Schema::hasTable('nst_hr_loans')) {
            Schema::create('nst_hr_loans', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_id')->constrained('nst_hr_employees')->cascadeOnDelete();
                $table->string('loan_type')->default('advance');
                $table->decimal('principal_amount', 16, 2);
                $table->decimal('installment_amount', 16, 2)->default(0);
                $table->decimal('recovered_amount', 16, 2)->default(0);
                $table->decimal('outstanding_amount', 16, 2);
                $table->date('starts_on')->nullable();
                $table->enum('status', ['pending', 'approved', 'active', 'settled', 'rejected', 'cancelled'])->default('pending');
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('note')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('nst_hr_performance_reviews')) {
            Schema::create('nst_hr_performance_reviews', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_id')->constrained('nst_hr_employees')->cascadeOnDelete();
                $table->string('review_type')->default('performance');
                $table->date('review_date');
                $table->decimal('score', 8, 2)->nullable();
                $table->json('goals')->nullable();
                $table->json('competencies')->nullable();
                $table->text('summary')->nullable();
                $table->string('outcome')->nullable();
                $table->foreignId('reviewer_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }
    }

    private function createCmsTables(): void
    {
        if (!Schema::hasTable('nst_cms_pages')) {
            Schema::create('nst_cms_pages', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->string('slug')->unique();
                $table->string('route')->unique();
                $table->string('page_type')->default('custom');
                $table->enum('status', ['draft', 'published', 'archived'])->default('draft');
                $table->longText('content')->nullable();
                $table->json('seo')->nullable();
                $table->json('faq')->nullable();
                $table->json('settings')->nullable();
                $table->boolean('is_visible')->default(true);
                $table->unsignedInteger('sort_order')->default(0);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('published_at')->nullable();
                $table->timestamps();
                $table->softDeletes();
                $table->index(['status', 'is_visible']);
            });
        }

        if (!Schema::hasTable('nst_cms_page_revisions')) {
            Schema::create('nst_cms_page_revisions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('page_id')->constrained('nst_cms_pages')->cascadeOnDelete();
                $table->unsignedInteger('revision_no');
                $table->string('action')->default('save');
                $table->longText('snapshot');
                $table->text('change_note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->unique(['page_id', 'revision_no']);
            });
        }

        if (!Schema::hasTable('nst_cms_publication_logs')) {
            Schema::create('nst_cms_publication_logs', function (Blueprint $table) {
                $table->id();
                $table->string('resource_type')->default('page');
                $table->unsignedBigInteger('resource_id')->nullable();
                $table->string('action');
                $table->string('environment')->default('local');
                $table->json('summary')->nullable();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(['resource_type', 'resource_id']);
            });
        }
    }

    private function seedFinanceFoundation(): void
    {
        if (!Schema::hasTable('nst_account_groups') || !Schema::hasTable('nst_accounts')) {
            return;
        }

        $now = now();
        $groups = [
            ['name' => 'Assets', 'code' => 'ASSET', 'type' => 'asset'],
            ['name' => 'Liabilities', 'code' => 'LIABILITY', 'type' => 'liability'],
            ['name' => 'Equity', 'code' => 'EQUITY', 'type' => 'equity'],
            ['name' => 'Income', 'code' => 'INCOME', 'type' => 'income'],
            ['name' => 'Expenses', 'code' => 'EXPENSE', 'type' => 'expense'],
        ];

        foreach ($groups as $index => $group) {
            DB::table('nst_account_groups')->updateOrInsert(
                ['code' => $group['code']],
                $group + ['is_system' => true, 'is_active' => true, 'sort_order' => $index + 1, 'updated_at' => $now, 'created_at' => $now]
            );
        }

        $groupIds = DB::table('nst_account_groups')->pluck('id', 'code');
        $accounts = [
            ['name' => 'Cash in Hand', 'code' => '1000', 'group' => 'ASSET', 'account_kind' => 'cash', 'is_cash' => true, 'is_bank' => false],
            ['name' => 'Bank Account', 'code' => '1010', 'group' => 'ASSET', 'account_kind' => 'bank', 'is_cash' => false, 'is_bank' => true],
            ['name' => 'Customer Receivable', 'code' => '1100', 'group' => 'ASSET', 'account_kind' => 'receivable', 'is_cash' => false, 'is_bank' => false],
            ['name' => 'Inventory Asset', 'code' => '1200', 'group' => 'ASSET', 'account_kind' => 'inventory', 'is_cash' => false, 'is_bank' => false],
            ['name' => 'Supplier Payable', 'code' => '2000', 'group' => 'LIABILITY', 'account_kind' => 'payable', 'is_cash' => false, 'is_bank' => false],
            ['name' => 'Owner Equity', 'code' => '3000', 'group' => 'EQUITY', 'account_kind' => 'equity', 'is_cash' => false, 'is_bank' => false],
            ['name' => 'Sales Revenue', 'code' => '4000', 'group' => 'INCOME', 'account_kind' => 'income', 'is_cash' => false, 'is_bank' => false],
            ['name' => 'Service Revenue', 'code' => '4100', 'group' => 'INCOME', 'account_kind' => 'income', 'is_cash' => false, 'is_bank' => false],
            ['name' => 'Cost of Goods Sold', 'code' => '5000', 'group' => 'EXPENSE', 'account_kind' => 'expense', 'is_cash' => false, 'is_bank' => false],
            ['name' => 'Operating Expense', 'code' => '5100', 'group' => 'EXPENSE', 'account_kind' => 'expense', 'is_cash' => false, 'is_bank' => false],
            ['name' => 'Salary Expense', 'code' => '5200', 'group' => 'EXPENSE', 'account_kind' => 'expense', 'is_cash' => false, 'is_bank' => false],
        ];

        foreach ($accounts as $account) {
            DB::table('nst_accounts')->updateOrInsert(
                ['code' => $account['code']],
                [
                    'group_id' => $groupIds[$account['group']],
                    'name' => $account['name'],
                    'account_kind' => $account['account_kind'],
                    'currency' => 'BDT',
                    'opening_balance' => 0,
                    'opening_side' => 'debit',
                    'is_cash' => $account['is_cash'],
                    'is_bank' => $account['is_bank'],
                    'is_system' => true,
                    'is_active' => true,
                    'updated_at' => $now,
                    'created_at' => $now,
                ]
            );
        }
    }

    private function seedHrmFoundation(): void
    {
        $now = now();
        if (Schema::hasTable('nst_hr_leave_types')) {
            foreach ([
                ['name' => 'Casual Leave', 'code' => 'CL', 'annual_days' => 10, 'is_paid' => true],
                ['name' => 'Sick Leave', 'code' => 'SL', 'annual_days' => 14, 'is_paid' => true],
                ['name' => 'Annual Leave', 'code' => 'AL', 'annual_days' => 18, 'is_paid' => true],
                ['name' => 'Unpaid Leave', 'code' => 'UL', 'annual_days' => 0, 'is_paid' => false],
            ] as $type) {
                DB::table('nst_hr_leave_types')->updateOrInsert(
                    ['code' => $type['code']],
                    $type + ['is_active' => true, 'updated_at' => $now, 'created_at' => $now]
                );
            }
        }

        if (Schema::hasTable('nst_hr_shifts')) {
            DB::table('nst_hr_shifts')->updateOrInsert(
                ['code' => 'GENERAL'],
                [
                    'name' => 'General Shift',
                    'starts_at' => '10:00:00',
                    'ends_at' => '20:00:00',
                    'grace_minutes' => 15,
                    'is_night_shift' => false,
                    'weekends' => json_encode(['Friday']),
                    'is_active' => true,
                    'updated_at' => $now,
                    'created_at' => $now,
                ]
            );
        }
    }

    public function down(): void
    {
        foreach ([
            'nst_cms_publication_logs', 'nst_cms_page_revisions', 'nst_cms_pages',
            'nst_hr_performance_reviews', 'nst_hr_loans', 'nst_hr_payroll_entries', 'nst_hr_payroll_periods',
            'nst_hr_salary_structures', 'nst_hr_leave_requests', 'nst_hr_leave_types', 'nst_hr_attendance',
            'nst_hr_employees', 'nst_hr_shifts', 'nst_hr_designations', 'nst_hr_departments',
            'nst_crm_feedback', 'nst_crm_loyalty_entries', 'nst_crm_segments', 'nst_crm_activities',
            'nst_crm_leads', 'nst_crm_profiles',
            'nst_payment_reconciliations', 'nst_cash_sessions', 'nst_journal_lines', 'nst_journals',
            'nst_accounts', 'nst_account_groups',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
