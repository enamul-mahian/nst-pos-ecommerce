<?php

namespace App\Services;

use App\Models\PaymentGatewaySetting;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Schema;
use Throwable;

class PaymentGatewayManagerService
{
    public const PROVIDERS = ['sslcommerz', 'piprapay'];

    public function effective(string $provider): array
    {
        abort_unless(in_array($provider, self::PROVIDERS, true), 404, 'Unknown payment gateway.');

        $fallback = $this->fallback($provider);
        if (! Schema::hasTable('payment_gateway_settings')) {
            return $fallback + ['source' => 'environment'];
        }

        $row = PaymentGatewaySetting::query()->where('provider', $provider)->first();
        if (! $row) {
            return $fallback + ['source' => 'environment'];
        }

        $config = array_merge($fallback, is_array($row->config) ? $row->config : []);
        $credentials = $this->decryptCredentials($row->credentials);
        $config = array_merge($config, $credentials);

        $config['provider'] = $provider;
        $config['display_name'] = $row->display_name ?: $fallback['display_name'];
        $config['enabled'] = (bool) $row->enabled;
        $config['mode'] = $row->mode ?: $fallback['mode'];
        $config['sandbox'] = $config['mode'] === 'sandbox';
        $config['sort_order'] = (int) $row->sort_order;
        $config['refunds_enabled'] = (bool) $row->refunds_enabled;
        $config['source'] = 'database';
        $config['configured'] = $this->configured($provider, $config);

        return $config;
    }

    public function adminRows(): array
    {
        $rows = [];
        foreach (self::PROVIDERS as $provider) {
            $effective = $this->effective($provider);
            $rows[] = [
                'provider' => $provider,
                'display_name' => $effective['display_name'],
                'enabled' => (bool) $effective['enabled'],
                'configured' => (bool) $effective['configured'],
                'mode' => $effective['mode'],
                'sort_order' => (int) $effective['sort_order'],
                'refunds_enabled' => (bool) $effective['refunds_enabled'],
                'currency' => $effective['currency'] ?? 'BDT',
                'timeout_seconds' => (int) ($effective['timeout_seconds'] ?? 30),
                'frontend_url' => $effective['frontend_url'] ?? '',
                'base_url' => $provider === 'piprapay' ? ($effective['base_url'] ?? '') : null,
                'store_id_masked' => $provider === 'sslcommerz' ? $this->mask($effective['store_id'] ?? null) : null,
                'store_password_masked' => $provider === 'sslcommerz' ? $this->mask($effective['store_password'] ?? null) : null,
                'api_key_masked' => $provider === 'piprapay' ? $this->mask($effective['api_key'] ?? null) : null,
                'source' => $effective['source'] ?? 'environment',
            ];
        }

        usort($rows, fn (array $a, array $b) => [$a['sort_order'], $a['provider']] <=> [$b['sort_order'], $b['provider']]);
        return $rows;
    }

    public function publicProviders(): array
    {
        return array_values(array_map(
            fn (array $row) => [
                'key' => $row['provider'],
                'label' => $row['display_name'],
                'enabled' => (bool) $row['enabled'] && (bool) $row['configured'],
                'configured' => (bool) $row['configured'],
                'online' => true,
                'mode' => $row['mode'],
                'requires_transaction_id' => false,
                'agent_number' => null,
            ],
            $this->adminRows()
        ));
    }

    public function save(string $provider, array $input, ?int $userId = null): array
    {
        abort_unless(in_array($provider, self::PROVIDERS, true), 404, 'Unknown payment gateway.');
        abort_unless(Schema::hasTable('payment_gateway_settings'), 503, 'Run the payment gateway migration first.');

        $current = $this->effective($provider);
        $existing = PaymentGatewaySetting::query()->where('provider', $provider)->first();

        $config = [
            'currency' => strtoupper((string) ($input['currency'] ?? $current['currency'] ?? 'BDT')),
            'timeout_seconds' => max(10, min(120, (int) ($input['timeout_seconds'] ?? $current['timeout_seconds'] ?? 30))),
            'frontend_url' => rtrim((string) ($input['frontend_url'] ?? $current['frontend_url'] ?? config('app.url')), '/'),
        ];

        $credentials = [];
        if ($provider === 'sslcommerz') {
            $credentials['store_id'] = $this->nonBlankOrCurrent($input['store_id'] ?? null, $current['store_id'] ?? null);
            $credentials['store_password'] = $this->nonBlankOrCurrent($input['store_password'] ?? null, $current['store_password'] ?? null);
            $config['allow_risk_level_one'] = (bool) ($input['allow_risk_level_one'] ?? $current['allow_risk_level_one'] ?? false);
        } else {
            $config['base_url'] = rtrim((string) ($input['base_url'] ?? $current['base_url'] ?? ''), '/');
            $credentials['api_key'] = $this->nonBlankOrCurrent($input['api_key'] ?? null, $current['api_key'] ?? null);
        }

        $row = PaymentGatewaySetting::query()->updateOrCreate(
            ['provider' => $provider],
            [
                'display_name' => trim((string) ($input['display_name'] ?? $existing?->display_name ?? $current['display_name'])),
                'enabled' => (bool) ($input['enabled'] ?? $existing?->enabled ?? $current['enabled']),
                'mode' => in_array(($input['mode'] ?? $current['mode']), ['sandbox', 'live'], true)
                    ? ($input['mode'] ?? $current['mode'])
                    : 'live',
                'sort_order' => max(0, (int) ($input['sort_order'] ?? $existing?->sort_order ?? $current['sort_order'] ?? 0)),
                'refunds_enabled' => $provider === 'piprapay'
                    ? (bool) ($input['refunds_enabled'] ?? $existing?->refunds_enabled ?? $current['refunds_enabled'])
                    : false,
                'config' => $config,
                'credentials' => Crypt::encryptString(json_encode($credentials, JSON_UNESCAPED_SLASHES)),
                'updated_by' => $userId,
            ]
        );

        return collect($this->adminRows())->firstWhere('provider', $row->provider) ?? [];
    }

    public function setEnabled(string $provider, bool $enabled, ?int $userId = null): array
    {
        return $this->save($provider, ['enabled' => $enabled], $userId);
    }

    public function configured(string $provider, ?array $config = null): bool
    {
        $config ??= $this->effective($provider);
        if ($provider === 'sslcommerz') {
            return filled($config['store_id'] ?? null) && filled($config['store_password'] ?? null);
        }

        return filled($config['base_url'] ?? null) && filled($config['api_key'] ?? null);
    }

    private function fallback(string $provider): array
    {
        if ($provider === 'sslcommerz') {
            $config = config('payment_gateways.sslcommerz', []);
            return [
                'provider' => 'sslcommerz',
                'display_name' => 'SSLCOMMERZ',
                'enabled' => (bool) ($config['enabled'] ?? false),
                'configured' => filled($config['store_id'] ?? null) && filled($config['store_password'] ?? null),
                'mode' => ($config['sandbox'] ?? true) ? 'sandbox' : 'live',
                'sandbox' => (bool) ($config['sandbox'] ?? true),
                'sort_order' => 10,
                'refunds_enabled' => false,
                'store_id' => $config['store_id'] ?? null,
                'store_password' => $config['store_password'] ?? null,
                'currency' => $config['currency'] ?? 'BDT',
                'allow_risk_level_one' => (bool) ($config['allow_risk_level_one'] ?? false),
                'timeout_seconds' => (int) ($config['timeout_seconds'] ?? 30),
                'frontend_url' => $config['frontend_url'] ?? config('app.url'),
            ];
        }

        $config = config('payment_gateways.piprapay', []);
        return [
            'provider' => 'piprapay',
            'display_name' => $config['display_name'] ?? 'PipraPay',
            'enabled' => (bool) ($config['enabled'] ?? false),
            'configured' => filled($config['base_url'] ?? null) && filled($config['api_key'] ?? null),
            'mode' => 'live',
            'sandbox' => false,
            'sort_order' => (int) ($config['sort_order'] ?? 20),
            'refunds_enabled' => (bool) ($config['refunds_enabled'] ?? false),
            'base_url' => rtrim((string) ($config['base_url'] ?? ''), '/'),
            'api_key' => $config['api_key'] ?? null,
            'currency' => $config['currency'] ?? 'BDT',
            'timeout_seconds' => (int) ($config['timeout_seconds'] ?? 30),
            'frontend_url' => $config['frontend_url'] ?? config('app.url'),
        ];
    }

    private function decryptCredentials(?string $value): array
    {
        if (blank($value)) return [];

        try {
            $decoded = json_decode(Crypt::decryptString($value), true);
            return is_array($decoded) ? $decoded : [];
        } catch (Throwable) {
            return [];
        }
    }

    private function nonBlankOrCurrent(mixed $value, mixed $current): mixed
    {
        return is_string($value) && trim($value) === '' ? $current : ($value ?? $current);
    }

    private function mask(mixed $value): ?string
    {
        $value = (string) ($value ?? '');
        if ($value === '') return null;
        if (strlen($value) <= 6) return str_repeat('•', strlen($value));
        return substr($value, 0, 3) . str_repeat('•', min(12, max(4, strlen($value) - 6))) . substr($value, -3);
    }
}
