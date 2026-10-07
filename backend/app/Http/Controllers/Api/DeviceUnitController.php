<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use App\Services\AccessControlService;

class DeviceUnitController extends Controller
{
    public function index(Request $request)
    {
        if (!Schema::hasTable('device_units')) {
            return response()->json([
                'success' => false,
                'message' => 'device_units table not found. Please run php artisan migrate first.',
                'data' => [],
            ], 404);
        }

        $query = DB::table('device_units')->select('device_units.*');

        if (Schema::hasColumn('device_units', 'deleted_at')) {
            $query->whereNull('device_units.deleted_at');
        }

        if (Schema::hasTable('products') && Schema::hasColumn('device_units', 'product_id')) {
            $query->leftJoin('products', 'products.id', '=', 'device_units.product_id');

            if (Schema::hasColumn('products', 'name')) {
                $query->addSelect('products.name as product_db_name');
            }

            if (Schema::hasColumn('products', 'slug')) {
                $query->addSelect('products.slug as product_slug');
            }
        }

        if (Schema::hasTable('product_variants') && Schema::hasColumn('device_units', 'product_variant_id')) {
            $query->leftJoin('product_variants', 'product_variants.id', '=', 'device_units.product_variant_id');

            foreach (['variant_name', 'model_number', 'sku', 'barcode', 'color', 'storage', 'region_variant', 'ram_storage', 'sim_network'] as $column) {
                if (Schema::hasColumn('product_variants', $column)) {
                    $query->addSelect("product_variants.$column as variant_$column");
                }
            }
        }

        if (Schema::hasTable('branches') && Schema::hasColumn('device_units', 'branch_id')) {
            $query->leftJoin('branches', 'branches.id', '=', 'device_units.branch_id');

            if (Schema::hasColumn('branches', 'name')) {
                $query->addSelect('branches.name as branch_name');
            }
        }

        if (Schema::hasTable('suppliers') && Schema::hasColumn('device_units', 'supplier_id')) {
            $query->leftJoin('suppliers', 'suppliers.id', '=', 'device_units.supplier_id');

            if (Schema::hasColumn('suppliers', 'name')) {
                $query->addSelect('suppliers.name as supplier_name');
            }
        }

        if (Schema::hasTable('purchases') && Schema::hasColumn('device_units', 'purchase_id')) {
            $query->leftJoin('purchases', 'purchases.id', '=', 'device_units.purchase_id');

            foreach (['purchase_no', 'purchase_number', 'invoice_no', 'reference_no'] as $column) {
                if (Schema::hasColumn('purchases', $column)) {
                    $query->addSelect("purchases.$column as purchase_reference");
                    break;
                }
            }

            if (Schema::hasColumn('purchases', 'purchase_date')) {
                $query->addSelect('purchases.purchase_date');
            }
        }

        $this->applyFilters($query, $request);

        $orderColumn = Schema::hasColumn('device_units', 'created_at') ? 'device_units.created_at' : 'device_units.id';

        $devices = $query
            ->orderByDesc($orderColumn)
            ->paginate((int) $request->get('per_page', 20));

        $accessControl = app(AccessControlService::class);
        $canSeeCost = $accessControl->canViewPurchasePrice($request->user());
        $canSeeSupplierInfo = $accessControl->canViewSupplierInfo($request->user());

        $devices->getCollection()->transform(function ($device) use ($canSeeCost, $canSeeSupplierInfo) {
            $device->display_product_name = $device->product_name ?: ($device->product_db_name ?? null);
            $device->variant_display = $this->makeVariantDisplay((array) $device);

            if (!$canSeeCost) {
                unset($device->purchase_cost);
            }

            if (!$canSeeSupplierInfo) {
                unset($device->supplier_name, $device->supplier_id);
            }

            return $device;
        });

        return response()->json([
            'success' => true,
            'can_see_purchase_cost' => $canSeeCost,
            'can_see_supplier_info' => $canSeeSupplierInfo,
            'data' => $devices,
        ]);
    }

    public function summary(Request $request)
    {
        if (!Schema::hasTable('device_units')) {
            return response()->json([
                'success' => false,
                'message' => 'device_units table not found. Please run php artisan migrate first.',
            ], 404);
        }

        $base = DB::table('device_units');

        if (Schema::hasColumn('device_units', 'deleted_at')) {
            $base->whereNull('deleted_at');
        }

        $totalDevices = (clone $base)->count();
        $availableDevices = Schema::hasColumn('device_units', 'status')
            ? (clone $base)->where('status', 'available')->count()
            : 0;
        $soldDevices = Schema::hasColumn('device_units', 'status')
            ? (clone $base)->where('status', 'sold')->count()
            : 0;
        $returnedDevices = Schema::hasColumn('device_units', 'status')
            ? (clone $base)->whereIn('status', ['returned', 'supplier_return'])->count()
            : 0;
        $damagedDevices = Schema::hasColumn('device_units', 'status')
            ? (clone $base)->where('status', 'damaged')->count()
            : 0;

        $accessControl = app(AccessControlService::class);
        $canSeeCost = $accessControl->canViewPurchasePrice($request->user());
        $canSeeSupplierInfo = $accessControl->canViewSupplierInfo($request->user());
        $stockValue = 0;
        $averageCost = 0;

        if ($canSeeCost && Schema::hasColumn('device_units', 'purchase_cost')) {
            $availableValueQuery = clone $base;

            if (Schema::hasColumn('device_units', 'status')) {
                $availableValueQuery->where('status', 'available');
            }

            $stockValue = round((float) $availableValueQuery->sum('purchase_cost'), 2);
            $averageCost = $availableDevices > 0 ? round($stockValue / $availableDevices, 2) : 0;
        }

        return response()->json([
            'success' => true,
            'can_see_purchase_cost' => $canSeeCost,
            'can_see_supplier_info' => $canSeeSupplierInfo,
            'data' => [
                'total_devices' => $totalDevices,
                'available_devices' => $availableDevices,
                'sold_devices' => $soldDevices,
                'returned_devices' => $returnedDevices,
                'damaged_devices' => $damagedDevices,
                'available_stock_value' => $canSeeCost ? $stockValue : null,
                'average_purchase_cost' => $canSeeCost ? $averageCost : null,
            ],
        ]);
    }

    public function show(Request $request, string $id)
    {
        if (!Schema::hasTable('device_units')) {
            return response()->json([
                'success' => false,
                'message' => 'device_units table not found. Please run php artisan migrate first.',
            ], 404);
        }

        $device = DB::table('device_units')->where('id', $id)->first();

        if (!$device) {
            return response()->json([
                'success' => false,
                'message' => 'Device unit not found.',
            ], 404);
        }

        $accessControl = app(AccessControlService::class);
        if (!$accessControl->canViewPurchasePrice($request->user())) {
            unset($device->purchase_cost);
        }
        if (!$accessControl->canViewSupplierInfo($request->user())) {
            unset($device->supplier_id, $device->supplier_name);
        }

        return response()->json([
            'success' => true,
            'data' => $device,
        ]);
    }

    public function markPrinted(Request $request, string $id)
    {
        if (!Schema::hasTable('device_units')) {
            return response()->json([
                'success' => false,
                'message' => 'device_units table not found. Please run php artisan migrate first.',
            ], 404);
        }

        $device = DB::table('device_units')->where('id', $id)->first();

        if (!$device) {
            return response()->json([
                'success' => false,
                'message' => 'Device unit not found.',
            ], 404);
        }

        $updateData = [];

        if (Schema::hasColumn('device_units', 'is_barcode_printed')) {
            $updateData['is_barcode_printed'] = true;
        }

        if (Schema::hasColumn('device_units', 'barcode_printed_at')) {
            $updateData['barcode_printed_at'] = now();
        }

        if (Schema::hasColumn('device_units', 'updated_by')) {
            $updateData['updated_by'] = $request->user()?->id;
        }

        if (Schema::hasColumn('device_units', 'updated_at')) {
            $updateData['updated_at'] = now();
        }

        if (!empty($updateData)) {
            DB::table('device_units')->where('id', $id)->update($updateData);
        }

        return response()->json([
            'success' => true,
            'message' => 'Barcode print status updated successfully.',
            'data' => DB::table('device_units')->where('id', $id)->first(),
        ]);
    }

    private function applyFilters($query, Request $request): void
    {
        foreach (['status', 'branch_id', 'product_id', 'product_variant_id', 'supplier_id', 'purchase_id'] as $column) {
            if ($request->filled($column) && Schema::hasColumn('device_units', $column)) {
                $query->where("device_units.$column", $request->get($column));
            }
        }

        if ($request->filled('from_date') && Schema::hasColumn('device_units', 'created_at')) {
            $query->whereDate('device_units.created_at', '>=', $request->get('from_date'));
        }

        if ($request->filled('to_date') && Schema::hasColumn('device_units', 'created_at')) {
            $query->whereDate('device_units.created_at', '<=', $request->get('to_date'));
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->get('search'));

            $query->where(function ($q) use ($search) {
                foreach (['product_name', 'model_number', 'sku', 'imei_1', 'imei_2', 'barcode', 'imei_1_barcode', 'imei_2_barcode', 'status', 'note'] as $column) {
                    if (Schema::hasColumn('device_units', $column)) {
                        $q->orWhere("device_units.$column", 'like', "%{$search}%");
                    }
                }

                if (Schema::hasTable('product_variants')) {
                    foreach (['variant_name', 'model_number', 'sku', 'barcode', 'color', 'storage', 'region_variant', 'ram_storage', 'sim_network'] as $column) {
                        if (Schema::hasColumn('product_variants', $column)) {
                            $q->orWhere("product_variants.$column", 'like', "%{$search}%");
                        }
                    }
                }

                if (Schema::hasTable('products') && Schema::hasColumn('products', 'name')) {
                    $q->orWhere('products.name', 'like', "%{$search}%");
                }

                if (Schema::hasTable('branches') && Schema::hasColumn('branches', 'name')) {
                    $q->orWhere('branches.name', 'like', "%{$search}%");
                }

                if (Schema::hasTable('suppliers') && Schema::hasColumn('suppliers', 'name')) {
                    $q->orWhere('suppliers.name', 'like', "%{$search}%");
                }

                if (Schema::hasTable('purchases')) {
                    foreach (['purchase_no', 'purchase_number', 'invoice_no', 'reference_no'] as $column) {
                        if (Schema::hasColumn('purchases', $column)) {
                            $q->orWhere("purchases.$column", 'like', "%{$search}%");
                        }
                    }
                }
            });
        }
    }

    private function makeVariantDisplay(array $device): string
    {
        $direct = $device['variant_variant_name'] ?? null;
        $values = array_filter([
            $device['variant_color'] ?? null,
            $device['variant_storage'] ?? null,
            $device['variant_region_variant'] ?? null,
            $device['variant_ram_storage'] ?? null,
            $device['variant_sim_network'] ?? null,
        ]);

        if (!empty($values)) {
            return implode(' / ', $values);
        }

        return (string) ($direct ?: '');
    }

    private function canSeePurchaseCost($user): bool
    {
        return app(AccessControlService::class)->canViewPurchasePrice($user);
    }
    /* Super admin device management */
    public function update(\Illuminate\Http\Request $request, \App\Models\DeviceUnit $deviceUnit)
    {
        $this->nstV1510AssertSuperAdmin($request);
        abort_if($deviceUnit->trashed(), 422, 'Deleted Device Stock records cannot be edited.');

        $validated = $request->validate([
            'product_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'model_number' => ['sometimes', 'nullable', 'string', 'max:255'],
            'sku' => ['sometimes', 'nullable', 'string', 'max:120'],
            'barcode' => ['sometimes', 'nullable', 'string', 'max:120'],
            'imei_1' => ['sometimes', 'nullable', 'string', 'max:120'],
            'imei_2' => ['sometimes', 'nullable', 'string', 'max:120'],
            'battery_health' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:100'],
            'purchase_cost' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'selling_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'market_price' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'condition' => ['sometimes', 'nullable', 'string', 'max:100'],
            'status' => ['sometimes', 'nullable', 'string', 'max:100'],
            'saleable' => ['sometimes', 'boolean'],
            'website_published' => ['sometimes', 'boolean'],
            'service_status' => ['sometimes', 'nullable', 'string', 'max:100'],
            'branch_id' => ['sometimes', 'nullable', 'integer', 'exists:branches,id'],
            'supplier_id' => ['sometimes', 'nullable', 'integer', 'exists:suppliers,id'],
            'note' => ['sometimes', 'nullable', 'string', 'max:5000'],
        ]);

        $isSold = strtolower((string) $deviceUnit->status) === 'sold' || ! empty($deviceUnit->sale_id) || ! empty($deviceUnit->sale_item_id);
        if ($isSold) {
            $protected = ['product_name','model_number','sku','barcode','imei_1','imei_2','purchase_cost','selling_price','market_price','condition','status','saleable','website_published','branch_id','supplier_id'];
            abort_if(count(array_intersect(array_keys($validated), $protected)) > 0, 422, 'Sold/invoice-linked device identity cannot be changed. Only note/service correction is allowed.');
        }

        $this->nstV1510AssertUniqueIdentity($deviceUnit, $validated);
        $before = $deviceUnit->getAttributes();
        $columns = array_flip(\Illuminate\Support\Facades\Schema::getColumnListing('device_units'));
        $payload = array_intersect_key($validated, $columns);
        if (array_key_exists('selling_price', $payload) && $payload['selling_price'] === null) { $payload['selling_price'] = 0; }
        if (array_key_exists('purchase_cost', $payload) && $payload['purchase_cost'] === null) { $payload['purchase_cost'] = 0; }
        if (array_key_exists('market_price', $payload) && $payload['market_price'] === null) { $payload['market_price'] = 0; }

        $prospectiveStatus = strtolower((string) ($payload['status'] ?? $deviceUnit->status ?? ''));
        $prospectiveSaleable = array_key_exists('saleable', $payload) ? (bool) $payload['saleable'] : (bool) $deviceUnit->saleable;
        $prospectivePrice = array_key_exists('selling_price', $payload) ? (float) $payload['selling_price'] : (float) ($deviceUnit->selling_price ?? 0);
        if ($prospectiveStatus === 'ready_for_sale' || $prospectiveSaleable) {
            abort_if($prospectivePrice <= 0, 422, 'A positive Sale Price is required before a device can be Ready for Sale / Saleable.');
        }
        if (in_array($prospectiveStatus, ['sold','inactive','damaged','lost','missing','supplier_return'], true)) {
            $payload['saleable'] = false;
            $payload['website_published'] = false;
        }
        if (array_key_exists('saleable', $payload) && ! $payload['saleable']) {
            $payload['website_published'] = false;
        }
        if (\Illuminate\Support\Facades\Schema::hasColumn('device_units', 'updated_by')) {
            $payload['updated_by'] = $request->user()?->id;
        }

        $deviceUnit->forceFill($payload)->save();
        $this->nstV1510WriteAdminHistory($deviceUnit, 'super_admin_edit', $before, $deviceUnit->fresh()->getAttributes(), 'Device Stock edited by Super Admin.');

        return response()->json(['success' => true, 'message' => 'Device Stock updated successfully.', 'data' => $deviceUnit->fresh()]);
    }

    public function destroy(\Illuminate\Http\Request $request, \App\Models\DeviceUnit $deviceUnit)
    {
        $this->nstV1510AssertSuperAdmin($request);
        $validated = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:1000']]);
        $isSold = strtolower((string) $deviceUnit->status) === 'sold' || ! empty($deviceUnit->sale_id) || ! empty($deviceUnit->sale_item_id);
        abort_if($isSold, 422, 'Sold/invoice-linked device cannot be deleted. Preserve its lifetime identity and use return/correction workflow.');

        $before = $deviceUnit->getAttributes();
        $reason = trim((string) $validated['reason']);
        $deviceUnit->forceFill([
            'status' => 'inactive',
            'saleable' => false,
            'website_published' => false,
            'note' => trim(((string) $deviceUnit->note) . "\nSuper Admin delete reason: " . $reason),
            'updated_by' => $request->user()?->id,
        ])->save();
        $this->nstV1510WriteAdminHistory($deviceUnit, 'super_admin_delete', $before, $deviceUnit->getAttributes(), $reason);
        $deviceUnit->delete();

        return response()->json(['success' => true, 'message' => 'Unsold Device Stock record deleted safely. IMEI lifetime history is preserved.', 'data' => ['id' => $deviceUnit->id, 'mode' => 'soft_deleted']]);
    }

    private function nstV1510AssertSuperAdmin(\Illuminate\Http\Request $request): void
    {
        $user = $request->user();
        abort_unless($user && app(\App\Services\AccessControlService::class)->isSuperAdmin($user), 403, 'Only Super Admin can edit or delete Device Stock records.');
    }

    private function nstV1510AssertUniqueIdentity(\App\Models\DeviceUnit $deviceUnit, array $validated): void
    {
        foreach (['sku','barcode'] as $field) {
            if (! array_key_exists($field, $validated) || trim((string) $validated[$field]) === '') { continue; }
            $value = trim((string) $validated[$field]);
            $duplicate = \App\Models\DeviceUnit::withTrashed()->where('id', '<>', $deviceUnit->id)->where(function ($query) use ($value) {
                $query->where('sku', $value)->orWhere('barcode', $value);
            })->exists();
            abort_if($duplicate, 422, strtoupper($field) . ' already belongs to another Device Stock unit.');
        }
        foreach (['imei_1','imei_2'] as $field) {
            if (! array_key_exists($field, $validated) || trim((string) $validated[$field]) === '') { continue; }
            $value = trim((string) $validated[$field]);
            $duplicate = \App\Models\DeviceUnit::withTrashed()->where('id', '<>', $deviceUnit->id)->where(function ($query) use ($value) {
                $query->where('imei_1', $value)->orWhere('imei_2', $value);
            })->exists();
            abort_if($duplicate, 422, strtoupper($field) . ' already belongs to another Device Stock unit.');
        }
    }

    private function nstV1510WriteAdminHistory(\App\Models\DeviceUnit $deviceUnit, string $eventType, array $before, array $after, string $note): void
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('device_unit_histories')) { return; }
        \Illuminate\Support\Facades\DB::table('device_unit_histories')->insert([
            'device_unit_id' => $deviceUnit->id,
            'event_type' => $eventType,
            'from_status' => $before['status'] ?? null,
            'to_status' => $after['status'] ?? null,
            'from_branch_id' => $before['branch_id'] ?? null,
            'to_branch_id' => $after['branch_id'] ?? null,
            'from_saleable' => array_key_exists('saleable', $before) ? (bool) $before['saleable'] : null,
            'to_saleable' => array_key_exists('saleable', $after) ? (bool) $after['saleable'] : null,
            'from_website_published' => array_key_exists('website_published', $before) ? (bool) $before['website_published'] : null,
            'to_website_published' => array_key_exists('website_published', $after) ? (bool) $after['website_published'] : null,
            'before_data' => json_encode($before, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'after_data' => json_encode($after, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'note' => $note,
            'user_id' => auth()->id(),
            'event_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}

