<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Services\PublicMediaUrlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class HomeFeedController extends Controller
{
    public function index(): JsonResponse
    {
        $data = Cache::remember(
            'nst.public.home_feed.v3',
            now()->addSeconds(30),
            fn () => [
                'products' => $this->products(),
                'categories' => $this->categories(),
                'brands' => $this->brands(),
                'updated_at' => now()->toIso8601String(),
            ]
        );

        return response()
            ->json([
                'status' => true,
                'source' => 'nst-fast-home-feed',
                'data' => $data,
            ])
            ->header('Cache-Control', 'public, max-age=10, stale-while-revalidate=30');
    }

    private function products(): array
    {
        $productColumns = array_values(array_filter([
            'id',
            'name',
            'slug',
            'brand_id',
            'category_id',
            'brand',
            'category',
            'condition',
            'product_type',
            'sale_price',
            'regular_price',
            'discount_price',
            'allow_preorder',
            'stock_quantity',
            'image',
            'status',
            'short_description',
            'website_published',
            'updated_at',
        ], fn ($column) => Schema::hasColumn('products', $column)));

        $variantColumns = array_values(array_filter([
            'id',
            'product_id',
            'variant_name',
            'storage',
            'ram',
            'ram_storage',
            'condition',
            'discount_price',
            'sale_price',
            'regular_price',
            'market_price',
            'status',
        ], fn ($column) => Schema::hasColumn('product_variants', $column)));

        $imageColumns = array_values(array_filter([
            'id',
            'product_id',
            'image_path',
            'thumbnail_path',
            'media_type',
            'is_primary',
            'sort_order',
            'updated_at',
        ], fn ($column) => Schema::hasColumn('product_images', $column)));

        $query = Product::query()
            ->select($productColumns)
            ->with([
                'categoryInfo',
                'brandInfo',
                'images' => fn ($imageQuery) => $imageQuery
                    ->select($imageColumns)
                    ->orderByDesc('is_primary')
                    ->orderBy('sort_order')
                    ->orderBy('id'),
                'variants' => fn ($variantQuery) => $variantQuery
                    ->select($variantColumns)
                    ->orderBy('id'),
            ])
            ->latest('updated_at');

        if (Schema::hasColumn('products', 'website_published')) {
            $query->where('website_published', true);
        }

        if (Schema::hasColumn('products', 'status')) {
            $query->where(function ($statusQuery) {
                $statusQuery
                    ->whereNull('status')
                    ->orWhereIn('status', [
                        'active',
                        'in_stock',
                        'available',
                        'out_of_stock',
                    ]);
            });
        }

        $products = $query->limit(48)->get();

        if ($products->isEmpty()) {
            return [];
        }

        $productIds = $products->pluck('id')->map(fn ($id) => (int) $id)->all();

        $soldCounts = $this->soldCounts($productIds);
        $deviceSummary = $this->deviceSummary($productIds);

        return $products
            ->map(function (Product $product) use ($soldCounts, $deviceSummary) {
                $activeVariants = $product->variants
                    ->filter(fn ($variant) => strtolower((string) ($variant->status ?? '')) !== 'inactive')
                    ->values();

                $variantPrices = $activeVariants
                    ->map(function ($variant) {
                        $price = $variant->discount_price
                            ?: $variant->sale_price
                            ?: 0;

                        return (float) $price;
                    })
                    ->filter(fn ($price) => $price > 0);

                $device = $deviceSummary[$product->id] ?? [
                    'count' => 0,
                    'min_price' => null,
                ];

                $devicePrice = (float) ($device['min_price'] ?? 0);
                $variantPrice = (float) ($variantPrices->min() ?? 0);
                $productPrice = (float) (
                    $product->discount_price
                    ?: $product->sale_price
                    ?: 0
                );

                $price = $devicePrice > 0
                    ? $devicePrice
                    : ($variantPrice > 0 ? $variantPrice : $productPrice);

                $availableDevices = (int) ($device['count'] ?? 0);
                $stockQuantity = (int) ($product->stock_quantity ?? 0);
                $availableQuantity = $availableDevices > 0
                    ? $availableDevices
                    : $stockQuantity;

                $primaryMedia = $product->images->firstWhere('is_primary', true)
                    ?: $product->images->first();

                $fullImage = $product->image
                    ? PublicMediaUrlService::forPath(
                        $product->image,
                        optional($product->updated_at)->timestamp
                    )
                    : ($primaryMedia?->image_url ?? null);

                $thumbnail = $primaryMedia?->thumbnail_url ?: $fullImage;

                $oldPrice = (float) (
                    $product->regular_price
                    ?: ($product->market_price ?? 0)
                );

                return [
                    'id' => (int) $product->id,
                    'name' => $product->name,
                    'slug' => $product->slug ?: (string) $product->id,

                    'price' => $price,
                    'sale_price' => $price,
                    'old_price' => $oldPrice,
                    'regular_price' => $oldPrice,

                    'brand' => optional($product->brandInfo)->name
                        ?: $product->brand,

                    'category' => optional($product->categoryInfo)->name
                        ?: $product->category,

                    'condition' => $product->condition
                        ?: $product->product_type,

                    'image' => $thumbnail,
                    'image_url' => $thumbnail,
                    'thumbnail_url' => $thumbnail,
                    'full_image_url' => $fullImage,

                    'stock_quantity' => $availableQuantity,
                    'available_quantity' => $availableQuantity,
                    'sold_count' => (int) ($soldCounts[$product->id] ?? 0),

                    'status' => $availableQuantity > 0
                        ? 'In Stock'
                        : ((bool) ($product->allow_preorder ?? false)
                            ? 'Pre Order'
                            : ($product->status ?: 'Out of Stock')),

                    'allow_preorder' => (bool) ($product->allow_preorder ?? false),
                    'website_published' => (bool) ($product->website_published ?? true),

                    'short_description' => $product->short_description,

                    'variants' => $activeVariants
                        ->take(8)
                        ->map(function ($variant) use ($product) {
                            $variantPrice = (float) (
                                $variant->discount_price
                                ?: $variant->sale_price
                                ?: 0
                            );

                            $oldPrice = (float) (
                                $variant->regular_price
                                ?: $variant->market_price
                                ?: 0
                            );

                            return [
                                'id' => (int) $variant->id,
                                'name' => $variant->variant_name,
                                'storage' => $variant->storage,
                                'ram' => $variant->ram ?: $variant->ram_storage,
                                'condition' => $variant->condition ?: $product->condition,
                                'price' => $variantPrice,
                                'sale_price' => $variantPrice,
                                'old_price' => $oldPrice,
                                'status' => $variant->status,
                            ];
                        })
                        ->values()
                        ->all(),
                ];
            })
            ->values()
            ->all();
    }

    private function categories(): array
    {
        return Category::query()
            ->whereNull('parent_id')
            ->where('status', 'active')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get([
                'id',
                'name',
                'slug',
                'image',
                'icon',
                'sort_order',
                'updated_at',
            ])
            ->map(fn (Category $category) => [
                'id' => (int) $category->id,
                'name' => $category->name,
                'slug' => $category->slug,
                'image' => $category->image,
                'image_url' => PublicMediaUrlService::forPath(
                    $category->image,
                    optional($category->updated_at)->timestamp
                ),
                'icon' => $category->icon,
                'sort_order' => (int) $category->sort_order,
            ])
            ->values()
            ->all();
    }

    private function brands(): array
    {
        return Brand::query()
            ->where('status', 'active')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get([
                'id',
                'name',
                'slug',
                'logo',
                'sort_order',
                'updated_at',
            ])
            ->map(fn (Brand $brand) => [
                'id' => (int) $brand->id,
                'name' => $brand->name,
                'slug' => $brand->slug,
                'logo' => $brand->logo,
                'logo_url' => PublicMediaUrlService::forPath(
                    $brand->logo,
                    optional($brand->updated_at)->timestamp
                ),
                'sort_order' => (int) $brand->sort_order,
            ])
            ->values()
            ->all();
    }

    private function soldCounts(array $productIds): array
    {
        if (
            $productIds === []
            || ! Schema::hasTable('sale_items')
            || ! Schema::hasColumn('sale_items', 'product_id')
        ) {
            return [];
        }

        return DB::table('sale_items')
            ->whereIn('product_id', $productIds)
            ->groupBy('product_id')
            ->selectRaw('product_id, SUM(COALESCE(quantity, 1)) as sold')
            ->pluck('sold', 'product_id')
            ->map(fn ($value) => (int) $value)
            ->all();
    }

    private function deviceSummary(array $productIds): array
    {
        if (
            $productIds === []
            || ! Schema::hasTable('device_units')
            || ! Schema::hasColumn('device_units', 'product_id')
        ) {
            return [];
        }

        $query = DB::table('device_units')
            ->whereIn('product_id', $productIds);

        if (Schema::hasColumn('device_units', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        if (Schema::hasColumn('device_units', 'sale_id')) {
            $query->whereNull('sale_id');
        }

        if (Schema::hasColumn('device_units', 'status')) {
            $query->whereIn('status', [
                'available',
                'ready_for_sale',
                'in_stock',
                'active',
                'not_activated',
                'boxed',
                'reserved',
            ]);
        }

        if (Schema::hasColumn('device_units', 'saleable')) {
            $query->where('saleable', true);
        }

        if (
            Schema::hasColumn('device_units', 'used_purchase_id')
            && Schema::hasColumn('device_units', 'website_published')
        ) {
            $query->where(function ($publicationQuery) {
                $publicationQuery
                    ->whereNull('used_purchase_id')
                    ->orWhere('website_published', true);
            });
        }

        if (Schema::hasColumn('device_units', 'selling_price')) {
            $query->selectRaw(
                'product_id, COUNT(*) as available_count, MIN(NULLIF(selling_price, 0)) as min_price'
            );
        } else {
            $query->selectRaw(
                'product_id, COUNT(*) as available_count'
            );
        }

        return $query
            ->groupBy('product_id')
            ->get()
            ->mapWithKeys(fn ($row) => [
                (int) $row->product_id => [
                    'count' => (int) $row->available_count,
                    'min_price' => isset($row->min_price)
                        ? (float) $row->min_price
                        : null,
                ],
            ])
            ->all();
    }
}