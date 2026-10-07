<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CommunicationLog;
use App\Models\Customer;
use App\Models\Sale;
use App\Services\CommunicationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class MarketingCommunicationController extends Controller
{
    public function __construct(private CommunicationService $communication)
    {
    }

    public function logs(Request $request)
    {
        $logs = CommunicationLog::query()
            ->when($request->filled('channel'), fn ($q) => $q->where('channel', $request->channel))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('search'), function ($q) use ($request) {
                $s = $request->search;
                $q->where(function ($qq) use ($s) {
                    $qq->where('recipient_phone', 'like', "%{$s}%")
                        ->orWhere('recipient_email', 'like', "%{$s}%")
                        ->orWhere('invoice_no', 'like', "%{$s}%")
                        ->orWhere('subject', 'like', "%{$s}%");
                });
            })
            ->latest('id')
            ->paginate((int) $request->get('per_page', 30));
        return response()->json(['success' => true, 'data' => $logs]);
    }

    public function sendManual(Request $request)
    {
        $validated = $request->validate([
            'channel' => ['required', 'in:sms,email,both'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:150'],
            'subject' => ['nullable', 'string', 'max:200'],
            'message' => ['required', 'string'],
        ]);

        $results = [];
        if (in_array($validated['channel'], ['sms', 'both'], true) && ! empty($validated['phone'])) {
            $results['sms'] = $this->communication->sendSms($validated['phone'], $validated['message'], 'manual', null, $request->user()?->id);
        }
        if (in_array($validated['channel'], ['email', 'both'], true) && ! empty($validated['email'])) {
            $results['email'] = $this->communication->sendEmail($validated['email'], $validated['subject'] ?? 'New Singapur Telecom', $validated['message'], 'manual', null, $request->user()?->id);
        }
        return response()->json(['success' => true, 'message' => 'Message queued/sent according to settings.', 'data' => $results]);
    }

    public function sendBulk(Request $request)
    {
        $validated = $request->validate([
            'channel' => ['required', 'in:sms,email,both'],
            'audience' => ['required', 'in:all,opted_in,due_customers,recent_buyers'],
            'subject' => ['nullable', 'string', 'max:200'],
            'message' => ['required', 'string'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
        ]);

        $customers = Customer::query();
        if ($validated['audience'] === 'opted_in' && Schema::hasColumn('customers', 'marketing_consent')) {
            $customers->where('marketing_consent', true);
        }
        if ($validated['audience'] === 'due_customers') {
            $customers->where(function ($q) {
                foreach (['current_balance', 'due_amount', 'balance'] as $column) {
                    if (Schema::hasColumn('customers', $column)) {
                        $q->orWhere($column, '>', 0);
                    }
                }
            });
        }
        if ($validated['audience'] === 'recent_buyers') {
            $ids = Sale::where('created_at', '>=', now()->subDays(90))->whereNotNull('customer_id')->pluck('customer_id')->unique()->values();
            $customers->whereIn('id', $ids);
        }
        $customers = $customers->limit($validated['limit'] ?? 500)->get();

        $count = 0;
        foreach ($customers as $customer) {
            if (in_array($validated['channel'], ['sms', 'both'], true) && ! empty($customer->phone)) {
                $this->communication->sendSms($customer->phone, $validated['message'], 'marketing', $customer, $request->user()?->id);
                $count++;
            }
            if (in_array($validated['channel'], ['email', 'both'], true) && ! empty($customer->email)) {
                $this->communication->sendEmail($customer->email, $validated['subject'] ?? 'New Singapur Telecom Offer', $validated['message'], 'marketing', $customer, $request->user()?->id);
                $count++;
            }
        }
        return response()->json(['success' => true, 'message' => "Bulk message processed: {$count} log entries created."]);
    }

    public function sendInvoice(Request $request, Sale $sale)
    {
        $validated = $request->validate([
            'send_sms' => ['nullable', 'boolean'],
            'send_email' => ['nullable', 'boolean'],
            'attach_pdf' => ['nullable', 'boolean'],
        ]);
        $result = $this->communication->sendInvoice($sale, $validated, $request->user()?->id);
        return response()->json(['success' => true, 'message' => 'Invoice communication processed.', 'data' => $result]);
    }
}
