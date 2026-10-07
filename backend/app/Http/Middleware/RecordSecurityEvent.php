<?php

namespace App\Http\Middleware;

use App\Models\Setting;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class RecordSecurityEvent
{
    public function handle(Request $request, Closure $next): Response
    {
        try {
            $response = $next($request);
        } catch (Throwable $exception) {
            $this->record($request, 'application_exception', 'high', 500, [
                'exception' => class_basename($exception),
                'message' => mb_substr($exception->getMessage(), 0, 500),
            ]);
            throw $exception;
        }

        $status = $response->getStatusCode();
        if (in_array($status, [401, 403, 419, 429], true)) {
            $type = match ($status) {
                401 => 'unauthorized_api_request',
                403 => 'forbidden_route_access',
                419 => 'csrf_authentication_failure',
                429 => 'rate_limit_abuse',
            };
            $severity = $status === 429 ? 'high' : 'medium';
            $this->record($request, $type, $severity, $status);
        }

        if ($request->isMethod('post') && count($request->allFiles()) > 0) {
            foreach ($this->flattenFiles($request->allFiles()) as $file) {
                $extension = strtolower((string) $file->getClientOriginalExtension());
                if (in_array($extension, ['php', 'phtml', 'phar', 'exe', 'bat', 'cmd', 'sh'], true)) {
                    $this->record($request, 'suspicious_upload', 'critical', $status, ['extension' => $extension]);
                }
            }
        }

        return $response;
    }


    private function flattenFiles(array $files): array
    {
        $flattened = [];
        array_walk_recursive($files, function ($file) use (&$flattened): void {
            if (is_object($file) && method_exists($file, 'getClientOriginalExtension')) {
                $flattened[] = $file;
            }
        });

        return $flattened;
    }

    private function record(Request $request, string $eventType, string $severity, int $responseCode, array $details = []): void
    {
        try {
            if (! Schema::hasTable('security_events')) {
                return;
            }

            $user = $request->user();
            $roles = [];
            if ($user && method_exists($user, 'getRoleNames')) {
                $roles = $user->getRoleNames()->all();
            }

            $id = DB::table('security_events')->insertGetId([
                'user_id' => $user?->id,
                'user_name' => $user?->name,
                'role_name' => implode(',', $roles),
                'event_type' => $eventType,
                'severity' => $severity,
                'status' => in_array($severity, ['high', 'critical'], true) ? 'blocked' : 'open',
                'ip_address' => $request->ip(),
                'user_agent' => mb_substr((string) $request->userAgent(), 0, 1000),
                'url' => mb_substr($request->fullUrl(), 0, 2000),
                'request_method' => $request->method(),
                'response_code' => $responseCode,
                'sanitized_details' => json_encode($this->sanitize($details + [
                    'route' => optional($request->route())->getName(),
                    'input_keys' => array_keys($request->except(['password', 'password_confirmation', 'api_key', 'token', 'secret'])),
                ]), JSON_UNESCAPED_UNICODE),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if (in_array($severity, ['high', 'critical'], true)) {
                $recipient = Schema::hasTable('settings') ? trim((string) Setting::getValue('security_alert_email', '')) : '';
                $enabled = Schema::hasTable('settings') ? filter_var(Setting::getValue('security_high_critical_email_enabled', true), FILTER_VALIDATE_BOOL) : false;
                if ($enabled && $recipient !== '') {
                    Mail::raw(
                        "NST security event #{$id}\nType: {$eventType}\nSeverity: {$severity}\nIP: {$request->ip()}\nURL: {$request->fullUrl()}\nResponse: {$responseCode}",
                        fn ($message) => $message->to($recipient)->subject("NST {$severity} security alert")
                    );
                }
            }
        } catch (Throwable) {
            // Security logging must never interrupt the original request.
        }
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
