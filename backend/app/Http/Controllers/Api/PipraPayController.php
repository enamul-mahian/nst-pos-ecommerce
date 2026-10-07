<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerOrder;
use App\Models\CustomerOrderTimelineEvent;
use App\Models\PaymentTransaction;
use App\Models\PaymentWebhookLog;
use App\Services\AccessControlService;
use App\Services\PaymentGatewayManagerService;
use App\Services\PipraPayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class PipraPayController extends Controller
{
    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly PaymentGatewayManagerService $gateways,
        private readonly PipraPayService $piprapay,
    ) {
    }

    public function init(Request $request): JsonResponse
    {
        $validated = $request->validate(['order_id' => ['required', 'exists:customer_orders,id']]);
        $config = $this->gateways->effective('piprapay');

        abort_unless(($config['enabled'] ?? false) && ($config['configured'] ?? false), 422, 'PipraPay is currently disabled or not configured.');

        $order = CustomerOrder::with('customer')->findOrFail($validated['order_id']);
        $this->authorizeOrder($request, $order);
        abort_if(in_array($order->status, ['cancelled', 'rejected', 'completed'], true), 422, 'This order cannot start a new payment.');
        abort_if((float) $order->total_amount <= 0, 422, 'Order total is invalid.');
        abort_if(blank($order->customer_name) || blank($order->customer_phone) || blank($order->customer_email), 422, 'Name, phone and email are required for PipraPay.');

        $existing = PaymentTransaction::query()
            ->where('customer_order_id', $order->id)
            ->where('provider', 'piprapay')
            ->where('status', 'initiated')
            ->where('created_at', '>=', now()->subMinutes(15))
            ->latest('id')
            ->first();

        $existingUrl = data_get($existing?->response_payload, 'pp_url');
        if ($existing && filled($existing->provider_transaction_id) && filled($existingUrl)) {
            return response()->json([
                'status' => true,
                'message' => 'Existing secure PipraPay session reused.',
                'pp_id' => $existing->provider_transaction_id,
                'pp_url' => $existingUrl,
                'payment_url' => $existingUrl,
                'transaction_no' => $existing->transaction_no,
            ]);
        }

        $transactionNo = $this->transactionNo();
        $transaction = PaymentTransaction::create([
            'transaction_no' => $transactionNo,
            'provider' => 'piprapay',
            'customer_order_id' => $order->id,
            'sale_id' => $order->sale_id,
            'user_id' => $request->user()?->id,
            'amount' => $order->total_amount,
            'currency' => $config['currency'] ?? 'BDT',
            'status' => 'initiated',
        ]);

        $payload = [
            'full_name' => $order->customer_name,
            'email_address' => $order->customer_email,
            'mobile_number' => $order->customer_phone,
            'amount' => number_format((float) $order->total_amount, 2, '.', ''),
            'currency' => $config['currency'] ?? 'BDT',
            'return_url' => url('/api/payment/piprapay/return') . '?nst_tx=' . urlencode($transactionNo),
            'webhook_url' => url('/api/payment/piprapay/webhook'),
            'metadata' => [
                'nst_order_id' => (string) $order->id,
                'nst_order_no' => (string) $order->order_no,
                'nst_transaction_no' => $transactionNo,
            ],
        ];

        $transaction->update(['request_payload' => $this->maskedPayload($payload)]);

        try {
            $body = $this->piprapay->checkout($payload);
            $ppId = trim((string) ($body['pp_id'] ?? ''));
            $ppUrl = trim((string) ($body['pp_url'] ?? ''));

            if ($ppId === '' || $ppUrl === '') {
                $transaction->update(['status' => 'init_failed', 'response_payload' => $body, 'failed_at' => now()]);
                return response()->json(['status' => false, 'message' => 'PipraPay did not return a valid payment session.'], 502);
            }

            $transaction->update([
                'provider_transaction_id' => $ppId,
                'session_key' => $ppId,
                'response_payload' => $body,
            ]);

            CustomerOrderTimelineEvent::create([
                'customer_order_id' => $order->id,
                'event_type' => 'payment',
                'status' => 'initiated',
                'title' => 'PipraPay Payment Started',
                'description' => 'Secure PipraPay checkout session created.',
                'metadata' => ['provider' => 'piprapay', 'transaction_no' => $transactionNo, 'pp_id' => $ppId, 'amount' => (float) $order->total_amount],
                'customer_visible' => true,
                'created_by' => $request->user()?->id,
                'event_at' => now(),
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Secure PipraPay session created.',
                'pp_id' => $ppId,
                'pp_url' => $ppUrl,
                'payment_url' => $ppUrl,
                'transaction_no' => $transactionNo,
            ]);
        } catch (Throwable $exception) {
            report($exception);
            $transaction->update([
                'status' => 'init_failed',
                'response_payload' => ['error' => $exception->getMessage()],
                'failed_at' => now(),
            ]);
            return response()->json(['status' => false, 'message' => 'PipraPay is temporarily unavailable.'], 503);
        }
    }

    public function webhook(Request $request): JsonResponse
    {
        $payload = $request->json()->all();
        if (! $payload) $payload = $request->all();

        $ppId = trim((string) ($payload['pp_id'] ?? ''));
        $log = PaymentWebhookLog::create([
            'provider' => 'piprapay',
            'provider_transaction_id' => $ppId ?: null,
            'event_key' => trim((string) ($payload['status'] ?? 'payment_event')),
            'status' => 'received',
            'payload' => $payload,
            'received_at' => now(),
        ]);

        if ($ppId === '') {
            return $this->finishLog($log, false, 422, 'Missing pp_id.');
        }

        $transaction = PaymentTransaction::query()
            ->where('provider', 'piprapay')
            ->where('provider_transaction_id', $ppId)
            ->first();

        if (! $transaction) {
            return $this->finishLog($log, false, 404, 'Unknown PipraPay transaction.');
        }

        $log->update(['payment_transaction_id' => $transaction->id]);

        try {
            $result = $this->verifyAndApply($transaction);
            $log->update(['verification_payload' => $result['verification'] ?? null]);
            return $this->finishLog($log, $result['status'], $result['status'] ? 200 : 422, $result['message']);
        } catch (Throwable $exception) {
            report($exception);
            return $this->finishLog($log, false, 503, 'PipraPay server-side verification is unavailable.');
        }
    }

    public function verify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'order_id' => ['nullable', 'integer', 'exists:customer_orders,id', 'required_without:pp_id'],
            'pp_id' => ['nullable', 'string', 'max:190', 'required_without:order_id'],
        ]);

        $transaction = PaymentTransaction::with('order')
            ->where('provider', 'piprapay')
            ->when(! empty($validated['order_id']), fn ($q) => $q->where('customer_order_id', $validated['order_id']))
            ->when(! empty($validated['pp_id']), fn ($q) => $q->where('provider_transaction_id', $validated['pp_id']))
            ->latest('id')
            ->firstOrFail();

        abort_unless($transaction->order, 404, 'Order not found.');
        $this->authorizeOrder($request, $transaction->order);

        try {
            $result = $this->verifyAndApply($transaction);
            return response()->json($result, $result['status'] ? 200 : 422);
        } catch (Throwable $exception) {
            report($exception);
            return response()->json(['status' => false, 'message' => 'PipraPay verification is temporarily unavailable.'], 503);
        }
    }

    public function returnFromGateway(Request $request): RedirectResponse
    {
        $localTransactionNo = trim((string) $request->query('nst_tx'));
        $reference = trim((string) ($request->query('transaction_ref') ?: $request->query('pp_id')));

        $transaction = $localTransactionNo !== ''
            ? PaymentTransaction::with('order')->where('provider', 'piprapay')->where('transaction_no', $localTransactionNo)->first()
            : null;

        if (! $transaction && $reference !== '') {
            $transaction = PaymentTransaction::with('order')
                ->where('provider', 'piprapay')
                ->where('provider_transaction_id', $reference)
                ->first();
        }

        $verified = false;
        $message = 'Payment could not be verified yet.';

        if ($transaction) {
            try {
                $result = $this->verifyAndApply($transaction);
                $verified = (bool) $result['status'];
                $message = $result['message'];
                $transaction = $transaction->fresh('order');
            } catch (Throwable $exception) {
                report($exception);
                $message = 'Payment verification is temporarily unavailable.';
            }
        }

        $config = $this->gateways->effective('piprapay');
        $base = rtrim((string) ($config['frontend_url'] ?? config('app.url')), '/');
        $path = $verified ? '/order-success' : '/checkout';

        return redirect()->away($base . $path . '?' . http_build_query([
            'order_id' => $transaction?->order?->order_no ?: $transaction?->customer_order_id,
            'total' => $transaction?->amount,
            'method' => 'piprapay',
            'payment' => $verified ? 'success' : 'pending',
            'message' => $message,
        ]));
    }

    private function verifyAndApply(PaymentTransaction $transaction): array
    {
        if ($transaction->status === 'paid') {
            return [
                'status' => true,
                'message' => 'Payment already verified.',
                'transaction' => $transaction->fresh('order'),
                'verification' => $transaction->validation_payload,
            ];
        }

        if ($transaction->status === 'refunded') {
            return [
                'status' => false,
                'message' => 'This payment has already been refunded.',
                'transaction' => $transaction->fresh('order'),
                'verification' => $transaction->validation_payload,
            ];
        }

        $ppId = trim((string) $transaction->provider_transaction_id);
        if ($ppId === '') {
            return ['status' => false, 'message' => 'PipraPay reference is missing.', 'transaction' => $transaction];
        }

        $body = $this->piprapay->verify($ppId);
        $metadata = $this->metadata($body['metadata'] ?? []);
        $status = strtolower(trim((string) ($body['status'] ?? '')));

        $statusMatches = $status === 'completed';
        $idMatches = (string) ($body['pp_id'] ?? '') === $ppId;
        $amountMatches = abs((float) ($body['amount'] ?? -1) - (float) $transaction->amount) < 0.01;
        $currencyMatches = strtoupper((string) ($body['currency'] ?? '')) === strtoupper((string) $transaction->currency);
        $orderMatches = (string) ($metadata['nst_order_id'] ?? '') === (string) $transaction->customer_order_id;
        $transactionMatches = (string) ($metadata['nst_transaction_no'] ?? '') === (string) $transaction->transaction_no;

        $valid = $statusMatches && $idMatches && $amountMatches && $currencyMatches && $orderMatches && $transactionMatches;

        DB::transaction(function () use ($transaction, $body, $valid) {
            $locked = PaymentTransaction::query()->whereKey($transaction->id)->lockForUpdate()->firstOrFail();

            if (in_array($locked->status, ['paid', 'refunded'], true)) return;

            $locked->update([
                'validation_payload' => $body,
                'bank_transaction_id' => $body['transaction_id'] ?? $locked->bank_transaction_id,
                'status' => $valid ? 'paid' : 'validation_failed',
                'paid_at' => $valid ? now() : null,
                'failed_at' => $valid ? null : now(),
                'last_verified_at' => now(),
            ]);

            $order = CustomerOrder::query()->whereKey($locked->customer_order_id)->lockForUpdate()->first();
            if (! $order) return;

            if ($valid) {
                $alreadyApprovedForThisTransaction = $order->payment_status === 'approved'
                    && $order->transaction_id === $locked->transaction_no;

                if (! $alreadyApprovedForThisTransaction) {
                    $history = is_array($order->status_history) ? $order->status_history : [];
                    $history[] = [
                        'status' => 'payment_approved',
                        'custom_status' => 'PipraPay Payment Verified',
                        'payment_status' => 'approved',
                        'changed_at' => now()->toIso8601String(),
                        'changed_by' => null,
                        'source' => 'payment_gateway',
                        'provider' => 'piprapay',
                        'transaction_no' => $locked->transaction_no,
                        'pp_id' => $locked->provider_transaction_id,
                    ];

                    $order->forceFill([
                        'payment_method' => 'piprapay',
                        'payment_status' => 'approved',
                        'transaction_id' => $locked->transaction_no,
                        'paid_amount' => $locked->amount,
                        'status' => 'payment_approved',
                        'custom_status' => 'PipraPay Payment Verified',
                        'status_history' => $history,
                    ])->save();

                    CustomerOrderTimelineEvent::create([
                        'customer_order_id' => $order->id,
                        'event_type' => 'payment',
                        'status' => 'paid',
                        'title' => 'PipraPay Payment Verified',
                        'description' => 'Payment was verified directly with PipraPay.',
                        'metadata' => [
                            'provider' => 'piprapay',
                            'transaction_no' => $locked->transaction_no,
                            'pp_id' => $locked->provider_transaction_id,
                            'amount' => (float) $locked->amount,
                        ],
                        'customer_visible' => true,
                        'created_by' => null,
                        'event_at' => now(),
                    ]);
                }
            }
        });

        return [
            'status' => $valid,
            'message' => $valid ? 'PipraPay payment verified successfully.' : 'PipraPay verification did not match the NST order.',
            'transaction' => $transaction->fresh('order'),
            'verification' => $body,
        ];
    }

    private function authorizeOrder(Request $request, CustomerOrder $order): void
    {
        $user = $request->user();
        if ($this->accessControl->hasAnyRole($user, ['super_admin', 'admin', 'accountant'])) return;

        $customerId = (int) ($user?->customer_id ?: Customer::query()->where('user_id', $user?->id)->value('id'));
        abort_unless($customerId > 0 && (int) $order->customer_id === $customerId, 403, 'You cannot pay for this order.');
    }

    private function transactionNo(): string
    {
        do {
            $no = 'NSTPP-' . now()->format('YmdHis') . '-' . strtoupper(Str::random(6));
        } while (PaymentTransaction::query()->where('transaction_no', $no)->exists());

        return $no;
    }

    private function metadata(mixed $metadata): array
    {
        if (is_array($metadata)) return $metadata;
        if (! is_string($metadata) || trim($metadata) === '') return [];
        $decoded = json_decode($metadata, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function maskedPayload(array $payload): array
    {
        if (isset($payload['mobile_number'])) {
            $phone = (string) $payload['mobile_number'];
            $payload['mobile_number'] = strlen($phone) > 5
                ? substr($phone, 0, 3) . '******' . substr($phone, -2)
                : '******';
        }
        return $payload;
    }

    private function finishLog(PaymentWebhookLog $log, bool $success, int $code, string $message): JsonResponse
    {
        $log->update([
            'status' => $success ? 'processed' : 'rejected',
            'response_code' => $code,
            'message' => $message,
            'processed_at' => now(),
        ]);

        return response()->json(['status' => $success, 'message' => $message], $code);
    }
}
