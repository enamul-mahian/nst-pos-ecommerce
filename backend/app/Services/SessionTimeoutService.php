<?php

namespace App\Services;

use App\Models\Setting;
use App\Models\User;

class SessionTimeoutService
{
    public const ALLOWED = [0, 5, 10, 20];

    public function policy(): array
    {
        $raw = Setting::getValue('session_security_policy', null);
        $decoded = is_string($raw) ? json_decode($raw, true) : (is_array($raw) ? $raw : []);
        $decoded = is_array($decoded) ? $decoded : [];
        return [
            'global_minutes' => $this->normalize($decoded['global_minutes'] ?? 20, 20),
            'role_minutes' => is_array($decoded['role_minutes'] ?? null) ? $decoded['role_minutes'] : [],
        ];
    }

    public function effectiveMinutes(?User $user): int
    {
        if (! $user) return 20;
        $access = app(AccessControlService::class)->userAccess($user);
        $override = data_get($access, 'dashboard_permissions.session_timeout_minutes');
        if ($override !== null && $override !== '') return $this->normalize($override, 20);
        $policy = $this->policy();
        foreach (app(AccessControlService::class)->roleNames($user) as $role) {
            if (array_key_exists($role, $policy['role_minutes'])) {
                return $this->normalize($policy['role_minutes'][$role], $policy['global_minutes']);
            }
        }
        return $policy['global_minutes'];
    }

    private function normalize(mixed $value, int $fallback): int
    {
        $minutes = (int) $value;
        return in_array($minutes, self::ALLOWED, true) ? $minutes : $fallback;
    }
}
