<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('nst_hr_attendance')) {
            Schema::table('nst_hr_attendance', function (Blueprint $table) {
                if (!Schema::hasColumn('nst_hr_attendance', 'in_count')) {
                    $table->unsignedInteger('in_count')->default(0);
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'out_count')) {
                    $table->unsignedInteger('out_count')->default(0);
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'final_out_at')) {
                    $table->dateTime('final_out_at')->nullable();
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'last_action_type')) {
                    $table->string('last_action_type', 40)->nullable();
                }
            });
        }

        if (!Schema::hasTable('nst_hr_attendance_actions')) {
            Schema::create('nst_hr_attendance_actions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('employee_id');
                $table->unsignedBigInteger('device_id')->nullable();
                $table->date('action_date');
                $table->dateTime('action_time');
                $table->string('action_type', 40); // in,out,auto_in,auto_out,half_day_out
                $table->string('verification_type', 40)->default('face+fingerprint');
                $table->unsignedBigInteger('fingerprint_event_id')->nullable();
                $table->unsignedBigInteger('face_event_id')->nullable();
                $table->string('card_number')->nullable();
                $table->boolean('auto_generated')->default(false);
                $table->string('source', 30)->default('zkteco');
                $table->text('note')->nullable();
                $table->timestamps();

                $table->index(['employee_id', 'action_date'], 'nst_att_action_emp_date_idx');
                $table->index(['action_date', 'action_type'], 'nst_att_action_date_type_idx');
            });
        }

        if (Schema::hasTable('nst_zk_employee_mappings')) {
            Schema::table('nst_zk_employee_mappings', function (Blueprint $table) {
                if (!Schema::hasColumn('nst_zk_employee_mappings', 'card_status')) {
                    $table->string('card_status', 20)->default('not_assigned');
                }
            });
        }
    }

    public function down(): void
    {
        // Intentionally non-destructive.
    }
};
