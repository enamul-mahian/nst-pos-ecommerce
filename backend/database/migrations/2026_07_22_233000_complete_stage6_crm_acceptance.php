<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('nst_crm_leads')) {
            Schema::table('nst_crm_leads', function (Blueprint $table) {
                if (! Schema::hasColumn('nst_crm_leads', 'lost_reason')) $table->text('lost_reason')->nullable()->after('note');
                if (! Schema::hasColumn('nst_crm_leads', 'converted_customer_id')) $table->unsignedBigInteger('converted_customer_id')->nullable()->after('converted_at');
            });
        }

        if (Schema::hasTable('nst_crm_activities') && ! Schema::hasColumn('nst_crm_activities', 'branch_id')) {
            Schema::table('nst_crm_activities', function (Blueprint $table) {
                $table->unsignedBigInteger('branch_id')->nullable()->after('assigned_to');
                $table->index(['branch_id', 'status'], 'crm_act_branch_status_idx');
            });
        }

        if (! Schema::hasTable('nst_crm_support_cases')) {
            Schema::create('nst_crm_support_cases', function (Blueprint $table) {
                $table->id();
                $table->string('case_no', 80)->unique();
                $table->unsignedBigInteger('customer_id')->nullable();
                $table->unsignedBigInteger('lead_id')->nullable();
                $table->string('subject', 190);
                $table->string('category', 100)->default('general');
                $table->enum('priority', ['low', 'normal', 'high', 'urgent'])->default('normal');
                $table->enum('status', ['open', 'pending', 'resolved', 'closed'])->default('open');
                $table->text('description')->nullable();
                $table->text('resolution_note')->nullable();
                $table->string('source', 80)->default('crm');
                $table->unsignedBigInteger('assigned_to')->nullable();
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->timestamp('due_at')->nullable();
                $table->timestamp('resolved_at')->nullable();
                $table->unsignedBigInteger('resolved_by')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();
                $table->index(['status', 'priority'], 'crm_case_status_priority_idx');
                $table->index(['customer_id', 'created_at'], 'crm_case_customer_created_idx');
            });
        }

        if (! Schema::hasTable('nst_crm_campaigns')) {
            Schema::create('nst_crm_campaigns', function (Blueprint $table) {
                $table->id();
                $table->string('campaign_no', 80)->unique();
                $table->string('name', 160);
                $table->enum('channel', ['sms', 'email', 'whatsapp', 'call', 'manual'])->default('manual');
                $table->unsignedBigInteger('segment_id')->nullable();
                $table->string('subject', 190)->nullable();
                $table->text('message');
                $table->enum('status', ['draft', 'scheduled', 'running', 'completed', 'cancelled'])->default('draft');
                $table->timestamp('scheduled_at')->nullable();
                $table->timestamp('launched_at')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->unsignedInteger('audience_count')->default(0);
                $table->json('settings')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();
                $table->index(['status', 'scheduled_at'], 'crm_campaign_status_scheduled_idx');
            });
        }

        if (! Schema::hasTable('nst_crm_campaign_audiences')) {
            Schema::create('nst_crm_campaign_audiences', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('campaign_id');
                $table->unsignedBigInteger('customer_id');
                $table->enum('status', ['queued', 'sent', 'failed', 'responded', 'skipped'])->default('queued');
                $table->string('delivery_reference', 190)->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->timestamp('responded_at')->nullable();
                $table->text('error_message')->nullable();
                $table->timestamps();
                $table->unique(['campaign_id', 'customer_id'], 'crm_campaign_customer_unique');
                $table->index(['campaign_id', 'status'], 'crm_audience_campaign_status_idx');
            });
        }

        if (! Schema::hasTable('nst_crm_operation_logs')) {
            Schema::create('nst_crm_operation_logs', function (Blueprint $table) {
                $table->id();
                $table->string('action', 120);
                $table->string('resource_type', 120)->nullable();
                $table->string('resource_id', 120)->nullable();
                $table->json('before_payload')->nullable();
                $table->json('after_payload')->nullable();
                $table->json('metadata')->nullable();
                $table->unsignedBigInteger('user_id')->nullable();
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->timestamp('created_at')->useCurrent();
                $table->index(['action', 'created_at'], 'crm_log_action_created_idx');
                $table->index(['resource_type', 'resource_id'], 'crm_log_resource_idx');
            });
        }

        $this->seedDefaultSegments();
    }

    public function down(): void
    {
        Schema::dropIfExists('nst_crm_operation_logs');
        Schema::dropIfExists('nst_crm_campaign_audiences');
        Schema::dropIfExists('nst_crm_campaigns');
        Schema::dropIfExists('nst_crm_support_cases');
        if (Schema::hasTable('nst_crm_activities') && Schema::hasColumn('nst_crm_activities', 'branch_id')) {
            Schema::table('nst_crm_activities', function (Blueprint $table) {
                $table->dropIndex('crm_act_branch_status_idx');
                $table->dropColumn('branch_id');
            });
        }
        if (Schema::hasTable('nst_crm_leads')) {
            Schema::table('nst_crm_leads', function (Blueprint $table) {
                if (Schema::hasColumn('nst_crm_leads', 'lost_reason')) $table->dropColumn('lost_reason');
                if (Schema::hasColumn('nst_crm_leads', 'converted_customer_id')) $table->dropColumn('converted_customer_id');
            });
        }
    }

    private function seedDefaultSegments(): void
    {
        if (! Schema::hasTable('nst_crm_segments')) return;
        $defaults = [
            ['name' => 'High Value Customers', 'code' => 'high_value_customers', 'rules' => json_encode([['field' => 'loyalty_points_min', 'operator' => '>=', 'value' => 1500]])],
            ['name' => 'Converted Leads', 'code' => 'converted_leads', 'rules' => json_encode([['field' => 'segment', 'operator' => '=', 'value' => 'Converted Lead']])],
            ['name' => 'Service Follow-up', 'code' => 'service_follow_up', 'rules' => json_encode([['field' => 'segment', 'operator' => '=', 'value' => 'Service Follow-up']])],
        ];
        foreach ($defaults as $row) {
            DB::table('nst_crm_segments')->updateOrInsert(['code' => $row['code']], $row + ['is_dynamic' => true, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        }
    }
};
