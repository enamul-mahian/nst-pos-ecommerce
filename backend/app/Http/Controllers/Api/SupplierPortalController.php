<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SupplierPortalController extends Controller
{
    public function dashboard(Request $request): JsonResponse
    {
        $supplier = $request->attributes->get('nst_supplier');
        $purchaseTotal = $this->sumForSupplier('purchases', $supplier->id, ['grand_total', 'total_amount', 'total']);
        $paymentTotal = $this->sumForSupplier('supplier_payments', $supplier->id, ['amount', 'paid_amount']);
        $usedCount = Schema::hasTable('used_purchases') ? DB::table('used_purchases')->where('supplier_id', $supplier->id)->count() : 0;
        $openOrders = Schema::hasTable('nst_purchase_orders') ? DB::table('nst_purchase_orders')->where('supplier_id', $supplier->id)->whereNotIn('status', ['received', 'cancelled'])->count() : 0;

        return response()->json(['status' => true, 'data' => [
            'supplier' => $supplier,
            'summary' => [
                'purchase_total' => $purchaseTotal,
                'payment_total' => $paymentTotal,
                'current_balance' => (float) $supplier->current_balance,
                'used_devices' => $usedCount,
                'open_purchase_orders' => $openOrders,
            ],
            'recent_prices' => $this->priceQuery($supplier->id)->limit(8)->get(),
            'recent_orders' => $this->orderQuery($supplier->id)->limit(8)->get(),
        ]]);
    }

    public function purchases(Request $request): JsonResponse
    {
        $supplier = $request->attributes->get('nst_supplier');
        if (! Schema::hasTable('purchases')) {
            return response()->json(['status' => true, 'data' => []]);
        }
        $rows = DB::table('purchases')->where('supplier_id', $supplier->id)->latest('id')->paginate((int) $request->get('per_page', 20));
        return response()->json(['status' => true, 'data' => $rows]);
    }

    public function usedDevices(Request $request): JsonResponse
    {
        $supplier = $request->attributes->get('nst_supplier');
        if (! Schema::hasTable('used_purchases')) {
            return response()->json(['status' => true, 'data' => []]);
        }
        $rows = DB::table('used_purchases')->where('supplier_id', $supplier->id)
            ->select(['id', 'purchase_no', 'product_name', 'brand', 'model', 'imei_1', 'sku', 'purchase_price', 'status', 'created_at'])
            ->latest('id')->paginate((int) $request->get('per_page', 20));
        return response()->json(['status' => true, 'data' => $rows]);
    }

    public function payments(Request $request): JsonResponse
    {
        $supplier = $request->attributes->get('nst_supplier');
        if (! Schema::hasTable('supplier_payments')) {
            return response()->json(['status' => true, 'data' => []]);
        }
        $rows = DB::table('supplier_payments')->where('supplier_id', $supplier->id)->latest('id')->paginate((int) $request->get('per_page', 20));
        return response()->json(['status' => true, 'data' => $rows]);
    }

    public function priceSubmissions(Request $request): JsonResponse
    {
        $supplier = $request->attributes->get('nst_supplier');
        return response()->json(['status' => true, 'data' => $this->priceQuery($supplier->id)->paginate((int) $request->get('per_page', 20))]);
    }

    public function purchaseOrders(Request $request): JsonResponse
    {
        $supplier = $request->attributes->get('nst_supplier');
        return response()->json(['status' => true, 'data' => $this->orderQuery($supplier->id)->paginate((int) $request->get('per_page', 20))]);
    }


    public function storePriceSubmission(Request $request): JsonResponse
    {
        $supplier = $request->attributes->get('nst_supplier');
        $validated = $request->validate([
            'product_id' => ['nullable', 'integer'], 'product_variant_id' => ['nullable', 'integer'],
            'product_name' => ['required', 'string', 'max:255'], 'variant_name' => ['nullable', 'string', 'max:255'],
            'unit_price' => ['required', 'numeric', 'gt:0'], 'warranty' => ['nullable', 'string', 'max:255'],
            'available_quantity' => ['required', 'integer', 'min:0'], 'minimum_order_quantity' => ['required', 'integer', 'min:1'],
            'delivery_cost' => ['nullable', 'numeric', 'min:0'], 'delivery_days' => ['nullable', 'integer', 'min:0'],
            'valid_until' => ['nullable', 'date'], 'availability_status' => ['required', 'in:available,limited,out_of_stock,preorder'],
            'source_url' => ['nullable', 'url', 'max:2000'], 'notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $id = DB::table('supplier_price_submissions')->insertGetId(array_merge($validated, [
            'supplier_id' => $supplier->id, 'delivery_cost' => $validated['delivery_cost'] ?? 0,
            'status' => 'submitted', 'submitted_by' => $request->user()->id,
            'created_at' => now(), 'updated_at' => now(),
        ]));
        return response()->json(['status' => true, 'message' => 'Price submitted for Super Admin comparison.', 'data' => DB::table('supplier_price_submissions')->find($id)], 201);
    }

    private function priceQuery(int $supplierId)
    {
        return Schema::hasTable('supplier_price_submissions')
            ? DB::table('supplier_price_submissions')->where('supplier_id', $supplierId)->latest('id')
            : DB::query()->fromSub(DB::table('users')->whereRaw('1 = 0')->selectRaw('id'), 'supplier_price_submissions');
    }

    private function orderQuery(int $supplierId)
    {
        return Schema::hasTable('nst_purchase_orders')
            ? DB::table('nst_purchase_orders')->where('supplier_id', $supplierId)->latest('id')
            : DB::query()->fromSub(DB::table('users')->whereRaw('1 = 0')->selectRaw('id'), 'nst_purchase_orders');
    }

    private function sumForSupplier(string $table, int $supplierId, array $columns): float
    {
        if (! Schema::hasTable($table)) return 0.0;
        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) return (float) DB::table($table)->where('supplier_id', $supplierId)->sum($column);
        }
        return 0.0;
    }
}
