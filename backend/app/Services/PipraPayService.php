<?php

namespace App\Services;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

class PipraPayService
{
    public function __construct(private readonly PaymentGatewayManagerService $gateways)
    {
    }

    public function checkout(array $payload): array
    {
        return $this->post('/api/checkout/redirect', $payload);
    }

    public function verify(string $ppId): array
    {
        return $this->post('/api/verify-payment', ['pp_id' => $ppId]);
    }

    public function refund(string $ppId): array
    {
        return $this->post('/api/refund-payment', ['pp_id' => $ppId]);
    }

    private function post(string $path, array $payload): array
    {
        $config = $this->gateways->effective('piprapay');
        if (! ($config['enabled'] ?? false) || ! ($config['configured'] ?? false)) {
            throw new RuntimeException('PipraPay is disabled or not configured.');
        }

        $response = Http::acceptJson()
            ->asJson()
            ->withHeaders(['MHS-PIPRAPAY-API-KEY' => (string) $config['api_key']])
            ->timeout(max(10, (int) ($config['timeout_seconds'] ?? 30)))
            ->post(rtrim((string) $config['base_url'], '/') . $path, $payload);

        return $this->decode($response);
    }

    private function decode(Response $response): array
    {
        $body = $response->json();
        if (! $response->successful() || ! is_array($body)) {
            throw new RuntimeException('PipraPay request failed with HTTP ' . $response->status() . '.');
        }

        $data = $body['data'] ?? $body;
        if (! is_array($data)) {
            throw new RuntimeException('PipraPay returned an invalid response.');
        }

        return $data;
    }
}
