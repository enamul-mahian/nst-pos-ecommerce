<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\TrackingIntegration;
use App\Services\AccessControlService;
use App\Services\CorporateSettingService;
use Illuminate\Http\Request;

class CorporateSettingsController extends Controller
{
    public function __construct(
        private CorporateSettingService $settings,
        private AccessControlService $accessControl,
    ) {
    }

    /** Sections the settings UI may save. Anything else is refused so arbitrary setting groups cannot be written. */
    private const WRITABLE_SECTIONS = ['general', 'domain', 'invoice_design', 'communication', 'sms', 'email', 'barcode', 'booking', 'payments', 'dashboard'];

    /** Sections that hold credentials, payment details or public URLs: only Super Admin may change them. */
    private const SUPER_ADMIN_SECTIONS = ['domain', 'communication', 'sms', 'email', 'payments'];

    public function index(Request $request)
    {
        $data = $this->settings->all();
        if (! $this->accessControl->isSuperAdmin($request->user())) {
            $data = array_map(fn ($values) => is_array($values) ? $this->maskSecrets($values) : $values, $data);
        }

        return response()->json(['success' => true, 'data' => $data]);
    }

    public function show(Request $request, string $section)
    {
        $section = $this->normalizeSection($section);
        $data = $this->settings->section($section);
        if (! $this->accessControl->isSuperAdmin($request->user())) {
            $data = $this->maskSecrets($data);
        }

        return response()->json(['success' => true, 'data' => $data]);
    }

    public function update(Request $request, string $section)
    {
        // MySQL compares setting groups case-insensitively, so "Payments" would otherwise reach the payments group
        // without passing the Super Admin check below. Normalise first, then allow only known sections.
        $section = $this->normalizeSection($section);
        abort_unless(in_array($section, self::WRITABLE_SECTIONS, true), 404, 'Unknown settings section.');

        $user = $request->user();
        if (in_array($section, self::SUPER_ADMIN_SECTIONS, true)) {
            abort_unless($this->accessControl->isSuperAdmin($user), 403, 'Only Super Admin can change this configuration.');
        } else {
            abort_unless($this->accessControl->isAdmin($user), 403, 'Only Admin or Super Admin can change corporate settings.');
        }

        $validated = $request->validate(['settings' => ['required', 'array']]);
        $values = $validated['settings'];
        $this->rejectKeysOwnedByOtherGroups($section, array_keys($values));

        if (in_array($section, ['sms', 'email'], true)) {
            $saved = $this->settings->saveSection($section, $values);
            $communication = array_merge($this->settings->section('communication'), $values);
            $this->settings->saveSection('communication', $communication);
            return response()->json(['success' => true, 'message' => ucfirst($section).' settings saved successfully.', 'data' => $saved]);
        }

        if ($section === 'payments') {
            abort_unless(
                $this->accessControl->isSuperAdmin($request->user()),
                403,
                'Only Super Admin can change payment configuration.'
            );

            $payment = $request->validate([
                'settings.cash_on_delivery_enabled' => ['nullable', 'boolean'],
                'settings.bkash_agent_enabled' => ['nullable', 'boolean'],
                'settings.bkash_agent_number' => ['nullable', 'string', 'max:50'],
                'settings.nagad_agent_enabled' => ['nullable', 'boolean'],
                'settings.nagad_agent_number' => ['nullable', 'string', 'max:50'],
                'settings.manual_payment_instructions' => ['nullable', 'string', 'max:2000'],
                'settings.sslcommerz_enabled' => ['nullable', 'boolean'],
                'settings.piprapay_enabled' => ['nullable', 'boolean'],
                'settings.default_method' => ['nullable', 'in:cash_on_delivery,bkash_agent,nagad_agent,sslcommerz,piprapay'],
            ])['settings'] ?? [];

            $gatewayManager = app(\App\Services\PaymentGatewayManagerService::class);
            if (array_key_exists('sslcommerz_enabled', $payment)) {
                $gatewayManager->setEnabled('sslcommerz', (bool) $payment['sslcommerz_enabled'], $request->user()?->id);
            }
            if (array_key_exists('piprapay_enabled', $payment)) {
                $gatewayManager->setEnabled('piprapay', (bool) $payment['piprapay_enabled'], $request->user()?->id);
            }

            $ssl = $gatewayManager->effective('sslcommerz');
            $pipra = $gatewayManager->effective('piprapay');
            if (($payment['sslcommerz_enabled'] ?? false) && ! ($ssl['configured'] ?? false)) {
                abort(422, 'SSLCOMMERZ credentials are not configured. Use Payment Gateway Manager.');
            }
            if (($payment['piprapay_enabled'] ?? false) && ! ($pipra['configured'] ?? false)) {
                abort(422, 'PipraPay credentials are not configured. Use Payment Gateway Manager.');
            }

            $values = array_merge($payment, [
                'default_method' => $payment['default_method'] ?? 'cash_on_delivery',
                'online_gateway_enabled' => (($ssl['enabled'] ?? false) && ($ssl['configured'] ?? false))
                    || (($pipra['enabled'] ?? false) && ($pipra['configured'] ?? false)),
                'online_gateway_mode' => 'managed',
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => ucfirst(str_replace('_', ' ', $section)) . ' settings saved successfully.',
            'data' => $this->settings->saveSection($section, $values),
        ]);
    }

    public function trackingIndex()
    {
        return response()->json([
            'success' => true,
            'data' => TrackingIntegration::query()->orderBy('sort_order')->orderBy('id')->get(),
        ]);
    }

    public function trackingStore(Request $request)
    {
        $this->requireSuperAdminForScripts($request);
        $validated = $request->validate([
            'platform_name' => ['required', 'string', 'max:120'],
            'platform_key' => ['nullable', 'string', 'max:120'],
            'tracking_id' => ['nullable', 'string', 'max:500'],
            'header_script' => ['nullable', 'string'],
            'body_script' => ['nullable', 'string'],
            'footer_script' => ['nullable', 'string'],
            'events' => ['nullable', 'array'],
            'apply_to' => ['nullable', 'array'],
            'is_active' => ['nullable', 'boolean'],
            'is_custom' => ['nullable', 'boolean'],
        ]);

        $validated['created_by'] = $request->user()?->id;
        $validated['updated_by'] = $request->user()?->id;
        $tracking = TrackingIntegration::create($validated);

        return response()->json(['success' => true, 'message' => 'Tracking platform saved.', 'data' => $tracking], 201);
    }

    public function trackingUpdate(Request $request, TrackingIntegration $trackingIntegration)
    {
        $this->requireSuperAdminForScripts($request);
        $validated = $request->validate([
            'platform_name' => ['sometimes', 'required', 'string', 'max:120'],
            'platform_key' => ['nullable', 'string', 'max:120'],
            'tracking_id' => ['nullable', 'string', 'max:500'],
            'header_script' => ['nullable', 'string'],
            'body_script' => ['nullable', 'string'],
            'footer_script' => ['nullable', 'string'],
            'events' => ['nullable', 'array'],
            'apply_to' => ['nullable', 'array'],
            'is_active' => ['nullable', 'boolean'],
            'is_custom' => ['nullable', 'boolean'],
        ]);
        $validated['updated_by'] = $request->user()?->id;
        $trackingIntegration->update($validated);

        return response()->json(['success' => true, 'message' => 'Tracking platform updated.', 'data' => $trackingIntegration->fresh()]);
    }

    public function trackingDestroy(Request $request, TrackingIntegration $trackingIntegration)
    {
        $this->requireSuperAdminForScripts($request);
        if (! $trackingIntegration->is_custom) {
            return response()->json(['success' => false, 'message' => __('messages.tracking.default_platform_delete_blocked')], 422);
        }
        $trackingIntegration->delete();
        return response()->json(['success' => true, 'message' => 'Tracking platform deleted.']);
    }

    /** Tracking integrations inject header/body scripts into every storefront page. */
    private function requireSuperAdminForScripts(Request $request): void
    {
        abort_unless($this->accessControl->isSuperAdmin($request->user()), 403, 'Only Super Admin can change website tracking scripts.');
    }

    private function normalizeSection(string $section): string
    {
        return strtolower(trim($section));
    }

    /**
     * Setting keys are unique across all groups. A key that already belongs to another group (hCaptcha, chatbox,
     * security settings...) must not be overwritten or shadowed from the corporate settings screen.
     */
    private function rejectKeysOwnedByOtherGroups(string $section, array $keys): void
    {
        $family = in_array($section, ['sms', 'email', 'communication'], true)
            ? ['sms', 'email', 'communication']
            : [$section];

        $foreign = \App\Models\Setting::query()
            ->whereIn('key', array_map('strval', $keys))
            ->get(['key', 'group'])
            ->reject(fn ($row) => in_array(strtolower((string) $row->group), $family, true))
            ->pluck('key')
            ->values()
            ->all();

        abort_if($foreign !== [], 422, 'These settings belong to another module and cannot be changed here: ' . implode(', ', $foreign));
    }

    private function maskSecrets(array $values): array
    {
        foreach ($values as $key => $value) {
            if (is_string($key) && preg_match('/password|secret|token|api_key|private_key/i', $key) && is_scalar($value) && (string) $value !== '') {
                $values[$key] = '********';
            }
        }

        return $values;
    }
}
