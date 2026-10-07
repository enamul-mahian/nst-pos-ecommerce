<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Models\DeviceUnit;
use App\Services\PurchaseStockService;
use App\Services\PurchasePriceVisibilityService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class PurchaseController extends Controller
{
    public function index(Request $request, PurchasePriceVisibilityService $priceVisibility)
    {
        if (!Schema::hasTable('purchases')) {
            return response()->json([
                'success' => false,
                'message' => 'purchases table not found.',
                'data' => [],
            ], 404);
        }

        $query = DB::table('purchases');

        if (Schema::hasTable('suppliers') && Schema::hasColumn('purchases', 'supplier_id')) {
            $query->leftJoin('suppliers', 'suppliers.id', '=', 'purchases.supplier_id')
                ->select(
                    'purchases.*',
                    'suppliers.name as supplier_name',
                    'suppliers.phone as supplier_phone'
                );
        } else {
            $query->select('purchases.*');
        }

        if (Schema::hasTable('branches') && Schema::hasColumn('purchases', 'branch_id')) {
            $query->leftJoin('branches', 'branches.id', '=', 'purchases.branch_id')
                ->addSelect('branches.name as branch_name');
        }

        if ($request->filled('supplier_id') && Schema::hasColumn('purchases', 'supplier_id')) {
            $query->where('purchases.supplier_id', $request->supplier_id);
        }

        if ($request->filled('branch_id') && Schema::hasColumn('purchases', 'branch_id')) {
            $query->where('purchases.branch_id', $request->branch_id);
        }

        if ($request->filled('status') && Schema::hasColumn('purchases', 'status')) {
            $query->where('purchases.status', $request->status);
        }

        if ($request->filled('payment_status') && Schema::hasColumn('purchases', 'payment_status')) {
            $query->where('purchases.payment_status', $request->payment_status);
        }

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                foreach (['purchase_no', 'purchase_number', 'invoice_no', 'reference_no', 'note'] as $column) {
                    if (Schema::hasColumn('purchases', $column)) {
                        $q->orWhere("purchases.$column", 'like', "%{$search}%");
                    }
                }

                if (Schema::hasTable('suppliers')) {
                    if (Schema::hasColumn('suppliers', 'name')) {
                        $q->orWhere('suppliers.name', 'like', "%{$search}%");
                    }

                    if (Schema::hasColumn('suppliers', 'phone')) {
                        $q->orWhere('suppliers.phone', 'like', "%{$search}%");
                    }
                }

                if (Schema::hasTable('branches') && Schema::hasColumn('branches', 'name')) {
                    $q->orWhere('branches.name', 'like', "%{$search}%");
                }
            });
        }

        $orderColumn = Schema::hasColumn('purchases', 'created_at')
            ? 'purchases.created_at'
            : 'purchases.id';

        $purchases = $query
            ->orderByDesc($orderColumn)
            ->paginate((int) $request->get('per_page', 15));

        $purchases = $priceVisibility->stripForUser($purchases, $request->user());

        return response()->json([
            'success' => true,
            'can_see_purchase_price' => $priceVisibility->canView($request->user()),
            'data' => $purchases,
        ]);
    }

    public function store(Request $request, PurchasePriceVisibilityService $priceVisibility)
    {
        foreach (['purchases', 'purchase_items', 'device_units'] as $table) {
            if (!Schema::hasTable($table)) {
                return response()->json([
                    'success' => false,
                    'message' => $table . ' table not found.',
                ], 404);
            }
        }

        $validated = $request->validate([
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')],
            'branch_id' => ['nullable', 'integer'],

            'purchase_no' => ['nullable', 'string', 'max:100'],
            'purchase_date' => ['nullable', 'date'],
            'supplier_invoice_number' => ['nullable', 'string', 'max:150'],
            'supplier_invoice_date' => ['nullable', 'date'],
            'supplier_invoice_file' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:20480'],

            'subtotal' => ['nullable', 'numeric', 'min:0'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'shipping_amount' => ['nullable', 'numeric', 'min:0'],
            'final_amount' => ['nullable', 'numeric', 'min:0'],

            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:100'],
            'transaction_id' => ['nullable', 'string', 'max:150'],

            'status' => ['nullable', 'string', 'max:50'],
            'note' => ['nullable', 'string'],

            'items' => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['nullable', 'integer'],
            'items.*.product_variant_id' => ['nullable', 'integer'],
            'items.*.product_name' => ['nullable', 'string', 'max:255'],
            'items.*.sku' => ['nullable', 'string', 'max:150'],
            'items.*.barcode' => ['nullable', 'string', 'max:150'],
            'items.*.quantity' => ['nullable', 'numeric', 'min:0'],
            'items.*.unit_cost' => ['nullable', 'numeric', 'min:0'],
            'items.*.line_total' => ['nullable', 'numeric', 'min:0'],
            'items.*.note' => ['nullable', 'string'],

            'items.*.devices' => ['nullable', 'array'],
            'items.*.devices.*.model_number' => ['nullable', 'string', 'max:150'],
            'items.*.devices.*.imei_1' => ['nullable', 'string', 'max:100'],
            'items.*.devices.*.imei_2' => ['nullable', 'string', 'max:100'],
            'items.*.devices.*.barcode' => ['nullable', 'string', 'max:150'],
            'items.*.devices.*.imei_1_barcode' => ['nullable', 'string', 'max:150'],
            'items.*.devices.*.imei_2_barcode' => ['nullable', 'string', 'max:150'],
            'items.*.devices.*.purchase_cost' => ['nullable', 'numeric', 'min:0'],
            'items.*.devices.*.battery_health' => ['nullable', 'string', 'max:100'],
            'items.*.devices.*.condition' => ['nullable', 'string', 'max:100'],
            'items.*.devices.*.note' => ['nullable', 'string'],
        ]);

        $this->validateDeviceIdentifiers($validated['items'] ?? []);

        $supplierInvoiceFilePath = $request->hasFile('supplier_invoice_file')
            ? $request->file('supplier_invoice_file')->store('purchase-invoices', 'public')
            : null;

        $result = DB::transaction(function () use ($request, $validated, $supplierInvoiceFilePath) {
            $supplier = Supplier::where('id', $validated['supplier_id'])
                ->lockForUpdate()
                ->firstOrFail();

            $branchId = $validated['branch_id'] ?? null;
            $items = $this->normalizePurchaseItems($validated['items'] ?? []);
            $itemsSubtotal = round(collect($items)->sum('line_total'), 2);

            $discountAmount = (float) ($validated['discount_amount'] ?? 0);
            $taxAmount = (float) ($validated['tax_amount'] ?? 0);
            $shippingAmount = (float) ($validated['shipping_amount'] ?? 0);
            $finalAmount = round(max(($itemsSubtotal - $discountAmount) + $taxAmount + $shippingAmount, 0), 2);

            $cashPaidAmount = (float) ($validated['paid_amount'] ?? 0);

            $supplierOldDue = $this->getSupplierDueBalance($supplier);
            $supplierAdvanceBefore = $this->getSupplierAdvanceBalance($supplier);

            $dueBeforeAdvance = max($finalAmount - $cashPaidAmount, 0);
            $advanceApplied = min($supplierAdvanceBefore, $dueBeforeAdvance);
            $supplierAdvanceAfter = max($supplierAdvanceBefore - $advanceApplied, 0);
            $purchaseDue = max($dueBeforeAdvance - $advanceApplied, 0);

            $overPaidAmount = max($cashPaidAmount - $finalAmount, 0);

            if ($overPaidAmount > 0) {
                $supplierAdvanceAfter += $overPaidAmount;
            }

            $totalPaidForPurchase = min($finalAmount, $cashPaidAmount + $advanceApplied);
            $newSupplierDue = max($supplierOldDue + $purchaseDue, 0);
            $purchaseNo = $validated['purchase_no'] ?? $this->generatePurchaseNo();

            $purchaseData = [];
            $this->putIfColumnExists($purchaseData, 'supplier_id', $supplier->id);
            $this->putIfColumnExists($purchaseData, 'branch_id', $branchId);

            $this->putIfColumnExists($purchaseData, 'purchase_no', $purchaseNo);
            $this->putIfColumnExists($purchaseData, 'purchase_number', $purchaseNo);
            $this->putIfColumnExists($purchaseData, 'invoice_no', $purchaseNo);
            $this->putIfColumnExists($purchaseData, 'reference_no', $purchaseNo);

            $this->putIfColumnExists($purchaseData, 'purchase_date', $validated['purchase_date'] ?? now()->toDateString());
            $this->putIfColumnExists($purchaseData, 'supplier_invoice_number', $validated['supplier_invoice_number'] ?? null);
            $this->putIfColumnExists($purchaseData, 'supplier_invoice_date', $validated['supplier_invoice_date'] ?? null);
            $this->putIfColumnExists($purchaseData, 'supplier_invoice_file', $supplierInvoiceFilePath);

            $this->putIfColumnExists($purchaseData, 'subtotal', $itemsSubtotal);
            $this->putIfColumnExists($purchaseData, 'discount_amount', $discountAmount);
            $this->putIfColumnExists($purchaseData, 'tax_amount', $taxAmount);
            $this->putIfColumnExists($purchaseData, 'shipping_amount', $shippingAmount);

            foreach (['final_amount', 'total_amount', 'grand_total', 'bill_amount', 'net_amount'] as $column) {
                $this->putIfColumnExists($purchaseData, $column, $finalAmount);
            }

            $this->putIfColumnExists($purchaseData, 'paid_amount', $totalPaidForPurchase);
            $this->putIfColumnExists($purchaseData, 'total_paid', $totalPaidForPurchase);
            $this->putIfColumnExists($purchaseData, 'cash_paid_amount', $cashPaidAmount);
            $this->putIfColumnExists($purchaseData, 'advance_applied_amount', $advanceApplied);

            foreach (['due_amount', 'current_due', 'balance_due'] as $column) {
                $this->putIfColumnExists($purchaseData, $column, $purchaseDue);
            }

            $this->putIfColumnExists($purchaseData, 'supplier_advance_before', $supplierAdvanceBefore);
            $this->putIfColumnExists($purchaseData, 'supplier_advance_after', $supplierAdvanceAfter);

            $this->putIfColumnExists($purchaseData, 'payment_method', $validated['payment_method'] ?? null);
            $this->putIfColumnExists($purchaseData, 'transaction_id', $validated['transaction_id'] ?? null);

            $this->putIfColumnExists($purchaseData, 'payment_status', $this->getPaymentStatus($purchaseDue, $totalPaidForPurchase));
            $this->putIfColumnExists($purchaseData, 'status', $validated['status'] ?? 'completed');
            $this->putIfColumnExists($purchaseData, 'note', $validated['note'] ?? null);

            $this->putIfColumnExists($purchaseData, 'created_by', $request->user()?->id);
            $this->putIfColumnExists($purchaseData, 'updated_by', $request->user()?->id);

            if (Schema::hasColumn('purchases', 'created_at')) {
                $purchaseData['created_at'] = now();
            }

            if (Schema::hasColumn('purchases', 'updated_at')) {
                $purchaseData['updated_at'] = now();
            }

            $purchaseId = DB::table('purchases')->insertGetId($purchaseData);

            $savedItems = $this->storePurchaseItemsAndDevices(
                purchaseId: $purchaseId,
                supplierId: $supplier->id,
                branchId: $branchId,
                items: $items,
                userId: $request->user()?->id
            );

            $this->updateSupplierBalances(
                supplierId: $supplier->id,
                dueBalance: $newSupplierDue,
                advanceBalance: $supplierAdvanceAfter,
                userId: $request->user()?->id
            );

            return [
                'purchase' => DB::table('purchases')->where('id', $purchaseId)->first(),
                'items' => $savedItems,
                'calculation' => [
                    'subtotal' => $itemsSubtotal,
                    'discount_amount' => $discountAmount,
                    'tax_amount' => $taxAmount,
                    'shipping_amount' => $shippingAmount,
                    'final_amount' => $finalAmount,
                    'cash_paid_amount' => $cashPaidAmount,
                    'advance_applied_amount' => $advanceApplied,
                    'purchase_due' => $purchaseDue,
                    'supplier_due_before' => $supplierOldDue,
                    'supplier_due_after' => $newSupplierDue,
                    'supplier_advance_before' => $supplierAdvanceBefore,
                    'supplier_advance_after' => $supplierAdvanceAfter,
                ],
            ];
        });

        $result = $priceVisibility->stripForUser($result, $request->user());

        $awaiting = collect($result['items'] ?? [])->sum(fn ($item) => (int) ($item['devices_awaiting_inspection'] ?? 0));

        return response()->json([
            'success' => true,
            'message' => $awaiting > 0
                ? __('messages.purchase.created_devices_waiting', ['count' => $awaiting])
                : __('messages.purchase.created'),
            'devices_awaiting_inspection' => $awaiting,
            'can_see_purchase_price' => $priceVisibility->canView($request->user()),
            'data' => $result,
        ], 201);
    }

    public function show(Request $request, string $id, PurchasePriceVisibilityService $priceVisibility)
    {
        if (!Schema::hasTable('purchases')) {
            return response()->json([
                'success' => false,
                'message' => 'purchases table not found.',
            ], 404);
        }

        $purchase = DB::table('purchases')->where('id', $id)->first();

        if (!$purchase) {
            return response()->json([
                'success' => false,
                'message' => 'Purchase not found.',
            ], 404);
        }

        $items = [];

        if (Schema::hasTable('purchase_items') && Schema::hasColumn('purchase_items', 'purchase_id')) {
            $items = DB::table('purchase_items')
                ->where('purchase_id', $id)
                ->orderBy('id')
                ->get();
        }

        $devices = [];

        if (Schema::hasTable('device_units') && Schema::hasColumn('device_units', 'purchase_id')) {
            $devices = DB::table('device_units')
                ->where('purchase_id', $id)
                ->orderBy('id')
                ->get();
        }

        $data = [
            'purchase' => $purchase,
            'items' => $items,
            'devices' => $devices,
        ];
        $data = $priceVisibility->stripForUser($data, $request->user());

        return response()->json([
            'success' => true,
            'can_see_purchase_price' => $priceVisibility->canView($request->user()),
            'data' => $data,
        ]);
    }

    public function update(Request $request, string $id)
    {
        if (!Schema::hasTable('purchases')) {
            return response()->json([
                'success' => false,
                'message' => 'purchases table not found.',
            ], 404);
        }

        $purchase = DB::table('purchases')->where('id', $id)->first();

        if (!$purchase) {
            return response()->json([
                'success' => false,
                'message' => 'Purchase not found.',
            ], 404);
        }

        $validated = $request->validate([
            'purchase_no' => ['nullable', 'string', 'max:100'],
            'purchase_date' => ['nullable', 'date'],
            'supplier_invoice_number' => ['nullable', 'string', 'max:150'],
            'supplier_invoice_date' => ['nullable', 'date'],
            'supplier_invoice_file' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:20480'],
            'status' => ['nullable', 'string', 'max:50'],
            'note' => ['nullable', 'string'],
        ]);

        $updateData = [];

        if ($request->hasFile('supplier_invoice_file') && Schema::hasColumn('purchases', 'supplier_invoice_file')) {
            if (! empty($purchase->supplier_invoice_file) && Storage::disk('public')->exists($purchase->supplier_invoice_file)) {
                Storage::disk('public')->delete($purchase->supplier_invoice_file);
            }
            $updateData['supplier_invoice_file'] = $request->file('supplier_invoice_file')->store('purchase-invoices', 'public');
        }

        if ($request->boolean('remove_supplier_invoice_file') && Schema::hasColumn('purchases', 'supplier_invoice_file')) {
            if (! empty($purchase->supplier_invoice_file) && Storage::disk('public')->exists($purchase->supplier_invoice_file)) {
                Storage::disk('public')->delete($purchase->supplier_invoice_file);
            }
            $updateData['supplier_invoice_file'] = null;
        }

        foreach ($validated as $key => $value) {
            if (in_array($key, ['supplier_invoice_file', 'remove_supplier_invoice_file'], true)) {
                continue;
            }
            if (Schema::hasColumn('purchases', $key)) {
                $updateData[$key] = $value;
            }
        }

        if (Schema::hasColumn('purchases', 'updated_at')) {
            $updateData['updated_at'] = now();
        }

        if (count($updateData) > 0) {
            DB::table('purchases')->where('id', $id)->update($updateData);
        }

        return response()->json([
            'success' => true,
            'message' => 'Purchase updated successfully.',
            'data' => DB::table('purchases')->where('id', $id)->first(),
        ]);
    }

    public function destroy(string $id)
    {
        if (!Schema::hasTable('purchases')) {
            return response()->json([
                'success' => false,
                'message' => 'purchases table not found.',
            ], 404);
        }

        $purchase = DB::table('purchases')->where('id', $id)->first();

        if (!$purchase) {
            return response()->json([
                'success' => false,
                'message' => 'Purchase not found.',
            ], 404);
        }

        DB::transaction(function () use ($id) {
            if (Schema::hasTable('device_units') && Schema::hasColumn('device_units', 'purchase_id')) {
                $deviceUpdate = [];
                $this->putIfTableColumnExists('device_units', $deviceUpdate, 'status', 'supplier_return');

                if (Schema::hasColumn('device_units', 'updated_at')) {
                    $deviceUpdate['updated_at'] = now();
                }

                if (!empty($deviceUpdate)) {
                    DeviceUnit::query()->where('purchase_id', $id)->lockForUpdate()->get()->each(function (DeviceUnit $device) use ($deviceUpdate) {
                        $device->forceFill($deviceUpdate)->save();
                    });
                }
            }

            if (Schema::hasTable('purchase_items') && Schema::hasColumn('purchase_items', 'purchase_id')) {
                DB::table('purchase_items')->where('purchase_id', $id)->delete();
            }

            DB::table('purchases')->where('id', $id)->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Purchase deleted successfully.',
        ]);
    }

    public function receive(string $id)
    {
        return $this->updatePurchaseStatus($id, 'received', 'Purchase received successfully.');
    }

    public function cancel(string $id)
    {
        return $this->updatePurchaseStatus($id, 'cancelled', 'Purchase cancelled successfully.');
    }

    private function updatePurchaseStatus(string $id, string $status, string $message)
    {
        if (!Schema::hasTable('purchases')) {
            return response()->json([
                'success' => false,
                'message' => 'purchases table not found.',
            ], 404);
        }

        $purchase = DB::table('purchases')->where('id', $id)->first();

        if (!$purchase) {
            return response()->json([
                'success' => false,
                'message' => 'Purchase not found.',
            ], 404);
        }

        $updateData = [];
        $this->putIfColumnExists($updateData, 'status', $status);

        if (Schema::hasColumn('purchases', 'updated_at')) {
            $updateData['updated_at'] = now();
        }

        if (count($updateData) > 0) {
            DB::table('purchases')->where('id', $id)->update($updateData);
        }

        return response()->json([
            'success' => true,
            'message' => $message,
            'data' => DB::table('purchases')->where('id', $id)->first(),
        ]);
    }

    private function normalizePurchaseItems(array $items): array
    {
        $normalized = [];

        foreach ($items as $item) {
            $devices = array_values($item['devices'] ?? []);
            $fallbackUnitCost = (float) ($item['unit_cost'] ?? 0);
            $deviceCosts = [];
            $normalizedDevices = [];

            foreach ($devices as $device) {
                $purchaseCost = array_key_exists('purchase_cost', $device)
                    ? (float) ($device['purchase_cost'] ?? 0)
                    : $fallbackUnitCost;

                $purchaseCost = max($purchaseCost, 0);
                $deviceCosts[] = $purchaseCost;
                $device['purchase_cost'] = $purchaseCost;
                $normalizedDevices[] = $device;
            }

            if (count($normalizedDevices) > 0) {
                $quantity = count($normalizedDevices);
                $lineTotal = round(array_sum($deviceCosts), 2);
                $unitCost = $quantity > 0 ? round($lineTotal / $quantity, 2) : 0;
            } else {
                $quantity = max((float) ($item['quantity'] ?? 1), 0);
                $unitCost = $fallbackUnitCost;
                $lineTotal = round($quantity * $unitCost, 2);
            }

            $item['quantity'] = $quantity;
            $item['unit_cost'] = $unitCost;
            $item['line_total'] = $lineTotal;
            $item['devices'] = $normalizedDevices;

            $normalized[] = $item;
        }

        return $normalized;
    }

    private function storePurchaseItemsAndDevices(int $purchaseId, int $supplierId, $branchId, array $items, ?int $userId = null): array
    {
        $savedItems = [];

        foreach ($items as $item) {
            $productId = $item['product_id'] ?? null;
            $productVariantId = $item['product_variant_id'] ?? null;
            $product = $this->getProductInfo($productId);
            $variant = $this->getVariantInfo($productVariantId);

            $quantity = (float) ($item['quantity'] ?? 1);
            $unitCost = (float) ($item['unit_cost'] ?? 0);
            $lineTotal = (float) ($item['line_total'] ?? ($quantity * $unitCost));
            $devices = $item['devices'] ?? [];

            $productName = $item['product_name'] ?? $product['name'] ?? null;
            $sku = $item['sku'] ?? $variant['sku'] ?? $product['sku'] ?? null;
            $barcode = $item['barcode'] ?? $variant['barcode'] ?? $product['barcode'] ?? null;

            $itemData = [];
            $this->putIfTableColumnExists('purchase_items', $itemData, 'purchase_id', $purchaseId);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'supplier_id', $supplierId);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'branch_id', $branchId);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'product_id', $productId);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'product_variant_id', $productVariantId);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'product_name', $productName);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'sku', $sku);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'barcode', $barcode);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'quantity', $quantity);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'unit_cost', $unitCost);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'line_total', $lineTotal);
            $this->putIfTableColumnExists('purchase_items', $itemData, 'device_count', count($devices));
            $this->putIfTableColumnExists('purchase_items', $itemData, 'note', $item['note'] ?? null);

            if (Schema::hasColumn('purchase_items', 'created_at')) {
                $itemData['created_at'] = now();
            }

            if (Schema::hasColumn('purchase_items', 'updated_at')) {
                $itemData['updated_at'] = now();
            }

            $purchaseItemId = DB::table('purchase_items')->insertGetId($itemData);
            $savedDevices = [];

            foreach ($devices as $device) {
                $mainBarcode = trim((string) ($device['barcode'] ?? ''));

                if ($mainBarcode === '') {
                    $mainBarcode = $this->generateDeviceBarcode();
                }

                $imei1 = $this->nullableTrim($device['imei_1'] ?? null);
                $imei2 = $this->nullableTrim($device['imei_2'] ?? null);
                $imei1Barcode = $this->nullableTrim($device['imei_1_barcode'] ?? null);
                $imei2Barcode = $this->nullableTrim($device['imei_2_barcode'] ?? null);

                if (!$imei1Barcode && $imei1) {
                    $imei1Barcode = $imei1;
                }

                if (!$imei2Barcode && $imei2) {
                    $imei2Barcode = $imei2;
                }

                $devicePurchaseCost = round(max((float) ($device['purchase_cost'] ?? $unitCost), 0), 2);

                $deviceData = [];
                $this->putIfTableColumnExists('device_units', $deviceData, 'purchase_id', $purchaseId);
                $this->putIfTableColumnExists('device_units', $deviceData, 'purchase_item_id', $purchaseItemId);
                $this->putIfTableColumnExists('device_units', $deviceData, 'supplier_id', $supplierId);
                $this->putIfTableColumnExists('device_units', $deviceData, 'branch_id', $branchId);
                $this->putIfTableColumnExists('device_units', $deviceData, 'product_id', $productId);
                $this->putIfTableColumnExists('device_units', $deviceData, 'product_variant_id', $productVariantId);
                $this->putIfTableColumnExists('device_units', $deviceData, 'product_name', $productName);
                $this->putIfTableColumnExists('device_units', $deviceData, 'model_number', $device['model_number'] ?? ($variant['model_number'] ?? null));
                $this->putIfTableColumnExists('device_units', $deviceData, 'sku', $sku);
                $this->putIfTableColumnExists('device_units', $deviceData, 'color_name', $variant['color_name'] ?? null);
                $this->putIfTableColumnExists('device_units', $deviceData, 'region', $variant['region'] ?? null);
                $this->putIfTableColumnExists('device_units', $deviceData, 'variant_type', $variant['variant_type'] ?? null);
                $this->putIfTableColumnExists('device_units', $deviceData, 'ram', $variant['ram'] ?? null);
                $this->putIfTableColumnExists('device_units', $deviceData, 'storage', $variant['storage'] ?? null);
                $this->putIfTableColumnExists('device_units', $deviceData, 'condition', $device['condition'] ?? ($variant['condition'] ?? 'new'));
                $this->putIfTableColumnExists('device_units', $deviceData, 'battery_health', $device['battery_health'] ?? null);
                $this->putIfTableColumnExists('device_units', $deviceData, 'imei_1', $imei1);
                $this->putIfTableColumnExists('device_units', $deviceData, 'imei_2', $imei2);
                $this->putIfTableColumnExists('device_units', $deviceData, 'barcode', $mainBarcode);
                $this->putIfTableColumnExists('device_units', $deviceData, 'imei_1_barcode', $imei1Barcode);
                $this->putIfTableColumnExists('device_units', $deviceData, 'imei_2_barcode', $imei2Barcode);
                $this->putIfTableColumnExists('device_units', $deviceData, 'barcode_source', !empty($device['barcode']) ? 'manual' : 'auto');
                $this->putIfTableColumnExists('device_units', $deviceData, 'is_barcode_printed', false);
                $this->putIfTableColumnExists('device_units', $deviceData, 'barcode_printed_at', null);
                $this->putIfTableColumnExists('device_units', $deviceData, 'purchase_cost', $devicePurchaseCost);
                // Each phone waits in Device Stock until Prepare For Sale moves it to Ready For Sale (stock in there).
                $this->putIfTableColumnExists('device_units', $deviceData, 'status', 'awaiting_inspection');
                $this->putIfTableColumnExists('device_units', $deviceData, 'saleable', false);
                $this->putIfTableColumnExists('device_units', $deviceData, 'website_published', false);
                $this->putIfTableColumnExists('device_units', $deviceData, 'return_reason', null);
                $this->putIfTableColumnExists('device_units', $deviceData, 'return_note', null);
                $this->putIfTableColumnExists('device_units', $deviceData, 'note', $device['note'] ?? null);
                $this->putIfTableColumnExists('device_units', $deviceData, 'created_by', $userId);
                $this->putIfTableColumnExists('device_units', $deviceData, 'updated_by', $userId);

                if (Schema::hasColumn('device_units', 'created_at')) {
                    $deviceData['created_at'] = now();
                }

                if (Schema::hasColumn('device_units', 'updated_at')) {
                    $deviceData['updated_at'] = now();
                }

                $deviceId = DB::table('device_units')->insertGetId($deviceData);

                $savedDevices[] = [
                    'id' => $deviceId,
                    'imei_1' => $imei1,
                    'imei_2' => $imei2,
                    'barcode' => $mainBarcode,
                    'purchase_cost' => $devicePurchaseCost,
                ];
            }

            PurchaseStockService::increaseBranchStock(
                branchId: $branchId ? (int) $branchId : null,
                productId: $productId ? (int) $productId : null,
                productVariantId: $productVariantId ? (int) $productVariantId : null,
                quantity: max(0, $quantity - count($savedDevices)),
                purchaseId: $purchaseId,
                purchaseItemId: $purchaseItemId,
                unitCost: $unitCost,
                userId: $userId,
                note: 'Supplier purchase stock in. Device-level purchase cost saved.'
            );

            $savedItems[] = [
                'id' => $purchaseItemId,
                'product_id' => $productId,
                'product_variant_id' => $productVariantId,
                'product_name' => $productName,
                'quantity' => $quantity,
                'unit_cost' => $unitCost,
                'line_total' => $lineTotal,
                'devices' => $savedDevices,
                'devices_awaiting_inspection' => count($savedDevices),
            ];
        }

        return $savedItems;
    }

    private function validateDeviceIdentifiers(array $items): void
    {
        $errors = [];
        $seen = [];

        foreach ($items as $itemIndex => $item) {
            $devices = $item['devices'] ?? [];

            foreach ($devices as $deviceIndex => $device) {
                foreach (['imei_1', 'imei_2', 'barcode', 'imei_1_barcode', 'imei_2_barcode'] as $field) {
                    $value = $this->nullableTrim($device[$field] ?? null);

                    if (!$value) {
                        continue;
                    }

                    $key = strtolower($value);

                    if (isset($seen[$key])) {
                        $errors["items.$itemIndex.devices.$deviceIndex.$field"] = [
                            "Duplicate identifier found in this purchase: {$value}",
                        ];
                    }

                    $seen[$key] = true;

                    if ($this->identifierExistsInDeviceUnits($value)) {
                        $errors["items.$itemIndex.devices.$deviceIndex.$field"] = [
                            "This identifier already exists: {$value}",
                        ];
                    }
                }
            }
        }

        if (!empty($errors)) {
            throw ValidationException::withMessages($errors);
        }
    }

    private function identifierExistsInDeviceUnits(string $value): bool
    {
        if (!Schema::hasTable('device_units')) {
            return false;
        }

        $columns = array_values(array_filter(
            ['imei_1', 'imei_2', 'barcode', 'imei_1_barcode', 'imei_2_barcode'],
            fn ($column) => Schema::hasColumn('device_units', $column)
        ));

        if (empty($columns)) {
            return false;
        }

        return DB::table('device_units')
            ->where(function ($query) use ($columns, $value) {
                foreach ($columns as $column) {
                    $query->orWhere($column, $value);
                }
            })
            ->exists();
    }

    private function getVariantInfo($variantId): array
    {
        if (!$variantId || !Schema::hasTable('product_variants')) {
            return [];
        }

        $variant = DB::table('product_variants')->where('id', $variantId)->first();

        if (!$variant) {
            return [];
        }

        return [
            'id' => $variant->id,
            'variant_name' => $variant->variant_name ?? null,
            'model_number' => $variant->model_number ?? null,
            'sku' => $variant->sku ?? null,
            'barcode' => $variant->barcode ?? null,
            'color_name' => $variant->color_name ?? null,
            'region' => $variant->region ?? null,
            'variant_type' => $variant->variant_type ?? null,
            'ram' => $variant->ram ?? null,
            'storage' => $variant->storage ?? null,
            'condition' => $variant->condition ?? null,
            'purchase_price' => $variant->purchase_price ?? null,
            'sale_price' => $variant->sale_price ?? null,
        ];
    }

    private function getProductInfo($productId): array
    {
        if (!$productId || !Schema::hasTable('products')) {
            return [];
        }

        $product = DB::table('products')->where('id', $productId)->first();

        if (!$product) {
            return [];
        }

        return [
            'name' => $product->name ?? $product->product_name ?? $product->title ?? null,
            'sku' => $product->sku ?? null,
            'barcode' => $product->barcode ?? $product->product_barcode ?? null,
        ];
    }

    private function generatePurchaseNo(): string
    {
        do {
            $purchaseNo = 'PUR-' . now()->format('YmdHis') . '-' . random_int(100, 999);
        } while (
            Schema::hasColumn('purchases', 'purchase_no') &&
            DB::table('purchases')->where('purchase_no', $purchaseNo)->exists()
        );

        return $purchaseNo;
    }

    private function generateDeviceBarcode(): string
    {
        do {
            $barcode = 'NST-' . now()->format('Ymd') . '-' . str_pad((string) random_int(1, 999999), 6, '0', STR_PAD_LEFT);
        } while ($this->identifierExistsInDeviceUnits($barcode));

        return $barcode;
    }

    private function nullableTrim($value): ?string
    {
        $value = trim((string) ($value ?? ''));

        return $value === '' ? null : $value;
    }

    private function putIfColumnExists(array &$data, string $column, $value): void
    {
        if (Schema::hasColumn('purchases', $column)) {
            $data[$column] = $value;
        }
    }

    private function putIfTableColumnExists(string $table, array &$data, string $column, $value): void
    {
        if (Schema::hasColumn($table, $column)) {
            $data[$column] = $value;
        }
    }

    private function getSupplierDueBalance($supplier): float
    {
        foreach (['current_balance', 'balance', 'due_amount'] as $column) {
            if (Schema::hasColumn('suppliers', $column)) {
                return (float) ($supplier->{$column} ?? 0);
            }
        }

        return 0;
    }

    private function getSupplierAdvanceBalance($supplier): float
    {
        if (Schema::hasColumn('suppliers', 'advance_balance')) {
            return (float) ($supplier->advance_balance ?? 0);
        }

        return 0;
    }

    private function updateSupplierBalances(int $supplierId, float $dueBalance, float $advanceBalance, ?int $userId = null): void
    {
        $updateData = [];

        foreach (['current_balance', 'balance', 'due_amount'] as $column) {
            if (Schema::hasColumn('suppliers', $column)) {
                $updateData[$column] = $dueBalance;
            }
        }

        if (Schema::hasColumn('suppliers', 'advance_balance')) {
            $updateData['advance_balance'] = $advanceBalance;
        }

        if ($userId && Schema::hasColumn('suppliers', 'updated_by')) {
            $updateData['updated_by'] = $userId;
        }

        if (Schema::hasColumn('suppliers', 'updated_at')) {
            $updateData['updated_at'] = now();
        }

        if (count($updateData) > 0) {
            DB::table('suppliers')->where('id', $supplierId)->update($updateData);
        }
    }

    private function getPaymentStatus(float $purchaseDue, float $paidAmount): string
    {
        if ($purchaseDue <= 0) {
            return 'paid';
        }

        if ($paidAmount > 0) {
            return 'partial';
        }

        return 'due';
    }
}
