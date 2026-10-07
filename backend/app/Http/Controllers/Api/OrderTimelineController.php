<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerOrder;
use App\Models\CustomerOrderTimelineEvent;
use App\Models\PaymentTransaction;
use App\Services\AccessControlService;
use App\Services\ReleaseScopeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class OrderTimelineController extends Controller
{
    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly ReleaseScopeService $releaseScope,
    ) {
    }

    public function staff(Request $request, CustomerOrder $order): JsonResponse
    {
        abort_unless($this->accessControl->hasAnyRole($request->user(), ['super_admin', 'admin', 'accountant', 'branch_manager', 'salesman', 'staff']), 403);
        $this->ensureStaffCanView($request, $order);
        return response()->json(['status' => true, 'data' => $this->timeline($order, false)]);
    }

    public function portal(Request $request, CustomerOrder $order): JsonResponse
    {
        $customerId = (int) ($request->user()?->customer_id ?: Customer::where('user_id', $request->user()?->id)->value('id'));
        abort_unless($customerId > 0 && (int) $order->customer_id === $customerId, 404, 'Order not found.');
        return response()->json(['status' => true, 'data' => $this->timeline($order, true)]);
    }

    private function ensureStaffCanView(Request $request, CustomerOrder $order): void
    {
        if ($this->accessControl->isSuperAdmin($request->user())) {
            return;
        }

        $this->releaseScope->assertBranch($request, $order->branch_id ? (int) $order->branch_id : null, 'You cannot view orders outside your assigned branch.');
    }

    private function timeline(CustomerOrder $order, bool $customerOnly): array
    {
        $order->load(['items', 'branch:id,name,code', 'sale:id,invoice_no,status,delivery_status,created_at', 'delivery:id,customer_order_id,status,courier_name,tracking_number,driver_name,driver_phone,scheduled_at,dispatched_at,delivered_at,received_by,proof_path,note']);
        $events = collect();

        $events->push([
            'event_type' => 'order', 'status' => 'placed', 'title' => 'Order Placed',
            'description' => 'Order ' . $order->order_no . ' was recorded.',
            'metadata' => ['order_no' => $order->order_no, 'total_amount' => $order->total_amount],
            'customer_visible' => true, 'event_at' => optional($order->placed_at ?: $order->created_at)->toIso8601String(),
        ]);

        foreach ((array) $order->status_history as $history) {
            $status = data_get($history, 'status');
            $events->push([
                'event_type' => data_get($history, 'source', 'status'),
                'status' => $status,
                'title' => data_get($history, 'custom_status') ?: ucwords(str_replace('_', ' ', (string) $status)),
                'description' => data_get($history, 'reason'),
                'metadata' => collect($history)->except(['status', 'custom_status', 'changed_at', 'reason'])->all(),
                'customer_visible' => true,
                'event_at' => data_get($history, 'changed_at') ?: optional($order->updated_at)->toIso8601String(),
            ]);
        }

        if (Schema::hasTable('customer_order_timeline_events')) {
        CustomerOrderTimelineEvent::where('customer_order_id', $order->id)
            ->when($customerOnly, fn ($q) => $q->where('customer_visible', true))
            ->orderBy('event_at')->get()
            ->each(fn ($event) => $events->push([
                'id' => $event->id, 'event_type' => $event->event_type, 'status' => $event->status,
                'title' => $event->title, 'description' => $event->description, 'metadata' => $event->metadata,
                'customer_visible' => $event->customer_visible, 'event_at' => optional($event->event_at)->toIso8601String(),
            ]));
        }

        if (Schema::hasTable('payment_transactions')) {
        PaymentTransaction::where('customer_order_id', $order->id)->orderBy('created_at')->get()
            ->each(fn ($payment) => $events->push([
                'event_type' => 'payment', 'status' => $payment->status,
                'title' => 'Payment ' . ucwords(str_replace('_', ' ', $payment->status)),
                'description' => $payment->provider . ' transaction ' . $payment->transaction_no,
                'metadata' => ['amount' => $payment->amount, 'currency' => $payment->currency, 'provider' => $payment->provider],
                'customer_visible' => true, 'event_at' => optional($payment->paid_at ?: $payment->failed_at ?: $payment->created_at)->toIso8601String(),
            ]));
        }

        if ($order->sale) {
            $events->push([
                'event_type' => 'invoice', 'status' => $order->sale->status, 'title' => 'POS Invoice Created',
                'description' => $order->sale->invoice_no, 'metadata' => ['invoice_no' => $order->sale->invoice_no],
                'customer_visible' => true, 'event_at' => optional($order->sale->created_at)->toIso8601String(),
            ]);
        }

        $sorted = $events->filter(fn ($event) => ! empty($event['event_at']))
            ->sortBy('event_at')->values();

        return [
            'order' => $order,
            'events' => $sorted,
            'summary' => [
                'current_status' => $order->status,
                'custom_status' => $order->custom_status,
                'payment_status' => $order->payment_status,
                'delivery_status' => $order->delivery_status,
                'invoice_no' => $order->invoice_no,
            ],
        ];
    }
}
