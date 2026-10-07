<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\BranchStock;
use App\Models\Customer;
use App\Models\DeviceUnit;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SalePayment;
use App\Models\UsedPurchase;
use App\Models\User;
use App\Services\BranchInvoiceService;
use App\Services\AccessControlService;
use App\Services\SecurityEventService;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;

class SaleController extends Controller
{
    private function saleRelations(): array
    {
        return [
            'items.product:id,name,sku,barcode,sale_price,purchase_price,stock_quantity',
            'items.variant:id,product_id,variant_name,color_name,region,variant_type,ram,storage,sku,barcode,sale_price,market_price',
            'items.usedPurchase:id,product_name,imei_1,imei_2,purchase_price',
            'items.deviceUnit:id,product_id,branch_id,imei_1,imei_2,barcode,purchase_cost,status,sale_id,sale_item_id',
            'payments.receiver:id,name,email,phone',
            'branch:id,name,code',
            'customer:id,name,phone,current_balance',
            'usedPurchase:id,product_name,imei_1,imei_2,purchase_price,actual_sale_price,profit_amount,status',
            'soldBy:id,name,email,phone',
            'paymentReceiver:id,name,email,phone',
        ];
    }

    public function posOptions(Request $request)
    {
        $branches = Branch::query()->orderBy('name')->get(['id', 'name', 'code']);

        $paymentReceivers = User::query()
            ->where('status', 'active')
            ->orderBy('name')
            ->get()
            ->filter(fn (User $user) => $this->isEligiblePaymentReceiver($user))
            ->values()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'phone' => $user->phone,
                'roles' => app(AccessControlService::class)->roleNames($user),
            ]);

        return response()->json([
            'success' => true,
            'message' => 'POS options loaded successfully.',
            'data' => [
                'branches' => $branches,
                'payment_receivers' => $paymentReceivers,
                'payment_methods' => [
                    ['key' => 'cash', 'label' => 'Cash'],
                    ['key' => 'bkash', 'label' => 'bKash'],
                    ['key' => 'nagad', 'label' => 'Nagad'],
                    ['key' => 'rocket', 'label' => 'Rocket'],
                    ['key' => 'upay', 'label' => 'Upay'],
                    ['key' => 'bank', 'label' => 'Bank'],
                    ['key' => 'card', 'label' => 'Card'],
                    ['key' => 'emi', 'label' => 'EMI'],
                    ['key' => 'other_mfs', 'label' => 'Other MFS'],
                ],
            ],
        ]);
    }

    public function customerByPhone(Request $request)
    {
        $request->validate([
            'phone' => ['required', 'string', 'max:50'],
        ]);

        $customer = Customer::where('phone', $request->phone)->first();

        return response()->json([
            'success' => true,
            'message' => $customer ? 'Customer found.' : 'Customer not found.',
            'data' => $customer,
        ]);
    }

    public function readyItems(Request $request)
    {
        $query = UsedPurchase::with([
                'branch:id,name,code',
                'salesman:id,name,email',
                'brandInfo:id,name',
                'readyProduct:id,name,sku,barcode,sale_price,stock_quantity',
                'customer:id,name,phone',
                'supplier:id,name,phone',
            ])
            ->where('status', 'ready_for_sale')
            ->whereNotNull('ready_product_id')
            ->latest();

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->where('product_name', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('imei_1', 'like', "%{$search}%")
                    ->orWhere('imei_2', 'like', "%{$search}%");
            });
        }

        return response()->json([
            'success' => true,
            'message' => 'Ready for sale used/pre-owned items loaded successfully.',
            'data' => $query->limit((int) $request->get('limit', 300))->get(),
        ]);
    }


    public function searchProducts(Request $request)
    {
        $request->validate([
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:500'],
        ]);

        $branchId = $request->integer('branch_id');
        $search = trim((string) $request->input('search', ''));

        $query = BranchStock::query()
            ->with([
                'product:id,name,sku,barcode,brand,model,category,condition,sale_price,purchase_price,discount_price,regular_price,stock_quantity,status',
                'variant:id,product_id,variant_name,color_name,region,variant_type,ram,storage,product_type,condition,sku,barcode,purchase_price,sale_price,market_price,regular_price,discount_price,stock_quantity,status',
            ])
            ->where('branch_id', $branchId)
            ->where('quantity', '>', 0);

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('product_id', $search)
                    ->orWhereHas('product', function ($productQuery) use ($search) {
                        $productQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('sku', 'like', "%{$search}%")
                            ->orWhere('barcode', 'like', "%{$search}%")
                            ->orWhere('brand', 'like', "%{$search}%")
                            ->orWhere('model', 'like', "%{$search}%")
                            ->orWhere('category', 'like', "%{$search}%")
                            ->orWhere('condition', 'like', "%{$search}%");
                    })
                    ->orWhereHas('variant', function ($variantQuery) use ($search) {
                        $variantQuery->where('variant_name', 'like', "%{$search}%")
                            ->orWhere('sku', 'like', "%{$search}%")
                            ->orWhere('barcode', 'like', "%{$search}%")
                            ->orWhere('color_name', 'like', "%{$search}%")
                            ->orWhere('region', 'like', "%{$search}%")
                            ->orWhere('variant_type', 'like', "%{$search}%")
                            ->orWhere('ram', 'like', "%{$search}%")
                            ->orWhere('storage', 'like', "%{$search}%");
                    });
            });
        }

        $productTotals = BranchStock::query()
            ->select('product_id', DB::raw('SUM(quantity) as total_quantity'))
            ->where('branch_id', $branchId)
            ->groupBy('product_id')
            ->pluck('total_quantity', 'product_id');

        $items = $query
            ->orderByDesc('id')
            ->limit((int) $request->get('limit', 300))
            ->get()
            ->map(function (BranchStock $stock) use ($productTotals) {
                $product = $stock->product;
                $variant = $stock->variant;
                $variantName = $variant?->display_name ?: $variant?->variant_name;
                $displayName = trim(($product?->name ?: 'Product') . ($variantName ? ' - ' . $variantName : ''));

                return [
                    'id' => $stock->id,
                    'stock_id' => $stock->id,
                    'branch_stock_id' => $stock->id,
                    'branch_id' => $stock->branch_id,
                    'product_id' => $stock->product_id,
                    'product_variant_id' => $stock->product_variant_id,
                    'variant_id' => $stock->product_variant_id,
                    'variant' => $variant,
                    'variant_name' => $variantName,
                    'color_name' => $variant?->color_name,
                    'region' => $variant?->region,
                    'variant_type' => $variant?->variant_type,
                    'ram' => $variant?->ram,
                    'storage' => $variant?->storage,
                    'quantity' => (int) ($stock->quantity ?? 0),
                    'available_quantity' => (int) ($stock->quantity ?? 0),
                    'product_total_stock' => (int) ($productTotals[$stock->product_id] ?? $stock->quantity ?? 0),
                    'product' => $product,
                    'product_name' => $product?->name,
                    'display_name' => $displayName,
                    'product_sku' => $variant?->sku ?: $product?->sku,
                    'product_barcode' => $variant?->barcode ?: $product?->barcode,
                    'product_brand' => $product?->brand,
                    'product_model' => $product?->model,
                    'product_category' => $product?->category,
                    'product_condition' => $variant?->condition ?: $product?->condition,
                    'sale_price' => (float) ($variant?->sale_price ?: $product?->sale_price ?: $product?->regular_price ?: 0),
                    'purchase_price' => (float) ($variant?->purchase_price ?: $product?->purchase_price ?: 0),
                    'regular_price' => (float) ($variant?->regular_price ?: $product?->regular_price ?: 0),
                    'market_price' => (float) ($variant?->market_price ?: $product?->regular_price ?: 0),
                    'discount_price' => (float) ($variant?->discount_price ?: $product?->discount_price ?: 0),
                ];
            })
            ->values();

        return response()->json([
            'success' => true,
            'message' => 'POS variant branch products loaded successfully.',
            'data' => $items,
            'items' => $items,
        ]);
    }


    public function availableDevices(Request $request)
    {
        if (!Schema::hasTable('device_units')) {
            return response()->json([
                'success' => true,
                'message' => 'Device unit table not found yet.',
                'data' => [],
            ]);
        }

        $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'product_variant_id' => ['nullable', 'integer'],
            'search' => ['nullable', 'string', 'max:255'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:1000'],
        ]);

        $query = DeviceUnit::query()
            ->with([
                'product:id,name,sku,barcode,sale_price,purchase_price,stock_quantity',
                'variant:id,product_id,variant_name,color_name,region,variant_type,ram,storage,sku,barcode,sale_price,market_price',
                'branch:id,name,code',
            ])
            ->whereIn('status', ['available', 'ready_for_sale'])
            ->when(Schema::hasColumn('device_units', 'saleable'), fn ($q) => $q->where('saleable', true));

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->integer('branch_id'));
        }

        if ($request->filled('product_id')) {
            $query->where('product_id', $request->integer('product_id'));
        }

        if ($request->filled('product_variant_id') && Schema::hasColumn('device_units', 'product_variant_id')) {
            $query->where('product_variant_id', $request->integer('product_variant_id'));
        }

        $deviceColumns = Schema::getColumnListing('device_units');

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $searchableDeviceColumns = [
                'product_name',
                'sku',
                'imei_1',
                'imei_2',
                'barcode',
                'imei_1_barcode',
                'imei_2_barcode',
                'color_name',
                'region',
                'variant_type',
                'ram',
                'storage',
            ];

            $query->where(function ($q) use ($search, $searchableDeviceColumns, $deviceColumns) {
                foreach ($searchableDeviceColumns as $column) {
                    if (in_array($column, $deviceColumns, true)) {
                        $q->orWhere($column, 'like', "%{$search}%");
                    }
                }

                $q->orWhereHas('product', function ($productQuery) use ($search) {
                    $productQuery->where('name', 'like', "%{$search}%")
                        ->orWhere('sku', 'like', "%{$search}%")
                        ->orWhere('barcode', 'like', "%{$search}%")
                        ->orWhere('brand', 'like', "%{$search}%")
                        ->orWhere('model', 'like', "%{$search}%");
                });

                $q->orWhereHas('variant', function ($variantQuery) use ($search) {
                    $variantQuery->where('variant_name', 'like', "%{$search}%")
                        ->orWhere('sku', 'like', "%{$search}%")
                        ->orWhere('barcode', 'like', "%{$search}%")
                        ->orWhere('color_name', 'like', "%{$search}%")
                        ->orWhere('region', 'like', "%{$search}%")
                        ->orWhere('variant_type', 'like', "%{$search}%")
                        ->orWhere('ram', 'like', "%{$search}%")
                        ->orWhere('storage', 'like', "%{$search}%");
                });
            });
        }

        $devices = $query
            ->orderBy('id')
            ->limit((int) $request->get('limit', 1000))
            ->get()
            ->map(function (DeviceUnit $device) {
                $product = $device->product;
                $variant = $device->variant;
                $variantName = $variant?->display_name ?: $variant?->variant_name;

                return [
                    'id' => $device->id,
                    'product_id' => $device->product_id,
                    'product_variant_id' => $device->product_variant_id,
                    'variant_id' => $device->product_variant_id,
                    'branch_id' => $device->branch_id,
                    'product_name' => $device->product_name ?: $product?->name,
                    'variant_name' => $variantName,
                    'display_name' => trim(($device->product_name ?: $product?->name ?: 'Product') . ($variantName ? ' - ' . $variantName : '')),
                    'sku' => $device->sku ?: ($variant?->sku ?: $product?->sku),
                    'variant_sku' => $variant?->sku,
                    'barcode' => $device->barcode,
                    'variant_barcode' => $variant?->barcode,
                    'imei_1' => $device->imei_1,
                    'imei_2' => $device->imei_2,
                    'color_name' => $device->color_name ?: $variant?->color_name,
                    'region' => $device->region ?: $variant?->region,
                    'variant_type' => $device->variant_type ?: $variant?->variant_type,
                    'ram' => $device->ram ?: $variant?->ram,
                    'storage' => $device->storage ?: $variant?->storage,
                    'status' => $device->status,
                    'sale_price' => (float) ($device->selling_price ?: ($variant?->sale_price ?: ($product?->sale_price ?? 0))),
                    'branch_name' => $device->branch?->name,
                ];
            });

        return response()->json([
            'success' => true,
            'message' => 'Available variant devices loaded successfully.',
            'data' => $devices,
        ]);
    }


    public function index(Request $request)
    {
        $query = Sale::with($this->saleRelations())->latest();

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->where('invoice_no', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhereHas('items', function ($itemQuery) use ($search) {
                        $itemQuery->where('product_name', 'like', "%{$search}%")
                            ->orWhere('sku', 'like', "%{$search}%")
                            ->orWhere('imei_1', 'like', "%{$search}%")
                            ->orWhere('imei_2', 'like', "%{$search}%");

                        if (Schema::hasColumn('sale_items', 'device_barcode')) {
                            $itemQuery->orWhere('device_barcode', 'like', "%{$search}%");
                        }
                    });
            });
        }

        $requestedStatus = $request->input('status', $request->input('sale_status'));

        if (!empty($requestedStatus)) {
            $query->where('status', $requestedStatus);
        }

        if ($request->filled('payment_status') && Schema::hasColumn('sales', 'payment_status')) {
            $query->where('payment_status', $request->payment_status);
        }

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }

        $sales = $query->paginate((int) $request->get('per_page', 20));

        return response()->json([
            'success' => true,
            'message' => 'Sales loaded successfully.',
            'data' => $sales,
        ]);
    }

    public function store(Request $request)
    {
        if ($request->has('items') && is_array($request->items)) {
            return $this->storePosInvoice($request);
        }

        return $this->storeLegacyReadyItemSale($request);
    }

    /** The POS screen never sends a discount above the amount it applies to; such a request was edited by hand. */
    private function rejectTamperedAmounts(Request $request, array $validated): void
    {
        $subtotal = 0.0;
        foreach ($validated['items'] as $row) {
            $rate = (float) $row['rate'];
            if ($rate <= 0 && ! empty($row['product_variant_id'])) {
                $variant = ProductVariant::find((int) $row['product_variant_id']);
                $rate = (float) ($variant?->sale_price ?? $variant?->market_price ?? 0);
            }
            $lineSubtotal = (int) $row['quantity'] * $rate;
            $discount = (float) ($row['discount_amount'] ?? 0) + ($lineSubtotal * (float) ($row['discount_percent'] ?? 0)) / 100;
            $subtotal += $lineSubtotal;
            if ($discount > $lineSubtotal + 0.01) {
                $this->logTamperedAmount($request, ['product_id' => (int) $row['product_id'], 'line_subtotal' => $lineSubtotal, 'discount' => $discount]);
            }
        }
        $invoiceDiscount = (float) ($validated['invoice_discount_amount'] ?? 0) + ($subtotal * (float) ($validated['invoice_discount_percent'] ?? 0)) / 100;
        if ($invoiceDiscount > $subtotal + 0.01) {
            $this->logTamperedAmount($request, ['subtotal' => $subtotal, 'invoice_discount' => $invoiceDiscount]);
        }
    }

    private function logTamperedAmount(Request $request, array $details): void
    {
        app(SecurityEventService::class)->record($request, 'tampered_amount', 'critical', $details + ['page' => '/pos'], null, 422);
        abort(422, __('messages.security.amount_tampered'));
    }

    private function storePosInvoice(Request $request)
    {
        $validated = $request->validate([
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'customer_name' => ['nullable', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'customer_email' => ['nullable', 'email', 'max:255'],
            'invoice_discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'invoice_discount_amount' => ['nullable', 'numeric', 'min:0'],
            'delivery_charge' => ['nullable', 'numeric', 'min:0'],
            'payment_received_by' => ['nullable', 'integer', 'exists:users,id'],
            'home_delivery' => ['nullable', 'boolean'],
            'send_sms' => ['nullable', 'boolean'],
            'send_email' => ['nullable', 'boolean'],
            'note' => ['nullable', 'string'],

            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.product_variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.rate' => ['required', 'numeric', 'min:0'],
            'items.*.discount_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'items.*.discount_amount' => ['nullable', 'numeric', 'min:0'],
            'items.*.device_unit_ids' => ['nullable', 'array'],
            'items.*.device_unit_ids.*' => ['nullable', 'integer'],

            'payments' => ['nullable', 'array'],
            'payments.*.payment_method' => ['required_with:payments', 'string', 'max:100'],
            'payments.*.provider_name' => ['nullable', 'string', 'max:100'],
            'payments.*.transaction_id' => ['nullable', 'string', 'max:255'],
            'payments.*.amount' => ['required_with:payments', 'numeric', 'min:0'],
            'payments.*.note' => ['nullable', 'string'],
            'payments.*.emi_bank_name' => ['nullable', 'string', 'max:190'],
            'payments.*.emi_months' => ['nullable', 'integer', 'min:1', 'max:120'],
            'payments.*.emi_reference' => ['nullable', 'string', 'max:255'],
        ]);

        if (!empty($validated['payment_received_by'])) {
            $receiver = User::find((int) $validated['payment_received_by']);

            if (!$receiver || !$this->isEligiblePaymentReceiver($receiver)) {
                abort(422, 'Payment Received By must be an active internal POS staff user. Customer and supplier portal accounts are not allowed.');
            }
        }

        $this->rejectTamperedAmounts($request, $validated);

        $sale = DB::transaction(function () use ($request, $validated) {
            $customer = $this->findOrCreateCustomer(
                $validated['customer_name'] ?? null,
                $validated['customer_phone'] ?? null,
                $request->user()?->id
            );

            $previousDue = $customer ? (float) ($customer->current_balance ?? 0) : 0;

            $calculatedItems = [];
            $subtotal = 0;
            $profitAmount = 0;

            foreach ($validated['items'] as $row) {
                $product = Product::where('id', $row['product_id'])->lockForUpdate()->firstOrFail();

                $productVariantId = isset($row['product_variant_id']) && $row['product_variant_id'] ? (int) $row['product_variant_id'] : null;
                $variant = $productVariantId ? ProductVariant::where('id', $productVariantId)->where('product_id', $product->id)->first() : null;

                $branchStockQuery = BranchStock::where('branch_id', $validated['branch_id'])
                    ->where('product_id', $product->id);

                if ($productVariantId && Schema::hasColumn('branch_stocks', 'product_variant_id')) {
                    $branchStockQuery->where('product_variant_id', $productVariantId);
                }

                $branchStock = $branchStockQuery->lockForUpdate()->first();

                if (!$branchStock || (int) $branchStock->quantity < (int) $row['quantity']) {
                    abort(422, "{$product->name} stock is not available in selected branch.");
                }

                $quantity = (int) $row['quantity'];
                $rate = (float) $row['rate'];
                if ($rate <= 0 && $variant) {
                    $rate = (float) ($variant->sale_price ?? $variant->market_price ?? 0);
                }
                $lineSubtotal = $quantity * $rate;
                $discountPercent = (float) ($row['discount_percent'] ?? 0);
                $discountAmount = (float) ($row['discount_amount'] ?? 0);

                if ($discountPercent > 0) {
                    $discountAmount += ($lineSubtotal * $discountPercent) / 100;
                }

                $lineTotal = max($lineSubtotal - $discountAmount, 0);
                $selectedDeviceIds = collect($row['device_unit_ids'] ?? [])
                    ->filter(fn ($id) => $id !== null && $id !== '')
                    ->map(fn ($id) => (int) $id)
                    ->unique()
                    ->values();

                $deviceUnits = $this->resolveSaleDeviceUnits(
                    $product,
                    (int) $validated['branch_id'],
                    $quantity,
                    $selectedDeviceIds,
                    $productVariantId
                );

                $purchaseCostTotal = $deviceUnits->count() === $quantity
                    ? (float) $deviceUnits->sum(fn ($device) => (float) ($device->purchase_cost ?? 0))
                    : ((float) (($variant?->purchase_price ?? null) ?: ($product->purchase_price ?? 0)) * $quantity);

                $lineProfit = $lineTotal - $purchaseCostTotal;

                $subtotal += $lineSubtotal;
                $profitAmount += $lineProfit;

                $calculatedItems[] = [
                    'product' => $product,
                    'variant' => $variant,
                    'product_variant_id' => $productVariantId,
                    'branch_stock' => $branchStock,
                    'quantity' => $quantity,
                    'rate' => $rate,
                    'line_subtotal' => $lineSubtotal,
                    'discount_percent' => $discountPercent,
                    'discount_amount' => $discountAmount,
                    'line_total' => $lineTotal,
                    'purchase_cost_total' => $purchaseCostTotal,
                    'purchase_price' => $quantity > 0 ? round($purchaseCostTotal / $quantity, 2) : 0,
                    'line_profit' => $lineProfit,
                    'device_units' => $deviceUnits,
                ];
            }

            $invoiceDiscountPercent = (float) ($validated['invoice_discount_percent'] ?? 0);
            $invoiceDiscountAmount = (float) ($validated['invoice_discount_amount'] ?? 0);

            if ($invoiceDiscountPercent > 0) {
                $invoiceDiscountAmount += ($subtotal * $invoiceDiscountPercent) / 100;
            }

            $billAmount = max($subtotal - $invoiceDiscountAmount, 0);
            $deliveryCharge = (float) ($validated['delivery_charge'] ?? 0);
            $finalAmount = $billAmount + $previousDue + $deliveryCharge;
            $payments = $this->normalizePayments($request->payments ?? []);
            $paidAmount = collect($payments)->sum('amount');
            $dueAmount = max($finalAmount - $paidAmount, 0);
            $cashBackAmount = max($paidAmount - $finalAmount, 0);
            $paymentStatus = $dueAmount > 0 ? ($paidAmount > 0 ? 'partial' : 'due') : 'paid';
            $paymentMethod = count($payments) > 1 ? 'mixed' : ($payments[0]['payment_method'] ?? 'due');

            $invoice = app(BranchInvoiceService::class)->allocate((int) $validated['branch_id'], $request->user()?->id);

            $sale = Sale::create([
                'invoice_no' => $invoice['invoice_no'],
                'branch_invoice_profile_id' => $invoice['profile_id'],
                'invoice_profile_snapshot' => $invoice['snapshot'],
                'public_token' => Str::random(64),
                'branch_id' => $validated['branch_id'],
                'customer_id' => $customer?->id,
                'customer_name' => $validated['customer_name'] ?? $customer?->name,
                'customer_phone' => $validated['customer_phone'] ?? $customer?->phone,
                'customer_email' => $validated['customer_email'] ?? $customer?->email,
                'subtotal' => $subtotal,
                'discount' => $invoiceDiscountAmount,
                'invoice_discount_percent' => $invoiceDiscountPercent,
                'invoice_discount_amount' => $invoiceDiscountAmount,
                'total' => $billAmount,
                'previous_due' => $previousDue,
                'delivery_charge' => $deliveryCharge,
                'final_amount' => $finalAmount,
                'amount_in_words' => app(\App\Services\NumberToWordsService::class)->taka($finalAmount),
                'paid_amount' => $paidAmount,
                'due_amount' => $dueAmount,
                'cash_back_amount' => $cashBackAmount,
                'profit_amount' => $profitAmount,
                'payment_method' => $paymentMethod,
                'payment_status' => $paymentStatus,
                'status' => 'completed',
                'sold_by' => $request->user()?->id,
                'payment_received_by' => $validated['payment_received_by'] ?? $request->user()?->id,
                'home_delivery' => (bool) ($validated['home_delivery'] ?? false),
                'send_sms' => (bool) ($validated['send_sms'] ?? false),
                'send_email' => (bool) ($validated['send_email'] ?? false),
                'note' => $validated['note'] ?? null,
            ]);

            foreach ($calculatedItems as $item) {
                $this->createSaleItemsAndMarkDevices($sale, $item, $request->user()?->id);

                $branchStock = $item['branch_stock'];
                $product = $item['product'];
                $nextBranchQuantity = max(((int) $branchStock->quantity) - $item['quantity'], 0);
                $nextProductQuantity = max(((int) ($product->stock_quantity ?? 0)) - $item['quantity'], 0);

                $branchStock->update([
                    'quantity' => $nextBranchQuantity,
                ]);

                $product->update([
                    'stock_quantity' => $nextProductQuantity,
                    'status' => $nextProductQuantity <= 0 ? 'out_of_stock' : 'active',
                ]);

                if (!empty($item['product_variant_id'])) {
                    ProductVariant::where('id', $item['product_variant_id'])->update([
                        'stock_quantity' => max((int) (ProductVariant::where('id', $item['product_variant_id'])->value('stock_quantity') ?? 0) - $item['quantity'], 0),
                    ]);
                }
            }

            foreach ($payments as $payment) {
                $rawPayment = [];

                if (($payment['payment_method'] ?? null) === 'emi') {
                    $rawPayment = collect($validated['payments'] ?? [])
                        ->first(function ($row) use ($payment) {
                            return ($row['payment_method'] ?? null) === 'emi'
                                && round((float) ($row['amount'] ?? 0), 2)
                                    === round((float) ($payment['amount'] ?? 0), 2);
                        }) ?? [];
                }

                SalePayment::create([
                    'sale_id' => $sale->id,
                    'payment_method' => $payment['payment_method'],
                    'provider_name' => $payment['provider_name'] ?? null,
                    'transaction_id' => $payment['transaction_id'] ?? null,
                    'amount' => $payment['amount'],
                    'received_by' => $validated['payment_received_by'] ?? $request->user()?->id,
                    'note' => $payment['note'] ?? null,

                    'emi_bank_name' => ($payment['payment_method'] ?? null) === 'emi'
                        ? ($rawPayment['emi_bank_name'] ?? $payment['provider_name'] ?? null)
                        : null,

                    'emi_months' => ($payment['payment_method'] ?? null) === 'emi'
                        ? ($rawPayment['emi_months'] ?? null)
                        : null,

                    'emi_reference' => ($payment['payment_method'] ?? null) === 'emi'
                        ? ($rawPayment['emi_reference'] ?? null)
                        : null,
                ]);
            }

            if ($customer) {
                $customer->update([
                    'current_balance' => $dueAmount,
                    'updated_by' => $request->user()?->id,
                ]);
            }

            return $sale->fresh($this->saleRelations());
        });

        return response()->json([
            'success' => true,
            'message' => 'POS sale invoice completed successfully.',
            'data' => $sale,
        ], 201);
    }

    private function resolveSaleDeviceUnits(Product $product, int $branchId, int $quantity, Collection $selectedDeviceIds, ?int $productVariantId = null): Collection
    {
        if (!Schema::hasTable('device_units')) {
            return collect();
        }

        $trackedDeviceCountQuery = DeviceUnit::query()
            ->where('branch_id', $branchId)
            ->where('product_id', $product->id);

        if ($productVariantId && Schema::hasColumn('device_units', 'product_variant_id')) {
            $trackedDeviceCountQuery->where('product_variant_id', $productVariantId);
        }

        $trackedDeviceCount = $trackedDeviceCountQuery->count();

        if ($selectedDeviceIds->isNotEmpty()) {
            if ($selectedDeviceIds->count() !== $quantity) {
                abort(422, "{$product->name} sale quantity {$quantity}, but selected device/IMEI {$selectedDeviceIds->count()}. Quantity and IMEI count must be same.");
            }

            $devices = DeviceUnit::query()
                ->whereIn('id', $selectedDeviceIds->all())
                ->where('branch_id', $branchId)
                ->where('product_id', $product->id)
                ->when($productVariantId && Schema::hasColumn('device_units', 'product_variant_id'), fn ($q) => $q->where('product_variant_id', $productVariantId))
                ->whereIn('status', ['available', 'ready_for_sale'])
                ->when(Schema::hasColumn('device_units', 'saleable'), fn ($q) => $q->where('saleable', true))
                ->lockForUpdate()
                ->get();

            if ($devices->count() !== $quantity) {
                abort(422, "{$product->name} selected IMEI/device is not available in this branch or already sold.");
            }

            return $devices->values();
        }

        if ($trackedDeviceCount <= 0) {
            return collect();
        }

        $devices = DeviceUnit::query()
            ->where('branch_id', $branchId)
            ->where('product_id', $product->id)
            ->when($productVariantId && Schema::hasColumn('device_units', 'product_variant_id'), fn ($q) => $q->where('product_variant_id', $productVariantId))
            ->whereIn('status', ['available', 'ready_for_sale'])
            ->when(Schema::hasColumn('device_units', 'saleable'), fn ($q) => $q->where('saleable', true))
            ->orderBy('id')
            ->limit($quantity)
            ->lockForUpdate()
            ->get();

        if ($devices->count() !== $quantity) {
            abort(422, __('messages.sale.insufficient_devices', [
                'product' => $product->name,
                'available' => $devices->count(),
                'required' => $quantity,
            ]));
        }

        return $devices->values();
    }

    private function createSaleItemsAndMarkDevices(Sale $sale, array $item, ?int $userId): void
    {
        /** @var Product $product */
        $product = $item['product'];
        /** @var BranchStock $branchStock */
        $branchStock = $item['branch_stock'];
        $variant = $item['variant'] ?? null;
        /** @var Collection $deviceUnits */
        $deviceUnits = $item['device_units'];

        if ($deviceUnits->count() === (int) $item['quantity']) {
            $perUnitDiscount = (int) $item['quantity'] > 0
                ? round(((float) $item['discount_amount']) / (int) $item['quantity'], 2)
                : 0;

            foreach ($deviceUnits as $device) {
                $unitTotal = max(((float) $item['rate']) - $perUnitDiscount, 0);
                $purchaseCost = round((float) ($device->purchase_cost ?? 0), 2);

                $saleItemData = $this->saleItemData([
                    'sale_id' => $sale->id,
                    'product_id' => $product->id,
                    'product_variant_id' => $item['product_variant_id'] ?? null,
                    'branch_stock_id' => $branchStock->id,
                    'device_unit_id' => $device->id,
                    'product_name' => trim($product->name . ($variant ? ' - ' . ($variant->display_name ?? $variant->variant_name) : '')),
                    'sku' => $variant?->sku ?: $product->sku,
                    'imei_1' => $device->imei_1,
                    'imei_2' => $device->imei_2,
                    'device_barcode' => $device->barcode,
                    'ram' => $device->ram ?: ($variant?->ram ?: $variant?->ram_storage),
                    'storage' => $device->storage ?: $variant?->storage,
                    'color' => $device->color_name ?: ($variant?->color_name ?: $variant?->color),
                    'country_region' => $device->country_region ?: ($variant?->country_region ?: ($variant?->region ?: $variant?->region_variant)),
                    'sim_type' => $device->sim_type ?: $variant?->sim_type,
                    'network_carrier' => $device->network_carrier ?: ($variant?->network_carrier ?: $variant?->sim_network),
                    'condition' => $device->condition ?: ($variant?->condition ?: $product->condition),
                    'branch_id' => $sale->branch_id,
                    'quantity' => 1,
                    'purchase_price' => $purchaseCost,
                    'rate' => $item['rate'],
                    'sale_price' => $item['rate'],
                    'discount_percent' => $item['discount_percent'],
                    'discount_amount' => $perUnitDiscount,
                    'total' => $unitTotal,
                    'profit_amount' => $unitTotal - $purchaseCost,
                ]);

                $saleItem = SaleItem::create($saleItemData);

                $deviceUpdate = [
                    'status' => 'sold',
                    'saleable' => false,
                    'website_published' => false,
                    'sale_id' => $sale->id,
                    'sale_item_id' => $saleItem->id,
                    'sold_at' => now(),
                    'updated_by' => $userId,
                ];

                $this->updateDeviceUnitSafely((int) $device->id, $deviceUpdate);
            }

            return;
        }

        SaleItem::create($this->saleItemData([
            'sale_id' => $sale->id,
            'product_id' => $product->id,
            'product_variant_id' => $item['product_variant_id'] ?? null,
            'branch_stock_id' => $branchStock->id,
            'product_name' => trim($product->name . ($variant ? ' - ' . ($variant->display_name ?? $variant->variant_name) : '')),
            'sku' => $variant?->sku ?: $product->sku,
            'ram' => $variant?->ram ?: $variant?->ram_storage,
            'storage' => $variant?->storage,
            'color' => $variant?->color_name ?: $variant?->color,
            'country_region' => $variant?->country_region ?: ($variant?->region ?: $variant?->region_variant),
            'sim_type' => $variant?->sim_type,
            'network_carrier' => $variant?->network_carrier ?: $variant?->sim_network,
            'condition' => $variant?->condition ?: $product->condition,
            'branch_id' => $sale->branch_id,
            'quantity' => $item['quantity'],
            'purchase_price' => $item['purchase_price'],
            'rate' => $item['rate'],
            'sale_price' => $item['rate'],
            'discount_percent' => $item['discount_percent'],
            'discount_amount' => $item['discount_amount'],
            'total' => $item['line_total'],
            'profit_amount' => $item['line_profit'],
        ]));
    }

    private function saleItemData(array $data): array
    {
        if (!Schema::hasTable('sale_items')) {
            return $data;
        }

        foreach (array_keys($data) as $column) {
            if (!Schema::hasColumn('sale_items', $column)) {
                unset($data[$column]);
            }
        }

        return $data;
    }

    private function updateDeviceUnitSafely(int $deviceId, array $data): void
    {
        if (!Schema::hasTable('device_units')) {
            return;
        }

        $safeData = [];

        foreach ($data as $column => $value) {
            if (Schema::hasColumn('device_units', $column)) {
                $safeData[$column] = $value;
            }
        }

        if (Schema::hasColumn('device_units', 'updated_at')) {
            $safeData['updated_at'] = now();
        }

        if (!empty($safeData)) {
            $device = DeviceUnit::query()->lockForUpdate()->find($deviceId);
            if ($device) {
                $device->forceFill($safeData)->save();
            }
        }
    }

    private function storeLegacyReadyItemSale(Request $request)
    {
        $validated = $request->validate([
            'used_purchase_id' => ['required', 'exists:used_purchases,id'],
            'customer_name' => ['nullable', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'customer_email' => ['nullable', 'email', 'max:255'],
            'sale_price' => ['required', 'numeric', 'min:0'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:100'],
            'note' => ['nullable', 'string'],
        ]);

        $sale = DB::transaction(function () use ($request, $validated) {
            $usedPurchase = UsedPurchase::where('id', $validated['used_purchase_id'])->lockForUpdate()->firstOrFail();

            if ($usedPurchase->status === 'sold') {
                abort(422, 'This item is already sold.');
            }

            if ($usedPurchase->status !== 'ready_for_sale' || !$usedPurchase->ready_product_id) {
                abort(422, 'Only Ready For Sale items can be sold.');
            }

            $product = Product::where('id', $usedPurchase->ready_product_id)->lockForUpdate()->first();

            if (!$product) {
                abort(422, 'Ready product not found.');
            }

            $branchStock = BranchStock::where('branch_id', $usedPurchase->branch_id)->where('product_id', $product->id)->lockForUpdate()->first();

            if (!$branchStock || (int) $branchStock->quantity < 1) {
                abort(422, 'Branch stock is not available for this item.');
            }

            $customer = $this->findOrCreateCustomer($validated['customer_name'] ?? null, $validated['customer_phone'] ?? null, $request->user()?->id);
            $previousDue = $customer ? (float) ($customer->current_balance ?? 0) : 0;
            $salePrice = (float) $validated['sale_price'];
            $discount = (float) ($validated['discount'] ?? 0);
            $total = max($salePrice - $discount, 0);
            $paidAmount = (float) ($validated['paid_amount'] ?? $total);
            $finalAmount = $total + $previousDue;
            $dueAmount = max($finalAmount - $paidAmount, 0);
            $cashBackAmount = max($paidAmount - $finalAmount, 0);
            $purchasePrice = (float) $usedPurchase->purchase_price;
            $profitAmount = $total - $purchasePrice;

            $invoice = app(BranchInvoiceService::class)->allocate((int) $usedPurchase->branch_id, $request->user()?->id);

            $sale = Sale::create([
                'invoice_no' => $invoice['invoice_no'],
                'branch_invoice_profile_id' => $invoice['profile_id'],
                'invoice_profile_snapshot' => $invoice['snapshot'],
                'public_token' => Str::random(64),
                'branch_id' => $usedPurchase->branch_id,
                'customer_id' => $customer?->id ?? $usedPurchase->customer_id,
                'supplier_id' => $usedPurchase->supplier_id,
                'used_purchase_id' => $usedPurchase->id,
                'customer_name' => $validated['customer_name'] ?? $customer?->name,
                'customer_phone' => $validated['customer_phone'] ?? $customer?->phone,
                'customer_email' => $validated['customer_email'] ?? $customer?->email,
                'subtotal' => $salePrice,
                'discount' => $discount,
                'invoice_discount_amount' => $discount,
                'total' => $total,
                'previous_due' => $previousDue,
                'final_amount' => $finalAmount,
                'amount_in_words' => app(\App\Services\NumberToWordsService::class)->taka($finalAmount),
                'paid_amount' => $paidAmount,
                'due_amount' => $dueAmount,
                'cash_back_amount' => $cashBackAmount,
                'profit_amount' => $profitAmount,
                'payment_method' => $validated['payment_method'] ?? 'cash',
                'payment_status' => $dueAmount > 0 ? 'partial' : 'paid',
                'status' => 'completed',
                'sold_by' => $request->user()?->id,
                'payment_received_by' => $request->user()?->id,
                'note' => $validated['note'] ?? null,
            ]);

            SaleItem::create($this->saleItemData([
                'sale_id' => $sale->id,
                'product_id' => $product->id,
                'branch_stock_id' => $branchStock->id,
                'used_purchase_id' => $usedPurchase->id,
                'product_name' => $usedPurchase->product_name,
                'sku' => $product->sku,
                'imei_1' => $usedPurchase->imei_1,
                'imei_2' => $usedPurchase->imei_2,
                'ram' => $usedPurchase->ram ?? null,
                'storage' => $usedPurchase->storage ?? null,
                'color' => $usedPurchase->color ?? ($usedPurchase->color_name ?? null),
                'country_region' => $usedPurchase->country_region ?? ($usedPurchase->region ?? null),
                'sim_type' => $usedPurchase->sim_type ?? null,
                'network_carrier' => $usedPurchase->network_carrier ?? ($usedPurchase->sim_network ?? null),
                'condition' => $usedPurchase->condition ?: 'used',
                'branch_id' => $sale->branch_id,
                'quantity' => 1,
                'purchase_price' => $purchasePrice,
                'rate' => $salePrice,
                'sale_price' => $salePrice,
                'discount_amount' => $discount,
                'total' => $total,
                'profit_amount' => $profitAmount,
            ]));

            SalePayment::create([
                'sale_id' => $sale->id,
                'payment_method' => $validated['payment_method'] ?? 'cash',
                'amount' => $paidAmount,
                'received_by' => $request->user()?->id,
            ]);

            $branchStock->update(['quantity' => max(((int) $branchStock->quantity) - 1, 0)]);
            $product->update([
                'stock_quantity' => max(((int) ($product->stock_quantity ?? 0)) - 1, 0),
                'status' => max(((int) ($product->stock_quantity ?? 0)) - 1, 0) <= 0 ? 'out_of_stock' : 'active',
            ]);

            $usedPurchase->update([
                'status' => 'sold',
                'sold_sale_id' => $sale->id,
                'actual_sale_price' => $total,
                'profit_amount' => $profitAmount,
                'sold_at' => now(),
                'sold_by' => $request->user()?->id,
            ]);

            if ($customer) {
                $customer->update(['current_balance' => $dueAmount, 'updated_by' => $request->user()?->id]);
            }

            return $sale->fresh($this->saleRelations());
        });

        return response()->json([
            'success' => true,
            'message' => 'Sale completed successfully.',
            'data' => $sale,
        ], 201);
    }

    public function show(Sale $sale)
    {
        return response()->json([
            'success' => true,
            'message' => 'Sale loaded successfully.',
            'data' => $sale->load($this->saleRelations()),
        ]);
    }

    public function update(Request $request, Sale $sale)
    {
        return response()->json([
            'success' => false,
            'message' => 'Sale update is not enabled for completed sales. Please cancel and create a new sale if needed.',
        ], 422);
    }

    public function cancel(Request $request, Sale $sale)
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        return $this->cancelSale($request, $sale, 'cancelled', $validated);
    }

    public function returnSale(Request $request, Sale $sale)
    {
        $validated = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        return $this->cancelSale($request, $sale, 'returned', $validated);
    }

    private function cancelSale(Request $request, Sale $sale, string $status, array $meta = [])
    {
        if ($sale->status !== 'completed') {
            return response()->json([
                'success' => false,
                'message' => 'Only completed sales can be cancelled or returned.',
            ], 422);
        }

        DB::transaction(function () use ($sale, $status, $request, $meta) {
            $sale->load('items');

            foreach ($sale->items as $item) {
                $product = Product::where('id', $item->product_id)->lockForUpdate()->first();

                if ($product) {
                    $branchStock = BranchStock::where('branch_id', $sale->branch_id)->where('product_id', $product->id)->lockForUpdate()->first();

                    if ($branchStock) {
                        $branchStock->update(['quantity' => ((int) $branchStock->quantity) + (int) $item->quantity]);
                    }

                    $product->update([
                        'stock_quantity' => ((int) ($product->stock_quantity ?? 0)) + (int) $item->quantity,
                        'status' => 'active',
                    ]);
                }

                $this->releaseReturnedDeviceUnits($item, $request->user()?->id, $meta['reason'] ?? null, $meta['note'] ?? null);

                if ($item->used_purchase_id) {
                    $usedPurchase = UsedPurchase::where('id', $item->used_purchase_id)->lockForUpdate()->first();

                    if ($usedPurchase) {
                        $usedPurchase->update([
                            'status' => 'ready_for_sale',
                            'sold_sale_id' => null,
                            'actual_sale_price' => null,
                            'profit_amount' => null,
                            'sold_at' => null,
                            'sold_by' => null,
                        ]);
                    }
                }
            }

            if ($sale->customer_id) {
                $customer = Customer::where('id', $sale->customer_id)->lockForUpdate()->first();

                if ($customer) {
                    $customer->update([
                        // Creating a sale sets customer current_balance to the sale due_amount.
                        // Cancel/return restores the customer balance to its previous_due.
                        'current_balance' => max((float) ($sale->previous_due ?? 0), 0),
                        'updated_by' => $request->user()?->id,
                    ]);
                }
            }

            $saleUpdate = [
                'status' => $status,
            ];

            if ($status === 'cancelled') {
                $saleUpdate['cancel_reason'] = $meta['reason'] ?? null;
                $saleUpdate['cancelled_at'] = now();
            }

            if ($status === 'returned') {
                $saleUpdate['return_reason'] = $meta['reason'] ?? null;
                $saleUpdate['returned_at'] = now();
            }

            $extraNote = trim((string) ($meta['note'] ?? ''));

            if ($extraNote !== '') {
                $prefix = $status === 'returned' ? 'Return note' : 'Cancel note';
                $saleUpdate['note'] = trim(((string) ($sale->note ?? '')) . "\n" . $prefix . ': ' . $extraNote);
            }

            $sale->update($this->saleUpdateData($saleUpdate));
        });

        return response()->json([
            'success' => true,
            'message' => $status === 'returned' ? 'Sale returned successfully.' : 'Sale cancelled successfully.',
            'data' => $sale->fresh($this->saleRelations()),
        ]);
    }


    private function saleUpdateData(array $data): array
    {
        foreach (array_keys($data) as $column) {
            if (!Schema::hasColumn('sales', $column)) {
                unset($data[$column]);
            }
        }

        return $data;
    }

    private function releaseReturnedDeviceUnits(SaleItem $item, ?int $userId, ?string $reason = null, ?string $note = null): void
    {
        if (!Schema::hasTable('device_units')) {
            return;
        }

        $hasSaleItemColumn = Schema::hasColumn('device_units', 'sale_item_id');
        $hasSaleItemDeviceColumn = Schema::hasColumn('sale_items', 'device_unit_id');
        $deviceUnitId = $hasSaleItemDeviceColumn ? (int) ($item->device_unit_id ?? 0) : 0;

        if (!$hasSaleItemColumn && !$deviceUnitId) {
            return;
        }

        $query = DeviceUnit::query()->where(function ($q) use ($item, $hasSaleItemColumn, $deviceUnitId) {
            if ($hasSaleItemColumn) {
                $q->where('sale_item_id', $item->id);
            }

            if ($deviceUnitId > 0) {
                $q->orWhere('id', $deviceUnitId);
            }
        });

        $devices = $query->lockForUpdate()->get();

        foreach ($devices as $device) {
            $condition = strtolower((string) ($device->condition ?: optional($device->product)->condition ?: 'new'));
            $returnStatus = in_array($condition, ['used', 'pre_owned', 'pre-owned', 'refurbished', 'buyback'], true)
                ? 'ready_for_sale'
                : 'available';

            $this->updateDeviceUnitSafely((int) $device->id, [
                'status' => $returnStatus,
                'saleable' => true,
                'website_published' => $returnStatus === 'ready_for_sale',
                'sale_id' => null,
                'sale_item_id' => null,
                'sold_at' => null,
                'returned_at' => now(),
                'return_reason' => $reason,
                'return_note' => $note,
                'updated_by' => $userId,
            ]);
        }
    }

    public function destroy(Sale $sale)
    {
        if ($sale->status === 'completed') {
            return response()->json([
                'success' => false,
                'message' => 'Completed sale cannot be deleted. Cancel it first.',
            ], 422);
        }

        $sale->delete();

        return response()->json([
            'success' => true,
            'message' => 'Sale deleted successfully.',
        ]);
    }

    private function isEligiblePaymentReceiver(User $user): bool
    {
        if ((string) ($user->status ?? '') !== 'active') {
            return false;
        }

        /*
         * Customer/supplier portal identities are deliberately excluded even
         * if a bad historical role assignment exists. "Payment Received By"
         * must point to an internal employee/POS identity.
         */
        $profileType = strtolower(trim((string) ($user->profile_type ?? '')));

        if (
            in_array($profileType, ['customer', 'supplier'], true)
            || !empty($user->customer_id)
            || !empty($user->supplier_id)
        ) {
            return false;
        }

        $accessControl = app(AccessControlService::class);

        if ($accessControl->isCustomerOnly($user) || $accessControl->isSupplierOnly($user)) {
            return false;
        }

        return $accessControl->hasAnyRole($user, AccessControlService::STAFF_POS_ROLES);
    }

    private function normalizePayments(array $payments): array
    {
        return collect($payments)
            ->map(function ($payment) {
                return [
                    'payment_method' => $payment['payment_method'] ?? 'cash',
                    'provider_name' => $payment['provider_name'] ?? null,
                    'transaction_id' => $payment['transaction_id'] ?? null,
                    'amount' => (float) ($payment['amount'] ?? 0),
                    'note' => $payment['note'] ?? null,
                ];
            })
            ->filter(fn ($payment) => $payment['amount'] > 0)
            ->values()
            ->toArray();
    }

    private function findOrCreateCustomer(?string $name, ?string $phone, ?int $userId): ?Customer
    {
        if (!$phone && !$name) {
            return null;
        }

        $customer = $phone ? Customer::where('phone', $phone)->first() : null;

        if (!$customer) {
            $customer = Customer::create([
                'name' => $name ?: $phone,
                'phone' => $phone,
                'opening_balance' => 0,
                'current_balance' => 0,
                'status' => 'active',
                'created_by' => $userId,
                'updated_by' => $userId,
            ]);
        } else {
            $customer->update([
                'name' => $name ?: $customer->name,
                'updated_by' => $userId,
            ]);
        }

        $this->ensureCustomerUser($customer);

        return $customer->fresh();
    }

    private function ensureCustomerUser(Customer $customer): void
    {
        if (!$customer->phone || (Schema::hasColumn('customers', 'user_id') && $customer->user_id)) {
            return;
        }

        $user = User::where('phone', $customer->phone)->first();

        if (!$user) {
            $safePhone = preg_replace('/[^0-9]/', '', $customer->phone) ?: Str::random(8);

            $user = User::create([
                'name' => $customer->name ?: $customer->phone,
                'email' => 'customer_' . $safePhone . '@nst.local',
                'phone' => $customer->phone,
                'password' => Hash::make($customer->phone),
                'status' => 'active',
            ]);
        }

        if (Role::where('name', 'customer')->exists() && !$user->hasRole('customer')) {
            $user->assignRole('customer');
        }

        if (Schema::hasColumn('customers', 'user_id')) {
            $customer->update(['user_id' => $user->id]);
        }
    }
}
