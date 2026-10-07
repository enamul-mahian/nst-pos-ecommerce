<?php

namespace App\Http\Middleware;

use App\Models\AuditLog;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\Response;

class RecordAuditLog
{
    private array $writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

    private array $sensitiveKeys = [
        'password',
        'password_confirmation',
        'current_password',
        'new_password',
        'token',
        'api_token',
        'access_token',
        'authorization',
        'temporary_password',
        'remember_token',
        'fingerprint_data',
        'fingerprint',
        'nid_photo',
        'image',
        'photo',
        'file',
        'attachment',
    ];

    public function handle(Request $request, Closure $next): Response
    {
        $startedAt = microtime(true);
        $response = $next($request);

        $this->record($request, $response, $startedAt);

        return $response;
    }

    private function record(Request $request, Response $response, float $startedAt): void
    {
        try {
            if (!$this->shouldRecord($request)) {
                return;
            }

            if (!Schema::hasTable('audit_logs')) {
                return;
            }

            $user = $request->user();
            $roles = $this->extractRoles($user);
            $path = ltrim($request->path(), '/');
            $module = $this->moduleFromPath($path);
            $action = $this->actionFromRequest($request, $module);
            [$modelType, $modelId] = $this->modelInfoFromRoute($request, $module);
            $statusCode = method_exists($response, 'getStatusCode') ? (int) $response->getStatusCode() : null;

            AuditLog::create([
                'user_id' => $user?->id,
                'branch_id' => $user?->branch_id,
                'user_name' => $user?->name,
                'user_email' => $user?->email,
                'roles' => $roles,
                'action' => $action,
                'method' => $request->method(),
                'path' => $path,
                'route_name' => $request->route()?->getName(),
                'module' => $module,
                'model_type' => $modelType,
                'model_id' => $modelId,
                'description' => $this->description($request, $action, $module, $modelId, $statusCode),
                'status_code' => $statusCode,
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 1000),
                'request_payload' => $this->safePayload($request),
                'response_payload' => $this->responsePayload($response),
                'meta' => [
                    'duration_ms' => round((microtime(true) - $startedAt) * 1000, 2),
                    'url' => $request->fullUrl(),
                    'referer' => $request->headers->get('referer'),
                ],
            ]);
        } catch (\Throwable $exception) {
            report($exception);
        }
    }

    private function shouldRecord(Request $request): bool
    {
        if (!in_array($request->method(), $this->writeMethods, true)) {
            return false;
        }

        $path = ltrim($request->path(), '/');

        if (str_starts_with($path, 'api/audit-logs') || str_starts_with($path, 'audit-logs')) {
            return false;
        }

        if (str_contains($path, 'sanctum/csrf-cookie')) {
            return false;
        }

        return true;
    }

    private function extractRoles($user): array
    {
        if (!$user || !method_exists($user, 'getRoleNames')) {
            return [];
        }

        return $user->getRoleNames()->values()->toArray();
    }

    private function moduleFromPath(string $path): string
    {
        $path = preg_replace('/^api\//', '', $path) ?? $path;
        $segment = explode('/', trim($path, '/'))[0] ?? 'system';

        return str_replace('-', '_', $segment ?: 'system');
    }

    private function actionFromRequest(Request $request, string $module): string
    {
        $method = $request->method();
        $path = strtolower($request->path());

        $specialActions = [
            'return' => 'return',
            'cancel' => 'cancel',
            'approve' => 'approve',
            'reject' => 'reject',
            'receive-due' => 'receive_due',
            'pay-due' => 'pay_due',
            'recalculate' => 'recalculate',
            'receive' => 'receive',
            'complete' => 'complete',
            'confirm' => 'confirm',
            'generate-barcode' => 'generate_barcode',
            'mark-printed' => 'mark_printed',
            'assign-stock' => 'assign_stock',
            'change-password' => 'change_password',
            'logout' => 'logout',
        ];

        foreach ($specialActions as $needle => $action) {
            if (str_contains($path, $needle)) {
                return $module . '.' . $action;
            }
        }

        return match ($method) {
            'POST' => $module . '.create',
            'PUT', 'PATCH' => $module . '.update',
            'DELETE' => $module . '.delete',
            default => $module . '.write',
        };
    }

    private function modelInfoFromRoute(Request $request, string $module): array
    {
        $parameters = $request->route()?->parameters() ?? [];

        foreach ($parameters as $key => $value) {
            if (is_object($value) && method_exists($value, 'getKey')) {
                return [class_basename($value), (string) $value->getKey()];
            }

            if (is_numeric($value) || is_string($value)) {
                return [str($key)->studly()->toString(), (string) $value];
            }
        }

        return [str($module)->singular()->studly()->toString(), null];
    }

    private function safePayload(Request $request): array
    {
        $payload = $request->except($this->sensitiveKeys);

        return $this->maskSensitiveRecursive($payload);
    }

    private function maskSensitiveRecursive(array $payload): array
    {
        foreach ($payload as $key => $value) {
            $lowerKey = strtolower((string) $key);

            foreach ($this->sensitiveKeys as $sensitiveKey) {
                if (str_contains($lowerKey, strtolower($sensitiveKey))) {
                    $payload[$key] = '[hidden]';
                    continue 2;
                }
            }

            if (is_array($value)) {
                $payload[$key] = $this->maskSensitiveRecursive($value);
            }
        }

        return $payload;
    }

    private function responsePayload(?Response $response): ?array
    {
        if (!$response || !method_exists($response, 'getStatusCode')) {
            return null;
        }

        $statusCode = (int) $response->getStatusCode();

        if ($statusCode < 400) {
            return null;
        }

        $contentType = (string) $response->headers->get('Content-Type');

        if (!str_contains($contentType, 'application/json')) {
            return ['message' => 'Non JSON error response.', 'status_code' => $statusCode];
        }

        $decoded = json_decode($response->getContent(), true);

        if (!is_array($decoded)) {
            return ['message' => 'Invalid JSON response.', 'status_code' => $statusCode];
        }

        return array_intersect_key($decoded, array_flip(['success', 'status', 'message', 'errors']));
    }

    private function description(Request $request, string $action, string $module, ?string $modelId, ?int $statusCode): string
    {
        $status = $statusCode && $statusCode >= 400 ? 'failed' : 'completed';
        $target = $modelId ? "#{$modelId}" : 'record';

        return ucfirst(str_replace('_', ' ', $module)) . " {$target} {$action} {$status}.";
    }
}
