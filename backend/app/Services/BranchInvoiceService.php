<?php

namespace App\Services;

use App\Models\Branch;
use App\Models\BranchInvoiceProfile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class BranchInvoiceService
{
    public function __construct(private CorporateSettingService $settings)
    {
    }

    public function allocate(?int $branchId, ?int $userId = null): array
    {
        return DB::transaction(function () use ($branchId, $userId) {
            $branch = $branchId ? Branch::withTrashed()->find($branchId) : null;
            $profile = $branchId && Schema::hasTable('branch_invoice_profiles')
                ? BranchInvoiceProfile::query()->where('branch_id', $branchId)->first()
                : null;

            $prefix = $this->prefixFor($branch, $profile);
            $sequenceBranchId = $branchId ?: 0;
            $date = now()->toDateString();

            DB::table('branch_invoice_sequences')->insertOrIgnore([
                'branch_id' => $sequenceBranchId,
                'prefix' => $prefix,
                'sequence_date' => $date,
                'last_number' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $row = DB::table('branch_invoice_sequences')
                ->where('branch_id', $sequenceBranchId)
                ->where('prefix', $prefix)
                ->where('sequence_date', $date)
                ->lockForUpdate()
                ->first();

            $next = ((int) ($row->last_number ?? 0)) + 1;
            DB::table('branch_invoice_sequences')->where('id', $row->id)->update([
                'last_number' => $next,
                'updated_at' => now(),
            ]);

            return [
                'invoice_no' => $prefix . '-' . now()->format('Ymd') . '-' . str_pad((string) $next, 6, '0', STR_PAD_LEFT),
                'profile_id' => $profile?->id,
                'snapshot' => $this->snapshot($branch, $profile, $userId),
            ];
        }, 3);
    }

    public function snapshot(?Branch $branch, ?BranchInvoiceProfile $profile, ?int $userId = null): array
    {
        $general = $this->settings->section('general');
        $design = $this->settings->section('invoice_design');
        $custom = $profile && $profile->use_custom_profile;

        return [
            'profile_version' => 1,
            'branch_id' => $branch?->id,
            'branch_code' => $branch?->code,
            'branch_name' => $branch?->name,
            'use_custom_profile' => (bool) $custom,
            'business_name' => $custom && $profile->business_name ? $profile->business_name : ($general['company_name'] ?? 'New Singapur Telecom'),
            'short_name' => $custom && $profile->short_name ? $profile->short_name : 'NST',
            'logo_url' => $custom && $profile->logo_url ? $profile->logo_url : ($general['logo_url'] ?? null),
            'address' => $custom && $profile->address ? $profile->address : ($branch?->address ?: ($general['company_address'] ?? '')),
            'phone' => $custom && $profile->phone ? $profile->phone : ($branch?->phone ?: ($general['company_phone'] ?? '')),
            'email' => $custom && $profile->email ? $profile->email : ($branch?->email ?: ($general['company_email'] ?? '')),
            'website' => $custom && $profile->website ? $profile->website : ($general['company_website'] ?? ''),
            'vat_bin' => $custom && $profile->bin_vat ? $profile->bin_vat : ($general['vat_bin'] ?? ''),
            'currency_symbol' => $general['currency_symbol'] ?? '৳',
            'invoice_prefix' => $this->prefixFor($branch, $profile),
            'layout' => $custom && $profile->layout ? $profile->layout : ($design['page_size'] ?? $design['template'] ?? 'a4'),
            'orientation' => $custom && in_array(strtolower((string) ($profile->orientation ?? 'portrait')), ['portrait', 'landscape'], true)
                ? strtolower((string) ($profile->orientation ?? 'portrait'))
                : (in_array(strtolower((string) ($design['page_orientation'] ?? $design['orientation'] ?? 'portrait')), ['portrait', 'landscape'], true) ? strtolower((string) ($design['page_orientation'] ?? $design['orientation'] ?? 'portrait')) : 'portrait'),
            'payment_details' => $custom ? $profile->payment_details : null,
            'terms' => $custom && $profile->terms ? $profile->terms : ($design['terms'] ?? null),
            'warranty_terms' => $custom ? $profile->warranty_terms : null,
            'return_policy' => $custom ? $profile->return_policy : null,
            'footer_text' => $custom && $profile->footer_text ? $profile->footer_text : ($design['footer_text'] ?? null),
            'signature_text' => $custom && $profile->signature_text ? $profile->signature_text : ($design['signature_label'] ?? 'Authorized Signature'),
            'show_qr' => $profile ? (bool) $profile->show_qr : true,
            'show_barcode' => $profile ? (bool) $profile->show_barcode : true,
            'auto_print' => $profile ? (bool) $profile->auto_print : (bool) ($design['auto_print'] ?? false),
            'captured_by' => $userId,
            'captured_at' => now()->toIso8601String(),
        ];
    }

    private function prefixFor(?Branch $branch, ?BranchInvoiceProfile $profile): string
    {
        $requested = trim((string) ($profile?->invoice_prefix ?? ''));
        if ($requested !== '') {
            $clean = strtoupper(preg_replace('/[^A-Z0-9-]+/i', '-', $requested));
            return trim(substr($clean, 0, 32), '-') ?: 'NST-INV';
        }

        $code = trim((string) ($branch?->code ?: $branch?->name ?: 'PRIME'));
        $code = strtoupper(preg_replace('/[^A-Z0-9]+/i', '-', Str::ascii($code)));
        $code = trim($code, '-') ?: 'PRIME';
        return 'NST-' . substr($code, 0, 12);
    }
}
