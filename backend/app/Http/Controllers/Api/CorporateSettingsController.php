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

    public function index()
    {
        return response()->json(['success' => true, 'data' => $this->settings->all()]);
    }

    public function show(string $section)
    {
        return response()->json(['success' => true, 'data' => $this->settings->section($section)]);
    }

    public function update(Request $request, string $section)
    {
        $validated = $request->validate(['settings' => ['required', 'array']]);
        $values = $validated['settings'];

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

    public function trackingDestroy(TrackingIntegration $trackingIntegration)
    {
        if (! $trackingIntegration->is_custom) {
            return response()->json(['success' => false, 'message' => __('messages.tracking.default_platform_delete_blocked')], 422);
        }
        $trackingIntegration->delete();
        return response()->json(['success' => true, 'message' => 'Tracking platform deleted.']);
    }
}
