<?php

namespace App\Http\Middleware;

use App\Models\Supplier;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class EnsureSupplierPortalUser
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user) {
            return response()->json(['status' => false, 'message' => 'Unauthenticated supplier session.'], 401);
        }

        $token = $user->currentAccessToken();
        if ($token && method_exists($token, 'can') && ! $token->can('supplier-portal')) {
            return response()->json(['status' => false, 'message' => 'This token is not valid for the Supplier Portal.'], 403);
        }

        $isSupplier = Str::lower((string) ($user->profile_type ?? '')) === 'supplier';
        try {
            $isSupplier = $isSupplier || (method_exists($user, 'hasRole') && $user->hasRole('supplier'));
        } catch (Throwable) {
            // Profile linkage is checked below.
        }

        $supplier = null;
        if (Schema::hasTable('suppliers')) {
            if (! empty($user->supplier_id)) {
                $supplier = Supplier::query()->find($user->supplier_id);
            }
            $supplier ??= Supplier::query()->where('user_id', $user->id)->first();
        }

        if (! $isSupplier || ! $supplier) {
            return response()->json(['status' => false, 'message' => 'A registered supplier account is required.'], 403);
        }
        if (Schema::hasColumn('suppliers', 'portal_enabled') && ! $supplier->portal_enabled) {
            return response()->json(['status' => false, 'message' => 'Supplier Portal access is disabled for this supplier.'], 403);
        }
        if (! in_array(Str::lower((string) $supplier->status), ['active', 'enabled'], true)) {
            return response()->json(['status' => false, 'message' => 'This supplier account is inactive.'], 403);
        }

        $request->attributes->set('nst_supplier', $supplier);
        return $next($request);
    }
}
