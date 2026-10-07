<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\FinancialViewService;
use App\Services\ReportFileExportService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReportExportController extends Controller
{
    public function __construct(private ReportFileExportService $exporter, private FinancialViewService $financialView)
    {
    }

    public function export(Request $request)
    {
        $format = strtolower($request->query('format', 'xlsx'));
        $reportType = strtolower(str_replace('_', '-', $request->query('report_type', $request->query('type', 'sales'))));

        if (! in_array($format, ['csv', 'xlsx', 'pdf'], true)) {
            return response()->json(['status' => false, 'message' => 'Format must be csv, xlsx or pdf.'], 422);
        }

        [$headers, $rows, $title] = $this->dataset($reportType, $request);
        $policy = $request->attributes->get('nst_financial_view_policy', ['mode' => 'full_actual']);
        if (($policy['mode'] ?? 'full_actual') === 'restricted') {
            $rows = $this->financialView->transform($rows, $policy, 'reports.export.' . $reportType);
            $title .= ' — Restricted Financial View';
        }

        return $this->exporter->download(
            $title,
            $headers,
            $rows,
            $format,
            'nst_' . str_replace('-', '_', $reportType) . '_' . now()->format('Y_m_d_His')
        );
    }

    private function dataset(string $reportType, Request $request): array
    {
        return match ($reportType) {
            'summary' => $this->summaryRows($request),
            'sales' => $this->salesRows($request),
            'purchases' => $this->purchaseRows($request),
            'stock' => $this->stockRows($request),
            'device-units', 'imei-stock' => $this->deviceRows($request),
            'profit-loss', 'profit' => $this->profitLossRows($request),
            'branch-wise', 'branches' => $this->branchWiseRows($request),
            'customer-due', 'customer-dues' => $this->customerDueRows($request),
            'supplier-due', 'supplier-dues' => $this->supplierDueRows($request),
            'expenses' => $this->expenseRows($request),
            'salesmen', 'salesman-sales' => $this->salesmanRows($request),
            'cashbook' => $this->cashbookRows($request),
            'customer-collections', 'customer-payments' => $this->customerPaymentRows($request),
            'supplier-payments' => $this->supplierPaymentRows($request),
            'audit-logs', 'activity-logs' => $this->auditRows($request),
            default => $this->salesRows($request),
        };
    }

    private function summaryRows(Request $request): array
    {
        [$from, $to] = $this->dateRange($request);
        $sales = $this->sumTable('sales', $this->firstColumn('sales', ['grand_total', 'total_amount', 'final_amount', 'net_total']), $from, $to);
        $paid = $this->sumTable('sales', 'paid_amount', $from, $to);
        $due = $this->sumTable('sales', 'due_amount', $from, $to);
        $profit = $this->sumTable('sales', 'profit_amount', $from, $to);
        $purchase = $this->sumTable('purchases', $this->firstColumn('purchases', ['grand_total', 'total_amount', 'purchase_amount', 'net_total']), $from, $to);
        $expense = $this->sumTable('expenses', $this->firstColumn('expenses', ['amount', 'expense_amount']), $from, $to);

        $headers = ['Metric', 'Amount', 'Date From', 'Date To'];
        $rows = [
            ['metric' => 'Sales Amount', 'amount' => $sales, 'date_from' => $from->toDateString(), 'date_to' => $to->toDateString()],
            ['metric' => 'Sales Paid', 'amount' => $paid, 'date_from' => $from->toDateString(), 'date_to' => $to->toDateString()],
            ['metric' => 'Sales Due', 'amount' => $due, 'date_from' => $from->toDateString(), 'date_to' => $to->toDateString()],
            ['metric' => 'Purchase Amount', 'amount' => $purchase, 'date_from' => $from->toDateString(), 'date_to' => $to->toDateString()],
            ['metric' => 'Expenses', 'amount' => $expense, 'date_from' => $from->toDateString(), 'date_to' => $to->toDateString()],
            ['metric' => 'Gross Profit', 'amount' => $profit, 'date_from' => $from->toDateString(), 'date_to' => $to->toDateString()],
            ['metric' => 'Net Profit', 'amount' => $profit - $expense, 'date_from' => $from->toDateString(), 'date_to' => $to->toDateString()],
        ];

        return [$headers, $rows, 'NST Summary Report'];
    }

    private function salesRows(Request $request): array
    {
        if (! Schema::hasTable('sales')) {
            return [['Message'], [['message' => 'sales table not found']], 'NST Sales Report'];
        }

        [$from, $to] = $this->dateRange($request);
        $amountColumn = $this->firstColumn('sales', ['grand_total', 'total_amount', 'final_amount', 'net_total']);

        $query = DB::table('sales')
            ->leftJoin('customers', fn ($join) => $this->joinIf($join, 'sales', 'customer_id', 'customers'))
            ->leftJoin('branches', fn ($join) => $this->joinIf($join, 'sales', 'branch_id', 'branches'))
            ->leftJoin('users as sold_users', function ($join) {
                if (Schema::hasColumn('sales', 'sold_by')) {
                    $join->on('sold_users.id', '=', 'sales.sold_by');
                }
            })
            ->selectRaw('sales.id as id')
            ->selectRaw($this->selectColumn('sales', ['invoice_no', 'invoice_number', 'sale_no'], 'sales.id') . ' as invoice_no')
            ->selectRaw($this->selectColumn('sales', ['created_at'], "''") . ' as date')
            ->selectRaw($this->selectColumn('branches', ['name'], "''") . ' as branch')
            ->selectRaw($this->selectColumn('customers', ['name'], "''") . ' as customer')
            ->selectRaw($this->selectColumn('customers', ['phone', 'mobile'], "''") . ' as customer_phone')
            ->selectRaw($this->selectColumn('sold_users', ['name'], "''") . ' as sold_by')
            ->selectRaw('COALESCE(sales.' . $amountColumn . ',0) as amount')
            ->selectRaw($this->numericSelect('sales', 'paid_amount') . ' as paid_amount')
            ->selectRaw($this->numericSelect('sales', 'due_amount') . ' as due_amount')
            ->selectRaw($this->numericSelect('sales', 'profit_amount') . ' as profit_amount')
            ->selectRaw($this->selectColumn('sales', ['payment_method'], "''") . ' as payment_method')
            ->selectRaw($this->selectColumn('sales', ['payment_status'], "''") . ' as payment_status')
            ->selectRaw($this->selectColumn('sales', ['status'], "''") . ' as status');

        $this->applyDate($query, 'sales', $from, $to);

        return [[
            'Invoice No', 'Date', 'Branch', 'Customer', 'Customer Phone', 'Sold By', 'Amount', 'Paid Amount', 'Due Amount', 'Profit Amount', 'Payment Method', 'Payment Status', 'Status'
        ], $query->orderByDesc('sales.id')->limit($this->limit($request))->get()->map(fn ($row) => (array) $row)->all(), 'NST Sales Report'];
    }

    private function purchaseRows(Request $request): array
    {
        if (! Schema::hasTable('purchases')) {
            return [['Message'], [['message' => 'purchases table not found']], 'NST Purchase Report'];
        }

        [$from, $to] = $this->dateRange($request);
        $amountColumn = $this->firstColumn('purchases', ['grand_total', 'total_amount', 'purchase_amount', 'net_total']);

        $query = DB::table('purchases')
            ->leftJoin('suppliers', fn ($join) => $this->joinIf($join, 'purchases', 'supplier_id', 'suppliers'))
            ->leftJoin('branches', fn ($join) => $this->joinIf($join, 'purchases', 'branch_id', 'branches'))
            ->selectRaw($this->selectColumn('purchases', ['purchase_no', 'reference_no', 'invoice_no'], 'purchases.id') . ' as purchase_no')
            ->selectRaw($this->selectColumn('purchases', ['created_at'], "''") . ' as date')
            ->selectRaw($this->selectColumn('suppliers', ['name'], "''") . ' as supplier')
            ->selectRaw($this->selectColumn('suppliers', ['phone', 'mobile'], "''") . ' as supplier_phone')
            ->selectRaw($this->selectColumn('branches', ['name'], "''") . ' as branch')
            ->selectRaw('COALESCE(purchases.' . $amountColumn . ',0) as amount')
            ->selectRaw($this->numericSelect('purchases', 'paid_amount') . ' as paid_amount')
            ->selectRaw($this->numericSelect('purchases', 'due_amount') . ' as due_amount')
            ->selectRaw($this->selectColumn('purchases', ['payment_status'], "''") . ' as payment_status')
            ->selectRaw($this->selectColumn('purchases', ['status'], "''") . ' as status');

        $this->applyDate($query, 'purchases', $from, $to);

        return [['Purchase No', 'Date', 'Supplier', 'Supplier Phone', 'Branch', 'Amount', 'Paid Amount', 'Due Amount', 'Payment Status', 'Status'], $query->orderByDesc('purchases.id')->limit($this->limit($request))->get()->map(fn ($row) => (array) $row)->all(), 'NST Purchase Report'];
    }

    private function stockRows(Request $request): array
    {
        if (! Schema::hasTable('branch_stocks')) {
            return [['Message'], [['message' => 'branch_stocks table not found']], 'NST Stock Report'];
        }

        $qty = $this->firstColumn('branch_stocks', ['quantity', 'qty', 'stock_qty', 'current_stock', 'available_stock']);
        $query = DB::table('branch_stocks')
            ->leftJoin('branches', fn ($join) => $this->joinIf($join, 'branch_stocks', 'branch_id', 'branches'))
            ->leftJoin('products', fn ($join) => $this->joinIf($join, 'branch_stocks', 'product_id', 'products'))
            ->selectRaw($this->selectColumn('branches', ['name'], "''") . ' as branch')
            ->selectRaw($this->selectColumn('products', ['name'], "''") . ' as product')
            ->selectRaw($this->selectColumn('products', ['sku'], "''") . ' as sku')
            ->selectRaw($this->selectColumn('products', ['barcode'], "''") . ' as barcode')
            ->selectRaw('COALESCE(branch_stocks.' . $qty . ',0) as quantity')
            ->selectRaw($this->numericSelect('branch_stocks', 'unit_cost') . ' as unit_cost')
            ->selectRaw($this->selectColumn('branch_stocks', ['updated_at'], "''") . ' as last_updated');

        return [['Branch', 'Product', 'SKU', 'Barcode', 'Quantity', 'Unit Cost', 'Last Updated'], $query->orderByDesc('quantity')->limit($this->limit($request))->get()->map(fn ($row) => (array) $row)->all(), 'NST Stock Report'];
    }

    private function deviceRows(Request $request): array
    {
        if (! Schema::hasTable('device_units')) {
            return [['Message'], [['message' => 'device_units table not found']], 'NST Device IMEI Stock Report'];
        }

        $canSeeCost = $this->canSeeCost($request);
        $query = DB::table('device_units')
            ->leftJoin('products', fn ($join) => $this->joinIf($join, 'device_units', 'product_id', 'products'))
            ->leftJoin('branches', fn ($join) => $this->joinIf($join, 'device_units', 'branch_id', 'branches'))
            ->leftJoin('suppliers', fn ($join) => $this->joinIf($join, 'device_units', 'supplier_id', 'suppliers'))
            ->selectRaw($this->selectColumn('products', ['name'], "''") . ' as product')
            ->selectRaw($this->selectColumn('branches', ['name'], "''") . ' as branch')
            ->selectRaw($this->selectColumn('suppliers', ['name'], "''") . ' as supplier')
            ->selectRaw($this->selectColumn('device_units', ['imei_1', 'imei1'], "''") . ' as imei_1')
            ->selectRaw($this->selectColumn('device_units', ['imei_2', 'imei2'], "''") . ' as imei_2')
            ->selectRaw($this->selectColumn('device_units', ['barcode', 'device_barcode'], "''") . ' as barcode')
            ->selectRaw($this->selectColumn('device_units', ['status'], "''") . ' as status')
            ->selectRaw($canSeeCost ? $this->numericSelect('device_units', 'purchase_cost') . ' as purchase_cost' : 'NULL as purchase_cost')
            ->selectRaw($this->selectColumn('device_units', ['created_at'], "''") . ' as created_at');

        if ($request->filled('status') && Schema::hasColumn('device_units', 'status')) {
            $query->where('device_units.status', $request->status);
        }

        return [['Product', 'Branch', 'Supplier', 'IMEI 1', 'IMEI 2', 'Barcode', 'Status', 'Purchase Cost', 'Created At'], $query->orderByDesc('device_units.id')->limit($this->limit($request))->get()->map(fn ($row) => (array) $row)->all(), 'NST Device IMEI Stock Report'];
    }

    private function profitLossRows(Request $request): array
    {
        [$from, $to] = $this->dateRange($request);
        $sales = $this->sumTable('sales', $this->firstColumn('sales', ['grand_total', 'total_amount', 'final_amount', 'net_total']), $from, $to);
        $profit = $this->sumTable('sales', 'profit_amount', $from, $to);
        $purchase = $this->sumTable('purchases', $this->firstColumn('purchases', ['grand_total', 'total_amount', 'purchase_amount', 'net_total']), $from, $to);
        $expense = $this->sumTable('expenses', $this->firstColumn('expenses', ['amount', 'expense_amount']), $from, $to);

        return [['Title', 'Amount'], [
            ['title' => 'Sales Amount', 'amount' => $sales],
            ['title' => 'Purchase Amount', 'amount' => $purchase],
            ['title' => 'Gross Profit', 'amount' => $profit],
            ['title' => 'Expense Amount', 'amount' => $expense],
            ['title' => 'Net Profit', 'amount' => $profit - $expense],
        ], 'NST Profit Loss Report'];
    }

    private function branchWiseRows(Request $request): array
    {
        if (! Schema::hasTable('branches')) {
            return [['Message'], [['message' => 'branches table not found']], 'NST Branch Wise Report'];
        }

        [$from, $to] = $this->dateRange($request);
        $rows = DB::table('branches')->select('id', 'name')->orderBy('name')->get()->map(function ($branch) use ($from, $to) {
            return [
                'branch' => $branch->name,
                'sales_amount' => $this->sumTable('sales', $this->firstColumn('sales', ['grand_total', 'total_amount', 'final_amount', 'net_total']), $from, $to, 'branch_id', $branch->id),
                'purchase_amount' => $this->sumTable('purchases', $this->firstColumn('purchases', ['grand_total', 'total_amount', 'purchase_amount', 'net_total']), $from, $to, 'branch_id', $branch->id),
                'stock_quantity' => $this->branchStockTotal($branch->id),
            ];
        })->all();

        return [['Branch', 'Sales Amount', 'Purchase Amount', 'Stock Quantity'], $rows, 'NST Branch Wise Report'];
    }

    private function customerDueRows(Request $request): array
    {
        if (! Schema::hasTable('customers')) {
            return [['Message'], [['message' => 'customers table not found']], 'NST Customer Due Report'];
        }

        $due = $this->firstColumn('customers', ['due_amount', 'balance', 'current_due']);
        $rows = DB::table('customers')
            ->selectRaw($this->selectColumn('customers', ['name'], "''") . ' as customer')
            ->selectRaw($this->selectColumn('customers', ['phone', 'mobile'], "''") . ' as phone')
            ->selectRaw($this->selectColumn('customers', ['email'], "''") . ' as email')
            ->selectRaw('COALESCE(customers.' . $due . ',0) as due_amount')
            ->orderByDesc('due_amount')
            ->limit($this->limit($request))
            ->get()
            ->map(fn ($row) => (array) $row)->all();

        return [['Customer', 'Phone', 'Email', 'Due Amount'], $rows, 'NST Customer Due Report'];
    }

    private function supplierDueRows(Request $request): array
    {
        if (! Schema::hasTable('suppliers')) {
            return [['Message'], [['message' => 'suppliers table not found']], 'NST Supplier Due Report'];
        }

        $due = $this->firstColumn('suppliers', ['due_amount', 'balance', 'current_due']);
        $rows = DB::table('suppliers')
            ->selectRaw($this->selectColumn('suppliers', ['name'], "''") . ' as supplier')
            ->selectRaw($this->selectColumn('suppliers', ['phone', 'mobile'], "''") . ' as phone')
            ->selectRaw($this->selectColumn('suppliers', ['email'], "''") . ' as email')
            ->selectRaw('COALESCE(suppliers.' . $due . ',0) as due_amount')
            ->orderByDesc('due_amount')
            ->limit($this->limit($request))
            ->get()
            ->map(fn ($row) => (array) $row)->all();

        return [['Supplier', 'Phone', 'Email', 'Due Amount'], $rows, 'NST Supplier Due Report'];
    }

    private function expenseRows(Request $request): array
    {
        if (! Schema::hasTable('expenses')) {
            return [['Message'], [['message' => 'expenses table not found']], 'NST Expense Report'];
        }

        [$from, $to] = $this->dateRange($request);
        $amount = $this->firstColumn('expenses', ['amount', 'expense_amount']);
        $query = DB::table('expenses')
            ->leftJoin('branches', fn ($join) => $this->joinIf($join, 'expenses', 'branch_id', 'branches'))
            ->selectRaw($this->selectColumn('expenses', ['expense_date', 'created_at'], "''") . ' as date')
            ->selectRaw($this->selectColumn('expenses', ['category'], "''") . ' as category')
            ->selectRaw($this->selectColumn('expenses', ['title', 'name', 'description'], "''") . ' as title')
            ->selectRaw($this->selectColumn('branches', ['name'], "''") . ' as branch')
            ->selectRaw('COALESCE(expenses.' . $amount . ',0) as amount')
            ->selectRaw($this->selectColumn('expenses', ['payment_method'], "''") . ' as payment_method')
            ->selectRaw($this->selectColumn('expenses', ['note'], "''") . ' as note');

        $this->applyDate($query, 'expenses', $from, $to, Schema::hasColumn('expenses', 'expense_date') ? 'expense_date' : 'created_at');

        return [['Date', 'Category', 'Title', 'Branch', 'Amount', 'Payment Method', 'Note'], $query->orderByDesc('expenses.id')->limit($this->limit($request))->get()->map(fn ($row) => (array) $row)->all(), 'NST Expense Report'];
    }

    private function salesmanRows(Request $request): array
    {
        [$from, $to] = $this->dateRange($request);

        if (! Schema::hasTable('users')) {
            return [['Message'], [['message' => 'users table not found']], 'NST Salesman Sales Report'];
        }

        $users = DB::table('users')
            ->when(Schema::hasTable('model_has_roles') && Schema::hasTable('roles'), function ($query) {
                $query->leftJoin('model_has_roles', 'model_has_roles.model_id', '=', 'users.id')
                    ->leftJoin('roles', 'roles.id', '=', 'model_has_roles.role_id')
                    ->where(function ($q) {
                        $q->where('roles.name', 'like', '%sales%')
                            ->orWhere('users.name', 'like', '%salesman%')
                            ->orWhere('users.email', 'like', 'salesman%@%');
                    })
                    ->select('users.id', 'users.name', 'users.email')
                    ->distinct();
            }, function ($query) {
                $query->select('users.id', 'users.name', 'users.email')
                    ->where(function ($q) {
                        $q->where('users.name', 'like', '%salesman%')
                            ->orWhere('users.email', 'like', 'salesman%@%');
                    });
            })
            ->orderBy('users.name')
            ->get();

        $amountColumn = $this->firstColumn('sales', ['grand_total', 'total_amount', 'final_amount', 'net_total']);

        $rows = $users->map(function ($user) use ($from, $to, $amountColumn) {
            $saleQuery = Schema::hasTable('sales') && Schema::hasColumn('sales', 'sold_by')
                ? DB::table('sales')->where('sold_by', $user->id)
                : null;

            if ($saleQuery) {
                $this->applyDate($saleQuery, 'sales', $from, $to);
            }

            return [
                'salesman' => $user->name,
                'email' => $user->email,
                'invoice_count' => $saleQuery ? (clone $saleQuery)->count() : 0,
                'sales_amount' => $saleQuery ? round((float) (clone $saleQuery)->sum($amountColumn), 2) : 0,
                'profit_amount' => $saleQuery && Schema::hasColumn('sales', 'profit_amount') ? round((float) (clone $saleQuery)->sum('profit_amount'), 2) : 0,
            ];
        })->all();

        return [['Salesman', 'Email', 'Invoice Count', 'Sales Amount', 'Profit Amount'], $rows, 'NST Salesman Sales Report'];
    }

    private function cashbookRows(Request $request): array
    {
        [$from, $to] = $this->dateRange($request);
        $rows = [];

        if (Schema::hasTable('sale_payments')) {
            $q = DB::table('sale_payments')->selectRaw($this->selectColumn('sale_payments', ['payment_date', 'created_at'], "''") . ' as date')
                ->selectRaw("'Cash In' as type")
                ->selectRaw("'Sale Payment' as description")
                ->selectRaw($this->numericSelect('sale_payments', 'amount') . ' as cash_in')
                ->selectRaw('0 as cash_out')
                ->selectRaw($this->selectColumn('sale_payments', ['payment_method'], "''") . ' as method')
                ->selectRaw($this->selectColumn('sale_payments', ['reference_no', 'transaction_id'], "''") . ' as reference');
            $this->applyDate($q, 'sale_payments', $from, $to, Schema::hasColumn('sale_payments', 'payment_date') ? 'payment_date' : 'created_at');
            $rows = array_merge($rows, $q->limit($this->limit($request))->get()->map(fn ($r) => (array) $r)->all());
        }

        if (Schema::hasTable('supplier_payments')) {
            $q = DB::table('supplier_payments')->selectRaw($this->selectColumn('supplier_payments', ['payment_date', 'created_at'], "''") . ' as date')
                ->selectRaw("'Cash Out' as type")
                ->selectRaw("'Supplier Payment' as description")
                ->selectRaw('0 as cash_in')
                ->selectRaw($this->numericSelect('supplier_payments', 'amount') . ' as cash_out')
                ->selectRaw($this->selectColumn('supplier_payments', ['payment_method'], "''") . ' as method')
                ->selectRaw($this->selectColumn('supplier_payments', ['reference_no', 'transaction_id'], "''") . ' as reference');
            $this->applyDate($q, 'supplier_payments', $from, $to, Schema::hasColumn('supplier_payments', 'payment_date') ? 'payment_date' : 'created_at');
            $rows = array_merge($rows, $q->limit($this->limit($request))->get()->map(fn ($r) => (array) $r)->all());
        }

        if (Schema::hasTable('expenses')) {
            $amount = $this->firstColumn('expenses', ['amount', 'expense_amount']);
            $q = DB::table('expenses')->selectRaw($this->selectColumn('expenses', ['expense_date', 'created_at'], "''") . ' as date')
                ->selectRaw("'Cash Out' as type")
                ->selectRaw($this->selectColumn('expenses', ['title', 'category', 'description'], "'Expense'") . ' as description')
                ->selectRaw('0 as cash_in')
                ->selectRaw('COALESCE(expenses.' . $amount . ',0) as cash_out')
                ->selectRaw($this->selectColumn('expenses', ['payment_method'], "''") . ' as method')
                ->selectRaw($this->selectColumn('expenses', ['reference_no'], "''") . ' as reference');
            $this->applyDate($q, 'expenses', $from, $to, Schema::hasColumn('expenses', 'expense_date') ? 'expense_date' : 'created_at');
            $rows = array_merge($rows, $q->limit($this->limit($request))->get()->map(fn ($r) => (array) $r)->all());
        }

        usort($rows, fn ($a, $b) => strcmp((string) ($b['date'] ?? ''), (string) ($a['date'] ?? '')));

        return [['Date', 'Type', 'Description', 'Cash In', 'Cash Out', 'Method', 'Reference'], array_slice($rows, 0, $this->limit($request)), 'NST Cashbook Report'];
    }

    private function customerPaymentRows(Request $request): array
    {
        return $this->paymentRows('customer_payments', 'customers', 'customer_id', 'Customer Collection Report', 'customer');
    }

    private function supplierPaymentRows(Request $request): array
    {
        return $this->paymentRows('supplier_payments', 'suppliers', 'supplier_id', 'Supplier Payment Report', 'supplier');
    }

    private function paymentRows(string $table, string $personTable, string $foreignKey, string $title, string $personKey): array
    {
        if (! Schema::hasTable($table)) {
            return [['Message'], [['message' => $table . ' table not found']], 'NST ' . $title];
        }

        $query = DB::table($table)
            ->leftJoin($personTable, function ($join) use ($table, $personTable, $foreignKey) {
                if (Schema::hasTable($personTable) && Schema::hasColumn($table, $foreignKey)) {
                    $join->on($personTable . '.id', '=', $table . '.' . $foreignKey);
                }
            })
            ->selectRaw($this->selectColumn($table, ['payment_date', 'created_at'], "''") . ' as date')
            ->selectRaw($this->selectColumn($personTable, ['name'], "''") . ' as ' . $personKey)
            ->selectRaw($this->selectColumn($personTable, ['phone', 'mobile'], "''") . ' as phone')
            ->selectRaw($this->numericSelect($table, 'amount') . ' as amount')
            ->selectRaw($this->selectColumn($table, ['payment_method'], "''") . ' as payment_method')
            ->selectRaw($this->selectColumn($table, ['reference_no', 'transaction_id'], "''") . ' as reference')
            ->selectRaw($this->selectColumn($table, ['note'], "''") . ' as note')
            ->orderByDesc($table . '.id')
            ->limit(5000);

        return [['Date', ucwords(str_replace('_', ' ', $personKey)), 'Phone', 'Amount', 'Payment Method', 'Reference', 'Note'], $query->get()->map(fn ($row) => (array) $row)->all(), 'NST ' . $title];
    }

    private function auditRows(Request $request): array
    {
        if (! Schema::hasTable('audit_logs')) {
            return [['Message'], [['message' => 'audit_logs table not found']], 'NST Activity Logs'];
        }

        $query = DB::table('audit_logs')
            ->leftJoin('users', fn ($join) => $this->joinIf($join, 'audit_logs', 'user_id', 'users'))
            ->selectRaw($this->selectColumn('audit_logs', ['created_at'], "''") . ' as date')
            ->selectRaw($this->selectColumn('users', ['name'], "''") . ' as user')
            ->selectRaw($this->selectColumn('audit_logs', ['method'], "''") . ' as method')
            ->selectRaw($this->selectColumn('audit_logs', ['path'], "''") . ' as path')
            ->selectRaw($this->selectColumn('audit_logs', ['action', 'event'], "''") . ' as action')
            ->selectRaw($this->selectColumn('audit_logs', ['ip_address'], "''") . ' as ip_address')
            ->selectRaw($this->selectColumn('audit_logs', ['status_code'], "''") . ' as status_code')
            ->orderByDesc('audit_logs.id')
            ->limit($this->limit($request));

        return [['Date', 'User', 'Method', 'Path', 'Action', 'IP Address', 'Status Code'], $query->get()->map(fn ($row) => (array) $row)->all(), 'NST Activity Logs'];
    }

    private function dateRange(Request $request): array
    {
        $from = $request->filled('date_from') ? Carbon::parse($request->date_from)->startOfDay() : now()->startOfMonth();
        $to = $request->filled('date_to') ? Carbon::parse($request->date_to)->endOfDay() : now()->endOfDay();
        return [$from, $to];
    }

    private function applyDate($query, string $table, Carbon $from, Carbon $to, string $column = 'created_at'): void
    {
        if (Schema::hasColumn($table, $column)) {
            $query->whereBetween($table . '.' . $column, [$from, $to]);
        }
    }

    private function sumTable(string $table, ?string $column, Carbon $from, Carbon $to, ?string $whereColumn = null, mixed $whereValue = null): float
    {
        if (! Schema::hasTable($table) || ! $column || ! Schema::hasColumn($table, $column)) {
            return 0;
        }

        $query = DB::table($table);
        $this->applyDate($query, $table, $from, $to);
        if ($whereColumn && Schema::hasColumn($table, $whereColumn)) {
            $query->where($whereColumn, $whereValue);
        }
        return round((float) $query->sum($column), 2);
    }

    private function branchStockTotal(int $branchId): float
    {
        if (! Schema::hasTable('branch_stocks') || ! Schema::hasColumn('branch_stocks', 'branch_id')) {
            return 0;
        }

        $qty = $this->firstColumn('branch_stocks', ['quantity', 'qty', 'stock_qty', 'current_stock', 'available_stock']);
        return $qty ? round((float) DB::table('branch_stocks')->where('branch_id', $branchId)->sum($qty), 2) : 0;
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

        return Schema::hasColumn($table, 'id') ? 'id' : null;
    }

    private function selectColumn(string $table, array $columns, string $default): string
    {
        if (! Schema::hasTable($table)) {
            return $default;
        }

        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                return $table . '.' . $column;
            }
        }

        return $default;
    }

    private function numericSelect(string $table, string $column): string
    {
        return Schema::hasTable($table) && Schema::hasColumn($table, $column)
            ? 'COALESCE(' . $table . '.' . $column . ',0)'
            : '0';
    }

    private function joinIf($join, string $fromTable, string $fromColumn, string $toTable): void
    {
        if (Schema::hasTable($toTable) && Schema::hasColumn($fromTable, $fromColumn)) {
            $join->on($toTable . '.id', '=', $fromTable . '.' . $fromColumn);
        }
    }

    private function canSeeCost(Request $request): bool
    {
        $user = $request->user();
        if (! $user) {
            return false;
        }

        if (method_exists($user, 'hasAnyRole') && $user->hasAnyRole(['Super Admin', 'super_admin', 'Admin', 'admin', 'Accounts', 'accounts', 'Accountant', 'accountant'])) {
            return true;
        }

        return false;
    }

    private function limit(Request $request): int
    {
        return min(max((int) $request->query('limit', 5000), 1), 10000);
    }
}
