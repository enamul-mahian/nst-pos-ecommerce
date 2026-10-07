<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AccessControlService;
use App\Services\TwoFactorService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class TwoFactorController extends Controller
{
    public function __construct(
        private readonly TwoFactorService $twoFactor,
        private readonly AccessControlService $accessControl,
    ) {
    }

    public function status(Request $request)
    {
        $this->authorizeFeature($request);
        $user = $request->user();
        return response()->json([
            'success' => true,
            'data' => [
                'enabled' => (bool) $user->two_factor_enabled,
                'setup_pending' => ! $user->two_factor_enabled && ! empty($user->two_factor_secret),
                'recovery_codes_remaining' => count($user->two_factor_recovery_codes ?: []),
            ],
        ]);
    }

    public function setup(Request $request)
    {
        $this->authorizeFeature($request);
        $user = $request->user();
        $secret = $this->twoFactor->generateSecret();
        $user->forceFill([
            'two_factor_enabled' => false,
            'two_factor_secret' => $secret,
            'two_factor_recovery_codes' => [],
        ])->save();

        return response()->json([
            'success' => true,
            'message' => 'Scan the QR code and confirm a 6-digit code.',
            'data' => [
                'secret' => $secret,
                'provisioning_uri' => $this->twoFactor->provisioningUri($user, $secret),
            ],
        ]);
    }

    public function confirm(Request $request)
    {
        $this->authorizeFeature($request);
        $validated = $request->validate(['code' => ['required', 'digits:6']]);
        $user = $request->user();
        if (! $this->twoFactor->verifyCode($user->two_factor_secret, $validated['code'])) {
            return response()->json(['success' => false, 'message' => 'Invalid authenticator code.'], 422);
        }

        $codes = $this->twoFactor->generateRecoveryCodes();
        $user->forceFill([
            'two_factor_enabled' => true,
            'two_factor_recovery_codes' => $codes,
        ])->save();

        return response()->json([
            'success' => true,
            'message' => 'Google Authenticator enabled successfully.',
            'data' => ['recovery_codes' => $codes],
        ]);
    }

    public function disable(Request $request)
    {
        $this->authorizeFeature($request);
        $validated = $request->validate([
            'password' => ['required', 'string'],
            'code' => ['nullable', 'string'],
        ]);
        $user = $request->user();
        if (! Hash::check($validated['password'], $user->password)) {
            return response()->json(['success' => false, 'message' => 'Current password is incorrect.'], 422);
        }
        if ($user->two_factor_enabled && ! $this->twoFactor->verifyCode($user->two_factor_secret, $validated['code'] ?? null)) {
            return response()->json(['success' => false, 'message' => 'Valid authenticator code is required.'], 422);
        }

        $user->forceFill([
            'two_factor_enabled' => false,
            'two_factor_secret' => null,
            'two_factor_recovery_codes' => [],
        ])->save();

        return response()->json(['success' => true, 'message' => 'Two-factor authentication disabled.']);
    }

    public function recoveryCodes(Request $request)
    {
        $this->authorizeFeature($request);
        $validated = $request->validate([
            'password' => ['required', 'string'],
            'code' => ['required', 'digits:6'],
        ]);
        $user = $request->user();
        if (! Hash::check($validated['password'], $user->password)
            || ! $this->twoFactor->verifyCode($user->two_factor_secret, $validated['code'])) {
            return response()->json(['success' => false, 'message' => 'Password or authenticator code is invalid.'], 422);
        }

        $codes = $this->twoFactor->generateRecoveryCodes();
        $user->forceFill(['two_factor_recovery_codes' => $codes])->save();
        return response()->json(['success' => true, 'data' => ['recovery_codes' => $codes]]);
    }

    private function authorizeFeature(Request $request): void
    {
        $user = $request->user();
        $allowed = $this->accessControl->isSuperAdmin($user)
            || (bool) data_get($this->accessControl->userAccess($user), 'sidebar_permissions.two_factor', true);
        abort_unless($allowed, 403, 'Two-factor authentication is not enabled for this user.');
    }
}
