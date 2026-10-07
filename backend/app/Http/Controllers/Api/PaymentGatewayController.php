<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerOrder;
use App\Models\CustomerOrderTimelineEvent;
use App\Models\PaymentTransaction;
use App\Models\PaymentWebhookLog;
use App\Services\PaymentGatewayManagerService;
use App\Services\PipraPayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Throwable;

class PaymentGatewayController extends Controller
{
    public function index(PaymentGatewayManagerService $gateways): JsonResponse
    {
        return response()->json(['status' => true, 'data' => $gateways->adminRows()]);
    }

    public function update(Request $request, string $provider, PaymentGatewayManagerService $gateways): JsonResponse
    {
        abort_unless(in_array($provider, PaymentGatewayManagerService::PROVIDERS, true), 404, 'Unknown payment gateway.');

        $validated = $request->validate([
            'display_name' => ['nullable', 'string', 'max:120'],
            'enabled' => ['nullable', 'boolean'],
            'mode' => ['nullable', Rule::in(['sandbox', 'live'])],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:9999'],
            'refunds_enabled' => ['nullable', 'boolean'],
            'currency' => ['nullable', 'string', 'max:10'],
            'timeout_seconds' => ['nullable', 'integer', 'min:10', 'max:120'],
            'frontend_url' => ['nullable', 'url', 'max:2000'],
            'base_url' => ['nullable', 'url', 'max:2000'],
            'api_key' => ['nullable', 'string', 'max:2000'],
            'store_id' => ['nullable', 'string', 'max:500'],
            'store_password' => ['nullable', 'string', 'max:2000'],
            'allow_risk_level_one' => ['nullable', 'boolean'],
        ]);

        $row = $gateways->save($provider, $validated, $request->user()?->id);

        if (($row['enabled'] ?? false) && ! ($row['configured'] ?? false)) {
            return response()->json([
                'status' => false,
                'message' => 'Gateway settings were saved, but it cannot be enabled until required credentials are configured.',
                'data' => $row,
            ], 422);
        }

        return response()->json(['status' => true, 'message' => 'Payment gateway settings saved.', 'data' => $row]);
    }

    public function transactions(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['nullable', Rule::in(PaymentGatewayManagerService::PROVIDERS)],
            'status' => ['nullable', 'string', 'max:60'],
            'q' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $query = PaymentTransaction::query()
            ->with(['order:id,order_no,payment_status,status'])
            ->when($validated['provider'] ?? null, fn ($q, $value) => $q->where('provider', $value))
            ->when($validated['status'] ?? null, fn ($q, $value) => $q->where('status', $value))
            ->when($validated['q'] ?? null, function ($q, $value) {
                $q->where(function ($inner) use ($value) {
                    $inner->where('transaction_no', 'like', "%{$value}%")
                        ->orWhere('provider_transaction_id', 'like', "%{$value}%")
                        ->orWhereHas('order', fn ($order) => $order->where('order_no', 'like', "%{$value}%"));
                });
            })
            ->latest('id');

        return response()->json(['status' => true, 'data' => $query->paginate((int) ($validated['per_page'] ?? 30))]);
    }

    public function webhookLogs(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'provider' => ['nullable', Rule::in(PaymentGatewayManagerService::PROVIDERS)],
            'status' => ['nullable', 'string', 'max:60'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
        ]);

        $query = PaymentWebhookLog::query()
            ->when($validated['provider'] ?? null, fn ($q, $value) => $q->where('provider', $value))
            ->when($validated['status'] ?? null, fn ($q, $value) => $q->where('status', $value))
            ->latest('id');

        return response()->json(['status' => true, 'data' => $query->paginate((int) ($validated['per_page'] ?? 30))]);
    }

    public function refund(
        Request $request,
        PaymentTransaction $paymentTransaction,
        PaymentGatewayManagerService $gateways,
        PipraPayService $piprapay
    ): JsonResponse {
        abort_unless($paymentTransaction->provider === 'piprapay', 422, 'Automated gateway refund is currently supported for PipraPay only.');
        abort_unless($paymentTransaction->status === 'paid', 422, 'Only a paid transaction can be refunded.');

        $config = $gateways->effective('piprapay');
        abort_unless(($config['enabled'] ?? false) && ($config['refunds_enabled'] ?? false), 422, 'PipraPay refunds are disabled.');
        abort_if(blank($paymentTransaction->provider_transaction_id), 422, 'PipraPay transaction reference is missing.');

        try {
            $body = $piprapay->refund((string) $paymentTransaction->provider_transaction_id);
        } catch (Throwable $exception) {
            report($exception);
            return response()->json(['status' => false, 'message' => 'PipraPay refund service is temporarily unavailable.'], 503);
        }

        abort_unless(strtolower((string) ($body['status'] ?? '')) === 'refunded', 422, 'PipraPay did not confirm the refund.');

        DB::transaction(function () use ($request, $paymentTransaction, $body) {
            $locked = PaymentTransaction::query()->whereKey($paymentTransaction->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === 'refunded') return;
            abort_unless($locked->status === 'paid', 409, 'Payment state changed before the refund could be recorded.');

            $locked->update([
                'status' => 'refunded',
                'refund_amount' => $locked->amount,
                'refund_payload' => $body,
                'refunded_at' => now(),
                'last_verified_at' => now(),
            ]);

            $order = CustomerOrder::query()->whereKey($locked->customer_order_id)->lockForUpdate()->first();
            if (! $order) return;

            $history = is_array($order->status_history) ? $order->status_history : [];
            $history[] = [
                'status' => $order->status,
                'custom_status' => 'PipraPay Payment Refunded',
                'payment_status' => 'refunded',
                'changed_at' => now()->toIso8601String(),
                'changed_by' => $request->user()?->id,
                'source' => 'payment_gateway_refund',
                'transaction_no' => $locked->transaction_no,
            ];

            $order->forceFill([
                'payment_status' => 'refunded',
                'refund_amount' => (float) $order->refund_amount + (float) $locked->amount,
                'status_history' => $history,
            ])->save();

            CustomerOrderTimelineEvent::create([
                'customer_order_id' => $order->id,
                'event_type' => 'refund',
                'status' => 'refunded',
                'title' => 'PipraPay Payment Refunded',
                'description' => 'Full gateway refund was confirmed. Stock and sale state were not changed automatically.',
                'metadata' => [
                    'provider' => 'piprapay',
                    'transaction_no' => $locked->transaction_no,
                    'pp_id' => $locked->provider_transaction_id,
                    'amount' => (float) $locked->amount,
                ],
                'customer_visible' => true,
                'created_by' => $request->user()?->id,
                'event_at' => now(),
            ]);
        });

        return response()->json([
            'status' => true,
            'message' => 'PipraPay refund confirmed. No stock state was changed automatically.',
            'data' => $paymentTransaction->fresh('order'),
        ]);
    }
}
