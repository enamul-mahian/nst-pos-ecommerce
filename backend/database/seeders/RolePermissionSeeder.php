<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        app()[\Spatie\Permission\PermissionRegistrar::class]->forgetCachedPermissions();

        $permissions = [
            // Product / Device / Stock
            'product.create', 'product.edit', 'product.delete', 'product.view',
            'stock.view', 'stock.manage', 'device.purchase.create', 'device.verify.approve', 'device.verify.reject', 'device.verify.view',

            // Purchase / Sale / Order
            'purchase.create', 'purchase.view', 'purchase.manage',
            'sale.create', 'sale.view', 'sale.manage', 'sale.return',
            'order.create', 'order.view', 'order.manage',

            // Customer / Supplier / Salesman management
            'customer.manage', 'supplier.manage', 'salesman.manage',

            // Sensitive data
            'fingerprint.view', 'nid.view',

            // Accounts / Reports
            'report.view.accounts', 'report.view.sales', 'report.view.all',
            'expense.manage', 'transaction.manage', 'payment.manage', 'audit.view',

            // CMS / Settings / Users
            'banner.manage', 'page.manage', 'settings.manage', 'user.manage',

            // Role/Permission management
            'role.manage', 'permission.manage',
        ];

        foreach (array_unique($permissions) as $permission) {
            Permission::firstOrCreate(['name' => $permission, 'guard_name' => 'web']);
        }

        $roles = [
            'super_admin' => Permission::pluck('name')->all(),
            'admin' => [
                'product.create', 'product.edit', 'product.delete', 'product.view',
                'stock.view', 'stock.manage', 'device.purchase.create', 'device.verify.approve', 'device.verify.reject', 'device.verify.view',
                'purchase.create', 'purchase.view', 'purchase.manage',
                'sale.create', 'sale.view', 'sale.manage', 'sale.return',
                'order.create', 'order.view', 'order.manage',
                'customer.manage', 'supplier.manage', 'salesman.manage',
                'nid.view',
                'report.view.sales', 'report.view.all', 'audit.view',
                'banner.manage', 'page.manage', 'settings.manage', 'user.manage',
            ],
            'accounts' => [
                'purchase.view', 'sale.view', 'order.view', 'supplier.manage', 'customer.manage',
                'report.view.accounts', 'report.view.sales', 'report.view.all',
                'expense.manage', 'transaction.manage', 'payment.manage', 'audit.view',
            ],
            'accountant' => [
                'purchase.view', 'sale.view', 'order.view', 'supplier.manage', 'customer.manage',
                'report.view.accounts', 'report.view.sales', 'report.view.all',
                'expense.manage', 'transaction.manage', 'payment.manage', 'audit.view',
            ],
            'branch_manager' => [
                'product.view', 'stock.view', 'device.purchase.create', 'order.create', 'order.view',
                'sale.create', 'sale.view', 'sale.return', 'customer.manage', 'report.view.sales',
            ],
            'salesman' => [
                'product.view', 'stock.view', 'order.create', 'order.view', 'sale.create', 'sale.view', 'device.purchase.create',
            ],
            'supplier' => [
                'order.view',
            ],
            'customer' => [
                'order.create', 'order.view',
            ],
        ];

        foreach ($roles as $roleName => $rolePermissions) {
            $role = Role::firstOrCreate(['name' => $roleName, 'guard_name' => 'web']);
            $role->syncPermissions($rolePermissions);
        }

        $this->command?->info('NST roles, permissions and user-management permissions seeded successfully.');
    }
}
