<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\BranchStock;
use App\Models\Category;
use App\Models\DeviceUnit;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Models\Supplier;
use App\Services\ProductContentService;
use App\Services\ProductMediaService;
use App\Services\PublicMediaUrlService;
use App\Services\AccessControlService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProductController extends Controller
{
    public function index(Request $request)
    {
        $query = Product::with(['images', 'variants.images', 'categoryInfo', 'brandInfo', 'supplierInfo'])
            ->where(function ($q) {
                $q->whereNull('condition')->orWhere('condition', 'new');
            })
            ->latest();

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('sku', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%")
                    ->orWhere('brand', 'like', "%{$search}%")
                    ->orWhere('model', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%")
                    ->orWhereHas('variants', function ($variantQuery) use ($search) {
                        $variantQuery->where('model_number', 'like', "%{$search}%");
                    })
                    ->orWhereHas('variants', function ($variantQuery) use ($search) {
                        $variantQuery->where('model_number', 'like', "%{$search}%")
                            ->orWhere('imei_1', 'like', "%{$search}%")
                            ->orWhere('imei_2', 'like', "%{$search}%");
                    })
                    ->orWhereHas('brandInfo', function ($brandQuery) use ($search) {
                        $brandQuery->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('categoryInfo', function ($categoryQuery) use ($search) {
                        $categoryQuery->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('supplierInfo', function ($supplierQuery) use ($search) {
                        $supplierQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('company_name', 'like', "%{$search}%")
                            ->orWhere('phone', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('condition')) {
            $query->where('condition', $request->condition);
        }

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        if ($request->filled('brand_id')) {
            $query->where('brand_id', $request->brand_id);
        }

        if ($request->filled('supplier_id')) {
            $query->where('supplier_id', $request->supplier_id);
        }

        $products = $query->paginate($request->get('per_page', 10));

        $products->getCollection()->transform(function ($product) use ($request) {
            return $this->formatProduct($product, $request->user());
        });

        return response()->json([
            'status' => true,
            'message' => 'Products fetched successfully',
            'data' => $products,
        ]);
    }

    public function all(Request $request)
    {
        $products = Product::with(['images', 'variants.images', 'categoryInfo', 'brandInfo', 'supplierInfo'])
            ->where('status', 'active')
            ->latest()
            ->get()
            ->map(function ($product) use ($request) {
                return $this->formatProduct($product, $request->user());
            });

        return response()->json([
            'status' => true,
            'message' => 'All products fetched successfully',
            'data' => $products,
        ]);
    }

    public function publicIndex(Request $request)
    {
        $query = Product::with(['images', 'variants.images', 'categoryInfo', 'brandInfo', 'supplierInfo'])
            ->where('status', 'active')
            ->latest();

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('brand', 'like', "%{$search}%")
                    ->orWhere('model', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%")
                    ->orWhereHas('brandInfo', function ($brandQuery) use ($search) {
                        $brandQuery->where('name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('categoryInfo', function ($categoryQuery) use ($search) {
                        $categoryQuery->where('name', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        if ($request->filled('brand_id')) {
            $query->where('brand_id', $request->brand_id);
        }

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        if ($request->filled('brand')) {
            $query->where('brand', $request->brand);
        }

        if ($request->filled('condition')) {
            $query->where('condition', $request->condition);
        }

        $products = $query->paginate($request->get('per_page', 12));

        $products->getCollection()->transform(function ($product) use ($request) {
            return $this->formatProduct($product, $request->user());
        });

        return response()->json([
            'status' => true,
            'message' => 'Public products fetched successfully',
            'data' => $products,
        ]);
    }

    public function publicShow(Request $request, Product $product)
    {
        if ($product->status !== 'active') {
            return response()->json([
                'status' => false,
                'message' => 'Product not found',
            ], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Product fetched successfully',
            'data' => $this->formatProduct($product->load(['images', 'variants.images', 'variants.deviceUnits', 'categoryInfo', 'brandInfo', 'supplierInfo']), $request->user()),
        ]);
    }

    public function store(Request $request, ProductMediaService $mediaService)
    {
        $this->ensureCanManageProducts($request);

        return DB::transaction(function () use ($request, $mediaService) {
            $validated = $this->validateProduct($request);

            $validated = $this->syncCategoryBrandFields($validated);
            $validated['sku'] = $this->nullableCatalogIdentifier($request->input('sku'));

            $slugSource = !empty($validated['slug'] ?? null) ? $validated['slug'] : $validated['name'];

            $validated['slug'] = $this->generateUniqueSlug($slugSource);

            $validated['barcode_mode'] = $validated['barcode_mode'] ?? 'manual';

            if ($validated['barcode_mode'] === 'auto' || empty($validated['barcode'])) {
                $validated['barcode'] = $this->generateUniqueBarcode('NSTP');
            }

            $validated = $this->normalizeProductNumbers($validated);

            $validated['meta_title'] = !empty($validated['meta_title'])
                ? $validated['meta_title']
                : $this->generateMetaTitle($validated);

            $validated['meta_description'] = !empty($validated['meta_description'])
                ? $validated['meta_description']
                : $this->generateMetaDescription($validated);

            $validated['key_features'] = $this->decodeJsonField($request->key_features);
            $validated['specifications'] = $this->decodeJsonField($request->specifications);
            $validated['faqs'] = $this->decodeJsonField($request->faqs);

            $validated['color_options'] = $this->decodeJsonField($request->color_options);
            $validated['region_options'] = $this->decodeJsonField($request->region_options);
            $validated['storage_options'] = $this->decodeJsonField($request->storage_options);
            $validated['key_specs'] = $this->decodeJsonField($request->key_specs);
            $validated['page_options'] = $this->decodeJsonField($request->page_options);
            $validated['add_ons'] = $this->decodeJsonField($request->add_ons);
            $validated['care_packages'] = $this->decodeJsonField($request->care_packages);
            $validated = $this->applyFinalProductRules($request, $validated);

            $mainMedia = null;

            if ($request->hasFile('image')) {
                $mainMedia = $mediaService->processUploadedMedia($request->file('image'));

                if ($mainMedia['media_type'] === 'image') {
                    $validated['image'] = $mainMedia['image_path'];
                } else {
                    $validated['image'] = null;
                }
            }

            $product = Product::create($validated);

            if ($mainMedia) {
                ProductImage::create([
                    'product_id' => $product->id,
                    'media_type' => $mainMedia['media_type'],
                    'image_path' => $mainMedia['image_path'],
                    'thumbnail_path' => $mainMedia['thumbnail_path'],
                    'original_name' => $mainMedia['original_name'],
                    'mime_type' => $mainMedia['mime_type'],
                    'size_kb' => $mainMedia['size_kb'],
                    'processed_size_kb' => $mainMedia['processed_size_kb'],
                    'is_primary' => true,
                    'sort_order' => 1,
                ]);
            }

            $this->storeMultipleMedia($request, $product, $mediaService);
            $this->storeProductVideo($request, $product, $mediaService);
            $this->syncVariants($request, $product, $mediaService);
            $this->syncQuickSpecificationsToGroups($product->fresh());

            return response()->json([
                'status' => true,
                'message' => 'Product created successfully',
                'data' => $this->formatProduct($product->fresh()->load(['images', 'variants.images', 'categoryInfo', 'brandInfo', 'supplierInfo']), $request->user()),
            ], 201);
        });
    }

    public function show(Request $request, Product $product)
    {
        return response()->json([
            'status' => true,
            'message' => 'Product fetched successfully',
            'data' => $this->formatProduct(
                $product->load(['images', 'variants.images', 'categoryInfo', 'brandInfo', 'supplierInfo']),
                $request->user()
            ),
        ]);
    }

    public function update(Request $request, Product $product, ProductMediaService $mediaService)
    {
        $this->ensureCanManageProducts($request);

        return DB::transaction(function () use ($request, $product, $mediaService) {
            $oldSlug = $product->slug;
            $validated = $this->validateProduct($request, $product->id);

            $validated = $this->syncCategoryBrandFields($validated);
            $validated['sku'] = $this->nullableCatalogIdentifier($request->input('sku'));

            if (!empty($validated['slug'] ?? null)) {
                $validated['slug'] = $this->generateUniqueSlug($validated['slug'], $product->id);
            } elseif ($product->name !== $validated['name']) {
                $validated['slug'] = $this->generateUniqueSlug($validated['name'], $product->id);
            }

            $validated['barcode_mode'] = $validated['barcode_mode'] ?? 'manual';

            if ($validated['barcode_mode'] === 'auto' || empty($validated['barcode'])) {
                $validated['barcode'] = $product->barcode ?: $this->generateUniqueBarcode('NSTP');
            }

            $validated = $this->normalizeProductNumbers($validated);

            // Edit safety: blank supplier / blank purchase price from an old or partially-loaded form
            // must not wipe existing product data. User can still change them by selecting/typing values.
            if (! $request->filled('supplier_id') && $product->supplier_id) {
                $validated['supplier_id'] = $product->supplier_id;
            }
            if (! $request->filled('purchase_price') && (float) $product->purchase_price > 0) {
                $validated['purchase_price'] = $product->purchase_price;
            }

            $validated['meta_title'] = !empty($validated['meta_title'])
                ? $validated['meta_title']
                : $this->generateMetaTitle($validated);

            $validated['meta_description'] = !empty($validated['meta_description'])
                ? $validated['meta_description']
                : $this->generateMetaDescription($validated);

            $validated['key_features'] = $this->decodeJsonField($request->key_features);
            $validated['specifications'] = $this->decodeJsonField($request->specifications);
            $validated['faqs'] = $this->decodeJsonField($request->faqs);

            $validated['color_options'] = $this->decodeJsonField($request->color_options);
            $validated['region_options'] = $this->decodeJsonField($request->region_options);
            $validated['storage_options'] = $this->decodeJsonField($request->storage_options);
            $validated['key_specs'] = $this->decodeJsonField($request->key_specs);
            $validated['page_options'] = $this->decodeJsonField($request->page_options);
            $validated['add_ons'] = $this->decodeJsonField($request->add_ons);
            $validated['care_packages'] = $this->decodeJsonField($request->care_packages);
            $validated = $this->applyFinalProductRules($request, $validated, $product);

            $mainMedia = null;

            if ($request->has('remove_image_ids')) {
                $this->removeSelectedMedia($product, $request->remove_image_ids);
            }

            if ($request->hasFile('image')) {
                $oldPrimaryMedia = $product->images()->where('is_primary', true)->first();

                if ($oldPrimaryMedia) {
                    $this->deleteMediaFiles($oldPrimaryMedia);
                    $oldPrimaryMedia->delete();
                }

                if ($product->image && Storage::disk('public')->exists($product->image)) {
                    Storage::disk('public')->delete($product->image);
                }

                $mainMedia = $mediaService->processUploadedMedia($request->file('image'));

                if ($mainMedia['media_type'] === 'image') {
                    $validated['image'] = $mainMedia['image_path'];
                } else {
                    $validated['image'] = null;
                }
            }

            $product->update($validated);
            $this->recordSlugRedirect('product', $product->id, $oldSlug, $product->slug);

            if ($mainMedia) {
                ProductImage::create([
                    'product_id' => $product->id,
                    'media_type' => $mainMedia['media_type'],
                    'image_path' => $mainMedia['image_path'],
                    'thumbnail_path' => $mainMedia['thumbnail_path'],
                    'original_name' => $mainMedia['original_name'],
                    'mime_type' => $mainMedia['mime_type'],
                    'size_kb' => $mainMedia['size_kb'],
                    'processed_size_kb' => $mainMedia['processed_size_kb'],
                    'is_primary' => true,
                    'sort_order' => 1,
                ]);
            }

            $this->storeMultipleMedia($request, $product->fresh(), $mediaService);
            $this->storeProductVideo($request, $product->fresh(), $mediaService);
            $this->syncVariants($request, $product->fresh(), $mediaService);
            $this->syncQuickSpecificationsToGroups($product->fresh());
            $this->syncProductMainImage($product->fresh());

            return response()->json([
                'status' => true,
                'message' => 'Product updated successfully',
                'data' => $this->formatProduct($product->fresh()->load(['images', 'variants.images', 'categoryInfo', 'brandInfo', 'supplierInfo']), $request->user()),
            ]);
        });
    }

    public function destroy(Request $request, Product $product)
    {
        $this->ensureCanManageProducts($request);

        return DB::transaction(function () use ($product) {
            if ($product->image && Storage::disk('public')->exists($product->image)) {
                Storage::disk('public')->delete($product->image);
            }

            foreach ($product->images as $media) {
                $this->deleteMediaFiles($media);
            }

            $product->images()->delete();
            $product->variants()->delete();
            $product->delete();

            return response()->json([
                'status' => true,
                'message' => 'Product deleted successfully',
            ]);
        });
    }

    private function ensureCanManageProducts(Request $request): void
    {
        if (! app(AccessControlService::class)->canManageProducts($request->user())) {
            abort(response()->json([
                'status' => false,
                'message' => 'You do not have permission to add, edit or delete products.',
            ], 403));
        }
    }

    private function validateProduct(Request $request, ?int $productId = null): array
    {
        $request->merge([
            'category_id' => $request->input('category_id') ?: null,
            'brand_id' => $request->input('brand_id') ?: null,
            'supplier_id' => $request->input('supplier_id') ?: null,
        ]);

        return $request->validate([
            'name' => ['required', 'string', 'max:255'],

            'sku' => [
                'nullable',
                'string',
                'max:100',
                Rule::unique('products', 'sku')->ignore($productId),
            ],

            'barcode_mode' => ['nullable', Rule::in(['auto', 'manual'])],

            'barcode' => [
                'nullable',
                'string',
                'max:100',
                Rule::unique('products', 'barcode')->ignore($productId),
            ],

            'category_id' => ['required', 'integer', 'exists:categories,id'],
            'brand_id' => ['required', 'integer', 'exists:brands,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],

            'brand' => ['nullable', 'string', 'max:255'],
            'model' => ['nullable', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:255'],

            'condition' => [
                'required',
                $productId
                    ? Rule::in(['new', 'used', 'pre_owned', 'refurbished'])
                    : Rule::in(['new']),
            ],

            'description' => ['nullable', 'string'],
            'short_description' => ['nullable', 'string'],
            'slug' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('products', 'slug')->ignore($productId),
            ],
            'meta_title' => ['nullable', 'string', 'max:255'],
            'meta_description' => ['nullable', 'string', 'max:500'],
            'seo_keywords' => ['nullable', 'string', 'max:1000'],

            'key_features' => ['nullable'],
            'specifications' => ['nullable'],
            'faqs' => ['nullable'],
            'variants' => ['nullable'],

            'color_options' => ['nullable'],
            'region_options' => ['nullable'],
            'storage_options' => ['nullable'],
            'key_specs' => ['nullable'],
            'page_options' => ['nullable'],
            'add_ons' => ['nullable'],
            'care_packages' => ['nullable'],

            'purchase_price' => ['nullable', 'numeric', 'min:0'],
            'sale_price' => ['nullable', 'numeric', 'min:0'],
            'regular_price' => ['nullable', 'numeric', 'min:0'],
            'discount_price' => ['nullable', 'numeric', 'min:0'],

            'minimum_booking_amount' => ['nullable', 'numeric', 'min:0'],
            'minimum_booking_type' => ['nullable', Rule::in(['fixed', 'percentage'])],
            'minimum_booking_value' => ['nullable', 'numeric', 'min:0'],

            'purchase_points' => ['nullable', 'integer', 'min:0'],
            'emi_monthly_amount' => ['nullable', 'numeric', 'min:0'],

            'stock_quantity' => ['nullable', 'integer', 'min:0'],
            'low_stock_alert' => ['nullable', 'integer', 'min:0'],

            'status' => [
                'required',
                Rule::in(['draft', 'active', 'inactive', 'out_of_stock']),
            ],

            'website_published' => ['nullable', 'boolean'],
            'draft_step' => ['nullable', 'integer', 'min:1', 'max:6'],
            'activation_status' => ['nullable', Rule::in(['inactive', 'not_activated', 'boxed', 'active', 'activated', 'open_box'])],
            'box_included' => ['nullable', 'boolean'],
            'physical_condition' => ['nullable', 'string', 'max:255'],
            'condition_grade' => ['nullable', 'string', 'max:100'],
            'official_warranty' => ['nullable', 'string', 'max:255'],
            'shop_warranty' => ['nullable', 'string', 'max:255'],
            'warranty_notes' => ['nullable', 'string', 'max:2000'],
            'whats_in_box' => ['nullable', 'string'],
            'allow_preorder' => ['nullable', 'boolean'],
            'preorder_note' => ['nullable', 'string', 'max:2000'],
            'warranty' => ['nullable', 'string', 'max:255'],
            'estimated_delivery' => ['nullable', 'string', 'max:255'],

            'image' => [
                'nullable',
                'file',
                'mimes:jpg,jpeg,png,webp,mp4,mov,avi,mkv,webm',
                'max:102400',
            ],

            'product_video' => [
                'nullable',
                'file',
                'mimes:mp4,mov,avi,mkv,webm',
                'max:204800',
            ],

            'images' => ['nullable', 'array', 'max:10'],
            'images.*' => [
                'file',
                'mimes:jpg,jpeg,png,webp,mp4,mov,avi,mkv,webm',
                'max:102400',
            ],

            'remove_image_ids' => ['nullable'],
            'variant_gallery_image_ids_*' => ['nullable'],
            'variant_remove_image_ids_*' => ['nullable'],
        ]);
    }

    private function syncCategoryBrandFields(array $validated): array
    {
        if (!empty($validated['category_id'])) {
            $category = Category::find($validated['category_id']);

            if ($category) {
                $validated['category'] = $category->name;
            }
        }

        if (!empty($validated['brand_id'])) {
            $brand = Brand::find($validated['brand_id']);

            if ($brand) {
                $validated['brand'] = $brand->name;
            }
        }

        return $validated;
    }

    private function formatProduct(Product $product, $user = null): array
    {
        $productArray = $product->toArray();

        $images = $product->images
            ? $product->images
                ->sortBy([
                    ['is_primary', 'desc'],
                    ['sort_order', 'asc'],
                    ['id', 'asc'],
                ])
                ->map(function ($media) {
                    return $this->formatMedia($media);
                })
                ->values()
                ->toArray()
            : [];

        $primaryMedia = collect($images)->firstWhere('is_primary', true) ?: ($images[0] ?? null);

        $productArray['images'] = $images;
        $product->loadMissing(['variants.images']);

        $productArray['variants'] = $product->variants
            ? $product->variants->map(function ($variant) {
                $variantArray = $variant->toArray();
                $variantArray['images'] = $variant->images
                    ? $variant->images->sortBy([
                        ['sort_order', 'asc'],
                        ['id', 'asc'],
                    ])->map(function ($media) {
                        return $this->formatMedia($media);
                    })->values()->toArray()
                    : [];

                if ($variant->relationLoaded('deviceUnits')) {
                    $variantArray['device_units'] = $variant->deviceUnits
                        ->filter(function (DeviceUnit $device) {
                            return ! in_array(strtolower((string) $device->status), [
                                'sold', 'damaged', 'lost', 'missing', 'supplier_return',
                                'awaiting_inspection', 'under_inspection', 'in_service', 'inactive',
                            ], true) && ! $device->sale_id;
                        })
                        ->sortBy('id')
                        ->map(fn (DeviceUnit $device) => [
                            'id' => $device->id,
                            'product_variant_id' => $device->product_variant_id,
                            'branch_id' => $device->branch_id,
                            'supplier_id' => $device->supplier_id,
                            'sku' => $device->sku,
                            'barcode' => $device->barcode,
                            'imei_1' => $device->imei_1,
                            'imei_2' => $device->imei_2,
                            'model_number' => $device->model_number,
                            'purchase_cost' => $device->purchase_cost,
                            'selling_price' => $device->selling_price,
                            'market_price' => $device->market_price,
                            'status' => $device->status,
                            'saleable' => (bool) $device->saleable,
                            'website_published' => (bool) $device->website_published,
                            'activation_status' => $device->activation_status,
                            'service_status' => $device->service_status,
                            'warranty_type' => $device->warranty_type,
                            'note' => $device->note,
                            'color_name' => $device->color_name,
                            'region' => $device->region,
                            'sim_network' => $device->sim_network,
                            'ram' => $device->ram,
                            'storage' => $device->storage,
                            'battery_health' => $device->battery_health,
                        ])
                        ->values()
                        ->toArray();
                }

                return $variantArray;
            })->values()->toArray()
            : [];
        $firstVariant = $product->variants ? $product->variants->first() : null;
        $productArray['branch_id'] = data_get($productArray, 'page_options.branch_id') ?: ($firstVariant->branch_id ?? null);

        $productArray['category_info'] = $product->categoryInfo ? [
            'id' => $product->categoryInfo->id,
            'name' => $product->categoryInfo->name,
            'slug' => $product->categoryInfo->slug,
            'status' => $product->categoryInfo->status,
        ] : null;

        $productArray['brand_info'] = $product->brandInfo ? [
            'id' => $product->brandInfo->id,
            'name' => $product->brandInfo->name,
            'slug' => $product->brandInfo->slug,
            'status' => $product->brandInfo->status,
        ] : null;

        $productArray['supplier_info'] = $product->supplierInfo ? [
            'id' => $product->supplierInfo->id,
            'name' => $product->supplierInfo->name,
            'company_name' => $product->supplierInfo->company_name,
            'phone' => $product->supplierInfo->phone,
            'email' => $product->supplierInfo->email,
            'status' => $product->supplierInfo->status,
        ] : null;

        $productArray['image_url'] = $product->image
            ? $this->storageUrl($product->image)
            : ($primaryMedia['image_url'] ?? null);

        $productArray['media_url'] = $primaryMedia['media_url'] ?? $productArray['image_url'];
        $productArray['thumbnail_url'] = $primaryMedia['thumbnail_url'] ?? $productArray['image_url'];
        $productArray['primary_media'] = $primaryMedia;

        $accessControl = app(AccessControlService::class);
        if (! $accessControl->canViewSupplierInfo($user)) {
            unset($productArray['supplier_id'], $productArray['supplier'], $productArray['supplier_info'], $productArray['supplierInfo']);
            $productArray['variants'] = collect($productArray['variants'])->map(function ($variant) {
                unset($variant['supplier_id'], $variant['supplier'], $variant['supplier_info']);

                if (isset($variant['device_units']) && is_array($variant['device_units'])) {
                    $variant['device_units'] = collect($variant['device_units'])->map(function ($device) {
                        unset($device['supplier_id'], $device['supplier'], $device['supplier_info']);
                        return $device;
                    })->values()->toArray();
                }

                return $variant;
            })->values()->toArray();
        }

        if (! $accessControl->canViewPurchasePrice($user)) {
            foreach (['purchase_price', 'purchase_cost', 'unit_cost', 'profit', 'profit_amount', 'margin'] as $field) {
                unset($productArray[$field]);
            }
            $productArray['variants'] = collect($productArray['variants'])->map(function ($variant) {
                foreach (['purchase_price', 'purchase_cost', 'unit_cost', 'profit', 'profit_amount', 'margin'] as $field) {
                    unset($variant[$field]);
                }

                if (isset($variant['device_units']) && is_array($variant['device_units'])) {
                    $variant['device_units'] = collect($variant['device_units'])->map(function ($device) {
                        foreach (['purchase_price', 'purchase_cost', 'unit_cost', 'profit', 'profit_amount', 'margin'] as $field) {
                            unset($device[$field]);
                        }
                        return $device;
                    })->values()->toArray();
                }

                return $variant;
            })->values()->toArray();
        }

        return $productArray;
    }

    private function formatMedia(ProductImage $media): array
    {
        $mediaUrl = $this->storageUrl($media->image_path);
        $thumbnailUrl = $media->thumbnail_path
            ? $this->storageUrl($media->thumbnail_path)
            : $mediaUrl;

        return [
            'id' => $media->id,
            'product_id' => $media->product_id,
            'media_type' => $media->media_type,
            'type' => $media->media_type,
            'is_video' => $media->media_type === 'video',
            'image_path' => $media->image_path,
            'thumbnail_path' => $media->thumbnail_path,
            'media_url' => $mediaUrl,
            'image_url' => $mediaUrl,
            'file_url' => $mediaUrl,
            'full_url' => $mediaUrl,
            'url' => $mediaUrl,
            'thumbnail_url' => $thumbnailUrl,
            'original_name' => $media->original_name,
            'name' => $media->original_name,
            'file_name' => $media->original_name,
            'mime_type' => $media->mime_type,
            'size_kb' => $media->size_kb,
            'processed_size_kb' => $media->processed_size_kb,
            'is_primary' => (bool) $media->is_primary,
            'sort_order' => $media->sort_order,
            'created_at' => $media->created_at,
            'updated_at' => $media->updated_at,
        ];
    }

    private function storageUrl(?string $path): ?string
    {
        return PublicMediaUrlService::forPath($path);
    }

    private function nullableCatalogIdentifier($value): ?string
    {
        $text = trim((string) ($value ?? ''));

        return $text === '' ? null : $text;
    }

    private function normalizeProductNumbers(array $validated): array
    {
        $validated['purchase_price'] = $this->moneyOrZero($validated['purchase_price'] ?? null);
        $validated['sale_price'] = $this->moneyOrZero($validated['sale_price'] ?? null);
        $validated['regular_price'] = $this->moneyOrNull($validated['regular_price'] ?? null);
        $validated['discount_price'] = $this->moneyOrNull($validated['discount_price'] ?? null);

        $validated['minimum_booking_type'] = $validated['minimum_booking_type'] ?? 'fixed';
        $validated['minimum_booking_value'] = $this->moneyOrNull(
            $validated['minimum_booking_value'] ?? ($validated['minimum_booking_amount'] ?? null)
        );

        if ($validated['minimum_booking_type'] === 'percentage') {
            $validated['minimum_booking_value'] = max(10, (float) ($validated['minimum_booking_value'] ?? 10));
            $validated['minimum_booking_amount'] = null;
        } elseif ($validated['minimum_booking_type'] === 'fixed') {
            $validated['minimum_booking_amount'] = $validated['minimum_booking_value'];
        } else {
            $validated['minimum_booking_type'] = 'percentage';
            $validated['minimum_booking_value'] = 10;
            $validated['minimum_booking_amount'] = null;
        }

        $validated['emi_monthly_amount'] = null;
        $validated['purchase_points'] = $this->intOrZero($validated['purchase_points'] ?? null);
        $validated['stock_quantity'] = $this->intOrZero($validated['stock_quantity'] ?? null);
        $validated['low_stock_alert'] = $this->intOrDefault($validated['low_stock_alert'] ?? null, 5);

        return $validated;
    }

    private function applyFinalProductRules(Request $request, array $validated, ?Product $existingProduct = null): array
    {
        $existingCondition = strtolower((string) ($existingProduct?->condition ?: $existingProduct?->product_type ?: ''));
        $existingSource = strtolower((string) ($existingProduct?->source_type ?: ''));
        $isUsedCatalogProduct = $existingProduct && (
            in_array($existingCondition, ['used', 'pre_owned', 'refurbished'], true)
            || $existingSource === 'used_purchase'
        );

        if ($isUsedCatalogProduct) {
            $condition = in_array($existingCondition, ['used', 'pre_owned', 'refurbished'], true)
                ? $existingCondition
                : 'used';
            $validated['condition'] = $condition;
            $validated['product_type'] = $condition;
            $validated['source_type'] = 'used_purchase';
        } else {
            $validated['condition'] = 'new';
            $validated['product_type'] = 'new';
            $validated['source_type'] = $request->filled('supplier_id') ? 'supplier_new' : 'new';
        }

        $publishDefault = $existingProduct
            ? (bool) $existingProduct->website_published
            : (($validated['status'] ?? 'active') === 'active');
        $validated['website_published'] = $request->has('website_published')
            ? $request->boolean('website_published')
            : $publishDefault;
        $validated['draft_step'] = $this->clampInt($request->input('draft_step', 1), 1, 6);
        $validated['allow_preorder'] = $request->has('allow_preorder')
            ? $request->boolean('allow_preorder')
            : (bool) ($existingProduct?->allow_preorder ?? true);
        $validated['activation_status'] = $request->input('activation_status') ?: ($existingProduct?->activation_status ?: null);
        $validated['box_included'] = $request->has('box_included')
            ? $request->boolean('box_included')
            : $existingProduct?->box_included;

        $pageOptions = is_array($validated['page_options'] ?? null) ? $validated['page_options'] : [];
        $pageOptions['website_published'] = (bool) $validated['website_published'];
        $pageOptions['show_price_at_zero_stock'] = true;
        $pageOptions['allow_preorder'] = (bool) $validated['allow_preorder'];
        $pageOptions['product_entry_rule'] = $isUsedCatalogProduct
            ? 'used_purchase_ready_sale'
            : 'new_and_supplier_new_only';
        $validated['page_options'] = $pageOptions;

        return $validated;
    }

    private function recordSlugRedirect(string $entityType, int $entityId, ?string $oldSlug, ?string $newSlug): void
    {
        app(ProductContentService::class)->recordSlugRedirect($entityType, $entityId, $oldSlug, $newSlug);
    }

    private function syncQuickSpecificationsToGroups(Product $product): void
    {
        app(ProductContentService::class)->syncQuickSpecificationsToGroups($product);
    }

    private function syncVariants(Request $request, Product $product, ProductMediaService $mediaService): void
    {
        $variants = $this->decodeJsonField($request->variants);

        if (! is_array($variants)) {
            return;
        }

        $submittedVariantIds = [];

        $variantGroups = collect($variants)
            ->values()
            ->groupBy(function ($variant, $index) {
                $groupKey = trim((string) ($variant['variant_group_key'] ?? ''));

                if ($groupKey !== '') {
                    return $groupKey;
                }

                $variantId = (int) ($variant['variant_id'] ?? $variant['id'] ?? 0);

                return $variantId > 0 ? 'existing_variant_' . $variantId : 'new_variant_row_' . $index;
            });

        foreach ($variantGroups as $groupRows) {
            $groupRows = collect($groupRows)->values();
            $variant = (array) $groupRows->first();

            $activationStatus = strtolower((string) ($variant['activation_status'] ?? $variant['device_status'] ?? $variant['status'] ?? 'inactive'));
            $activationStatus = in_array($activationStatus, ['inactive', 'not_activated', 'boxed', 'active', 'activated', 'open_box'], true)
                ? $activationStatus
                : 'inactive';

            $variantStatus = strtolower((string) ($variant['variant_status'] ?? $variant['status'] ?? 'active'));
            $variantStatus = in_array($variantStatus, ['active', 'inactive'], true) ? $variantStatus : 'active';

            $imeiTracking = $this->booleanToInt($variant['imei_tracking'] ?? true);
            $condition = in_array(strtolower((string) ($product->condition ?: $product->product_type)), ['used', 'pre_owned', 'refurbished'], true)
                ? strtolower((string) ($product->condition ?: $product->product_type))
                : 'new';

            $variantId = (int) ($variant['variant_id'] ?? $variant['id'] ?? 0);
            $variantId = $variantId > 0 ? $variantId : null;

            $productVariant = $variantId
                ? ProductVariant::where('product_id', $product->id)->where('id', $variantId)->first()
                : null;

            $variantSku = $productVariant?->sku
                ?: $this->normalizeNstSku($variant['variant_sku'] ?? $variant['sku'] ?? null);
            $variantBarcode = $productVariant?->barcode
                ?: $this->normalizeNstSku($variant['variant_barcode'] ?? $variantSku);

            $this->ensureUniqueVariantIdentity(
                $variantSku,
                $variantBarcode,
                $product->id,
                $productVariant?->id
            );

            $ram = $this->stringOrNull($variant['ram'] ?? null) ?: 'Initial/Unknown';
            $variantName = $this->buildVariantName([
                $variant['color_name'] ?? null,
                $variant['region'] ?? null,
                $variant['sim_network'] ?? null,
                $ram !== 'Initial/Unknown' ? $ram : null,
                $variant['storage'] ?? null,
            ], $condition);

            $branchId = $this->resolveInventoryBranchId(
                $variant['branch_id']
                    ?? $request->input('branch_id')
                    ?? data_get($this->decodeJsonField($request->input('page_options')), 'branch_id')
            );

            $supplierId = $request->input('supplier_id')
                ?: ($variant['supplier_id'] ?? null)
                ?: ($productVariant?->supplier_id ?? null)
                ?: ($product->supplier_id ?? null);

            $groupSalePrices = $groupRows
                ->pluck('sale_price')
                ->map(fn ($value) => $this->moneyOrNull($value))
                ->filter(fn ($value) => $value !== null && (float) $value > 0)
                ->map(fn ($value) => (float) $value);

            $groupPurchasePrices = $groupRows
                ->pluck('purchase_price')
                ->map(fn ($value) => $this->moneyOrNull($value))
                ->filter(fn ($value) => $value !== null && (float) $value > 0)
                ->map(fn ($value) => (float) $value);

            $groupMarketPrices = $groupRows
                ->pluck('market_price')
                ->map(fn ($value) => $this->moneyOrNull($value))
                ->filter(fn ($value) => $value !== null && (float) $value > 0)
                ->map(fn ($value) => (float) $value);

            $purchasePrice = $groupPurchasePrices->first();
            if ($purchasePrice === null && $productVariant && (float) $productVariant->purchase_price > 0) {
                $purchasePrice = (float) $productVariant->purchase_price;
            }
            $purchasePrice = $purchasePrice ?? 0;

            $salePrice = $groupSalePrices->min();
            if ($salePrice === null && $productVariant && (float) $productVariant->sale_price > 0) {
                $salePrice = (float) $productVariant->sale_price;
            }
            $salePrice = $salePrice ?? 0;

            $marketPrice = $groupMarketPrices->max()
                ?: $this->moneyOrNull($variant['market_price'] ?? $variant['regular_price'] ?? null);

            $payload = [
                'product_id' => $product->id,
                'branch_id' => $branchId ?: null,
                'supplier_id' => $supplierId ?: null,
                'variant_name' => $variant['variant_name'] ?? $variantName,
                'model_number' => $this->stringOrNull($variant['model_number'] ?? null),
                'condition' => $condition,
                'product_type' => $condition,
                'sku' => $variantSku,
                'barcode_mode' => 'manual',
                'barcode' => $variantBarcode,
                'imei_1' => $groupRows->count() === 1 ? $this->cleanIdentifier($variant['imei_1'] ?? null) : null,
                'imei_2' => $groupRows->count() === 1 ? $this->cleanIdentifier($variant['imei_2'] ?? null) : null,
                'purchase_price' => $purchasePrice,
                'sale_price' => $salePrice,
                'market_price' => $marketPrice,
                'regular_price' => $marketPrice,
                'discount_price' => $this->moneyOrNull($variant['discount_price'] ?? null),
                'stock_quantity' => 0,
                'opening_stock_quantity' => max(1, $groupRows->count()),
                'imei_tracking' => $imeiTracking,
                'low_stock_alert' => $this->intOrDefault($variant['low_stock_alert'] ?? null, 5),
                'warranty' => $this->stringOrNull($variant['warranty'] ?? null),
                'short_note' => $this->stringOrNull($variant['short_note'] ?? null),
                'status' => $variantStatus,
                'device_status' => in_array($activationStatus, ['active', 'activated', 'open_box'], true) ? 'active' : 'inactive',
                'activation_status' => $activationStatus,
                'color_name' => $this->stringOrNull($variant['color_name'] ?? null),
                'region' => $this->stringOrNull($variant['region'] ?? null),
                'sim_network' => $this->stringOrNull($variant['sim_network'] ?? null),
                'ram' => $ram,
                'storage' => $this->stringOrNull($variant['storage'] ?? null),
                'battery_health' => in_array($activationStatus, ['inactive', 'not_activated', 'boxed'], true)
                    ? 100
                    : $this->clampInt($variant['battery_health'] ?? 100, 0, 100),
                'minimum_booking_type' => in_array(($variant['minimum_booking_type'] ?? 'percentage'), ['percentage', 'fixed'], true)
                    ? $variant['minimum_booking_type']
                    : 'percentage',
                'minimum_booking_value' => ($variant['minimum_booking_type'] ?? 'percentage') === 'percentage'
                    ? max(10, (float) ($variant['minimum_booking_value'] ?? 10))
                    : max(0, (float) ($variant['minimum_booking_value'] ?? 0)),
                'emi_available' => $this->booleanToInt($variant['emi_available'] ?? true),
                'allow_preorder' => $this->booleanToInt($variant['allow_preorder'] ?? true),
                'stock_state' => $this->stringOrNull($variant['stock_state'] ?? null) ?: 'in_stock',
                'serial_number' => $this->cleanIdentifier($variant['serial_number'] ?? null),
                'box_included' => array_key_exists('box_included', $variant) ? $this->booleanToInt($variant['box_included']) : null,
                'physical_condition' => $this->stringOrNull($variant['physical_condition'] ?? null),
                'condition_grade' => $this->stringOrNull($variant['condition_grade'] ?? null),
                'official_warranty' => $this->stringOrNull($variant['official_warranty'] ?? null),
                'shop_warranty' => $this->stringOrNull($variant['shop_warranty'] ?? null),
                'warranty_duration' => $this->stringOrNull($variant['warranty_duration'] ?? null),
                'warranty_notes' => $this->stringOrNull($variant['warranty_notes'] ?? null),
                'service_status' => $this->stringOrNull($variant['service_status'] ?? null) ?: 'no_service',
                'supplier_reference' => $this->stringOrNull($variant['supplier_reference'] ?? null),
                'purchase_reference' => $this->stringOrNull($variant['purchase_reference'] ?? null),
                'entry_done_by' => $request->user()?->id,
            ];

            if ($productVariant) {
                $productVariant->update($payload);
            } else {
                $productVariant = ProductVariant::create($payload);
            }

            $submittedVariantIds[] = $productVariant->id;

            $imageIndex = (int) ($variant['client_index'] ?? 0);
            $this->storeVariantImages($request, $product, $productVariant, $imageIndex, $mediaService);

            if ($imeiTracking === 1) {
                foreach ($groupRows as $unitPayload) {
                    $this->syncDeviceUnitFromVariant(
                        $request,
                        $product,
                        $productVariant,
                        (array) $unitPayload,
                        $variant,
                        $branchId,
                        $supplierId
                    );
                }

                $this->syncVariantInventoryFromDevices($productVariant, $branchId);
            } else {
                $qty = max(
                    0,
                    (int) $groupRows->sum(
                        fn ($row) => $this->intOrDefault(
                            $row['stock_quantity'] ?? $row['opening_stock_quantity'] ?? 1,
                            1
                        )
                    )
                );

                $productVariant->update([
                    'stock_quantity' => $qty,
                    'opening_stock_quantity' => max((int) $productVariant->opening_stock_quantity, $qty),
                ]);

                $this->syncBranchStockQuantity($product->id, $productVariant->id, $branchId, $qty);
            }
        }

        $affectedVariantIds = $this->deactivateRemovedDeviceUnits($request, $product);

        foreach ($affectedVariantIds as $affectedVariantId) {
            $affectedVariant = ProductVariant::where('product_id', $product->id)
                ->where('id', $affectedVariantId)
                ->first();

            if ($affectedVariant) {
                $this->syncVariantInventoryFromDevices($affectedVariant, $affectedVariant->branch_id);
            }
        }

        $product->variants()
            ->whereNotIn('id', array_values(array_unique($submittedVariantIds)))
            ->get()
            ->each(function (ProductVariant $oldVariant) {
                $hasHistoricalDevices = DeviceUnit::withTrashed()
                    ->where('product_variant_id', $oldVariant->id)
                    ->exists();

                if ($hasHistoricalDevices) {
                    $oldVariant->update([
                        'status' => 'inactive',
                        'stock_quantity' => 0,
                    ]);

                    return;
                }

                ProductImage::where('product_variant_id', $oldVariant->id)->update([
                    'product_variant_id' => null,
                    'variant_key' => null,
                ]);

                $oldVariant->delete();
            });

        $freshProduct = $product->fresh(['variants']);
        $firstVariant = $freshProduct?->variants?->first();
        $productUpdates = [];

        if ($firstVariant && empty($freshProduct->supplier_id) && ! empty($firstVariant->supplier_id)) {
            $productUpdates['supplier_id'] = $firstVariant->supplier_id;
        }

        if ($firstVariant && (float) ($freshProduct->purchase_price ?? 0) <= 0 && (float) ($firstVariant->purchase_price ?? 0) > 0) {
            $productUpdates['purchase_price'] = $firstVariant->purchase_price;
        }

        if ($productUpdates) {
            $freshProduct->update($productUpdates);
        }

        $this->syncProductStockQuantity($product->fresh());
    }

    private function syncDeviceUnitFromVariant(
        Request $request,
        Product $product,
        ProductVariant $variant,
        array $unitPayload,
        array $sharedVariantPayload,
        $branchId,
        $supplierId
    ): DeviceUnit {
        $sku = $this->normalizeNstSku($unitPayload['sku'] ?? $unitPayload['barcode'] ?? null);
        $barcode = $this->normalizeNstSku($unitPayload['barcode'] ?? $sku);
        $imei1 = $this->cleanIdentifier($unitPayload['imei_1'] ?? null);
        $imei2 = $this->cleanIdentifier($unitPayload['imei_2'] ?? null);

        $deviceUnitId = (int) ($unitPayload['device_unit_id'] ?? 0);

        $existing = $deviceUnitId > 0
            ? DeviceUnit::where('product_id', $product->id)
                ->where('id', $deviceUnitId)
                ->first()
            : null;

        if (! $existing && $barcode) {
            $existing = DeviceUnit::where('product_id', $product->id)
                ->where('barcode', $barcode)
                ->first();
        }

        $this->ensureUniqueDeviceSku($sku, $barcode, optional($existing)->id);

        $duplicateActiveImei = $this->findDuplicateActiveDeviceUnit(
            $imei1,
            $imei2,
            optional($existing)->id
        );

        if ($duplicateActiveImei) {
            $matchedBy = $this->matchedDeviceIdentifier($duplicateActiveImei, $imei1, $imei2, null);

            throw ValidationException::withMessages([
                'variants' => "Duplicate active/in-stock {$matchedBy} found under {$duplicateActiveImei->product_name} (SKU: {$duplicateActiveImei->sku}). Same IMEI can be bought back only after the previous unit is sold/out_of_stock.",
            ]);
        }

        $activationStatus = strtolower((string) (
            $unitPayload['activation_status']
            ?? $sharedVariantPayload['activation_status']
            ?? 'inactive'
        ));
        $activationStatus = in_array($activationStatus, ['inactive', 'not_activated', 'boxed', 'active', 'activated', 'open_box'], true)
            ? $activationStatus
            : 'inactive';

        $batteryHealth = in_array($activationStatus, ['inactive', 'not_activated', 'boxed'], true)
            ? 100
            : $this->clampInt(
                $unitPayload['battery_health']
                    ?? $sharedVariantPayload['battery_health']
                    ?? 100,
                0,
                100
            );

        $resolvedBranchId = $this->resolveInventoryBranchId(
            $unitPayload['branch_id'] ?? $branchId
        );

        $resolvedSupplierId = $unitPayload['supplier_id']
            ?? $supplierId
            ?? $variant->supplier_id
            ?? $product->supplier_id;

        $status = $existing?->status;
        if (! $status || ! in_array(strtolower((string) $status), [
            'available', 'in_stock', 'active', 'reserved', 'ready_for_sale', 'not_activated', 'boxed',
        ], true)) {
            $status = 'available';
        }

        $payload = [
            'supplier_id' => $resolvedSupplierId ?: null,
            'branch_id' => $resolvedBranchId ?: null,
            'product_id' => $product->id,
            'product_variant_id' => $variant->id,
            'product_name' => $product->name,
            'model_number' => $this->stringOrNull(
                $unitPayload['model_number']
                    ?? $sharedVariantPayload['model_number']
                    ?? $variant->model_number
                    ?? null
            ),
            'sku' => $sku,
            'imei_1' => $imei1,
            'imei_2' => $imei2,
            'barcode' => $barcode,
            'barcode_source' => 'sku',
            'is_barcode_printed' => $existing?->is_barcode_printed ?? false,
            'purchase_cost' => $this->moneyOrZero($unitPayload['purchase_price'] ?? null),
            'selling_price' => $this->moneyOrZero($unitPayload['sale_price'] ?? null),
            'market_price' => $this->moneyOrNull($unitPayload['market_price'] ?? null),
            'status' => $status,
            'activation_status' => $activationStatus,
            'warranty_type' => $this->stringOrNull(
                $unitPayload['warranty']
                    ?? $sharedVariantPayload['warranty']
                    ?? null
            ),
            'note' => $this->stringOrNull($unitPayload['short_note'] ?? null),
            'color_name' => $this->stringOrNull(
                $sharedVariantPayload['color_name']
                    ?? $unitPayload['color_name']
                    ?? null
            ),
            'region' => $this->stringOrNull(
                $sharedVariantPayload['region']
                    ?? $unitPayload['region']
                    ?? null
            ),
            'sim_network' => $this->stringOrNull(
                $sharedVariantPayload['sim_network']
                    ?? $unitPayload['sim_network']
                    ?? null
            ),
            'condition' => $this->stringOrNull($product->condition ?: $product->product_type) ?: 'new',
            'ram' => $this->stringOrNull(
                $sharedVariantPayload['ram']
                    ?? $unitPayload['ram']
                    ?? 'Initial/Unknown'
            ) ?: 'Initial/Unknown',
            'storage' => $this->stringOrNull(
                $sharedVariantPayload['storage']
                    ?? $unitPayload['storage']
                    ?? null
            ),
            'battery_health' => $batteryHealth,
            'updated_by' => optional($request->user())->id,
        ];

        if ($existing) {
            $existing->update($payload);

            return $existing->fresh();
        }

        $payload['created_by'] = optional($request->user())->id;

        return DeviceUnit::create($payload);
    }

    private function deactivateRemovedDeviceUnits(Request $request, Product $product): array
    {
        $requestedIds = $this->decodeJsonField($request->input('removed_device_unit_ids'));

        if (! is_array($requestedIds) || empty($requestedIds)) {
            return [];
        }

        $ids = collect($requestedIds)
            ->map(fn ($value) => (int) $value)
            ->filter(fn ($value) => $value > 0)
            ->unique()
            ->values();

        if ($ids->isEmpty()) {
            return [];
        }

        $devices = DeviceUnit::where('product_id', $product->id)
            ->whereIn('id', $ids)
            ->get();

        $affectedVariantIds = [];

        foreach ($devices as $device) {
            if (
                $device->sale_id
                || in_array(strtolower((string) $device->status), [
                    'sold', 'reserved', 'in_service', 'awaiting_inspection', 'under_inspection',
                ], true)
            ) {
                throw ValidationException::withMessages([
                    'variants' => "Device Unit #{$device->id} cannot be removed because it has sale/reservation/service history.",
                ]);
            }

            $affectedVariantIds[] = (int) $device->product_variant_id;

            $device->update([
                'status' => 'inactive',
                'saleable' => false,
                'website_published' => false,
                'note' => trim(
                    (string) $device->note
                    . ((string) $device->note !== '' ? PHP_EOL : '')
                    . 'Removed from Product Entry stock by user.'
                ),
                'updated_by' => optional($request->user())->id,
            ]);
        }

        return array_values(array_unique(array_filter($affectedVariantIds)));
    }

    private function syncVariantInventoryFromDevices(ProductVariant $variant, $fallbackBranchId = null): void
    {
        $activeStatuses = ['available', 'in_stock', 'active', 'reserved', 'ready_for_sale'];

        $activeQuery = DeviceUnit::where('product_id', $variant->product_id)
            ->where('product_variant_id', $variant->id)
            ->whereNull('deleted_at')
            ->whereIn('status', $activeStatuses);

        $activeCount = (clone $activeQuery)->count();

        $minimumSalePrice = (clone $activeQuery)
            ->where('selling_price', '>', 0)
            ->min('selling_price');

        $maximumMarketPrice = (clone $activeQuery)
            ->where('market_price', '>', 0)
            ->max('market_price');

        $updates = [
            'stock_quantity' => $activeCount,
            'opening_stock_quantity' => max(
                (int) $variant->opening_stock_quantity,
                $activeCount
            ),
        ];

        if ($minimumSalePrice !== null && (float) $minimumSalePrice > 0) {
            $updates['sale_price'] = $minimumSalePrice;
        }

        if ($maximumMarketPrice !== null && (float) $maximumMarketPrice > 0) {
            $updates['market_price'] = $maximumMarketPrice;
            $updates['regular_price'] = $maximumMarketPrice;
        }

        $variant->update($updates);

        $branchIds = BranchStock::where('product_id', $variant->product_id)
            ->where('product_variant_id', $variant->id)
            ->pluck('branch_id')
            ->merge(
                DeviceUnit::where('product_id', $variant->product_id)
                    ->where('product_variant_id', $variant->id)
                    ->whereNull('deleted_at')
                    ->pluck('branch_id')
            )
            ->push($this->resolveInventoryBranchId($fallbackBranchId))
            ->filter()
            ->map(fn ($value) => (int) $value)
            ->unique()
            ->values();

        foreach ($branchIds as $branchId) {
            $branchCount = DeviceUnit::where('product_id', $variant->product_id)
                ->where('product_variant_id', $variant->id)
                ->whereNull('deleted_at')
                ->where('branch_id', $branchId)
                ->whereIn('status', $activeStatuses)
                ->count();

            $this->syncBranchStockQuantity(
                $variant->product_id,
                $variant->id,
                $branchId,
                $branchCount
            );
        }
    }

    private function findDuplicateActiveDeviceUnit(?string $imei1, ?string $imei2, ?int $ignoreId = null): ?DeviceUnit
    {
        $imeis = array_values(array_filter([$imei1, $imei2]));

        if (empty($imeis)) {
            return null;
        }

        return DeviceUnit::whereNull('deleted_at')
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->whereIn('status', ['available', 'in_stock', 'active', 'reserved'])
            ->where(function ($query) use ($imeis) {
                foreach ($imeis as $value) {
                    $query->orWhere('imei_1', $value)->orWhere('imei_2', $value);
                }
            })
            ->first();
    }

    private function ensureUniqueDeviceSku(string $sku, string $barcode, ?int $ignoreId = null): void
    {
        $duplicate = DeviceUnit::withTrashed()
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->where(function ($query) use ($sku, $barcode) {
                $query->where('sku', $sku)->orWhere('barcode', $barcode);
            })
            ->first();

        if ($duplicate) {
            throw ValidationException::withMessages([
                'variants' => "Duplicate SKU/Barcode {$sku} found. SKU must be unique for every stock-in/sale cycle.",
            ]);
        }
    }

    private function matchedDeviceIdentifier(DeviceUnit $device, ?string $imei1, ?string $imei2, ?string $barcode): string
    {
        if ($imei1 && ($device->imei_1 === $imei1 || $device->imei_2 === $imei1)) {
            return "IMEI {$imei1}";
        }

        if ($imei2 && ($device->imei_1 === $imei2 || $device->imei_2 === $imei2)) {
            return "IMEI {$imei2}";
        }

        if ($barcode && $device->barcode === $barcode) {
            return "SKU/Barcode {$barcode}";
        }

        return 'identifier';
    }

    private function storeVariantImages(Request $request, Product $product, ProductVariant $variant, int $index, ProductMediaService $mediaService): void
    {
        $this->unlinkVariantImages($request, $product, $variant, $index);
        $this->attachGalleryImages($request, $product, $variant, $index);

        $field = "variant_images_{$index}";

        if (!$request->hasFile($field)) {
            $this->syncProductMainImage($product->fresh());
            return;
        }

        $currentCount = ProductImage::where('product_variant_id', $variant->id)->count();
        $files = array_slice($request->file($field), 0, max(0, 5 - $currentCount));

        foreach ($files as $mediaIndex => $mediaFile) {
            $media = $mediaService->processUploadedMedia($mediaFile);

            ProductImage::create([
                'product_id' => $product->id,
                'product_variant_id' => $variant->id,
                'variant_key' => $variant->sku,
                'media_type' => $media['media_type'],
                'image_path' => $media['image_path'],
                'thumbnail_path' => $media['thumbnail_path'],
                'original_name' => $media['original_name'],
                'mime_type' => $media['mime_type'],
                'size_kb' => $media['size_kb'],
                'processed_size_kb' => $media['processed_size_kb'],
                'is_primary' => !$product->image && $index === 0 && $mediaIndex === 0 && $media['media_type'] === 'image',
                'sort_order' => ($index * 10) + $currentCount + $mediaIndex + 1,
            ]);
        }

        $this->syncProductMainImage($product->fresh());
    }

    private function unlinkVariantImages(Request $request, Product $product, ProductVariant $variant, int $index): void
    {
        $ids = $this->decodeJsonField($request->input("variant_remove_image_ids_{$index}"));

        if (!is_array($ids) || empty($ids)) {
            return;
        }

        ProductImage::where('product_id', $product->id)
            ->where('product_variant_id', $variant->id)
            ->whereIn('id', array_filter($ids))
            ->update([
                'product_variant_id' => null,
                'variant_key' => null,
            ]);
    }

    private function attachGalleryImages(Request $request, Product $product, ProductVariant $variant, int $index): void
    {
        $ids = $this->decodeJsonField($request->input("variant_gallery_image_ids_{$index}"));

        if (!is_array($ids) || empty($ids)) {
            return;
        }

        $currentCount = ProductImage::where('product_variant_id', $variant->id)->count();
        $remainingSlots = max(0, 5 - $currentCount);

        if ($remainingSlots === 0) {
            return;
        }

        $sourceItems = ProductImage::whereIn('id', array_filter($ids))
            ->where('media_type', 'image')
            ->limit($remainingSlots)
            ->get();

        foreach ($sourceItems as $offset => $source) {
            if (ProductImage::where('product_variant_id', $variant->id)->where('image_path', $source->image_path)->exists()) {
                continue;
            }

            ProductImage::create([
                'product_id' => $product->id,
                'product_variant_id' => $variant->id,
                'variant_key' => $variant->sku,
                'media_type' => 'image',
                'image_path' => $source->image_path,
                'thumbnail_path' => $source->thumbnail_path,
                'original_name' => $source->original_name,
                'mime_type' => $source->mime_type,
                'size_kb' => $source->size_kb,
                'processed_size_kb' => $source->processed_size_kb,
                'is_primary' => !$product->image && $index === 0 && $offset === 0,
                'sort_order' => ($index * 10) + $currentCount + $offset + 1,
            ]);
        }
    }

    private function syncBranchStockFromDevices(int $productId, int $variantId, $branchId): void
    {
        // Product Device Stock Sync: total variant stock + branch-wise stock row.
        $branchId = $this->resolveInventoryBranchId($branchId);
        $totalAvailableDeviceCount = $this->activeDeviceCount($productId, $variantId);
        $branchAvailableDeviceCount = $this->activeDeviceCount($productId, $variantId, $branchId);

        ProductVariant::where('id', $variantId)->update([
            'stock_quantity' => $totalAvailableDeviceCount,
        ]);

        $this->syncBranchStockQuantity($productId, $variantId, $branchId, $branchAvailableDeviceCount);
    }

    private function syncBranchStockQuantity(int $productId, int $variantId, $branchId, int $quantity): void
    {
        // Product Device Stock Sync: never leave device stock outside branch stock.
        $branchId = $this->resolveInventoryBranchId($branchId);

        if (!$branchId) {
            return;
        }

        BranchStock::updateOrCreate(
            [
                'branch_id' => $branchId,
                'product_id' => $productId,
                'product_variant_id' => $variantId,
            ],
            [
                'quantity' => max(0, $quantity),
                'alert_quantity' => 5,
            ]
        );
    }

    private function activeDeviceCount(int $productId, int $variantId, $branchId = null): int
    {
        $query = DeviceUnit::where('product_id', $productId)
            ->where('product_variant_id', $variantId)
            ->whereNull('deleted_at')
            ->whereIn('status', ['available', 'in_stock', 'active', 'reserved', 'ready_for_sale']); // Saleable inspected stock counts

        if ($branchId) {
            $query->where('branch_id', (int) $branchId);
        }

        return $query->count();
    }

    private function resolveInventoryBranchId($branchId): ?int
    {
        $branchId = (int) ($branchId ?: 0);

        if ($branchId > 0 && \Illuminate\Support\Facades\DB::table('branches')->where('id', $branchId)->exists()) {
            return $branchId;
        }

        if (\Illuminate\Support\Facades\Schema::hasTable('settings')) {
            $settingBranchId = (int) (
                \Illuminate\Support\Facades\DB::table('settings')->where('key', 'prime_stock_branch_id')->value('value')
                ?: \Illuminate\Support\Facades\DB::table('settings')->where('key', 'default_branch_id')->value('value')
                ?: 0
            );

            if ($settingBranchId > 0 && \Illuminate\Support\Facades\DB::table('branches')->where('id', $settingBranchId)->exists()) {
                return $settingBranchId;
            }
        }

        $primeBranchId = (int) (
            \Illuminate\Support\Facades\DB::table('branches')
                ->where('code', 'PRIME-STOCK')
                ->orWhere('name', 'like', '%Prime Stock%')
                ->value('id') ?: 0
        );

        return $primeBranchId > 0 ? $primeBranchId : null;
    }

    private function syncProductStockQuantity(Product $product): void
    {
        $product->loadMissing('variants');
        $product->update([
            'stock_quantity' => (int) $product->variants->sum('stock_quantity'),
        ]);
    }

    private function ensureUniqueVariantIdentity(string $sku, string $barcode, int $productId, ?int $ignoreVariantId = null): void
    {
        $duplicate = ProductVariant::where(function ($query) use ($sku, $barcode) {
                $query->where('sku', $sku)->orWhere('barcode', $barcode);
            })
            ->when($ignoreVariantId, fn ($query) => $query->where('id', '!=', $ignoreVariantId))
            ->first();

        if ($duplicate) {
            throw ValidationException::withMessages([
                'variants' => "Duplicate Variant SKU/Barcode {$sku} found. Each catalog variant needs one unique NST identifier; physical units keep their own SKU/Barcode.",
            ]);
        }
    }

    private function normalizeNstSku($value): string
    {
        $text = strtoupper((string) ($value ?: ''));
        $text = preg_replace('/^NST-/i', '', $text);
        $digits = preg_replace('/\D/', '', $text);

        if ($digits === '') {
            return $this->generateUniqueNstNineDigitIdentifier();
        }

        if (strlen($digits) !== 9) {
            throw ValidationException::withMessages([
                'variants' => __('messages.product.sku_format_invalid'),
            ]);
        }

        return 'NST-' . $digits;
    }

    private function booleanToInt($value): int
    {
        if (is_bool($value)) {
            return $value ? 1 : 0;
        }

        if (is_numeric($value)) {
            return ((int) $value) === 1 ? 1 : 0;
        }

        $normalized = strtolower(trim((string) $value));

        return in_array($normalized, ['yes', 'true', 'on', 'enabled', 'mobile', 'device', 'imei', '1'], true) ? 1 : 0;
    }

    private function cleanIdentifier($value): ?string
    {
        $text = trim((string) ($value ?? ''));
        return $text === '' ? null : $text;
    }

    private function clampInt($value, int $min, int $max): int
    {
        $number = $this->intOrDefault($value, $min);
        return max($min, min($max, $number));
    }

    private function buildVariantName(array $parts, string $fallback): string
    {
        $name = collect($parts)
            ->filter(fn ($part) => $part !== null && $part !== '')
            ->implode(' / ');

        return $name !== '' ? $name : ucfirst(str_replace('_', ' ', $fallback));
    }

    private function storeProductVideo(Request $request, Product $product, ProductMediaService $mediaService): void
    {
        app(ProductContentService::class)->storeProductVideo($request, $product);
    }

    private function storeMultipleMedia(Request $request, Product $product, ProductMediaService $mediaService): void
    {
        if (!$request->hasFile('images')) {
            return;
        }

        $existingMediaCount = $product->images()->count();

        foreach ($request->file('images') as $index => $mediaFile) {
            $media = $mediaService->processUploadedMedia($mediaFile);

            ProductImage::create([
                'product_id' => $product->id,
                'media_type' => $media['media_type'],
                'image_path' => $media['image_path'],
                'thumbnail_path' => $media['thumbnail_path'],
                'original_name' => $media['original_name'],
                'mime_type' => $media['mime_type'],
                'size_kb' => $media['size_kb'],
                'processed_size_kb' => $media['processed_size_kb'],
                'is_primary' => $existingMediaCount === 0 && $index === 0,
                'sort_order' => $existingMediaCount + $index + 1,
            ]);

            if (
                !$product->image &&
                $media['media_type'] === 'image' &&
                $existingMediaCount === 0 &&
                $index === 0
            ) {
                $product->update([
                    'image' => $media['image_path'],
                ]);
            }
        }
    }

    private function removeSelectedMedia(Product $product, $removeImageIds): void
    {
        if (is_string($removeImageIds)) {
            $removeImageIds = json_decode($removeImageIds, true);
        }

        if (!is_array($removeImageIds)) {
            return;
        }

        $removeImageIds = array_filter($removeImageIds);

        if (count($removeImageIds) === 0) {
            return;
        }

        $mediaItems = ProductImage::where('product_id', $product->id)
            ->whereIn('id', $removeImageIds)
            ->get();

        foreach ($mediaItems as $media) {
            $this->deleteMediaFiles($media);
            $media->delete();
        }

        $this->syncProductMainImage($product->fresh());
    }

    private function syncProductMainImage(Product $product): void
    {
        $primaryImageMedia = $product->images()
            ->where('media_type', 'image')
            ->orderByDesc('is_primary')
            ->orderBy('sort_order')
            ->orderBy('id')
            ->first();

        if ($primaryImageMedia) {
            $product->update([
                'image' => $primaryImageMedia->image_path,
            ]);

            return;
        }

        $product->update([
            'image' => null,
        ]);
    }

    private function deleteMediaFiles(ProductImage $media): void
    {
        if ($media->image_path && Storage::disk('public')->exists($media->image_path)) {
            Storage::disk('public')->delete($media->image_path);
        }

        if (
            $media->thumbnail_path &&
            $media->thumbnail_path !== $media->image_path &&
            Storage::disk('public')->exists($media->thumbnail_path)
        ) {
            Storage::disk('public')->delete($media->thumbnail_path);
        }
    }

    private function decodeJsonField($value): ?array
    {
        if (!$value) {
            return null;
        }

        if (is_array($value)) {
            return $value;
        }

        $decoded = json_decode($value, true);

        return is_array($decoded) ? $decoded : null;
    }

    private function generateMetaTitle(array $data): string
    {
        $name = $data['name'] ?? 'Product';
        $brand = $data['brand'] ?? '';
        $price = $data['sale_price'] ?? '';

        $title = trim($brand . ' ' . $name);

        if ($price !== '') {
            $title .= ' Price in Bangladesh';
        }

        return Str::limit($title, 60, '');
    }

    private function generateMetaDescription(array $data): string
    {
        $name = $data['name'] ?? 'This product';
        $brand = $data['brand'] ?? '';
        $model = $data['model'] ?? '';
        $price = $data['sale_price'] ?? '';
        $condition = $data['condition'] ?? '';

        $description = trim("$brand $name $model");

        if ($price !== '') {
            $description .= " is available at New Singapur Telecom with price BDT $price.";
        } else {
            $description .= " is available at New Singapur Telecom.";
        }

        if ($condition !== '') {
            $description .= " Condition: " . str_replace('_', ' ', $condition) . ".";
        }

        $description .= " Order online or visit our store for authentic products and reliable service.";

        return Str::limit($description, 160, '');
    }

    private function generateUniqueSlug(string $name, ?int $ignoreId = null): string
    {
        $baseSlug = Str::slug($name) ?: 'product';
        $slug = $baseSlug;
        $count = 1;

        while (
            Product::where('slug', $slug)
                ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $slug = $baseSlug . '-' . $count;
            $count++;
        }

        return $slug;
    }

    private function generateUniqueBarcode(string $prefix = 'NST'): string
    {
        return $this->generateUniqueNstNineDigitIdentifier();
    }

    private function generateUniqueSku(string $prefix = 'NST'): string
    {
        return $this->generateUniqueNstNineDigitIdentifier();
    }

    private function generateUniqueNstNineDigitIdentifier(): string
    {
        do {
            $identifier = 'NST-' . random_int(100000000, 999999999);
        } while (
            Product::where('sku', $identifier)->exists() ||
            Product::where('barcode', $identifier)->exists() ||
            ProductVariant::where('sku', $identifier)->exists() ||
            ProductVariant::where('barcode', $identifier)->exists() ||
            DeviceUnit::withTrashed()->where('sku', $identifier)->exists() ||
            DeviceUnit::withTrashed()->where('barcode', $identifier)->exists()
        );

        return $identifier;
    }

    private function moneyOrZero($value): float
    {
        if ($value === null || $value === '') {
            return 0;
        }

        return (float) $value;
    }

    private function moneyOrNull($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (float) $value;
    }

    private function intOrZero($value): int
    {
        if ($value === null || $value === '') {
            return 0;
        }

        return (int) $value;
    }

    private function intOrDefault($value, int $default): int
    {
        if ($value === null || $value === '') {
            return $default;
        }

        return (int) $value;
    }

    private function stringOrNull($value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return (string) $value;
    }
}