<?php

namespace App\Services;

use App\Models\CustomerOrder;
use App\Models\DeliveryGatewaySetting;
use App\Models\DeliveryGatewayShipment;
use App\Models\OrderDelivery;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class DeliveryGatewayManagerService
{
    public function adminProviderPayload(DeliveryGatewaySetting $provider): array
    {
        $credentials = (array) ($provider->credentials ?? []);

        return [
            'id' => $provider->id,
            'name' => $provider->name,
            'code' => $provider->code,
            'adapter' => $provider->adapter,
            'is_enabled' => (bool) $provider->is_enabled,
            'is_default' => (bool) $provider->is_default,
            'base_url' => $provider->base_url,
            'settings' => (array) ($provider->settings ?? []),
            'connection_status' => $provider->connection_status,
            'last_tested_at' => optional($provider->last_tested_at)?->toIso8601String(),
            'last_error' => $provider->last_error,
            'credential_status' => [
                'api_key' => filled($credentials['api_key'] ?? null),
                'secret_key' => filled($credentials['secret_key'] ?? null),
                'client_id' => filled($credentials['client_id'] ?? null),
                'client_secret' => filled($credentials['client_secret'] ?? null),
                'username' => filled($credentials['username'] ?? null),
                'password' => filled($credentials['password'] ?? null),
                'token' => filled($credentials['token'] ?? null),
                'webhook_token' => filled($credentials['webhook_token'] ?? null),
            ],
            'webhook_url' => url('/api/delivery-webhooks/' . $provider->code),
        ];
    }

    public function enabledProviderPayload(DeliveryGatewaySetting $provider): array
    {
        return [
            'id' => $provider->id,
            'name' => $provider->name,
            'code' => $provider->code,
            'adapter' => $provider->adapter,
            'is_default' => (bool) $provider->is_default,
            'connection_status' => $provider->connection_status,
        ];
    }

    public function mergeCredentials(DeliveryGatewaySetting $provider, array $incoming): array
    {
        $current = (array) ($provider->credentials ?? []);

        foreach ($incoming as $key => $value) {
            if ($value !== null && trim((string) $value) !== '') {
                $current[$key] = trim((string) $value);
            }
        }

        return $current;
    }

    public function testConnection(DeliveryGatewaySetting $provider): array
    {
        try {
            $result = match ($provider->adapter) {
                'steadfast' => $this->testSteadfast($provider),
                'pathao' => $this->testPathao($provider),
                default => $this->testGeneric($provider),
            };

            $provider->forceFill([
                'connection_status' => 'connected',
                'last_tested_at' => now(),
                'last_error' => null,
            ])->save();

            return $result;
        } catch (Throwable $e) {
            $provider->forceFill([
                'connection_status' => 'failed',
                'last_tested_at' => now(),
                'last_error' => Str::limit($e->getMessage(), 2000),
            ])->save();

            throw $e;
        }
    }

    public function createShipment(
        DeliveryGatewaySetting $provider,
        CustomerOrder $order,
        array $options,
        ?int $userId
    ): DeliveryGatewayShipment {
        abort_unless($provider->is_enabled, 422, 'Selected courier API is disabled.');
        abort_unless($order->sale_id, 422, 'Authorize/convert the Web Sale before sending it to a courier API.');
        abort_if(
            in_array(strtolower((string) $order->payment_status), ['refunded', 'failed', 'rejected'], true),
            422,
            'Refunded or failed orders cannot be sent to courier.'
        );

        $order->loadMissing('items');

        abort_unless(filled($order->customer_name), 422, 'Customer name is required.');
        abort_unless(filled($order->customer_phone), 422, 'Customer phone is required.');
        abort_unless(filled($order->delivery_address), 422, 'Delivery address is required.');

        $shipment = DeliveryGatewayShipment::firstOrNew([
            'delivery_gateway_setting_id' => $provider->id,
            'customer_order_id' => $order->id,
        ]);

        if (
            $shipment->exists
            && (filled($shipment->consignment_id) || filled($shipment->tracking_code))
            && ! ($options['force'] ?? false)
        ) {
            return $shipment->load('provider');
        }

        $common = $this->commonOrderPayload($provider, $order, $options);

        try {
            $result = match ($provider->adapter) {
                'steadfast' => $this->createSteadfast($provider, $common),
                'pathao' => $this->createPathao($provider, $common),
                default => $this->createGeneric($provider, $common),
            };

            $shipment->fill([
                'sale_id' => $order->sale_id,
                'consignment_id' => $result['consignment_id'] ?? null,
                'tracking_code' => $result['tracking_code'] ?? $result['consignment_id'] ?? null,
                'provider_status' => $result['provider_status'] ?? 'created',
                'status' => 'submitted',
                'cod_amount' => $common['cod_amount'],
                'delivery_fee' => $result['delivery_fee'] ?? null,
                'request_payload' => $this->redactPayload($result['request_payload'] ?? $common),
                'response_payload' => $result['response_payload'] ?? [],
                'last_error' => null,
                'last_synced_at' => now(),
                'created_by' => $shipment->created_by ?: $userId,
            ]);
            $shipment->save();

            $delivery = OrderDelivery::firstOrCreate(
                ['customer_order_id' => $order->id],
                [
                    'sale_id' => $order->sale_id,
                    'status' => $order->delivery_status ?: 'pending',
                    'delivery_address' => $order->delivery_address,
                ]
            );

            $delivery->forceFill([
                'sale_id' => $order->sale_id,
                'courier_name' => $provider->name,
                'tracking_number' => $shipment->tracking_code ?: $shipment->consignment_id,
                'delivery_address' => $delivery->delivery_address ?: $order->delivery_address,
                'note' => $options['note'] ?? $delivery->note,
                'updated_by' => $userId,
            ])->save();

            return $shipment->fresh(['provider', 'order:id,order_no']);
        } catch (Throwable $e) {
            $shipment->fill([
                'sale_id' => $order->sale_id,
                'status' => 'failed',
                'cod_amount' => $common['cod_amount'],
                'request_payload' => $this->redactPayload($common),
                'last_error' => Str::limit($e->getMessage(), 2000),
                'last_synced_at' => now(),
                'created_by' => $shipment->created_by ?: $userId,
            ]);
            $shipment->save();

            throw $e;
        }
    }

    public function syncShipment(DeliveryGatewayShipment $shipment): DeliveryGatewayShipment
    {
        $shipment->loadMissing('provider');
        $provider = $shipment->provider;

        abort_unless($provider && $provider->is_enabled, 422, 'Courier API is disabled.');

        $result = match ($provider->adapter) {
            'steadfast' => $this->trackSteadfast($provider, $shipment),
            'pathao' => $this->trackPathao($provider, $shipment),
            default => $this->trackGeneric($provider, $shipment),
        };

        $shipment->forceFill([
            'provider_status' => $result['provider_status'] ?? $shipment->provider_status,
            'response_payload' => $result['response_payload'] ?? $shipment->response_payload,
            'last_error' => null,
            'last_synced_at' => now(),
        ])->save();

        return $shipment->fresh(['provider', 'order:id,order_no']);
    }

    public function acceptWebhook(DeliveryGatewaySetting $provider, array $payload, ?string $authorization): ?DeliveryGatewayShipment
    {
        $credentials = (array) ($provider->credentials ?? []);
        $expected = trim((string) ($credentials['webhook_token'] ?? ''));

        if ($expected !== '') {
            $provided = trim((string) preg_replace('/^Bearer\s+/i', '', (string) $authorization));
            abort_unless($provided !== '' && hash_equals($expected, $provided), 401, 'Invalid courier webhook token.');
        }

        $tracking = (string) (
            $payload['tracking_code']
            ?? $payload['tracking_number']
            ?? $payload['consignment_id']
            ?? ''
        );
        $invoice = (string) ($payload['invoice'] ?? $payload['merchant_order_id'] ?? '');

        $query = DeliveryGatewayShipment::where('delivery_gateway_setting_id', $provider->id);

        if ($tracking !== '') {
            $query->where(function ($q) use ($tracking) {
                $q->where('tracking_code', $tracking)->orWhere('consignment_id', $tracking);
            });
        } elseif ($invoice !== '') {
            $query->whereHas('order', fn ($q) => $q->where('order_no', $invoice));
        } else {
            return null;
        }

        $shipment = $query->latest('id')->first();
        if (! $shipment) return null;

        $shipment->forceFill([
            'provider_status' => (string) (
                $payload['delivery_status']
                ?? $payload['order_status']
                ?? $payload['status']
                ?? $shipment->provider_status
            ),
            'response_payload' => $payload,
            'last_error' => null,
            'last_synced_at' => now(),
        ])->save();

        return $shipment;
    }

    private function commonOrderPayload(
        DeliveryGatewaySetting $provider,
        CustomerOrder $order,
        array $options
    ): array {
        $settings = (array) ($provider->settings ?? []);

        $quantity = max(1, (int) $order->items->sum(fn ($item) => (int) ($item->quantity ?: 1)));
        $description = $order->items
            ->map(fn ($item) => trim((string) ($item->product_name ?: $item->sku ?: 'Product')) . ' x' . max(1, (int) $item->quantity))
            ->filter()
            ->take(10)
            ->implode(', ');

        $paymentMethod = strtolower((string) $order->payment_method);
        $isCod = str_contains($paymentMethod, 'cod') || str_contains($paymentMethod, 'cash_on_delivery');

        $codAmount = $isCod
            ? max(0, (float) $order->total_amount - (float) $order->paid_amount)
            : 0.0;

        return [
            'order_no' => (string) $order->order_no,
            'recipient_name' => (string) $order->customer_name,
            'recipient_phone' => (string) $order->customer_phone,
            'recipient_address' => (string) $order->delivery_address,
            'cod_amount' => round($codAmount, 2),
            'note' => trim((string) ($options['note'] ?? '')),
            'item_description' => $description ?: 'NST order ' . $order->order_no,
            'quantity' => $quantity,
            'weight' => max(
                0.1,
                (float) ($options['weight'] ?? $settings['default_weight'] ?? 0.5)
            ),
        ];
    }

    private function testSteadfast(DeliveryGatewaySetting $provider): array
    {
        $settings = (array) ($provider->settings ?? []);
        $endpoint = (string) ($settings['test_endpoint'] ?? '/get_balance');
        $response = $this->steadfastRequest($provider)->get($this->url($provider, $endpoint));

        $this->ensureSuccess($response->successful(), $response->status(), $response->json() ?: $response->body());

        return [
            'message' => 'Steadfast API connection successful.',
            'balance' => data_get($response->json(), 'current_balance'),
        ];
    }

    private function createSteadfast(DeliveryGatewaySetting $provider, array $common): array
    {
        $settings = (array) ($provider->settings ?? []);
        $endpoint = (string) ($settings['create_endpoint'] ?? '/create_order');

        $payload = [
            'invoice' => $common['order_no'],
            'recipient_name' => $common['recipient_name'],
            'recipient_phone' => $common['recipient_phone'],
            'recipient_address' => $common['recipient_address'],
            'cod_amount' => $common['cod_amount'],
            'note' => $common['note'] ?: null,
            'item_description' => $common['item_description'],
        ];

        $response = $this->steadfastRequest($provider)
            ->post($this->url($provider, $endpoint), $payload);

        $json = $response->json() ?: [];
        $this->ensureSuccess($response->successful(), $response->status(), $json ?: $response->body());

        return [
            'consignment_id' => (string) (
                data_get($json, 'consignment.consignment_id')
                ?? data_get($json, 'consignment_id')
                ?? ''
            ),
            'tracking_code' => (string) (
                data_get($json, 'consignment.tracking_code')
                ?? data_get($json, 'tracking_code')
                ?? ''
            ),
            'provider_status' => (string) (
                data_get($json, 'consignment.status')
                ?? data_get($json, 'delivery_status')
                ?? data_get($json, 'status')
                ?? 'submitted'
            ),
            'delivery_fee' => data_get($json, 'consignment.delivery_charge')
                ?? data_get($json, 'delivery_fee'),
            'request_payload' => $payload,
            'response_payload' => $json,
        ];
    }

    private function trackSteadfast(
        DeliveryGatewaySetting $provider,
        DeliveryGatewayShipment $shipment
    ): array {
        $settings = (array) ($provider->settings ?? []);
        $template = trim((string) ($settings['track_endpoint'] ?? '/status_by_trackingcode/{tracking}'));

        $tracking = $shipment->tracking_code ?: $shipment->consignment_id;
        abort_unless(filled($tracking), 422, 'Tracking code is missing.');

        $endpoint = str_replace(
            ['{tracking}', '{consignment}'],
            [rawurlencode((string) $tracking), rawurlencode((string) $shipment->consignment_id)],
            $template
        );

        $response = $this->steadfastRequest($provider)->get($this->url($provider, $endpoint));
        $json = $response->json() ?: [];

        $this->ensureSuccess($response->successful(), $response->status(), $json ?: $response->body());

        return [
            'provider_status' => (string) (
                data_get($json, 'delivery_status')
                ?? data_get($json, 'status')
                ?? $shipment->provider_status
            ),
            'response_payload' => $json,
        ];
    }

    private function steadfastRequest(DeliveryGatewaySetting $provider): PendingRequest
    {
        $credentials = (array) ($provider->credentials ?? []);
        abort_unless(filled($credentials['api_key'] ?? null), 422, 'Steadfast API Key is not configured.');
        abort_unless(filled($credentials['secret_key'] ?? null), 422, 'Steadfast Secret Key is not configured.');

        return Http::timeout(25)
            ->acceptJson()
            ->asJson()
            ->withHeaders([
                'Api-Key' => $credentials['api_key'],
                'Secret-Key' => $credentials['secret_key'],
            ]);
    }

    private function testPathao(DeliveryGatewaySetting $provider): array
    {
        $token = $this->pathaoToken($provider, true);
        $settings = (array) ($provider->settings ?? []);
        $storesEndpoint = (string) ($settings['stores_endpoint'] ?? '/aladdin/api/v1/stores');

        $response = Http::timeout(25)
            ->acceptJson()
            ->withToken($token)
            ->get($this->url($provider, $storesEndpoint));

        $json = $response->json() ?: [];
        $this->ensureSuccess($response->successful(), $response->status(), $json ?: $response->body());

        $stores = collect(
            data_get($json, 'data.data')
            ?? data_get($json, 'data')
            ?? []
        )->take(100)->map(fn ($row) => [
            'store_id' => data_get($row, 'store_id'),
            'store_name' => data_get($row, 'store_name'),
            'store_address' => data_get($row, 'store_address'),
        ])->values()->all();

        return [
            'message' => 'Pathao API connection successful.',
            'stores' => $stores,
        ];
    }

    private function createPathao(DeliveryGatewaySetting $provider, array $common): array
    {
        $settings = (array) ($provider->settings ?? []);
        $storeId = $settings['store_id'] ?? null;
        abort_unless(filled($storeId), 422, 'Pathao Store ID is required.');

        $token = $this->pathaoToken($provider);
        $endpoint = (string) ($settings['create_endpoint'] ?? '/aladdin/api/v1/orders');

        $payload = [
            'store_id' => (int) $storeId,
            'merchant_order_id' => $common['order_no'],
            'recipient_name' => $common['recipient_name'],
            'recipient_phone' => $common['recipient_phone'],
            'recipient_address' => $common['recipient_address'],
            'delivery_type' => (int) ($settings['delivery_type'] ?? 48),
            'item_type' => (int) ($settings['item_type'] ?? 2),
            'special_instruction' => $common['note'] ?: null,
            'item_quantity' => $common['quantity'],
            'item_weight' => $common['weight'],
            'item_description' => $common['item_description'],
            'amount_to_collect' => $common['cod_amount'],
        ];

        $response = Http::timeout(25)
            ->acceptJson()
            ->asJson()
            ->withToken($token)
            ->post($this->url($provider, $endpoint), $payload);

        $json = $response->json() ?: [];
        $this->ensureSuccess($response->successful(), $response->status(), $json ?: $response->body());

        return [
            'consignment_id' => (string) (
                data_get($json, 'data.consignment_id')
                ?? data_get($json, 'consignment_id')
                ?? ''
            ),
            'tracking_code' => (string) (
                data_get($json, 'data.consignment_id')
                ?? data_get($json, 'tracking_number')
                ?? ''
            ),
            'provider_status' => (string) (
                data_get($json, 'data.order_status')
                ?? data_get($json, 'order_status')
                ?? 'submitted'
            ),
            'delivery_fee' => data_get($json, 'data.delivery_fee')
                ?? data_get($json, 'delivery_fee'),
            'request_payload' => $payload,
            'response_payload' => $json,
        ];
    }

    private function trackPathao(
        DeliveryGatewaySetting $provider,
        DeliveryGatewayShipment $shipment
    ): array {
        $settings = (array) ($provider->settings ?? []);
        $template = trim((string) ($settings['track_endpoint'] ?? ''));

        abort_unless(
            $template !== '',
            422,
            'Pathao tracking endpoint is not configured. Add the current official endpoint from your Pathao Developer API panel.'
        );

        $tracking = $shipment->tracking_code ?: $shipment->consignment_id;
        abort_unless(filled($tracking), 422, 'Pathao consignment ID is missing.');

        $endpoint = str_replace(
            ['{tracking}', '{consignment}'],
            [rawurlencode((string) $tracking), rawurlencode((string) $shipment->consignment_id)],
            $template
        );

        $token = $this->pathaoToken($provider);

        $response = Http::timeout(25)
            ->acceptJson()
            ->withToken($token)
            ->get($this->url($provider, $endpoint));

        $json = $response->json() ?: [];
        $this->ensureSuccess($response->successful(), $response->status(), $json ?: $response->body());

        return [
            'provider_status' => (string) (
                data_get($json, 'data.order_status')
                ?? data_get($json, 'order_status')
                ?? data_get($json, 'status')
                ?? $shipment->provider_status
            ),
            'response_payload' => $json,
        ];
    }

    private function pathaoToken(DeliveryGatewaySetting $provider, bool $refresh = false): string
    {
        $cacheKey = 'nst_delivery_pathao_token_' . $provider->id;

        if (! $refresh && Cache::has($cacheKey)) {
            return (string) Cache::get($cacheKey);
        }

        $credentials = (array) ($provider->credentials ?? []);
        foreach (['client_id', 'client_secret', 'username', 'password'] as $key) {
            abort_unless(filled($credentials[$key] ?? null), 422, "Pathao {$key} is not configured.");
        }

        $settings = (array) ($provider->settings ?? []);
        $endpoint = (string) ($settings['token_endpoint'] ?? '/aladdin/api/v1/issue-token');

        $response = Http::timeout(25)
            ->acceptJson()
            ->asJson()
            ->post($this->url($provider, $endpoint), [
                'client_id' => $credentials['client_id'],
                'client_secret' => $credentials['client_secret'],
                'username' => $credentials['username'],
                'password' => $credentials['password'],
                'grant_type' => 'password',
            ]);

        $json = $response->json() ?: [];
        $this->ensureSuccess($response->successful(), $response->status(), $json ?: $response->body());

        $token = (string) (
            data_get($json, 'access_token')
            ?? data_get($json, 'data.access_token')
            ?? ''
        );
        abort_unless($token !== '', 502, 'Pathao did not return an access token.');

        $expiresIn = max(300, (int) (
            data_get($json, 'expires_in')
            ?? data_get($json, 'data.expires_in')
            ?? 3600
        ));

        Cache::put($cacheKey, $token, now()->addSeconds(max(60, $expiresIn - 120)));

        return $token;
    }

    private function testGeneric(DeliveryGatewaySetting $provider): array
    {
        $settings = (array) ($provider->settings ?? []);
        $endpoint = trim((string) ($settings['test_endpoint'] ?? ''));

        abort_unless(filled($provider->base_url), 422, 'Base URL is required.');
        $url = $this->url($provider, $endpoint);

        $request = $this->genericRequest($provider);
        $method = strtoupper((string) ($settings['test_method'] ?? 'GET'));

        $response = $method === 'POST'
            ? $request->post($url, [])
            : $request->get($url);

        $json = $response->json();
        $this->ensureSuccess($response->successful(), $response->status(), $json ?: $response->body());

        return [
            'message' => $provider->name . ' API connection successful.',
            'response_status' => $response->status(),
        ];
    }

    private function createGeneric(DeliveryGatewaySetting $provider, array $common): array
    {
        $settings = (array) ($provider->settings ?? []);
        $endpoint = trim((string) ($settings['create_endpoint'] ?? ''));

        abort_unless($endpoint !== '', 422, 'Create Order endpoint is not configured for this courier.');

        $fieldMap = (array) ($settings['field_map'] ?? []);
        $payload = [];

        foreach ($common as $canonical => $value) {
            $providerField = trim((string) ($fieldMap[$canonical] ?? $canonical));
            if ($providerField !== '') {
                Arr::set($payload, $providerField, $value);
            }
        }

        $response = $this->genericRequest($provider)
            ->post($this->url($provider, $endpoint), $payload);

        $json = $response->json() ?: [];
        $this->ensureSuccess($response->successful(), $response->status(), $json ?: $response->body());

        $consignmentPath = (string) ($settings['response_consignment_path'] ?? 'data.consignment_id');
        $trackingPath = (string) ($settings['response_tracking_path'] ?? 'data.tracking_code');
        $statusPath = (string) ($settings['response_status_path'] ?? 'data.status');
        $feePath = (string) ($settings['response_fee_path'] ?? 'data.delivery_fee');

        return [
            'consignment_id' => (string) (
                data_get($json, $consignmentPath)
                ?? data_get($json, 'consignment_id')
                ?? data_get($json, 'id')
                ?? ''
            ),
            'tracking_code' => (string) (
                data_get($json, $trackingPath)
                ?? data_get($json, 'tracking_code')
                ?? data_get($json, 'tracking_number')
                ?? ''
            ),
            'provider_status' => (string) (
                data_get($json, $statusPath)
                ?? data_get($json, 'status')
                ?? 'submitted'
            ),
            'delivery_fee' => data_get($json, $feePath),
            'request_payload' => $payload,
            'response_payload' => $json,
        ];
    }

    private function trackGeneric(
        DeliveryGatewaySetting $provider,
        DeliveryGatewayShipment $shipment
    ): array {
        $settings = (array) ($provider->settings ?? []);
        $template = trim((string) ($settings['track_endpoint'] ?? ''));

        abort_unless($template !== '', 422, 'Tracking endpoint is not configured.');

        $tracking = $shipment->tracking_code ?: $shipment->consignment_id;
        abort_unless(filled($tracking), 422, 'Tracking/consignment ID is missing.');

        $endpoint = str_replace(
            ['{tracking}', '{consignment}'],
            [rawurlencode((string) $tracking), rawurlencode((string) $shipment->consignment_id)],
            $template
        );

        $response = $this->genericRequest($provider)->get($this->url($provider, $endpoint));
        $json = $response->json() ?: [];

        $this->ensureSuccess($response->successful(), $response->status(), $json ?: $response->body());

        $statusPath = (string) ($settings['response_status_path'] ?? 'data.status');

        return [
            'provider_status' => (string) (
                data_get($json, $statusPath)
                ?? data_get($json, 'status')
                ?? $shipment->provider_status
            ),
            'response_payload' => $json,
        ];
    }

    private function genericRequest(DeliveryGatewaySetting $provider): PendingRequest
    {
        $settings = (array) ($provider->settings ?? []);
        $credentials = (array) ($provider->credentials ?? []);

        $request = Http::timeout(25)->acceptJson()->asJson();
        $authType = strtolower((string) ($settings['auth_type'] ?? 'bearer'));

        if ($authType === 'bearer' && filled($credentials['token'] ?? null)) {
            $request = $request->withToken((string) $credentials['token']);
        } elseif ($authType === 'basic') {
            abort_unless(filled($credentials['username'] ?? null), 422, 'API username is required.');
            abort_unless(filled($credentials['password'] ?? null), 422, 'API password is required.');
            $request = $request->withBasicAuth(
                (string) $credentials['username'],
                (string) $credentials['password']
            );
        } elseif ($authType === 'header') {
            $headerName = trim((string) ($settings['header_name'] ?? 'X-API-Key'));
            $headerValue = (string) ($credentials['api_key'] ?? $credentials['token'] ?? '');
            abort_unless($headerValue !== '', 422, 'API key/token is required.');
            $request = $request->withHeaders([$headerName => $headerValue]);
        }

        $extraHeaders = (array) ($settings['extra_headers'] ?? []);
        if ($extraHeaders) {
            $request = $request->withHeaders($extraHeaders);
        }

        return $request;
    }

    private function url(DeliveryGatewaySetting $provider, string $endpoint): string
    {
        $base = rtrim((string) $provider->base_url, '/');
        abort_unless($base !== '', 422, 'Courier API Base URL is not configured.');

        if (preg_match('#^https?://#i', $endpoint)) return $endpoint;

        return $base . '/' . ltrim($endpoint, '/');
    }

    private function ensureSuccess(bool $successful, int $status, mixed $body): void
    {
        if ($successful) return;

        $message = is_string($body)
            ? $body
            : json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        throw new RuntimeException('Courier API HTTP ' . $status . ': ' . Str::limit((string) $message, 1200));
    }

    private function redactPayload(array $payload): array
    {
        foreach (['password', 'client_secret', 'secret_key', 'api_key', 'token', 'access_token'] as $key) {
            if (array_key_exists($key, $payload)) $payload[$key] = '***';
        }

        return $payload;
    }
}
