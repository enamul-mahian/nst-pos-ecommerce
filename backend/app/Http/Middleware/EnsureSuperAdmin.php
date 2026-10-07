<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'success' => false,
                'message' => 'Unauthenticated.',
            ], 401);
        }

        $superAdminRoles = [
            'super_admin',
            'super admin',
            'Super Admin',
            'SUPER_ADMIN',
        ];

        if (method_exists($user, 'hasAnyRole') && $user->hasAnyRole($superAdminRoles)) {
            return $next($request);
        }

        if (method_exists($user, 'hasRole')) {
            foreach ($superAdminRoles as $role) {
                if ($user->hasRole($role)) {
                    return $next($request);
                }
            }
        }

        if (isset($user->role) && in_array($user->role, $superAdminRoles)) {
            return $next($request);
        }

        if (isset($user->user_type) && in_array($user->user_type, $superAdminRoles)) {
            return $next($request);
        }

        if (isset($user->type) && in_array($user->type, $superAdminRoles)) {
            return $next($request);
        }

        if (isset($user->roles)) {
            $roles = $user->roles;

            if (is_string($roles) && in_array($roles, $superAdminRoles)) {
                return $next($request);
            }

            if (is_array($roles)) {
                foreach ($roles as $role) {
                    if (is_string($role) && in_array($role, $superAdminRoles)) {
                        return $next($request);
                    }

                    if (is_array($role) && isset($role['name']) && in_array($role['name'], $superAdminRoles)) {
                        return $next($request);
                    }

                    if (is_object($role) && isset($role->name) && in_array($role->name, $superAdminRoles)) {
                        return $next($request);
                    }
                }
            }

            if (is_object($roles) && method_exists($roles, 'pluck')) {
                $roleNames = $roles->pluck('name')->toArray();

                foreach ($roleNames as $roleName) {
                    if (in_array($roleName, $superAdminRoles)) {
                        return $next($request);
                    }
                }
            }
        }

        return response()->json([
            'success' => false,
            'message' => 'Only Super Admin can delete records.',
        ], 403);
    }
}