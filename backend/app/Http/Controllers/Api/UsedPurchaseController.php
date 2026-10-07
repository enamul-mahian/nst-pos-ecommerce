<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\BranchStock;
use App\Models\Branch;
use App\Models\Customer;
use App\Models\DeviceUnit;
use App\Models\Supplier;
use App\Models\Product;
use App\Models\UsedPurchase;
use App\Models\User;
use App\Services\DeviceSalePreparationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use App\Services\AccessControlService;

class UsedPurchaseController extends Controller
{
    private function rejectForbiddenSellerIdentityPayload(Request $request): void
    {
        $forbidden = ['customer_nid', 'nid_photo', 'customer_product_photo', 'fingerprint', 'fingerprint_data', 'biometric_data'];
        foreach ($forbidden as $field) {
            if ($request->has($field) || $request->hasFile($field)) {
                abort(422, 'Used Purchase accepts product/device images only. Seller identity images, NID, fingerprint and biometric data are not accepted.');
            }
        }
    }

    private function isAdminUser($user)
    {
        if (!$user) {
            return false;
        }

        $adminRoles = [
            'super_admin',
            'admin',
            'super admin',
            'Super Admin',
            'Admin',
            'SUPER_ADMIN',
            'ADMIN',
        ];

        if (method_exists($user, 'hasAnyRole')) {
            if ($user->hasAnyRole($adminRoles)) {
                return true;
            }
        }

        if (isset($user->role) && in_array($user->role, $adminRoles)) {
            return true;
        }

        if (isset($user->user_type) && in_array($user->user_type, $adminRoles)) {
            return true;
        }

        if (isset($user->type) && in_array($user->type, $adminRoles)) {
            return true;
        }

        return false;
    }

    private function loadRelations(UsedPurchase $usedPurchase)
    {
        return $usedPurchase->load([
            'creator:id,name,email',
            'branch:id,name,code',
            'salesman:id,name,email',
            'customer:id,name,phone,email,nid_number',
            'supplier:id,name,company_name,contact_person,phone,email',
            'brandInfo:id,name',
            'readyProduct:id,name,sku,barcode,sale_price,stock_quantity',
            'converter:id,name,email',
        ]);
    }

    private function sanitizeBuyingPriceForUser($payload, $user)
    {
        if (app(AccessControlService::class)->canViewUsedPurchaseBuyingPrice($user)) {
            return $payload;
        }

        $strip = function ($item) {
            foreach (['purchase_price', 'buying_price', 'purchase_cost', 'unit_cost', 'profit', 'profit_amount', 'margin'] as $field) {
                unset($item->{$field});
            }
            return $item;
        };

        if ($payload instanceof \Illuminate\Support\Collection) {
            return $payload->map($strip);
        }

        if ($payload instanceof UsedPurchase) {
            return $strip($payload);
        }

        return $payload;
    }

    private function storeSingleImage(Request $request, string $fieldName, string $folder)
    {
        if (!$request->hasFile($fieldName)) {
            return null;
        }

        return $request->file($fieldName)->store($folder, 'public');
    }

    private function storeProductImages(Request $request)
    {
        if (!$request->hasFile('product_images')) {
            return [];
        }

        $paths = [];

        foreach ($request->file('product_images') as $image) {
            if ($image) {
                $paths[] = $image->store('used-purchases/product-images', 'public');
            }
        }

        return $paths;
    }

    private function deleteFileIfExists($path)
    {
        if ($path && Storage::disk('public')->exists($path)) {
            Storage::disk('public')->delete($path);
        }
    }

    private function deleteProductImagesIfExist($paths)
    {
        if (!$paths || !is_array($paths)) {
            return;
        }

        foreach ($paths as $path) {
            $this->deleteFileIfExists($path);
        }
    }

    private function getKeepProductImagePaths(Request $request)
    {
        $keepPaths = $request->input('keep_product_image_paths');

        if (!$keepPaths) {
            return [];
        }

        if (is_array($keepPaths)) {
            return array_values(array_filter($keepPaths));
        }

        $decoded = json_decode($keepPaths, true);

        if (!is_array($decoded)) {
            return [];
        }

        return array_values(array_filter($decoded));
    }

    private function getSalesmenOptions()
    {
        $salesmanRoles = [
            'salesman',
            'Salesman',
            'sales_man',
            'sales man',
            'Sales Man',
            'SALES_MAN',
            'SALES MAN',
        ];

        $query = User::query()
            ->select('id', 'name', 'email')
            ->orderBy('name');

        if (Schema::hasColumn('users', 'role')) {
            $salesmen = (clone $query)
                ->whereIn('role', $salesmanRoles)
                ->get();

            if ($salesmen->count() > 0) {
                return $salesmen;
            }
        }

        $userModel = new User();

        if (method_exists($userModel, 'roles')) {
            $salesmen = (clone $query)
                ->whereHas('roles', function ($roleQuery) use ($salesmanRoles) {
                    $roleQuery->whereIn('name', $salesmanRoles);
                })
                ->get();

            if ($salesmen->count() > 0) {
                return $salesmen;
            }
        }

        return $query->get();
    }

    private function makePortalEmail(string $phone, string $type): string
    {
        $digits = preg_replace('/\D+/', '', $phone) ?: Str::random(8);

        return $type . '-' . $digits . '@' . $type . '.nst.local';
    }

    private function ensureSellerUserAccount(string $type, $profile, ?string $phone, ?string $name): ?User
    {
        if (!$profile || !$phone) {
            return null;
        }

        $phone = trim($phone);
        $profileTable = $type === 'supplier' ? 'suppliers' : 'customers';
        $profileIdColumn = $type === 'supplier' ? 'supplier_id' : 'customer_id';
        $roleName = $type === 'supplier' ? 'supplier' : 'customer';

        $user = null;

        if (Schema::hasColumn($profileTable, 'user_id') && !empty($profile->user_id)) {
            $user = User::find($profile->user_id);
        }

        if (!$user) {
            $user = User::where('phone', $phone)
                ->orWhere('username', $phone)
                ->first();
        }

        $email = $profile->email ?: $this->makePortalEmail($phone, $type);

        $payload = [
            'name' => $name ?: $profile->name ?: $phone,
            'username' => $phone,
            'email' => $email,
            'phone' => $phone,
            'status' => 'active',
            'profile_type' => $type,
            $profileIdColumn => $profile->id,
        ];

        if ($user) {
            $user->update($this->filterExistingColumns('users', $payload));
        } else {
            $payload['password'] = Hash::make($phone);
            $payload['temporary_password'] = $phone;
            $payload['must_change_password'] = true;
            $payload['password_reset_by'] = auth()->id();
            $payload['password_reset_at'] = now();

            $user = User::create($this->filterExistingColumns('users', $payload));
        }

        if (method_exists($user, 'assignRole') && Role::where('name', $roleName)->exists() && !$user->hasRole($roleName)) {
            $user->assignRole($roleName);
        }

        if (Schema::hasColumn($profileTable, 'user_id') && $profile->user_id !== $user->id) {
            $profile->forceFill(['user_id' => $user->id])->save();
        }

        return $user;
    }

    private function resolveSellerData(array $validated, Request $request): array
    {
        $sellerType = $validated['seller_type'] ?? 'customer';

        if ($sellerType === 'customer') {
            $validated['supplier_id'] = null;

            if (!empty($validated['customer_id'])) {
                $customer = Customer::find($validated['customer_id']);
            } else {
                $customer = null;

                if (!empty($validated['customer_phone'])) {
                    $customer = Customer::where('phone', $validated['customer_phone'])->first();
                }

                if (!$customer) {
                    $customer = Customer::create([
                        'name' => $validated['customer_name'],
                        'phone' => $validated['customer_phone'] ?? null,
                        'nid_number' => $validated['customer_nid'] ?? null,
                        'country' => 'Bangladesh',
                        'opening_balance' => 0,
                        'current_balance' => 0,
                        'status' => 'active',
                        'created_by' => $request->user()?->id,
                        'updated_by' => $request->user()?->id,
                    ]);
                }
            }

            if ($customer) {
                $validated['customer_id'] = $customer->id;
                $validated['customer_name'] = $customer->name;
                $validated['customer_phone'] = $customer->phone ?: ($validated['customer_phone'] ?? null);
                $validated['customer_nid'] = $customer->nid_number ?: ($validated['customer_nid'] ?? null);

                $this->ensureSellerUserAccount('customer', $customer, $validated['customer_phone'] ?? null, $validated['customer_name'] ?? null);
            }
        }

        if ($sellerType === 'supplier') {
            $validated['customer_id'] = null;

            if (!empty($validated['supplier_id'])) {
                $supplier = Supplier::find($validated['supplier_id']);
            } else {
                $supplier = null;

                if (!empty($validated['customer_phone'])) {
                    $supplier = Supplier::where('phone', $validated['customer_phone'])->first();
                }

                if (!$supplier) {
                    $supplier = Supplier::create([
                        'name' => $validated['customer_name'],
                        'company_name' => null,
                        'contact_person' => $validated['customer_name'],
                        'phone' => $validated['customer_phone'] ?? null,
                        'country' => 'Bangladesh',
                        'opening_balance' => 0,
                        'current_balance' => 0,
                        'status' => 'active',
                        'created_by' => $request->user()?->id,
                        'updated_by' => $request->user()?->id,
                    ]);
                }
            }

            if ($supplier) {
                $validated['supplier_id'] = $supplier->id;
                $validated['customer_name'] = $supplier->name;
                $validated['customer_phone'] = $supplier->phone ?: ($validated['customer_phone'] ?? null);
                $validated['customer_nid'] = $validated['customer_nid'] ?? null;

                $this->ensureSellerUserAccount('supplier', $supplier, $validated['customer_phone'] ?? null, $validated['customer_name'] ?? null);
            }
        }

        return $validated;
    }


    private function filterExistingColumns(string $table, array $data): array
    {
        return collect($data)
            ->filter(function ($value, $key) use ($table) {
                return Schema::hasColumn($table, $key);
            })
            ->toArray();
    }

    private function makeUniqueProductSlug(string $name, int $usedPurchaseId): string
    {
        $baseSlug = Str::slug($name);

        if (!$baseSlug) {
            $baseSlug = 'used-device';
        }

        $baseSlug = $baseSlug . '-' . $usedPurchaseId;
        $slug = $baseSlug;
        $count = 1;

        while (Product::where('slug', $slug)->exists()) {
            $slug = $baseSlug . '-' . $count;
            $count++;
        }

        return $slug;
    }

    private function makeUniqueSku(int $usedPurchaseId): string
    {
        $baseSku = 'UP-' . str_pad((string) $usedPurchaseId, 6, '0', STR_PAD_LEFT);
        $sku = $baseSku;
        $count = 1;

        while (Product::where('sku', $sku)->exists()) {
            $sku = $baseSku . '-' . $count;
            $count++;
        }

        return $sku;
    }

    private function buildReadyProductDescription(UsedPurchase $usedPurchase): string
    {
        $lines = [
            'Source: Used / Pre-Owned Purchase #' . $usedPurchase->id,
            'Seller Type: ' . ($usedPurchase->seller_type ?: 'N/A'),
            'Seller Name: ' . ($usedPurchase->customer_name ?: 'N/A'),
            'Seller Phone: ' . ($usedPurchase->customer_phone ?: 'N/A'),
            'IMEI 1: ' . ($usedPurchase->imei_1 ?: 'N/A'),
            'IMEI 2: ' . ($usedPurchase->imei_2 ?: 'N/A'),
            'Battery Health: ' . ($usedPurchase->battery_health !== null ? $usedPurchase->battery_health . '%' : 'N/A'),
            'Condition: ' . ($usedPurchase->condition ?: 'N/A'),
            'Notes: ' . ($usedPurchase->notes ?: 'N/A'),
        ];

        return implode("\n", $lines);
    }

    private function addProductToBranchStock(Product $product, UsedPurchase $usedPurchase, bool $alreadyConverted): void
    {
        if (!$usedPurchase->branch_id) {
            return;
        }

        $stock = BranchStock::where('branch_id', $usedPurchase->branch_id)
            ->where('product_id', $product->id)
            ->first();

        if ($stock) {
            if (!$alreadyConverted) {
                $stock->update([
                    'quantity' => (int) $stock->quantity + 1,
                ]);
            }

            return;
        }

        $stockData = [
            'branch_id' => $usedPurchase->branch_id,
            'product_id' => $product->id,
            'quantity' => 1,
        ];

        if (Schema::hasColumn('branch_stocks', 'alert_quantity')) {
            $stockData['alert_quantity'] = 0;
        }

        BranchStock::create($stockData);
    }

    public function options(Request $request)
    {
        $user = $request->user();
        $isAdmin = $this->isAdminUser($user);

        $branchQuery = Branch::query()
            ->select('id', 'name', 'code')
            ->orderBy('name');

        if (!$isAdmin) {
            $branchQuery->where('manager_id', $user?->id);
        }

        $branches = $branchQuery->get();

        $brands = Brand::query()
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        $categories = Category::query()
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        $salesmen = $this->getSalesmenOptions();

        $customers = Customer::query()
            ->select('id', 'name', 'phone', 'email', 'nid_number')
            ->where('status', 'active')
            ->orderBy('name')
            ->limit(300)
            ->get();

        $suppliers = Supplier::query()
            ->select('id', 'name', 'company_name', 'contact_person', 'phone', 'email')
            ->where('status', 'active')
            ->orderBy('name')
            ->limit(300)
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Used purchase options loaded successfully.',
            'data' => [
                'branches' => $branches,
                'brands' => $brands,
                'categories' => $categories,
                'salesmen' => $salesmen,
                'customers' => $customers,
                'suppliers' => $suppliers,
            ],
        ]);
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $isAdmin = $this->isAdminUser($user);

        $query = UsedPurchase::with([
                'creator:id,name,email',
                'branch:id,name,code',
                'salesman:id,name,email',
                'customer:id,name,phone,email,nid_number',
                'supplier:id,name,company_name,contact_person,phone,email',
                'brandInfo:id,name',
                'readyProduct:id,name,sku,barcode,sale_price,stock_quantity',
                'converter:id,name,email',
            ])
            ->latest();

        if (!$isAdmin) {
            $branchIds = Branch::where('manager_id', $user?->id)->pluck('id');
            $query->whereIn('branch_id', $branchIds);
        }

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->where('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('customer_nid', 'like', "%{$search}%")
                    ->orWhere('product_name', 'like', "%{$search}%")
                    ->orWhere('brand', 'like', "%{$search}%")
                    ->orWhere('model', 'like', "%{$search}%")
                    ->orWhere('imei_1', 'like', "%{$search}%")
                    ->orWhere('imei_2', 'like', "%{$search}%");
            });
        }

        if ($request->filled('purchase_type')) {
            $query->where('purchase_type', $request->purchase_type);
        }

        if ($request->filled('seller_type')) {
            $query->where('seller_type', $request->seller_type);
        }

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }

        if ($request->filled('salesman_id')) {
            $query->where('salesman_id', $request->salesman_id);
        }

        if ($request->filled('customer_id')) {
            $query->where('customer_id', $request->customer_id);
        }

        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->supplier_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $usedPurchases = $this->sanitizeBuyingPriceForUser($query->get(), $request->user());

        return response()->json([
            'success' => true,
            'message' => 'Used purchases loaded successfully.',
            'data' => $usedPurchases,
        ]);
    }

    public function store(Request $request)
    {
        $this->rejectForbiddenSellerIdentityPayload($request);
        $validated = $request->validate([
            'purchase_type' => ['required', Rule::in(['used', 'pre_owned'])],
            'seller_type' => ['required', Rule::in(['customer', 'supplier'])],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'supplier_id' => ['nullable', 'exists:suppliers,id'],
            'branch_id' => ['required', 'exists:branches,id'],
            'salesman_id' => ['required', 'exists:users,id'],

            'customer_name' => ['required', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:50'],

            'product_name' => ['required', 'string', 'max:255'],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'brand' => ['nullable', 'string', 'max:255'],
            'model' => ['nullable', 'string', 'max:255'],

            'imei_1' => ['nullable', 'string', 'max:100'],
            'imei_2' => ['nullable', 'string', 'max:100'],
            'battery_health' => ['nullable', 'integer', 'min:0', 'max:100'],

            'purchase_price' => ['required', 'numeric', 'min:0'],
            'ready_sale_price' => ['nullable', 'numeric', 'min:0'],

            'condition' => ['required', 'string', 'max:100'],
            'notes' => ['nullable', 'string'],
            'status' => ['nullable', 'string', 'max:100'],

            'product_images' => ['nullable', 'array', 'max:5'],
            'product_images.*' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        if (!empty($validated['brand_id'])) {
            $brand = Brand::find($validated['brand_id']);
            $validated['brand'] = $brand?->name;
        }

        $validated = $this->resolveSellerData($validated, $request);

        unset(
            $validated['nid_photo'],
            $validated['customer_product_photo'],
            $validated['product_images']
        );

        $productImagePaths = $this->storeProductImages($request);

        if (count($productImagePaths) > 5) {
            $this->deleteProductImagesIfExist($productImagePaths);

            return response()->json([
                'success' => false,
                'message' => 'Maximum 5 product images allowed.',
            ], 422);
        }


        if (count($productImagePaths) > 0) {
            $validated['product_image_paths'] = $productImagePaths;
        }

        $validated['created_by'] = $request->user()?->id;
        $validated['status'] = 'awaiting_inspection';

        $this->ensureImeiNotInStock($validated['imei_1'] ?? null, $validated['imei_2'] ?? null, $productImagePaths);

        $usedPurchase = DB::transaction(function () use ($validated, $request) {
            $purchase = UsedPurchase::create($validated);
            $device = $this->createInspectionDeviceUnit($purchase, $request->user()?->id);

            if (Schema::hasColumn('used_purchases', 'ready_device_unit_id')) {
                $purchase->forceFill(['ready_device_unit_id' => $device->id])->save();
            }

            return $purchase;
        });

        $this->loadRelations($usedPurchase);

        return response()->json([
            'success' => true,
            'message' => 'Used purchase created and placed in Device Stock as Awaiting Inspection.',
            'data' => $this->sanitizeBuyingPriceForUser($usedPurchase, $request->user()),
        ], 201);
    }

    public function show(Request $request, UsedPurchase $usedPurchase)
    {
        $this->loadRelations($usedPurchase);

        return response()->json([
            'success' => true,
            'message' => 'Used purchase loaded successfully.',
            'data' => $this->sanitizeBuyingPriceForUser($usedPurchase, $request->user()),
        ]);
    }

    public function update(Request $request, UsedPurchase $usedPurchase)
    {
        $this->rejectForbiddenSellerIdentityPayload($request);
        $validated = $request->validate([
            'purchase_type' => ['required', Rule::in(['used', 'pre_owned'])],
            'seller_type' => ['required', Rule::in(['customer', 'supplier'])],
            'customer_id' => ['nullable', 'exists:customers,id'],
            'supplier_id' => ['nullable', 'exists:suppliers,id'],
            'branch_id' => ['required', 'exists:branches,id'],
            'salesman_id' => ['required', 'exists:users,id'],

            'customer_name' => ['required', 'string', 'max:255'],
            'customer_phone' => ['nullable', 'string', 'max:50'],

            'product_name' => ['required', 'string', 'max:255'],
            'brand_id' => ['nullable', 'exists:brands,id'],
            'brand' => ['nullable', 'string', 'max:255'],
            'model' => ['nullable', 'string', 'max:255'],

            'imei_1' => ['nullable', 'string', 'max:100'],
            'imei_2' => ['nullable', 'string', 'max:100'],
            'battery_health' => ['nullable', 'integer', 'min:0', 'max:100'],

            'purchase_price' => ['required', 'numeric', 'min:0'],
            'ready_sale_price' => ['nullable', 'numeric', 'min:0'],

            'condition' => ['required', 'string', 'max:100'],
            'notes' => ['nullable', 'string'],
            'status' => ['nullable', 'string', 'max:100'],

            'product_images' => ['nullable', 'array', 'max:5'],
            'product_images.*' => ['nullable', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],

            'keep_product_image_paths' => ['nullable'],
        ]);

        if (!empty($validated['brand_id'])) {
            $brand = Brand::find($validated['brand_id']);
            $validated['brand'] = $brand?->name;
        }

        $validated = $this->resolveSellerData($validated, $request);

        unset(
            $validated['nid_photo'],
            $validated['customer_product_photo'],
            $validated['product_images'],
            $validated['keep_product_image_paths'],
            $validated['delete_nid_photo'],
            $validated['delete_customer_product_photo']
        );

        $oldProductImagePaths = is_array($usedPurchase->product_image_paths)
            ? $usedPurchase->product_image_paths
            : [];

        $keepProductImagePaths = $this->getKeepProductImagePaths($request);

        $newProductImagePaths = $this->storeProductImages($request);

        $finalProductImagePaths = array_values(array_filter(array_merge(
            $keepProductImagePaths,
            $newProductImagePaths
        )));

        if (count($finalProductImagePaths) > 5) {
            $this->deleteProductImagesIfExist($newProductImagePaths);

            return response()->json([
                'success' => false,
                'message' => 'Maximum 5 product images allowed.',
            ], 422);
        }

        $deletedOldImages = array_diff($oldProductImagePaths, $keepProductImagePaths);
        $this->deleteProductImagesIfExist($deletedOldImages);

        $validated['product_image_paths'] = $finalProductImagePaths;

        $usedPurchase->update($validated);

        if (Schema::hasTable('device_units') && Schema::hasColumn('device_units', 'selling_price')) {
            $device = DeviceUnit::query()
                ->where('used_purchase_id', $usedPurchase->id)
                ->where('status', '!=', 'sold')
                ->first();

            if ($device) {
                $device->forceFill([
                    'selling_price' => max(0, (float) ($usedPurchase->ready_sale_price ?? 0)),
                    'updated_by' => $request->user()?->id,
                ])->save();
            }
        }

        $this->loadRelations($usedPurchase);

        return response()->json([
            'success' => true,
            'message' => 'Used purchase updated successfully.',
            'data' => $this->sanitizeBuyingPriceForUser($usedPurchase, $request->user()),
        ]);
    }

    public function salePreparation(Request $request, UsedPurchase $usedPurchase, DeviceSalePreparationService $preparation)
    {
        if ($usedPurchase->status === 'sold') {
            return response()->json(['success' => false, 'message' => __('messages.sale_prep.purchase_sold')], 422);
        }

        // Purchases saved before device units existed get their one device record here.
        $device = DB::transaction(fn () => $preparation->deviceForPurchase($usedPurchase, $request->user()?->id, create: true));

        return response()->json([
            'success' => true,
            'data' => $preparation->preparation($request, $device),
        ]);
    }

    public function markReadyForSale(Request $request, UsedPurchase $usedPurchase, DeviceSalePreparationService $preparation)
    {
        if ($usedPurchase->status === 'sold') {
            return response()->json(['success' => false, 'message' => __('messages.sale_prep.purchase_sold')], 422);
        }

        $device = DB::transaction(fn () => $preparation->deviceForPurchase($usedPurchase, $request->user()?->id, create: true));
        $result = $preparation->markReady($request, $device);

        return response()->json([
            'success' => true,
            'message' => __('messages.sale_prep.ready_done'),
            'data' => $usedPurchase->fresh()->load(['readyProduct', 'branch', 'brandInfo']),
            'links' => collect($result)->except('device')->all(),
        ]);
    }

    public function destroy(UsedPurchase $usedPurchase)
    {
        return DB::transaction(function () use ($usedPurchase) {
            $device = Schema::hasTable('device_units')
                ? DeviceUnit::query()->where('used_purchase_id', $usedPurchase->id)->first()
                : null;

            if ($device && strtolower((string) $device->status) === 'sold') {
                return response()->json([
                    'success' => false,
                    'message' => 'Sold physical device cannot be deleted from Used Purchase. Keep its Device History and use return/correction workflow.',
                ], 422);
            }

            if ($device) {
                $device->forceFill([
                    'status' => 'inactive',
                    'saleable' => false,
                    'website_published' => false,
                    'note' => trim(((string) $device->note) . "\nUsed Purchase deleted; device retained as inactive for audit history."),
                    'updated_by' => auth()->id(),
                ])->save();
            }

            $this->deleteFileIfExists($usedPurchase->nid_photo_path);
            $this->deleteFileIfExists($usedPurchase->customer_product_photo_path);
            $this->deleteProductImagesIfExist($usedPurchase->product_image_paths);
            $usedPurchase->delete();

            return response()->json([
                'success' => true,
                'message' => 'Used purchase deleted. Linked physical device was retained as Inactive with history.',
            ]);
        });
    }

    /** One physical phone has one live Device Unit: a phone still in stock cannot be bought in again. */
    private function ensureImeiNotInStock(?string $imei1, ?string $imei2, array $uploadedPaths = []): void
    {
        $identifiers = collect([$imei1, $imei2])->map(fn ($value) => trim((string) $value))->filter()->unique()->values();
        if ($identifiers->isEmpty() || ! Schema::hasTable('device_units')) {
            return;
        }

        $duplicate = DeviceUnit::query()
            ->whereNull('deleted_at')
            ->whereIn('status', ['awaiting_inspection', 'available', 'in_stock', 'active', 'reserved', 'booked', 'ready_for_sale'])
            ->where(function ($query) use ($identifiers) {
                $query->whereIn('imei_1', $identifiers)->orWhereIn('imei_2', $identifiers);
            })
            ->first();

        if ($duplicate) {
            $this->deleteProductImagesIfExist($uploadedPaths);

            throw \Illuminate\Validation\ValidationException::withMessages([
                'imei_1' => __('messages.sale_prep.imei_in_stock', ['sku' => $duplicate->sku ?: '#' . $duplicate->id]),
            ]);
        }
    }

    private function createInspectionDeviceUnit(UsedPurchase $purchase, ?int $userId): DeviceUnit
    {
        if (! Schema::hasTable('device_units')) {
            abort(503, 'Device Stock is not ready. Run the approved database migration before creating Used/Pre-Owned purchases.');
        }

        $sku = $this->makeUniqueDeviceSku();
        $condition = $purchase->purchase_type === 'pre_owned' ? 'pre_owned' : 'used';
        $payload = [
            'used_purchase_id' => $purchase->id,
            'supplier_id' => $purchase->seller_type === 'supplier' ? $purchase->supplier_id : null,
            'branch_id' => $purchase->branch_id,
            'product_name' => $purchase->product_name,
            'model_number' => $purchase->model ?: null,
            'sku' => $sku,
            'imei_1' => $purchase->imei_1,
            'imei_2' => $purchase->imei_2,
            'barcode' => $sku,
            'barcode_source' => 'auto',
            'battery_health' => $purchase->battery_health,
            'purchase_cost' => $purchase->purchase_price,
            'selling_price' => max(0, (float) ($purchase->ready_sale_price ?? 0)),
            'status' => 'awaiting_inspection',
            'condition' => $condition,
            'saleable' => false,
            'website_published' => false,
            'service_status' => 'no_service',
            'note' => 'Created automatically from Used Purchase #' . $purchase->id . ' and awaiting inspection.',
            'created_by' => $userId,
            'updated_by' => $userId,
        ];

        $columns = array_flip(Schema::getColumnListing('device_units'));
        return DeviceUnit::create(array_intersect_key($payload, $columns));
    }

    private function makeUniqueDeviceSku(): string
    {
        do {
            $sku = 'NST-' . random_int(100000000, 999999999);
        } while (
            Product::query()->where('sku', $sku)->exists() ||
            DeviceUnit::withTrashed()->where(function ($q) use ($sku) {
                $q->where('sku', $sku)->orWhere('barcode', $sku);
            })->exists()
        );

        return $sku;
    }
}
