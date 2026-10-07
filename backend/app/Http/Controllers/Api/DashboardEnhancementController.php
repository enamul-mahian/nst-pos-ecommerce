<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\BookingPreorder;
use App\Models\CustomerMessage;
use App\Models\DeviceUnit;
use App\Models\Expense;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\Setting;
use App\Models\WarrantyServiceJob;
use App\Services\PurchasePriceVisibilityService;
use Carbon\Carbon;
use App\Services\AccessControlService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Throwable;

class DashboardEnhancementController extends Controller
{
    public function corporateSummary(Request $request, AccessControlService $accessControl)
    {
        $user = $request->user();
        $calendarAllowed = $accessControl->hasAnyRole($user, ['super_admin', 'admin', 'accountant']);
        $timezone = 'Asia/Dhaka';

        try {
            if (Schema::hasTable('settings')) {
                $savedTimezone = Setting::query()->where('key', 'timezone')->value('value');
                if (is_string($savedTimezone) && in_array($savedTimezone, timezone_identifiers_list(), true)) {
                    $timezone = $savedTimezone;
                }
            }
        } catch (Throwable $e) {
            report($e);
        }

        $range = $calendarAllowed && in_array($request->string('range')->toString(), ['daily', 'weekly', 'monthly', 'custom'], true)
            ? $request->string('range')->toString()
            : 'daily';

        try {
            $anchor = Carbon::parse($request->input('date', now($timezone)->toDateString()), $timezone);
        } catch (Throwable $e) {
            $anchor = now($timezone);
        }

        if ($range === 'weekly') {
            $startLocal = $anchor->copy()->startOfWeek(Carbon::MONDAY)->startOfDay();
            $endLocal = $anchor->copy()->endOfWeek(Carbon::SUNDAY)->endOfDay();
        } elseif ($range === 'monthly') {
            $startLocal = $anchor->copy()->startOfMonth()->startOfDay();
            $endLocal = $anchor->copy()->endOfMonth()->endOfDay();
        } elseif ($range === 'custom') {
            try {
                $startLocal = Carbon::parse($request->input('start_date'), $timezone)->startOfDay();
                $endLocal = Carbon::parse($request->input('end_date'), $timezone)->endOfDay();
            } catch (Throwable $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'A valid custom start date and end date are required.',
                ], 422);
            }

            if ($endLocal->lessThan($startLocal)) {
                return response()->json([
                    'success' => false,
                    'message' => 'The end date must be on or after the start date.',
                ], 422);
            }

            if ($startLocal->diffInDays($endLocal) > 366) {
                return response()->json([
                    'success' => false,
                    'message' => 'The custom dashboard range cannot exceed 366 days.',
                ], 422);
            }
        } else {
            $startLocal = $anchor->copy()->startOfDay();
            $endLocal = $anchor->copy()->endOfDay();
        }

        $startUtc = $startLocal->copy()->utc();
        $endUtc = $endLocal->copy()->utc();
        $allowedBranchIds = $this->dashboardAllowedBranchIds($user, $accessControl);
        $branchId = null;
        if ($calendarAllowed && $request->filled('branch_id') && Schema::hasTable('branches')) {
            $candidateBranchId = (int) $request->input('branch_id');
            $branchAllowed = $allowedBranchIds === null || in_array($candidateBranchId, $allowedBranchIds, true);
            if ($candidateBranchId > 0 && $branchAllowed && Branch::query()->whereKey($candidateBranchId)->exists()) {
                $branchId = $candidateBranchId;
            } elseif ($candidateBranchId > 0 && ! $branchAllowed) {
                return response()->json([
                    'success' => false,
                    'message' => 'You are not allowed to view this branch dashboard.',
                ], 403);
            }
        }

        $effectiveBranchIds = $branchId ? [$branchId] : $allowedBranchIds;

        $data = [
            'today_sales' => 0,
            'today_collection' => 0,
            'today_due' => 0,
            'today_expense' => 0,
            'net_profit' => 0,
            'website_orders' => 0,
            'website_order_value' => 0,
            'low_stock' => 0,
            'pending_booking' => 0,
            'open_messages' => 0,
            'pending_warranty' => 0,
            'total_orders' => 0,
            'pending_orders' => 0,
            'customers' => 0,
            'suppliers' => 0,
            'products' => 0,
            'stock_value' => 0,
            'pending_transfers' => 0,
            'service_queue' => 0,
            'top_products' => [],
            'salesman_leaderboard' => [],
            'recent_activities' => [],
        ];

        try {
            if (Schema::hasTable('sales')) {
                $sales = Sale::query()
                    ->whereBetween('created_at', [$startUtc, $endUtc])
                    ->where('status', 'completed');

                $this->applyDashboardBranchScope($sales, 'sales', $effectiveBranchIds);

                $data['today_sales'] = (float) (clone $sales)->sum('final_amount');
                $data['today_collection'] = (float) (clone $sales)->sum('paid_amount');
                $data['today_due'] = (float) (clone $sales)->sum('due_amount');
                $data['net_profit'] = (float) (clone $sales)->sum('profit_amount');

                // "Monthly Sales" card: the whole calendar month of the selected date.
                $monthSales = Sale::query()
                    ->whereBetween('created_at', [$anchor->copy()->startOfMonth()->startOfDay()->utc(), $anchor->copy()->endOfMonth()->endOfDay()->utc()])
                    ->where('status', 'completed');
                $this->applyDashboardBranchScope($monthSales, 'sales', $effectiveBranchIds);
                $data['monthly_sales'] = (float) $monthSales->sum('final_amount');
            }

            if (Schema::hasTable('expenses')) {
                $expenseDateColumn = Schema::hasColumn('expenses', 'expense_date') ? 'expense_date' : 'created_at';
                $expenseAmountColumn = Schema::hasColumn('expenses', 'amount') ? 'amount' : null;
                $expenseQuery = Expense::query();

                if ($expenseDateColumn === 'expense_date') {
                    $expenseQuery->whereBetween($expenseDateColumn, [$startLocal->toDateString(), $endLocal->toDateString()]);
                } else {
                    $expenseQuery->whereBetween($expenseDateColumn, [$startUtc, $endUtc]);
                }

                $this->applyDashboardBranchScope($expenseQuery, 'expenses', $effectiveBranchIds);

                $expenseTotal = $expenseAmountColumn ? (float) $expenseQuery->sum($expenseAmountColumn) : 0;
                $data['today_expense'] = $expenseTotal;
                $data['net_profit'] -= $expenseTotal;
            }

            if (Schema::hasTable('customer_orders')) {
                $websiteOrders = DB::table('customer_orders')->whereBetween('created_at', [$startUtc, $endUtc]);
                if (Schema::hasColumn('customer_orders', 'deleted_at')) {
                    $websiteOrders->whereNull('deleted_at');
                }
                $this->applyDashboardBranchScope($websiteOrders, 'customer_orders', $effectiveBranchIds);
                $data['website_orders'] = (clone $websiteOrders)->count();
                $data['website_order_value'] = Schema::hasColumn('customer_orders', 'total_amount')
                    ? (float) (clone $websiteOrders)->sum('total_amount')
                    : 0;
                $data['total_orders'] = (clone $websiteOrders)->count();
                if (Schema::hasColumn('customer_orders', 'status')) {
                    $data['pending_orders'] = (clone $websiteOrders)
                        ->whereIn('status', ['pending', 'pending_payment', 'processing', 'confirmed'])
                        ->count();
                }
            }

            if (Schema::hasTable('customers')) {
                $customers = DB::table('customers');
                if (Schema::hasColumn('customers', 'deleted_at')) {
                    $customers->whereNull('deleted_at');
                }
                $this->applyDashboardBranchScope($customers, 'customers', $effectiveBranchIds);
                $data['customers'] = $customers->count();
            }

            if (Schema::hasTable('suppliers')) {
                $suppliers = DB::table('suppliers');
                if (Schema::hasColumn('suppliers', 'deleted_at')) {
                    $suppliers->whereNull('deleted_at');
                }
                $this->applyDashboardBranchScope($suppliers, 'suppliers', $effectiveBranchIds);
                $data['suppliers'] = $suppliers->count();
            }

            if (Schema::hasTable('products')) {
                $products = DB::table('products');
                if (Schema::hasColumn('products', 'deleted_at')) {
                    $products->whereNull('deleted_at');
                }
                $this->applyDashboardBranchScope($products, 'products', $effectiveBranchIds);
                $data['products'] = $products->count();
            }

            if (Schema::hasTable('branch_stocks')) {
                $qtyColumn = Schema::hasColumn('branch_stocks', 'quantity') ? 'quantity' : null;
                if ($qtyColumn) {
                    $lowStock = DB::table('branch_stocks')->where($qtyColumn, '<=', 5);
                    $this->applyDashboardBranchScope($lowStock, 'branch_stocks', $effectiveBranchIds);
                    $data['low_stock'] = $lowStock->count();
                }

                if (Schema::hasColumn('branch_stocks', 'quantity')) {
                    $stockValue = DB::table('branch_stocks as bs');
                    if ($effectiveBranchIds !== null) {
                        if ($effectiveBranchIds === []) {
                            $stockValue->whereRaw('1 = 0');
                        } elseif (Schema::hasColumn('branch_stocks', 'branch_id')) {
                            $stockValue->whereIn('bs.branch_id', $effectiveBranchIds);
                        }
                    }
                    // Value stock at cost: the variant's cost when the row is a variant, else the product's purchase price.
                    // (Rows without a variant used to be dropped by an inner join, so simple products showed ৳0.)
                    $costParts = [];
                    if (Schema::hasTable('product_variants') && Schema::hasColumn('branch_stocks', 'product_variant_id')) {
                        $variantCost = Schema::hasColumn('product_variants', 'purchase_price') ? 'purchase_price' : (Schema::hasColumn('product_variants', 'cost_price') ? 'cost_price' : null);
                        if ($variantCost) {
                            $stockValue->leftJoin('product_variants as pv', 'pv.id', '=', 'bs.product_variant_id');
                            $costParts[] = "NULLIF(pv.{$variantCost}, 0)";
                        }
                    }
                    if (Schema::hasTable('products') && Schema::hasColumn('branch_stocks', 'product_id') && Schema::hasColumn('products', 'purchase_price')) {
                        $stockValue->leftJoin('products as p', 'p.id', '=', 'bs.product_id');
                        $costParts[] = 'p.purchase_price';
                    }
                    if ($costParts) {
                        $costParts[] = '0';
                        $data['stock_value'] = (float) $stockValue->selectRaw('COALESCE(SUM(bs.quantity * COALESCE('.implode(', ', $costParts).')), 0) as total')->value('total');
                    }
                }
            }

            if (Schema::hasTable('stock_transfer_requests')) {
                $transfers = DB::table('stock_transfer_requests')->whereIn('status', ['pending', 'requested', 'approved']);
                if ($effectiveBranchIds !== null) {
                    if ($effectiveBranchIds === []) {
                        $transfers->whereRaw('1 = 0');
                    } else {
                        $transfers->where(function ($query) use ($effectiveBranchIds) {
                            if (Schema::hasColumn('stock_transfer_requests', 'from_branch_id')) {
                                $query->orWhereIn('from_branch_id', $effectiveBranchIds);
                            }
                            if (Schema::hasColumn('stock_transfer_requests', 'to_branch_id')) {
                                $query->orWhereIn('to_branch_id', $effectiveBranchIds);
                            }
                        });
                    }
                }
                $data['pending_transfers'] = $transfers->count();
            }

            if (Schema::hasTable('booking_preorders')) {
                $bookings = BookingPreorder::whereIn('status', ['pending_payment', 'booked', 'product_arrived']);
                $this->applyDashboardBranchScope($bookings, 'booking_preorders', $effectiveBranchIds);
                $data['pending_booking'] = $bookings->count();
            }

            if (Schema::hasTable('customer_messages')) {
                $messages = CustomerMessage::whereIn('status', ['open', 'replied']);
                $this->applyDashboardBranchScope($messages, 'customer_messages', $effectiveBranchIds);
                $data['open_messages'] = $messages->count();
            }

            if (Schema::hasTable('warranty_service_jobs')) {
                $serviceJobs = WarrantyServiceJob::whereNotIn('status', ['delivered', 'rejected', 'cancelled']);
                $this->applyDashboardBranchScope($serviceJobs, 'warranty_service_jobs', $effectiveBranchIds);
                $data['pending_warranty'] = (clone $serviceJobs)->count();
                $data['service_queue'] = (clone $serviceJobs)->count();
            }

            $data['top_products'] = $this->topProducts($startUtc, $endUtc, $effectiveBranchIds);
            $data['salesman_leaderboard'] = $this->salesmanLeaderboard($startUtc, $endUtc, $effectiveBranchIds);
            $data['recent_activities'] = $this->recentActivities(15, $user, $accessControl);
            $data['sales_trend'] = $this->salesTrend($startUtc, $endUtc, $effectiveBranchIds, $timezone);
            $data['branch_sales'] = $this->branchSalesBreakdown($startUtc, $endUtc, $effectiveBranchIds);
            $data['order_status_breakdown'] = $this->orderStatusBreakdown($startUtc, $endUtc, $effectiveBranchIds);
        } catch (Throwable $e) {
            report($e);
            $data['recent_activities'] = [];
        }

        $dashboardAccess = $this->dashboardAccess($user, $accessControl);

        if (! $this->dashboardFlag($dashboardAccess, 'show_sales_cards', true)) {
            unset(
                $data['today_sales'],
                $data['monthly_sales'],
                $data['today_collection'],
                $data['today_due'],
                $data['website_orders'],
                $data['website_order_value'],
                $data['top_products'],
                $data['salesman_leaderboard'],
                $data['total_orders'],
                $data['pending_orders']
            );
        } else {
            if (! $this->dashboardFlag($dashboardAccess, 'show_today_sales_card', true)) {
                unset($data['today_sales'], $data['monthly_sales']);
            }
            if (! $this->dashboardFlag($dashboardAccess, 'show_today_collection_card', true)) {
                unset($data['today_collection']);
            }
            if (! $this->dashboardFlag($dashboardAccess, 'show_today_due_card', true)) {
                unset($data['today_due']);
            }
            if (! $this->dashboardFlag($dashboardAccess, 'show_top_products_section', true)) {
                unset($data['top_products']);
            }
            if (! $this->dashboardFlag($dashboardAccess, 'show_salesman_leaderboard_section', true)) {
                unset($data['salesman_leaderboard']);
            }
        }

        if (! $this->dashboardFlag($dashboardAccess, 'show_stock_cards', true)
            || ! $this->dashboardFlag($dashboardAccess, 'show_dashboard_low_stock_card', true)) {
            unset($data['low_stock']);
        }

        if (! $this->dashboardFlag($dashboardAccess, 'show_financial_cards', false)
            || ! $accessControl->canViewProfit($user)) {
            unset($data['today_expense'], $data['net_profit'], $data['stock_value']);
        } else {
            if (! $this->dashboardFlag($dashboardAccess, 'show_today_expense_card', true)) {
                unset($data['today_expense']);
            }
            if (! $this->dashboardFlag($dashboardAccess, 'show_net_profit_card', true)) {
                unset($data['net_profit']);
            }
        }

        if (! $this->dashboardFlag($dashboardAccess, 'show_pending_booking_card', true)) {
            unset($data['pending_booking']);
        }
        if (! $this->dashboardFlag($dashboardAccess, 'show_open_messages_card', true)) {
            unset($data['open_messages']);
        }
        if (! $this->dashboardFlag($dashboardAccess, 'show_pending_warranty_card', true)) {
            unset($data['pending_warranty']);
        }
        if (! $this->dashboardFlag($dashboardAccess, 'show_recent_activities_section', true)) {
            unset($data['recent_activities']);
        }

        if (! $this->dashboardFlag($dashboardAccess, 'show_branch_summary', true)) {
            $data['branch_summary_hidden'] = true;
        }

        $branches = [];
        if ($calendarAllowed && Schema::hasTable('branches')) {
            $branches = Branch::query()
                ->when($allowedBranchIds !== null, fn ($query) => $query->whereIn('id', $allowedBranchIds))
                ->when(Schema::hasColumn('branches', 'status'), fn ($query) => $query->whereIn('status', ['active', 'Active', 1]))
                ->orderBy('name')
                ->get(['id', 'name', 'code'])
                ->map(fn (Branch $branch) => [
                    'id' => $branch->id,
                    'name' => $branch->name,
                    'code' => $branch->code,
                ])
                ->values()
                ->all();
        }

        $data['calendar'] = [
            'allowed' => $calendarAllowed,
            'timezone' => $timezone,
            'range' => $range,
            'date' => $anchor->toDateString(),
            'start_date' => $startLocal->toDateString(),
            'end_date' => $endLocal->toDateString(),
            'label' => $startLocal->isSameDay($endLocal)
                ? $startLocal->format('d M Y')
                : $startLocal->format('d M Y') . ' – ' . $endLocal->format('d M Y'),
            'branch_id' => $branchId,
            'branches' => $branches,
        ];
        $data['dashboard_permissions'] = $dashboardAccess;
        $data['system_status'] = $this->dashboardSystemStatus($user);

        return response()->json(['success' => true, 'data' => $data]);
    }

    public function notifications(Request $request, AccessControlService $accessControl)
    {
        return response()->json([
            'success' => true,
            'data' => $this->recentActivities(30, $request->user(), $accessControl),
        ]);
    }

    public function centralSearch(Request $request, PurchasePriceVisibilityService $priceVisibility, AccessControlService $accessControl)
    {
        // NST V73c Final: accept q/search/query/term from the V72b frontend without changing the POS bundle.
        $search = trim((string) (
            $request->get('q')
            ?: $request->get('search')
            ?: $request->get('query')
            ?: $request->get('term')
            ?: ''
        ));
        $user = $request->user();
        $canSeePurchasePrice = $priceVisibility->canView($user);
        $dashboardAccess = $this->dashboardAccess($user, $accessControl);

        if (! ($dashboardAccess['show_dashboard_search'] ?? true)) {
            return response()->json([
                'success' => true,
                'mode' => 'product_table',
                'disabled' => true,
                'message' => 'Dashboard search is disabled for this user.',
                'can_see_purchase_price' => $canSeePurchasePrice,
                'data' => [],
            ]);
        }

        if (mb_strlen($search) < 2) {
            return response()->json([
                'success' => true,
                'mode' => 'product_table',
                'can_see_purchase_price' => $canSeePurchasePrice,
                'data' => [],
            ]);
        }

        $terms = $this->dashboardSearchTerms($search);
        $branchIds = $this->dashboardAllowedBranchIds($user, $accessControl);
        $rows = [];

        try {
            if (Schema::hasTable('device_units')) {
                $query = DB::table('device_units')
                    ->leftJoin('products', 'products.id', '=', 'device_units.product_id')
                    ->leftJoin('product_variants', 'product_variants.id', '=', 'device_units.product_variant_id')
                    ->leftJoin('branches', 'branches.id', '=', 'device_units.branch_id')
                    ->select('device_units.*');

                if (Schema::hasColumn('products', 'name')) {
                    $query->addSelect('products.name as product_db_name');
                }
                if (Schema::hasColumn('products', 'model')) {
                    $query->addSelect('products.model as product_model');
                }
                if (Schema::hasColumn('product_variants', 'model_number')) {
                    $query->addSelect('product_variants.model_number as variant_model_number');
                }
                if (Schema::hasColumn('product_variants', 'purchase_price')) {
                    $query->addSelect('product_variants.purchase_price as variant_purchase_price');
                }
                if (Schema::hasColumn('product_variants', 'sale_price')) {
                    $query->addSelect('product_variants.sale_price as variant_sale_price');
                }
                if (Schema::hasColumn('branches', 'name')) {
                    $query->addSelect('branches.name as branch_name');
                }

                if (Schema::hasColumn('device_units', 'deleted_at')) {
                    $query->whereNull('device_units.deleted_at');
                }

                $this->applyDashboardBranchScope($query, 'device_units', $branchIds);

                $query->where(function ($q) use ($terms) {
                    foreach (['product_name', 'model_number', 'sku', 'imei_1', 'imei_2', 'barcode', 'imei_1_barcode', 'imei_2_barcode', 'color_name', 'region', 'sim_network', 'ram', 'storage', 'status'] as $column) {
                        if (Schema::hasColumn('device_units', $column)) {
                            foreach ($terms as $term) {
                                $q->orWhere("device_units.$column", 'like', "%{$term}%");
                            }
                        }
                    }
                    if (Schema::hasColumn('products', 'name')) {
                        foreach ($terms as $term) {
                            $q->orWhere('products.name', 'like', "%{$term}%");
                        }
                    }
                    if (Schema::hasColumn('products', 'model')) {
                        foreach ($terms as $term) {
                            $q->orWhere('products.model', 'like', "%{$term}%");
                        }
                    }
                    if (Schema::hasColumn('product_variants', 'model_number')) {
                        foreach ($terms as $term) {
                            $q->orWhere('product_variants.model_number', 'like', "%{$term}%");
                        }
                    }
                });

                foreach ($query->limit(80)->get() as $device) {
                    $source = (array) $device;
                    $row = $this->dashboardProductRow($source, $canSeePurchasePrice, 'device');
                    $row['match_score'] = $this->dashboardSearchScore($source, $terms, 'device');
                    $row['match_type'] = $this->dashboardSearchMatchType($source, $terms);
                    $rows[] = $row;
                }
            }

            if (count($rows) < 60 && Schema::hasTable('product_variants')) {
                $query = DB::table('product_variants')
                    ->leftJoin('products', 'products.id', '=', 'product_variants.product_id')
                    ->leftJoin('branches', 'branches.id', '=', 'product_variants.branch_id')
                    ->select('product_variants.*');

                if (Schema::hasColumn('products', 'name')) {
                    $query->addSelect('products.name as product_db_name');
                }
                if (Schema::hasColumn('products', 'model')) {
                    $query->addSelect('products.model as product_model');
                }
                if (Schema::hasColumn('branches', 'name')) {
                    $query->addSelect('branches.name as branch_name');
                }

                $this->applyDashboardBranchScope($query, 'product_variants', $branchIds);

                $query->where(function ($q) use ($terms) {
                    foreach (['variant_name', 'model_number', 'sku', 'barcode', 'color_name', 'region', 'sim_network', 'ram', 'storage', 'imei_1', 'imei_2'] as $column) {
                        if (Schema::hasColumn('product_variants', $column)) {
                            foreach ($terms as $term) {
                                $q->orWhere("product_variants.$column", 'like', "%{$term}%");
                            }
                        }
                    }
                    if (Schema::hasColumn('products', 'name')) {
                        foreach ($terms as $term) {
                            $q->orWhere('products.name', 'like', "%{$term}%");
                        }
                    }
                    if (Schema::hasColumn('products', 'model')) {
                        foreach ($terms as $term) {
                            $q->orWhere('products.model', 'like', "%{$term}%");
                        }
                    }
                });

                foreach ($query->limit(40)->get() as $variant) {
                    $source = (array) $variant;
                    $row = $this->dashboardProductRow($source, $canSeePurchasePrice, 'variant');
                    $row['match_score'] = $this->dashboardSearchScore($source, $terms, 'variant');
                    $row['match_type'] = $this->dashboardSearchMatchType($source, $terms);
                    $rows[] = $row;
                }
            }

            if (count($rows) < 60 && Schema::hasTable('products')) {
                $query = DB::table('products')->select('products.*');

                $this->applyDashboardBranchScope($query, 'products', $branchIds);

                $query->where(function ($q) use ($terms) {
                    foreach (['name', 'sku', 'barcode', 'model', 'brand', 'category'] as $column) {
                        if (Schema::hasColumn('products', $column)) {
                            foreach ($terms as $term) {
                                $q->orWhere("products.$column", 'like', "%{$term}%");
                            }
                        }
                    }
                });

                foreach ($query->limit(40)->get() as $product) {
                    $source = (array) $product;
                    $row = $this->dashboardProductRow($source, $canSeePurchasePrice, 'product');
                    $row['match_score'] = $this->dashboardSearchScore($source, $terms, 'product');
                    $row['match_type'] = $this->dashboardSearchMatchType($source, $terms);
                    $rows[] = $row;
                }
            }
        } catch (Throwable $e) {
            report($e);
        }

        // NST V73c Final Deduplicate: device_units must win over duplicate variant rows for same IMEI pair.
        $uniqueRows = collect($rows)
            ->sortByDesc(fn ($row) => (int) ($row['match_score'] ?? 0))
            ->unique(function ($row) {
                $imei1 = $this->dashboardNormalizeToken($row['imei_1'] ?? '');
                $imei2 = $this->dashboardNormalizeToken($row['imei_2'] ?? '');

                if ($imei1 !== '' || $imei2 !== '') {
                    return 'imei-' . $imei1 . '-' . $imei2;
                }

                $skuBarcode = $this->dashboardNormalizeToken($row['sku_barcode'] ?? '');

                if ($skuBarcode !== '') {
                    return 'sku-barcode-' . $skuBarcode;
                }

                return ($row['source_type'] ?? '') . '-' . ($row['id'] ?? '');
            })
            ->values()
            ->take(60)
            ->all();

        return response()->json([
            'success' => true,
            'mode' => 'product_table',
            'query' => $search,
            'terms' => $terms,
            'branch_scope' => $branchIds === null ? 'global' : 'limited',
            'can_see_purchase_price' => $canSeePurchasePrice,
            'data' => $uniqueRows,
        ]);
    }

    private function dashboardAccess($user, AccessControlService $accessControl): array
    {
        $roles = $accessControl->roleNames($user);
        $defaults = $accessControl->defaultAccessForRoles($roles)['dashboard_permissions'] ?? [];

        // Backend Dashboard Visibility: expanded permission baseline.
        $base = array_replace($this->dashboardPermissionDefaults($accessControl->canViewProfit($user)), $defaults);

        $stored = $accessControl->userAccess($user)['dashboard_permissions'] ?? [];

        return array_replace($base, is_array($stored) ? $stored : []);
    }

    private function dashboardPermissionDefaults(bool $canViewFinancial): array
    {
        return [
            'show_financial_cards' => $canViewFinancial,
            'show_stock_cards' => true,
            'show_sales_cards' => true,
            'show_branch_summary' => true,
            'show_dashboard_search' => true,

            'show_today_sales_card' => true,
            'show_today_collection_card' => true,
            'show_today_due_card' => true,
            'show_today_expense_card' => $canViewFinancial,
            'show_net_profit_card' => $canViewFinancial,
            'show_dashboard_low_stock_card' => true,
            'show_pending_booking_card' => true,
            'show_open_messages_card' => true,
            'show_pending_warranty_card' => true,
            'show_top_products_section' => true,
            'show_salesman_leaderboard_section' => true,
            'show_recent_activities_section' => true,
        ];
    }

    private function dashboardFlag(array $permissions, string $key, bool $default = true): bool
    {
        return array_key_exists($key, $permissions) ? (bool) $permissions[$key] : $default;
    }

    private function dashboardSearchTerms(string $search): array
    {
        // Central Search Exact Identifier Fix:
        // SKU/barcode/IMEI searches must not split NST-xxxxx into "nst" and return every NST SKU.
        $raw = trim($search);

        if ($raw === '') {
            return [];
        }

        $normalizedCompact = $this->dashboardNormalizeToken($raw);
        $lower = mb_strtolower($raw);

        if ($this->dashboardLooksLikeExactIdentifier($raw, $normalizedCompact)) {
            $terms = array_filter(
                array_unique([$raw, $lower, $normalizedCompact]),
                function ($term) {
                    $term = trim((string) $term);
                    return $term !== '' && mb_strlen($term) >= 2;
                }
            );

            return array_values($terms);
        }

        $parts = preg_split('/[\s,\/|_-]+/u', $lower, -1, PREG_SPLIT_NO_EMPTY);

        if (! is_array($parts)) {
            $parts = [];
        }

        $numericTerms = [];
        if (preg_match_all('/\d{6,}/u', $lower, $matches)) {
            $numericTerms = $matches[0];
        }

        $terms = array_filter(
            array_unique(array_merge([$raw, $lower, $normalizedCompact], $parts, $numericTerms)),
            function ($term) {
                $term = trim((string) $term);
                return $term !== '' && mb_strlen($term) >= 2;
            }
        );

        return array_values($terms);
    }

    private function dashboardNormalizeToken($value): string
    {
        $value = mb_strtolower(trim((string) $value));
        return preg_replace('/[^a-z0-9]+/u', '', $value) ?: '';
    }

    private function dashboardLooksLikeExactIdentifier(string $raw, string $normalizedCompact): bool
    {
        $raw = trim($raw);

        if ($raw === '' || $normalizedCompact === '') {
            return false;
        }

        if (preg_match('/^nst[\s\-_]*[a-z0-9]{3,}$/iu', $raw)) {
            return true;
        }

        if (preg_match('/^\d{6,}$/u', $normalizedCompact)) {
            return true;
        }

        if (preg_match('/^[a-z0-9]+[\s\-_][a-z0-9\-_]+$/iu', $raw) && preg_match('/\d/u', $raw)) {
            return true;
        }

        return false;
    }

    private function dashboardSearchScore(array $item, array $terms, string $sourceType): int
    {
        $score = match ($sourceType) {
            'device' => 30,
            'variant' => 20,
            default => 10,
        };

        $exactFields = [
            'imei_1' => 1200,
            'imei_2' => 1200,
            'imei_1_barcode' => 1100,
            'imei_2_barcode' => 1100,
            'barcode' => 1000,
            'sku' => 950,
            'model_number' => 850,
            'variant_model_number' => 850,
            'product_model' => 800,
        ];

        foreach ($terms as $term) {
            $needle = $this->dashboardNormalizeToken($term);
            if ($needle === '') {
                continue;
            }

            foreach ($exactFields as $field => $points) {
                $hay = $this->dashboardNormalizeToken($item[$field] ?? '');
                if ($hay !== '' && $hay === $needle) {
                    $score += $points;
                } elseif ($hay !== '' && str_contains($hay, $needle)) {
                    $score += (int) floor($points / 3);
                }
            }

            foreach (['product_name', 'product_db_name', 'name', 'variant_name', 'color_name', 'region', 'sim_network', 'ram', 'storage', 'status'] as $field) {
                $hay = $this->dashboardNormalizeToken($item[$field] ?? '');
                if ($hay === '') {
                    continue;
                }

                if ($hay === $needle) {
                    $score += 500;
                } elseif (str_starts_with($hay, $needle)) {
                    $score += 250;
                } elseif (str_contains($hay, $needle)) {
                    $score += 120;
                }
            }
        }

        return $score;
    }

    private function dashboardSearchMatchType(array $item, array $terms): string
    {
        foreach ($terms as $term) {
            $needle = $this->dashboardNormalizeToken($term);
            if ($needle === '') {
                continue;
            }

            foreach (['imei_1', 'imei_2'] as $field) {
                if ($this->dashboardNormalizeToken($item[$field] ?? '') === $needle) {
                    return 'exact_imei';
                }
            }

            foreach (['barcode', 'imei_1_barcode', 'imei_2_barcode'] as $field) {
                if ($this->dashboardNormalizeToken($item[$field] ?? '') === $needle) {
                    return 'exact_barcode';
                }
            }

            foreach (['sku'] as $field) {
                if ($this->dashboardNormalizeToken($item[$field] ?? '') === $needle) {
                    return 'exact_sku';
                }
            }
        }

        return 'smart_match';
    }

    private function dashboardAllowedBranchIds($user, AccessControlService $accessControl): ?array
    {
        if (! $user) {
            return [];
        }

        if ($accessControl->isAdmin($user) || $accessControl->hasAnyRole($user, ['accountant'])) {
            return null;
        }

        $ids = [];

        if (! empty($user->branch_id)) {
            $ids[] = (int) $user->branch_id;
        }

        $stored = $accessControl->userAccess($user)['branch_ids'] ?? [];
        if (is_array($stored)) {
            foreach ($stored as $id) {
                if (is_numeric($id)) {
                    $ids[] = (int) $id;
                }
            }
        }

        try {
            if (Schema::hasTable('branches') && Schema::hasColumn('branches', 'manager_id')) {
                $managed = DB::table('branches')->where('manager_id', $user->id)->pluck('id')->all();
                foreach ($managed as $id) {
                    if (is_numeric($id)) {
                        $ids[] = (int) $id;
                    }
                }
            }
        } catch (Throwable $e) {
            report($e);
        }

        return array_values(array_unique(array_filter($ids)));
    }

    private function applyDashboardBranchScope($query, string $table, ?array $branchIds): void
    {
        if ($branchIds === null) {
            return;
        }

        if ($branchIds === []) {
            $query->whereRaw('1 = 0');
            return;
        }

        if (Schema::hasColumn($table, 'branch_id')) {
            $query->whereIn("{$table}.branch_id", $branchIds);
        }
    }

    private function salesTrend(Carbon $startUtc, Carbon $endUtc, ?array $branchIds, string $timezone): array
    {
        if (! Schema::hasTable('sales')) return [];
        $amountColumn = Schema::hasColumn('sales', 'final_amount') ? 'final_amount' : (Schema::hasColumn('sales', 'total') ? 'total' : null);
        if (! $amountColumn) return [];
        $query = DB::table('sales')->select(['created_at', $amountColumn]);
        $query->whereBetween('created_at', [$startUtc, $endUtc]);
        $this->applyDashboardBranchScope($query, 'sales', $branchIds);
        if (Schema::hasColumn('sales', 'status')) $query->whereNotIn('status', ['cancelled', 'returned', 'void']);
        $rows = $query->orderBy('created_at')->limit(50000)->get();
        $singleDay = $startUtc->copy()->timezone($timezone)->isSameDay($endUtc->copy()->timezone($timezone));
        $buckets = [];
        foreach ($rows as $row) {
            $at = Carbon::parse($row->created_at, 'UTC')->timezone($timezone);
            $key = $singleDay ? $at->format('H:00') : $at->format('Y-m-d');
            $buckets[$key] = ($buckets[$key] ?? 0) + (float) $row->{$amountColumn};
        }
        return collect($buckets)->map(fn ($value, $label) => ['label' => $label, 'value' => round($value, 2)])->values()->all();
    }

    private function branchSalesBreakdown(Carbon $startUtc, Carbon $endUtc, ?array $branchIds): array
    {
        if (! Schema::hasTable('sales') || ! Schema::hasColumn('sales', 'branch_id')) return [];
        $amountColumn = Schema::hasColumn('sales', 'final_amount') ? 'final_amount' : (Schema::hasColumn('sales', 'total') ? 'total' : null);
        if (! $amountColumn) return [];
        $query = DB::table('sales as s')->leftJoin('branches as b', 'b.id', '=', 's.branch_id')
            ->whereBetween('s.created_at', [$startUtc, $endUtc]);
        if ($branchIds !== null) {
            if ($branchIds === []) $query->whereRaw('1 = 0'); else $query->whereIn('s.branch_id', $branchIds);
        }
        if (Schema::hasColumn('sales', 'status')) $query->whereNotIn('s.status', ['cancelled', 'returned', 'void']);
        return $query->selectRaw("s.branch_id, COALESCE(b.name, 'Unassigned') as label, SUM(s.{$amountColumn}) as value")
            ->groupBy('s.branch_id', 'b.name')->orderByDesc('value')->limit(12)->get()
            ->map(fn ($row) => ['branch_id' => $row->branch_id, 'label' => $row->label, 'value' => round((float) $row->value, 2)])->values()->all();
    }

    private function orderStatusBreakdown(Carbon $startUtc, Carbon $endUtc, ?array $branchIds): array
    {
        if (! Schema::hasTable('customer_orders') || ! Schema::hasColumn('customer_orders', 'status')) return [];
        $query = DB::table('customer_orders')->whereBetween('created_at', [$startUtc, $endUtc]);
        $this->applyDashboardBranchScope($query, 'customer_orders', $branchIds);
        if (Schema::hasColumn('customer_orders', 'deleted_at')) $query->whereNull('deleted_at');
        return $query->selectRaw('status as label, COUNT(*) as value')->groupBy('status')->orderByDesc('value')->get()
            ->map(fn ($row) => ['label' => (string) $row->label, 'value' => (int) $row->value])->values()->all();
    }

    private function dashboardSystemStatus($user): array
    {
        $database = false;
        try {
            DB::select('select 1');
            $database = true;
        } catch (Throwable $e) {
            report($e);
        }

        return [
            'database' => $database,
            'storage' => is_writable(storage_path()),
            'authentication' => (bool) $user,
        ];
    }


    public function stage1State(Request $request)
    {
        if (! Schema::hasTable('dashboard_stage1_states')) {
            return response()->json([
                'success' => true,
                'data' => null,
                'migration_required' => true,
                'server_synced' => false,
            ]);
        }

        $row = DB::table('dashboard_stage1_states')
            ->where('user_id', $request->user()->id)
            ->first();

        $state = $row ? $this->decodeDashboardJson($row->state, []) : null;
        $history = $row ? $this->dashboardStateHistory((int) $request->user()->id, (int) $row->id) : [];

        if (is_array($state) && $history !== []) {
            $state['history'] = $history;
        }

        return response()->json([
            'success' => true,
            'data' => $state,
            'version' => $row?->version,
            'state_hash' => $row?->state_hash,
            'last_saved_at' => $row?->last_saved_at ?? $row?->updated_at,
            'history' => $history,
            'server_synced' => (bool) $row,
            'source_of_truth' => 'database',
        ]);
    }

    public function saveStage1State(Request $request)
    {
        if (! Schema::hasTable('dashboard_stage1_states')) {
            return response()->json([
                'success' => false,
                'message' => 'Dashboard Stage 1 migration is required before layout changes can be saved.',
                'server_synced' => false,
            ], 422);
        }

        $validated = $request->validate([
            'state' => ['required', 'array'],
            'state.activeWorkspaceId' => ['required', 'string', 'max:120'],
            'state.workspaces' => ['required', 'array', 'min:1', 'max:30'],
            'state.workspaces.*.id' => ['required', 'string', 'max:120'],
            'state.workspaces.*.name' => ['required', 'string', 'max:120'],
            'state.workspaces.*.layouts' => ['required', 'array'],
            'state.quickActions' => ['nullable', 'array', 'max:80'],
            'state.moduleShortcuts' => ['nullable', 'array', 'max:300'],
            'state.history' => ['nullable', 'array', 'max:50'],
            'state.version' => ['nullable', 'integer', 'min:1'],
            'client_version' => ['nullable', 'integer', 'min:0'],
        ]);

        $userId = (int) $request->user()->id;
        $saved = DB::transaction(function () use ($request, $validated, $userId) {
            $current = DB::table('dashboard_stage1_states')
                ->where('user_id', $userId)
                ->lockForUpdate()
                ->first();

            $previousState = $current ? $this->decodeDashboardJson($current->state, []) : null;
            $previousVersion = (int) ($current->version ?? 0);

            $state = $this->sanitizeDashboardStage1State($validated['state']);
            $state['version'] = $previousVersion + 1;
            $state['updatedAt'] = now()->toIso8601String();

            // Dashboard history is persisted server-side so large nested snapshots cannot break the main save payload.
            $state['history'] = $this->compactDashboardHistory($state['history'] ?? []);

            $encodedState = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $hash = hash('sha256', $encodedState ?: '');

            $values = [
                'state' => $encodedState,
                'version' => $state['version'],
                'updated_by' => $userId,
                'updated_at' => now(),
            ];
            if (Schema::hasColumn('dashboard_stage1_states', 'state_hash')) {
                $values['state_hash'] = $hash;
            }
            if (Schema::hasColumn('dashboard_stage1_states', 'last_saved_at')) {
                $values['last_saved_at'] = now();
            }
            if (Schema::hasColumn('dashboard_stage1_states', 'created_ip')) {
                $values['created_ip'] = $request->ip();
            }
            if (Schema::hasColumn('dashboard_stage1_states', 'user_agent')) {
                $values['user_agent'] = substr((string) $request->userAgent(), 0, 1000);
            }

            if ($current) {
                DB::table('dashboard_stage1_states')->where('id', $current->id)->update($values);
                $stateId = (int) $current->id;
            } else {
                $stateId = (int) DB::table('dashboard_stage1_states')->insertGetId(array_merge($values, [
                    'user_id' => $userId,
                    'created_at' => now(),
                ]));
            }

            $historyId = null;
            if (Schema::hasTable('dashboard_stage1_state_history')) {
                $historyId = DB::table('dashboard_stage1_state_history')->insertGetId([
                    'state_id' => $stateId,
                    'user_id' => $userId,
                    'version' => $state['version'],
                    'state_hash' => $hash,
                    'action' => 'dashboard_stage1_state_saved',
                    'snapshot' => $encodedState,
                    'previous_snapshot' => $previousState ? json_encode($previousState, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
                    'metadata' => json_encode([
                        'ip' => $request->ip(),
                        'user_agent' => substr((string) $request->userAgent(), 0, 500),
                        'workspace_count' => count($state['workspaces'] ?? []),
                        'quick_actions' => count($state['quickActions'] ?? []),
                        'module_shortcuts' => count($state['moduleShortcuts'] ?? []),
                        'client_version' => $validated['client_version'] ?? null,
                    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'created_at' => now(),
                ]);
            }

            $this->recordDashboardAudit(
                $request,
                'dashboard_stage1_state_saved',
                'Dashboard layout saved to database version ' . $state['version'] . '.',
                $stateId,
                $previousState,
                $state,
                ['history_id' => $historyId, 'state_hash' => $hash]
            );

            $history = $this->dashboardStateHistory($userId, $stateId);
            if ($history !== []) {
                $state['history'] = $history;
            }

            return [
                'state' => $state,
                'state_id' => $stateId,
                'version' => $state['version'],
                'state_hash' => $hash,
                'history_id' => $historyId,
            ];
        });

        return response()->json([
            'success' => true,
            'message' => 'Dashboard layout saved to the database and audit history.',
            'data' => $saved['state'],
            'version' => $saved['version'],
            'state_hash' => $saved['state_hash'],
            'history_id' => $saved['history_id'],
            'server_synced' => true,
            'source_of_truth' => 'database',
        ]);
    }

    private function sanitizeDashboardStage1State(array $state): array
    {
        $allowedBreakpoints = ['desktop', 'tablet', 'mobile'];
        $workspaces = collect($state['workspaces'] ?? [])->take(30)->map(function ($workspace) use ($allowedBreakpoints) {
            $layouts = [];
            foreach ($allowedBreakpoints as $breakpoint) {
                $layout = $workspace['layouts'][$breakpoint] ?? ['order' => [], 'positions' => []];
                $order = collect($layout['order'] ?? [])
                    ->filter(fn ($id) => is_string($id) && strlen($id) <= 100)
                    ->unique()
                    ->take(120)
                    ->values()
                    ->all();
                $positions = [];
                foreach ($order as $id) {
                    $position = is_array($layout['positions'][$id] ?? null) ? $layout['positions'][$id] : [];
                    $width = max(2, min(12, (int) ($position['w'] ?? 4)));
                    $positions[$id] = [
                        'x' => max(0, min(12 - $width, (int) ($position['x'] ?? 0))),
                        'y' => max(0, min(1000, (int) ($position['y'] ?? 0))),
                        'w' => $width,
                        'h' => max(2, min(40, (int) ($position['h'] ?? 5))),
                        'locked' => (bool) ($position['locked'] ?? false),
                    ];
                }
                $layouts[$breakpoint] = ['order' => $order, 'positions' => $positions];
            }
            return [
                'id' => substr((string) ($workspace['id'] ?? uniqid('workspace-', true)), 0, 120),
                'name' => substr((string) ($workspace['name'] ?? 'Workspace'), 0, 120),
                'roleDefault' => (bool) ($workspace['roleDefault'] ?? false),
                'layouts' => $layouts,
            ];
        })->values()->all();

        if ($workspaces === []) {
            $workspaces = [[
                'id' => 'default',
                'name' => 'My Dashboard',
                'roleDefault' => false,
                'layouts' => [
                    'desktop' => ['order' => [], 'positions' => []],
                    'tablet' => ['order' => [], 'positions' => []],
                    'mobile' => ['order' => [], 'positions' => []],
                ],
            ]];
        }

        $active = (string) ($state['activeWorkspaceId'] ?? ($workspaces[0]['id'] ?? 'default'));
        if (! collect($workspaces)->contains(fn ($workspace) => $workspace['id'] === $active)) {
            $active = $workspaces[0]['id'] ?? 'default';
        }

        return [
            'activeWorkspaceId' => $active,
            'workspaces' => $workspaces,
            'quickActions' => collect($state['quickActions'] ?? [])->filter('is_string')->unique()->take(80)->values()->all(),
            'moduleShortcuts' => collect($state['moduleShortcuts'] ?? [])->filter('is_string')->unique()->take(300)->values()->all(),
            'history' => $this->compactDashboardHistory($state['history'] ?? []),
            'version' => max(1, (int) ($state['version'] ?? 1)),
            'updatedAt' => is_string($state['updatedAt'] ?? null) ? $state['updatedAt'] : now()->toIso8601String(),
        ];
    }

    public function widgetPreferences(Request $request)
    {
        if (! Schema::hasTable('dashboard_widget_preferences')) {
            return response()->json(['success' => true, 'data' => null]);
        }

        $row = DB::table('dashboard_widget_preferences')->where('user_id', $request->user()->id)->first();
        return response()->json(['success' => true, 'data' => $row ? json_decode($row->widgets ?: '[]', true) : null]);
    }

    public function saveWidgetPreferences(Request $request)
    {
        $validated = $request->validate([
            'widgets' => ['required', 'array', 'max:80'],
            'widgets.*.key' => ['required', 'string', 'max:100'],
            'widgets.*.collapsed' => ['nullable', 'boolean'],
            'layout' => ['nullable', 'string', 'max:80'],
        ]);

        if (! Schema::hasTable('dashboard_widget_preferences')) {
            return response()->json(['success' => false, 'message' => 'Dashboard preferences table missing. Run migration.'], 422);
        }

        $widgets = collect($validated['widgets'])
            ->filter(fn ($item) => is_array($item) && is_string($item['key'] ?? null))
            ->unique('key')
            ->values()
            ->take(80)
            ->all();

        $preferenceQuery = DB::table('dashboard_widget_preferences')->where('user_id', $request->user()->id);
        $values = [
            'widgets' => json_encode($widgets, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'layout' => $validated['layout'] ?? 'corporate',
            'updated_at' => now(),
        ];
        if ($preferenceQuery->exists()) {
            $preferenceQuery->update($values);
        } else {
            DB::table('dashboard_widget_preferences')->insert(array_merge($values, [
                'user_id' => $request->user()->id,
                'created_at' => now(),
            ]));
        }

        $this->recordDashboardAudit(
            $request,
            'dashboard_widget_preferences_saved',
            'Dashboard widget preferences saved to database.',
            $request->user()->id,
            null,
            ['widgets' => $widgets, 'layout' => $values['layout']],
            ['widget_count' => count($widgets)]
        );

        return response()->json([
            'success' => true,
            'message' => 'Dashboard preferences saved to database.',
            'server_synced' => true,
            'source_of_truth' => 'database',
        ]);
    }

    private function dashboardStateHistory(int $userId, int $stateId): array
    {
        if (! Schema::hasTable('dashboard_stage1_state_history')) {
            return [];
        }

        return DB::table('dashboard_stage1_state_history')
            ->where('user_id', $userId)
            ->where('state_id', $stateId)
            ->orderByDesc('version')
            ->limit(20)
            ->get()
            ->map(function ($row) {
                return [
                    'id' => (int) $row->id,
                    'version' => (int) $row->version,
                    'savedAt' => (string) $row->created_at,
                    'stateHash' => $row->state_hash,
                    'action' => $row->action,
                    'snapshot' => $this->decodeDashboardJson($row->snapshot, null),
                    'metadata' => $this->decodeDashboardJson($row->metadata, []),
                ];
            })
            ->reverse()
            ->values()
            ->all();
    }

    private function compactDashboardHistory(array $history): array
    {
        return collect($history)->take(-20)->map(function ($item) {
            if (! is_array($item)) {
                return null;
            }

            return [
                'id' => $item['id'] ?? ($item['version'] ?? now()->timestamp),
                'version' => isset($item['version']) ? (int) $item['version'] : null,
                'savedAt' => is_string($item['savedAt'] ?? null) ? $item['savedAt'] : now()->toIso8601String(),
                'stateHash' => is_string($item['stateHash'] ?? null) ? substr($item['stateHash'], 0, 64) : null,
                'snapshot' => is_array($item['snapshot'] ?? null) ? $this->sanitizeDashboardSnapshot($item['snapshot']) : null,
            ];
        })->filter()->values()->all();
    }

    private function sanitizeDashboardSnapshot(array $snapshot): array
    {
        $copy = $snapshot;
        unset($copy['history']);
        return $copy;
    }

    private function decodeDashboardJson($value, $fallback)
    {
        if (is_array($value)) {
            return $value;
        }

        if (! is_string($value) || trim($value) === '') {
            return $fallback;
        }

        $decoded = json_decode($value, true);
        return json_last_error() === JSON_ERROR_NONE ? $decoded : $fallback;
    }

    private function recordDashboardAudit(Request $request, string $action, string $description, $modelId = null, $before = null, $after = null, array $meta = []): void
    {
        if (! Schema::hasTable('audit_logs')) {
            return;
        }

        try {
            $row = [];
            $candidate = [
                'user_id' => optional($request->user())->id,
                'branch_id' => optional($request->user())->branch_id,
                'user_name' => optional($request->user())->name,
                'user_email' => optional($request->user())->email,
                'action' => $action,
                'method' => $request->method(),
                'path' => $request->path(),
                'route_name' => optional($request->route())->getName(),
                'module' => 'dashboard',
                'model_type' => 'dashboard_stage1_state',
                'model_id' => $modelId ? (string) $modelId : null,
                'description' => $description,
                'status_code' => 200,
                'ip_address' => $request->ip(),
                'user_agent' => substr((string) $request->userAgent(), 0, 1000),
                'request_payload' => $before ? json_encode($before, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
                'response_payload' => $after ? json_encode($after, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
                'meta' => json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'created_at' => now(),
                'updated_at' => now(),
            ];

            foreach ($candidate as $column => $value) {
                if (Schema::hasColumn('audit_logs', $column)) {
                    $row[$column] = $value;
                }
            }

            if ($row !== []) {
                DB::table('audit_logs')->insert($row);
            }
        } catch (Throwable $e) {
            report($e);
        }
    }

    private function dashboardProductRow(array $item, bool $canSeePurchasePrice, string $sourceType): array
    {
        $row = [
            'id' => $item['id'] ?? null,
            'source_type' => $sourceType,
            'sku_barcode' => $item['barcode'] ?? $item['sku'] ?? null,
            'product_name' => $item['product_name'] ?? $item['product_db_name'] ?? $item['name'] ?? null,
            'model_number' => $item['model_number'] ?? $item['variant_model_number'] ?? $item['product_model'] ?? $item['model'] ?? null,
            'imei_1' => $item['imei_1'] ?? null,
            'imei_2' => $item['imei_2'] ?? null,
            'imei_display' => trim(collect([$item['imei_1'] ?? null, $item['imei_2'] ?? null])->filter()->implode(' / ')),
            'color' => $item['color_name'] ?? $item['color'] ?? null,
            'region_variant' => $item['region'] ?? $item['region_variant'] ?? $item['variant_name'] ?? null,
            'sim_network' => $item['sim_network'] ?? null,
            'ram' => ($item['ram'] ?? null) === 'Default' ? null : ($item['ram'] ?? null),
            'storage' => $item['storage'] ?? null,
            'battery_health' => $item['battery_health'] ?? null,
            'stock_quantity' => $item['stock_quantity'] ?? (($item['status'] ?? null) === 'available' ? 1 : 0),
            'sale_price' => $item['selling_price'] ?? $item['variant_sale_price'] ?? $item['sale_price'] ?? null,
            'available_branch' => $item['branch_name'] ?? null,
            'status' => $item['status'] ?? null,
            'url' => $sourceType === 'product'
                ? '/products/' . ($item['id'] ?? '') . '/edit'
                : '/device-stock?search=' . urlencode((string) ($item['imei_1'] ?? $item['barcode'] ?? $item['sku'] ?? '')),
        ];

        if ($canSeePurchasePrice) {
            $row['purchase_price'] = $item['purchase_cost'] ?? $item['variant_purchase_price'] ?? $item['purchase_price'] ?? null;
        }

        return $row;
    }

    private function topProducts(Carbon $startUtc, Carbon $endUtc, ?array $branchIds): array
    {
        try {
            if (! Schema::hasTable('sale_items')) { return []; }
            $productNameColumn = Schema::hasColumn('sale_items', 'product_name') ? 'product_name' : 'product_id';
            $quantityColumn = Schema::hasColumn('sale_items', 'quantity') ? 'quantity' : 'qty';
            $amountColumn = Schema::hasColumn('sale_items', 'line_total') ? 'line_total' : (Schema::hasColumn('sale_items', 'total') ? 'total' : null);
            if (! $amountColumn || ! Schema::hasColumn('sale_items', $quantityColumn)) { return []; }

            $query = DB::table('sale_items');
            if (Schema::hasColumn('sale_items', 'sale_id') && Schema::hasTable('sales')) {
                $query->join('sales', 'sales.id', '=', 'sale_items.sale_id')
                    ->whereBetween('sales.created_at', [$startUtc, $endUtc]);
                if ($branchIds !== null) {
                    if ($branchIds === []) {
                        $query->whereRaw('1 = 0');
                    } elseif (Schema::hasColumn('sales', 'branch_id')) {
                        $query->whereIn('sales.branch_id', $branchIds);
                    }
                }
            }

            return $query
                ->select('sale_items.' . $productNameColumn . ' as product_name', DB::raw("SUM(sale_items.{$quantityColumn}) as qty"), DB::raw("SUM(sale_items.{$amountColumn}) as amount"))
                ->groupBy('sale_items.' . $productNameColumn)
                ->orderByDesc('qty')
                ->limit(8)
                ->get()->map(fn ($r) => (array) $r)->all();
        } catch (Throwable $e) {
            report($e);
            return [];
        }
    }

    private function salesmanLeaderboard(Carbon $startUtc, Carbon $endUtc, ?array $branchIds): array
    {
        try {
            if (! Schema::hasTable('sales')) { return []; }
            $soldByColumn = Schema::hasColumn('sales', 'sold_by') ? 'sold_by' : (Schema::hasColumn('sales', 'created_by') ? 'created_by' : null);
            if (! $soldByColumn) { return []; }

            $query = DB::table('sales')
                ->leftJoin('users', 'users.id', '=', 'sales.' . $soldByColumn)
                ->whereBetween('sales.created_at', [$startUtc, $endUtc]);
            if ($branchIds !== null) {
                if ($branchIds === []) {
                    $query->whereRaw('1 = 0');
                } elseif (Schema::hasColumn('sales', 'branch_id')) {
                    $query->whereIn('sales.branch_id', $branchIds);
                }
            }

            return $query
                ->select('users.name', DB::raw('COUNT(sales.id) as invoices'), DB::raw('SUM(sales.final_amount) as amount'))
                ->groupBy('users.name')
                ->orderByDesc('amount')
                ->limit(8)
                ->get()->map(fn ($r) => (array) $r)->all();
        } catch (Throwable $e) {
            report($e);
            return [];
        }
    }

    private function recentActivities(int $limit = 15, $user = null, ?AccessControlService $accessControl = null): array
    {
        try {
            if (class_exists(AuditLog::class) && Schema::hasTable('audit_logs')) {
                $query = AuditLog::query();
                $isPrivileged = $user && $accessControl && ($accessControl->isAdmin($user) || $accessControl->hasAnyRole($user, ['accountant']));
                if ($user && ! $isPrivileged) {
                    if (Schema::hasColumn('audit_logs', 'user_id')) {
                        $query->where('user_id', $user->id);
                    } elseif (Schema::hasColumn('audit_logs', 'causer_id')) {
                        $query->where('causer_id', $user->id);
                    } else {
                        return [];
                    }
                }
                return $query->latest('id')->limit($limit)->get()->map(fn ($log) => [
                    'title' => $log->action ?? $log->method ?? 'Activity',
                    'subtitle' => $log->description ?? $log->url ?? $log->path ?? null,
                    'user' => $log->user_name ?? null,
                    'time' => optional($log->created_at)->diffForHumans(),
                    'status' => $log->status ?? null,
                ])->all();
            }
        } catch (Throwable $e) {
            report($e);
        }
        return [];
    }
}
