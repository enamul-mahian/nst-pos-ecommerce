<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class SettingsController extends Controller
{
    public function index(): JsonResponse
    {
        $settings = $this->defaults();

        Setting::query()->get()->each(function (Setting $setting) use (&$settings) {
            $settings[$setting->key] = $this->castSettingValue($setting->value, $setting->type);
        });

        $settings['active_timezone'] = config('app.timezone');
        $settings['timezone_options'] = \DateTimeZone::listIdentifiers();

        return response()->json([
            'status' => true,
            'data' => $settings,
        ]);
    }

    public function publicAppearance(): JsonResponse
    {
        $allowedKeys = [
            'ui_card_radius',
            'ui_card_gap',
            'ui_card_padding',
            'ui_section_gap',
            'ui_border_width',
            'ui_page_content',
            'ui_page_layout',
            'ui_brand',
        ];

        $settings = Cache::rememberForever('nst.settings.public_appearance.v1', function () use ($allowedKeys) {
            $settings = array_intersect_key($this->defaults(), array_flip($allowedKeys));

            Setting::query()->whereIn('key', $allowedKeys)->get()->each(function (Setting $setting) use (&$settings) {
                $settings[$setting->key] = $this->castSettingValue($setting->value, $setting->type);
            });

            return $settings;
        });

        return response()->json([
            'status' => true,
            'data' => $settings,
        ]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_name' => ['nullable', 'string', 'max:190'],
            'company_legal_name' => ['nullable', 'string', 'max:190'],
            'phone' => ['nullable', 'string', 'max:80'],
            'email' => ['nullable', 'email', 'max:190'],
            'website' => ['nullable', 'string', 'max:190'],
            'address' => ['nullable', 'string', 'max:1000'],
            'logo_url' => ['nullable', 'string', 'max:1000'],
            'invoice_prefix' => ['nullable', 'string', 'max:30'],
            'invoice_terms' => ['nullable', 'string', 'max:2000'],
            'print_footer' => ['nullable', 'string', 'max:1000'],
            'currency_code' => ['nullable', 'string', 'max:10'],
            'currency_symbol' => ['nullable', 'string', 'max:10'],
            'vat_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'default_branch_id' => ['nullable', 'integer', 'min:1'],
            'low_stock_alert_qty' => ['nullable', 'integer', 'min:0', 'max:999999'],
            'timezone' => ['nullable', 'string', 'max:80', 'timezone:all'],
            'enable_auto_print' => ['nullable', 'boolean'],

            // System UI and page content
            'ui_card_radius' => ['nullable', 'integer', 'min:0', 'max:40'],
            'ui_card_gap' => ['nullable', 'integer', 'min:0', 'max:40'],
            'ui_card_padding' => ['nullable', 'integer', 'min:0', 'max:40'],
            'ui_section_gap' => ['nullable', 'integer', 'min:0', 'max:48'],
            'ui_border_width' => ['nullable', 'numeric', 'min:0', 'max:3'],
            'session_security_policy' => ['nullable', 'array'],
            'session_security_policy.global_minutes' => ['nullable', 'integer', 'in:0,5,10,20'],
            'session_security_policy.role_minutes' => ['nullable', 'array'],
            'session_security_policy.role_minutes.*' => ['nullable', 'integer', 'in:0,5,10,20'],
            'scanner_enabled' => ['nullable', 'boolean'],
            'scanner_auto_search' => ['nullable', 'boolean'],
            'ui_page_content' => ['nullable', 'array'],
            'ui_page_content.*.eyebrow' => ['nullable', 'string', 'max:190'],
            'ui_page_content.*.title' => ['nullable', 'string', 'max:300'],
            'ui_page_content.*.subtitle' => ['nullable', 'string', 'max:1000'],
            'ui_page_content.*.extraFields' => ['nullable', 'array', 'max:20'],
            'ui_page_content.*.extraFields.*.id' => ['nullable', 'string', 'max:80'],
            'ui_page_content.*.extraFields.*.type' => ['nullable', 'in:text,note,badge,link'],
            'ui_page_content.*.extraFields.*.text' => ['nullable', 'string', 'max:1000'],
            'ui_page_content.*.extraFields.*.href' => ['nullable', 'string', 'max:1000'],
            'ui_page_content.*.extraFields.*.enabled' => ['nullable', 'boolean'],
            'ui_page_content.*.i18n' => ['nullable', 'array', 'max:10'],
            'ui_page_content.*.i18n.*.title' => ['nullable', 'string', 'max:300'],
            'ui_page_content.*.i18n.*.subtitle' => ['nullable', 'string', 'max:1000'],
            'ui_brand' => ['nullable', 'array'],
            'ui_brand.logoUrl' => ['nullable', 'string', 'max:400000'],
            'ui_brand.background' => ['nullable', 'string', 'max:120'],
            'ui_brand.textColor' => ['nullable', 'string', 'max:120'],
            'ui_brand.subtitleColor' => ['nullable', 'string', 'max:120'],
            'ui_brand.logoFit' => ['nullable', 'in:cover,contain'],
            'ui_brand.title' => ['nullable', 'string', 'max:120'],
            'ui_brand.subtitle' => ['nullable', 'string', 'max:120'],
            'ui_brand.markText' => ['nullable', 'string', 'max:12'],
            'ui_brand.faviconMode' => ['nullable', 'in:logo,custom,default'],
            'ui_brand.faviconUrl' => ['nullable', 'string', 'max:200000'],
            'ui_brand.i18n' => ['nullable', 'array', 'max:10'],
            'ui_brand.i18n.*.title' => ['nullable', 'string', 'max:120'],
            'ui_brand.i18n.*.subtitle' => ['nullable', 'string', 'max:120'],
            'ui_page_layout' => ['nullable', 'array'],
            'ui_page_layout.*.cardRadius' => ['nullable', 'numeric', 'min:0', 'max:40'],
            'ui_page_layout.*.cardGap' => ['nullable', 'numeric', 'min:0', 'max:48'],
            'ui_page_layout.*.cardPadding' => ['nullable', 'numeric', 'min:0', 'max:48'],
            'ui_page_layout.*.sectionGap' => ['nullable', 'numeric', 'min:0', 'max:64'],
            'ui_page_layout.*.borderWidth' => ['nullable', 'numeric', 'min:0', 'max:3'],
            'ui_page_layout.*.pageMaxWidth' => ['nullable', 'numeric', 'min:0', 'max:2200'],
            'ui_page_layout.*.pagePaddingX' => ['nullable', 'numeric', 'min:0', 'max:96'],
            'ui_page_layout.*.pagePaddingY' => ['nullable', 'numeric', 'min:0', 'max:96'],
            'ui_page_layout.*.pageBackground' => ['nullable', 'string', 'max:120'],
            'ui_page_layout.*.elements' => ['nullable', 'array', 'max:120'],
            'ui_page_layout.*.elements.*.id' => ['nullable', 'string', 'max:120'],
            'ui_page_layout.*.elements.*.selector' => ['nullable', 'string', 'max:1600'],
            'ui_page_layout.*.elements.*.label' => ['nullable', 'string', 'max:300'],
            'ui_page_layout.*.elements.*.enabled' => ['nullable', 'boolean'],
            'ui_page_layout.*.elements.*.textOverride' => ['nullable', 'string', 'max:3000'],
            'ui_page_layout.*.elements.*.styles' => ['nullable', 'array'],
            'ui_page_layout.*.elements.*.styles.widthMode' => ['nullable', 'in:keep,percent,px,auto'],
            'ui_page_layout.*.elements.*.styles.widthValue' => ['nullable', 'numeric', 'min:0', 'max:2200'],
            'ui_page_layout.*.elements.*.styles.maxWidth' => ['nullable', 'numeric', 'min:0', 'max:2200'],
            'ui_page_layout.*.elements.*.styles.minHeight' => ['nullable', 'numeric', 'min:0', 'max:1200'],
            'ui_page_layout.*.elements.*.styles.padding' => ['nullable', 'numeric', 'min:0', 'max:120'],
            'ui_page_layout.*.elements.*.styles.radius' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'ui_page_layout.*.elements.*.styles.borderWidth' => ['nullable', 'numeric', 'min:0', 'max:10'],
            'ui_page_layout.*.elements.*.styles.gap' => ['nullable', 'numeric', 'min:0', 'max:120'],
            'ui_page_layout.*.elements.*.styles.fontSize' => ['nullable', 'numeric', 'min:8', 'max:96'],
            'ui_page_layout.*.elements.*.styles.fontWeight' => ['nullable', 'in:keep,400,500,600,700,800,900'],
            'ui_page_layout.*.elements.*.styles.textAlign' => ['nullable', 'in:keep,left,center,right'],
            'ui_page_layout.*.elements.*.styles.alignment' => ['nullable', 'in:keep,left,center,right'],
            'ui_page_layout.*.elements.*.styles.visible' => ['nullable', 'boolean'],
            'ui_page_layout.*.elements.*.styles.opacity' => ['nullable', 'numeric', 'min:0', 'max:1'],
            'ui_page_layout.*.elements.*.styles.marginTop' => ['nullable', 'numeric', 'min:-100', 'max:200'],
            'ui_page_layout.*.elements.*.styles.marginBottom' => ['nullable', 'numeric', 'min:-100', 'max:200'],
            'ui_page_layout.*.elements.*.styles.backgroundColor' => ['nullable', 'string', 'max:120'],
            'ui_page_layout.*.elements.*.styles.color' => ['nullable', 'string', 'max:120'],
            'ui_page_layout.*.elements.*.styles.shadow' => ['nullable', 'in:keep,none,soft,medium,strong'],
            'ui_page_layout.*.elements.*.styles.hoverLift' => ['nullable', 'numeric', 'min:0', 'max:20'],
            'ui_page_layout.*.cards' => ['nullable', 'array'],
            'ui_page_layout.*.cards.*.title' => ['nullable', 'string', 'max:300'],
            'ui_page_layout.*.cards.*.subtitle' => ['nullable', 'string', 'max:1000'],
            'ui_page_layout.*.cards.*.radius' => ['nullable', 'numeric', 'min:0', 'max:40'],
            'ui_page_layout.*.cards.*.padding' => ['nullable', 'numeric', 'min:0', 'max:48'],
            'ui_page_layout.*.cards.*.borderWidth' => ['nullable', 'numeric', 'min:0', 'max:3'],
            'ui_page_layout.*.cards.*.minHeight' => ['nullable', 'numeric', 'min:0', 'max:1000'],
            'ui_page_layout.*.cards.*.hoverLift' => ['nullable', 'numeric', 'min:0', 'max:12'],
            'ui_page_layout.*.cards.*.extraFields' => ['nullable', 'array', 'max:20'],
            'ui_page_layout.*.cards.*.extraFields.*.id' => ['nullable', 'string', 'max:80'],
            'ui_page_layout.*.cards.*.extraFields.*.type' => ['nullable', 'in:text,note,badge,link'],
            'ui_page_layout.*.cards.*.extraFields.*.text' => ['nullable', 'string', 'max:1000'],
            'ui_page_layout.*.cards.*.extraFields.*.href' => ['nullable', 'string', 'max:1000'],
            'ui_page_layout.*.cards.*.extraFields.*.enabled' => ['nullable', 'boolean'],
            // Super admin inline section editor.
            'ui_page_layout.*.inlineSections' => ['nullable', 'array', 'max:200'],
            'ui_page_layout.*.inlineSections.*.transparent' => ['nullable', 'boolean'],
            'ui_page_layout.*.inlineSections.*.background' => ['nullable', 'string', 'max:120'],
            'ui_page_layout.*.inlineSections.*.borderColor' => ['nullable', 'string', 'max:120'],
            'ui_page_layout.*.inlineSections.*.borderWidth' => ['nullable', 'numeric', 'min:0', 'max:8'],
            'ui_page_layout.*.inlineSections.*.radius' => ['nullable', 'numeric', 'min:0', 'max:48'],
            'ui_page_layout.*.inlineSections.*.padding' => ['nullable', 'numeric', 'min:0', 'max:64'],
            'ui_page_layout.*.inlineSections.*.shadow' => ['nullable', 'in:keep,none,soft'],
        ]);

        if (array_key_exists('session_security_policy', $data) && ! app(AccessControlService::class)->isSuperAdmin($request->user())) {
            abort(403, 'Only Super Admin can change session timeout policy.');
        }

        foreach ($data as $key => $value) {
            $group = match (true) {
                str_starts_with($key, 'invoice_'), $key === 'print_footer', $key === 'enable_auto_print' => 'invoice',
                in_array($key, ['currency_code', 'currency_symbol', 'vat_percent'], true) => 'finance',
                in_array($key, ['default_branch_id', 'low_stock_alert_qty'], true) => 'inventory',
                str_starts_with($key, 'ui_'), str_starts_with($key, 'scanner_') => 'appearance',
                default => 'general',
            };

            $type = match (true) {
                is_array($value) => 'json',
                is_bool($value) => 'boolean',
                is_numeric($value) && in_array($key, ['vat_percent', 'default_branch_id', 'low_stock_alert_qty', 'ui_card_radius', 'ui_card_gap', 'ui_card_padding', 'ui_section_gap', 'ui_border_width'], true) => 'number',
                default => 'string',
            };

            Setting::setValue($key, $value, $group, $type);
        }

        Cache::forget('nst.settings.public_appearance.v1');

        if (! empty($data['timezone'])) {
            config(['app.timezone' => $data['timezone']]);
        }

        return response()->json([
            'status' => true,
            'message' => 'Settings saved successfully.',
            'data' => $this->index()->getData(true)['data'] ?? $this->defaults(),
        ]);
    }

    private function defaults(): array
    {
        return [
            'company_name' => 'New Singapur Telecom',
            'company_legal_name' => 'New Singapur Telecom',
            'phone' => '',
            'email' => 'info@newsingapurtele.com',
            'website' => 'https://newsingapurtele.com',
            'address' => '',
            'logo_url' => '',
            'invoice_prefix' => 'NST',
            'invoice_terms' => 'Goods once sold are subject to company return/warranty policy.',
            'print_footer' => 'Thank you for shopping with New Singapur Telecom.',
            'currency_code' => 'BDT',
            'currency_symbol' => '৳',
            'vat_percent' => 0,
            'default_branch_id' => null,
            'low_stock_alert_qty' => 3,
            'timezone' => 'Asia/Dhaka',
            'enable_auto_print' => true,
            'session_security_policy' => ['global_minutes' => 20, 'role_minutes' => []],

            'ui_card_radius' => 14,
            'ui_card_gap' => 14,
            'ui_card_padding' => 14,
            'ui_section_gap' => 18,
            'ui_border_width' => 1,
            'scanner_enabled' => true,
            'scanner_auto_search' => true,
            'ui_page_content' => [
                '/reports' => [
                    'eyebrow' => 'New Singapur Telecom',
                    'title' => 'Business Reports',
                    'subtitle' => 'Daily sales, monthly salesmen report, purchase, stock, dues and accounts summary.',
                    'extraFields' => [],
                ],
                '/dashboard-targets' => [
                    'eyebrow' => 'Real Database Targets',
                    'title' => "Today's Target",
                    'subtitle' => 'Branch-wise targets plus a separate Manual or Auto Combined Target.',
                    'extraFields' => [],
                ],
                '/customer-support' => [
                    'eyebrow' => 'Dashboard Support Workspace',
                    'title' => 'Customer Support Portal',
                    'subtitle' => 'Search by customer name, mobile number or Customer ID. Duplicate names stay separate and selectable.',
                    'extraFields' => [],
                ],
            ],
            'ui_brand' => [],
            'ui_page_layout' => [
                '/reports' => [
                    'cardRadius' => 14,
                    'cardGap' => 14,
                    'cardPadding' => 14,
                    'sectionGap' => 18,
                    'borderWidth' => 1,
                    'cards' => [],
                ],
            ],
        ];
    }

    private function castSettingValue(?string $value, string $type): mixed
    {
        return match ($type) {
            'boolean' => in_array($value, ['1', 'true', 'yes', 'on'], true),
            'number' => is_numeric($value) ? $value + 0 : 0,
            'json' => json_decode($value ?: '{}', true) ?: [],
            default => $value,
        };
    }
}
