<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('nid_verification_providers')) {
            Schema::create('nid_verification_providers', function (Blueprint $table) {
                $table->id();
                $table->string('name')->default('Authorized NID Verification Provider');
                $table->string('mode', 40)->default('manual');
                $table->text('api_url')->nullable();
                $table->string('http_method', 12)->default('POST');
                $table->string('request_format', 20)->default('json');
                $table->string('auth_type', 30)->default('bearer');
                $table->string('auth_header', 100)->default('Authorization');
                $table->string('auth_scheme', 40)->default('Bearer');
                $table->longText('access_token')->nullable();
                $table->timestamp('token_expires_at')->nullable();
                $table->timestamp('token_updated_at')->nullable();
                $table->text('authentication_url')->nullable();
                $table->longText('request_headers')->nullable();
                $table->longText('request_template')->nullable();
                $table->longText('response_mapping')->nullable();
                $table->string('success_path')->nullable();
                $table->longText('success_values')->nullable();
                $table->unsignedSmallInteger('timeout_seconds')->default(20);
                $table->boolean('is_active')->default(false)->index();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });

            DB::table('nid_verification_providers')->insert([
                'name' => 'Authorized NID Verification Provider',
                'mode' => 'manual',
                'http_method' => 'POST',
                'request_format' => 'json',
                'auth_type' => 'bearer',
                'auth_header' => 'Authorization',
                'auth_scheme' => 'Bearer',
                'request_headers' => json_encode(['Accept' => 'application/json'], JSON_UNESCAPED_SLASHES),
                'request_template' => json_encode([
                    'nid' => '{{nid_number}}',
                    'date_of_birth' => '{{date_of_birth}}',
                ], JSON_UNESCAPED_SLASHES),
                'response_mapping' => json_encode([], JSON_UNESCAPED_SLASHES),
                'success_values' => json_encode(['true', 'success', 'verified', 'valid', '1'], JSON_UNESCAPED_SLASHES),
                'timeout_seconds' => 20,
                'is_active' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if (! Schema::hasTable('nid_verification_fields')) {
            Schema::create('nid_verification_fields', function (Blueprint $table) {
                $table->id();
                $table->string('label');
                $table->string('field_key')->unique();
                $table->string('field_type', 30)->default('text');
                $table->string('placeholder')->nullable();
                $table->longText('options')->nullable();
                $table->string('validation_rule')->nullable();
                $table->boolean('is_required')->default(false);
                $table->boolean('send_to_provider')->default(true);
                $table->boolean('internal_only')->default(false);
                $table->boolean('is_active')->default(true)->index();
                $table->unsignedInteger('sort_order')->default(0);
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        if (Schema::hasTable('nid_verification_logs')) {
            Schema::table('nid_verification_logs', function (Blueprint $table) {
                if (! Schema::hasColumn('nid_verification_logs', 'request_uuid')) {
                    $table->uuid('request_uuid')->nullable()->unique();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'provider_id')) {
                    $table->unsignedBigInteger('provider_id')->nullable()->index();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'custom_data')) {
                    $table->longText('custom_data')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'request_payload')) {
                    $table->longText('request_payload')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'response_payload')) {
                    $table->longText('response_payload')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'mapped_result')) {
                    $table->longText('mapped_result')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'error_code')) {
                    $table->string('error_code', 100)->nullable()->index();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'error_message')) {
                    $table->text('error_message')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'consent_at')) {
                    $table->timestamp('consent_at')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'started_at')) {
                    $table->timestamp('started_at')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'completed_at')) {
                    $table->timestamp('completed_at')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'auth_required_at')) {
                    $table->timestamp('auth_required_at')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'last_attempt_at')) {
                    $table->timestamp('last_attempt_at')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'retry_count')) {
                    $table->unsignedInteger('retry_count')->default(0);
                }
                if (! Schema::hasColumn('nid_verification_logs', 'resumed_by')) {
                    $table->unsignedBigInteger('resumed_by')->nullable();
                }
                if (! Schema::hasColumn('nid_verification_logs', 'updated_by')) {
                    $table->unsignedBigInteger('updated_by')->nullable();
                }
            });

            DB::table('nid_verification_logs')
                ->whereNull('request_uuid')
                ->orderBy('id')
                ->get(['id'])
                ->each(function ($row): void {
                    DB::table('nid_verification_logs')->where('id', $row->id)->update([
                        'request_uuid' => (string) Illuminate\Support\Str::uuid(),
                    ]);
                });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('nid_verification_logs')) {
            Schema::table('nid_verification_logs', function (Blueprint $table) {
                $columns = [
                    'request_uuid', 'provider_id', 'custom_data', 'request_payload',
                    'response_payload', 'mapped_result', 'error_code', 'error_message',
                    'consent_at', 'started_at', 'completed_at', 'auth_required_at',
                    'last_attempt_at', 'retry_count', 'resumed_by', 'updated_by',
                ];
                $existing = array_values(array_filter($columns, fn (string $column): bool => Schema::hasColumn('nid_verification_logs', $column)));
                if ($existing !== []) {
                    $table->dropColumn($existing);
                }
            });
        }

        Schema::dropIfExists('nid_verification_fields');
        Schema::dropIfExists('nid_verification_providers');
    }
};
