<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\AccessControlService;
use App\Services\SecurityEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;

/**
 * Browser tamper guard: settings, the per-visitor configuration and the attempt report.
 * Blocking in the browser only slows people down; prices, amounts and permissions are always
 * checked again on the server.
 */
class TamperGuardController extends Controller
{
    public const ACTIONS = ['context_menu', 'devtools_key', 'view_source', 'devtools_open', 'save_page', 'copy_attempt'];

    private const DEFAULTS = [
        'tamper_guard_enabled' => true,
        'tamper_guard_website' => true,
        'tamper_guard_admin' => true,
        'tamper_guard_detect_devtools' => true,
        'tamper_guard_whitelist_super_admin' => true,
    ];

    public function __construct(private AccessControlService $access, private SecurityEventService $events)
    {
    }

    public static function settingsValues(): array
    {
        $values = [];
        foreach (self::DEFAULTS as $key => $default) {
            $values[substr($key, strlen('tamper_guard_'))] = filter_var(Setting::getValue($key, $default), FILTER_VALIDATE_BOOLEAN);
        }

        return $values;
    }

    /** What this visitor's browser should do (website visitors, customers and staff). */
    public function config(Request $request): JsonResponse
    {
        $settings = self::settingsValues();
        $user = $this->visitor();
        $whitelisted = $user && $settings['whitelist_super_admin'] && $this->access->isSuperAdmin($user);
        $on = $settings['enabled'] && ! $whitelisted;

        return response()->json([
            'status' => true,
            'data' => [
                'website' => $on && $settings['website'],
                'admin' => $on && $settings['admin'],
                'detect_devtools' => $settings['detect_devtools'],
            ],
        ])->header('Cache-Control', 'no-store');
    }

    public function report(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', Rule::in(self::ACTIONS)],
            'app' => ['required', Rule::in(['website', 'admin'])],
            'page' => ['nullable', 'string', 'max:500'],
            'key' => ['nullable', 'string', 'max:40'],
        ]);

        $settings = self::settingsValues();
        $user = $this->visitor();
        if (! $settings['enabled'] || ! $settings[$validated['app']] || ($user && $settings['whitelist_super_admin'] && $this->access->isSuperAdmin($user))) {
            return response()->json(['status' => true, 'recorded' => false]);
        }

        $id = $this->events->record(
            $request,
            'tamper_attempt',
            'critical',
            [
                'action' => $validated['action'],
                'app' => $validated['app'],
                'page' => $validated['page'] ?? null,
                'key' => $validated['key'] ?? null,
            ],
            $user,
            null,
            implode('|', [$request->ip(), $user?->id, $validated['app'], $validated['action'], $validated['page'] ?? ''])
        );

        return response()->json(['status' => true, 'recorded' => (bool) $id]);
    }

    public function settings(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);

        return response()->json(['status' => true, 'data' => self::settingsValues()]);
    }

    public function saveSettings(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        $rules = [];
        foreach (array_keys(self::DEFAULTS) as $key) {
            $rules[substr($key, strlen('tamper_guard_'))] = ['required', 'boolean'];
        }
        $validated = $request->validate($rules);
        foreach ($validated as $field => $value) {
            Setting::setValue('tamper_guard_' . $field, (bool) $value, 'security', 'boolean');
        }

        return response()->json(['status' => true, 'message' => __('messages.security.tamper_saved'), 'data' => self::settingsValues()]);
    }

    private function visitor()
    {
        try {
            return Auth::guard('sanctum')->user();
        } catch (\Throwable) {
            return null;
        }
    }

    private function requireSuperAdmin(Request $request): void
    {
        if (! $this->access->isSuperAdmin($request->user())) {
            abort(response()->json(['status' => false, 'message' => __('messages.security.super_admin_only')], 403));
        }
    }
}
