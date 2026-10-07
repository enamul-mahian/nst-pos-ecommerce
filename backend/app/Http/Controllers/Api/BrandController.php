<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Product;
use Illuminate\Http\Request;
use App\Services\AccessControlService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BrandController extends Controller
{
    public function publicIndex(Request $request)
    {
        $query = Brand::query()->where('status', 'active');

        if ($request->filled('search')) {
            $this->applySearch($query, $request->search);
        }

        $brands = $query
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->map(function ($brand) {
                return $this->formatBrand($brand);
            });

        return response()->json([
            'status' => true,
            'message' => 'Public brands loaded successfully.',
            'data' => $brands,
        ]);
    }

    public function publicShowBySlug(Request $request, Brand $brand)
    {
        if ($brand->status !== 'active') {
            return response()->json([
                'status' => false,
                'message' => 'Brand not found.',
            ], 404);
        }

        $limit = max(1, min((int) $request->integer('limit', 48), 100));
        $query = Product::query()
            ->with(['images', 'variants.images', 'categoryInfo', 'brandInfo'])
            ->where('brand_id', $brand->id)
            ->latest('updated_at');

        if (Schema::hasColumn('products', 'website_published')) {
            $query->where('website_published', true);
        }

        if (Schema::hasColumn('products', 'status')) {
            $query->where(function ($statusQuery) {
                $statusQuery->whereNull('status')
                    ->orWhereIn('status', ['active', 'in_stock', 'available', 'out_of_stock']);
            });
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->get('search'));
            $query->where(function ($searchQuery) use ($search) {
                foreach (['name', 'sku', 'model', 'category'] as $column) {
                    if (Schema::hasColumn('products', $column)) {
                        $searchQuery->orWhere($column, 'like', "%{$search}%");
                    }
                }
            });
        }

        if ($request->filled('category')) {
            $category = trim((string) $request->get('category'));
            $query->where(function ($categoryQuery) use ($category) {
                if (Schema::hasColumn('products', 'category')) {
                    $categoryQuery->where('category', 'like', "%{$category}%");
                }
                $categoryQuery->orWhereHas('categoryInfo', fn ($related) => $related->where('name', 'like', "%{$category}%"));
            });
        }

        if ($request->filled('condition')) {
            $condition = trim((string) $request->get('condition'));
            $query->where(function ($conditionQuery) use ($condition) {
                if (Schema::hasColumn('products', 'condition')) {
                    $conditionQuery->where('condition', $condition);
                }
                if (Schema::hasColumn('products', 'product_type')) {
                    $conditionQuery->orWhere('product_type', $condition);
                }
            });
        }

        $products = $query->limit($limit)->get();
        $categoryCount = $products
            ->map(fn (Product $product) => optional($product->categoryInfo)->name ?? $product->category)
            ->filter()
            ->unique()
            ->count();

        return response()->json([
            'status' => true,
            'message' => 'Public brand catalog loaded successfully.',
            'data' => [
                'brand' => $this->formatBrand($brand),
                'stats' => [
                    'products' => $products->count(),
                    'categories' => $categoryCount,
                ],
                'products' => $products
                    ->map(fn (Product $product) => $this->formatPublicProduct($product))
                    ->values(),
            ],
        ]);
    }

    public function logoSuggestion(Request $request)
    {
        $this->ensureCanManageCatalog($request);

        $validated = $request->validate([
            'website' => ['required', 'string', 'max:255'],
            'theme' => ['nullable', Rule::in(['light', 'dark'])],
            'type' => ['nullable', Rule::in(['logo', 'icon', 'symbol'])],
        ]);

        $clientId = trim((string) config('services.brandfetch.client_id'));
        if ($clientId === '') {
            return response()->json([
                'status' => false,
                'message' => 'Brandfetch is not configured. Add BRAND_FETCH_CLIENT_ID to backend .env.',
            ], 422);
        }

        $domain = $this->normalizeDomain($validated['website']);
        if ($domain === null) {
            return response()->json([
                'status' => false,
                'message' => 'Enter a valid brand website or domain.',
            ], 422);
        }

        $query = http_build_query(array_filter([
            'c' => $clientId,
            'theme' => $validated['theme'] ?? 'light',
            'type' => $validated['type'] ?? 'logo',
            'fallback' => 'lettermark',
        ]));

        return response()->json([
            'status' => true,
            'message' => 'Brand logo suggestion generated.',
            'data' => [
                'domain' => $domain,
                'logo_url' => 'https://cdn.brandfetch.io/' . rawurlencode($domain) . '?' . $query,
            ],
        ]);
    }

    public function all(Request $request)
    {
        $query = Brand::query();

        if ($request->filled('search')) {
            $this->applySearch($query, $request->search);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        } else {
            $query->where('status', 'active');
        }

        $brands = $query
            ->orderBy('sort_order')
            ->orderBy('name')
            ->limit($request->get('limit', 50))
            ->get()
            ->map(function ($brand) {
                return $this->formatBrand($brand);
            });

        return response()->json([
            'status' => true,
            'message' => 'All brands loaded successfully.',
            'data' => $brands,
        ]);
    }

    public function index(Request $request)
    {
        $query = Brand::query();

        if ($request->filled('search')) {
            $this->applySearch($query, $request->search);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $brands = $query
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate($request->get('per_page', 15));

        $brands->getCollection()->transform(function ($brand) {
            return $this->formatBrand($brand);
        });

        return response()->json([
            'status' => true,
            'message' => 'Brands loaded successfully.',
            'data' => $brands,
        ]);
    }

    public function store(Request $request)
    {
        $this->ensureCanManageCatalog($request);

        $validated = $this->validateBrand($request);

        $data = [
            'name' => $validated['name'],
            'slug' => ($validated['slug'] ?? null) ?: Brand::generateUniqueSlug($validated['name']),
            'description' => $validated['description'] ?? null,
            'website' => $validated['website'] ?? null,
            'page_settings' => $this->normalizePageSettings($validated['page_settings'] ?? []),
            'sort_order' => $validated['sort_order'] ?? 0,
            'status' => $validated['status'] ?? 'active',
            'created_by' => auth()->id(),
            'updated_by' => auth()->id(),
        ];

        if ($request->hasFile('logo')) {
            $data['logo'] = $request->file('logo')->store('brands/logos', 'public');
        } else {
            $data['logo'] = $validated['logo'] ?? null;
        }

        if ($request->hasFile('banner')) {
            $data['banner'] = $request->file('banner')->store('brands/banners', 'public');
        } else {
            $data['banner'] = $validated['banner'] ?? null;
        }

        $brand = Brand::create($data);

        return response()->json([
            'status' => true,
            'message' => 'Brand created successfully.',
            'data' => $this->formatBrand($brand),
        ], 201);
    }

    public function show(Brand $brand)
    {
        return response()->json([
            'status' => true,
            'message' => 'Brand details loaded successfully.',
            'data' => $this->formatBrand($brand),
        ]);
    }

    public function update(Request $request, Brand $brand)
    {
        $this->ensureCanManageCatalog($request);

        $validated = $this->validateBrand($request, $brand->id);

        $data = [
            'name' => $validated['name'],
            'slug' => ($validated['slug'] ?? null) ?: Brand::generateUniqueSlug($validated['name'], $brand->id),
            'description' => $validated['description'] ?? null,
            'website' => $validated['website'] ?? null,
            'page_settings' => $this->normalizePageSettings($validated['page_settings'] ?? $brand->page_settings ?? []),
            'sort_order' => $validated['sort_order'] ?? 0,
            'status' => $validated['status'] ?? 'active',
            'updated_by' => auth()->id(),
        ];

        if ($request->hasFile('logo')) {
            if ($brand->logo && Storage::disk('public')->exists($brand->logo)) {
                Storage::disk('public')->delete($brand->logo);
            }

            $data['logo'] = $request->file('logo')->store('brands/logos', 'public');
        } elseif ($request->has('logo')) {
            $data['logo'] = $validated['logo'] ?? null;
        }

        if ($request->hasFile('banner')) {
            if ($brand->banner && Storage::disk('public')->exists($brand->banner)) {
                Storage::disk('public')->delete($brand->banner);
            }

            $data['banner'] = $request->file('banner')->store('brands/banners', 'public');
        } elseif ($request->has('banner')) {
            $data['banner'] = $validated['banner'] ?? null;
        }

        $brand->update($data);

        return response()->json([
            'status' => true,
            'message' => 'Brand updated successfully.',
            'data' => $this->formatBrand($brand->fresh()),
        ]);
    }


    public function bulkDestroy(Request $request)
    {
        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['required', 'integer', 'distinct', 'exists:brands,id'],
        ]);

        $brandIds = collect($validated['ids'])
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values();

        $brands = Brand::whereIn('id', $brandIds)->get();

        $deleted = [];
        $skipped = [];

        foreach ($brands as $brand) {
            $productCount = $brand->products()->count();

            if ($productCount > 0) {
                $skipped[] = [
                    'id' => $brand->id,
                    'name' => $brand->name,
                    'product_count' => $productCount,
                    'reason' => 'This brand has products. Move products to another brand first.',
                ];

                continue;
            }

            $deleted[] = [
                'id' => $brand->id,
                'name' => $brand->name,
            ];

            $brand->delete();
        }

        $deletedCount = count($deleted);
        $skippedCount = count($skipped);

        return response()->json([
            'status' => true,
            'message' => "Bulk brand delete completed. Deleted: {$deletedCount}, Skipped: {$skippedCount}.",
            'data' => [
                'requested_count' => $brandIds->count(),
                'deleted_count' => $deletedCount,
                'skipped_count' => $skippedCount,
                'deleted' => $deleted,
                'skipped' => $skipped,
            ],
        ]);
    }

    public function destroy(Brand $brand)
    {
        $this->ensureCanManageCatalog(request());

        if ($brand->products()->count() > 0) {
            return response()->json([
                'status' => false,
                'message' => 'This brand has products. Please move products to another brand first.',
            ], 422);
        }

        $brand->delete();

        return response()->json([
            'status' => true,
            'message' => 'Brand deleted successfully.',
        ]);
    }

    private function validateBrand(Request $request, ?int $brandId = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('brands', 'slug')->ignore($brandId),
            ],
            'description' => ['nullable', 'string'],
            'logo' => ['nullable'],
            'banner' => ['nullable'],
            'website' => ['nullable', 'string', 'max:255'],
            'page_settings' => ['nullable', 'array'],
            'page_settings.primary' => ['nullable', 'string', 'max:30'],
            'page_settings.secondary' => ['nullable', 'string', 'max:30'],
            'page_settings.accent' => ['nullable', 'string', 'max:30'],
            'page_settings.founded' => ['nullable', 'string', 'max:50'],
            'page_settings.headquarters' => ['nullable', 'string', 'max:255'],
            'page_settings.meta_title' => ['nullable', 'string', 'max:255'],
            'page_settings.meta_description' => ['nullable', 'string', 'max:500'],
            'page_settings.show_stats' => ['nullable', 'boolean'],
            'page_settings.show_categories' => ['nullable', 'boolean'],
            'page_settings.show_filters' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ]);
    }

    private function applySearch($query, string $search): void
    {
        $query->where(function ($q) use ($search) {
            $q->where('name', 'like', "%{$search}%")
                ->orWhere('slug', 'like', "%{$search}%")
                ->orWhere('description', 'like', "%{$search}%");
        });
    }

    private function formatBrand(Brand $brand): array
    {
        return [
            'id' => $brand->id,
            'name' => $brand->name,
            'slug' => $brand->slug,
            'description' => $brand->description,
            'logo' => $brand->logo,
            'logo_url' => $this->fileUrl($brand->logo),
            'banner' => $brand->banner,
            'banner_url' => $this->fileUrl($brand->banner),
            'website' => $brand->website,
            'page_settings' => $this->normalizePageSettings($brand->page_settings ?? []),
            'sort_order' => $brand->sort_order,
            'status' => $brand->status,
            'created_at' => $brand->created_at,
            'updated_at' => $brand->updated_at,
        ];
    }

    private function fileUrl(?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        if (Str::startsWith($path, ['http://', 'https://'])) {
            return $path;
        }

        return asset('storage/' . ltrim($path, '/'));
    }

    private function normalizePageSettings(array $settings): array
    {
        return [
            'primary' => $settings['primary'] ?? '#15803d',
            'secondary' => $settings['secondary'] ?? '#064e3b',
            'accent' => $settings['accent'] ?? '#f59e0b',
            'founded' => $settings['founded'] ?? null,
            'headquarters' => $settings['headquarters'] ?? null,
            'meta_title' => $settings['meta_title'] ?? null,
            'meta_description' => $settings['meta_description'] ?? null,
            'show_stats' => array_key_exists('show_stats', $settings) ? (bool) $settings['show_stats'] : true,
            'show_categories' => array_key_exists('show_categories', $settings) ? (bool) $settings['show_categories'] : true,
            'show_filters' => array_key_exists('show_filters', $settings) ? (bool) $settings['show_filters'] : true,
        ];
    }

    private function normalizeDomain(string $value): ?string
    {
        $candidate = trim(strtolower($value));
        if ($candidate === '') {
            return null;
        }

        if (! Str::startsWith($candidate, ['http://', 'https://'])) {
            $candidate = 'https://' . $candidate;
        }

        $host = parse_url($candidate, PHP_URL_HOST);
        if (! is_string($host) || $host === '') {
            return null;
        }

        $host = preg_replace('/^www\./i', '', $host);
        return filter_var($host, FILTER_VALIDATE_DOMAIN, FILTER_FLAG_HOSTNAME) ? $host : null;
    }

    private function formatPublicProduct(Product $product): array
    {
        $product->loadMissing(['images', 'variants.images', 'categoryInfo', 'brandInfo']);

        $images = $product->images
            ->sortBy([['is_primary', 'desc'], ['sort_order', 'asc'], ['id', 'asc']])
            ->map(fn ($image) => [
                'id' => $image->id,
                'url' => $image->media_url ?? $image->image_url,
                'thumbnail_url' => $image->thumbnail_url,
                'is_primary' => (bool) $image->is_primary,
            ])
            ->values();

        $variants = $product->variants->map(fn ($variant) => [
            'id' => $variant->id,
            'name' => $variant->variant_name,
            'sku' => $variant->sku,
            'barcode' => $variant->barcode,
            'color' => $variant->color_name ?? $variant->color ?? null,
            'storage' => $variant->storage,
            'region' => $variant->region ?? null,
            'sim_network' => $variant->sim_network,
            'ram' => $variant->ram ?? null,
            'price' => (float) ($variant->discount_price ?: $variant->sale_price ?: 0),
            'sale_price' => (float) ($variant->sale_price ?: 0),
            'old_price' => $variant->regular_price ?: $variant->market_price,
            'available_quantity' => (int) ($variant->stock_quantity ?? 0),
            'image' => optional($variant->images->first())->media_url
                ?? optional($variant->images->first())->image_url
                ?? $product->image_url,
            'images' => $variant->images
                ->map(fn ($image) => [
                    'id' => $image->id,
                    'url' => $image->media_url ?? $image->image_url,
                ])
                ->values(),
            'status' => $variant->status,
            'allow_preorder' => (bool) ($variant->allow_preorder ?? $product->allow_preorder ?? false),
            'warranty' => $variant->warranty,
        ])->values();

        $variantPrices = $variants->pluck('price')->filter(fn ($value) => (float) $value > 0);
        $price = $variantPrices->min()
            ?: (float) ($product->discount_price ?: $product->sale_price ?: 0);
        $oldPrice = $product->regular_price ?: $product->market_price ?: null;
        $stock = max((int) ($product->stock_quantity ?? 0), (int) $variants->sum('available_quantity'));

        $primaryImage = $images->first();
        $primaryImageUrl = is_array($primaryImage) ? ($primaryImage['url'] ?? null) : null;

        return [
            'id' => $product->id,
            'name' => $product->name,
            'slug' => $product->slug ?? (string) $product->id,
            'sku' => $product->sku,
            'barcode' => $product->barcode,
            'price' => $price,
            'sale_price' => (float) ($product->sale_price ?? $price),
            'old_price' => $oldPrice,
            'regular_price' => $product->regular_price,
            'market_price' => $product->market_price,
            'status' => $stock > 0 ? 'In Stock' : ($product->allow_preorder ? 'Pre Order' : 'Out of Stock'),
            'condition' => $product->condition ?? $product->product_type,
            'brand' => optional($product->brandInfo)->name ?? $product->brand,
            'category' => optional($product->categoryInfo)->name ?? $product->category,
            'image' => $product->image_url ?? $primaryImageUrl,
            'image_url' => $product->image_url ?? $primaryImageUrl,
            'stock_quantity' => $stock,
            'available_quantity' => $stock,
            'variants' => $variants,
            'allow_preorder' => (bool) ($product->allow_preorder ?? false),
            'website_published' => (bool) ($product->website_published ?? true),
            'show_price_at_zero_stock' => (bool) data_get($product->page_options, 'show_price_at_zero_stock', true),
            'description' => $product->description,
            'short_description' => $product->short_description,
            'specifications' => $product->specifications ?: [],
            'faqs' => $product->faqs ?: [],
            'key_features' => $product->key_features ?: [],
            'page_options' => $product->page_options ?: [],
            'images' => $images,
            'warranty' => $product->warranty,
            'official_warranty' => $product->official_warranty,
            'shop_warranty' => $product->shop_warranty,
            'whats_in_box' => $product->whats_in_box,
            'meta_title' => $product->meta_title,
            'meta_description' => $product->meta_description,
            'canonical_url' => $product->canonical_url,
            'updated_at' => optional($product->updated_at)->toDateTimeString(),
        ];
    }

    private function ensureCanManageCatalog(Request $request): void
    {
        if (! app(AccessControlService::class)->canManageCatalog($request->user())) {
            abort(response()->json([
                'status' => false,
                'message' => 'You do not have permission to manage catalog data.',
            ], 403));
        }
    }


}