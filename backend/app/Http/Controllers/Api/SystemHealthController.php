<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ReportFileExportService;
use App\Support\SimpleZipWriter;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;

class SystemHealthController extends Controller
{
    public function index(Request $request)
    {
        return response()->json($this->buildPayload());
    }

    public function export(Request $request, ReportFileExportService $exportService)
    {
        $format = strtolower((string) $request->get('format', 'xlsx'));
        $payload = $this->buildPayload();

        $headers = ['Group', 'Check', 'Status', 'Message', 'Details'];
        $rows = [];

        foreach ($payload['groups'] as $group) {
            foreach ($group['checks'] as $check) {
                $rows[] = [
                    'group' => $group['title'],
                    'check' => $check['name'],
                    'status' => strtoupper($check['status']),
                    'message' => $check['message'],
                    'details' => $this->detailsToText($check['details'] ?? null),
                ];
            }
        }

        if (empty($rows)) {
            $rows[] = [
                'group' => 'System',
                'check' => 'No Data',
                'status' => 'SKIPPED',
                'message' => 'No health check data generated.',
                'details' => '',
            ];
        }

        return $exportService->download(
            'NST System Health Report',
            $headers,
            $rows,
            $format,
            'nst_system_health_' . now()->format('Y_m_d_His')
        );
    }

    public function repair(Request $request)
    {
        $type = strtolower((string) $request->get('type', 'all'));

        $summary = [
            'sales_due_fixed' => 0,
            'purchase_due_fixed' => 0,
            'users_normalized' => 0,
        ];

        DB::transaction(function () use ($type, &$summary) {
            if (in_array($type, ['all', 'sales_due'], true)) {
                $summary['sales_due_fixed'] = $this->repairSalesDueMismatch();
            }

            if (in_array($type, ['all', 'purchase_due'], true)) {
                $summary['purchase_due_fixed'] = $this->repairPurchaseDueMismatch();
            }

            if (in_array($type, ['all', 'users'], true)) {
                $summary['users_normalized'] = $this->normalizeUsersForManagement();
            }
        });

        return response()->json([
            'status' => true,
            'message' => 'System health repair completed successfully.',
            'data' => $summary,
        ]);
    }

    private function buildPayload(): array
    {
        $groups = [];
        $groups[] = $this->environmentChecks();
        $groups[] = $this->databaseChecks();
        $groups[] = $this->moduleTableChecks();
        $groups[] = $this->routeChecks();
        $groups[] = $this->businessDataChecks();
        $groups[] = $this->storageChecks();

        $totals = [
            'passed' => 0,
            'failed' => 0,
            'warnings' => 0,
            'skipped' => 0,
        ];

        foreach ($groups as $groupIndex => $group) {
            $groupStatus = 'ok';

            foreach ($group['checks'] as $check) {
                if ($check['status'] === 'pass') {
                    $totals['passed']++;
                } elseif ($check['status'] === 'fail') {
                    $totals['failed']++;
                    $groupStatus = 'error';
                } elseif ($check['status'] === 'warning') {
                    $totals['warnings']++;
                    if ($groupStatus !== 'error') {
                        $groupStatus = 'warning';
                    }
                } else {
                    $totals['skipped']++;
                }
            }

            $groups[$groupIndex]['status'] = $groupStatus;
        }

        $overall = 'ok';
        if ($totals['failed'] > 0) {
            $overall = 'error';
        } elseif ($totals['warnings'] > 0) {
            $overall = 'warning';
        }

        return [
            'status' => true,
            'overall_status' => $overall,
            'generated_at' => now()->toDateTimeString(),
            'totals' => $totals,
            'summary' => $this->summaryCounts(),
            'groups' => $groups,
            'recommendations' => $this->recommendations($totals),
        ];
    }

    private function environmentChecks(): array
    {
        $checks = [];

        $checks[] = $this->check(
            version_compare(PHP_VERSION, '8.1.0', '>='),
            'PHP Version',
            'PHP ' . PHP_VERSION,
            ['minimum' => '8.1']
        );

        $checks[] = $this->check(
            extension_loaded('pdo_mysql'),
            'PDO MySQL Extension',
            extension_loaded('pdo_mysql') ? 'pdo_mysql enabled.' : 'pdo_mysql extension disabled.'
        );

        $xlsxReady = extension_loaded('zip') || class_exists(SimpleZipWriter::class);
        $checks[] = $this->check(
            $xlsxReady,
            'XLSX Export Engine',
            extension_loaded('zip')
                ? 'PHP ZIP extension enabled. XLSX export should work.'
                : 'PHP ZIP extension disabled, but built-in Pure PHP XLSX writer is available.',
            ['zip_extension' => extension_loaded('zip'), 'pure_php_writer' => class_exists(SimpleZipWriter::class)],
            $xlsxReady ? 'pass' : 'warning'
        );

        $checks[] = $this->check(
            config('app.key') !== null && config('app.key') !== '',
            'Laravel APP_KEY',
            config('app.key') ? 'APP_KEY found.' : 'APP_KEY missing. Run php artisan key:generate.'
        );

        $checks[] = [
            'name' => 'Application Mode',
            'status' => app()->environment('production') ? 'warning' : 'pass',
            'message' => 'APP_ENV=' . app()->environment() . ', APP_DEBUG=' . (config('app.debug') ? 'true' : 'false'),
            'details' => ['timezone' => config('app.timezone'), 'app_name' => config('app.name')],
        ];

        return [
            'key' => 'environment',
            'title' => 'Environment',
            'status' => 'ok',
            'checks' => $checks,
        ];
    }

    private function databaseChecks(): array
    {
        $checks = [];

        try {
            DB::connection()->getPdo();
            $checks[] = $this->check(true, 'Database Connection', 'Database connection successful.', [
                'connection' => config('database.default'),
                'database' => DB::connection()->getDatabaseName(),
            ]);
        } catch (\Throwable $exception) {
            $checks[] = $this->check(false, 'Database Connection', $exception->getMessage(), [
                'connection' => config('database.default'),
            ]);
        }

        $checks[] = $this->check(
            Schema::hasTable('migrations'),
            'Migrations Table',
            Schema::hasTable('migrations') ? 'migrations table found.' : 'migrations table missing. Run php artisan migrate.'
        );

        $checks[] = $this->check(
            Schema::hasTable('personal_access_tokens'),
            'Sanctum Tokens Table',
            Schema::hasTable('personal_access_tokens') ? 'Sanctum token table found.' : 'personal_access_tokens table missing. Run php artisan migrate.',
            [],
            Schema::hasTable('personal_access_tokens') ? 'pass' : 'warning'
        );

        return [
            'key' => 'database',
            'title' => 'Database',
            'status' => 'ok',
            'checks' => $checks,
        ];
    }

    private function moduleTableChecks(): array
    {
        $checks = [];

        $modules = [
            'Core Users & Access Management' => [
                'table' => 'users',
                'critical' => true,
                'columns' => ['id', 'name', 'email', 'username', 'phone', 'status', 'profile_type', 'must_change_password', 'temporary_password'],
            ],
            'Roles' => [
                'table' => 'roles',
                'critical' => true,
                'columns' => ['id', 'name'],
            ],
            'Branches' => [
                'table' => 'branches',
                'critical' => true,
                'columns' => ['id', 'name'],
            ],
            'Products' => [
                'table' => 'products',
                'critical' => true,
                'columns' => ['id', 'name'],
            ],
            'Branch Stock' => [
                'table' => 'branch_stocks',
                'critical' => true,
                'columns' => ['id', 'branch_id', 'product_id'],
            ],
            'Purchases' => [
                'table' => 'purchases',
                'critical' => true,
                'columns' => ['id', 'supplier_id', 'branch_id'],
            ],
            'Purchase Items' => [
                'table' => 'purchase_items',
                'critical' => true,
                'columns' => ['id', 'purchase_id', 'product_id'],
            ],
            'Device Units / IMEI' => [
                'table' => 'device_units',
                'critical' => true,
                'columns' => ['id', 'product_id', 'branch_id', 'purchase_cost', 'status'],
            ],
            'Sales' => [
                'table' => 'sales',
                'critical' => true,
                'columns' => ['id', 'branch_id', 'customer_id'],
            ],
            'Sale Items' => [
                'table' => 'sale_items',
                'critical' => true,
                'columns' => ['id', 'sale_id', 'product_id'],
            ],
            'Customers' => [
                'table' => 'customers',
                'critical' => true,
                'columns' => ['id', 'name'],
            ],
            'Suppliers' => [
                'table' => 'suppliers',
                'critical' => true,
                'columns' => ['id', 'name'],
            ],
            'Sale Payments' => [
                'table' => 'sale_payments',
                'critical' => false,
                'columns' => ['id', 'sale_id', 'amount'],
            ],
            'Customer Payments' => [
                'table' => 'customer_payments',
                'critical' => false,
                'columns' => ['id', 'customer_id', 'amount'],
            ],
            'Supplier Payments' => [
                'table' => 'supplier_payments',
                'critical' => false,
                'columns' => ['id', 'supplier_id', 'amount'],
            ],
            'Expenses' => [
                'table' => 'expenses',
                'critical' => false,
                'columns' => ['id', 'amount'],
            ],
            'Audit Logs' => [
                'table' => 'audit_logs',
                'critical' => false,
                'columns' => ['id', 'user_id', 'action', 'path'],
            ],
            'Settings' => [
                'table' => 'settings',
                'critical' => false,
                'columns' => ['id', 'key', 'value'],
            ],
        ];

        foreach ($modules as $moduleName => $module) {
            $table = $module['table'];
            $critical = (bool) $module['critical'];
            $exists = Schema::hasTable($table);

            if (! $exists) {
                $checks[] = $this->check(
                    false,
                    $moduleName,
                    $table . ' table missing.',
                    ['table' => $table, 'action' => 'php artisan migrate'],
                    $critical ? 'fail' : 'warning'
                );
                continue;
            }

            $missingColumns = [];
            foreach ($module['columns'] as $column) {
                if (! Schema::hasColumn($table, $column)) {
                    $missingColumns[] = $column;
                }
            }

            $checks[] = $this->check(
                empty($missingColumns),
                $moduleName,
                empty($missingColumns)
                    ? $table . ' table ready.'
                    : $table . ' table has missing columns: ' . implode(', ', $missingColumns),
                ['table' => $table, 'missing_columns' => $missingColumns],
                empty($missingColumns) ? 'pass' : ($critical ? 'fail' : 'warning')
            );
        }

        return [
            'key' => 'module_tables',
            'title' => 'Module Tables & Columns',
            'status' => 'ok',
            'checks' => $checks,
        ];
    }

    private function routeChecks(): array
    {
        $routes = collect(Route::getRoutes())->map(fn ($route) => $route->uri())->values()->all();
        $checks = [];

        $required = [
            'dashboard' => 'Dashboard API',
            'sales/search-products' => 'POS Product Search',
            'sales/available-devices' => 'Available IMEI Devices',
            'device-units' => 'Device Stock / IMEI',
            'reports/summary' => 'Reports Summary',
            'reports/export' => 'Report Export CSV/PDF/XLSX',
            'accounts/cashbook' => 'Accounts Cashbook',
            'accounts/due-center' => 'Accounts Due Center',
            'expenses' => 'Expense Module',
            'audit-logs' => 'Activity Logs',
            'settings' => 'Settings',
            'users/options' => 'Settings User Management Options',
            'users/{user}/reset-password' => 'Settings User Password Reset',
            'data-maintenance/overview' => 'Backup & Export Overview',
            'data-maintenance/export-table' => 'Table Export CSV/PDF/XLSX',
            'system-health' => 'System Health Check',
            'system-health/repair' => 'System Health Auto Repair',
        ];

        foreach ($required as $needle => $label) {
            $found = collect($routes)->contains(fn ($uri) => str_ends_with($uri, $needle) || str_contains($uri, '/' . $needle));
            $checks[] = $this->check(
                $found,
                $label,
                $found ? 'Route found.' : 'Route missing: ' . $needle,
                ['route' => $needle],
                $found ? 'pass' : 'warning'
            );
        }

        return [
            'key' => 'routes',
            'title' => 'API Routes',
            'status' => 'ok',
            'checks' => $checks,
        ];
    }

    private function businessDataChecks(): array
    {
        $checks = [];

        $checks[] = $this->countCheck('users', 'Users', 'System users');
        $checks[] = $this->countCheck('products', 'Products', 'Products in catalog');
        $checks[] = $this->countCheck('branches', 'Branches', 'Business branches');
        $checks[] = $this->countCheck('sales', 'Sales', 'Sales invoices');
        $checks[] = $this->countCheck('purchases', 'Purchases', 'Purchase entries');
        $checks[] = $this->countCheck('device_units', 'Device Units', 'IMEI/device stock rows');

        $checks[] = $this->negativeStockCheck();
        $checks[] = $this->duplicateImeiCheck('imei_1', 'Duplicate IMEI 1');
        $checks[] = $this->duplicateImeiCheck('imei_2', 'Duplicate IMEI 2');
        $checks[] = $this->soldDeviceWithoutSaleCheck();
        $checks[] = $this->purchaseItemCostCheck();
        $checks[] = $this->saleDueMismatchCheck();
        $checks[] = $this->purchaseDueMismatchCheck();

        return [
            'key' => 'business_data',
            'title' => 'Business Data Integrity',
            'status' => 'ok',
            'checks' => $checks,
        ];
    }

    private function storageChecks(): array
    {
        $checks = [];
        $paths = [
            'storage/app' => storage_path('app'),
            'storage/logs' => storage_path('logs'),
            'storage/framework' => storage_path('framework'),
        ];

        foreach ($paths as $label => $path) {
            $checks[] = $this->check(
                is_dir($path) && is_writable($path),
                $label,
                is_dir($path) && is_writable($path) ? __('messages.system_health.writable') : __('messages.system_health.not_writable'),
                ['path' => $path],
                is_dir($path) && is_writable($path) ? 'pass' : 'warning'
            );
        }

        $publicStorage = public_path('storage');
        $checks[] = $this->check(
            file_exists($publicStorage),
            'Public Storage Link',
            file_exists($publicStorage) ? 'public/storage exists.' : 'public/storage missing. Run php artisan storage:link if image upload is used.',
            ['path' => $publicStorage],
            file_exists($publicStorage) ? 'pass' : 'warning'
        );

        return [
            'key' => 'storage',
            'title' => 'Storage & Files',
            'status' => 'ok',
            'checks' => $checks,
        ];
    }

    private function summaryCounts(): array
    {
        $tables = ['users', 'products', 'branches', 'customers', 'suppliers', 'purchases', 'sales', 'device_units', 'expenses', 'audit_logs'];
        $summary = [];

        foreach ($tables as $table) {
            $summary[$table] = Schema::hasTable($table) ? (int) DB::table($table)->count() : null;
        }

        return $summary;
    }

    private function countCheck(string $table, string $name, string $message): array
    {
        if (! Schema::hasTable($table)) {
            return $this->check(false, $name, $table . ' table missing.', ['table' => $table], 'warning');
        }

        $count = (int) DB::table($table)->count();

        return $this->check(true, $name, $message . ': ' . $count, ['table' => $table, 'count' => $count]);
    }

    private function negativeStockCheck(): array
    {
        if (! Schema::hasTable('branch_stocks')) {
            return $this->skipped('Negative Branch Stock', 'branch_stocks table missing.');
        }

        $qtyColumn = $this->firstColumn('branch_stocks', ['quantity', 'qty', 'stock_qty', 'current_stock', 'available_stock']);
        if (! $qtyColumn) {
            return $this->skipped('Negative Branch Stock', 'No stock quantity column found.');
        }

        $count = (int) DB::table('branch_stocks')->where($qtyColumn, '<', 0)->count();

        return $this->check(
            $count === 0,
            'Negative Branch Stock',
            $count === 0 ? 'No negative branch stock found.' : $count . ' branch stock row(s) have negative quantity.',
            ['table' => 'branch_stocks', 'column' => $qtyColumn, 'rows' => $count],
            $count === 0 ? 'pass' : 'warning'
        );
    }

    private function duplicateImeiCheck(string $column, string $name): array
    {
        if (! Schema::hasTable('device_units') || ! Schema::hasColumn('device_units', $column)) {
            return $this->skipped($name, 'device_units.' . $column . ' column missing.');
        }

        $count = (int) DB::table('device_units')
            ->select($column)
            ->whereNotNull($column)
            ->where($column, '!=', '')
            ->groupBy($column)
            ->havingRaw('COUNT(*) > 1')
            ->get()
            ->count();

        return $this->check(
            $count === 0,
            $name,
            $count === 0 ? 'No duplicate IMEI found.' : $count . ' duplicate IMEI group(s) found.',
            ['column' => $column, 'duplicate_groups' => $count],
            $count === 0 ? 'pass' : 'warning'
        );
    }

    private function soldDeviceWithoutSaleCheck(): array
    {
        if (! Schema::hasTable('device_units') || ! Schema::hasColumn('device_units', 'status') || ! Schema::hasColumn('device_units', 'sale_id')) {
            return $this->skipped('Sold Device Without Sale ID', 'Required device_units columns missing.');
        }

        $count = (int) DB::table('device_units')
            ->where('status', 'sold')
            ->whereNull('sale_id')
            ->count();

        return $this->check(
            $count === 0,
            'Sold Device Without Sale ID',
            $count === 0 ? 'All sold devices have sale reference.' : $count . ' sold device row(s) missing sale_id.',
            ['rows' => $count],
            $count === 0 ? 'pass' : 'warning'
        );
    }

    private function purchaseItemCostCheck(): array
    {
        if (! Schema::hasTable('purchase_items') || ! Schema::hasTable('device_units')) {
            return $this->skipped('Purchase Item Device Cost Match', 'purchase_items or device_units table missing.');
        }

        foreach (['id', 'line_total'] as $column) {
            if (! Schema::hasColumn('purchase_items', $column)) {
                return $this->skipped('Purchase Item Device Cost Match', 'purchase_items.' . $column . ' column missing.');
            }
        }

        foreach (['purchase_item_id', 'purchase_cost'] as $column) {
            if (! Schema::hasColumn('device_units', $column)) {
                return $this->skipped('Purchase Item Device Cost Match', 'device_units.' . $column . ' column missing.');
            }
        }

        $rows = DB::table('purchase_items as pi')
            ->join('device_units as du', 'du.purchase_item_id', '=', 'pi.id')
            ->selectRaw('pi.id, COALESCE(pi.line_total,0) as line_total, SUM(COALESCE(du.purchase_cost,0)) as device_total')
            ->groupBy('pi.id', 'pi.line_total')
            ->havingRaw('ABS(COALESCE(pi.line_total,0) - SUM(COALESCE(du.purchase_cost,0))) > 0.99')
            ->limit(20)
            ->get();

        $count = $rows->count();

        return $this->check(
            $count === 0,
            'Purchase Item Device Cost Match',
            $count === 0 ? 'Purchase item line totals match device purchase cost totals.' : $count . ' purchase item row(s) have line_total mismatch.',
            ['sample_rows' => $rows->map(fn ($row) => (array) $row)->all()],
            $count === 0 ? 'pass' : 'warning'
        );
    }

    private function saleDueMismatchCheck(): array
    {
        if (! Schema::hasTable('sales')) {
            return $this->skipped('Sale Due Calculation', 'sales table missing.');
        }

        $totalColumn = $this->firstColumn('sales', ['grand_total', 'final_amount', 'total_amount', 'net_total']);
        if (! $totalColumn || ! Schema::hasColumn('sales', 'paid_amount') || ! Schema::hasColumn('sales', 'due_amount')) {
            return $this->skipped('Sale Due Calculation', 'Required sales amount columns missing.');
        }

        $query = DB::table('sales');

        if (Schema::hasColumn('sales', 'status')) {
            $query->whereNotIn('status', ['returned', 'cancelled', 'canceled', 'void']);
        }

        $cashBackSql = Schema::hasColumn('sales', 'cash_back_amount') ? 'COALESCE(cash_back_amount,0)' : '0';

        $count = (int) $query
            ->whereRaw('ABS((COALESCE(' . $totalColumn . ',0) + ' . $cashBackSql . ') - COALESCE(paid_amount,0) - COALESCE(due_amount,0)) > 1')
            ->count();

        return $this->check(
            $count === 0,
            'Sale Due Calculation',
            $count === 0 ? 'Sale due calculation looks consistent.' : $count . ' active sale row(s) may have due mismatch.',
            ['total_column' => $totalColumn, 'cash_back_considered' => Schema::hasColumn('sales', 'cash_back_amount'), 'rows' => $count],
            $count === 0 ? 'pass' : 'warning'
        );
    }

    private function purchaseDueMismatchCheck(): array
    {
        if (! Schema::hasTable('purchases')) {
            return $this->skipped('Purchase Due Calculation', 'purchases table missing.');
        }

        $totalColumn = $this->firstColumn('purchases', ['grand_total', 'purchase_amount', 'total_amount', 'net_total']);
        if (! $totalColumn || ! Schema::hasColumn('purchases', 'paid_amount') || ! Schema::hasColumn('purchases', 'due_amount')) {
            return $this->skipped('Purchase Due Calculation', 'Required purchases amount columns missing.');
        }

        $count = (int) DB::table('purchases')
            ->whereRaw('ABS(COALESCE(' . $totalColumn . ',0) - COALESCE(paid_amount,0) - COALESCE(due_amount,0)) > 1')
            ->count();

        return $this->check(
            $count === 0,
            'Purchase Due Calculation',
            $count === 0 ? 'Purchase due calculation looks consistent.' : $count . ' purchase row(s) may have due mismatch.',
            ['total_column' => $totalColumn, 'rows' => $count],
            $count === 0 ? 'pass' : 'warning'
        );
    }

    private function repairSalesDueMismatch(): int
    {
        if (! Schema::hasTable('sales')) {
            return 0;
        }

        $totalColumn = $this->firstColumn('sales', ['grand_total', 'final_amount', 'total_amount', 'net_total']);
        if (! $totalColumn || ! Schema::hasColumn('sales', 'paid_amount') || ! Schema::hasColumn('sales', 'due_amount')) {
            return 0;
        }

        $rows = DB::table('sales')->select('id', $totalColumn . ' as total_amount', 'paid_amount', 'due_amount');

        if (Schema::hasColumn('sales', 'cash_back_amount')) {
            $rows->addSelect('cash_back_amount');
        }

        if (Schema::hasColumn('sales', 'status')) {
            $rows->addSelect('status');
        }

        $fixed = 0;

        $rows->orderBy('id')->chunk(200, function ($sales) use (&$fixed) {
            foreach ($sales as $sale) {
                $status = strtolower((string) ($sale->status ?? 'completed'));
                $total = (float) ($sale->total_amount ?? 0);
                $paid = (float) ($sale->paid_amount ?? 0);

                if (in_array($status, ['returned', 'cancelled', 'canceled', 'void'], true)) {
                    $due = 0.0;
                    $cashBack = Schema::hasColumn('sales', 'cash_back_amount') ? max($paid - $total, 0) : null;
                } else {
                    $due = max($total - $paid, 0);
                    $cashBack = Schema::hasColumn('sales', 'cash_back_amount') ? max($paid - $total, 0) : null;
                }

                $currentDue = (float) ($sale->due_amount ?? 0);
                $currentCashBack = (float) ($sale->cash_back_amount ?? 0);
                $needsUpdate = abs($currentDue - $due) > 0.01;

                $data = ['due_amount' => round($due, 2)];

                if ($cashBack !== null) {
                    $data['cash_back_amount'] = round($cashBack, 2);
                    $needsUpdate = $needsUpdate || abs($currentCashBack - $cashBack) > 0.01;
                }

                if (Schema::hasColumn('sales', 'payment_status') && ! in_array($status, ['returned', 'cancelled', 'canceled', 'void'], true)) {
                    $data['payment_status'] = $due > 0 ? ($paid > 0 ? 'partial' : 'due') : 'paid';
                }

                if ($needsUpdate) {
                    if (Schema::hasColumn('sales', 'updated_at')) {
                        $data['updated_at'] = now();
                    }

                    DB::table('sales')->where('id', $sale->id)->update($data);
                    $fixed++;
                }
            }
        });

        return $fixed;
    }

    private function repairPurchaseDueMismatch(): int
    {
        if (! Schema::hasTable('purchases')) {
            return 0;
        }

        $totalColumn = $this->firstColumn('purchases', ['grand_total', 'purchase_amount', 'total_amount', 'net_total']);
        if (! $totalColumn || ! Schema::hasColumn('purchases', 'paid_amount') || ! Schema::hasColumn('purchases', 'due_amount')) {
            return 0;
        }

        $fixed = 0;

        DB::table('purchases')
            ->select('id', $totalColumn . ' as total_amount', 'paid_amount', 'due_amount')
            ->orderBy('id')
            ->chunk(200, function ($purchases) use (&$fixed) {
                foreach ($purchases as $purchase) {
                    $total = (float) ($purchase->total_amount ?? 0);
                    $paid = (float) ($purchase->paid_amount ?? 0);
                    $due = max($total - $paid, 0);

                    if (abs(((float) ($purchase->due_amount ?? 0)) - $due) <= 0.01) {
                        continue;
                    }

                    $data = ['due_amount' => round($due, 2)];
                    if (Schema::hasColumn('purchases', 'payment_status')) {
                        $data['payment_status'] = $due > 0 ? ($paid > 0 ? 'partial' : 'due') : 'paid';
                    }
                    if (Schema::hasColumn('purchases', 'updated_at')) {
                        $data['updated_at'] = now();
                    }

                    DB::table('purchases')->where('id', $purchase->id)->update($data);
                    $fixed++;
                }
            });

        return $fixed;
    }

    private function normalizeUsersForManagement(): int
    {
        if (! Schema::hasTable('users')) {
            return 0;
        }

        $fixed = 0;
        $updates = [];

        if (Schema::hasColumn('users', 'status')) {
            $count = DB::table('users')->whereNull('status')->orWhere('status', '')->update(['status' => 'active']);
            $fixed += (int) $count;
        }

        if (Schema::hasColumn('users', 'profile_type')) {
            $count = DB::table('users')->whereNull('profile_type')->orWhere('profile_type', '')->update(['profile_type' => 'staff']);
            $fixed += (int) $count;
        }

        if (Schema::hasColumn('users', 'username')) {
            DB::table('users')
                ->select('id', 'email', 'username')
                ->whereNull('username')
                ->orWhere('username', '')
                ->orderBy('id')
                ->chunk(100, function ($users) use (&$fixed) {
                    foreach ($users as $user) {
                        $base = strtolower(preg_replace('/[^a-zA-Z0-9_]+/', '_', strtok((string) $user->email, '@') ?: 'user')) ?: 'user';
                        $username = $base;
                        $counter = 1;

                        while (DB::table('users')->where('username', $username)->where('id', '!=', $user->id)->exists()) {
                            $counter++;
                            $username = $base . '_' . $counter;
                        }

                        DB::table('users')->where('id', $user->id)->update(['username' => $username]);
                        $fixed++;
                    }
                });
        }

        return $fixed;
    }

    private function firstColumn(string $table, array $columns): ?string
    {
        if (! Schema::hasTable($table)) {
            return null;
        }

        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                return $column;
            }
        }

        return null;
    }

    private function check(bool $passed, string $name, string $message, array $details = [], ?string $forcedStatus = null): array
    {
        return [
            'name' => $name,
            'status' => $forcedStatus ?: ($passed ? 'pass' : 'fail'),
            'message' => $message,
            'details' => $details,
        ];
    }

    private function skipped(string $name, string $message, array $details = []): array
    {
        return [
            'name' => $name,
            'status' => 'skipped',
            'message' => $message,
            'details' => $details,
        ];
    }

    private function recommendations(array $totals): array
    {
        $items = [];

        if ($totals['failed'] > 0) {
            $items[] = __('messages.system_health.recommend_fix_failed');
        }

        if ($totals['warnings'] > 0) {
            $items[] = __('messages.system_health.recommend_review_warnings');
        }

        $items[] = __('messages.system_health.recommend_pre_production_test');

        return $items;
    }

    private function detailsToText(mixed $details): string
    {
        if (empty($details)) {
            return '';
        }

        if (is_array($details) || is_object($details)) {
            return json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }

        return (string) $details;
    }
}
