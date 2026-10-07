<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('dashboard_targets')) {
            Schema::create('dashboard_targets', function (Blueprint $table) {
                $table->id();
                $table->date('target_date')->index();
                $table->string('target_type', 50)->default('sales_amount')->index();
                $table->string('scope_key', 80)->index();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->string('combined_mode', 30)->nullable();
                $table->decimal('target_value', 18, 2)->default(0);
                $table->text('notes')->nullable();
                $table->boolean('is_active')->default(true);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->unique(['target_date', 'target_type', 'scope_key'], 'dashboard_targets_scope_unique');
            });
        }

        if (! Schema::hasTable('nst_staff_chat_threads')) {
            Schema::create('nst_staff_chat_threads', function (Blueprint $table) {
                $table->id();
                $table->string('title')->nullable();
                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->boolean('is_group')->default(false);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('last_message_at')->nullable()->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('nst_staff_chat_messages')) {
            Schema::create('nst_staff_chat_messages', function (Blueprint $table) {
                $table->id();
                $table->foreignId('thread_id')->constrained('nst_staff_chat_threads')->cascadeOnDelete();
                $table->foreignId('sender_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('reply_to_id')->nullable()->constrained('nst_staff_chat_messages')->nullOnDelete();
                $table->text('body')->nullable();
                $table->json('attachments')->nullable();
                $table->timestamps();
                $table->index(['thread_id', 'created_at']);
            });
        }

        if (! Schema::hasTable('nst_staff_chat_participants')) {
            Schema::create('nst_staff_chat_participants', function (Blueprint $table) {
                $table->id();
                $table->foreignId('thread_id')->constrained('nst_staff_chat_threads')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->unsignedBigInteger('last_read_message_id')->nullable();
                $table->timestamp('last_seen_at')->nullable();
                $table->timestamps();
                $table->unique(['thread_id', 'user_id'], 'staff_chat_participant_unique');
            });
        }

        if (! Schema::hasTable('business_bulletins')) {
            Schema::create('business_bulletins', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->text('body');
                $table->string('priority', 20)->default('normal')->index();
                $table->json('audience_roles')->nullable();
                $table->json('branch_ids')->nullable();
                $table->timestamp('publish_at')->nullable()->index();
                $table->timestamp('expires_at')->nullable()->index();
                $table->string('attachment_path')->nullable();
                $table->string('status', 20)->default('published')->index();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('business_bulletin_reads')) {
            Schema::create('business_bulletin_reads', function (Blueprint $table) {
                $table->id();
                $table->foreignId('bulletin_id')->constrained('business_bulletins')->cascadeOnDelete();
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->timestamp('read_at');
                $table->timestamps();
                $table->unique(['bulletin_id', 'user_id'], 'business_bulletin_read_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('business_bulletin_reads');
        Schema::dropIfExists('business_bulletins');
        Schema::dropIfExists('nst_staff_chat_participants');
        Schema::dropIfExists('nst_staff_chat_messages');
        Schema::dropIfExists('nst_staff_chat_threads');
        Schema::dropIfExists('dashboard_targets');
    }
};
