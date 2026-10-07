<?php

namespace App\Http\Middleware;

use App\Models\Customer;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class EnsurePosStaff
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            abort(401, 'Unauthenticated.');
        }

        $profileType = Str::lower((string) ($user->profile_type ?? ''));
        $isCustomer = $profileType === 'customer';
        if (! $isCustomer && Schema::hasTable('customers')) {
            $isCustomer = Customer::query()->where('user_id', $user->id)->exists();
        }
        if (! $isCustomer && Schema::hasColumn('users', 'customer_id')) {
            $isCustomer = ! empty($user->customer_id);
        }
        try {
            $isCustomer = $isCustomer || (method_exists($user, 'hasRole') && $user->hasRole('customer'));
        } catch (Throwable) {
            // Existing profile and customer relations remain the source of truth.
        }

        $isSupplier = $profileType === 'supplier';
        try {
            $isSupplier = $isSupplier || (method_exists($user, 'hasRole') && $user->hasRole('supplier'));
        } catch (Throwable) {
            // Existing profile type remains the source of truth.
        }

        if ($isCustomer || $isSupplier) {
            return response()->json([
                'status' => false,
                'message' => 'Customer and supplier accounts cannot access the POS API.',
            ], 403);
        }

        return $next($request);
    }
}
