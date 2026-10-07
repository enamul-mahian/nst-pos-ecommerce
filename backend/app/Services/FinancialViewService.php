<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class FinancialViewService
{
    private const FINANCIAL_KEYS = [
        'amount', 'total', 'subtotal', 'grand_total', 'net_total', 'gross_total', 'balance',
        'opening_balance', 'current_balance', 'due', 'paid', 'payable', 'receivable', 'profit',
        'purchase_price', 'sale_price', 'unit_price', 'line_total', 'cash_in', 'cash_out',
        'income', 'expense', 'tax', 'discount', 'delivery_cost', 'commission', 'bonus',
        'basic_salary', 'net_salary', 'debit', 'credit', 'value', 'cost', 'price',
    ];

    public function resolve($user, string $moduleKey = '*'): array
    {
        $access = app(AccessControlService::class);
        if ($access->isSuperAdmin($user)) {
            return $this->policy('full_actual', null, 'super_admin');
        }
        if (! Schema::hasTable('financial_view_policies')) {
            return $this->policy('none', null, 'missing_policy_table');
        }

        $roles = [];
        try {
            $roles = method_exists($user, 'roles') ? $user->roles()->pluck('roles.id')->map(fn ($id) => (int) $id)->all() : [];
        } catch (\Throwable) {
            $roles = [];
        }

        $base = DB::table('financial_view_policies')->where('enabled', true)
            ->whereIn('module_key', [$moduleKey, '*'])
            ->where(function ($query) use ($user) {
                $query->whereNull('branch_id');
                if (! empty($user->branch_id)) $query->orWhere('branch_id', $user->branch_id);
            });

        $row = (clone $base)->where('subject_type', 'user')->where('subject_id', $user->id)
            ->orderByRaw('CASE WHEN module_key = ? THEN 0 ELSE 1 END', [$moduleKey])->latest('id')->first();
        if (! $row && $roles !== []) {
            $row = (clone $base)->where('subject_type', 'role')->whereIn('subject_id', $roles)
                ->orderByRaw("CASE mode WHEN 'none' THEN 0 WHEN 'restricted' THEN 1 ELSE 2 END")
                ->orderByRaw('CASE WHEN module_key = ? THEN 0 ELSE 1 END', [$moduleKey])->latest('id')->first();
        }
        if (! $row) {
            $row = (clone $base)->where('subject_type', 'everyone')->whereNull('subject_id')
                ->orderByRaw('CASE WHEN module_key = ? THEN 0 ELSE 1 END', [$moduleKey])->latest('id')->first();
        }
        if (! $row) return $this->policy('none', null, 'deny_by_default');

        $mode = in_array($row->mode, ['full_actual', 'restricted', 'none'], true) ? $row->mode : 'none';
        $percent = $mode === 'restricted' ? min(60, max(40, (int) ($row->reduction_percent ?: 50))) : null;
        return $this->policy($mode, $percent, 'database_policy', (int) $row->id, (string) ($row->deterministic_seed ?: 'nst-financial-view'));
    }

    public function transform(mixed $value, array $policy, string $path = 'data', string|int|null $recordKey = null): mixed
    {
        if (($policy['mode'] ?? 'none') !== 'restricted') return $value;
        if (is_object($value)) $value = (array) $value;
        if (! is_array($value)) return $value;

        $result = [];
        $localRecord = $recordKey ?? ($value['id'] ?? $value['uuid'] ?? $value['invoice_no'] ?? $path);
        foreach ($value as $key => $item) {
            $childPath = $path . '.' . $key;
            if ($this->isFinancialKey((string) $key) && is_numeric($item)) {
                $percent = $this->deterministicPercent($policy, (string) $localRecord, $childPath);
                $result[$key] = round(((float) $item) * (1 - ($percent / 100)), 2);
                continue;
            }
            $result[$key] = (is_array($item) || is_object($item))
                ? $this->transform($item, $policy, $childPath, is_array($item) ? ($item['id'] ?? $localRecord) : $localRecord)
                : $item;
        }
        return $result;
    }

    public function auditMetadata(array $policy): array
    {
        return [
            'financial_view_mode' => $policy['mode'],
            'financial_values_are_restricted' => $policy['mode'] === 'restricted',
            'reduction_range' => $policy['mode'] === 'restricted' ? '40-60%' : null,
            'policy_source' => $policy['source'],
        ];
    }

    private function isFinancialKey(string $key): bool
    {
        $key = strtolower($key);
        foreach (self::FINANCIAL_KEYS as $needle) {
            if ($key === $needle || str_ends_with($key, '_' . $needle) || str_contains($key, $needle . '_')) return true;
        }
        return false;
    }

    private function deterministicPercent(array $policy, string $recordKey, string $path): int
    {
        if (! empty($policy['fixed_percent'])) return (int) $policy['fixed_percent'];
        $seed = ($policy['seed'] ?? 'nst-financial-view') . '|' . $recordKey . '|' . $path;
        return 40 + (abs(crc32($seed)) % 21);
    }

    private function policy(string $mode, ?int $percent, string $source, ?int $id = null, string $seed = 'nst-financial-view'): array
    {
        return ['mode' => $mode, 'fixed_percent' => $percent, 'source' => $source, 'policy_id' => $id, 'seed' => $seed];
    }
}
