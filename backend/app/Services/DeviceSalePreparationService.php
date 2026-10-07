<?php

namespace App\Services;

use App\Models\Brand;
use App\Models\BranchStock;
use App\Models\Category;
use App\Models\DeviceUnit;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\StockMovement;
use App\Models\UsedPurchase;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Prepare For Sale for one physical device.
 *
 * The existing Device Unit stays the master record of the phone. This service links it to a
 * catalog Product and Variant (reusing matching ones, creating them only when none exists),
 * saves the sale/catalog details and moves the device to Ready For Sale in one transaction.
 * It never creates a second Device Unit and never touches purchase cost or purchase history.
 */
class DeviceSalePreparationService
{
    public const PREPARABLE_STATUSES = ['awaiting_inspection', 'ready_for_sale'];
    public const ACTIVE_STATUSES = ['available', 'in_stock', 'active', 'reserved', 'ready_for_sale'];
    private const ACTIVATION_STATUSES = ['inactive', 'not_activated', 'boxed', 'active', 'activated', 'open_box'];

    public function __construct(
        private readonly ProductContentService $content,
        private readonly AccessControlService $accessControl,
    ) {
    }

    /** Everything the Prepare For Sale form needs, pre-filled from the device, its purchase and a matching catalog product. */
    public function preparation(Request $request, DeviceUnit $device): array
    {
        $device->loadMissing(['branch:id,name,code', 'product', 'variant']);
        $purchase = $this->usedPurchaseFor($device);
        $condition = $this->conditionFor($device, $purchase);
        $brand = $this->brandFor($device, $purchase);
        $productName = $device->product?->name ?: ($purchase?->product_name ?: $device->product_name);

        $linkedProduct = $this->linkedProduct($device, $purchase);
        $matchedProduct = $linkedProduct ?: $this->findMatchingProduct($productName, $purchase?->model ?: $device->model_number, $brand, $condition);
        $productSource = $linkedProduct ? 'linked' : ($matchedProduct ? 'matched' : 'none');
        if ($request->query('product_mode') === 'new') {
            $matchedProduct = null;
            $productSource = 'none';
        } elseif ($request->filled('product_id') && (int) $request->query('product_id') !== (int) $matchedProduct?->id) {
            $chosen = Product::query()->find((int) $request->query('product_id'));
            if ($chosen && $this->productFitsCondition($chosen, $condition)) {
                $matchedProduct = $chosen;
                $productSource = 'selected';
            }
        }
        $variantAttributes = $this->variantAttributes($request, $device, $purchase, prefill: true);
        $linkedVariant = $this->linkedVariant($device, $purchase, $matchedProduct);
        $matchedVariant = $linkedVariant ?: ($matchedProduct ? $this->findMatchingVariant($matchedProduct, $variantAttributes, $condition) : null);

        $canSeeCost = $this->accessControl->canViewPurchasePrice($request->user());

        return [
            'device' => [
                'id' => $device->id,
                'status' => $device->status,
                'product_name' => $productName,
                'brand_id' => $brand?->id,
                'brand' => $brand?->name ?: ($purchase?->brand ?: $device->product?->brand),
                'model' => $purchase?->model ?: $device->model_number,
                'condition' => $condition,
                'sku' => $device->sku,
                'barcode' => $device->barcode,
                'imei_1' => $device->imei_1,
                'imei_2' => $device->imei_2,
                'battery_health' => $device->battery_health ?? $purchase?->battery_health,
                'purchase_cost' => $canSeeCost ? $device->purchase_cost : null,
                'branch_id' => $device->branch_id,
                'branch_name' => $device->branch?->name,
                'is_ready' => strtolower((string) $device->status) === 'ready_for_sale' && (bool) $device->saleable,
                'website_published' => (bool) $device->website_published,
                'has_sale_history' => $this->hasSaleHistory($device),
                'note' => $device->note,
            ],
            'purchase' => $purchase ? [
                'id' => $purchase->id,
                'purchase_type' => $purchase->purchase_type,
                'seller_type' => $purchase->seller_type,
                'seller_name' => $purchase->customer_name,
                'seller_phone' => $purchase->customer_phone,
                'condition' => $purchase->condition,
                'notes' => $purchase->notes,
                'created_at' => optional($purchase->created_at)->toDateTimeString(),
                'image_paths' => array_values(array_filter((array) ($purchase->product_image_paths ?? []))),
                'image_urls' => array_values(array_filter((array) ($purchase->product_image_urls ?? []))),
            ] : null,
            'form' => array_merge(
                $this->saleFormValues($device, $purchase, $matchedProduct, $matchedVariant, $variantAttributes),
                $this->content->formValues($matchedProduct),
                [
                    'product_mode' => $matchedProduct ? 'existing' : 'new',
                    'product_id' => $matchedProduct?->id,
                    'product_name' => $matchedProduct?->name ?: $productName,
                    'model_number' => $matchedVariant?->model_number ?: ($purchase?->model_number ?: ($purchase?->model ?: $device->model_number)),
                    'category_id' => $matchedProduct?->category_id ?: $purchase?->category_id,
                ]
            ),
            'match' => [
                'product' => $matchedProduct ? $this->productSummary($matchedProduct) : null,
                'product_source' => $productSource,
                'variant' => $matchedVariant ? $this->variantSummary($matchedVariant) : null,
                'variant_source' => $linkedVariant ? 'linked' : ($matchedVariant ? 'matched' : 'none'),
                'candidates' => $this->candidateProducts($brand, $condition, $matchedProduct?->id),
            ],
            'options' => [
                'categories' => Category::query()->select('id', 'name')->orderBy('name')->get(),
            ],
        ];
    }

    /** Save & Mark Ready For Sale. Atomic: every write happens inside one transaction. */
    public function markReady(Request $request, DeviceUnit $device): array
    {
        if ($request->filled('selling_price') && ! $request->filled('sale_price')) {
            $request->merge(['sale_price' => $request->input('selling_price')]);
        }

        $validated = $request->validate(array_merge([
            'product_mode' => ['nullable', Rule::in(['auto', 'existing', 'new'])],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'product_name' => ['nullable', 'string', 'max:255'],
            'category_id' => ['nullable', 'exists:categories,id'],
            'model_number' => ['nullable', 'string', 'max:255'],
            'sale_price' => ['required', 'numeric', 'min:0.01'],
            'market_price' => ['nullable', 'numeric', 'min:0'],
            'color_name' => ['nullable', 'string', 'max:120'],
            'region' => ['nullable', 'string', 'max:120'],
            'sim_network' => ['nullable', 'string', 'max:120'],
            'ram' => ['nullable', 'string', 'max:120'],
            'storage' => ['nullable', 'string', 'max:120'],
            'battery_health' => ['nullable', 'integer', 'min:0', 'max:100'],
            'activation_status' => ['nullable', Rule::in(self::ACTIVATION_STATUSES)],
            'physical_condition' => ['nullable', 'string', 'max:120'],
            'condition_grade' => ['nullable', 'string', 'max:120'],
            'box_included' => ['nullable', 'boolean'],
            'official_warranty' => ['nullable', 'string', 'max:255'],
            'shop_warranty' => ['nullable', 'string', 'max:255'],
            'warranty_duration' => ['nullable', 'string', 'max:120'],
            'warranty_notes' => ['nullable', 'string', 'max:2000'],
            'whats_in_box' => ['nullable', 'string', 'max:3000'],
            'minimum_booking_type' => ['nullable', Rule::in(['percentage', 'fixed'])],
            'minimum_booking_value' => ['nullable', 'numeric', 'min:0'],
            'emi_available' => ['nullable', 'boolean'],
            'allow_preorder' => ['nullable', 'boolean'],
            'website_published' => ['nullable', 'boolean'],
            'show_branch' => ['nullable', 'boolean'],
            'use_existing_images' => ['nullable', 'boolean'],
            'variant_images' => ['nullable', 'array', 'max:5'],
            'variant_images.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'inspection_note' => ['nullable', 'string', 'max:2000'],
        ], ProductContentService::validationRules()));

        $storedImages = $this->storeUploadedImages($request);

        try {
            return DB::transaction(function () use ($request, $device, $validated, $storedImages) {
                /** @var DeviceUnit $device */
                $device = DeviceUnit::query()->whereKey($device->id)->lockForUpdate()->firstOrFail();
                $status = strtolower((string) $device->status);

                if (! in_array($status, self::PREPARABLE_STATUSES, true)) {
                    throw ValidationException::withMessages(['status' => __('messages.sale_prep.status_locked', ['status' => str_replace('_', ' ', $status ?: '-')])]);
                }
                if (! $device->branch_id) {
                    throw ValidationException::withMessages(['branch_id' => __('messages.sale_prep.branch_required')]);
                }

                $this->ensureImeiIsFree($device);

                $purchase = $this->usedPurchaseFor($device, lock: true);
                $condition = $this->conditionFor($device, $purchase);
                $brand = $this->brandFor($device, $purchase);
                $wasSaleable = $status === 'ready_for_sale' && (bool) $device->saleable;
                $previousVariantId = $device->product_variant_id ? (int) $device->product_variant_id : null;
                $previousProductId = $device->product_id ? (int) $device->product_id : null;
                $websitePublished = $request->has('website_published') ? $request->boolean('website_published') : (bool) $device->website_published;

                [$product, $productCreated] = $this->resolveProduct($request, $validated, $device, $purchase, $brand, $condition);
                $this->saveProduct($request, $validated, $product, $productCreated, $brand, $condition, $websitePublished, $purchase);

                $attributes = $this->variantAttributes($request, $device, $purchase);
                $variant = $this->resolveVariant($product, $device, $purchase, $attributes, $condition);
                $variant = $this->saveVariant($request, $validated, $product, $variant, $device, $purchase, $attributes, $condition);

                $this->saveDevice($request, $validated, $device, $product, $variant, $attributes, $condition, $websitePublished);
                $this->syncImages($request, $purchase, $product, $variant, $storedImages);

                $this->syncVariantInventory($variant);
                $this->syncProductStock($product);
                if ($previousVariantId && $previousVariantId !== (int) $variant->id) {
                    $previousVariant = ProductVariant::find($previousVariantId);
                    if ($previousVariant) {
                        $this->syncVariantInventory($previousVariant);
                    }
                }
                if ($previousProductId && $previousProductId !== (int) $product->id && ($previousProduct = Product::find($previousProductId))) {
                    $this->syncProductStock($previousProduct);
                }

                if (! $wasSaleable) {
                    $this->recordStockMovement($request, $device, $validated['inspection_note'] ?? null);
                }

                if ($purchase) {
                    $this->updatePurchase($request, $validated, $purchase, $product, $variant, $device, $attributes, $websitePublished);
                }

                $this->content->syncQuickSpecificationsToGroups($product->fresh());
                $this->content->storeProductVideo($request, $product);

                return [
                    'device' => $device->fresh(['product', 'variant', 'branch']),
                    'product_id' => $product->id,
                    'variant_id' => $variant->id,
                    'device_unit_id' => $device->id,
                    'product_created' => $productCreated,
                    'variant_created' => $variant->wasRecentlyCreated,
                    'website_published' => $websitePublished,
                ];
            });
        } catch (\Throwable $exception) {
            foreach ($storedImages as $path) {
                Storage::disk('public')->delete($path);
            }
            throw $exception;
        }
    }

    /** Used Purchase rows made before Device Stock existed get their one Device Unit here (never a second one). */
    public function deviceForPurchase(UsedPurchase $purchase, ?int $userId, bool $create = false): ?DeviceUnit
    {
        $device = null;
        if ($purchase->ready_device_unit_id) {
            $device = DeviceUnit::withTrashed()->find($purchase->ready_device_unit_id);
        }
        if (! $device) {
            $device = DeviceUnit::withTrashed()->where('used_purchase_id', $purchase->id)->orderBy('id')->first();
        }
        if ($device || ! $create) {
            if ($device?->trashed() && $create) {
                $device->restore();
            }
            return $device;
        }

        $sku = $this->uniqueIdentifier();
        $columns = array_flip(Schema::getColumnListing('device_units'));
        $device = DeviceUnit::create(array_intersect_key([
            'used_purchase_id' => $purchase->id,
            'supplier_id' => $purchase->seller_type === 'supplier' ? $purchase->supplier_id : null,
            'branch_id' => $purchase->branch_id,
            'product_name' => $purchase->product_name,
            'model_number' => $purchase->model ?: null,
            'sku' => $sku,
            'barcode' => $sku,
            'barcode_source' => 'auto',
            'imei_1' => $purchase->imei_1,
            'imei_2' => $purchase->imei_2,
            'battery_health' => $purchase->battery_health,
            'purchase_cost' => $purchase->purchase_price,
            'selling_price' => 0,
            'status' => 'awaiting_inspection',
            'condition' => $purchase->purchase_type === 'pre_owned' ? 'pre_owned' : 'used',
            'saleable' => false,
            'website_published' => false,
            'service_status' => 'no_service',
            'note' => 'Created from Used Purchase #' . $purchase->id . ' for Prepare For Sale.',
            'created_by' => $userId,
            'updated_by' => $userId,
        ], $columns));

        if (Schema::hasColumn('used_purchases', 'ready_device_unit_id')) {
            $purchase->forceFill(['ready_device_unit_id' => $device->id])->save();
        }

        return $device;
    }

    // ------------------------------------------------------------------ matching

    /**
     * Product reuse rule: a catalog product with the same condition (used / pre-owned), the same brand
     * and the same model name. New products are never reused for a used device.
     */
    public function findMatchingProduct(?string $name, ?string $model, ?Brand $brand, string $condition): ?Product
    {
        $name = $this->normalize($name);
        $model = $this->normalize($model);
        if ($name === '' && $model === '') {
            return null;
        }

        $candidates = Product::query()
            ->where(function ($query) use ($condition) {
                $query->where('condition', $condition)->orWhere('product_type', $condition);
            })
            ->when($brand, fn ($query) => $query->where(function ($inner) use ($brand) {
                $inner->where('brand_id', $brand->id)->orWhere(function ($text) use ($brand) {
                    $text->whereNull('brand_id')->where('brand', $brand->name);
                });
            }))
            ->when(Schema::hasColumn('products', 'status'), fn ($query) => $query->where(function ($inner) {
                $inner->whereNull('status')->orWhereNotIn('status', ['deleted', 'archived']);
            }))
            ->orderByDesc('updated_at')
            ->limit(200)
            ->get();

        return $candidates->first(fn (Product $product) => $name !== '' && $this->normalize($product->name) === $name)
            ?: $candidates->first(fn (Product $product) => $model !== '' && $this->normalize($product->model) === $model);
    }

    /** Variant reuse rule: same product, same condition and same colour / storage / RAM / region / SIM network. */
    public function findMatchingVariant(Product $product, array $attributes, string $condition): ?ProductVariant
    {
        $key = $this->variantKey($attributes);

        return ProductVariant::query()
            ->where('product_id', $product->id)
            ->get()
            ->first(function (ProductVariant $variant) use ($key, $condition) {
                $variantCondition = strtolower((string) ($variant->condition ?: $variant->product_type ?: $condition));
                return $variantCondition === $condition && $this->variantKey($variant->toArray()) === $key;
            });
    }

    private function variantKey(array $values): string
    {
        $ram = $this->normalize($values['ram'] ?? '');
        if (in_array($ram, ['initial/unknown', 'default', 'unknown'], true)) {
            $ram = '';
        }

        return implode('|', [
            $this->normalize($values['color_name'] ?? ''),
            $this->normalize($values['storage'] ?? ''),
            $ram,
            $this->normalize($values['region'] ?? ''),
            $this->normalize($values['sim_network'] ?? ''),
        ]);
    }

    private function normalize(?string $value): string
    {
        return trim(preg_replace('/\s+/', ' ', Str::lower((string) $value)));
    }

    // ------------------------------------------------------------------ resolve

    private function resolveProduct(Request $request, array $validated, DeviceUnit $device, ?UsedPurchase $purchase, ?Brand $brand, string $condition): array
    {
        $mode = $validated['product_mode'] ?? 'auto';
        $linked = $this->linkedProduct($device, $purchase);

        if ($condition === 'new' && $linked) {
            return [Product::query()->whereKey($linked->id)->lockForUpdate()->first(), false];
        }

        if ($mode === 'existing' && ! empty($validated['product_id'])) {
            $product = Product::query()->whereKey($validated['product_id'])->lockForUpdate()->firstOrFail();
            if ((int) $product->id !== (int) $linked?->id && ! $this->productFitsCondition($product, $condition)) {
                throw ValidationException::withMessages(['product_id' => __('messages.sale_prep.new_product_not_allowed')]);
            }
            return [$product, false];
        }

        if ($mode !== 'new') {
            if ($linked) {
                return [Product::query()->whereKey($linked->id)->lockForUpdate()->first(), false];
            }
            $name = ($validated['product_name'] ?? null) ?: ($purchase?->product_name ?: $device->product_name);
            $match = $this->findMatchingProduct($name, $purchase?->model ?: $device->model_number, $brand, $condition);
            if ($match) {
                return [Product::query()->whereKey($match->id)->lockForUpdate()->first(), false];
            }
        }

        $name = trim((string) (($validated['product_name'] ?? null) ?: ($purchase?->product_name ?: $device->product_name))) ?: 'Used Device';
        $identifier = $this->uniqueIdentifier();
        $slugSource = trim((string) ($validated['slug'] ?? '')) ?: trim(($brand?->name ? $brand->name . ' ' : '') . $name . ' ' . str_replace('_', ' ', $condition));

        $product = Product::create($this->filterColumns('products', [
            'name' => $name,
            'slug' => $this->content->uniqueSlug($slugSource),
            'sku' => $identifier,
            'barcode' => $identifier,
            'barcode_mode' => 'manual',
            'brand_id' => $brand?->id,
            'brand' => $brand?->name ?: $purchase?->brand,
            'model' => $purchase?->model ?: $device->model_number,
            'condition' => $condition,
            'product_type' => $condition,
            'source_type' => $device->purchase_id && ! $purchase ? 'purchase' : 'used_purchase',
            'purchase_price' => 0,
            'sale_price' => 0,
            'stock_quantity' => 0,
            'low_stock_alert' => 0,
            'status' => 'active',
            'website_published' => false,
        ]));

        return [$product, true];
    }

    private function resolveVariant(Product $product, DeviceUnit $device, ?UsedPurchase $purchase, array $attributes, string $condition): ?ProductVariant
    {
        $linked = $this->linkedVariant($device, $purchase, $product);
        if ($linked && $this->variantKey($linked->toArray()) === $this->variantKey($attributes)) {
            return ProductVariant::query()->whereKey($linked->id)->lockForUpdate()->first();
        }

        $match = $this->findMatchingVariant($product, $attributes, $condition);

        return $match ? ProductVariant::query()->whereKey($match->id)->lockForUpdate()->first() : null;
    }

    private function linkedProduct(DeviceUnit $device, ?UsedPurchase $purchase): ?Product
    {
        $id = $device->product_id ?: $purchase?->ready_product_id;

        return $id ? Product::find($id) : null;
    }

    /** A used device may only join a used / pre-owned / refurbished catalog product. */
    private function productFitsCondition(Product $product, string $condition): bool
    {
        $productCondition = strtolower((string) ($product->condition ?: $product->product_type));

        return $condition === 'new' || in_array($productCondition, ['used', 'pre_owned', 'refurbished'], true);
    }

    private function linkedVariant(DeviceUnit $device, ?UsedPurchase $purchase, ?Product $product): ?ProductVariant
    {
        if (! $product) {
            return null;
        }
        $id = $device->product_variant_id ?: $purchase?->ready_variant_id;

        return $id ? ProductVariant::where('product_id', $product->id)->find($id) : null;
    }

    // ------------------------------------------------------------------ writes

    private function saveProduct(Request $request, array $validated, Product $product, bool $created, ?Brand $brand, string $condition, bool $websitePublished, ?UsedPurchase $purchase): void
    {
        $data = $this->content->attributesFrom($request, $product);

        if ($request->filled('slug') && ! $created) {
            $wanted = Str::slug((string) $request->input('slug'));
            if ($wanted !== '' && $wanted !== $product->slug) {
                if (Product::where('slug', $wanted)->where('id', '!=', $product->id)->exists()) {
                    throw ValidationException::withMessages(['slug' => __('messages.sale_prep.slug_taken')]);
                }
                $this->content->recordSlugRedirect('product', $product->id, $product->slug, $wanted);
                $data['slug'] = $wanted;
            }
        }

        if (! empty($validated['category_id'])) {
            $category = Category::find($validated['category_id']);
            $data['category_id'] = $category?->id;
            $data['category'] = $category?->name;
        }

        if ($brand && ! $product->brand_id) {
            $data['brand_id'] = $brand->id;
            $data['brand'] = $brand->name;
        }

        if (empty($product->meta_title) && empty($data['meta_title'])) {
            $data['meta_title'] = Str::limit(trim(($brand?->name ? $brand->name . ' ' : '') . $product->name . ' Price in Bangladesh'), 60, '');
        }

        foreach (['whats_in_box', 'official_warranty', 'shop_warranty', 'warranty_notes'] as $field) {
            if (array_key_exists($field, $validated) && ($created || filled($validated[$field]))) {
                $data[$field] = $validated[$field];
            }
        }

        $data['minimum_booking_type'] = $validated['minimum_booking_type'] ?? ($product->minimum_booking_type ?: 'percentage');
        $data['minimum_booking_value'] = $this->bookingValue($validated, $product->minimum_booking_value);
        if ($request->has('allow_preorder')) {
            $data['allow_preorder'] = $request->boolean('allow_preorder');
        }
        if ($websitePublished || $created) {
            $data['website_published'] = $websitePublished;
        }
        if ((float) ($product->purchase_price ?? 0) <= 0 && $purchase) {
            $data['purchase_price'] = $purchase->purchase_price;
        }
        $data['status'] = 'active';

        $pageOptions = is_array($data['page_options'] ?? null) ? $data['page_options'] : (is_array($product->page_options) ? $product->page_options : []);
        $pageOptions['product_entry_rule'] = 'used_purchase_ready_sale';
        $pageOptions['show_price_at_zero_stock'] = $pageOptions['show_price_at_zero_stock'] ?? true;
        $pageOptions['website_published'] = (bool) ($data['website_published'] ?? $product->website_published);
        if ($request->has('allow_preorder')) {
            $pageOptions['allow_preorder'] = $request->boolean('allow_preorder');
        }
        if ($request->has('show_branch')) {
            $pageOptions['show_branch'] = $request->boolean('show_branch');
        }
        $data['page_options'] = $pageOptions;

        $product->fill($this->filterColumns('products', $data))->save();
    }

    private function saveVariant(Request $request, array $validated, Product $product, ?ProductVariant $variant, DeviceUnit $device, ?UsedPurchase $purchase, array $attributes, string $condition): ProductVariant
    {
        $activation = $validated['activation_status'] ?? ($variant?->activation_status ?: ($device->activation_status ?: 'active'));
        $identifier = $variant?->sku ?: $this->uniqueIdentifier();
        $name = collect([
            $attributes['color_name'] ?: null,
            $attributes['region'] ?: null,
            $attributes['sim_network'] ?: null,
            in_array(Str::lower((string) $attributes['ram']), ['', 'initial/unknown'], true) ? null : $attributes['ram'],
            $attributes['storage'] ?: null,
            Str::headline($condition),
        ])->filter()->implode(' / ');

        $data = [
            'product_id' => $product->id,
            'branch_id' => $variant?->branch_id ?: $device->branch_id,
            'supplier_id' => $variant?->supplier_id ?: ($purchase?->seller_type === 'supplier' ? $purchase->supplier_id : null),
            'variant_name' => $name ?: 'Used Device',
            'model_number' => ($validated['model_number'] ?? null) ?: ($variant?->model_number ?: ($purchase?->model ?: $device->model_number)),
            'condition' => $condition,
            'product_type' => $condition,
            'sku' => $identifier,
            'barcode_mode' => 'manual',
            'barcode' => $variant?->barcode ?: $identifier,
            'color_name' => $attributes['color_name'] ?: null,
            'region' => $attributes['region'] ?: null,
            'country_region' => $attributes['region'] ?: null,
            'sim_network' => $attributes['sim_network'] ?: null,
            'network_carrier' => $attributes['sim_network'] ?: null,
            'ram' => $attributes['ram'] ?: 'Initial/Unknown',
            'storage' => $attributes['storage'] ?: null,
            'imei_tracking' => true,
            'low_stock_alert' => 0,
            'status' => 'active',
            'device_status' => in_array($activation, ['active', 'activated', 'open_box'], true) ? 'active' : 'inactive',
            'activation_status' => $activation,
            'minimum_booking_type' => $validated['minimum_booking_type'] ?? ($variant?->minimum_booking_type ?: 'percentage'),
            'minimum_booking_value' => $this->bookingValue($validated, $variant?->minimum_booking_value),
            'emi_available' => $request->has('emi_available') ? $request->boolean('emi_available') : ($variant?->emi_available ?? true),
            'allow_preorder' => $request->has('allow_preorder') ? $request->boolean('allow_preorder') : ($variant?->allow_preorder ?? false),
            'stock_state' => 'in_stock',
            'box_included' => $request->has('box_included') ? $request->boolean('box_included') : ($variant?->box_included ?? true),
            'physical_condition' => $validated['physical_condition'] ?? ($variant?->physical_condition),
            'condition_grade' => $validated['condition_grade'] ?? ($variant?->condition_grade),
            'official_warranty' => $validated['official_warranty'] ?? ($variant?->official_warranty),
            'shop_warranty' => $validated['shop_warranty'] ?? ($variant?->shop_warranty),
            'warranty_duration' => $validated['warranty_duration'] ?? ($variant?->warranty_duration),
            'warranty_notes' => $validated['warranty_notes'] ?? ($variant?->warranty_notes),
            'service_status' => $variant?->service_status ?: 'no_service',
            'purchase_reference' => $variant?->purchase_reference ?: ($purchase ? 'USED-' . $purchase->id : null),
            'entry_done_by' => $request->user()?->id,
        ];

        if (! $variant) {
            $data += [
                'purchase_price' => $device->purchase_cost ?? 0,
                'sale_price' => (float) $validated['sale_price'],
                'market_price' => (float) ($validated['market_price'] ?? $validated['sale_price']),
                'regular_price' => (float) ($validated['market_price'] ?? $validated['sale_price']),
                'battery_health' => $this->batteryHealth($validated, $device, $purchase, $activation),
                'stock_quantity' => 0,
                'opening_stock_quantity' => 1,
            ];
            $variant = ProductVariant::create($this->filterColumns('product_variants', $data));
        } else {
            $variant->fill($this->filterColumns('product_variants', $data))->save();
        }

        return $variant;
    }

    private function saveDevice(Request $request, array $validated, DeviceUnit $device, Product $product, ProductVariant $variant, array $attributes, string $condition, bool $websitePublished): void
    {
        $activation = $validated['activation_status'] ?? ($device->activation_status ?: 'active');
        $note = trim((string) ($validated['inspection_note'] ?? ''));

        $device->forceFill($this->filterColumns('device_units', [
            'product_id' => $product->id,
            'product_variant_id' => $variant->id,
            'product_name' => $product->name,
            'model_number' => $variant->model_number ?: $device->model_number,
            'color_name' => $attributes['color_name'] ?: null,
            'region' => $attributes['region'] ?: null,
            'country_region' => $attributes['region'] ?: null,
            'sim_network' => $attributes['sim_network'] ?: null,
            'network_carrier' => $attributes['sim_network'] ?: null,
            'ram' => $attributes['ram'] ?: 'Initial/Unknown',
            'storage' => $attributes['storage'] ?: null,
            'battery_health' => $this->batteryHealth($validated, $device, null, $activation),
            'condition' => $condition,
            'activation_status' => $activation,
            'selling_price' => round((float) $validated['sale_price'], 2),
            'market_price' => array_key_exists('market_price', $validated) && $validated['market_price'] !== null ? round((float) $validated['market_price'], 2) : $device->market_price,
            'warranty_type' => ($validated['official_warranty'] ?? null) ?: (($validated['shop_warranty'] ?? null) ?: $device->warranty_type),
            'warranty_terms' => $validated['warranty_notes'] ?? $device->warranty_terms,
            'status' => 'ready_for_sale',
            'saleable' => true,
            'website_published' => $websitePublished,
            'note' => $note !== '' ? trim(((string) $device->note) . "\nInspection: " . $note) : $device->note,
            'updated_by' => $request->user()?->id,
        ]))->save();
    }

    private function updatePurchase(Request $request, array $validated, UsedPurchase $purchase, Product $product, ProductVariant $variant, DeviceUnit $device, array $attributes, bool $websitePublished): void
    {
        $purchase->forceFill($this->filterColumns('used_purchases', [
            'status' => 'ready_for_sale',
            'ready_product_id' => $product->id,
            'ready_variant_id' => $variant->id,
            'ready_device_unit_id' => $device->id,
            'ready_sale_price' => round((float) $validated['sale_price'], 2),
            'category_id' => $product->category_id,
            'model_number' => $variant->model_number,
            'color_name' => $attributes['color_name'] ?: null,
            'region' => $attributes['region'] ?: null,
            'sim_network' => $attributes['sim_network'] ?: null,
            'ram' => $attributes['ram'] ?: null,
            'storage' => $attributes['storage'] ?: null,
            'activation_status' => $variant->activation_status,
            'box_included' => (bool) $variant->box_included,
            'physical_condition' => $variant->physical_condition,
            'condition_grade' => $variant->condition_grade,
            'market_price' => $validated['market_price'] ?? $purchase->market_price,
            'minimum_booking_type' => $variant->minimum_booking_type,
            'minimum_booking_value' => $variant->minimum_booking_value,
            'emi_available' => (bool) $variant->emi_available,
            'allow_preorder' => (bool) $variant->allow_preorder,
            'website_published' => $websitePublished,
            'official_warranty' => $variant->official_warranty,
            'shop_warranty' => $variant->shop_warranty,
            'warranty_duration' => $variant->warranty_duration,
            'warranty_notes' => $variant->warranty_notes,
            'whats_in_box' => $validated['whats_in_box'] ?? $purchase->whats_in_box,
            'converted_to_stock_at' => $purchase->converted_to_stock_at ?: now(),
            'converted_by' => $purchase->converted_by ?: $request->user()?->id,
        ]))->save();
    }

    /** Stock is recounted from the physical devices, so running the action twice never adds stock twice. */
    public function syncVariantInventory(ProductVariant $variant): void
    {
        $active = DeviceUnit::query()
            ->where('product_id', $variant->product_id)
            ->where('product_variant_id', $variant->id)
            ->whereNull('deleted_at')
            ->whereIn('status', self::ACTIVE_STATUSES);

        $count = (clone $active)->count();
        $minimumSalePrice = (clone $active)->where('selling_price', '>', 0)->min('selling_price');
        $maximumMarketPrice = (clone $active)->where('market_price', '>', 0)->max('market_price');

        $updates = [
            'stock_quantity' => $count,
            'opening_stock_quantity' => max((int) $variant->opening_stock_quantity, $count),
        ];
        if ($minimumSalePrice !== null && (float) $minimumSalePrice > 0) {
            $updates['sale_price'] = $minimumSalePrice;
        }
        if ($maximumMarketPrice !== null && (float) $maximumMarketPrice > 0) {
            $updates['market_price'] = $maximumMarketPrice;
            $updates['regular_price'] = $maximumMarketPrice;
        }

        $units = DeviceUnit::query()->where('product_variant_id', $variant->id)->whereNull('deleted_at')->count();
        if ($units > 1) {
            $updates['imei_1'] = null;
            $updates['imei_2'] = null;
        } elseif ($units === 1) {
            $only = DeviceUnit::query()->where('product_variant_id', $variant->id)->whereNull('deleted_at')->first();
            $updates['imei_1'] = $only?->imei_1;
            $updates['imei_2'] = $only?->imei_2;
        }

        $variant->forceFill($this->filterColumns('product_variants', $updates))->save();

        $branchIds = DeviceUnit::query()
            ->where('product_variant_id', $variant->id)
            ->whereNull('deleted_at')
            ->pluck('branch_id')
            ->merge(BranchStock::where('product_id', $variant->product_id)->where('product_variant_id', $variant->id)->pluck('branch_id'))
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique();

        foreach ($branchIds as $branchId) {
            $quantity = (clone $active)->where('branch_id', $branchId)->count();
            $stock = BranchStock::query()
                ->where('branch_id', $branchId)
                ->where('product_id', $variant->product_id)
                ->where('product_variant_id', $variant->id)
                ->lockForUpdate()
                ->first();

            if ($stock) {
                $stock->forceFill(['quantity' => $quantity])->save();
                continue;
            }

            BranchStock::create($this->filterColumns('branch_stocks', [
                'branch_id' => $branchId,
                'product_id' => $variant->product_id,
                'product_variant_id' => $variant->id,
                'quantity' => $quantity,
                'reserved_quantity' => 0,
                'alert_quantity' => 0,
                'low_stock_alert' => 0,
                'status' => 'active',
            ]));
        }
    }

    public function syncProductStock(Product $product): void
    {
        $product->forceFill([
            'stock_quantity' => (int) ProductVariant::where('product_id', $product->id)->sum('stock_quantity'),
        ])->save();
    }

    private function recordStockMovement(Request $request, DeviceUnit $device, ?string $note): void
    {
        if (! Schema::hasTable('stock_movements')) {
            return;
        }

        $branchQuantity = (int) BranchStock::query()
            ->where('branch_id', $device->branch_id)
            ->where('product_id', $device->product_id)
            ->where('product_variant_id', $device->product_variant_id)
            ->value('quantity');

        do {
            $number = 'SM-RDY-' . now()->format('ymd') . '-' . strtoupper(Str::random(7));
        } while (StockMovement::where('movement_no', $number)->exists());

        StockMovement::create($this->filterColumns('stock_movements', [
            'movement_no' => $number,
            'branch_id' => $device->branch_id,
            'product_id' => $device->product_id,
            'product_variant_id' => $device->product_variant_id,
            'user_id' => $request->user()?->id,
            'type' => $this->hasSaleHistory($device) ? 'return_in' : 'purchase',
            'quantity_change' => 1,
            'quantity_before' => max(0, $branchQuantity - 1),
            'quantity_after' => $branchQuantity,
            'reference_type' => 'device_unit_ready_for_sale',
            'reference_id' => $device->id,
            'note' => trim((string) $note) ?: null,
            'movement_at' => now(),
        ]));
    }

    // ------------------------------------------------------------------ images

    private function storeUploadedImages(Request $request): array
    {
        $paths = [];
        foreach ((array) $request->file('variant_images', []) as $file) {
            if ($file) {
                $paths[] = $file->store('used-purchases/variant-images', 'public');
            }
        }

        return $paths;
    }

    /** Device images are added to the variant gallery. Images of other devices on a shared variant are never removed. */
    private function syncImages(Request $request, ?UsedPurchase $purchase, Product $product, ProductVariant $variant, array $newPaths): void
    {
        $useExisting = $request->has('use_existing_images') ? $request->boolean('use_existing_images') : true;
        $existing = $useExisting && $purchase ? array_values(array_filter((array) ($purchase->product_image_paths ?? []))) : [];
        $paths = collect(array_merge($existing, $newPaths))->filter()->unique()->values();

        if ($paths->count() > 5) {
            throw ValidationException::withMessages(['variant_images' => __('messages.sale_prep.too_many_images')]);
        }

        $sort = (int) ProductImage::where('product_id', $product->id)->where('product_variant_id', $variant->id)->max('sort_order');
        $hasPrimary = ProductImage::where('product_id', $product->id)->where('product_variant_id', $variant->id)->where('is_primary', true)->exists();

        foreach ($paths as $index => $path) {
            $image = ProductImage::firstOrNew(['product_id' => $product->id, 'product_variant_id' => $variant->id, 'image_path' => $path]);
            if (! $image->exists) {
                $meta = $this->imageMetadata($path);
                $image->fill($this->filterColumns('product_images', [
                    'variant_key' => (string) $variant->id,
                    'media_type' => 'image',
                    'thumbnail_path' => null,
                    'original_name' => basename($path),
                    'mime_type' => $meta['mime_type'],
                    'size_kb' => $meta['size_kb'],
                    'processed_size_kb' => $meta['size_kb'],
                    'is_primary' => ! $hasPrimary && $index === 0,
                    'sort_order' => ++$sort,
                ]))->save();
            }
        }

        if ($purchase && $newPaths) {
            $purchase->forceFill(['product_image_paths' => $paths->all()])->save();
        }

        if (Schema::hasColumn('products', 'image') && ! $product->image && $paths->isNotEmpty()) {
            $product->forceFill(['image' => $paths->first()])->save();
        }
    }

    private function imageMetadata(string $path): array
    {
        $disk = Storage::disk('public');
        $sizeKb = 0;
        $mime = null;
        if ($disk->exists($path)) {
            try {
                $bytes = (int) $disk->size($path);
                $sizeKb = $bytes > 0 ? max(1, (int) ceil($bytes / 1024)) : 0;
                $mime = $disk->mimeType($path) ?: null;
            } catch (\Throwable $exception) {
                report($exception);
            }
        }

        return ['mime_type' => $mime, 'size_kb' => $sizeKb];
    }

    // ------------------------------------------------------------------ helpers

    private function ensureImeiIsFree(DeviceUnit $device): void
    {
        $identifiers = collect([$device->imei_1, $device->imei_2])->filter()->unique()->values();
        if ($identifiers->isEmpty()) {
            return;
        }

        $duplicate = DeviceUnit::query()
            ->where('id', '!=', $device->id)
            ->whereNull('deleted_at')
            ->whereIn('status', array_merge(self::ACTIVE_STATUSES, ['awaiting_inspection', 'booked']))
            ->where(function ($query) use ($identifiers) {
                $query->whereIn('imei_1', $identifiers)->orWhereIn('imei_2', $identifiers);
            })
            ->first();

        if ($duplicate) {
            throw ValidationException::withMessages([
                'imei_1' => __('messages.sale_prep.imei_in_stock', ['sku' => $duplicate->sku ?: '#' . $duplicate->id]),
            ]);
        }
    }

    private function usedPurchaseFor(DeviceUnit $device, bool $lock = false): ?UsedPurchase
    {
        $query = UsedPurchase::query();
        if ($device->used_purchase_id) {
            $query->whereKey($device->used_purchase_id);
        } elseif (Schema::hasColumn('used_purchases', 'ready_device_unit_id')) {
            $query->where('ready_device_unit_id', $device->id);
        } else {
            return null;
        }

        return $lock ? $query->lockForUpdate()->first() : $query->first();
    }

    private function conditionFor(DeviceUnit $device, ?UsedPurchase $purchase): string
    {
        if ($purchase) {
            return $purchase->purchase_type === 'pre_owned' ? 'pre_owned' : 'used';
        }
        $productCondition = Str::lower((string) ($device->product?->condition ?: $device->product?->product_type));
        if ($device->product && in_array($productCondition, ['new', 'used', 'pre_owned', 'refurbished'], true)) {
            return $productCondition;
        }
        $condition = Str::lower((string) $device->condition);
        if ($device->purchase_id) {
            return in_array($condition, ['used', 'pre_owned', 'refurbished'], true) ? $condition : 'new';
        }

        return in_array($condition, ['used', 'pre_owned', 'refurbished'], true) ? $condition : 'used';
    }

    private function brandFor(DeviceUnit $device, ?UsedPurchase $purchase): ?Brand
    {
        $id = $purchase?->brand_id ?: $device->product?->brand_id;
        if ($id) {
            return Brand::find($id);
        }
        $name = trim((string) ($purchase?->brand ?: $device->product?->brand));

        return $name !== '' ? Brand::whereRaw('LOWER(name) = ?', [Str::lower($name)])->first() : null;
    }

    private function variantAttributes(Request $request, DeviceUnit $device, ?UsedPurchase $purchase, bool $prefill = false): array
    {
        $pick = fn (string $field, ...$fallbacks) => $prefill || ! $request->has($field)
            ? (collect($fallbacks)->first(fn ($value) => filled($value)) ?? '')
            : trim((string) $request->input($field));

        return [
            'color_name' => $pick('color_name', $device->color_name, $purchase?->color_name),
            'storage' => $pick('storage', $device->storage, $purchase?->storage),
            'ram' => $pick('ram', $device->ram, $purchase?->ram),
            'region' => $pick('region', $device->region ?: $device->country_region, $purchase?->region),
            'sim_network' => $pick('sim_network', $device->sim_network ?: $device->network_carrier, $purchase?->sim_network),
        ];
    }

    private function saleFormValues(DeviceUnit $device, ?UsedPurchase $purchase, ?Product $product, ?ProductVariant $variant, array $attributes): array
    {
        $ram = $attributes['ram'];
        $battery = $device->battery_health ?? $purchase?->battery_health;
        $activation = $device->activation_status ?: ($purchase?->activation_status ?: ($variant?->activation_status ?: 'active'));
        // A worn battery means the phone was used; never pre-select a sealed status that would reset it to 100%.
        if ($battery !== null && (int) $battery < 100 && in_array($activation, ['inactive', 'not_activated', 'boxed'], true)) {
            $activation = 'active';
        }

        return [
            'color_name' => $attributes['color_name'],
            'storage' => $attributes['storage'],
            'ram' => in_array(Str::lower((string) $ram), ['initial/unknown'], true) ? '' : $ram,
            'region' => $attributes['region'],
            'sim_network' => $attributes['sim_network'],
            'sale_price' => (float) ($device->selling_price ?: ($purchase?->ready_sale_price ?: 0)) ?: '',
            'market_price' => $device->market_price ?: ($purchase?->market_price ?: ''),
            'battery_health' => $battery,
            'activation_status' => $activation,
            'physical_condition' => $purchase?->physical_condition ?: ($variant?->physical_condition ?: ($purchase?->condition ?: '')),
            'condition_grade' => $purchase?->condition_grade ?: ($variant?->condition_grade ?: ''),
            'box_included' => (bool) ($purchase?->box_included ?? $variant?->box_included ?? true),
            'official_warranty' => $purchase?->official_warranty ?: ($variant?->official_warranty ?: ''),
            'shop_warranty' => $purchase?->shop_warranty ?: ($variant?->shop_warranty ?: ''),
            'warranty_duration' => $purchase?->warranty_duration ?: ($variant?->warranty_duration ?: ''),
            'warranty_notes' => $purchase?->warranty_notes ?: ($variant?->warranty_notes ?: ''),
            'whats_in_box' => $purchase?->whats_in_box ?: ($product?->whats_in_box ?: ''),
            'minimum_booking_type' => $purchase?->minimum_booking_type ?: ($variant?->minimum_booking_type ?: 'percentage'),
            'minimum_booking_value' => $purchase?->minimum_booking_value ?: ($variant?->minimum_booking_value ?: 10),
            'emi_available' => (bool) ($purchase?->emi_available ?? $variant?->emi_available ?? true),
            'allow_preorder' => (bool) ($purchase?->allow_preorder ?? $variant?->allow_preorder ?? false),
            'website_published' => $device->status === 'ready_for_sale' ? (bool) $device->website_published : (bool) ($purchase?->website_published ?? true),
            'show_branch' => data_get($product?->page_options, 'show_branch', true) !== false,
            'use_existing_images' => true,
            'inspection_note' => '',
        ];
    }

    private function productSummary(Product $product): array
    {
        return [
            'id' => $product->id,
            'name' => $product->name,
            'slug' => $product->slug,
            'sku' => $product->sku,
            'condition' => $product->condition,
            'website_published' => (bool) $product->website_published,
            'variants_count' => ProductVariant::where('product_id', $product->id)->count(),
            'ready_units' => DeviceUnit::where('product_id', $product->id)->whereNull('deleted_at')->whereIn('status', self::ACTIVE_STATUSES)->count(),
        ];
    }

    private function variantSummary(ProductVariant $variant): array
    {
        return [
            'id' => $variant->id,
            'name' => $variant->variant_name,
            'sku' => $variant->sku,
            'units' => DeviceUnit::where('product_variant_id', $variant->id)->whereNull('deleted_at')->count(),
        ];
    }

    private function candidateProducts(?Brand $brand, string $condition, ?int $selectedId): Collection
    {
        return Product::query()
            ->select('id', 'name', 'sku', 'condition')
            ->where(function ($query) use ($condition) {
                $query->where('condition', $condition)->orWhere('product_type', $condition);
            })
            ->when($brand, fn ($query) => $query->where('brand_id', $brand->id))
            ->orderBy('name')
            ->limit(100)
            ->get()
            ->when($selectedId && ! $brand, function (Collection $rows) use ($selectedId) {
                $selected = Product::query()->select('id', 'name', 'sku', 'condition')->find($selectedId);
                return $selected && ! $rows->contains('id', $selected->id) ? $rows->prepend($selected) : $rows;
            });
    }

    private function hasSaleHistory(DeviceUnit $device): bool
    {
        return (bool) ($device->sale_id || $device->sold_at || $device->returned_at);
    }

    private function bookingValue(array $validated, $fallback): float
    {
        $type = $validated['minimum_booking_type'] ?? 'percentage';
        $value = array_key_exists('minimum_booking_value', $validated) && $validated['minimum_booking_value'] !== null
            ? (float) $validated['minimum_booking_value']
            : (float) ($fallback ?? 10);

        return $type === 'percentage' ? max(10, $value) : max(0, $value);
    }

    private function batteryHealth(array $validated, DeviceUnit $device, ?UsedPurchase $purchase, string $activation): int
    {
        if (in_array($activation, ['inactive', 'not_activated', 'boxed'], true)) {
            return 100;
        }
        $value = $validated['battery_health'] ?? $device->battery_health ?? $purchase?->battery_health ?? 100;

        return max(0, min(100, (int) $value));
    }

    private function uniqueIdentifier(): string
    {
        do {
            $identifier = 'NST-' . random_int(100000000, 999999999);
        } while (
            Product::where('sku', $identifier)->orWhere('barcode', $identifier)->exists()
            || ProductVariant::where('sku', $identifier)->orWhere('barcode', $identifier)->exists()
            || DeviceUnit::withTrashed()->where('sku', $identifier)->orWhere('barcode', $identifier)->exists()
        );

        return $identifier;
    }

    private function filterColumns(string $table, array $data): array
    {
        $columns = array_flip(Schema::getColumnListing($table));

        return array_intersect_key($data, $columns);
    }
}
