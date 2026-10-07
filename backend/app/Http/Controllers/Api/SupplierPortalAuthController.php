<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Models\User;
use App\Services\HCaptchaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class SupplierPortalAuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'login' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
            'hcaptcha_token' => ['nullable', 'string', 'max:5000'],
        ]);

        app(HCaptchaService::class)->verify($request, 'supplier_login');

        $login = trim($validated['login']);
        $userColumns = Schema::getColumnListing('users');
        $user = User::query()->where(function ($query) use ($login, $userColumns) {
            if (in_array('email', $userColumns, true)) $query->whereRaw('LOWER(email) = ?', [Str::lower($login)]);
            if (in_array('phone', $userColumns, true)) $query->orWhere('phone', $login);
            if (in_array('username', $userColumns, true)) $query->orWhere('username', $login);
        })->first();

        if (! $user || ! Hash::check($validated['password'], (string) $user->password)) {
            return response()->json(['status' => false, 'message' => 'Invalid supplier login credentials.'], 422);
        }

        $supplier = null;
        if (Schema::hasTable('suppliers')) {
            if (! empty($user->supplier_id)) {
                $supplier = Supplier::query()->find($user->supplier_id);
            }
            $supplier ??= Supplier::query()->where('user_id', $user->id)->first();
        }

        $isSupplier = Str::lower((string) ($user->profile_type ?? '')) === 'supplier';
        try {
            $isSupplier = $isSupplier || (method_exists($user, 'hasRole') && $user->hasRole('supplier'));
        } catch (Throwable) {
            // Supplier relationship remains authoritative.
        }

        if (! $isSupplier || ! $supplier) {
            return response()->json([
                'status' => false,
                'message' => 'This account is not a supplier account. POS staff must use Merchant Login.',
            ], 403);
        }
        if (Schema::hasColumn('suppliers', 'portal_enabled') && ! $supplier->portal_enabled) {
            return response()->json(['status' => false, 'message' => 'Supplier Portal access is disabled.'], 403);
        }
        if (! in_array(Str::lower((string) $user->status), ['active', 'enabled'], true)) {
            return response()->json(['status' => false, 'message' => 'This supplier account is inactive.'], 403);
        }

        $user->tokens()->where('name', 'supplier_portal')->delete();
        $token = $user->createToken('supplier_portal', ['supplier-portal'])->plainTextToken;
        $payload = $this->payload($user, $supplier);

        return response()->json([
            'status' => true,
            'message' => 'Supplier login successful. Supplier accounts cannot access the POS.',
            'token' => $token,
            'user' => $payload['user'],
            'supplier' => $payload['supplier'],
            'data' => array_merge(['token' => $token], $payload),
        ]);
    }

    public function profile(Request $request): JsonResponse
    {
        $supplier = $request->attributes->get('nst_supplier');
        return response()->json(['status' => true, 'data' => $this->payload($request->user(), $supplier)]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();
        if ($token && method_exists($token, 'delete')) {
            $token->delete();
        }
        return response()->json(['status' => true, 'message' => 'Supplier logout successful.']);
    }

    private function payload(User $user, Supplier $supplier): array
    {
        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'profile_type' => 'supplier',
                'can_access_pos' => false,
                'portal' => 'supplier',
            ],
            'supplier' => [
                'id' => $supplier->id,
                'supplier_code' => $supplier->supplier_code ?: ('SUP-' . str_pad((string) $supplier->id, 6, '0', STR_PAD_LEFT)),
                'name' => $supplier->name,
                'phone' => $supplier->phone,
                'email' => $supplier->email,
                'address' => $supplier->address,
                'opening_balance' => $supplier->opening_balance,
                'current_balance' => $supplier->current_balance,
                'supplier_since' => optional($supplier->supplier_since)->format('Y-m-d'),
                'status' => $supplier->status,
                'reliability_score' => $supplier->reliability_score,
            ],
        ];
    }
}
