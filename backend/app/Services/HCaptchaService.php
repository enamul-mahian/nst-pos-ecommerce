<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Throwable;

class HCaptchaService
{
    public const TEST_SITE_KEY = '10000000-ffff-ffff-ffff-000000000001';
    public const TEST_SECRET_KEY = '0x0000000000000000000000000000000000000000';

    public const FORMS = [
        'admin_login' => 'hcaptcha_admin_login',
        'customer_login' => 'hcaptcha_customer_login',
        'customer_registration' => 'hcaptcha_customer_registration',
        'checkout_registration' => 'hcaptcha_checkout_registration',
        'supplier_login' => 'hcaptcha_supplier_login',
    ];

    public function publicConfig(string $form): array
    {
        $testMode = $this->boolean('hcaptcha_test_mode', false);
        $siteKey = $testMode ? self::TEST_SITE_KEY : trim((string) $this->value('hcaptcha_site_key', ''));
        $enabled = $this->isEnabledFor($form) && $siteKey !== '' && ($testMode || $this->secretKey() !== '');

        return [
            'enabled' => $enabled,
            'site_key' => $enabled ? $siteKey : '',
            'form' => $form,
            'test_mode' => $testMode,
        ];
    }

    public function verify(Request $request, string $form): void
    {
        if (! $this->isEnabledFor($form)) {
            return;
        }

        $testMode = $this->boolean('hcaptcha_test_mode', false);
        $siteKey = $testMode ? self::TEST_SITE_KEY : trim((string) $this->value('hcaptcha_site_key', ''));
        $secret = $testMode ? self::TEST_SECRET_KEY : $this->secretKey();

        if ($siteKey === '' || $secret === '') {
            throw ValidationException::withMessages([
                'hcaptcha_token' => 'hCaptcha is enabled but its site key or secret key is not configured in POS Security Center.',
            ]);
        }

        $token = trim((string) ($request->input('hcaptcha_token') ?: $request->input('h-captcha-response')));
        if ($token === '') {
            throw ValidationException::withMessages([
                'hcaptcha_token' => 'Please complete the hCaptcha verification.',
            ]);
        }

        try {
            $response = Http::asForm()
                ->acceptJson()
                ->timeout(12)
                ->retry(1, 250)
                ->post('https://api.hcaptcha.com/siteverify', [
                    'secret' => $secret,
                    'response' => $token,
                    'remoteip' => $request->ip(),
                    'sitekey' => $siteKey,
                ]);

            $payload = $response->json();
            if (! $response->successful() || ! is_array($payload) || ! ($payload['success'] ?? false)) {
                throw ValidationException::withMessages([
                    'hcaptcha_token' => 'hCaptcha verification failed. Please try again.',
                ]);
            }
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (Throwable $exception) {
            report($exception);
            throw ValidationException::withMessages([
                'hcaptcha_token' => 'hCaptcha verification service is temporarily unavailable. Please try again.',
            ]);
        }
    }

    public function isEnabledFor(string $form): bool
    {
        if (! $this->boolean('hcaptcha_enabled', false)) {
            return false;
        }

        $key = self::FORMS[$form] ?? null;

        // Staff login stays off until it is switched on, so a wrong key can never lock the POS out by default.
        return $key ? $this->boolean($key, $form !== 'admin_login') : false;
    }

    public function secretConfigured(): bool
    {
        return $this->secretKey() !== '';
    }

    private function secretKey(): string
    {
        $encrypted = trim((string) $this->value('hcaptcha_secret_key', ''));
        if ($encrypted === '') {
            return '';
        }

        try {
            return (string) Crypt::decryptString($encrypted);
        } catch (Throwable) {
            return '';
        }
    }

    private function boolean(string $key, bool $default): bool
    {
        $value = $this->value($key, $default ? '1' : '0');
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }

    private function value(string $key, mixed $default = null): mixed
    {
        if (! Schema::hasTable('settings')) {
            return $default;
        }

        return Setting::getValue($key, $default);
    }
}
