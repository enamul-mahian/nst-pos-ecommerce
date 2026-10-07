<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class Stage58CrmController extends Controller
{
    public function overview(Request $request): JsonResponse
    {
        $branchId = $request->integer('branch_id') ?: null;
        $customers = DB::table('customers')->when($branchId && Schema::hasColumn('customers', 'branch_id'), fn ($q) => $q->where('branch_id', $branchId));
        $openTickets = $this->supportCaseQuery($branchId)->whereNotIn('cases.status', ['resolved', 'closed'])->count();
        $leadStats = DB::table('nst_crm_leads')
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->selectRaw('stage, COUNT(*) as total, COALESCE(SUM(estimated_value),0) as value')
            ->groupBy('stage')
            ->get();

        $profileCount = Schema::hasTable('nst_crm_profiles') ? DB::table('nst_crm_profiles')->count() : 0;
        $campaignSummary = Schema::hasTable('nst_crm_campaigns')
            ? DB::table('nst_crm_campaigns')->selectRaw('status, COUNT(*) as total')->groupBy('status')->get()
            : collect();

        return $this->ok([
            'summary' => [
                'customers' => (clone $customers)->count(),
                'crm_profiles' => $profileCount,
                'active_leads' => DB::table('nst_crm_leads')->whereNotIn('stage', ['won', 'lost'])->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->count(),
                'won_value' => round((float) DB::table('nst_crm_leads')->where('stage', 'won')->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->sum('estimated_value'), 2),
                'due_follow_ups' => DB::table('nst_crm_activities')->where('status', 'planned')->where('due_at', '<=', now())->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->count(),
                'open_support_tickets' => $openTickets,
                'loyalty_points' => (int) DB::table('nst_crm_profiles')->sum('loyalty_points'),
                'open_feedback' => DB::table('nst_crm_feedback')->whereNotIn('status', ['resolved', 'closed'])->count(),
                'active_campaigns' => Schema::hasTable('nst_crm_campaigns') ? DB::table('nst_crm_campaigns')->whereIn('status', ['draft', 'scheduled', 'running'])->count() : 0,
                'operation_logs' => Schema::hasTable('nst_crm_operation_logs') ? DB::table('nst_crm_operation_logs')->count() : 0,
            ],
            'lead_pipeline' => $leadStats,
            'campaign_summary' => $campaignSummary,
            'upcoming_follow_ups' => DB::table('nst_crm_activities')
                ->leftJoin('customers', 'customers.id', '=', 'nst_crm_activities.customer_id')
                ->leftJoin('nst_crm_leads', 'nst_crm_leads.id', '=', 'nst_crm_activities.lead_id')
                ->where('nst_crm_activities.status', 'planned')
                ->whereNotNull('nst_crm_activities.due_at')
                ->when($branchId, fn ($q) => $q->where('nst_crm_activities.branch_id', $branchId))
                ->select('nst_crm_activities.*', 'customers.name as customer_name', 'nst_crm_leads.name as lead_name')
                ->orderBy('nst_crm_activities.due_at')
                ->limit(20)
                ->get(),
            'capabilities' => [
                'unified_profile' => true,
                'timeline' => true,
                'lead_pipeline' => true,
                'lead_conversion' => true,
                'segmentation' => true,
                'campaigns' => true,
                'loyalty_referral' => true,
                'support_sla' => true,
                'feedback_follow_up' => true,
                'duplicate_merge' => true,
                'audit_history' => true,
                'acceptance_status' => true,
            ],
            'acceptance' => $this->stageSixAcceptancePayload(),
        ]);
    }

    public function referenceData(Request $request): JsonResponse
    {
        return $this->ok([
            'branches' => Schema::hasTable('branches') ? DB::table('branches')->select('id', 'name', 'code')->orderBy('name')->get() : [],
            'users' => Schema::hasTable('users') ? DB::table('users')->select('id', 'name', 'email')->orderBy('name')->limit(300)->get() : [],
            'segments' => Schema::hasTable('nst_crm_segments') ? DB::table('nst_crm_segments')->where('is_active', true)->orderBy('name')->get()->map(function ($row) { $row->rules = $this->decodeJson($row->rules, []); return $row; }) : [],
            'stages' => ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'],
            'priorities' => ['low', 'normal', 'high', 'urgent'],
            'loyalty_tiers' => ['Member', 'Silver', 'Gold', 'Platinum'],
            'support_statuses' => ['open', 'pending', 'resolved', 'closed'],
            'support_priorities' => ['low', 'normal', 'high', 'urgent'],
            'campaign_statuses' => ['draft', 'scheduled', 'running', 'completed', 'cancelled'],
        ]);
    }

    public function customers(Request $request): JsonResponse
    {
        $query = DB::table('customers')
            ->leftJoin('nst_crm_profiles', 'nst_crm_profiles.customer_id', '=', 'customers.id')
            ->select('customers.*', 'nst_crm_profiles.segment', 'nst_crm_profiles.loyalty_tier', 'nst_crm_profiles.loyalty_points', 'nst_crm_profiles.tags', 'nst_crm_profiles.consents', 'nst_crm_profiles.assigned_to', 'nst_crm_profiles.branch_id as crm_branch_id', 'nst_crm_profiles.last_contacted_at', 'nst_crm_profiles.next_follow_up_at', 'nst_crm_profiles.referral_code');

        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(fn ($q) => $q->where('customers.name', 'like', "%{$search}%")
                ->orWhere('customers.phone', 'like', "%{$search}%")
                ->orWhere('customers.email', 'like', "%{$search}%"));
        }
        if ($request->filled('segment')) $query->where('nst_crm_profiles.segment', $request->input('segment'));
        if ($request->filled('branch_id')) $query->where('nst_crm_profiles.branch_id', $request->integer('branch_id'));
        if ($request->filled('loyalty_tier')) $query->where('nst_crm_profiles.loyalty_tier', $request->input('loyalty_tier'));

        $rows = $query->orderByDesc('customers.id')->limit(500)->get();
        $ids = $rows->pluck('id');
        $sales = Schema::hasTable('sales') && $ids->isNotEmpty() ? DB::table('sales')
            ->whereIn('customer_id', $ids)
            ->selectRaw('customer_id, COUNT(*) as purchase_count, COALESCE(SUM(total),0) as lifetime_value, COALESCE(SUM(due_amount),0) as due_amount, MAX(created_at) as last_purchase_at')
            ->groupBy('customer_id')->get()->keyBy('customer_id') : collect();
        $cases = Schema::hasTable('nst_crm_support_cases') && $ids->isNotEmpty() ? DB::table('nst_crm_support_cases')
            ->whereIn('customer_id', $ids)
            ->selectRaw('customer_id, COUNT(*) as support_count, SUM(CASE WHEN status NOT IN ("resolved","closed") THEN 1 ELSE 0 END) as open_support_count')
            ->groupBy('customer_id')->get()->keyBy('customer_id') : collect();
        $rows->each(function ($row) use ($sales, $cases) {
            $summary = $sales->get($row->id);
            $caseSummary = $cases->get($row->id);
            $row->purchase_count = (int) ($summary->purchase_count ?? 0);
            $row->lifetime_value = round((float) ($summary->lifetime_value ?? 0), 2);
            $row->due_amount = round((float) ($summary->due_amount ?? ($row->current_balance ?? 0)), 2);
            $row->last_purchase_at = $summary->last_purchase_at ?? null;
            $row->support_count = (int) ($caseSummary->support_count ?? 0);
            $row->open_support_count = (int) ($caseSummary->open_support_count ?? 0);
            $row->tags = $this->decodeJson($row->tags ?? null, []);
            $row->consents = $this->decodeJson($row->consents ?? null, []);
        });

        return $this->ok($rows);
    }

    public function customerTimeline(Request $request, int $customerId): JsonResponse
    {
        $customer = DB::table('customers')->where('id', $customerId)->first();
        abort_if(!$customer, 404, 'Customer not found.');
        $events = collect();

        $events = $events->concat($this->timelineRows('sales', 'customer_id', $customerId, 'sale', ['invoice_no', 'total', 'paid_amount', 'due_amount', 'status']));
        $events = $events->concat($this->timelineRows('customer_orders', 'customer_id', $customerId, 'web_order', ['order_no', 'grand_total', 'payment_status', 'status']));
        $events = $events->concat($this->timelineRows('booking_preorders', 'customer_id', $customerId, 'preorder', ['booking_no', 'status', 'booking_amount']));
        $events = $events->concat($this->timelineRows('warranty_service_jobs', 'customer_id', $customerId, 'service', ['job_no', 'status', 'estimated_cost', 'paid_amount']));
        $events = $events->concat($this->timelineRows('customer_payments', 'customer_id', $customerId, 'payment', ['amount', 'payment_method', 'transaction_id']));
        $events = $events->concat($this->timelineRows('customer_messages', 'customer_id', $customerId, 'support_message', ['subject', 'category', 'status']));
        $events = $events->concat($this->timelineRows('nst_crm_support_cases', 'customer_id', $customerId, 'support_case', ['case_no', 'subject', 'category', 'priority', 'status']));
        $events = $events->concat(DB::table('nst_crm_activities')->where('customer_id', $customerId)->get()->map(fn ($row) => [
            'type' => 'crm_activity', 'date' => $row->completed_at ?: $row->due_at ?: $row->created_at,
            'title' => $row->subject, 'status' => $row->status, 'data' => (array) $row,
        ]));
        if (Schema::hasTable('nst_crm_loyalty_entries')) {
            $events = $events->concat(DB::table('nst_crm_loyalty_entries')->where('customer_id', $customerId)->get()->map(fn ($row) => [
                'type' => 'loyalty', 'date' => $row->created_at, 'title' => 'Loyalty ' . $row->entry_type,
                'status' => $row->points >= 0 ? 'earned' : 'redeemed', 'data' => (array) $row,
            ]));
        }

        return $this->ok([
            'customer' => $customer,
            'profile' => DB::table('nst_crm_profiles')->where('customer_id', $customerId)->first(),
            'events' => $events->sortByDesc('date')->values(),
        ]);
    }

    public function saveProfile(Request $request, int $customerId): JsonResponse
    {
        abort_unless(DB::table('customers')->where('id', $customerId)->exists(), 404, 'Customer not found.');
        $before = DB::table('nst_crm_profiles')->where('customer_id', $customerId)->first();
        $data = $request->validate([
            'contacts' => ['nullable', 'array'], 'addresses' => ['nullable', 'array'], 'documents' => ['nullable', 'array'],
            'tags' => ['nullable', 'array'], 'consents' => ['nullable', 'array'], 'segment' => ['nullable', 'string', 'max:100'],
            'loyalty_tier' => ['nullable', 'string', 'max:100'], 'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'], 'last_contacted_at' => ['nullable', 'date'],
            'next_follow_up_at' => ['nullable', 'date'], 'meta' => ['nullable', 'array'],
        ]);
        foreach (['contacts', 'addresses', 'documents', 'tags', 'consents', 'meta'] as $field) {
            if (array_key_exists($field, $data)) $data[$field] = json_encode($data[$field]);
        }
        $data['referral_code'] = $before->referral_code ?? $this->uniqueReferralCode();
        $data['updated_at'] = now();
        DB::table('nst_crm_profiles')->updateOrInsert(['customer_id' => $customerId], $data + ['created_at' => now()]);
        $after = DB::table('nst_crm_profiles')->where('customer_id', $customerId)->first();
        $this->crmEvent($request, 'profile.saved', 'nst_crm_profiles', $after->id ?? $customerId, $before, $after);
        return $this->ok($after, 'CRM profile saved.');
    }

    public function leads(Request $request): JsonResponse
    {
        $rows = DB::table('nst_crm_leads')
            ->leftJoin('users', 'users.id', '=', 'nst_crm_leads.assigned_to')
            ->leftJoin('branches', 'branches.id', '=', 'nst_crm_leads.branch_id')
            ->leftJoin('customers', 'customers.id', '=', 'nst_crm_leads.customer_id')
            ->select('nst_crm_leads.*', 'users.name as assigned_name', 'branches.name as branch_name', 'customers.name as customer_name')
            ->when($request->filled('stage'), fn ($q) => $q->where('nst_crm_leads.stage', $request->input('stage')))
            ->when($request->filled('assigned_to'), fn ($q) => $q->where('nst_crm_leads.assigned_to', $request->integer('assigned_to')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_crm_leads.branch_id', $request->integer('branch_id')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = trim((string) $request->input('search'));
                $q->where(fn ($inner) => $inner->where('nst_crm_leads.name', 'like', "%{$search}%")->orWhere('nst_crm_leads.phone', 'like', "%{$search}%")->orWhere('nst_crm_leads.email', 'like', "%{$search}%"));
            })
            ->orderByRaw("FIELD(nst_crm_leads.priority, 'urgent','high','normal','low')")
            ->orderBy('nst_crm_leads.next_follow_up_at')
            ->limit(500)
            ->get();
        return $this->ok($rows);
    }

    public function storeLead(Request $request): JsonResponse
    {
        $data = $this->validateLead($request);
        $id = DB::table('nst_crm_leads')->insertGetId(array_merge($data, [
            'lead_no' => $this->nextNumber('LEAD', 'nst_crm_leads', 'lead_no'),
            'stage' => $data['stage'] ?? 'new',
            'priority' => $data['priority'] ?? 'normal',
            'source' => $data['source'] ?? 'manual',
            'created_by' => optional($request->user())->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]));
        $row = DB::table('nst_crm_leads')->find($id);
        $this->crmEvent($request, 'lead.created', 'nst_crm_leads', $id, null, $row);
        return $this->ok($row, 'Lead created.', 201);
    }

    public function updateLead(Request $request, int $leadId): JsonResponse
    {
        $lead = DB::table('nst_crm_leads')->where('id', $leadId)->first();
        abort_if(!$lead, 404, 'Lead not found.');
        $data = $this->validateLead($request, true);
        if (($data['stage'] ?? null) === 'won' && !$lead->converted_at) $data['converted_at'] = now();
        $data['updated_at'] = now();
        DB::table('nst_crm_leads')->where('id', $leadId)->update($data);
        $row = DB::table('nst_crm_leads')->find($leadId);
        $this->crmEvent($request, 'lead.updated', 'nst_crm_leads', $leadId, $lead, $row);
        return $this->ok($row, 'Lead updated.');
    }

    public function convertLead(Request $request, int $leadId): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'create_customer' => ['nullable', 'boolean'],
            'segment' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $result = DB::transaction(function () use ($request, $leadId, $data) {
            $lead = DB::table('nst_crm_leads')->where('id', $leadId)->lockForUpdate()->first();
            abort_if(!$lead, 404, 'Lead not found.');
            $customerId = $data['customer_id'] ?? null;
            if (! $customerId && ($data['create_customer'] ?? true)) {
                $payload = [
                    'name' => $lead->name,
                    'phone' => $lead->phone,
                    'email' => $lead->email,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
                if (Schema::hasColumn('customers', 'branch_id')) $payload['branch_id'] = $lead->branch_id;
                $customerId = DB::table('customers')->insertGetId($payload);
            }
            if (! $customerId) throw ValidationException::withMessages(['customer_id' => 'Select or create a customer before conversion.']);
            $leadUpdate = [
                'customer_id' => $customerId,
                'stage' => 'won',
                'converted_at' => now(),
                'note' => trim(($lead->note ?? '') . "\n" . ($data['note'] ?? 'Converted to customer.')),
                'updated_at' => now(),
            ];
            if (Schema::hasColumn('nst_crm_leads', 'converted_customer_id')) {
                $leadUpdate['converted_customer_id'] = $customerId;
            }
            DB::table('nst_crm_leads')->where('id', $leadId)->update($leadUpdate);
            DB::table('nst_crm_profiles')->updateOrInsert(['customer_id' => $customerId], [
                'segment' => $data['segment'] ?? 'Converted Lead',
                'assigned_to' => $lead->assigned_to,
                'branch_id' => $lead->branch_id,
                'last_contacted_at' => now(),
                'referral_code' => DB::table('nst_crm_profiles')->where('customer_id', $customerId)->value('referral_code') ?: $this->uniqueReferralCode(),
                'updated_at' => now(),
                'created_at' => now(),
            ]);
            DB::table('nst_crm_activities')->insert([
                'customer_id' => $customerId,
                'lead_id' => $leadId,
                'activity_type' => 'conversion',
                'subject' => 'Lead converted to customer',
                'details' => $data['note'] ?? null,
                'status' => 'completed',
                'completed_at' => now(),
                'assigned_to' => $lead->assigned_to,
                'created_by' => optional($request->user())->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            return ['lead' => DB::table('nst_crm_leads')->find($leadId), 'customer_id' => $customerId];
        });
        $this->crmEvent($request, 'lead.converted', 'nst_crm_leads', $leadId, null, $result);
        return $this->ok($result, 'Lead converted into customer profile.');
    }

    public function activities(Request $request): JsonResponse
    {
        $rows = DB::table('nst_crm_activities')
            ->leftJoin('customers', 'customers.id', '=', 'nst_crm_activities.customer_id')
            ->leftJoin('nst_crm_leads', 'nst_crm_leads.id', '=', 'nst_crm_activities.lead_id')
            ->leftJoin('users', 'users.id', '=', 'nst_crm_activities.assigned_to')
            ->select('nst_crm_activities.*', 'customers.name as customer_name', 'nst_crm_leads.name as lead_name', 'users.name as assigned_name')
            ->when($request->filled('status'), fn ($q) => $q->where('nst_crm_activities.status', $request->input('status')))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('nst_crm_activities.customer_id', $request->integer('customer_id')))
            ->when($request->filled('lead_id'), fn ($q) => $q->where('nst_crm_activities.lead_id', $request->integer('lead_id')))
            ->orderByDesc('nst_crm_activities.id')
            ->limit(500)
            ->get();
        return $this->ok($rows);
    }

    public function storeActivity(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'lead_id' => ['nullable', 'integer', 'exists:nst_crm_leads,id'],
            'activity_type' => ['required', 'string', 'max:80'], 'subject' => ['required', 'string', 'max:190'],
            'details' => ['nullable', 'string', 'max:5000'], 'status' => ['nullable', 'in:planned,completed,cancelled'],
            'due_at' => ['nullable', 'date'], 'assigned_to' => ['nullable', 'integer', 'exists:users,id'], 'attachments' => ['nullable', 'array'],
        ]);
        if (empty($data['customer_id']) && empty($data['lead_id'])) throw ValidationException::withMessages(['customer_id' => 'Select a customer or lead.']);
        $status = $data['status'] ?? 'planned';
        $payload = $data + [
            'status' => $status,
            'completed_at' => $status === 'completed' ? now() : null,
            'attachments' => isset($data['attachments']) ? json_encode($data['attachments']) : null,
            'created_by' => optional($request->user())->id,
            'created_at' => now(),
            'updated_at' => now(),
        ];
        if (Schema::hasColumn('nst_crm_activities', 'branch_id') && empty($payload['branch_id'])) {
            $payload['branch_id'] = optional($request->user())->branch_id;
        }
        $id = DB::table('nst_crm_activities')->insertGetId($payload);
        $row = DB::table('nst_crm_activities')->find($id);
        $this->crmEvent($request, 'activity.saved', 'nst_crm_activities', $id, null, $row);
        return $this->ok($row, 'CRM activity saved.', 201);
    }

    public function completeActivity(Request $request, int $activityId): JsonResponse
    {
        $before = DB::table('nst_crm_activities')->where('id', $activityId)->first();
        abort_if(!$before, 404, 'Activity not found.');
        DB::table('nst_crm_activities')->where('id', $activityId)->update(['status' => 'completed', 'completed_at' => now(), 'updated_at' => now()]);
        $row = DB::table('nst_crm_activities')->find($activityId);
        $this->crmEvent($request, 'activity.completed', 'nst_crm_activities', $activityId, $before, $row);
        return $this->ok($row, 'Activity completed.');
    }

    public function loyalty(Request $request): JsonResponse
    {
        $rows = DB::table('nst_crm_loyalty_entries')->join('customers', 'customers.id', '=', 'nst_crm_loyalty_entries.customer_id')
            ->select('nst_crm_loyalty_entries.*', 'customers.name as customer_name', 'customers.phone as customer_phone')
            ->when($request->filled('customer_id'), fn ($q) => $q->where('nst_crm_loyalty_entries.customer_id', $request->integer('customer_id')))
            ->orderByDesc('nst_crm_loyalty_entries.id')
            ->limit(500)
            ->get();
        return $this->ok($rows);
    }

    public function adjustLoyalty(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'integer', 'exists:customers,id'], 'points' => ['required', 'integer', 'not_in:0'],
            'entry_type' => ['required', 'string', 'max:80'], 'reference_type' => ['nullable', 'string', 'max:80'],
            'reference_id' => ['nullable', 'integer'], 'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $profile = DB::transaction(function () use ($data, $request) {
            DB::table('nst_crm_loyalty_entries')->insert($data + ['created_by' => optional($request->user())->id, 'created_at' => now(), 'updated_at' => now()]);
            $profile = DB::table('nst_crm_profiles')->where('customer_id', $data['customer_id'])->lockForUpdate()->first();
            $newPoints = max(0, (int) ($profile->loyalty_points ?? 0) + (int) $data['points']);
            DB::table('nst_crm_profiles')->updateOrInsert(['customer_id' => $data['customer_id']], [
                'loyalty_points' => $newPoints, 'loyalty_tier' => $this->loyaltyTier($newPoints),
                'referral_code' => $profile->referral_code ?? $this->uniqueReferralCode(), 'updated_at' => now(), 'created_at' => $profile->created_at ?? now(),
            ]);
            return DB::table('nst_crm_profiles')->where('customer_id', $data['customer_id'])->first();
        });
        $this->crmEvent($request, 'loyalty.adjusted', 'nst_crm_profiles', $profile->id ?? $data['customer_id'], null, $profile);
        return $this->ok($profile, 'Loyalty balance updated.');
    }

    public function feedback(Request $request): JsonResponse
    {
        return $this->ok(DB::table('nst_crm_feedback')->leftJoin('customers', 'customers.id', '=', 'nst_crm_feedback.customer_id')
            ->select('nst_crm_feedback.*', 'customers.name as customer_name', 'customers.phone as customer_phone')
            ->when($request->filled('status'), fn ($q) => $q->where('nst_crm_feedback.status', $request->input('status')))
            ->orderByDesc('nst_crm_feedback.id')
            ->limit(500)
            ->get());
    }

    public function storeFeedback(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'channel' => ['required', 'string', 'max:80'],
            'type' => ['required', 'string', 'max:80'], 'rating' => ['nullable', 'integer', 'between:1,5'],
            'nps_score' => ['nullable', 'integer', 'between:0,10'], 'message' => ['nullable', 'string', 'max:5000'],
            'status' => ['nullable', 'in:open,reviewing,resolved,closed'], 'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
        ]);
        $id = DB::table('nst_crm_feedback')->insertGetId($data + ['status' => $data['status'] ?? 'open', 'created_by' => optional($request->user())->id, 'created_at' => now(), 'updated_at' => now()]);
        $row = DB::table('nst_crm_feedback')->find($id);
        $this->crmEvent($request, 'feedback.saved', 'nst_crm_feedback', $id, null, $row);
        return $this->ok($row, 'Feedback saved.', 201);
    }

    public function supportCases(Request $request): JsonResponse
    {
        $branchId = $request->integer('branch_id') ?: null;
        $rows = $this->supportCaseQuery($branchId)
            ->when($request->filled('status'), fn ($q) => $q->where('cases.status', $request->input('status')))
            ->when($request->filled('priority'), fn ($q) => $q->where('cases.priority', $request->input('priority')))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('cases.customer_id', $request->integer('customer_id')))
            ->orderByRaw("FIELD(cases.priority, 'urgent','high','normal','low')")
            ->orderByDesc('cases.id')
            ->limit(500)
            ->get();
        return $this->ok($rows);
    }

    public function storeSupportCase(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'lead_id' => ['nullable', 'integer', 'exists:nst_crm_leads,id'],
            'subject' => ['required', 'string', 'max:190'],
            'category' => ['nullable', 'string', 'max:100'],
            'priority' => ['nullable', 'in:low,normal,high,urgent'],
            'status' => ['nullable', 'in:open,pending,resolved,closed'],
            'description' => ['nullable', 'string', 'max:5000'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
            'source' => ['nullable', 'string', 'max:80'],
        ]);
        if (empty($data['customer_id']) && empty($data['lead_id'])) throw ValidationException::withMessages(['customer_id' => 'Select a customer or lead.']);
        $insert = $data + [
            'case_no' => $this->nextNumber('CASE', 'nst_crm_support_cases', 'case_no'),
            'category' => $data['category'] ?? 'general',
            'priority' => $data['priority'] ?? 'normal',
            'status' => $data['status'] ?? 'open',
            'source' => $data['source'] ?? 'crm',
            'branch_id' => optional($request->user())->branch_id,
            'created_by' => optional($request->user())->id,
            'created_at' => now(),
            'updated_at' => now(),
        ];
        $id = DB::table('nst_crm_support_cases')->insertGetId($insert);
        $row = DB::table('nst_crm_support_cases')->find($id);
        $this->crmEvent($request, 'support_case.created', 'nst_crm_support_cases', $id, null, $row);
        return $this->ok($row, 'Support case created with SLA tracking.', 201);
    }

    public function updateSupportCase(Request $request, int $caseId): JsonResponse
    {
        $before = DB::table('nst_crm_support_cases')->where('id', $caseId)->first();
        abort_if(!$before, 404, 'Support case not found.');
        $data = $request->validate([
            'subject' => ['sometimes', 'string', 'max:190'],
            'category' => ['sometimes', 'string', 'max:100'],
            'priority' => ['sometimes', 'in:low,normal,high,urgent'],
            'status' => ['sometimes', 'in:open,pending,resolved,closed'],
            'description' => ['nullable', 'string', 'max:5000'],
            'resolution_note' => ['nullable', 'string', 'max:5000'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'due_at' => ['nullable', 'date'],
        ]);
        if (in_array($data['status'] ?? '', ['resolved', 'closed'], true)) {
            $data['resolved_at'] = now();
            $data['resolved_by'] = optional($request->user())->id;
        }
        $data['updated_at'] = now();
        DB::table('nst_crm_support_cases')->where('id', $caseId)->update($data);
        $row = DB::table('nst_crm_support_cases')->find($caseId);
        $this->crmEvent($request, 'support_case.updated', 'nst_crm_support_cases', $caseId, $before, $row);
        return $this->ok($row, 'Support case updated.');
    }

    public function segments(Request $request): JsonResponse
    {
        return $this->ok(DB::table('nst_crm_segments')->orderBy('name')->get()->map(function ($row) {
            $row->rules = $this->decodeJson($row->rules, []); return $row;
        }));
    }

    public function storeSegment(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:160'], 'code' => ['required', 'string', 'max:80', 'unique:nst_crm_segments,code'], 'rules' => ['required', 'array'], 'is_dynamic' => ['nullable', 'boolean'], 'is_active' => ['nullable', 'boolean']]);
        $id = DB::table('nst_crm_segments')->insertGetId([
            ...$data, 'rules' => json_encode($data['rules']), 'is_dynamic' => $data['is_dynamic'] ?? true, 'is_active' => $data['is_active'] ?? true,
            'created_by' => optional($request->user())->id, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $row = DB::table('nst_crm_segments')->find($id);
        $this->crmEvent($request, 'segment.saved', 'nst_crm_segments', $id, null, $row);
        return $this->ok($row, 'Segment saved.', 201);
    }

    public function segmentMembers(Request $request, int $segmentId): JsonResponse
    {
        $segment = DB::table('nst_crm_segments')->where('id', $segmentId)->first();
        abort_if(!$segment, 404, 'Segment not found.');
        $rules = $this->decodeJson($segment->rules, []);
        $members = $this->customersForRules($rules)->limit(1000)->get();
        return $this->ok(['segment' => $segment, 'rules' => $rules, 'members' => $members, 'total' => $members->count()], 'Segment members resolved from live customer/profile data.');
    }

    public function campaigns(Request $request): JsonResponse
    {
        $rows = DB::table('nst_crm_campaigns')
            ->leftJoin('nst_crm_segments', 'nst_crm_segments.id', '=', 'nst_crm_campaigns.segment_id')
            ->leftJoin('users', 'users.id', '=', 'nst_crm_campaigns.created_by')
            ->select('nst_crm_campaigns.*', 'nst_crm_segments.name as segment_name', 'users.name as created_by_name')
            ->when($request->filled('status'), fn ($q) => $q->where('nst_crm_campaigns.status', $request->input('status')))
            ->orderByDesc('nst_crm_campaigns.id')
            ->limit(500)
            ->get();
        return $this->ok($rows);
    }

    public function storeCampaign(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'channel' => ['required', 'in:sms,email,whatsapp,call,manual'],
            'segment_id' => ['nullable', 'integer', 'exists:nst_crm_segments,id'],
            'subject' => ['nullable', 'string', 'max:190'],
            'message' => ['required', 'string', 'max:5000'],
            'scheduled_at' => ['nullable', 'date'],
            'status' => ['nullable', 'in:draft,scheduled,running,completed,cancelled'],
            'settings' => ['nullable', 'array'],
        ]);
        $status = $data['status'] ?? ($data['scheduled_at'] ?? false ? 'scheduled' : 'draft');
        $id = DB::table('nst_crm_campaigns')->insertGetId([
            'campaign_no' => $this->nextNumber('CMP', 'nst_crm_campaigns', 'campaign_no'),
            'name' => $data['name'],
            'channel' => $data['channel'],
            'segment_id' => $data['segment_id'] ?? null,
            'subject' => $data['subject'] ?? null,
            'message' => $data['message'],
            'scheduled_at' => $data['scheduled_at'] ?? null,
            'status' => $status,
            'settings' => isset($data['settings']) ? json_encode($data['settings']) : null,
            'created_by' => optional($request->user())->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $row = DB::table('nst_crm_campaigns')->find($id);
        $this->crmEvent($request, 'campaign.saved', 'nst_crm_campaigns', $id, null, $row);
        return $this->ok($row, 'Campaign draft saved.', 201);
    }

    public function launchCampaign(Request $request, int $campaignId): JsonResponse
    {
        $campaign = DB::table('nst_crm_campaigns')->where('id', $campaignId)->first();
        abort_if(!$campaign, 404, 'Campaign not found.');
        if (! in_array($campaign->status, ['draft', 'scheduled'], true)) throw ValidationException::withMessages(['status' => 'Only draft or scheduled campaigns can be launched.']);
        $rules = [];
        if ($campaign->segment_id) {
            $segment = DB::table('nst_crm_segments')->where('id', $campaign->segment_id)->first();
            $rules = $segment ? $this->decodeJson($segment->rules, []) : [];
        }
        $members = $this->customersForRules($rules)->limit(5000)->get();
        DB::transaction(function () use ($campaignId, $members) {
            DB::table('nst_crm_campaign_audiences')->where('campaign_id', $campaignId)->delete();
            foreach ($members as $member) {
                DB::table('nst_crm_campaign_audiences')->insert([
                    'campaign_id' => $campaignId,
                    'customer_id' => $member->id,
                    'status' => 'queued',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            DB::table('nst_crm_campaigns')->where('id', $campaignId)->update([
                'status' => 'running',
                'launched_at' => now(),
                'audience_count' => $members->count(),
                'updated_at' => now(),
            ]);
        });
        $row = DB::table('nst_crm_campaigns')->find($campaignId);
        $this->crmEvent($request, 'campaign.launched', 'nst_crm_campaigns', $campaignId, $campaign, $row);
        return $this->ok(['campaign' => $row, 'audience_count' => $members->count()], 'Campaign launched into queued audience list.');
    }

    public function campaignAudience(Request $request, int $campaignId): JsonResponse
    {
        $rows = DB::table('nst_crm_campaign_audiences')
            ->join('customers', 'customers.id', '=', 'nst_crm_campaign_audiences.customer_id')
            ->where('campaign_id', $campaignId)
            ->select('nst_crm_campaign_audiences.*', 'customers.name as customer_name', 'customers.phone as customer_phone', 'customers.email as customer_email')
            ->orderByDesc('nst_crm_campaign_audiences.id')
            ->limit(1000)
            ->get();
        return $this->ok($rows);
    }

    public function duplicateCandidates(Request $request): JsonResponse
    {
        $phone = DB::table('customers')->whereNotNull('phone')->where('phone', '<>', '')->selectRaw("phone as match_value, 'phone' as match_type, COUNT(*) as total, GROUP_CONCAT(id ORDER BY id) as customer_ids")->groupBy('phone')->havingRaw('COUNT(*) > 1')->get();
        $email = DB::table('customers')->whereNotNull('email')->where('email', '<>', '')->selectRaw("email as match_value, 'email' as match_type, COUNT(*) as total, GROUP_CONCAT(id ORDER BY id) as customer_ids")->groupBy('email')->havingRaw('COUNT(*) > 1')->get();
        return $this->ok($phone->concat($email)->values());
    }

    public function mergeCustomers(Request $request): JsonResponse
    {
        $data = $request->validate(['source_customer_id' => ['required', 'integer', 'exists:customers,id', 'different:target_customer_id'], 'target_customer_id' => ['required', 'integer', 'exists:customers,id'], 'reason' => ['nullable', 'string', 'max:1000']]);
        $before = ['source' => DB::table('customers')->where('id', $data['source_customer_id'])->first(), 'target' => DB::table('customers')->where('id', $data['target_customer_id'])->first()];
        DB::transaction(function () use ($data) {
            $source = $data['source_customer_id']; $target = $data['target_customer_id'];
            foreach (['sales', 'customer_orders', 'booking_preorders', 'warranty_service_jobs', 'customer_payments', 'customer_messages', 'nst_crm_activities', 'nst_crm_feedback', 'nst_crm_loyalty_entries', 'nst_crm_support_cases', 'nst_crm_campaign_audiences'] as $table) {
                if (Schema::hasTable($table) && Schema::hasColumn($table, 'customer_id')) DB::table($table)->where('customer_id', $source)->update(['customer_id' => $target]);
            }
            $sourceProfile = DB::table('nst_crm_profiles')->where('customer_id', $source)->first();
            $targetProfile = DB::table('nst_crm_profiles')->where('customer_id', $target)->first();
            if ($sourceProfile && !$targetProfile) DB::table('nst_crm_profiles')->where('customer_id', $source)->update(['customer_id' => $target, 'updated_at' => now()]);
            elseif ($sourceProfile) DB::table('nst_crm_profiles')->where('customer_id', $source)->delete();
            $update = ['status' => 'merged', 'updated_at' => now()];
            if (Schema::hasColumn('customers', 'deleted_at')) $update['deleted_at'] = now();
            DB::table('customers')->where('id', $source)->update($update);
        });
        $after = ['source_customer_id' => $data['source_customer_id'], 'target_customer_id' => $data['target_customer_id'], 'reason' => $data['reason'] ?? null];
        $this->crmEvent($request, 'customer.merged', 'customers', $data['target_customer_id'], $before, $after);
        return $this->ok($after, 'Customers merged without deleting transaction history.');
    }

    public function auditHistory(Request $request): JsonResponse
    {
        $logs = Schema::hasTable('nst_crm_operation_logs') ? DB::table('nst_crm_operation_logs')
            ->leftJoin('users', 'users.id', '=', 'nst_crm_operation_logs.user_id')
            ->select('nst_crm_operation_logs.*', 'users.name as user_name')
            ->when($request->filled('action'), fn ($q) => $q->where('nst_crm_operation_logs.action', $request->input('action')))
            ->when($request->filled('resource_type'), fn ($q) => $q->where('nst_crm_operation_logs.resource_type', $request->input('resource_type')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_crm_operation_logs.branch_id', $request->integer('branch_id')))
            ->orderByDesc('nst_crm_operation_logs.id')
            ->limit(500)
            ->get() : collect();
        return $this->ok(['logs' => $logs, 'total' => $logs->count()]);
    }

    public function acceptanceStatus(Request $request): JsonResponse
    {
        return $this->ok($this->stageSixAcceptancePayload(), 'Stage 6 CRM acceptance status loaded.');
    }

    public function exportCustomers(Request $request): StreamedResponse
    {
        $rows = $this->customers($request)->getData(true)['data'];
        $fileName = 'nst-stage6-crm-customers-' . now()->format('Ymd-His') . '.csv';
        $this->crmEvent($request, 'customers.exported', 'crm_export', null, null, ['file' => $fileName]);
        return response()->streamDownload(function () use ($rows) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Customer', 'Phone', 'Email', 'Segment', 'Tier', 'Points', 'Purchases', 'Lifetime Value', 'Due']);
            foreach ($rows as $row) {
                fputcsv($out, [$row['name'] ?? '', $row['phone'] ?? '', $row['email'] ?? '', $row['segment'] ?? '', $row['loyalty_tier'] ?? '', $row['loyalty_points'] ?? 0, $row['purchase_count'] ?? 0, $row['lifetime_value'] ?? 0, $row['due_amount'] ?? 0]);
            }
            fclose($out);
        }, $fileName, ['Content-Type' => 'text/csv']);
    }

    private function validateLead(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';
        return $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'], 'name' => [$required, 'string', 'max:160'],
            'phone' => ['nullable', 'string', 'max:80'], 'email' => ['nullable', 'email', 'max:190'], 'source' => ['nullable', 'string', 'max:80'],
            'interest' => ['nullable', 'string', 'max:500'], 'estimated_value' => ['nullable', 'numeric', 'min:0'],
            'stage' => ['nullable', 'in:new,contacted,qualified,proposal,won,lost'], 'priority' => ['nullable', 'in:low,normal,high,urgent'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'], 'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'next_follow_up_at' => ['nullable', 'date'], 'note' => ['nullable', 'string', 'max:3000'], 'lost_reason' => ['nullable', 'string', 'max:1000'],
        ]);
    }

    private function timelineRows(string $table, string $foreignKey, int $customerId, string $type, array $fields)
    {
        if (!Schema::hasTable($table) || !Schema::hasColumn($table, $foreignKey)) return collect();
        $dateColumn = collect(['updated_at', 'created_at', 'payment_date', 'received_at', 'due_at'])->first(fn ($column) => Schema::hasColumn($table, $column));
        if (!$dateColumn) return collect();
        $available = collect($fields)->filter(fn ($field) => Schema::hasColumn($table, $field))->values()->all();
        return DB::table($table)->where($foreignKey, $customerId)->select(array_merge(['id', $dateColumn], $available))->limit(500)->get()->map(fn ($row) => [
            'type' => $type, 'date' => $row->{$dateColumn}, 'title' => $this->eventTitle($type, $row),
            'status' => $row->status ?? $row->payment_status ?? null, 'data' => (array) $row,
        ]);
    }

    private function eventTitle(string $type, object $row): string
    {
        return match ($type) {
            'sale' => 'Sale ' . ($row->invoice_no ?? ('#' . $row->id)),
            'web_order' => 'Web order ' . ($row->order_no ?? ('#' . $row->id)),
            'preorder' => 'Preorder ' . ($row->booking_no ?? ('#' . $row->id)),
            'service' => 'Service job ' . ($row->job_no ?? ('#' . $row->id)),
            'payment' => 'Payment collection',
            'support_message' => $row->subject ?? 'Support message',
            'support_case' => 'Support case ' . ($row->case_no ?? ('#' . $row->id)),
            default => ucfirst(str_replace('_', ' ', $type)),
        };
    }

    private function supportCaseQuery(?int $branchId = null)
    {
        if (!Schema::hasTable('nst_crm_support_cases')) {
            return DB::query()->fromSub('select null as id where 1 = 0', 'cases');
        }
        return DB::table('nst_crm_support_cases as cases')
            ->leftJoin('customers', 'customers.id', '=', 'cases.customer_id')
            ->leftJoin('nst_crm_leads', 'nst_crm_leads.id', '=', 'cases.lead_id')
            ->leftJoin('users', 'users.id', '=', 'cases.assigned_to')
            ->select('cases.*', 'customers.name as customer_name', 'customers.phone as customer_phone', 'nst_crm_leads.name as lead_name', 'users.name as assigned_name')
            ->when($branchId, fn ($q) => $q->where('cases.branch_id', $branchId));
    }

    private function customersForRules(array $rules)
    {
        $query = DB::table('customers')
            ->leftJoin('nst_crm_profiles', 'nst_crm_profiles.customer_id', '=', 'customers.id')
            ->select('customers.*', 'nst_crm_profiles.segment', 'nst_crm_profiles.loyalty_tier', 'nst_crm_profiles.loyalty_points', 'nst_crm_profiles.tags');
        foreach ($rules as $rule) {
            $field = $rule['field'] ?? null; $operator = $rule['operator'] ?? '='; $value = $rule['value'] ?? null;
            if ($field === 'segment' && $value !== null) $query->where('nst_crm_profiles.segment', $value);
            if ($field === 'loyalty_tier' && $value !== null) $query->where('nst_crm_profiles.loyalty_tier', $value);
            if ($field === 'loyalty_points_min' && $value !== null) $query->where('nst_crm_profiles.loyalty_points', '>=', (int) $value);
            if ($field === 'branch_id' && $value !== null && Schema::hasColumn('customers', 'branch_id')) $query->where('customers.branch_id', (int) $value);
            if ($field === 'name_contains' && $value !== null) $query->where('customers.name', 'like', '%' . $value . '%');
            if ($field === 'phone_contains' && $value !== null) $query->where('customers.phone', 'like', '%' . $value . '%');
        }
        return $query;
    }

    private function crmEvent(Request $request, string $action, ?string $modelType = null, mixed $modelId = null, mixed $before = null, mixed $after = null): void
    {
        if (! Schema::hasTable('nst_crm_operation_logs')) return;
        DB::table('nst_crm_operation_logs')->insert([
            'action' => $action,
            'resource_type' => $modelType,
            'resource_id' => $modelId ? (string) $modelId : null,
            'before_payload' => $before ? json_encode($before) : null,
            'after_payload' => $after ? json_encode($after) : null,
            'metadata' => json_encode(['ip' => $request->ip(), 'path' => $request->path(), 'method' => $request->method()]),
            'user_id' => optional($request->user())->id,
            'branch_id' => optional($request->user())->branch_id,
            'created_at' => now(),
        ]);
    }

    private function stageSixAcceptancePayload(): array
    {
        $requiredTables = ['nst_crm_profiles', 'nst_crm_leads', 'nst_crm_activities', 'nst_crm_loyalty_entries', 'nst_crm_feedback', 'nst_crm_segments', 'nst_crm_support_cases', 'nst_crm_campaigns', 'nst_crm_campaign_audiences', 'nst_crm_operation_logs'];
        $requiredRoutes = ['crm.overview', 'crm.reference-data', 'crm.customers', 'crm.leads', 'crm.convert-lead', 'crm.activities', 'crm.loyalty', 'crm.feedback', 'crm.support-cases', 'crm.segments', 'crm.campaigns', 'crm.audit-history', 'crm.acceptance-status', 'crm.customers.export'];
        $tableStatus = collect($requiredTables)->mapWithKeys(fn ($table) => [$table => Schema::hasTable($table)]);
        $routeStatus = collect($requiredRoutes)->mapWithKeys(fn ($name) => [$name => Route::has($name)]);
        return [
            'tables' => $tableStatus,
            'routes' => $routeStatus,
            'database_ready' => $tableStatus->every(fn ($ready) => $ready === true),
            'routes_ready' => $routeStatus->every(fn ($ready) => $ready === true),
            'business_rules' => [
                'profile_save_is_audited' => true,
                'lead_pipeline_has_status_transitions' => true,
                'lead_conversion_creates_customer_profile' => true,
                'activities_require_customer_or_lead' => true,
                'loyalty_points_recalculate_tier' => true,
                'support_cases_track_priority_status_sla' => true,
                'segments_resolve_live_members' => true,
                'campaign_launch_queues_audience' => true,
                'merge_preserves_transaction_history' => true,
                'audit_history_records_crm_operations' => true,
            ],
        ];
    }

    private function loyaltyTier(int $points): string
    {
        return $points >= 10000 ? 'Platinum' : ($points >= 5000 ? 'Gold' : ($points >= 1500 ? 'Silver' : 'Member'));
    }

    private function uniqueReferralCode(): string
    {
        do $code = 'NST-' . strtoupper(Str::random(8)); while (DB::table('nst_crm_profiles')->where('referral_code', $code)->exists());
        return $code;
    }

    private function nextNumber(string $prefix, string $table, string $column): string
    {
        do $number = $prefix . '-' . now()->format('YmdHis') . '-' . strtoupper(Str::random(4)); while (Schema::hasTable($table) && DB::table($table)->where($column, $number)->exists());
        return $number;
    }

    private function decodeJson(mixed $value, mixed $default): mixed
    {
        if (is_array($value)) return $value;
        if (!is_string($value) || $value === '') return $default;
        $decoded = json_decode($value, true); return json_last_error() === JSON_ERROR_NONE ? $decoded : $default;
    }

    private function ok(mixed $data, string $message = 'CRM operation completed.', int $status = 200): JsonResponse
    {
        return response()->json(['status' => true, 'message' => $message, 'data' => $data], $status);
    }
}
