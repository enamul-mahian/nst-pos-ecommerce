<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('nst_hr_operation_logs')) {
            Schema::create('nst_hr_operation_logs', function (Blueprint $table) {
                $table->id();
                $table->string('action', 120)->index();
                $table->string('resource_type', 120)->nullable()->index();
                $table->string('resource_id', 80)->nullable()->index();
                $table->longText('before_payload')->nullable();
                $table->longText('after_payload')->nullable();
                $table->json('metadata')->nullable();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->timestamp('created_at')->nullable()->index();
            });
        }

        if (! Schema::hasTable('nst_hr_payslip_publications')) {
            Schema::create('nst_hr_payslip_publications', function (Blueprint $table) {
                $table->id();
                $table->foreignId('period_id')->constrained('nst_hr_payroll_periods')->cascadeOnDelete();
                $table->foreignId('entry_id')->constrained('nst_hr_payroll_entries')->cascadeOnDelete();
                $table->foreignId('employee_id')->constrained('nst_hr_employees')->cascadeOnDelete();
                $table->string('public_token', 80)->unique();
                $table->string('delivery_channel', 80)->default('portal');
                $table->enum('status', ['draft', 'published', 'cancelled'])->default('published')->index();
                $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('published_at')->nullable()->index();
                $table->timestamps();
                $table->unique(['period_id', 'entry_id'], 'nst_hr_payslip_period_entry_unique');
                $table->index(['employee_id', 'status'], 'nst_hr_payslip_employee_status_idx');
            });
        }

        if (! Schema::hasTable('nst_hr_payroll_entry_adjustments')) {
            Schema::create('nst_hr_payroll_entry_adjustments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('period_id')->constrained('nst_hr_payroll_periods')->cascadeOnDelete();
                $table->foreignId('entry_id')->constrained('nst_hr_payroll_entries')->cascadeOnDelete();
                $table->foreignId('employee_id')->constrained('nst_hr_employees')->cascadeOnDelete();
                $table->decimal('old_net_salary', 16, 2)->default(0);
                $table->decimal('new_net_salary', 16, 2)->default(0);
                $table->json('changes')->nullable();
                $table->text('note')->nullable();
                $table->foreignId('adjusted_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(['period_id', 'entry_id'], 'nst_hr_payroll_adjust_entry_idx');
            });
        }

        $now = now();
        if (Schema::hasTable('nst_hr_operation_logs')) {
            DB::table('nst_hr_operation_logs')->insert([
                'action' => 'stage7.acceptance.installed',
                'resource_type' => 'stage7_hrm_payroll',
                'resource_id' => null,
                'before_payload' => null,
                'after_payload' => json_encode([
                    'employee_lifecycle' => true,
                    'attendance_summary' => true,
                    'leave_balance' => true,
                    'payroll_entry_adjustment' => true,
                    'payslip_publication' => true,
                    'payroll_export' => true,
                    'audit_history' => true,
                ]),
                'metadata' => json_encode(['installer' => 'NST_STAGE7_HRM_PAYROLL_COMPLETE_V1']),
                'user_id' => null,
                'branch_id' => null,
                'created_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('nst_hr_payroll_entry_adjustments');
        Schema::dropIfExists('nst_hr_payslip_publications');
        Schema::dropIfExists('nst_hr_operation_logs');
    }
};
