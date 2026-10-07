<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Throwable;

/**
 * Writes one row to security_events (the Security Center list) and sends the high/critical alert e-mail.
 * Recording never breaks the request that triggered it.
 */
class SecurityEventService
{
    public function __construct(private AccessControlService $access)
    {
    }

    public function record(Request $request, string $eventType, string $severity, array $details = [], $user = null, ?int $responseCode = null, ?string $dedupeKey = null): ?int
    {
        try {
            if (! Schema::hasTable('security_events')) {
                return null;
            }
            if ($dedupeKey !== null && ! Cache::add('nst:security-event:' . sha1($dedupeKey), 1, now()->addSeconds(60))) {
                return null;
            }

            $user ??= $request->user();
            $id = DB::table('security_events')->insertGetId([
                'user_id' => $user?->id,
                'user_name' => $user?->name,
                'role_name' => implode(',', $this->access->roleNames($user)),
                'event_type' => $eventType,
                'severity' => $severity,
                'status' => in_array($severity, ['high', 'critical'], true) ? 'blocked' : 'open',
                'ip_address' => $request->ip(),
                'user_agent' => mb_substr((string) $request->userAgent(), 0, 1000),
                'url' => mb_substr($request->fullUrl(), 0, 2000),
                'request_method' => $request->method(),
                'response_code' => $responseCode,
                'sanitized_details' => json_encode($this->sanitize($details), JSON_UNESCAPED_UNICODE),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if (in_array($severity, ['high', 'critical'], true)) {
                $this->mailAlert($id, $eventType, $severity, $request, $details);
            }

            return $id;
        } catch (Throwable) {
            return null;
        }
    }

    private function mailAlert(int $id, string $eventType, string $severity, Request $request, array $details): void
    {
        $recipient = trim((string) Setting::getValue('security_alert_email', ''));
        $enabled = filter_var(Setting::getValue('security_high_critical_email_enabled', true), FILTER_VALIDATE_BOOL);
        if (! $enabled || $recipient === '') {
            return;
        }
        $page = (string) ($details['page'] ?? $request->fullUrl());
        Mail::raw(
            "NST security event #{$id}\nType: {$eventType}\nSeverity: {$severity}\nIP: {$request->ip()}\nPage: {$page}\nTime: " . now()->toDateTimeString(),
            fn ($message) => $message->to($recipient)->subject("NST {$severity} security alert")
        );
    }

    private function sanitize(array $details): array
    {
        $blocked = ['password', 'password_confirmation', 'api_key', 'token', 'authorization', 'secret', 'two_factor_secret'];
        $clean = [];
        foreach ($details as $key => $value) {
            if (in_array(strtolower((string) $key), $blocked, true)) {
                $clean[$key] = '[redacted]';
            } elseif (is_array($value)) {
                $clean[$key] = $this->sanitize($value);
            } elseif (is_scalar($value) || $value === null) {
                $clean[$key] = is_string($value) ? mb_substr($value, 0, 1000) : $value;
            }
        }

        return $clean;
    }
}
