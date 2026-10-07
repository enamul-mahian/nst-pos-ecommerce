<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\Customer;
use App\Services\AccessControlService;
use App\Services\PublicMediaUrlService;
use App\Services\HCaptchaService;
use App\Services\TwoFactorService;
use App\Services\SessionTimeoutService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Spatie\Permission\Models\Role;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|string|email|max:255|unique:users',
            'phone' => 'nullable|string|max:50|unique:users,phone',
            'password' => 'required|string|min:6',
        ]);

        $user = User::create([
            'name' => $request->name,
            'username' => $request->phone ?: null,
            'email' => $request->email,
            'phone' => $request->phone,
            'password' => Hash::make($request->password),
            'status' => 'active',
            'profile_type' => 'customer',
        ]);

        if (Role::where('name', 'customer')->exists()) {
            $user->assignRole('customer');
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'Registration successful',
            'user' => $this->formatAuthUser($user),
            'roles' => $user->getRoleNames(),
            'access' => app(AccessControlService::class)->userAccess($user),
            'can_access_pos' => app(AccessControlService::class)->canAccessPos($user),
            'can_view_purchase_price' => app(AccessControlService::class)->canViewPurchasePrice($user),
            'session_timeout_minutes' => app(SessionTimeoutService::class)->effectiveMinutes($user),
            'token' => $token,
        ], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|string',
            'password' => 'required|string',
            'two_factor_code' => ['nullable', 'string', 'max:32'],
            'hcaptcha_token' => ['nullable', 'string', 'max:5000'],
        ]);

        app(HCaptchaService::class)->verify($request, 'admin_login');

        $login = trim((string) $request->email);

        $user = User::where('email', $login)
            ->orWhere('phone', $login)
            ->orWhere('username', $login)
            ->first();

        if (!$user || !Hash::check($request->password, $user->password)) {
            return response()->json([
                'message' => 'Invalid login credentials',
            ], 401);
        }

        if (($user->status ?? 'active') !== 'active') {
            return response()->json([
                'message' => 'Your account is not active. Please contact admin.',
            ], 403);
        }

        if ($user->two_factor_enabled) {
            $candidate = trim((string) $request->input('two_factor_code', ''));
            if ($candidate === '') {
                return response()->json([
                    'message' => 'Authenticator or recovery code is required.',
                    'two_factor_required' => true,
                ], 422);
            }

            $twoFactor = app(TwoFactorService::class);
            $valid = $twoFactor->verifyCode($user->two_factor_secret, $candidate)
                || $twoFactor->consumeRecoveryCode($user, $candidate);
            if (! $valid) {
                return response()->json([
                    'message' => 'Invalid authenticator or recovery code.',
                    'two_factor_required' => true,
                ], 422);
            }
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return response()->json([
            'message' => 'Login successful',
            'user' => $this->formatAuthUser($user),
            'roles' => $user->getRoleNames(),
            'access' => app(AccessControlService::class)->userAccess($user),
            'can_access_pos' => app(AccessControlService::class)->canAccessPos($user),
            'can_view_purchase_price' => app(AccessControlService::class)->canViewPurchasePrice($user),
            'session_timeout_minutes' => app(SessionTimeoutService::class)->effectiveMinutes($user),
            'token' => $token,
        ]);
    }

    public function customerRegister(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email', 'unique:customers,email'],
            'phone' => ['required', 'string', 'max:50', 'unique:users,phone', 'unique:customers,phone'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
            'address' => ['nullable', 'string', 'max:2000'],
            'hcaptcha_token' => ['nullable', 'string', 'max:5000'],
        ]);

        app(HCaptchaService::class)->verify($request, 'customer_registration');

        $result = DB::transaction(function () use ($validated) {
            $customer = Customer::create([
                'name' => $validated['name'],
                'phone' => $validated['phone'],
                'email' => $validated['email'],
                'address' => $validated['address'] ?? null,
                'source' => 'website_registration',
                'status' => 'active',
            ]);

            $user = User::create([
                'name' => $validated['name'],
                'username' => $validated['phone'],
                'email' => $validated['email'],
                'phone' => $validated['phone'],
                'password' => Hash::make($validated['password']),
                'status' => 'active',
                'profile_type' => 'customer',
                'customer_id' => $customer->id,
                'address' => $validated['address'] ?? null,
                'website_registered_at' => now(),
            ]);

            $customer->update(['user_id' => $user->id]);

            if (Role::where('name', 'customer')->exists()) {
                $user->assignRole('customer');
            }

            return $user;
        });

        return response()->json([
            'message' => 'Customer registration successful',
            'user' => $this->formatAuthUser($result),
            'token' => $result->createToken('customer_portal')->plainTextToken,
        ], 201);
    }

    public function customerLogin(Request $request)
    {
        $request->validate([
            'login' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string'],
            'hcaptcha_token' => ['nullable', 'string', 'max:5000'],
        ]);

        app(HCaptchaService::class)->verify($request, 'customer_login');

        $login = trim((string) $request->login);
        $user = User::where('email', $login)
            ->orWhere('phone', $login)
            ->orWhere('username', $login)
            ->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Invalid customer login credentials.'], 401);
        }

        $isCustomer = strtolower((string) $user->profile_type) === 'customer'
            || ! empty($user->customer_id)
            || $user->hasRole('customer');

        if (! $isCustomer) {
            return response()->json([
                'message' => 'This account is not a customer account. Use Merchant Login for POS access.',
            ], 403);
        }

        if (empty($user->website_registered_at)) {
            return response()->json([
                'message' => 'Registration is required before customer login. Please create a website customer account first.',
                'registration_required' => true,
            ], 403);
        }

        if (($user->status ?? 'active') !== 'active') {
            return response()->json(['message' => 'Your customer account is not active.'], 403);
        }

        return response()->json([
            'message' => 'Customer login successful',
            'user' => $this->formatAuthUser($user),
            'token' => $user->createToken('customer_portal')->plainTextToken,
        ]);
    }

    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json([
            'message' => 'Logout successful',
        ]);
    }

    public function me(Request $request)
    {
        return response()->json([
            'user' => $this->formatAuthUser($request->user()),
            'roles' => $request->user()->getRoleNames(),
            'permissions' => $request->user()->getAllPermissions()->pluck('name'),
            'access' => app(AccessControlService::class)->userAccess($request->user()),
            'can_access_pos' => app(AccessControlService::class)->canAccessPos($request->user()),
            'can_view_purchase_price' => app(AccessControlService::class)->canViewPurchasePrice($request->user()),
            'session_timeout_minutes' => app(SessionTimeoutService::class)->effectiveMinutes($request->user()),
        ]);
    }

    public function changePassword(Request $request)
    {
        $request->validate([
            'current_password' => ['nullable', 'string'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
        ]);

        $user = $request->user();

        if (!$user->must_change_password && $request->filled('current_password')) {
            if (!Hash::check($request->current_password, $user->password)) {
                return response()->json([
                    'success' => false,
                    'message' => 'Current password is incorrect.',
                ], 422);
            }
        }

        $user->update([
            'password' => Hash::make($request->password),
            'must_change_password' => false,
            'temporary_password' => null,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Password changed successfully.',
        ]);
    }

    private function formatAuthUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username,
            'email' => $user->email,
            'phone' => $user->phone,
            'status' => $user->status,
            'profile_type' => $user->profile_type,
            'customer_id' => $user->customer_id,
            'supplier_id' => $user->supplier_id,
            'branch_id' => $user->branch_id,
            'must_change_password' => (bool) $user->must_change_password,
            'address' => $user->address ?? null,
            'profile_photo' => $user->profile_photo ?? null,
            'profile_photo_url' => ! empty($user->profile_photo) ? PublicMediaUrlService::forPath($user->profile_photo, optional($user->updated_at)->timestamp) : null,
            'can_access_pos' => app(AccessControlService::class)->canAccessPos($user),
            'can_view_purchase_price' => app(AccessControlService::class)->canViewPurchasePrice($user),
            'two_factor_enabled' => (bool) ($user->two_factor_enabled ?? false),
            'website_registered_at' => optional($user->website_registered_at)->toIso8601String(),
        ];
    }
}
