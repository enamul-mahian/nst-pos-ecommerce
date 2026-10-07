<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerOrder;
use App\Models\CustomerOrderTimelineEvent;
use App\Models\PaymentTransaction;
use App\Services\AccessControlService;
use App\Services\PaymentGatewayManagerService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

class SslCommerzController extends Controller
{
    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly PaymentGatewayManagerService $gateways,
    ) {
    }

    public function init(Request $request): JsonResponse
    {
        $validated = $request->validate(['order_id' => ['required', 'exists:customer_orders,id']]);
        $config = $this->gateways->effective('sslcommerz');
        abort_unless((bool) ($config['enabled'] ?? false) && (bool) ($config['configured'] ?? false), 422, 'SSLCOMMERZ is currently disabled or not configured.');

        $order = CustomerOrder::with('customer')->findOrFail($validated['order_id']);
        $this->authorizeOrder($request, $order);
        abort_if(in_array($order->status, ['cancelled', 'rejected', 'completed'], true), 422, 'This order cannot start a new payment.');
        abort_if((float) $order->total_amount <= 0, 422, 'Order total is invalid.');
        abort_if(blank($order->customer_name) || blank($order->customer_phone) || blank($order->customer_email) || blank($order->delivery_address) || blank($order->delivery_city) || blank($order->delivery_district) || blank($order->delivery_postal_code), 422, 'Name, phone, email and complete delivery address are required for online payment.');

        $existing = PaymentTransaction::where('customer_order_id', $order->id)
            ->where('provider', 'sslcommerz')
            ->where('status', 'initiated')
            ->where('created_at', '>=', now()->subMinutes(15))
            ->latest('id')->first();
        $existingUrl = data_get($existing?->response_payload, 'GatewayPageURL');
        if ($existing && $existingUrl) {
            return response()->json([
                'status' => true,
                'message' => 'Existing secure payment session reused.',
                'GatewayPageURL' => $existingUrl,
                'transaction_no' => $existing->transaction_no,
            ]);
        }

        $transactionNo = $this->transactionNo();
        $payload = [
            'store_id' => $config['store_id'],
            'store_passwd' => $config['store_password'],
            'total_amount' => number_format((float) $order->total_amount, 2, '.', ''),
            'currency' => $config['currency'] ?? 'BDT',
            'tran_id' => $transactionNo,
            'success_url' => url('/api/payment/sslcommerz/success'),
            'fail_url' => url('/api/payment/sslcommerz/fail'),
            'cancel_url' => url('/api/payment/sslcommerz/cancel'),
            'ipn_url' => url('/api/payment/sslcommerz/ipn'),
            'cus_name' => $order->customer_name,
            'cus_email' => $order->customer_email,
            'cus_add1' => Str::limit($order->delivery_address, 250, ''),
            'cus_city' => $order->delivery_city,
            'cus_state' => $order->delivery_district,
            'cus_postcode' => $order->delivery_postal_code,
            'cus_country' => 'Bangladesh',
            'cus_phone' => $order->customer_phone,
            'shipping_method' => 'YES',
            'ship_name' => $order->customer_name,
            'ship_add1' => Str::limit($order->delivery_address, 250, ''),
            'ship_city' => $order->delivery_city,
            'ship_state' => $order->delivery_district,
            'ship_postcode' => $order->delivery_postal_code,
            'ship_country' => 'Bangladesh',
            'product_name' => 'NST Order ' . $order->order_no,
            'product_category' => 'Telecom Devices',
            'product_profile' => 'general',
            'value_a' => (string) $order->id,
            'value_b' => (string) $request->user()?->id,
            'value_c' => $order->order_no,
        ];

        $transaction = PaymentTransaction::create([
            'transaction_no' => $transactionNo,
            'provider' => 'sslcommerz',
            'customer_order_id' => $order->id,
            'sale_id' => $order->sale_id,
            'user_id' => $request->user()?->id,
            'amount' => $order->total_amount,
            'currency' => $config['currency'] ?? 'BDT',
            'status' => 'initiated',
            'request_payload' => $this->maskedPayload($payload),
        ]);

        try {
            $response = Http::asForm()
                ->acceptJson()
                ->timeout(max(10, (int) ($config['timeout_seconds'] ?? 30)))
                ->post($this->sessionUrl((bool) ($config['sandbox'] ?? true)), $payload);

            $body = $response->json();
            if (! $response->successful() || ! is_array($body) || empty($body['GatewayPageURL'])) {
                $transaction->update(['status' => 'init_failed', 'response_payload' => is_array($body) ? $body : ['body' => Str::limit($response->body(), 2000)], 'failed_at' => now()]);
                return response()->json(['status' => false, 'message' => 'Payment gateway session could not be created.'], 502);
            }

            $transaction->update([
                'session_key' => $body['sessionkey'] ?? null,
                'response_payload' => $body,
            ]);

            CustomerOrderTimelineEvent::create([
                'customer_order_id' => $order->id,
                'event_type' => 'payment', 'status' => 'initiated', 'title' => 'Online Payment Started',
                'description' => 'Secure payment session created.',
                'metadata' => ['provider' => 'sslcommerz', 'transaction_no' => $transactionNo, 'amount' => (float) $order->total_amount],
                'customer_visible' => true, 'created_by' => $request->user()?->id, 'event_at' => now(),
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Secure payment session created.',
                'GatewayPageURL' => $body['GatewayPageURL'],
                'transaction_no' => $transactionNo,
            ]);
        } catch (ConnectionException $exception) {
            $transaction->update(['status' => 'init_failed', 'response_payload' => ['error' => $exception->getMessage()], 'failed_at' => now()]);
            return response()->json(['status' => false, 'message' => 'Payment gateway is temporarily unreachable.'], 503);
        } catch (Throwable $exception) {
            report($exception);
            $transaction->update(['status' => 'init_failed', 'response_payload' => ['error' => $exception->getMessage()], 'failed_at' => now()]);
            return response()->json(['status' => false, 'message' => 'Payment session initialization failed.'], 500);
        }
    }

    public function success(Request $request): RedirectResponse|JsonResponse
    {
        return $this->handleCallback($request);
    }

    public function ipn(Request $request): JsonResponse
    {
        $result = $this->processValidation($request);
        return response()->json($result, $result['status'] ? 200 : 422);
    }

    public function fail(Request $request): RedirectResponse|JsonResponse
    {
        return $this->markFailed($request, 'failed');
    }

    public function cancel(Request $request): RedirectResponse|JsonResponse
    {
        return $this->markFailed($request, 'cancelled');
    }

    private function handleCallback(Request $request): RedirectResponse|JsonResponse
    {
        $result = $this->processValidation($request);
        if ($request->expectsJson()) {
            return response()->json($result, $result['status'] ? 200 : 422);
        }

        $transaction = $result['transaction'] ?? null;
        $order = $transaction?->order;
        $config = $this->gateways->effective('sslcommerz');
        $base = $config['frontend_url'] ?? config('app.url');
        $path = $result['status'] ? '/order-success' : '/checkout';
        $query = http_build_query([
            'order_id' => $order?->order_no ?: $order?->id,
            'total' => $transaction?->amount,
            'method' => 'sslcommerz',
            'payment' => $result['status'] ? 'success' : 'failed',
            'message' => $result['message'],
        ]);

        return redirect()->away(rtrim($base, '/') . $path . '?' . $query);
    }

    private function processValidation(Request $request): array
    {
        $validated = $request->validate([
            'tran_id' => ['required', 'string', 'max:80'],
            'val_id' => ['required', 'string', 'max:255'],
            'amount' => ['nullable', 'numeric'],
            'currency' => ['nullable', 'string', 'max:10'],
        ]);

        $transaction = PaymentTransaction::with('order')->where('transaction_no', $validated['tran_id'])->first();
        if (! $transaction) {
            return ['status' => false, 'message' => 'Unknown payment transaction.'];
        }
        if ($transaction->status === 'paid') {
            return ['status' => true, 'message' => 'Payment already verified.', 'transaction' => $transaction];
        }

        $config = $this->gateways->effective('sslcommerz');
        try {
            $response = Http::acceptJson()->timeout(max(10, (int) ($config['timeout_seconds'] ?? 30)))
                ->get($this->validationUrl((bool) ($config['sandbox'] ?? true)), [
                    'val_id' => $validated['val_id'],
                    'store_id' => $config['store_id'],
                    'store_passwd' => $config['store_password'],
                    'format' => 'json',
                ]);
            $body = $response->json();
        } catch (Throwable $exception) {
            report($exception);
            return ['status' => false, 'message' => 'Payment validation service is unavailable.', 'transaction' => $transaction];
        }

        if (! $response->successful() || ! is_array($body)) {
            return ['status' => false, 'message' => 'Payment validation failed.', 'transaction' => $transaction];
        }

        $status = strtoupper((string) ($body['status'] ?? ''));
        $amountMatches = abs((float) ($body['amount'] ?? -1) - (float) $transaction->amount) < 0.01;
        $currencyMatches = strtoupper((string) ($body['currency'] ?? '')) === strtoupper((string) $transaction->currency);
        $transactionMatches = (string) ($body['tran_id'] ?? '') === $transaction->transaction_no;
        $riskLevel = (int) ($body['risk_level'] ?? 0);
        $riskAllowed = $riskLevel === 0 || (bool) ($config['allow_risk_level_one'] ?? false);
        $valid = in_array($status, ['VALID', 'VALIDATED'], true) && $amountMatches && $currencyMatches && $transactionMatches && $riskAllowed;

        DB::transaction(function () use ($transaction, $body, $valid, $riskLevel) {
            $locked = PaymentTransaction::whereKey($transaction->id)->lockForUpdate()->firstOrFail();
            if ($locked->status === 'paid') return;

            $locked->update([
                'provider_transaction_id' => $body['val_id'] ?? $locked->provider_transaction_id,
                'bank_transaction_id' => $body['bank_tran_id'] ?? null,
                'card_type' => $body['card_type'] ?? null,
                'risk_level' => $riskLevel,
                'validation_payload' => $body,
                'status' => $valid ? 'paid' : 'validation_failed',
                'paid_at' => $valid ? now() : null,
                'failed_at' => $valid ? null : now(),
                'last_verified_at' => now(),
            ]);

            $order = CustomerOrder::whereKey($locked->customer_order_id)->lockForUpdate()->first();
            if (! $order) return;
            if ($valid) {
                $alreadyApprovedForThisTransaction = $order->payment_status === 'approved'
                    && $order->transaction_id === $locked->transaction_no;

                if (! $alreadyApprovedForThisTransaction) {
                    $history = is_array($order->status_history) ? $order->status_history : [];
                    $history[] = [
                        'status' => 'payment_approved', 'custom_status' => 'Online Payment Verified',
                        'payment_status' => 'approved', 'changed_at' => now()->toIso8601String(),
                        'changed_by' => null, 'source' => 'payment_gateway', 'transaction_no' => $locked->transaction_no,
                    ];
                    $order->forceFill([
                        'payment_method' => 'sslcommerz', 'payment_status' => 'approved',
                        'transaction_id' => $locked->transaction_no, 'paid_amount' => $locked->amount,
                        'status' => 'payment_approved', 'custom_status' => 'Online Payment Verified', 'status_history' => $history,
                    ])->save();

                    CustomerOrderTimelineEvent::create([
                        'customer_order_id' => $order->id, 'event_type' => 'payment',
                        'status' => 'paid',
                        'title' => 'Online Payment Verified',
                        'description' => 'Payment was validated by the gateway.',
                        'metadata' => ['provider' => 'sslcommerz', 'transaction_no' => $locked->transaction_no, 'amount' => (float) $locked->amount, 'risk_level' => $riskLevel],
                        'customer_visible' => true, 'created_by' => null, 'event_at' => now(),
                    ]);
                }
            } else {
                CustomerOrderTimelineEvent::create([
                    'customer_order_id' => $order->id, 'event_type' => 'payment',
                    'status' => 'validation_failed',
                    'title' => 'Online Payment Validation Failed',
                    'description' => 'Gateway validation did not pass all security checks.',
                    'metadata' => ['provider' => 'sslcommerz', 'transaction_no' => $locked->transaction_no, 'amount' => (float) $locked->amount, 'risk_level' => $riskLevel],
                    'customer_visible' => true, 'created_by' => null, 'event_at' => now(),
                ]);
            }
        });

        $transaction = $transaction->fresh('order');
        return [
            'status' => $valid,
            'message' => $valid ? 'Payment verified successfully.' : 'Payment could not be verified.',
            'transaction' => $transaction,
        ];
    }

    private function markFailed(Request $request, string $status): RedirectResponse|JsonResponse
    {
        $transactionNo = (string) $request->input('tran_id');
        $transaction = PaymentTransaction::with('order')->where('transaction_no', $transactionNo)->first();
        if ($transaction && $transaction->status !== 'paid') {
            $transaction->update(['status' => $status, 'response_payload' => array_merge($transaction->response_payload ?? [], ['callback' => $request->except(['store_passwd'])]), 'failed_at' => now()]);
            if ($transaction->customer_order_id) {
                CustomerOrderTimelineEvent::create([
                    'customer_order_id' => $transaction->customer_order_id, 'event_type' => 'payment', 'status' => $status,
                    'title' => $status === 'cancelled' ? 'Online Payment Cancelled' : 'Online Payment Failed',
                    'description' => null, 'metadata' => ['provider' => 'sslcommerz', 'transaction_no' => $transactionNo],
                    'customer_visible' => true, 'created_by' => null, 'event_at' => now(),
                ]);
            }
        }

        $result = ['status' => false, 'message' => $status === 'cancelled' ? 'Payment was cancelled.' : 'Payment failed.', 'transaction' => $transaction];
        if ($request->expectsJson()) return response()->json($result, 422);

        $config = $this->gateways->effective('sslcommerz');
        $base = $config['frontend_url'] ?? config('app.url');
        return redirect()->away(rtrim($base, '/') . '/checkout?' . http_build_query(['payment' => $status, 'message' => $result['message']]));
    }

    private function authorizeOrder(Request $request, CustomerOrder $order): void
    {
        $user = $request->user();
        if ($this->accessControl->hasAnyRole($user, ['super_admin', 'admin', 'accountant'])) return;
        $customerId = (int) ($user?->customer_id ?: Customer::where('user_id', $user?->id)->value('id'));
        abort_unless($customerId > 0 && (int) $order->customer_id === $customerId, 403, 'You cannot pay for this order.');
    }

    private function sessionUrl(bool $sandbox): string
    {
        return $sandbox ? 'https://sandbox.sslcommerz.com/gwprocess/v4/api.php' : 'https://securepay.sslcommerz.com/gwprocess/v4/api.php';
    }

    private function validationUrl(bool $sandbox): string
    {
        return $sandbox ? 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php' : 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php';
    }

    private function transactionNo(): string
    {
        do { $no = 'NSTPAY-' . now()->format('YmdHis') . '-' . strtoupper(Str::random(6)); }
        while (PaymentTransaction::where('transaction_no', $no)->exists());
        return $no;
    }

    private function maskedPayload(array $payload): array
    {
        unset($payload['store_passwd']);
        if (isset($payload['cus_phone'])) $payload['cus_phone'] = substr($payload['cus_phone'], 0, 3) . '******' . substr($payload['cus_phone'], -2);
        return $payload;
    }
}
