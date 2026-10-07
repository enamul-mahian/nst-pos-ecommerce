<?php

namespace App\Services;

use App\Models\Sale;
use Illuminate\Support\Str;

class InvoiceDocumentService
{
    public function __construct(private CorporateSettingService $settings, private NumberToWordsService $words)
    {
    }

    public function salePayload(Sale $sale, bool $public = false): array
    {
        $sale->loadMissing(['items.deviceUnit.product', 'items.product', 'customer', 'branch', 'soldBy', 'paymentReceiver', 'payments']);

        if (! $sale->public_token) {
            $sale->forceFill(['public_token' => sha1($sale->invoice_no . '|' . Str::random(32))])->saveQuietly();
        }

        $settings = $this->settings->all();
        $profileSnapshot = is_array($sale->invoice_profile_snapshot) ? $sale->invoice_profile_snapshot : [];
        $company = $profileSnapshot ? $this->companyFromSnapshot($profileSnapshot, $settings) : $this->companySettings($settings);
        $invoiceDesign = $profileSnapshot ? $this->designFromSnapshot($profileSnapshot, $settings) : ($settings['invoice_design'] ?? []);
        $amountWords = $sale->amount_in_words ?: $this->words->taka((float) ($sale->final_amount ?? 0));

        $items = $sale->items->map(function ($item) {
            $device = $item->deviceUnit;
            $quantity = max((int) ($item->quantity ?? 1), 1);
            $lineTotal = $this->firstPositive([
                $item->line_total ?? null,
                $item->total ?? null,
                $item->sub_total ?? null,
            ]);
            $unitPrice = $this->firstPositive([
                $item->unit_price ?? null,
                $item->rate ?? null,
                $item->sale_price ?? null,
                $item->selling_price ?? null,
                $quantity > 0 && $lineTotal > 0 ? ($lineTotal / $quantity) : null,
                optional($item->product)->sale_price ?? null,
            ]);

            if ($lineTotal <= 0 && $unitPrice > 0) {
                $lineTotal = $unitPrice * $quantity;
            }

            return [
                'product_name' => $item->product_name ?? $item->name ?? optional($item->product)->name,
                'sku' => $item->sku ?? optional($item->product)->sku,
                'quantity' => $quantity,
                'unit_price' => (float) $unitPrice,
                'line_total' => (float) $lineTotal,
                'imei_1' => $device?->imei_1 ?: ($item->imei_1 ?? null),
                'imei_2' => $device?->imei_2 ?: ($item->imei_2 ?? null),
                'barcode' => $device?->barcode ?: ($item->device_barcode ?? ($item->barcode ?? null)),
                'warranty_type' => $device?->warranty_type ?: ($item->warranty_type ?? null),
                'warranty_end_date' => optional($device?->warranty_end_date)->format('Y-m-d') ?: ($device?->warranty_end_date ?: ($item->warranty_end_date ?? null)),
            ];
        })->values();

        return [
            'invoice' => [
                'id' => $sale->id,
                'invoice_no' => $sale->invoice_no,
                'public_token' => $sale->public_token,
                'public_url' => $this->publicUrl($sale),
                'date' => optional($sale->created_at)->format('Y-m-d H:i'),
                'status' => $sale->status,
                'payment_status' => $sale->payment_status,
                'subtotal' => (float) ($sale->subtotal ?? 0),
                'discount' => (float) ($sale->discount ?? 0),
                'coupon_code' => $sale->coupon_code ?? null,
                'coupon_discount' => (float) ($sale->coupon_discount ?? 0),
                'delivery_charge' => (float) ($sale->delivery_charge ?? 0),
                'final_amount' => (float) ($sale->final_amount ?? 0),
                'paid_amount' => (float) ($sale->paid_amount ?? 0),
                'due_amount' => (float) ($sale->due_amount ?? 0),
                'cash_back_amount' => (float) ($sale->cash_back_amount ?? 0),
                'amount_in_words' => $amountWords,
                'note' => $public ? null : $sale->note,
            ],
            'company' => $company,
            'invoice_design' => $invoiceDesign,
            'customer' => [
                'name' => $sale->customer_name ?: optional($sale->customer)->name,
                'phone' => $sale->customer_phone ?: optional($sale->customer)->phone,
                'email' => $sale->customer_email ?: optional($sale->customer)->email,
            ],
            'branch' => [
                'name' => optional($sale->branch)->name,
                'address' => optional($sale->branch)->address,
            ],
            'staff' => [
                'sold_by' => optional($sale->soldBy)->name,
                'payment_received_by' => optional($sale->paymentReceiver)->name,
            ],
            'items' => $items,
            'payments' => $sale->payments?->map(fn ($p) => [
                'method' => $p->payment_method ?? $p->method ?? null,
                'amount' => (float) ($p->amount ?? 0),
                'transaction_id' => $p->transaction_id ?? null,
                'emi_bank_name' => $p->emi_bank_name ?? null,
                'emi_months' => $p->emi_months ?? null,
                'emi_reference' => $p->emi_reference ?? null,
                'date' => optional($p->created_at)->format('Y-m-d H:i'),
            ])->values() ?? [],
        ];
    }

    public function publicUrl(Sale $sale): string
    {
        $domain = rtrim((string) ($this->settings->section('domain')['ecommerce_domain'] ?? config('app.url')), '/');
        return $domain . '/invoice-public/' . rawurlencode($sale->invoice_no) . '?token=' . urlencode((string) $sale->public_token);
    }

    public function simplePdf(Sale $sale): string
    {
        $data = $this->salePayload($sale, true);
        $company = $data['company'];
        $invoice = $data['invoice'];
        $design = $data['invoice_design'] ?? [];
        $currency = $company['currency_symbol'] ?: 'BDT ';

        $lines = [];
        $lines[] = $company['name'] ?: 'New Singapur Telecom';
        $lines[] = $company['address'] ?: '';
        $lines[] = trim(($company['phone'] ?: '') . ' ' . ($company['email'] ? '| ' . $company['email'] : ''));
        $lines[] = $company['website'] ?: '';
        $lines[] = str_repeat('=', 98);
        $lines[] = 'INVOICE: ' . $invoice['invoice_no'] . '    Date: ' . $invoice['date'] . '    Status: ' . $invoice['status'] . '/' . $invoice['payment_status'];
        $lines[] = 'Customer: ' . ($data['customer']['name'] ?: 'Walk-in') . '    Phone: ' . ($data['customer']['phone'] ?: '-') . '    Email: ' . ($data['customer']['email'] ?: '-');
        $lines[] = 'Branch: ' . ($data['branch']['name'] ?: '-') . '    Sold By: ' . ($data['staff']['sold_by'] ?: '-');
        $lines[] = str_repeat('-', 98);
        $lines[] = sprintf('%-34s %4s %13s %13s %28s', 'Product', 'Qty', 'Rate', 'Total', 'IMEI');
        $lines[] = str_repeat('-', 98);

        foreach ($data['items'] as $item) {
            $product = mb_strimwidth((string) ($item['product_name'] ?: '-'), 0, 33, '...');
            $code = trim(($item['imei_1'] ?: '') . ' ' . ($item['imei_2'] ?: ''));
            $code = mb_strimwidth($code ?: '-', 0, 27, '...');
            $lines[] = sprintf('%-34s %4s %13s %13s %28s', $product, $item['quantity'], $this->money($item['unit_price'], $currency), $this->money($item['line_total'], $currency), $code);
            if (! empty($item['sku']) || ! empty($item['warranty_type'])) {
                $lines[] = '  SKU: ' . ($item['sku'] ?: '-') . ' | Warranty: ' . ($item['warranty_type'] ?: '-') . ' ' . ($item['warranty_end_date'] ?: '');
            }
        }

        $lines[] = str_repeat('-', 98);
        $lines[] = sprintf('%75s %20s', 'Subtotal:', $this->money($invoice['subtotal'], $currency));
        $lines[] = sprintf('%75s %20s', 'Discount:', $this->money(($invoice['discount'] + $invoice['coupon_discount']), $currency));
        $lines[] = sprintf('%75s %20s', 'Delivery:', $this->money($invoice['delivery_charge'], $currency));
        $lines[] = sprintf('%75s %20s', 'Final Amount:', $this->money($invoice['final_amount'], $currency));
        $lines[] = sprintf('%75s %20s', 'Paid:', $this->money($invoice['paid_amount'], $currency));
        $lines[] = sprintf('%75s %20s', 'Due:', $this->money($invoice['due_amount'], $currency));

        if (!empty($data['payments'])) {
            $lines[] = str_repeat('-', 98);
            $lines[] = 'PAYMENT BREAKDOWN';

            foreach ($data['payments'] as $payment) {
                $method = strtoupper(str_replace('_', ' ', (string) ($payment['method'] ?? '-')));
                $detail = $method . ': ' . $this->money($payment['amount'] ?? 0, $currency);

                if (!empty($payment['emi_bank_name'])) {
                    $detail .= ' | Bank: ' . $payment['emi_bank_name'];
                }

                if (!empty($payment['emi_months'])) {
                    $detail .= ' | Tenure: ' . $payment['emi_months'] . ' Months';
                }

                if (!empty($payment['emi_reference'])) {
                    $detail .= ' | Ref: ' . $payment['emi_reference'];
                } elseif (!empty($payment['transaction_id'])) {
                    $detail .= ' | Ref: ' . $payment['transaction_id'];
                }

                $lines[] = $detail;
            }
        }
        $lines[] = str_repeat('-', 98);
        $lines[] = 'Amount in Words: ' . $invoice['amount_in_words'];
        $lines[] = 'Public Link: ' . $invoice['public_url'];
        $lines[] = '';
        $lines[] = 'Terms & Conditions:';
        foreach ($this->wrapText((string) ($design['terms'] ?? ''), 96) as $wrapped) {
            $lines[] = $wrapped;
        }
        $lines[] = '';
        $lines[] = 'Customer Signature                                      ' . ($design['signature_label'] ?? 'Authorized Signature');
        $lines[] = 'Watermark: ' . ($design['watermark_text'] ?? 'New Singapur Telecom');

        return $this->buildPdf($lines);
    }

    private function firstPositive(array $values): float
    {
        foreach ($values as $value) {
            $number = (float) ($value ?? 0);
            if ($number > 0) {
                return $number;
            }
        }
        return 0;
    }


    private function companyFromSnapshot(array $snapshot, array $settings): array
    {
        $fallback = $this->companySettings($settings);
        return [
            'name' => $snapshot['business_name'] ?? $fallback['name'],
            'address' => $snapshot['address'] ?? $fallback['address'],
            'phone' => $snapshot['phone'] ?? $fallback['phone'],
            'email' => $snapshot['email'] ?? $fallback['email'],
            'website' => $snapshot['website'] ?? $fallback['website'],
            'vat_bin' => $snapshot['vat_bin'] ?? $fallback['vat_bin'],
            'logo_url' => $snapshot['logo_url'] ?? $fallback['logo_url'],
            'currency_symbol' => $snapshot['currency_symbol'] ?? $fallback['currency_symbol'],
        ];
    }

    private function designFromSnapshot(array $snapshot, array $settings): array
    {
        $design = $settings['invoice_design'] ?? [];
        $design['page_size'] = $snapshot['layout'] ?? ($design['page_size'] ?? 'a4');
        $design['page_orientation'] = $snapshot['orientation'] ?? ($design['page_orientation'] ?? $design['orientation'] ?? 'portrait');
        $design['template'] = $snapshot['layout'] ?? ($design['template'] ?? 'a4');
        $design['terms'] = $snapshot['terms'] ?? ($design['terms'] ?? null);
        $design['warranty_terms'] = $snapshot['warranty_terms'] ?? null;
        $design['return_policy'] = $snapshot['return_policy'] ?? null;
        $design['payment_details'] = $snapshot['payment_details'] ?? null;
        $design['footer_text'] = $snapshot['footer_text'] ?? ($design['footer_text'] ?? null);
        $design['signature_label'] = $snapshot['signature_text'] ?? ($design['signature_label'] ?? 'Authorized Signature');
        $design['show_qr'] = array_key_exists('show_qr', $snapshot) ? (bool) $snapshot['show_qr'] : true;
        $design['show_barcode'] = array_key_exists('show_barcode', $snapshot) ? (bool) $snapshot['show_barcode'] : true;
        $design['auto_print'] = array_key_exists('auto_print', $snapshot) ? (bool) $snapshot['auto_print'] : (bool) ($design['auto_print'] ?? false);
        return $design;
    }

    private function companySettings(array $settings): array
    {
        $general = $settings['general'] ?? [];
        return [
            'name' => $general['company_name'] ?? 'New Singapur Telecom',
            'address' => $general['company_address'] ?? '',
            'phone' => $general['company_phone'] ?? '',
            'email' => $general['company_email'] ?? '',
            'website' => $general['company_website'] ?? 'newsingapurtele.com',
            'vat_bin' => $general['vat_bin'] ?? '',
            'logo_url' => $general['logo_url'] ?? null,
            'currency_symbol' => $general['currency_symbol'] ?? 'BDT ',
        ];
    }

    private function money(mixed $value, string $currency = 'BDT '): string
    {
        $symbol = preg_replace('/[^\x20-\x7E]/', 'BDT ', $currency) ?: 'BDT ';
        return trim($symbol) . ' ' . number_format((float) ($value ?? 0), 2);
    }

    private function wrapText(string $text, int $width): array
    {
        $text = preg_replace('/\s+/', ' ', trim($text));
        if ($text === '') {
            return ['-'];
        }
        return explode("\n", wordwrap($text, $width, "\n", true));
    }

    private function buildPdf(array $lines): string
    {
        $content = "BT\n/F1 8.5 Tf\n36 805 Td\n12 TL\n";
        foreach ($lines as $line) {
            $content .= '(' . $this->pdfText($line) . ") Tj\nT*\n";
        }
        $content .= "ET";
        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>',
            '<< /Length ' . strlen($content) . " >>\nstream\n" . $content . "\nendstream",
        ];
        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $i => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($i + 1) . " 0 obj\n" . $object . "\nendobj\n";
        }
        $xref = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n0000000000 65535 f \n";
        for ($i = 1; $i <= count($objects); $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }
        return $pdf . "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF";
    }

    private function pdfText(mixed $value): string
    {
        $text = $this->pdfAscii((string) $value);
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $text);
    }

    /**
     * The built-in PDF writer uses the base-14 Helvetica font, which only covers ASCII here.
     * Transliterate common Unicode (৳, smart quotes, dashes, accents) instead of printing "?".
     */
    private function pdfAscii(string $text): string
    {
        $text = strtr($text, ['৳' => 'Tk ', '€' => 'EUR ', '£' => 'GBP ', '•' => '-', '·' => '-', '…' => '...', '–' => '-', '—' => '-', '‘' => "'", '’' => "'", '“' => '"', '”' => '"', "\u{00A0}" => ' ']);
        if (function_exists('iconv')) {
            $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
            if ($converted !== false) $text = $converted;
        }
        return preg_replace('/[^\x20-\x7E]/', '?', $text);
    }
}
