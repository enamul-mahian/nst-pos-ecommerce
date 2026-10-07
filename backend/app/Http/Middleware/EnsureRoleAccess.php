<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRoleAccess
{
    public function handle(Request $request, Closure $next, string ...$allowedRoles): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
            ], 401);
        }

        $normalizedAllowedRoles = collect($allowedRoles)
            ->map(fn ($role) => $this->normalizeRole($role))
            ->filter()
            ->values()
            ->toArray();

        $userRoles = [];

        if (method_exists($user, 'getRoleNames')) {
            $userRoles = array_merge($userRoles, $user->getRoleNames()->toArray());
        }

        foreach (['role', 'user_type', 'type', 'profile_type'] as $field) {
            if (!empty($user->{$field})) {
                $userRoles[] = $user->{$field};
            }
        }

        foreach ($userRoles as $role) {
            if (in_array($this->normalizeRole($role), $normalizedAllowedRoles, true)) {
                return $next($request);
            }
        }

        return response()->json([
            'success' => false,
            'message' => 'You are not allowed to access this module.',
        ], 403);
    }

    private function normalizeRole(?string $role): string
    {
        return str_replace([' ', '-'], '_', strtolower(trim((string) $role)));
    }
}
