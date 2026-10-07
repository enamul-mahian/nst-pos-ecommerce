<?php

namespace App\Services;

use App\Models\Setting;

class CorporateSettingService
{
    public function defaults(): array
    {
        return [
            'general' => [
                'company_name' => 'New Singapur Telecom',
                'company_address' => '',
                'company_phone' => '',
                'company_email' => 'info@newsingapurtele.com',
                'company_website' => 'https://newsingapurtele.com',
                'vat_bin' => '',
                'currency_symbol' => '৳',
                'logo_url' => '',
            ],
            'domain' => [
                'pos_domain' => 'https://pos.newsingapurtele.com',
                'ecommerce_domain' => 'https://newsingapurtele.com',
            ],
            'invoice_design' => [
                'template' => 'a4',
                'page_size' => 'a4',
                'page_orientation' => 'portrait',
                'custom_width_mm' => 210,
                'custom_height_mm' => 297,
                'margin_mm' => 10,
                'logo_show' => true,
                'watermark_show' => true,
                'watermark_text' => 'New Singapur Telecom',
                'watermark_opacity' => 0.08,
                'terms' => 'Warranty is subject to manufacturer/shop policy. Physical damage, liquid damage and unauthorized service void warranty.',
                'footer_text' => 'Thank you for shopping with New Singapur Telecom.',
                'signature_label' => 'Authorized Signature',
                'auto_print' => false,
                'print_background' => false,
                'amount_words_language' => 'english',
            ],
            'communication' => [
                'default_sender_name' => 'New Singapur Telecom',
                'sms_api_url' => '',
                'sms_api_method' => 'POST',
                'sms_api_token' => '',
                'sms_to_param' => 'to',
                'sms_message_param' => 'message',
                'smtp_host' => '',
                'smtp_port' => '587',
                'smtp_username' => '',
                'smtp_password' => '',
                'smtp_encryption' => 'tls',
                'smtp_from_email' => 'no-reply@newsingapurtele.com',
                'smtp_from_name' => 'New Singapur Telecom',
                'invoice_sms_template' => 'Dear Customer, your invoice {invoice_no} is ready. Amount: {total}. Paid: {paid}. Due: {due}. View: {invoice_link}',
                'invoice_email_subject' => 'Your Invoice from New Singapur Telecom - {invoice_no}',
                'invoice_email_template' => 'Dear Customer,\n\nThank you for shopping with New Singapur Telecom. Your invoice PDF is attached.\n\nInvoice: {invoice_no}\nTotal: {total}\nPaid: {paid}\nDue: {due}\nView: {invoice_link}',
                'marketing_sms_template' => 'New offer from New Singapur Telecom: {message}',
                'due_reminder_template' => 'Dear Customer, your due amount is {due}. Please pay soon. New Singapur Telecom',
                'warranty_template' => 'Your warranty/service status is updated: {status}. New Singapur Telecom',
            ],
            'barcode' => [
                'printer_type' => 'thermal',
                'paper_type' => 'thermal_40x25',
                'label_width_mm' => 40,
                'label_height_mm' => 25,
                'margin_mm' => 2,
                'font_size' => 9,
                'barcode_type' => 'CODE128',
                'show_company_name' => true,
                'show_product_name' => true,
                'show_price' => false,
                'show_imei' => true,
                'show_barcode_text' => true,
            ],
            'booking' => [
                'minimum_booking_percent' => 10,
                'minimum_fixed_amount' => 0,
                'booking_expiry_days' => 7,
                'allow_without_stock' => true,
                'auto_cancel_unpaid' => false,
                'is_refundable' => false,
                'terms' => 'Booking amount is adjustable with final purchase. Refund policy is determined by shop authority.',
            ],
            'payments' => [
                'default_method' => 'cash_on_delivery',
                'cash_on_delivery_enabled' => true,
                'bkash_agent_enabled' => true,
                'bkash_agent_number' => '',
                'nagad_agent_enabled' => true,
                'nagad_agent_number' => '',
                'manual_payment_instructions' => 'Cash out to the official NST agent number, then submit the exact transaction ID and paid amount. Payment remains pending until verified by authorized staff.',
                'sslcommerz_enabled' => (bool) env('SSLCOMMERZ_ENABLED', false),
                'piprapay_enabled' => (bool) env('PIPRAPAY_ENABLED', false),
                'online_gateway_enabled' => (bool) env('SSLCOMMERZ_ENABLED', false) || (bool) env('PIPRAPAY_ENABLED', false),
                'online_gateway_mode' => env('SSLCOMMERZ_SANDBOX', true) ? 'sandbox' : 'live',
            ],
            'dashboard' => [
                'default_widgets' => ['today_sales','today_collection','today_expense','net_profit','low_stock','pending_warranty','pending_booking','recent_activities','salesman_leaderboard','central_search'],
            ],
        ];
    }

    public function section(string $section): array
    {
        $defaults = $this->defaults()[$section] ?? [];
        $stored = Setting::query()->where('group', $section)->pluck('value', 'key')->toArray();

        foreach ($stored as $key => $value) {
            $stored[$key] = $this->decode($value, $defaults[$key] ?? null);
        }

        $resolved = array_merge($defaults, $stored);

        if ($section === 'payments') {
            $manager = app(\App\Services\PaymentGatewayManagerService::class);
            $ssl = $manager->effective('sslcommerz');
            $pipra = $manager->effective('piprapay');

            $resolved['cash_on_delivery_enabled'] = (bool) ($resolved['cash_on_delivery_enabled'] ?? true);
            $resolved['sslcommerz_enabled'] = (bool) ($ssl['enabled'] ?? false) && (bool) ($ssl['configured'] ?? false);
            $resolved['piprapay_enabled'] = (bool) ($pipra['enabled'] ?? false) && (bool) ($pipra['configured'] ?? false);
            $resolved['online_gateway_enabled'] = $resolved['sslcommerz_enabled'] || $resolved['piprapay_enabled'];

            $activeModes = [];
            if ($resolved['sslcommerz_enabled']) $activeModes[] = $ssl['mode'] ?? 'live';
            if ($resolved['piprapay_enabled']) $activeModes[] = $pipra['mode'] ?? 'live';
            $resolved['online_gateway_mode'] = count(array_unique($activeModes)) > 1
                ? 'mixed'
                : ($activeModes[0] ?? 'not_configured');

            $default = $resolved['default_method'] ?? 'cash_on_delivery';
            if (($default === 'sslcommerz' && ! $resolved['sslcommerz_enabled'])
                || ($default === 'piprapay' && ! $resolved['piprapay_enabled'])) {
                $resolved['default_method'] = $resolved['sslcommerz_enabled']
                    ? 'sslcommerz'
                    : ($resolved['piprapay_enabled'] ? 'piprapay' : 'cash_on_delivery');
            }
        }

        return $resolved;
    }

    public function all(): array
    {
        $data = [];
        foreach (array_keys($this->defaults()) as $section) {
            $data[$section] = $this->section($section);
        }
        return $data;
    }

    public function saveSection(string $section, array $values): array
    {
        $defaults = $this->defaults()[$section] ?? [];
        foreach ($values as $key => $value) {
            if (is_array($value) || is_bool($value)) {
                $storedValue = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $type = is_bool($value) ? 'boolean' : 'json';
            } else {
                $storedValue = (string) ($value ?? '');
                $type = is_numeric($value) ? 'number' : 'string';
            }

            Setting::query()->updateOrCreate(
                ['group' => $section, 'key' => $key],
                ['value' => $storedValue, 'type' => $type]
            );
        }

        return $this->section($section);
    }

    private function decode(mixed $value, mixed $default = null): mixed
    {
        if (is_bool($default)) {
            return in_array((string) $value, ['1', 'true', 'yes', 'on'], true);
        }
        if (is_numeric($default)) {
            return is_float($default + 0) ? (float) $value : (int) $value;
        }
        if (is_array($default)) {
            $decoded = json_decode((string) $value, true);
            return is_array($decoded) ? $decoded : $default;
        }
        return $value;
    }
}
