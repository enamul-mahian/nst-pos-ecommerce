<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('nst_zk_devices')) {
            Schema::create('nst_zk_devices', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('model')->nullable();
                $table->string('serial_number', 190)->unique();
                $table->string('device_code', 100)->nullable()->index();
                $table->string('protocol', 40)->default('ta_push');
                $table->string('terminal_mode', 40)->default('attendance');
                $table->string('direction_role', 40)->default('bidirectional');
                $table->string('timezone', 80)->default('Asia/Dhaka');
                $table->string('ip_address', 64)->nullable();
                $table->unsignedInteger('port')->nullable();
                $table->json('verification_code_map')->nullable();
                $table->json('punch_state_map')->nullable();
                $table->json('capabilities')->nullable();
                $table->string('token_hash', 64)->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamp('last_seen_at')->nullable();
                $table->string('last_seen_ip', 64)->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('nst_zk_employee_mappings')) {
            Schema::create('nst_zk_employee_mappings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_id')->constrained('nst_hr_employees')->cascadeOnDelete();
                $table->foreignId('device_id')->constrained('nst_zk_devices')->cascadeOnDelete();
                $table->string('device_user_id', 190);
                $table->string('card_number', 190)->nullable();
                $table->boolean('is_active')->default(true);
                $table->json('meta')->nullable();
                $table->timestamps();
                $table->unique(['device_id', 'device_user_id'], 'nst_zk_map_device_user_unique');
                $table->index(['device_id', 'card_number'], 'nst_zk_map_device_card_idx');
                $table->index(['employee_id', 'is_active'], 'nst_zk_map_employee_active_idx');
            });
        }

        if (!Schema::hasTable('nst_zk_ingest_packets')) {
            Schema::create('nst_zk_ingest_packets', function (Blueprint $table) {
                $table->id();
                $table->foreignId('device_id')->nullable()->constrained('nst_zk_devices')->nullOnDelete();
                $table->string('serial_number', 190)->nullable();
                $table->string('endpoint', 190);
                $table->string('http_method', 12)->default('POST');
                $table->json('query_params')->nullable();
                $table->longText('raw_payload')->nullable();
                $table->string('payload_hash', 64)->unique();
                $table->string('parse_status', 40)->default('received');
                $table->text('parse_note')->nullable();
                $table->string('source_ip', 64)->nullable();
                $table->timestamp('received_at');
                $table->timestamps();
                $table->index(['device_id', 'received_at'], 'nst_zk_packet_device_time_idx');
                $table->index(['parse_status', 'received_at'], 'nst_zk_packet_status_time_idx');
            });
        }

        if (!Schema::hasTable('nst_hr_attendance_events')) {
            Schema::create('nst_hr_attendance_events', function (Blueprint $table) {
                $table->id();
                $table->foreignId('device_id')->nullable()->constrained('nst_zk_devices')->nullOnDelete();
                $table->foreignId('packet_id')->nullable()->constrained('nst_zk_ingest_packets')->nullOnDelete();
                $table->foreignId('employee_id')->nullable()->constrained('nst_hr_employees')->nullOnDelete();
                $table->string('device_user_id', 190)->nullable();
                $table->string('card_number', 190)->nullable();
                $table->dateTime('event_time');
                $table->string('event_type', 80)->default('verification');
                $table->string('verification_mode', 190)->nullable();
                $table->string('verification_code', 80)->nullable();
                $table->boolean('face_verified')->nullable();
                $table->boolean('fingerprint_verified')->nullable();
                $table->boolean('card_verified')->nullable();
                $table->boolean('three_factor_verified')->default(false);
                $table->string('direction', 20)->nullable();
                $table->string('direction_source', 40)->nullable();
                $table->string('punch_state', 80)->nullable();
                $table->string('event_unique_id', 190)->nullable();
                $table->string('event_fingerprint', 64)->unique();
                $table->string('source_protocol', 40)->nullable();
                $table->string('source_endpoint', 190)->nullable();
                $table->string('processing_status', 40)->default('received');
                $table->text('processing_note')->nullable();
                $table->longText('raw_payload')->nullable();
                $table->timestamp('received_at');
                $table->timestamps();
                $table->index(['employee_id', 'event_time'], 'nst_att_event_employee_time_idx');
                $table->index(['device_id', 'event_time'], 'nst_att_event_device_time_idx');
                $table->index(['processing_status', 'event_time'], 'nst_att_event_status_time_idx');
                $table->index(['device_id', 'event_unique_id'], 'nst_att_event_unique_hint_idx');
            });
        }

        if (!Schema::hasTable('nst_hr_movement_logs')) {
            Schema::create('nst_hr_movement_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_id')->constrained('nst_hr_employees')->cascadeOnDelete();
                $table->date('movement_date');
                $table->dateTime('out_time');
                $table->dateTime('in_time')->nullable();
                $table->unsignedInteger('outside_duration_minutes')->nullable();
                $table->foreignId('out_event_id')->nullable()->constrained('nst_hr_attendance_events')->nullOnDelete();
                $table->foreignId('in_event_id')->nullable()->constrained('nst_hr_attendance_events')->nullOnDelete();
                $table->string('status', 40)->default('open');
                $table->timestamps();
                $table->unique('out_event_id', 'nst_hr_movement_out_event_unique');
                $table->index(['employee_id', 'movement_date'], 'nst_hr_movement_employee_date_idx');
            });
        }

        if (Schema::hasTable('nst_hr_attendance')) {
            Schema::table('nst_hr_attendance', function (Blueprint $table) {
                if (!Schema::hasColumn('nst_hr_attendance', 'total_inside_minutes')) {
                    $table->unsignedInteger('total_inside_minutes')->default(0)->after('overtime_minutes');
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'total_outside_minutes')) {
                    $table->unsignedInteger('total_outside_minutes')->default(0)->after('total_inside_minutes');
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'exit_count')) {
                    $table->unsignedInteger('exit_count')->default(0)->after('total_outside_minutes');
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'early_leave_minutes')) {
                    $table->unsignedInteger('early_leave_minutes')->default(0)->after('exit_count');
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'first_attendance_verified_at')) {
                    $table->dateTime('first_attendance_verified_at')->nullable()->after('early_leave_minutes');
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'first_verification_mode')) {
                    $table->string('first_verification_mode', 190)->nullable()->after('first_attendance_verified_at');
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'first_device_event_id')) {
                    $table->unsignedBigInteger('first_device_event_id')->nullable()->after('first_verification_mode');
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'last_device_event_id')) {
                    $table->unsignedBigInteger('last_device_event_id')->nullable()->after('first_device_event_id');
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'movement_state')) {
                    $table->string('movement_state', 20)->nullable()->after('last_device_event_id');
                }
                if (!Schema::hasColumn('nst_hr_attendance', 'attendance_open')) {
                    $table->boolean('attendance_open')->default(false)->after('movement_state');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('nst_hr_attendance')) {
            $columns = [
                'total_inside_minutes', 'total_outside_minutes', 'exit_count', 'early_leave_minutes',
                'first_attendance_verified_at', 'first_verification_mode', 'first_device_event_id',
                'last_device_event_id', 'movement_state', 'attendance_open',
            ];
            $existing = array_values(array_filter($columns, fn ($column) => Schema::hasColumn('nst_hr_attendance', $column)));
            if ($existing) {
                Schema::table('nst_hr_attendance', function (Blueprint $table) use ($existing) {
                    $table->dropColumn($existing);
                });
            }
        }

        Schema::dropIfExists('nst_hr_movement_logs');
        Schema::dropIfExists('nst_hr_attendance_events');
        Schema::dropIfExists('nst_zk_ingest_packets');
        Schema::dropIfExists('nst_zk_employee_mappings');
        Schema::dropIfExists('nst_zk_devices');
    }
};
