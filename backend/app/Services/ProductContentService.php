<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductImage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Catalog content shared by the New Product form and the device Prepare For Sale form:
 * description, SEO, slug, key features, specifications, FAQ, add-ons and product video.
 */
class ProductContentService
{
    public const LIST_FIELDS = ['key_features', 'specifications', 'faqs', 'add_ons'];

    public function __construct(private readonly ProductMediaService $mediaService)
    {
    }

    public static function validationRules(): array
    {
        return [
            'short_description' => ['nullable', 'string', 'max:5000'],
            'description' => ['nullable', 'string'],
            'meta_title' => ['nullable', 'string', 'max:255'],
            'meta_description' => ['nullable', 'string', 'max:1000'],
            'seo_keywords' => ['nullable', 'string', 'max:1000'],
            'slug' => ['nullable', 'string', 'max:255'],
            'key_features' => ['nullable'],
            'specifications' => ['nullable'],
            'faqs' => ['nullable'],
            'add_ons' => ['nullable'],
            'youtube_video_url' => ['nullable', 'string', 'max:500'],
            'video_watermark' => ['nullable', 'boolean'],
            'product_video' => ['nullable', 'file', 'mimetypes:video/mp4,video/webm,video/quicktime,video/x-m4v', 'max:102400'],
        ];
    }

    /**
     * Attribute values for the products table from a content payload.
     * Only keys present in the request are returned, so a partial form never clears other content.
     */
    public function attributesFrom(Request $request, ?Product $product = null): array
    {
        $attributes = [];

        foreach (['short_description', 'description', 'meta_title', 'meta_description', 'seo_keywords'] as $field) {
            if ($request->has($field)) {
                $value = $request->input($field);
                $attributes[$field] = is_string($value) && trim($value) !== '' ? $value : null;
            }
        }

        foreach (self::LIST_FIELDS as $field) {
            if ($request->has($field)) {
                $attributes[$field] = $this->cleanList($field, $this->decodeList($request->input($field)));
            }
        }

        if ($request->has('youtube_video_url') || $request->has('video_watermark')) {
            $pageOptions = is_array($product?->page_options) ? $product->page_options : [];
            if ($request->has('youtube_video_url')) {
                $pageOptions['youtube_video_url'] = trim((string) $request->input('youtube_video_url')) ?: null;
            }
            if ($request->has('video_watermark')) {
                $pageOptions['video_watermark'] = $request->boolean('video_watermark');
            }
            $attributes['page_options'] = $pageOptions;
        }

        return collect($attributes)->filter(fn ($value, $key) => Schema::hasColumn('products', $key))->all();
    }

    /** Content values of a product in the shape the admin content form uses. */
    public function formValues(?Product $product): array
    {
        $pageOptions = is_array($product?->page_options) ? $product->page_options : [];

        return [
            'short_description' => $product?->short_description ?? '',
            'description' => $product?->description ?? '',
            'meta_title' => $product?->meta_title ?? '',
            'meta_description' => $product?->meta_description ?? '',
            'seo_keywords' => $product?->seo_keywords ?? '',
            'slug' => $product?->slug ?? '',
            'key_features' => array_values(array_filter((array) ($product?->key_features ?? []), fn ($item) => is_string($item))),
            'specifications' => array_values((array) ($product?->specifications ?? [])),
            'faqs' => array_values((array) ($product?->faqs ?? [])),
            'add_ons' => array_values((array) ($product?->add_ons ?? [])),
            'youtube_video_url' => $pageOptions['youtube_video_url'] ?? '',
            'video_watermark' => (bool) ($pageOptions['video_watermark'] ?? false),
        ];
    }

    public function uniqueSlug(string $source, ?int $ignoreId = null): string
    {
        $baseSlug = Str::slug($source) ?: 'product';
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

    public function recordSlugRedirect(string $entityType, int $entityId, ?string $oldSlug, ?string $newSlug): void
    {
        if (! Schema::hasTable('slug_redirects') || ! $oldSlug || ! $newSlug || $oldSlug === $newSlug) {
            return;
        }

        DB::table('slug_redirects')->updateOrInsert(
            ['entity_type' => $entityType, 'old_slug' => $oldSlug],
            [
                'entity_id' => $entityId,
                'new_slug' => $newSlug,
                'status_code' => 301,
                'is_active' => true,
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );
    }

    /**
     * Keep quick/manual specification rows reflected in the structured customer
     * specification API without overwriting advanced groups created in the
     * Specification Studio. Only the dedicated "Quick Specifications" group is
     * managed here.
     */
    public function syncQuickSpecificationsToGroups(Product $product): void
    {
        if (! Schema::hasTable('product_spec_groups') || ! Schema::hasTable('product_spec_rows')) {
            return;
        }

        $raw = $product->specifications;
        $rows = [];

        if (is_array($raw)) {
            foreach ($raw as $key => $item) {
                if (is_array($item)) {
                    $label = trim((string) ($item['name'] ?? $item['label'] ?? $item['key'] ?? ''));
                    $value = trim((string) ($item['value'] ?? ''));
                } elseif (! is_int($key)) {
                    $label = trim((string) $key);
                    $value = trim((string) $item);
                } else {
                    continue;
                }

                if ($label === '' && $value === '') {
                    continue;
                }

                $rows[] = [
                    'label' => $label !== '' ? $label : 'Specification',
                    'value' => $value,
                ];
            }
        }

        $group = DB::table('product_spec_groups')
            ->where('product_id', $product->id)
            ->where('name', 'Quick Specifications')
            ->first();

        if ($rows === []) {
            if ($group) {
                DB::table('product_spec_rows')->where('group_id', $group->id)->delete();
                DB::table('product_spec_groups')->where('id', $group->id)->delete();
            }
            return;
        }

        if ($group) {
            $groupId = (int) $group->id;
            DB::table('product_spec_rows')->where('group_id', $groupId)->delete();
            DB::table('product_spec_groups')->where('id', $groupId)->update([
                'sort_order' => 0,
                'is_visible' => true,
                'updated_at' => now(),
            ]);
        } else {
            $groupId = (int) DB::table('product_spec_groups')->insertGetId([
                'product_id' => $product->id,
                'name' => 'Quick Specifications',
                'sort_order' => 0,
                'is_visible' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        foreach ($rows as $index => $row) {
            DB::table('product_spec_rows')->insert([
                'group_id' => $groupId,
                'label' => $row['label'],
                'value' => $row['value'],
                'sort_order' => $index,
                'is_searchable' => true,
                'is_visible' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function storeProductVideo(Request $request, Product $product): void
    {
        if (! $request->hasFile('product_video')) {
            return;
        }

        $media = $this->mediaService->processUploadedMedia($request->file('product_video'));

        ProductImage::where('product_id', $product->id)
            ->whereNull('product_variant_id')
            ->where('media_type', 'video')
            ->get()
            ->each(function (ProductImage $oldMedia) {
                $this->deleteMediaFiles($oldMedia);
                $oldMedia->delete();
            });

        ProductImage::create([
            'product_id' => $product->id,
            'media_type' => $media['media_type'],
            'image_path' => $media['image_path'],
            'thumbnail_path' => $media['thumbnail_path'],
            'original_name' => $media['original_name'],
            'mime_type' => $media['mime_type'],
            'size_kb' => $media['size_kb'],
            'processed_size_kb' => $media['processed_size_kb'],
            'is_primary' => false,
            'sort_order' => 0,
        ]);
    }

    public function deleteMediaFiles(ProductImage $media): void
    {
        foreach ([$media->image_path, $media->thumbnail_path] as $path) {
            if ($path && Storage::disk('public')->exists($path)) {
                Storage::disk('public')->delete($path);
            }
        }
    }

    private function decodeList($value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (! is_string($value) || trim($value) === '') {
            return [];
        }

        $decoded = json_decode($value, true);

        return is_array($decoded) ? $decoded : [];
    }

    private function cleanList(string $field, array $items): array
    {
        return collect($items)
            ->map(function ($item) use ($field) {
                if ($field === 'key_features') {
                    return is_string($item) ? trim($item) : null;
                }
                if (! is_array($item)) {
                    return null;
                }
                return match ($field) {
                    'specifications' => ['name' => trim((string) ($item['name'] ?? '')), 'value' => trim((string) ($item['value'] ?? ''))],
                    'faqs' => ['question' => trim((string) ($item['question'] ?? '')), 'answer' => trim((string) ($item['answer'] ?? ''))],
                    'add_ons' => ['name' => trim((string) ($item['name'] ?? '')), 'price' => (string) ($item['price'] ?? ''), 'status' => (string) ($item['status'] ?? 'active')],
                    default => null,
                };
            })
            ->filter(function ($item) use ($field) {
                if ($item === null || $item === '') {
                    return false;
                }
                return match ($field) {
                    'specifications' => $item['name'] !== '' || $item['value'] !== '',
                    'faqs' => $item['question'] !== '' || $item['answer'] !== '',
                    'add_ons' => $item['name'] !== '',
                    default => true,
                };
            })
            ->values()
            ->all();
    }
}
