<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('payment_gateway_settings')) {
            Schema::create('payment_gateway_settings', function (Blueprint $table) {
                $table->id();
                $table->string('provider', 60)->unique();
                $table->string('display_name', 120);
                $table->boolean('enabled')->default(false)->index();
                $table->string('mode', 20)->default('live');
                $table->unsignedInteger('sort_order')->default(0)->index();
                $table->boolean('refunds_enabled')->default(false);
                $table->json('config')->nullable();
                $table->longText('credentials')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable()->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('payment_webhook_logs')) {
            Schema::create('payment_webhook_logs', function (Blueprint $table) {
                $table->id();
                $table->string('provider', 60)->index();
                $table->unsignedBigInteger('payment_transaction_id')->nullable()->index();
                $table->string('provider_transaction_id', 190)->nullable()->index();
                $table->string('event_key', 120)->nullable()->index();
                $table->string('status', 60)->default('received')->index();
                $table->json('payload')->nullable();
                $table->json('verification_payload')->nullable();
                $table->unsignedSmallInteger('response_code')->nullable();
                $table->text('message')->nullable();
                $table->timestamp('received_at')->nullable()->index();
                $table->timestamp('processed_at')->nullable()->index();
                $table->timestamps();
            });
        }

        if (Schema::hasTable('payment_transactions')) {
            Schema::table('payment_transactions', function (Blueprint $table) {
                if (! Schema::hasColumn('payment_transactions', 'refund_amount')) {
                    $table->decimal('refund_amount', 15, 2)->default(0)->after('failed_at');
                }
                if (! Schema::hasColumn('payment_transactions', 'refund_payload')) {
                    $table->json('refund_payload')->nullable()->after('refund_amount');
                }
                if (! Schema::hasColumn('payment_transactions', 'refunded_at')) {
                    $table->timestamp('refunded_at')->nullable()->after('refund_payload');
                }
                if (! Schema::hasColumn('payment_transactions', 'last_verified_at')) {
                    $table->timestamp('last_verified_at')->nullable()->after('refunded_at');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('payment_transactions')) {
            Schema::table('payment_transactions', function (Blueprint $table) {
                foreach (['refund_amount', 'refund_payload', 'refunded_at', 'last_verified_at'] as $column) {
                    if (Schema::hasColumn('payment_transactions', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        Schema::dropIfExists('payment_webhook_logs');
        Schema::dropIfExists('payment_gateway_settings');
    }
};
