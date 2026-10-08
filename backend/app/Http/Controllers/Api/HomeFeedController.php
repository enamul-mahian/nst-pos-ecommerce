<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class HomeFeedController extends Controller
{
    public function index(): JsonResponse
    {
        $data = Cache::remember(
            'nst.public.home_feed.v4',
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
        $columns = [
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
        ];

        if (Schema::hasColumn('products', 'market_price')) {
            $columns[] = 'market_price';
        }

        $products = Product::query()
            ->select($columns)
            ->with([
                'categoryInfo:id,name,slug',
                'brandInfo:id,name,slug',
                'images' => function ($query) {
                    $query->select([
                        'id',
                        'product_id',
                        'image_path',
                        'thumbnail_path',
                        'media_type',
                        'is_primary',
                        'sort_order',
                        'updated_at',
                    ])
                    ->orderByDesc('is_primary')
                    ->orderBy('sort_order')
                    ->orderBy('id');
                },
                'variants' => function ($query) {
                    $query->select([
                        'id',
                        'product_id',
                        'variant_name',
                        'condition',
                        'storage',
                        'ram',
                        'ram_storage',
                        'sale_price',
                        'regular_price',
                        'discount_price',
                        'market_price',
                        'status',
                    ])->orderBy('id');
                },
            ])
            ->where('website_published', true)
            ->where(function ($query) {
                $query->whereNull('status')
                    ->orWhereIn('status', [
                        'active',
                        'in_stock',
                        'available',
                        'out_of_stock',
                    ]);
            })
            ->latest('updated_at')
            ->limit(48)
            ->get();

        if ($products->isEmpty()) {
            return [];
        }

        $ids = $products->pluck('id')->map(fn ($id) => (int) $id)->all();

        $sold = $this->soldCounts($ids);
        $devices = $this->deviceSummary($ids);

        return $products->map(function (Product $product) use ($sold, $devices) {
            $variants = $product->variants
                ->filter(fn ($variant) =>
                    strtolower((string) ($variant->status ?? '')) !== 'inactive'
                )
                ->values();

            $variantPrice = $variants
                ->map(fn ($variant) => (float) (
                    $variant->discount_price
                    ?: $variant->sale_price
                    ?: 0
                ))
                ->filter(fn ($price) => $price > 0)
                ->min();

            $device = $devices[$product->id] ?? [
                'count' => 0,
                'min_price' => null,
            ];

            $devicePrice = (float) ($device['min_price'] ?? 0);

            $basePrice = (float) (
                $product->discount_price
                ?: $product->sale_price
                ?: 0
            );

            $price = $devicePrice > 0
                ? $devicePrice
                : ((float) $variantPrice > 0
                    ? (float) $variantPrice
                    : $basePrice);

            $deviceCount = (int) ($device['count'] ?? 0);
            $stock = $deviceCount > 0
                ? $deviceCount
                : (int) ($product->stock_quantity ?? 0);

            $media = $product->images->firstWhere('is_primary', true)
                ?: $product->images->first();

            $fullPath = $product->image
                ?: ($media?->image_path ?? null);

            $thumbnailPath = $media?->thumbnail_path
                ?: $fullPath
                ?: ($media?->image_path ?? null);

            $fullImage = $this->mediaUrl(
                $fullPath,
                optional($product->updated_at)->timestamp
            );

            $thumbnail = $this->mediaUrl(
                $thumbnailPath,
                optional($media?->updated_at)->timestamp
                    ?: optional($product->updated_at)->timestamp
            );

            $oldPrice = (float) (
                $product->regular_price
                ?: ($product->getAttribute('market_price') ?: 0)
                ?: $product->discount_price
                ?: 0
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
                'full_image_url' => $fullImage ?: $thumbnail,

                'stock_quantity' => $stock,
                'available_quantity' => $stock,
                'sold_count' => (int) ($sold[$product->id] ?? 0),

                'status' => $stock > 0
                    ? 'In Stock'
                    : ((bool) ($product->allow_preorder ?? false)
                        ? 'Pre Order'
                        : ($product->status ?: 'Out of Stock')),

                'allow_preorder' => (bool) ($product->allow_preorder ?? false),
                'website_published' => true,
                'short_description' => $product->short_description,

                'variants' => $variants
                    ->take(8)
                    ->map(function ($variant) use ($product) {
                        $price = (float) (
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
                            'price' => $price,
                            'sale_price' => $price,
                            'old_price' => $oldPrice,
                            'status' => $variant->status,
                        ];
                    })
                    ->values()
                    ->all(),
            ];
        })->values()->all();
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
                'image' => $this->mediaUrl(
                    $category->image,
                    optional($category->updated_at)->timestamp
                ),
                'image_url' => $this->mediaUrl(
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
                'logo' => $this->mediaUrl(
                    $brand->logo,
                    optional($brand->updated_at)->timestamp
                ),
                'logo_url' => $this->mediaUrl(
                    $brand->logo,
                    optional($brand->updated_at)->timestamp
                ),
                'sort_order' => (int) $brand->sort_order,
            ])
            ->values()
            ->all();
    }

    private function soldCounts(array $ids): array
    {
        if (
            $ids === []
            || ! Schema::hasTable('sale_items')
            || ! Schema::hasColumn('sale_items', 'product_id')
        ) {
            return [];
        }

        return DB::table('sale_items')
            ->whereIn('product_id', $ids)
            ->groupBy('product_id')
            ->selectRaw(
                'product_id, SUM(COALESCE(quantity, 1)) as sold'
            )
            ->pluck('sold', 'product_id')
            ->map(fn ($value) => (int) $value)
            ->all();
    }

    private function deviceSummary(array $ids): array
    {
        if (
            $ids === []
            || ! Schema::hasTable('device_units')
            || ! Schema::hasColumn('device_units', 'product_id')
        ) {
            return [];
        }

        $query = DB::table('device_units')
            ->whereIn('product_id', $ids);

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
            ]);
        }

        if (Schema::hasColumn('device_units', 'saleable')) {
            $query->where('saleable', true);
        }

        if (
            Schema::hasColumn('device_units', 'used_purchase_id')
            && Schema::hasColumn('device_units', 'website_published')
        ) {
            $query->where(function ($inner) {
                $inner->whereNull('used_purchase_id')
                    ->orWhere('website_published', true);
            });
        }

        $select = 'product_id, COUNT(*) as available_count';

        if (Schema::hasColumn('device_units', 'selling_price')) {
            $select .= ', MIN(NULLIF(selling_price, 0)) as min_price';
        }

        return $query
            ->selectRaw($select)
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

    private function mediaUrl(?string $path, mixed $version = null): ?string
    {
        if (! $path) {
            return null;
        }

        $clean = ltrim(
            str_replace('\\', '/', trim($path)),
            '/'
        );

        if ($clean === '') {
            return null;
        }

        if (Str::startsWith(
            $clean,
            ['http://', 'https://', 'data:', 'blob:']
        )) {
            return $clean;
        }

        if (Str::startsWith($clean, 'storage/')) {
            $clean = substr($clean, strlen('storage/'));
        }

        $encoded = rtrim(
            strtr(base64_encode($clean), '+/', '-_'),
            '='
        );

        $base = rtrim((string) config('app.url'), '/');

        if (request()->getHost()) {
            $base = rtrim(
                request()->getSchemeAndHttpHost(),
                '/'
            );
        }

        $url = $base . '/api/media-library/file/' . $encoded;

        if ($version) {
            $url .= '?v=' . rawurlencode((string) $version);
        }

        return $url;
    }
}