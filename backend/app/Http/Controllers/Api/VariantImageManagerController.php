<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use App\Services\ProductMediaService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VariantImageManagerController extends Controller
{
    public function productMatrix(Product $product)
    {
        $product->load(['images', 'variants.images']);

        return response()->json([
            'status' => true,
            'message' => 'Product variant image matrix loaded successfully.',
            'data' => [
                'product' => $product,
                'product_images' => $product->images->map(fn (ProductImage $image) => $this->formatImage($image))->values(),
                'variants' => $product->variants->map(fn (ProductVariant $variant) => $this->formatVariant($variant))->values(),
            ],
        ]);
    }

    public function variantImages(ProductVariant $variant)
    {
        $variant->load(['product', 'images']);

        return response()->json([
            'status' => true,
            'message' => 'Variant images loaded successfully.',
            'data' => [
                'variant' => $this->formatVariant($variant),
                'images' => $variant->images->map(fn (ProductImage $image) => $this->formatImage($image))->values(),
            ],
        ]);
    }

    public function linkToVariant(Request $request, ProductVariant $variant)
    {
        $validated = $request->validate([
            'image_ids' => ['required', 'array', 'min:1'],
            'image_ids.*' => ['integer', 'exists:product_images,id'],
        ]);

        $linked = [];
        DB::transaction(function () use ($validated, $variant, &$linked) {
            $existingCount = ProductImage::where('product_variant_id', $variant->id)->count();
            foreach ($validated['image_ids'] as $imageId) {
                if ($existingCount >= 5) {
                    break;
                }

                $source = ProductImage::find($imageId);
                if (!$source || !$source->image_path) {
                    continue;
                }

                $alreadyLinked = ProductImage::where('product_variant_id', $variant->id)
                    ->where('image_path', $source->image_path)
                    ->exists();

                if ($alreadyLinked) {
                    continue;
                }

                $copy = ProductImage::create([
                    'product_id' => $variant->product_id,
                    'product_variant_id' => $variant->id,
                    'variant_key' => $this->variantKey($variant),
                    'media_type' => $source->media_type ?: 'image',
                    'image_path' => $source->image_path,
                    'thumbnail_path' => $source->thumbnail_path,
                    'original_name' => $source->original_name,
                    'mime_type' => $source->mime_type,
                    'size_kb' => $source->size_kb,
                    'processed_size_kb' => $source->processed_size_kb,
                    'is_primary' => $existingCount === 0,
                    'sort_order' => $existingCount,
                ]);

                $linked[] = $this->formatImage($copy);
                $existingCount++;
            }
        });

        return response()->json([
            'status' => true,
            'message' => count($linked) ? 'Gallery image linked to variant successfully.' : 'No new image linked. The variant may already have this image or 5 images.',
            'data' => [
                'variant' => $this->formatVariant($variant->fresh(['images'])),
                'linked' => $linked,
            ],
        ]);
    }

    public function uploadToVariant(Request $request, ProductVariant $variant, ProductMediaService $mediaService)
    {
        $request->validate([
            'images' => ['nullable', 'array', 'max:5'],
            'images.*' => ['file', 'mimes:jpg,jpeg,png,webp,gif', 'max:8192'],
            'image' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,gif', 'max:8192'],
        ]);

        $files = [];
        if ($request->hasFile('images')) {
            $files = $request->file('images');
        } elseif ($request->hasFile('image')) {
            $files = [$request->file('image')];
        }

        $existingCount = ProductImage::where('product_variant_id', $variant->id)->count();
        if ($existingCount >= 5) {
            return response()->json([
                'status' => false,
                'message' => 'This variant already has 5 images. Remove/unlink one before uploading more.',
            ], 422);
        }

        $uploaded = [];
        DB::transaction(function () use ($files, $variant, $mediaService, &$uploaded, &$existingCount) {
            foreach ($files as $file) {
                if ($existingCount >= 5) {
                    break;
                }

                $media = $mediaService->processUploadedMedia($file);
                $image = ProductImage::create(array_merge($media, [
                    'product_id' => $variant->product_id,
                    'product_variant_id' => $variant->id,
                    'variant_key' => $this->variantKey($variant),
                    'is_primary' => $existingCount === 0,
                    'sort_order' => $existingCount,
                ]));

                $uploaded[] = $this->formatImage($image);
                $existingCount++;
            }
        });

        return response()->json([
            'status' => true,
            'message' => 'Variant image uploaded successfully.',
            'data' => [
                'variant' => $this->formatVariant($variant->fresh(['images'])),
                'uploaded' => $uploaded,
            ],
        ]);
    }

    public function unlinkFromVariant(Request $request, ProductVariant $variant)
    {
        $validated = $request->validate([
            'image_ids' => ['required', 'array', 'min:1'],
            'image_ids.*' => ['integer', 'exists:product_images,id'],
        ]);

        $removed = ProductImage::where('product_variant_id', $variant->id)
            ->whereIn('id', $validated['image_ids'])
            ->delete();

        $this->normalizeSortOrder($variant);

        return response()->json([
            'status' => true,
            'message' => 'Image unlinked from variant. Physical file was not deleted.',
            'data' => [
                'removed' => $removed,
                'variant' => $this->formatVariant($variant->fresh(['images'])),
            ],
        ]);
    }

    public function bulkLink(Request $request)
    {
        $validated = $request->validate([
            'variant_ids' => ['required', 'array', 'min:1'],
            'variant_ids.*' => ['integer', 'exists:product_variants,id'],
            'image_ids' => ['required', 'array', 'min:1'],
            'image_ids.*' => ['integer', 'exists:product_images,id'],
        ]);

        $summary = [];
        foreach ($validated['variant_ids'] as $variantId) {
            $variant = ProductVariant::find($variantId);
            if (!$variant) {
                continue;
            }

            $fakeRequest = new Request(['image_ids' => $validated['image_ids']]);
            $response = $this->linkToVariant($fakeRequest, $variant)->getData(true);
            $summary[] = [
                'variant_id' => $variant->id,
                'message' => $response['message'] ?? 'Done',
            ];
        }

        return response()->json([
            'status' => true,
            'message' => 'Bulk variant image link completed.',
            'data' => $summary,
        ]);
    }

    private function formatVariant(ProductVariant $variant): array
    {
        $variant->loadMissing(['product', 'images']);

        return array_merge($variant->toArray(), [
            'display_name' => $variant->variant_name ?: $this->variantKey($variant),
            'image_count' => $variant->images->count(),
            'images' => $variant->images->sortBy('sort_order')->map(fn (ProductImage $image) => $this->formatImage($image))->values(),
        ]);
    }

    private function formatImage(ProductImage $image): array
    {
        return [
            'id' => $image->id,
            'product_id' => $image->product_id,
            'product_variant_id' => $image->product_variant_id,
            'variant_key' => $image->variant_key,
            'media_type' => $image->media_type ?: 'image',
            'image_path' => $image->image_path,
            'thumbnail_path' => $image->thumbnail_path,
            'image_url' => $image->image_url,
            'media_url' => $image->media_url,
            'thumbnail_url' => $image->thumbnail_url,
            'original_name' => $image->original_name,
            'mime_type' => $image->mime_type,
            'size_kb' => $image->size_kb,
            'processed_size_kb' => $image->processed_size_kb,
            'is_primary' => (bool) $image->is_primary,
            'sort_order' => (int) $image->sort_order,
            'created_at' => optional($image->created_at)->toDateTimeString(),
        ];
    }

    private function variantKey(ProductVariant $variant): string
    {
        return collect([
            $variant->color_name,
            $variant->region,
            $variant->ram,
            $variant->storage,
            $variant->sim_network,
        ])->filter()->implode(' / ') ?: ($variant->variant_name ?: 'Default Variant');
    }

    private function normalizeSortOrder(ProductVariant $variant): void
    {
        ProductImage::where('product_variant_id', $variant->id)
            ->orderBy('sort_order')
            ->orderBy('id')
            ->get()
            ->values()
            ->each(function (ProductImage $image, int $index) {
                $image->update(['sort_order' => $index, 'is_primary' => $index === 0]);
            });
    }
}
