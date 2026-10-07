<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Sale;
use App\Models\UsedPurchase;
use App\Services\AccessControlService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CustomerSupportController extends Controller
{
    public function search(Request $request, AccessControlService $access): \Illuminate\Http\JsonResponse
    {
        $allowed = $access->canViewCustomerDatabase($request->user()) || $access->isSalesman($request->user()) || (bool) data_get($access->userAccess($request->user()), 'sidebar_permissions.customers', false);
        abort_unless($allowed, 403, 'Customer Support access denied.');

        $q = trim((string) $request->query('q', ''));
        if ((function_exists('mb_strlen') ? mb_strlen($q) : strlen($q)) < 2) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $customerKey = null;
        if (preg_match('/^CUS-0*(\\d+)$/i', $q, $matches) === 1) {
            $customerKey = (int) $matches[1];
        } elseif (ctype_digit($q) && strlen($q) <= 9) {
            // Short numeric values may be internal customer IDs.
            // Phone numbers are intentionally excluded from primary-key matching.
            $customerKey = (int) $q;
        }

        $customers = Customer::query()
            ->withCount(['sales', 'usedPurchases'])
            ->withMax('sales', 'created_at')
            ->where(function ($query) use ($q, $customerKey) {
                $query->where('name', 'like', "%{$q}%")
                    ->orWhere('phone', 'like', "%{$q}%")
                    ->orWhere('email', 'like', "%{$q}%");

                if ($customerKey !== null) {
                    $query->orWhere('id', $customerKey);
                }
            })
            ->orderByDesc('sales_max_created_at')
            ->orderBy('name')
            ->limit(50)
            ->get();

        $data = $customers->map(function (Customer $customer) {
            $lastSale = Sale::query()->with('branch:id,name')->where('customer_id', $customer->id)->latest('created_at')->first();
            return [
                'id' => $customer->id,
                'customer_id' => 'CUS-' . str_pad((string) $customer->id, 6, '0', STR_PAD_LEFT),
                'name' => $customer->name,
                'phone' => $customer->phone,
                'email' => $customer->email,
                'address' => $customer->address,
                'city' => $customer->city,
                'status' => $customer->status,
                'customer_since' => optional($customer->created_at)->toDateString(),
                'last_transaction_at' => $customer->sales_max_created_at,
                'last_branch' => $lastSale?->branch?->name,
                'purchase_count' => (int) $customer->sales_count,
                'sold_to_nst_count' => (int) $customer->used_purchases_count,
                'total_transactions' => (int) $customer->sales_count + (int) $customer->used_purchases_count,
            ];
        })->values();

        return response()->json(['success' => true, 'data' => $data]);
    }

    public function show(
        Request $request,
        Customer $customer,
        AccessControlService $access,
    ): \Illuminate\Http\JsonResponse {
        $allowed = $access->canViewCustomerDatabase($request->user()) || $access->isSalesman($request->user()) || (bool) data_get($access->userAccess($request->user()), 'sidebar_permissions.customers', false);
        abort_unless($allowed, 403, 'Customer Support access denied.');

        $canSeeCost = $access->hasAnyRole($request->user(), ['super_admin', 'admin', 'accountant']);

        $sales = Sale::query()
            ->with(['branch:id,name,code', 'soldBy:id,name', 'payments', 'items.deviceUnit'])
            ->where('customer_id', $customer->id)
            ->latest('created_at')
            ->get()
            ->map(function (Sale $sale) use ($canSeeCost) {
                $row = [
                    'id' => $sale->id,
                    'invoice_no' => $sale->invoice_no,
                    'date' => optional($sale->created_at)->toDateTimeString(),
                    'branch' => $sale->branch?->name,
                    'salesperson' => $sale->soldBy?->name,
                    'subtotal' => (float) $sale->subtotal,
                    'discount' => (float) $sale->discount + (float) $sale->invoice_discount_amount + (float) $sale->coupon_discount,
                    'sale_price' => (float) ($sale->final_amount ?: $sale->total),
                    'paid_amount' => (float) $sale->paid_amount,
                    'due_amount' => (float) $sale->due_amount,
                    'payment_method' => $sale->payment_method,
                    'payment_status' => $sale->payment_status,
                    'status' => $sale->status,
                    'delivery_status' => $sale->delivery_status,
                    'items' => $sale->items->map(function ($item) use ($canSeeCost) {
                        $itemRow = [
                            'id' => $item->id,
                            'product_name' => $item->product_name,
                            'sku' => $item->sku,
                            'imei_1' => $item->imei_1 ?: $item->deviceUnit?->imei_1,
                            'imei_2' => $item->imei_2 ?: $item->deviceUnit?->imei_2,
                            'barcode' => $item->device_barcode ?: $item->deviceUnit?->barcode,
                            'quantity' => (int) $item->quantity,
                            'sale_price' => (float) ($item->sale_price ?: $item->rate),
                            'discount_amount' => (float) $item->discount_amount,
                            'line_total' => (float) $item->total,
                            'warranty_type' => $item->deviceUnit?->warranty_type,
                            'warranty_end_date' => optional($item->deviceUnit?->warranty_end_date)->toDateString(),
                            'device_status' => $item->deviceUnit?->status,
                            'service_status' => $item->deviceUnit?->service_status,
                        ];
                        if ($canSeeCost) {
                            $itemRow['purchase_price'] = (float) $item->purchase_price;
                            $itemRow['profit_amount'] = (float) $item->profit_amount;
                        }
                        return $itemRow;
                    })->values(),
                    'payments' => $sale->payments->map(fn ($payment) => [
                        'id' => $payment->id,
                        'amount' => (float) ($payment->amount ?? 0),
                        'method' => $payment->payment_method ?? $payment->method ?? null,
                        'date' => optional($payment->created_at)->toDateTimeString(),
                    ])->values(),
                ];
                if ($canSeeCost) $row['profit_amount'] = (float) $sale->profit_amount;
                return $row;
            })->values();

        $soldToNst = UsedPurchase::query()
            ->with(['branch:id,name,code', 'salesman:id,name', 'soldSale:id,invoice_no,status'])
            ->where('customer_id', $customer->id)
            ->latest('created_at')
            ->get()
            ->map(function (UsedPurchase $purchase) use ($canSeeCost) {
                $row = [
                    'id' => $purchase->id,
                    'date' => optional($purchase->created_at)->toDateTimeString(),
                    'type' => $purchase->purchase_type,
                    'product_name' => $purchase->product_name,
                    'brand' => $purchase->brand,
                    'model' => $purchase->model,
                    'imei_1' => $purchase->imei_1,
                    'imei_2' => $purchase->imei_2,
                    'condition' => $purchase->condition_grade ?: $purchase->condition,
                    'branch' => $purchase->branch?->name,
                    'received_by' => $purchase->salesman?->name,
                    'ready_sale_price' => (float) $purchase->ready_sale_price,
                    'actual_sale_price' => (float) $purchase->actual_sale_price,
                    'status' => $purchase->status,
                    'stock_status' => $purchase->converted_to_stock_at ? 'converted_to_stock' : $purchase->status,
                    'resale_invoice_no' => $purchase->soldSale?->invoice_no,
                    'product_image_urls' => $purchase->product_image_urls,
                ];
                if ($canSeeCost) $row['purchase_price'] = (float) $purchase->purchase_price;
                return $row;
            })->values();

        $warranty = [];
        if (Schema::hasTable('warranty_service_jobs')) {
            $warranty = DB::table('warranty_service_jobs')
                ->where('customer_id', $customer->id)
                ->orderByDesc('created_at')
                ->limit(100)
                ->get()
                ->map(fn ($row) => (array) $row)
                ->values();
        }

        $payments = [];
        if (Schema::hasTable('customer_payments')) {
            $payments = DB::table('customer_payments')
                ->where('customer_id', $customer->id)
                ->orderByDesc('created_at')
                ->limit(100)
                ->get()
                ->map(fn ($row) => (array) $row)
                ->values();
        }

        AuditLog::create([
            'user_id' => $request->user()->id,
            'branch_id' => $request->user()->branch_id,
            'user_name' => $request->user()->name,
            'user_email' => $request->user()->email,
            'roles' => $access->roleNames($request->user()),
            'action' => 'view',
            'method' => 'GET',
            'path' => $request->path(),
            'module' => 'customer_support',
            'model_type' => Customer::class,
            'model_id' => $customer->id,
            'description' => 'Customer lifetime transaction profile viewed.',
            'status_code' => 200,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'meta' => ['can_view_purchase_price' => $canSeeCost],
        ]);

        return response()->json([
            'success' => true,
            'can_view_purchase_price' => $canSeeCost,
            'data' => [
                'customer' => [
                    'id' => $customer->id,
                    'customer_id' => 'CUS-' . str_pad((string) $customer->id, 6, '0', STR_PAD_LEFT),
                    'name' => $customer->name,
                    'phone' => $customer->phone,
                    'email' => $customer->email,
                    'address' => $customer->address,
                    'city' => $customer->city,
                    'country' => $customer->country,
                    'status' => $customer->status,
                    'customer_since' => optional($customer->created_at)->toDateString(),
                    'current_balance' => (float) $customer->current_balance,
                ],
                'sales' => $sales,
                'sold_to_nst' => $soldToNst,
                'warranty_service' => $warranty,
                'payments' => $payments,
                'summary' => [
                    'purchased_from_nst' => $sales->count(),
                    'sold_to_nst' => $soldToNst->count(),
                    'invoices' => $sales->count(),
                    'total_sale_value' => $sales->sum('sale_price'),
                    'total_paid' => $sales->sum('paid_amount'),
                    'total_due' => $sales->sum('due_amount'),
                ],
            ],
        ]);
    }
}
