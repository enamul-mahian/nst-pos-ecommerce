<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class SiteProductSyncController extends Controller
{
    public function home(Request $request)
    {
        $products = $this->products($request);

        return response()->json([
            'status' => true,
            'data' => [
                'source' => 'pos-live-sync',
                'products' => $products,
                'featured_products' => $products->take(8)->values(),
                'recent_sales' => $this->recentSales(),
                'updated_at' => now()->toDateTimeString(),
            ],
        ]);
    }

    public function index(Request $request)
    {
        return response()->json([
            'status' => true,
            'source' => 'pos-live-sync',
            'data' => $this->products($request),
        ]);
    }

    public function show(Product $product)
    {
        if (Schema::hasColumn('products', 'website_published') && ! $product->website_published) {
            return response()->json(['status' => false, 'message' => 'Product is not published.'], 404);
        }

        $product->loadMissing(['images', 'variants.images', 'variants.branch', 'variants.deviceUnits', 'categoryInfo', 'brandInfo']);

        return response()->json([
            'status' => true,
            'source' => 'pos-live-sync',
            'data' => $this->format($product),
        ]);
    }

    public function bySlug(string $slug)
    {
        $query = Product::query()->with(['images', 'variants.images', 'variants.branch', 'variants.deviceUnits', 'categoryInfo', 'brandInfo']);
        if (Schema::hasColumn('products', 'website_published')) {
            $query->where('website_published', true);
        }

        $product = $query->where(function ($inner) use ($slug) {
            $inner->where('slug', $slug)->orWhere('id', $slug);
        })->first();

        if (!$product && Schema::hasTable('slug_redirects')) {
            $redirect = DB::table('slug_redirects')
                ->where('entity_type', 'product')
                ->where('old_slug', $slug)
                ->where('is_active', true)
                ->first();

            if ($redirect) {
                return redirect()->to(url('/api/site/products/slug/' . $redirect->new_slug), (int) ($redirect->status_code ?: 301));
            }
        }

        if (!$product) {
            return response()->json(['status' => false, 'message' => 'Product not found.'], 404);
        }

        return response()->json([
            'status' => true,
            'source' => 'pos-live-sync',
            'data' => $this->format($product),
        ]);
    }

    private function products(Request $request)
    {
        $limit = max(1, min((int) $request->integer('limit', 24), 100));
        $query = Product::query()->with(['images', 'variants.images', 'variants.branch', 'variants.deviceUnits', 'categoryInfo', 'brandInfo'])->latest('updated_at');

        if (Schema::hasColumn('products', 'website_published')) {
            $query->where('website_published', true);
        }

        if (Schema::hasColumn('products', 'status')) {
            $query->where(function ($inner) {
                $inner->whereNull('status')->orWhereIn('status', ['active', 'in_stock', 'available', 'out_of_stock']);
            });
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->get('search'));
            $query->where(function ($inner) use ($search) {
                foreach (['name', 'brand', 'category', 'model'] as $column) {
                    if (Schema::hasColumn('products', $column)) {
                        $inner->orWhere($column, 'like', "%{$search}%");
                    }
                }
            });
        }

        if ($request->filled('category') && Schema::hasColumn('products', 'category')) {
            $category = trim((string) $request->get('category'));
            $query->where(function ($categoryQuery) use ($category) {
                $categoryQuery->where('category', 'like', '%' . $category . '%')
                    ->orWhereHas('categoryInfo', function ($relationQuery) use ($category) {
                        $relationQuery->where('slug', $category)
                            ->orWhere('name', 'like', '%' . $category . '%');
                    });
            });
        }

        if ($request->filled('brand_id') && Schema::hasColumn('products', 'brand_id')) {
            $query->where('brand_id', $request->integer('brand_id'));
        }

        if ($request->filled('brand')) {
            $brand = trim((string) $request->get('brand'));
            $query->where(function ($brandQuery) use ($brand) {
                if (Schema::hasColumn('products', 'brand')) {
                    $brandQuery->where('brand', 'like', '%' . $brand . '%');
                }

                $brandQuery->orWhereHas('brandInfo', function ($relationQuery) use ($brand) {
                    $relationQuery->where('slug', $brand)
                        ->orWhere('name', 'like', '%' . $brand . '%');
                });
            });
        }

        if ($request->filled('condition') && Schema::hasColumn('products', 'condition')) {
            $query->where('condition', $request->get('condition'));
        }

        $products = $query->limit($limit)->get();
        $sold = $this->soldCounts($products->pluck('id')->all());

        return $products->map(fn (Product $product) => $this->format($product) + ['sold_count' => (int) ($sold[$product->id] ?? 0)])->values();
    }

    /**
     * Units sold per product (one grouped query), used by the storefront Flash Deals "Sold" bar.
     */
    private function soldCounts(array $productIds): array
    {
        if ($productIds === [] || ! Schema::hasTable('sale_items') || ! Schema::hasColumn('sale_items', 'product_id')) {
            return [];
        }

        return DB::table('sale_items')
            ->whereIn('product_id', $productIds)
            ->groupBy('product_id')
            ->selectRaw('product_id, SUM(COALESCE(quantity, 1)) as sold')
            ->pluck('sold', 'product_id')
            ->all();
    }

    private function format(Product $product): array
    {
        $variants = $product->variants
            ->filter(fn ($variant) => strtolower((string) $variant->status) !== 'inactive')
            ->map(function ($variant) use ($product) {
                $availableUnits = $variant->relationLoaded('deviceUnits')
                    ? $variant->deviceUnits->filter(function ($device) {
                        if ($device->sale_id) {
                            return false;
                        }

                        if ($device->used_purchase_id && isset($device->website_published) && ! $device->website_published) {
                            return false;
                        }

                        if (! in_array(strtolower((string) $device->status), [
                            'available', 'ready_for_sale', 'in_stock', 'active', 'reserved',
                        ], true)) {
                            return false;
                        }

                        return ! isset($device->saleable) || (bool) $device->saleable;
                    })
                    : collect();

                $unitPrices = $availableUnits
                    ->pluck('selling_price')
                    ->filter(fn ($value) => $value !== null && (float) $value > 0)
                    ->map(fn ($value) => (float) $value);

                $minimumUnitPrice = $unitPrices->min();
                $maximumUnitPrice = $unitPrices->max();
                $effectivePrice = $minimumUnitPrice
                    ?: ($variant->discount_price ?: $variant->sale_price);

                return [
                    'id' => $variant->id,
                    'name' => $variant->variant_name,
                    'color' => $variant->color_name ?? $variant->color ?? 'Standard',
                    'storage' => $variant->storage,
                    'region' => $variant->region ?? $variant->region_variant ?? null,
                    'sim_network' => $variant->sim_network,
                    'country_region' => $variant->country_region ?: $variant->region ?: $variant->region_variant,
                    'sim_type' => $variant->sim_type,
                    'network_carrier' => $variant->network_carrier ?: $variant->sim_network,
                    'condition' => $variant->condition ?: $product->condition,
                    'branch_id' => $variant->branch_id,
                    'branch_name' => optional($variant->branch)->name,
                    'ram' => in_array(
                        strtolower(trim((string) ($variant->ram ?? $variant->ram_storage ?? ''))),
                        ['', 'default', 'initial/unknown'],
                        true
                    ) ? null : ($variant->ram ?? $variant->ram_storage),
                    'price' => $effectivePrice,
                    'sale_price' => $effectivePrice,
                    'price_min' => $minimumUnitPrice ?: $effectivePrice,
                    'price_max' => $maximumUnitPrice ?: $effectivePrice,
                    'has_unit_price_range' => $minimumUnitPrice !== null
                        && $maximumUnitPrice !== null
                        && (float) $maximumUnitPrice > (float) $minimumUnitPrice,
                    'old_price' => $variant->regular_price ?: $variant->market_price,
                    'available_quantity' => $variant->relationLoaded('deviceUnits')
                        ? $availableUnits->count()
                        : $this->availableDeviceCount($product->id, $variant->id),
                    'image' => $this->imageFromCollection($variant->images) ?: $this->imageFromProduct($product),
                    'images' => $this->formatImages($variant->images),
                    'status' => $variant->status,
                    'stock_state' => $variant->stock_state ?? null,
                    'minimum_booking_type' => $variant->minimum_booking_type ?? $product->minimum_booking_type,
                    'minimum_booking_value' => $variant->minimum_booking_value ?? $product->minimum_booking_value,
                    'emi_available' => (bool) ($variant->emi_available ?? true),
                    'allow_preorder' => (bool) ($variant->allow_preorder ?? $product->allow_preorder ?? true),
                    'warranty' => $variant->warranty,
                    'activation_status' => $variant->activation_status ?? $variant->device_status,
                    'battery_health' => $variant->battery_health,
                ];
            })
            ->values();

        $available = $this->availableDeviceCount($product->id, null);
        $stockQuantity = (int) ($product->stock_quantity ?? 0);
        $computedStock = $available > 0 ? $available : $stockQuantity;
        $firstVariant = $variants->first();
        $lowestVariantPrice = $variants->pluck('price')->filter(fn ($value) => $value !== null && $value !== '')->map(fn ($value) => (float) $value)->min();
        $price = $lowestVariantPrice ?: ($product->discount_price ?: $product->sale_price ?: ($firstVariant['price'] ?? null));
        $oldPrice = $product->regular_price ?: $product->market_price ?: $product->discount_price ?: null;

        return [
            'id' => $product->id,
            'name' => $product->name,
            'slug' => $product->slug ?? $product->id,
            'price' => $price,
            'sale_price' => $product->sale_price,
            'old_price' => $oldPrice,
            'regular_price' => $product->regular_price ?? null,
            'market_price' => $product->market_price ?? null,
            'status' => $computedStock > 0 ? 'In Stock' : ($product->allow_preorder ? 'Pre Order' : ($product->status ?: 'Out of Stock')),
            'condition' => $product->condition ?? $product->product_type ?? null,
            'brand' => optional($product->brandInfo)->name ?? $product->brand,
            'category' => optional($product->categoryInfo)->name ?? $product->category,
            'image' => $this->imageFromProduct($product),
            'image_url' => $this->imageFromProduct($product),
            'stock_quantity' => $computedStock,
            'available_quantity' => $computedStock,
            'variants' => $variants,
            'minimum_booking_type' => $product->minimum_booking_type ?? null,
            'minimum_booking_value' => $product->minimum_booking_value ?? null,
            'allow_preorder' => (bool) ($product->allow_preorder ?? false),
            'website_published' => (bool) ($product->website_published ?? true),
            'show_price_at_zero_stock' => (bool) data_get($product->page_options, 'show_price_at_zero_stock', true),
            'description' => $product->description,
            'short_description' => $product->short_description,
            'specifications' => $product->specifications ?: [],
            'specification_groups' => $this->groupedSpecifications($product->id),
            'faqs' => $product->faqs ?: [],
            'key_features' => $product->key_features ?: [],
            'page_options' => $product->page_options ?: [],
            'images' => $this->formatImages($product->images),
            'warranty' => $product->warranty,
            'official_warranty' => $product->official_warranty ?? null,
            'shop_warranty' => $product->shop_warranty ?? null,
            'whats_in_box' => $product->whats_in_box ?? null,
            'meta_title' => $product->meta_title,
            'meta_description' => $product->meta_description,
            'canonical_url' => $product->canonical_url,
            'updated_at' => optional($product->updated_at)->toDateTimeString(),
        ];
    }

    private function groupedSpecifications(int $productId): array
    {
        if (!Schema::hasTable('product_spec_groups') || !Schema::hasTable('product_spec_rows')) {
            return [];
        }

        return DB::table('product_spec_groups')
            ->where('product_id', $productId)
            ->where('is_visible', true)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->map(function ($group) {
                return [
                    'id' => (int) $group->id,
                    'name' => $group->name,
                    'rows' => DB::table('product_spec_rows')
                        ->where('group_id', $group->id)
                        ->where('is_visible', true)
                        ->orderBy('sort_order')
                        ->orderBy('id')
                        ->get()
                        ->map(fn ($row) => [
                            'id' => (int) $row->id,
                            'label' => $row->label,
                            'value' => $row->value,
                            'is_searchable' => (bool) $row->is_searchable,
                        ])
                        ->values()
                        ->all(),
                ];
            })
            ->filter(fn ($group) => count($group['rows']) > 0)
            ->values()
            ->all();
    }

    private function formatImages($images): array
    {
        if (! $images) {
            return [];
        }

        return collect($images)
            ->sortBy([['is_primary', 'desc'], ['sort_order', 'asc'], ['id', 'asc']])
            ->map(fn ($image) => [
                'id' => $image->id,
                'url' => $image->media_url ?? $image->image_url,
                'thumbnail_url' => $image->thumbnail_url,
                'is_primary' => (bool) $image->is_primary,
                'sort_order' => (int) $image->sort_order,
                'media_type' => $image->media_type,
                'title' => $image->original_name,
            ])
            ->values()
            ->all();
    }

    private function availableDeviceCount($productId, $variantId = null): int
    {
        if (!Schema::hasTable('device_units')) {
            return 0;
        }

        $query = DB::table('device_units')->where('product_id', $productId);

        if (Schema::hasColumn('device_units', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        if ($variantId && Schema::hasColumn('device_units', 'product_variant_id')) {
            $query->where('product_variant_id', $variantId);
        }

        if (Schema::hasColumn('device_units', 'status')) {
            $query->whereIn('status', ['available', 'ready_for_sale', 'in_stock', 'active', 'not_activated', 'boxed']);
        }

        if (Schema::hasColumn('device_units', 'saleable')) {
            $query->where('saleable', true);
        }

        if (Schema::hasColumn('device_units', 'used_purchase_id') && Schema::hasColumn('device_units', 'website_published')) {
            $query->where(fn ($inner) => $inner->whereNull('used_purchase_id')->orWhere('website_published', true));
        }

        return (int) $query->count();
    }

    private function imageFromProduct(Product $product): ?string
    {
        if ($product->image_url) {
            return $product->image_url;
        }

        return $this->imageFromCollection($product->images);
    }

    private function imageFromCollection($images): ?string
    {
        if (!$images || $images->isEmpty()) {
            return null;
        }

        $image = $images->firstWhere('is_primary', true) ?: $images->first();
        return $image->thumbnail_url ?? $image->image_url ?? $image->media_url ?? null;
    }

    private function recentSales()
    {
        if (!Schema::hasTable('sale_items')) {
            return [];
        }

        $query = DB::table('sale_items')
            ->leftJoin('sales', 'sales.id', '=', 'sale_items.sale_id')
            ->select([
                'sale_items.id',
                'sale_items.product_id',
                'sale_items.product_name',
                'sale_items.sale_price',
                'sale_items.rate',
                'sales.created_at',
            ])
            ->orderByDesc('sale_items.id')
            ->limit(10);

        return $query->get()->map(fn ($row) => [
            'id' => $row->id,
            'product_id' => $row->product_id,
            'name' => $row->product_name,
            'price' => $row->sale_price ?: $row->rate,
            'sold_at' => $row->created_at,
        ])->values();
    }
}
