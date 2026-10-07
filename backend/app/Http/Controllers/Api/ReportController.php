<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReportController extends Controller
{
    public function summary(Request $request)
    {
        [$dateFrom, $dateTo] = $this->dateRange($request);

        $sales = $this->salesTotals($request, $dateFrom, $dateTo);
        $purchases = $this->purchaseTotals($request, $dateFrom, $dateTo);
        $stock = $this->stockTotals($request);
        $customerDue = $this->customerDueTotals();
        $supplierDue = $this->supplierDueTotals();
        $expenses = $this->expenseTotals($request, $dateFrom, $dateTo);

        $grossProfit = (float) ($sales['profit_amount'] ?? 0);
        $expenseAmount = (float) ($expenses['total_expense'] ?? 0);

        return response()->json([
            'success' => true,
            'message' => 'Business report summary loaded successfully.',
            'data' => [
                'period' => $this->periodPayload($dateFrom, $dateTo),
                'sales' => $sales,
                'purchases' => $purchases,
                'stock' => $stock,
                'customer_due' => $customerDue,
                'supplier_due' => $supplierDue,
                'expenses' => $expenses,
                'profit_loss' => [
                    'gross_profit' => round($grossProfit, 2),
                    'expense_amount' => round($expenseAmount, 2),
                    'net_profit' => round($grossProfit - $expenseAmount, 2),
                ],
            ],
        ]);
    }

    public function sales(Request $request)
    {
        if (!Schema::hasTable('sales')) {
            return $this->missingTable('sales');
        }

        [$dateFrom, $dateTo] = $this->dateRange($request);
        $base = $this->salesBaseQuery($request, $dateFrom, $dateTo);

        $amountExpression = $this->sumExpression('sales', $this->saleAmountColumn());
        $paidExpression = $this->sumExpression('sales', 'paid_amount');
        $dueExpression = $this->sumExpression('sales', 'due_amount');
        $profitExpression = $this->sumExpression('sales', 'profit_amount');

        $totals = (clone $base)
            ->selectRaw('COUNT(sales.id) as sale_count')
            ->selectRaw($amountExpression . ' as total_sale_amount')
            ->selectRaw($paidExpression . ' as total_paid_amount')
            ->selectRaw($dueExpression . ' as total_due_amount')
            ->selectRaw($profitExpression . ' as total_profit_amount')
            ->first();

        $dailyTrend = (clone $base)
            ->selectRaw('DATE(sales.created_at) as date')
            ->selectRaw('COUNT(sales.id) as sale_count')
            ->selectRaw($amountExpression . ' as sale_amount')
            ->selectRaw($profitExpression . ' as profit_amount')
            ->groupByRaw('DATE(sales.created_at)')
            ->orderBy('date')
            ->get();

        $bySalesman = $this->salesmanRows($request, $dateFrom, $dateTo);

        $byPaymentMethod = [];

        if (Schema::hasColumn('sales', 'payment_method')) {
            $byPaymentMethod = (clone $base)
                ->selectRaw("COALESCE(sales.payment_method, 'unknown') as payment_method")
                ->selectRaw('COUNT(sales.id) as sale_count')
                ->selectRaw($amountExpression . ' as sale_amount')
                ->groupBy('sales.payment_method')
                ->orderByDesc('sale_amount')
                ->get();
        }

        $latestSales = (clone $base)
            ->leftJoin('branches', function ($join) {
                if (Schema::hasTable('branches') && Schema::hasColumn('sales', 'branch_id')) {
                    $join->on('branches.id', '=', 'sales.branch_id');
                }
            })
            ->leftJoin('users as sold_users', function ($join) {
                if (Schema::hasTable('users') && Schema::hasColumn('sales', 'sold_by')) {
                    $join->on('sold_users.id', '=', 'sales.sold_by');
                }
            })
            ->select('sales.*')
            ->when(Schema::hasTable('branches'), fn ($query) => $query->addSelect('branches.name as branch_name'))
            ->when(Schema::hasTable('users'), fn ($query) => $query->addSelect('sold_users.name as sold_by_name'))
            ->latest('sales.id')
            ->limit((int) $request->get('latest_limit', 10))
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Sales report loaded successfully.',
            'data' => [
                'period' => $this->periodPayload($dateFrom, $dateTo),
                'summary' => [
                    'sale_count' => (int) ($totals->sale_count ?? 0),
                    'total_sale_amount' => round((float) ($totals->total_sale_amount ?? 0), 2),
                    'total_paid_amount' => round((float) ($totals->total_paid_amount ?? 0), 2),
                    'total_due_amount' => round((float) ($totals->total_due_amount ?? 0), 2),
                    'total_profit_amount' => round((float) ($totals->total_profit_amount ?? 0), 2),
                    'average_sale_amount' => (int) ($totals->sale_count ?? 0) > 0
                        ? round(((float) ($totals->total_sale_amount ?? 0)) / (int) $totals->sale_count, 2)
                        : 0,
                ],
                'daily_trend' => $dailyTrend,
                'by_salesman' => $bySalesman,
                'by_payment_method' => $byPaymentMethod,
                'latest_sales' => $latestSales,
                'monthly_report_rule' => 'Every monthly report automatically starts from the 1st day of that month when date_from is not provided.',
            ],
        ]);
    }

    public function purchases(Request $request)
    {
        if (!Schema::hasTable('purchases')) {
            return $this->missingTable('purchases');
        }

        [$dateFrom, $dateTo] = $this->dateRange($request);
        $base = $this->purchaseBaseQuery($request, $dateFrom, $dateTo);
        $amountExpression = $this->sumExpression('purchases', $this->purchaseAmountColumn());

        $totals = (clone $base)
            ->selectRaw('COUNT(purchases.id) as purchase_count')
            ->selectRaw($amountExpression . ' as total_purchase_amount')
            ->selectRaw($this->sumExpression('purchases', 'paid_amount') . ' as paid_amount')
            ->selectRaw($this->sumExpression('purchases', 'due_amount') . ' as due_amount')
            ->selectRaw($this->sumExpression('purchases', 'cash_paid_amount') . ' as cash_paid_amount')
            ->selectRaw($this->sumExpression('purchases', 'advance_applied_amount') . ' as advance_applied_amount')
            ->first();

        $bySupplier = [];

        if (Schema::hasColumn('purchases', 'supplier_id') && Schema::hasTable('suppliers')) {
            $bySupplier = (clone $base)
                ->leftJoin('suppliers', 'suppliers.id', '=', 'purchases.supplier_id')
                ->selectRaw('suppliers.id as supplier_id')
                ->selectRaw("COALESCE(suppliers.name, 'Unknown Supplier') as supplier_name")
                ->selectRaw('suppliers.phone as supplier_phone')
                ->selectRaw('COUNT(purchases.id) as purchase_count')
                ->selectRaw($amountExpression . ' as purchase_amount')
                ->selectRaw($this->sumExpression('purchases', 'due_amount') . ' as due_amount')
                ->groupBy('suppliers.id', 'suppliers.name', 'suppliers.phone')
                ->orderByDesc('purchase_amount')
                ->get();
        }

        $dailyTrend = (clone $base)
            ->selectRaw('DATE(purchases.created_at) as date')
            ->selectRaw('COUNT(purchases.id) as purchase_count')
            ->selectRaw($amountExpression . ' as purchase_amount')
            ->groupByRaw('DATE(purchases.created_at)')
            ->orderBy('date')
            ->get();

        $latestPurchases = (clone $base)
            ->leftJoin('suppliers as latest_suppliers', function ($join) {
                if (Schema::hasTable('suppliers') && Schema::hasColumn('purchases', 'supplier_id')) {
                    $join->on('latest_suppliers.id', '=', 'purchases.supplier_id');
                }
            })
            ->leftJoin('branches as latest_branches', function ($join) {
                if (Schema::hasTable('branches') && Schema::hasColumn('purchases', 'branch_id')) {
                    $join->on('latest_branches.id', '=', 'purchases.branch_id');
                }
            })
            ->select('purchases.*')
            ->when(Schema::hasTable('suppliers'), fn ($query) => $query->addSelect('latest_suppliers.name as supplier_name'))
            ->when(Schema::hasTable('branches'), fn ($query) => $query->addSelect('latest_branches.name as branch_name'))
            ->latest('purchases.id')
            ->limit((int) $request->get('latest_limit', 10))
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Purchase report loaded successfully.',
            'data' => [
                'period' => $this->periodPayload($dateFrom, $dateTo),
                'summary' => [
                    'purchase_count' => (int) ($totals->purchase_count ?? 0),
                    'total_purchase_amount' => round((float) ($totals->total_purchase_amount ?? 0), 2),
                    'paid_amount' => round((float) ($totals->paid_amount ?? 0), 2),
                    'due_amount' => round((float) ($totals->due_amount ?? 0), 2),
                    'cash_paid_amount' => round((float) ($totals->cash_paid_amount ?? 0), 2),
                    'advance_applied_amount' => round((float) ($totals->advance_applied_amount ?? 0), 2),
                ],
                'daily_trend' => $dailyTrend,
                'by_supplier' => $bySupplier,
                'latest_purchases' => $latestPurchases,
            ],
        ]);
    }

    public function stock(Request $request)
    {
        $stock = $this->stockTotals($request);
        $branchStockRows = [];

        if (Schema::hasTable('branch_stocks')) {
            $quantityColumn = $this->firstExistingColumn('branch_stocks', ['quantity', 'qty', 'stock_qty', 'current_stock', 'available_stock']);

            if ($quantityColumn) {
                $query = DB::table('branch_stocks')
                    ->leftJoin('branches', function ($join) {
                        if (Schema::hasTable('branches') && Schema::hasColumn('branch_stocks', 'branch_id')) {
                            $join->on('branches.id', '=', 'branch_stocks.branch_id');
                        }
                    })
                    ->leftJoin('products', function ($join) {
                        if (Schema::hasTable('products') && Schema::hasColumn('branch_stocks', 'product_id')) {
                            $join->on('products.id', '=', 'branch_stocks.product_id');
                        }
                    })
                    ->select('branch_stocks.*')
                    ->selectRaw("branch_stocks.$quantityColumn as stock_quantity")
                    ->when(Schema::hasTable('branches'), fn ($q) => $q->addSelect('branches.name as branch_name'))
                    ->when(Schema::hasTable('products'), fn ($q) => $q->addSelect('products.name as product_name', 'products.sku as product_sku'));

                if ($request->filled('branch_id') && Schema::hasColumn('branch_stocks', 'branch_id')) {
                    $query->where('branch_stocks.branch_id', $request->branch_id);
                }

                $branchStockRows = $query
                    ->orderByDesc("branch_stocks.$quantityColumn")
                    ->limit((int) $request->get('limit', 100))
                    ->get();
            }
        }

        $deviceStatus = [];

        if (Schema::hasTable('device_units') && Schema::hasColumn('device_units', 'status')) {
            $deviceQuery = DB::table('device_units')
                ->selectRaw("COALESCE(status, 'unknown') as status")
                ->selectRaw('COUNT(id) as total_devices')
                ->groupBy('status')
                ->orderByDesc('total_devices');

            if ($request->filled('branch_id') && Schema::hasColumn('device_units', 'branch_id')) {
                $deviceQuery->where('branch_id', $request->branch_id);
            }

            $deviceStatus = $deviceQuery->get();
        }

        return response()->json([
            'success' => true,
            'message' => 'Stock report loaded successfully.',
            'data' => [
                'summary' => $stock,
                'branch_stock' => $branchStockRows,
                'device_status' => $deviceStatus,
            ],
        ]);
    }

    public function profitLoss(Request $request)
    {
        [$dateFrom, $dateTo] = $this->dateRange($request);
        $sales = $this->salesTotals($request, $dateFrom, $dateTo);
        $purchases = $this->purchaseTotals($request, $dateFrom, $dateTo);
        $expenses = $this->expenseTotals($request, $dateFrom, $dateTo);

        $salesAmount = (float) ($sales['sale_amount'] ?? 0);
        $grossProfit = (float) ($sales['profit_amount'] ?? 0);
        $expenseAmount = (float) ($expenses['total_expense'] ?? 0);
        $purchaseAmount = (float) ($purchases['purchase_amount'] ?? 0);

        return response()->json([
            'success' => true,
            'message' => 'Profit/Loss report loaded successfully.',
            'data' => [
                'period' => $this->periodPayload($dateFrom, $dateTo),
                'sales_amount' => round($salesAmount, 2),
                'purchase_amount' => round($purchaseAmount, 2),
                'gross_profit' => round($grossProfit, 2),
                'expense_amount' => round($expenseAmount, 2),
                'net_profit' => round($grossProfit - $expenseAmount, 2),
                'notes' => 'Gross profit comes from sales.profit_amount when available. Monthly report starts from the 1st day by default.',
            ],
        ]);
    }

    public function branchWise(Request $request)
    {
        [$dateFrom, $dateTo] = $this->dateRange($request);

        if (!Schema::hasTable('branches')) {
            return $this->missingTable('branches');
        }

        $salesSub = Schema::hasTable('sales') && Schema::hasColumn('sales', 'branch_id')
            ? $this->salesBaseQuery($request, $dateFrom, $dateTo, false)
                ->selectRaw('sales.branch_id')
                ->selectRaw('COUNT(sales.id) as sale_count')
                ->selectRaw($this->sumExpression('sales', $this->saleAmountColumn()) . ' as sale_amount')
                ->selectRaw($this->sumExpression('sales', 'profit_amount') . ' as profit_amount')
                ->groupBy('sales.branch_id')
            : null;

        $purchaseSub = Schema::hasTable('purchases') && Schema::hasColumn('purchases', 'branch_id')
            ? $this->purchaseBaseQuery($request, $dateFrom, $dateTo, false)
                ->selectRaw('purchases.branch_id')
                ->selectRaw('COUNT(purchases.id) as purchase_count')
                ->selectRaw($this->sumExpression('purchases', $this->purchaseAmountColumn()) . ' as purchase_amount')
                ->groupBy('purchases.branch_id')
            : null;

        $stockSub = null;
        $quantityColumn = Schema::hasTable('branch_stocks')
            ? $this->firstExistingColumn('branch_stocks', ['quantity', 'qty', 'stock_qty', 'current_stock', 'available_stock'])
            : null;

        if ($quantityColumn && Schema::hasColumn('branch_stocks', 'branch_id')) {
            $stockSub = DB::table('branch_stocks')
                ->selectRaw('branch_stocks.branch_id')
                ->selectRaw("SUM(COALESCE(branch_stocks.$quantityColumn, 0)) as stock_quantity")
                ->groupBy('branch_stocks.branch_id');
        }

        $query = DB::table('branches')->select('branches.id', 'branches.name');

        if (Schema::hasColumn('branches', 'code')) {
            $query->addSelect('branches.code');
        }

        if ($salesSub) {
            $query->leftJoinSub($salesSub, 'sales_report', 'sales_report.branch_id', '=', 'branches.id')
                ->addSelect('sales_report.sale_count', 'sales_report.sale_amount', 'sales_report.profit_amount');
        }

        if ($purchaseSub) {
            $query->leftJoinSub($purchaseSub, 'purchase_report', 'purchase_report.branch_id', '=', 'branches.id')
                ->addSelect('purchase_report.purchase_count', 'purchase_report.purchase_amount');
        }

        if ($stockSub) {
            $query->leftJoinSub($stockSub, 'stock_report', 'stock_report.branch_id', '=', 'branches.id')
                ->addSelect('stock_report.stock_quantity');
        }

        $branches = $query->orderBy('branches.name')->get();

        return response()->json([
            'success' => true,
            'message' => 'Branch wise report loaded successfully.',
            'data' => [
                'period' => $this->periodPayload($dateFrom, $dateTo),
                'branches' => $branches,
            ],
        ]);
    }

    public function customerDue(Request $request)
    {
        if (!Schema::hasTable('customers')) {
            return $this->missingTable('customers');
        }

        $balanceColumn = $this->firstExistingColumn('customers', ['current_balance', 'balance', 'due_amount']);
        $query = DB::table('customers');

        if ($balanceColumn) {
            $query->where("customers.$balanceColumn", '>', 0);
        }

        if (Schema::hasColumn('customers', 'deleted_at')) {
            $query->whereNull('customers.deleted_at');
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                foreach (['name', 'phone', 'email'] as $column) {
                    if (Schema::hasColumn('customers', $column)) {
                        $q->orWhere("customers.$column", 'like', "%{$search}%");
                    }
                }
            });
        }

        $customers = $query
            ->select('customers.*')
            ->when($balanceColumn, fn ($q) => $q->selectRaw("customers.$balanceColumn as due_amount"))
            ->orderByDesc($balanceColumn ? "customers.$balanceColumn" : 'customers.id')
            ->paginate((int) $request->get('per_page', 20));

        return response()->json([
            'success' => true,
            'message' => 'Customer due report loaded successfully.',
            'data' => [
                'summary' => $this->customerDueTotals(),
                'customers' => $customers,
            ],
        ]);
    }

    public function supplierDue(Request $request)
    {
        if (!Schema::hasTable('suppliers')) {
            return $this->missingTable('suppliers');
        }

        $balanceColumn = $this->firstExistingColumn('suppliers', ['current_balance', 'balance', 'due_amount']);
        $query = DB::table('suppliers');

        if ($balanceColumn) {
            $query->where("suppliers.$balanceColumn", '>', 0);
        }

        if (Schema::hasColumn('suppliers', 'deleted_at')) {
            $query->whereNull('suppliers.deleted_at');
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                foreach (['name', 'phone', 'email', 'company_name'] as $column) {
                    if (Schema::hasColumn('suppliers', $column)) {
                        $q->orWhere("suppliers.$column", 'like', "%{$search}%");
                    }
                }
            });
        }

        $suppliers = $query
            ->select('suppliers.*')
            ->when($balanceColumn, fn ($q) => $q->selectRaw("suppliers.$balanceColumn as due_amount"))
            ->when(Schema::hasColumn('suppliers', 'advance_balance'), fn ($q) => $q->selectRaw('suppliers.advance_balance as advance_amount'))
            ->orderByDesc($balanceColumn ? "suppliers.$balanceColumn" : 'suppliers.id')
            ->paginate((int) $request->get('per_page', 20));

        return response()->json([
            'success' => true,
            'message' => 'Supplier due report loaded successfully.',
            'data' => [
                'summary' => $this->supplierDueTotals(),
                'suppliers' => $suppliers,
            ],
        ]);
    }

    public function expenses(Request $request)
    {
        [$dateFrom, $dateTo] = $this->dateRange($request);

        if (!Schema::hasTable('expenses')) {
            return response()->json([
                'success' => true,
                'message' => 'expenses table not found yet. Expense report returned empty data.',
                'data' => [
                    'period' => $this->periodPayload($dateFrom, $dateTo),
                    'summary' => ['expense_count' => 0, 'total_expense' => 0],
                    'by_category' => [],
                    'expenses' => [],
                ],
            ]);
        }

        $base = DB::table('expenses');

        if (Schema::hasColumn('expenses', 'deleted_at')) {
            $base->whereNull('expenses.deleted_at');
        }

        if (Schema::hasColumn('expenses', 'branch_id') && $request->filled('branch_id')) {
            $base->where('expenses.branch_id', $request->branch_id);
        }

        $dateColumn = $this->firstExistingColumn('expenses', ['expense_date', 'date', 'created_at']);
        if ($dateColumn) {
            $base->whereBetween("expenses.$dateColumn", [$dateFrom->copy()->startOfDay(), $dateTo->copy()->endOfDay()]);
        }

        $amountColumn = $this->firstExistingColumn('expenses', ['amount', 'total_amount', 'expense_amount']);
        $categoryColumn = $this->firstExistingColumn('expenses', ['category', 'expense_category', 'type']);

        $summary = (clone $base)
            ->selectRaw('COUNT(expenses.id) as expense_count')
            ->selectRaw($this->sumExpression('expenses', $amountColumn) . ' as total_expense')
            ->first();

        $byCategory = $categoryColumn
            ? (clone $base)
                ->selectRaw("COALESCE(expenses.$categoryColumn, 'Uncategorized') as category")
                ->selectRaw('COUNT(expenses.id) as expense_count')
                ->selectRaw($this->sumExpression('expenses', $amountColumn) . ' as total_expense')
                ->groupBy("expenses.$categoryColumn")
                ->orderByDesc('total_expense')
                ->get()
            : [];

        $expenseRows = (clone $base)
            ->latest('expenses.id')
            ->limit((int) $request->get('limit', 50))
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Expense report loaded successfully.',
            'data' => [
                'period' => $this->periodPayload($dateFrom, $dateTo),
                'summary' => [
                    'expense_count' => (int) ($summary->expense_count ?? 0),
                    'total_expense' => round((float) ($summary->total_expense ?? 0), 2),
                ],
                'by_category' => $byCategory,
                'expenses' => $expenseRows,
            ],
        ]);
    }

    private function salesmanRows(Request $request, Carbon $dateFrom, Carbon $dateTo)
    {
        if (!Schema::hasTable('users') || !Schema::hasTable('sales') || !Schema::hasColumn('sales', 'sold_by')) {
            return collect();
        }

        $amountColumn = $this->saleAmountColumn();
        $amountExpression = $this->sumExpression('sales', $amountColumn);
        $paidExpression = $this->sumExpression('sales', 'paid_amount');
        $dueExpression = $this->sumExpression('sales', 'due_amount');
        $profitExpression = $this->sumExpression('sales', 'profit_amount');

        $query = DB::table('users')
            ->leftJoin('sales', function ($join) use ($request, $dateFrom, $dateTo) {
                $join->on('sales.sold_by', '=', 'users.id')
                    ->whereBetween('sales.created_at', [
                        $dateFrom->copy()->startOfDay(),
                        $dateTo->copy()->endOfDay(),
                    ]);

                if (Schema::hasColumn('sales', 'status')) {
                    $join->where(function ($q) {
                        $q->whereNull('sales.status')
                            ->orWhereNotIn('sales.status', ['cancelled', 'canceled', 'returned']);
                    });
                }

                if ($request->filled('branch_id') && Schema::hasColumn('sales', 'branch_id')) {
                    $join->where('sales.branch_id', $request->branch_id);
                }
            })
            ->selectRaw('users.id as salesman_id')
            ->selectRaw("COALESCE(users.name, 'Unknown Salesman') as salesman_name")
            ->selectRaw('users.email as salesman_email')
            ->selectRaw('COUNT(sales.id) as sale_count')
            ->selectRaw($amountExpression . ' as sale_amount')
            ->selectRaw($paidExpression . ' as paid_amount')
            ->selectRaw($dueExpression . ' as due_amount')
            ->selectRaw($profitExpression . ' as profit_amount')
            ->groupBy('users.id', 'users.name', 'users.email');

        $query->where(function ($q) {
            if (Schema::hasColumn('users', 'profile_type')) {
                $q->orWhere('users.profile_type', 'salesman');
            }

            if (Schema::hasColumn('users', 'email')) {
                $q->orWhere('users.email', 'like', 'salesman%@newsingapurtele.com');
            }

            if (Schema::hasTable('roles') && Schema::hasTable('model_has_roles')) {
                $q->orWhereExists(function ($roleQuery) {
                    $roleQuery->selectRaw('1')
                        ->from('model_has_roles')
                        ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
                        ->whereColumn('model_has_roles.model_id', 'users.id')
                        ->whereIn('roles.name', ['salesman', 'Salesman', 'salesmen', 'Salesmen']);
                });
            }
        });

        if (Schema::hasColumn('users', 'status')) {
            $query->where(function ($q) {
                $q->whereNull('users.status')
                    ->orWhere('users.status', 'active');
            });
        }

        return $query
            ->orderByDesc(DB::raw('sale_amount'))
            ->orderBy('users.name')
            ->get()
            ->map(function ($row) {
                $row->sale_count = (int) ($row->sale_count ?? 0);
                $row->sale_amount = round((float) ($row->sale_amount ?? 0), 2);
                $row->paid_amount = round((float) ($row->paid_amount ?? 0), 2);
                $row->due_amount = round((float) ($row->due_amount ?? 0), 2);
                $row->profit_amount = round((float) ($row->profit_amount ?? 0), 2);

                return $row;
            });
    }

    private function dateRange(Request $request): array
    {
        $dateFrom = $request->filled('date_from')
            ? Carbon::parse($request->date_from)->startOfDay()
            : now()->startOfMonth()->startOfDay();

        $dateTo = $request->filled('date_to')
            ? Carbon::parse($request->date_to)->endOfDay()
            : now()->endOfDay();

        return [$dateFrom, $dateTo];
    }

    private function periodPayload(Carbon $dateFrom, Carbon $dateTo): array
    {
        return [
            'date_from' => $dateFrom->toDateString(),
            'date_to' => $dateTo->toDateString(),
            'month_starts_from' => $dateFrom->copy()->startOfMonth()->toDateString(),
        ];
    }

    private function salesBaseQuery(Request $request, Carbon $dateFrom, Carbon $dateTo, bool $applyBranchFilter = true)
    {
        $query = DB::table('sales');

        if (Schema::hasColumn('sales', 'deleted_at')) {
            $query->whereNull('sales.deleted_at');
        }

        if (Schema::hasColumn('sales', 'status')) {
            $query->where(function ($q) {
                $q->whereNull('sales.status')
                    ->orWhereNotIn('sales.status', ['cancelled', 'returned']);
            });
        }

        if (Schema::hasColumn('sales', 'created_at')) {
            $query->whereBetween('sales.created_at', [$dateFrom, $dateTo]);
        }

        if ($applyBranchFilter && $request->filled('branch_id') && Schema::hasColumn('sales', 'branch_id')) {
            $query->where('sales.branch_id', $request->branch_id);
        }

        if ($request->filled('salesman_id') && Schema::hasColumn('sales', 'sold_by')) {
            $query->where('sales.sold_by', $request->salesman_id);
        }

        return $query;
    }

    private function purchaseBaseQuery(Request $request, Carbon $dateFrom, Carbon $dateTo, bool $applyBranchFilter = true)
    {
        $query = DB::table('purchases');

        if (Schema::hasColumn('purchases', 'deleted_at')) {
            $query->whereNull('purchases.deleted_at');
        }

        if (Schema::hasColumn('purchases', 'created_at')) {
            $query->whereBetween('purchases.created_at', [$dateFrom, $dateTo]);
        }

        if ($applyBranchFilter && $request->filled('branch_id') && Schema::hasColumn('purchases', 'branch_id')) {
            $query->where('purchases.branch_id', $request->branch_id);
        }

        return $query;
    }

    private function salesTotals(Request $request, Carbon $dateFrom, Carbon $dateTo): array
    {
        if (!Schema::hasTable('sales')) {
            return ['sale_count' => 0, 'sale_amount' => 0, 'paid_amount' => 0, 'due_amount' => 0, 'profit_amount' => 0];
        }

        $base = $this->salesBaseQuery($request, $dateFrom, $dateTo);
        $totals = (clone $base)
            ->selectRaw('COUNT(sales.id) as sale_count')
            ->selectRaw($this->sumExpression('sales', $this->saleAmountColumn()) . ' as sale_amount')
            ->selectRaw($this->sumExpression('sales', 'paid_amount') . ' as paid_amount')
            ->selectRaw($this->sumExpression('sales', 'due_amount') . ' as due_amount')
            ->selectRaw($this->sumExpression('sales', 'profit_amount') . ' as profit_amount')
            ->first();

        return [
            'sale_count' => (int) ($totals->sale_count ?? 0),
            'sale_amount' => round((float) ($totals->sale_amount ?? 0), 2),
            'paid_amount' => round((float) ($totals->paid_amount ?? 0), 2),
            'due_amount' => round((float) ($totals->due_amount ?? 0), 2),
            'profit_amount' => round((float) ($totals->profit_amount ?? 0), 2),
        ];
    }

    private function purchaseTotals(Request $request, Carbon $dateFrom, Carbon $dateTo): array
    {
        if (!Schema::hasTable('purchases')) {
            return ['purchase_count' => 0, 'purchase_amount' => 0, 'paid_amount' => 0, 'due_amount' => 0];
        }

        $base = $this->purchaseBaseQuery($request, $dateFrom, $dateTo);
        $totals = (clone $base)
            ->selectRaw('COUNT(purchases.id) as purchase_count')
            ->selectRaw($this->sumExpression('purchases', $this->purchaseAmountColumn()) . ' as purchase_amount')
            ->selectRaw($this->sumExpression('purchases', 'paid_amount') . ' as paid_amount')
            ->selectRaw($this->sumExpression('purchases', 'due_amount') . ' as due_amount')
            ->first();

        return [
            'purchase_count' => (int) ($totals->purchase_count ?? 0),
            'purchase_amount' => round((float) ($totals->purchase_amount ?? 0), 2),
            'paid_amount' => round((float) ($totals->paid_amount ?? 0), 2),
            'due_amount' => round((float) ($totals->due_amount ?? 0), 2),
        ];
    }

    private function stockTotals(Request $request): array
    {
        $totalProducts = Schema::hasTable('products') ? DB::table('products')->count() : 0;
        $totalBranchStockQty = 0;
        $lowStockCount = 0;
        $outOfStockCount = 0;

        if (Schema::hasTable('branch_stocks')) {
            $quantityColumn = $this->firstExistingColumn('branch_stocks', ['quantity', 'qty', 'stock_qty', 'current_stock', 'available_stock']);

            if ($quantityColumn) {
                $query = DB::table('branch_stocks');

                if ($request->filled('branch_id') && Schema::hasColumn('branch_stocks', 'branch_id')) {
                    $query->where('branch_id', $request->branch_id);
                }

                $totalBranchStockQty = (float) (clone $query)->sum($quantityColumn);
                $lowStockCount = (int) (clone $query)->where($quantityColumn, '>', 0)->where($quantityColumn, '<=', 5)->count();
                $outOfStockCount = (int) (clone $query)->where($quantityColumn, '<=', 0)->count();
            }
        }

        $availableDevices = 0;
        $soldDevices = 0;

        if (Schema::hasTable('device_units')) {
            $deviceQuery = DB::table('device_units');

            if (Schema::hasColumn('device_units', 'deleted_at')) {
                $deviceQuery->whereNull('deleted_at');
            }

            if ($request->filled('branch_id') && Schema::hasColumn('device_units', 'branch_id')) {
                $deviceQuery->where('branch_id', $request->branch_id);
            }

            if (Schema::hasColumn('device_units', 'status')) {
                $availableDevices = (int) (clone $deviceQuery)->where('status', 'available')->count();
                $soldDevices = (int) (clone $deviceQuery)->where('status', 'sold')->count();
            } else {
                $availableDevices = (int) $deviceQuery->count();
            }
        }

        return [
            'total_products' => (int) $totalProducts,
            'total_branch_stock_qty' => round($totalBranchStockQty, 2),
            'low_stock_count' => $lowStockCount,
            'out_of_stock_count' => $outOfStockCount,
            'available_devices' => $availableDevices,
            'sold_devices' => $soldDevices,
        ];
    }

    private function customerDueTotals(): array
    {
        if (!Schema::hasTable('customers')) {
            return ['customer_due_count' => 0, 'total_customer_due' => 0];
        }

        $balanceColumn = $this->firstExistingColumn('customers', ['current_balance', 'balance', 'due_amount']);

        if (!$balanceColumn) {
            return ['customer_due_count' => 0, 'total_customer_due' => 0];
        }

        $query = DB::table('customers')->where($balanceColumn, '>', 0);

        if (Schema::hasColumn('customers', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        return [
            'customer_due_count' => (int) (clone $query)->count(),
            'total_customer_due' => round((float) (clone $query)->sum($balanceColumn), 2),
        ];
    }

    private function supplierDueTotals(): array
    {
        if (!Schema::hasTable('suppliers')) {
            return ['supplier_due_count' => 0, 'total_supplier_due' => 0, 'total_supplier_advance' => 0];
        }

        $balanceColumn = $this->firstExistingColumn('suppliers', ['current_balance', 'balance', 'due_amount']);
        $advanceColumn = Schema::hasColumn('suppliers', 'advance_balance') ? 'advance_balance' : null;

        $query = DB::table('suppliers');

        if (Schema::hasColumn('suppliers', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        return [
            'supplier_due_count' => $balanceColumn ? (int) (clone $query)->where($balanceColumn, '>', 0)->count() : 0,
            'total_supplier_due' => $balanceColumn ? round((float) (clone $query)->sum($balanceColumn), 2) : 0,
            'total_supplier_advance' => $advanceColumn ? round((float) (clone $query)->sum($advanceColumn), 2) : 0,
        ];
    }

    private function expenseTotals(Request $request, Carbon $dateFrom, Carbon $dateTo): array
    {
        if (!Schema::hasTable('expenses')) {
            return ['expense_count' => 0, 'total_expense' => 0];
        }

        $query = DB::table('expenses');

        if (Schema::hasColumn('expenses', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        if ($request->filled('branch_id') && Schema::hasColumn('expenses', 'branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }

        $dateColumn = $this->firstExistingColumn('expenses', ['expense_date', 'date', 'created_at']);
        if ($dateColumn) {
            $query->whereBetween($dateColumn, [$dateFrom, $dateTo]);
        }

        $amountColumn = $this->firstExistingColumn('expenses', ['amount', 'total_amount', 'expense_amount']);

        return [
            'expense_count' => (int) (clone $query)->count(),
            'total_expense' => $amountColumn ? round((float) (clone $query)->sum($amountColumn), 2) : 0,
        ];
    }

    private function saleAmountColumn(): ?string
    {
        return $this->firstExistingColumn('sales', ['final_amount', 'total', 'grand_total', 'total_amount', 'subtotal']);
    }

    private function purchaseAmountColumn(): ?string
    {
        return $this->firstExistingColumn('purchases', ['final_amount', 'grand_total', 'total_amount', 'bill_amount', 'net_amount', 'subtotal']);
    }

    private function firstExistingColumn(string $table, array $columns): ?string
    {
        if (!Schema::hasTable($table)) {
            return null;
        }

        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                return $column;
            }
        }

        return null;
    }

    private function sumExpression(string $table, ?string $column): string
    {
        if (!$column || !Schema::hasColumn($table, $column)) {
            return '0';
        }

        return "SUM(COALESCE($table.$column, 0))";
    }

    private function missingTable(string $table)
    {
        return response()->json([
            'success' => false,
            'message' => $table . ' table not found.',
            'data' => [],
        ], 404);
    }
}
