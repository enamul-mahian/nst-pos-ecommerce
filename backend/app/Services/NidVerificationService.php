<?php

namespace App\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class NidVerificationService
{
    private const TOKEN_EXPIRY_BUFFER_SECONDS = 90;

    public function create(array $data, int $userId): object
    {
        $provider = $this->activeProvider();
        $customData = $this->validateCustomData($data['custom_data'] ?? []);
        $uuid = (string) Str::uuid();

        $id = DB::table('nid_verification_logs')->insertGetId([
            'request_uuid' => $uuid,
            'provider_id' => $provider?->id,
            'nid_number' => preg_replace('/\s+/', '', (string) $data['nid_number']),
            'date_of_birth' => $data['date_of_birth'],
            'status' => 'queued',
            'api_response' => json_encode([
                'workflow' => 'provider_independent',
                'state' => 'queued',
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'custom_data' => $this->encryptArray($customData),
            'short_note' => $data['short_note'] ?? null,
            'consent_at' => now(),
            'checked_by' => $userId,
            'updated_by' => $userId,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->process($id, $userId);

        return DB::table('nid_verification_logs')->where('id', $id)->first();
    }

    public function process(int $verificationId, int $userId): object
    {
        $row = DB::table('nid_verification_logs')->where('id', $verificationId)->first();
        if (! $row) {
            throw new RuntimeException('NID verification request was not found.');
        }

        if (in_array($row->status, ['verified', 'rejected', 'cancelled'], true)) {
            return $row;
        }

        $provider = $row->provider_id
            ? DB::table('nid_verification_providers')->where('id', $row->provider_id)->first()
            : $this->activeProvider();

        if (! $provider || ! $provider->is_active) {
            return $this->setState($row->id, 'configuration_required', [
                'error_code' => 'provider_not_configured',
                'error_message' => 'An authorized NID verification provider has not been activated.',
                'updated_by' => $userId,
            ]);
        }

        if ($provider->mode === 'manual') {
            return $this->setState($row->id, 'manual_review', [
                'provider_id' => $provider->id,
                'error_code' => null,
                'error_message' => null,
                'updated_by' => $userId,
            ]);
        }

        if ($provider->mode !== 'official_api') {
            return $this->setState($row->id, 'configuration_required', [
                'error_code' => 'unsupported_provider_mode',
                'error_message' => 'The selected provider mode is not supported.',
                'updated_by' => $userId,
            ]);
        }

        if (! $this->tokenIsUsable($provider)) {
            return $this->setState($row->id, 'auth_required', [
                'provider_id' => $provider->id,
                'auth_required_at' => now(),
                'error_code' => 'provider_auth_required',
                'error_message' => 'Provider authentication expired. Complete the provider CAPTCHA/login, save a new access token, then resume this saved request.',
                'updated_by' => $userId,
            ]);
        }

        $customData = $this->decryptArray($row->custom_data);
        $providerCustomData = $this->providerCustomData($customData);
        $payload = $this->buildPayload($provider, $row, $providerCustomData);
        $requestUrl = $this->replacePlaceholders((string) $provider->api_url, $row, $providerCustomData);
        $this->assertAllowedHttpsUrl($requestUrl);

        DB::table('nid_verification_logs')->where('id', $row->id)->update([
            'provider_id' => $provider->id,
            'status' => 'processing',
            'started_at' => $row->started_at ?: now(),
            'last_attempt_at' => now(),
            'retry_count' => DB::raw('retry_count + 1'),
            'request_payload' => $this->encryptArray($this->redactPayload($payload)),
            'error_code' => null,
            'error_message' => null,
            'updated_by' => $userId,
            'updated_at' => now(),
        ]);

        try {
            $response = $this->sendRequest($provider, $requestUrl, $payload);
            $decoded = $response->json();
            $responseData = is_array($decoded) ? $decoded : ['raw' => Str::limit((string) $response->body(), 20000, '')];

            if (in_array($response->status(), [401, 403], true) || $this->responseLooksLikeExpiredToken($responseData)) {
                return $this->setState($row->id, 'auth_required', [
                    'response_payload' => $this->encryptArray($responseData),
                    'auth_required_at' => now(),
                    'error_code' => 'provider_token_expired',
                    'error_message' => 'Provider rejected the access token. Complete the provider CAPTCHA/login and save a new token; the NID request remains saved.',
                    'updated_by' => $userId,
                ]);
            }

            if (! $response->successful()) {
                return $this->setState($row->id, 'failed', [
                    'response_payload' => $this->encryptArray($responseData),
                    'error_code' => 'provider_http_' . $response->status(),
                    'error_message' => 'The authorized provider returned HTTP ' . $response->status() . '.',
                    'updated_by' => $userId,
                ]);
            }

            $mapped = $this->mapResponse($provider, $responseData);
            $verified = $this->isSuccessfulResponse($provider, $responseData);

            return $this->setState($row->id, $verified ? 'verified' : 'manual_review', [
                'response_payload' => $this->encryptArray($responseData),
                'mapped_result' => $this->encryptArray($mapped),
                'completed_at' => $verified ? now() : null,
                'auth_required_at' => null,
                'error_code' => $verified ? null : 'provider_result_requires_review',
                'error_message' => $verified ? null : 'Provider response was received but requires operator review.',
                'updated_by' => $userId,
            ]);
        } catch (ConnectionException $exception) {
            return $this->setState($row->id, 'failed', [
                'error_code' => 'provider_connection_failed',
                'error_message' => 'Could not connect to the authorized provider.',
                'updated_by' => $userId,
            ]);
        } catch (Throwable $exception) {
            report($exception);
            return $this->setState($row->id, 'failed', [
                'error_code' => 'verification_processing_failed',
                'error_message' => 'The verification request could not be completed safely.',
                'updated_by' => $userId,
            ]);
        }
    }

    public function resumePending(int $providerId, int $userId, int $limit = 10): array
    {
        $ids = DB::table('nid_verification_logs')
            ->where('provider_id', $providerId)
            ->whereIn('status', ['auth_required', 'queued', 'failed', 'configuration_required'])
            ->orderBy('id')
            ->limit(max(1, min($limit, 25)))
            ->pluck('id');

        $summary = ['attempted' => 0, 'verified' => 0, 'auth_required' => 0, 'manual_review' => 0, 'failed' => 0];
        foreach ($ids as $id) {
            $summary['attempted']++;
            DB::table('nid_verification_logs')->where('id', $id)->update([
                'resumed_by' => $userId,
                'updated_by' => $userId,
                'updated_at' => now(),
            ]);
            $result = $this->process((int) $id, $userId);
            $status = (string) $result->status;
            if (array_key_exists($status, $summary)) {
                $summary[$status]++;
            } else {
                $summary['failed']++;
            }
        }

        return $summary;
    }

    public function saveManualResult(int $verificationId, string $decision, array $result, ?string $note, int $userId): object
    {
        $row = DB::table('nid_verification_logs')->where('id', $verificationId)->first();
        if (! $row) {
            throw new RuntimeException('NID verification request was not found.');
        }

        return $this->setState($verificationId, $decision, [
            'mapped_result' => $this->encryptArray($result),
            'short_note' => $note ?: $row->short_note,
            'completed_at' => now(),
            'error_code' => null,
            'error_message' => null,
            'updated_by' => $userId,
        ]);
    }

    public function formatRecord(object $row, bool $includeDetails = false): array
    {
        $nid = preg_replace('/\D+/', '', (string) $row->nid_number);
        $masked = strlen($nid) > 4 ? str_repeat('•', max(0, strlen($nid) - 4)) . substr($nid, -4) : $nid;

        $data = [
            'id' => $row->id,
            'request_uuid' => $row->request_uuid,
            'nid_number' => $includeDetails ? $row->nid_number : $masked,
            'nid_masked' => $masked,
            'date_of_birth' => $row->date_of_birth,
            'status' => $row->status,
            'short_note' => $row->short_note,
            'provider_id' => $row->provider_id,
            'provider_name' => $row->provider_name ?? null,
            'error_code' => $row->error_code,
            'error_message' => $row->error_message,
            'retry_count' => (int) ($row->retry_count ?? 0),
            'consent_at' => $row->consent_at,
            'last_attempt_at' => $row->last_attempt_at,
            'auth_required_at' => $row->auth_required_at,
            'completed_at' => $row->completed_at,
            'created_at' => $row->created_at,
            'updated_at' => $row->updated_at,
        ];

        if ($includeDetails) {
            $data['custom_data'] = $this->decryptArray($row->custom_data);
            $data['mapped_result'] = $this->decryptArray($row->mapped_result);
        }

        return $data;
    }

    public function decryptArray(?string $value): array
    {
        if (! $value) {
            return [];
        }
        try {
            $decoded = json_decode(Crypt::decryptString($value), true);
            return is_array($decoded) ? $decoded : [];
        } catch (Throwable) {
            $decoded = json_decode($value, true);
            return is_array($decoded) ? $decoded : [];
        }
    }

    private function activeProvider(): ?object
    {
        return DB::table('nid_verification_providers')->where('is_active', true)->orderBy('id')->first();
    }

    private function validateCustomData(array $input): array
    {
        $definitions = DB::table('nid_verification_fields')->where('is_active', true)->orderBy('sort_order')->get();
        $normalized = [];

        foreach ($definitions as $field) {
            $value = $input[$field->field_key] ?? null;
            if ($field->is_required && ($value === null || $value === '')) {
                throw new RuntimeException("Custom field is required: {$field->label}");
            }
            if ($value !== null && $value !== '') {
                $normalized[$field->field_key] = $this->normalizeCustomValue($field->field_type, $value, $field->options);
            }
        }

        foreach ($input as $key => $value) {
            $safeKey = preg_replace('/[^a-zA-Z0-9_.-]+/', '_', trim((string) $key));
            if ($safeKey !== '' && ! array_key_exists($safeKey, $normalized)) {
                $normalized[$safeKey] = is_scalar($value) || $value === null ? $value : json_encode($value, JSON_UNESCAPED_UNICODE);
            }
        }

        return $normalized;
    }

    private function normalizeCustomValue(string $type, mixed $value, ?string $options): mixed
    {
        return match ($type) {
            'number' => is_numeric($value) ? (float) $value : throw new RuntimeException('A custom number field contains an invalid value.'),
            'checkbox' => filter_var($value, FILTER_VALIDATE_BOOLEAN),
            'date' => preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $value) ? (string) $value : throw new RuntimeException('A custom date field contains an invalid value.'),
            'select' => $this->normalizeSelect($value, $options),
            'json' => $this->normalizeJson($value),
            default => Str::limit(trim((string) $value), 5000, ''),
        };
    }

    private function normalizeSelect(mixed $value, ?string $options): string
    {
        $allowed = json_decode((string) $options, true);
        $allowed = is_array($allowed) ? array_map('strval', $allowed) : [];
        $value = (string) $value;
        if ($allowed !== [] && ! in_array($value, $allowed, true)) {
            throw new RuntimeException('A custom select field contains an invalid option.');
        }
        return $value;
    }

    private function normalizeJson(mixed $value): array
    {
        if (is_array($value)) {
            return $value;
        }
        $decoded = json_decode((string) $value, true);
        if (! is_array($decoded)) {
            throw new RuntimeException('A custom JSON field contains invalid JSON.');
        }
        return $decoded;
    }

    private function providerCustomData(array $customData): array
    {
        $definitions = DB::table('nid_verification_fields')->where('is_active', true)->get()->keyBy('field_key');
        $result = [];
        foreach ($customData as $key => $value) {
            $definition = $definitions->get($key);
            if ($definition && (! $definition->send_to_provider || $definition->internal_only)) {
                continue;
            }
            $result[$key] = $value;
        }
        return $result;
    }

    private function buildPayload(object $provider, object $row, array $customData): array
    {
        $template = json_decode((string) $provider->request_template, true);
        if (! is_array($template)) {
            $template = ['nid' => '{{nid_number}}', 'date_of_birth' => '{{date_of_birth}}'];
        }
        return $this->replaceInValue($template, $row, $customData);
    }

    private function replaceInValue(mixed $value, object $row, array $customData): mixed
    {
        if (is_array($value)) {
            $result = [];
            foreach ($value as $key => $item) {
                $result[$key] = $this->replaceInValue($item, $row, $customData);
            }
            return $result;
        }
        if (! is_string($value)) {
            return $value;
        }
        if (preg_match('/^\{\{custom\.([^}]+)}}$/', $value, $matches)) {
            return data_get($customData, $matches[1]);
        }
        return $this->replacePlaceholders($value, $row, $customData);
    }

    private function replacePlaceholders(string $value, object $row, array $customData): string
    {
        $value = str_replace(
            ['{{nid_number}}', '{{date_of_birth}}', '{{request_uuid}}'],
            [(string) $row->nid_number, (string) $row->date_of_birth, (string) $row->request_uuid],
            $value
        );
        return preg_replace_callback('/\{\{custom\.([^}]+)}}/', fn (array $matches): string => (string) (data_get($customData, $matches[1]) ?? ''), $value) ?? $value;
    }

    private function sendRequest(object $provider, string $url, array $payload)
    {
        $headers = json_decode((string) $provider->request_headers, true);
        $headers = is_array($headers) ? $headers : [];
        $token = $this->decryptToken($provider->access_token);
        if ($provider->auth_type !== 'none' && $token !== '') {
            $header = trim((string) $provider->auth_header) ?: 'Authorization';
            $scheme = trim((string) $provider->auth_scheme);
            $headers[$header] = trim(($scheme !== '' ? $scheme . ' ' : '') . $token);
        }

        $request = Http::timeout(max(5, min((int) $provider->timeout_seconds, 60)))
            ->connectTimeout(10)
            ->acceptJson()
            ->withHeaders($headers);

        $method = strtoupper((string) $provider->http_method);
        $format = (string) $provider->request_format;

        if ($method === 'GET') {
            return $request->get($url, $payload);
        }
        if ($format === 'form') {
            $request = $request->asForm();
        }
        return $request->send($method, $url, [$format === 'form' ? 'form_params' : 'json' => $payload]);
    }

    private function mapResponse(object $provider, array $response): array
    {
        $mapping = json_decode((string) $provider->response_mapping, true);
        if (! is_array($mapping) || $mapping === []) {
            return $response;
        }
        $result = [];
        foreach ($mapping as $outputKey => $path) {
            if (is_string($outputKey) && is_string($path)) {
                $result[$outputKey] = data_get($response, $path);
            }
        }
        return $result;
    }

    private function isSuccessfulResponse(object $provider, array $response): bool
    {
        $path = trim((string) $provider->success_path);
        if ($path === '') {
            return true;
        }
        $actual = data_get($response, $path);
        $allowed = json_decode((string) $provider->success_values, true);
        $allowed = is_array($allowed) ? array_map(fn ($value): string => strtolower((string) $value), $allowed) : ['true', 'success', 'verified', 'valid', '1'];
        return in_array(strtolower(is_bool($actual) ? ($actual ? 'true' : 'false') : (string) $actual), $allowed, true);
    }

    private function responseLooksLikeExpiredToken(array $response): bool
    {
        $text = strtolower(json_encode($response, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '');
        foreach (['token expired', 'expired token', 'invalid_token', 'invalid token', 'authentication required', 'unauthorized'] as $needle) {
            if (str_contains($text, $needle)) {
                return true;
            }
        }
        return false;
    }

    private function tokenIsUsable(object $provider): bool
    {
        if ($provider->auth_type === 'none') {
            return true;
        }
        if ($this->decryptToken($provider->access_token) === '') {
            return false;
        }
        if (! $provider->token_expires_at) {
            return true;
        }
        return now()->addSeconds(self::TOKEN_EXPIRY_BUFFER_SECONDS)->lt($provider->token_expires_at);
    }

    private function decryptToken(?string $value): string
    {
        if (! $value) {
            return '';
        }
        try {
            return Crypt::decryptString($value);
        } catch (Throwable) {
            return '';
        }
    }

    private function encryptArray(array $value): string
    {
        return Crypt::encryptString(json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR));
    }

    private function setState(int $id, string $status, array $values): object
    {
        $apiResponse = [
            'workflow' => 'provider_independent',
            'state' => $status,
            'error_code' => $values['error_code'] ?? null,
            'message' => $values['error_message'] ?? null,
        ];
        $values['status'] = $status;
        $values['api_response'] = json_encode($apiResponse, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $values['updated_at'] = now();
        DB::table('nid_verification_logs')->where('id', $id)->update($values);
        return DB::table('nid_verification_logs')->where('id', $id)->first();
    }

    private function redactPayload(array $payload): array
    {
        $blocked = ['token', 'access_token', 'authorization', 'password', 'secret', 'api_key'];
        foreach ($payload as $key => $value) {
            if (in_array(strtolower((string) $key), $blocked, true)) {
                $payload[$key] = '[redacted]';
            } elseif (is_array($value)) {
                $payload[$key] = $this->redactPayload($value);
            }
        }
        return $payload;
    }

    private function assertAllowedHttpsUrl(string $url): void
    {
        $parts = parse_url($url);
        if (($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])) {
            throw new RuntimeException('Provider API URL must be a valid HTTPS URL.');
        }
        $host = (string) $parts['host'];
        $resolved = gethostbyname($host);
        if (filter_var($resolved, FILTER_VALIDATE_IP) && ! filter_var($resolved, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw new RuntimeException('Provider API URL resolves to a private or reserved address.');
        }
    }
}
