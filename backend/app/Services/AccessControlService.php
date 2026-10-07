<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Throwable;

class AccessControlService
{
    public const COST_ROLES = ['super_admin', 'admin', 'accountant'];
    public const STAFF_POS_ROLES = ['super_admin', 'admin', 'accountant', 'salesman', 'branch_manager', 'staff'];

    public function roleNames($user): array
    {
        if (! $user) {
            return [];
        }

        $roles = [];

        try {
            if (method_exists($user, 'getRoleNames')) {
                $roles = array_merge($roles, $user->getRoleNames()->toArray());
            }
        } catch (Throwable $exception) {
            // Keep access checks resilient if Spatie cache/table is not ready.
        }

        foreach (['role', 'user_type', 'type', 'profile_type'] as $field) {
            if (! empty($user->{$field})) {
                $roles[] = $user->{$field};
            }
        }

        return collect($roles)
            ->map(fn ($role) => $this->normalizeRole((string) $role))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    public function normalizeRole(?string $role): string
    {
        $normalized = str_replace([' ', '-'], '_', strtolower(trim((string) $role)));

        return $normalized === 'accounts' ? 'accountant' : $normalized;
    }

    public function hasAnyRole($user, array $roles): bool
    {
        $wanted = collect($roles)->map(fn ($role) => $this->normalizeRole($role))->all();
        return count(array_intersect($this->roleNames($user), $wanted)) > 0;
    }

    public function isSuperAdmin($user): bool
    {
        return $this->hasAnyRole($user, ['super_admin', 'super admin']);
    }

    public function isAdmin($user): bool
    {
        return $this->hasAnyRole($user, ['super_admin', 'admin']);
    }

    public function isSalesman($user): bool
    {
        return $this->hasAnyRole($user, ['salesman', 'sales_man', 'sales man']);
    }

    public function isBranchManager($user): bool
    {
        return $this->hasAnyRole($user, ['branch_manager', 'branch manager']);
    }

    public function isSupplierOnly($user): bool
    {
        $roles = $this->roleNames($user);
        return in_array('supplier', $roles, true) && count(array_intersect($roles, self::STAFF_POS_ROLES)) === 0;
    }

    public function isCustomerOnly($user): bool
    {
        $roles = $this->roleNames($user);
        return in_array('customer', $roles, true) && count(array_intersect($roles, self::STAFF_POS_ROLES)) === 0;
    }

    public function canAccessPos($user): bool
    {
        if (! $user) {
            return false;
        }

        if ($this->isSupplierOnly($user) || $this->isCustomerOnly($user)) {
            return false;
        }

        if ($this->hasAnyRole($user, self::STAFF_POS_ROLES)) {
            return true;
        }

        $access = $this->userAccess($user);
        return (bool) (data_get($access, 'sidebar_permissions.pos_sale', false) || data_get($access, 'sidebar_permissions.pos_access', false));
    }

    public function canViewPurchasePrice($user): bool
    {
        if (! $user || $this->isSalesman($user) || $this->isSupplierOnly($user) || $this->isCustomerOnly($user)) {
            return false;
        }

        if ($this->hasAnyRole($user, self::COST_ROLES)) {
            return true;
        }

        $access = $this->userAccess($user);
        return (bool) data_get($access, 'financial_permissions.view_purchase_price', false);
    }

    public function canViewUsedPurchaseBuyingPrice($user): bool
    {
        if (! $user || $this->isSalesman($user) || $this->isSupplierOnly($user) || $this->isCustomerOnly($user)) {
            return false;
        }

        return $this->hasAnyRole($user, ['super_admin', 'admin', 'accountant', 'branch_manager']);
    }

    public function canViewProfit($user): bool
    {
        if (! $user || $this->isSalesman($user) || $this->isBranchManager($user) || $this->isSupplierOnly($user) || $this->isCustomerOnly($user)) {
            return false;
        }

        if ($this->hasAnyRole($user, self::COST_ROLES)) {
            return true;
        }

        $access = $this->userAccess($user);
        return (bool) data_get($access, 'financial_permissions.view_profit', false);
    }

    public function canViewSupplierInfo($user): bool
    {
        if (! $user || $this->isSalesman($user) || $this->isSupplierOnly($user) || $this->isCustomerOnly($user)) {
            return false;
        }

        return $this->hasAnyRole($user, ['super_admin', 'admin', 'accountant', 'branch_manager']);
    }

    public function canManageProducts($user): bool
    {
        if (! $user || $this->isSalesman($user) || $this->hasAnyRole($user, ['accountant']) || $this->isSupplierOnly($user) || $this->isCustomerOnly($user)) {
            return false;
        }

        return $this->hasAnyRole($user, ['super_admin', 'admin', 'branch_manager']);
    }

    public function canManageCatalog($user): bool
    {
        if (! $user || $this->isSalesman($user) || $this->isSupplierOnly($user) || $this->isCustomerOnly($user)) {
            return false;
        }

        return $this->hasAnyRole($user, ['super_admin', 'admin']);
    }

    public function canViewCustomerDatabase($user): bool
    {
        if (! $user || $this->isSalesman($user) || $this->isSupplierOnly($user) || $this->isCustomerOnly($user)) {
            return false;
        }

        return $this->hasAnyRole($user, ['super_admin', 'admin', 'accountant', 'branch_manager']);
    }

    public function canUseAccountingGlobalScope($user): bool
    {
        if ($this->hasAnyRole($user, ['super_admin', 'admin', 'accountant'])) {
            return true;
        }

        $access = $this->userAccess($user);
        return (bool) data_get($access, 'financial_permissions.accounting_global_scope', false);
    }

    public function userAccess($user): array
    {
        if (! $user || ! Schema::hasTable('user_access_controls')) {
            return [];
        }

        try {
            $row = DB::table('user_access_controls')->where('user_id', $user->id)->first();
            if (! $row) {
                return [];
            }

            return [
                'dashboard_permissions' => $this->jsonToArray($row->dashboard_permissions ?? null),
                'sidebar_permissions' => $this->jsonToArray($row->sidebar_permissions ?? null),
                'column_permissions' => $this->jsonToArray($row->column_permissions ?? null),
                'branch_ids' => $this->jsonToArray($row->branch_ids ?? null),
                'financial_permissions' => $this->jsonToArray($row->financial_permissions ?? null),
            ];
        } catch (Throwable $exception) {
            report($exception);
            return [];
        }
    }

    public function defaultAccessForRoles(array $roles): array
    {
        $normalizedRoles = collect($roles)->map(fn ($role) => $this->normalizeRole($role))->all();
        $isCostRole = count(array_intersect($normalizedRoles, self::COST_ROLES)) > 0;
        $isAccountant = in_array('accountant', $normalizedRoles, true);

        return [
            'dashboard_permissions' => [
                'show_financial_cards' => $isCostRole,
                'show_stock_cards' => true,
                'show_sales_cards' => true,
            ],
            'sidebar_permissions' => [
                'pos_sale' => count(array_intersect($normalizedRoles, self::STAFF_POS_ROLES)) > 0,
                'two_factor' => count(array_intersect($normalizedRoles, self::STAFF_POS_ROLES)) > 0,
                'product_upload' => count(array_intersect($normalizedRoles, ['super_admin', 'admin', 'branch_manager'])) > 0,
                'website_control_center' => in_array('super_admin', $normalizedRoles, true),
                'security_center' => count(array_intersect($normalizedRoles, ['super_admin', 'admin'])) > 0,
                'patch_manager' => in_array('super_admin', $normalizedRoles, true),
            ],
            'column_permissions' => [
                'purchase_price' => $isCostRole,
                'profit' => $isCostRole,
            ],
            'branch_ids' => [],
            'financial_permissions' => [
                'view_purchase_price' => $isCostRole,
                'view_profit' => $isCostRole,
                'view_supplier_due' => $isCostRole,
                'update_supplier_due' => $isAccountant || count(array_intersect($normalizedRoles, ['super_admin', 'admin'])) > 0,
                'accounting_global_scope' => $isCostRole,
            ],
        ];
    }

    private function jsonToArray($value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (is_object($value)) {
            return (array) $value;
        }

        if (! is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }
}
