<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductImage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MediaLibraryController extends Controller
{
    public function images(Request $request)
    {
        $search = trim((string) $request->get('search', ''));
        $type = $request->get('type', 'all');
        $perPage = max(12, min((int) $request->get('per_page', 60), 200));

        $query = ProductImage::query()
            ->with(['product:id,name,sku,barcode', 'variant:id,product_id,variant_name,sku,barcode,color_name,region,sim_network,ram,storage'])
            ->when($type !== 'all', fn ($q) => $q->where('media_type', $type))
            ->when($search !== '', function ($q) use ($search) {
                $q->where(function ($inner) use ($search) {
                    $inner->where('original_name', 'like', "%{$search}%")
                        ->orWhere('image_path', 'like', "%{$search}%")
                        ->orWhereHas('product', fn ($product) => $product->where('name', 'like', "%{$search}%")->orWhere('sku', 'like', "%{$search}%"))
                        ->orWhereHas('variant', fn ($variant) => $variant->where('variant_name', 'like', "%{$search}%")->orWhere('sku', 'like', "%{$search}%")->orWhere('barcode', 'like', "%{$search}%"));
                });
            })
            ->latest('id');

        $items = $query->paginate($perPage);
        $items->getCollection()->transform(fn (ProductImage $image) => $this->formatImage($image));

        return response()->json([
            'status' => true,
            'message' => 'Media library loaded successfully.',
            'data' => $items,
        ]);
    }


    public function publicFile(string $encodedPath)
    {
        $path = $this->decodePublicMediaPath($encodedPath);

        if (!$path) {
            abort(404);
        }

        $resolvedPath = $this->resolveExistingPublicMediaPath($path);

        if (!$resolvedPath) {
            abort(404);
        }

        $disk = Storage::disk('public');
        $absolutePath = $disk->path($resolvedPath);
        $mimeType = $disk->mimeType($resolvedPath) ?: 'application/octet-stream';

        return response()->file($absolutePath, [
            'Content-Type' => $mimeType,
            'Cache-Control' => 'public, max-age=604800',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function decodePublicMediaPath(string $encodedPath): ?string
    {
        $encodedPath = trim($encodedPath);
        if ($encodedPath === '') {
            return null;
        }

        $padding = strlen($encodedPath) % 4;
        if ($padding > 0) {
            $encodedPath .= str_repeat('=', 4 - $padding);
        }

        $decoded = base64_decode(strtr($encodedPath, '-_', '+/'), true);
        if (!$decoded) {
            return null;
        }

        $path = ltrim(str_replace('\\', '/', $decoded), '/');

        if ($path === '' || str_contains($path, '..') || str_starts_with($path, '/') || str_contains($path, "\0")) {
            return null;
        }

        return $path;
    }

    private function resolveExistingPublicMediaPath(string $path): ?string
    {
        $disk = Storage::disk('public');

        if ($disk->exists($path)) {
            return $path;
        }

        $directory = trim(dirname($path), '.');
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        $candidates = [];
        foreach (['webp', 'jpg', 'jpeg', 'png', 'gif'] as $candidateExtension) {
            if ($candidateExtension !== $extension) {
                $candidates[] = trim($directory . '/' . $filename . '.' . $candidateExtension, '/');
            }
        }

        foreach ($candidates as $candidate) {
            if ($candidate && $disk->exists($candidate)) {
                return $candidate;
            }
        }

        return null;
    }

    public function destroyPhysical(Request $request)
    {
        $validated = $request->validate([
            'id' => ['nullable', 'integer', 'exists:product_images,id'],
            'path' => ['nullable', 'string', 'max:500'],
        ]);

        $image = null;
        if (!empty($validated['id'])) {
            $image = ProductImage::find($validated['id']);
        }

        if (!$image && !empty($validated['path'])) {
            $image = ProductImage::where('image_path', $validated['path'])->first();
        }

        if (!$image) {
            return response()->json([
                'status' => false,
                'message' => 'Image record not found.',
            ], 404);
        }

        $sameFileUsage = ProductImage::where('image_path', $image->image_path)->count();
        if ($sameFileUsage > 1) {
            return response()->json([
                'status' => false,
                'message' => 'This physical file is linked in multiple places. Unlink it from variants/products first.',
            ], 422);
        }

        foreach (array_filter([$image->image_path, $image->thumbnail_path]) as $path) {
            if (Storage::disk('public')->exists($path)) {
                Storage::disk('public')->delete($path);
            }
        }

        $image->delete();

        return response()->json([
            'status' => true,
            'message' => 'Physical image deleted safely.',
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
            'product' => $image->product,
            'variant' => $image->variant,
            'label' => trim(($image->product?->name ?: 'Media') . ' ' . ($image->variant?->variant_name ? ' / ' . $image->variant->variant_name : '')),
            'created_at' => optional($image->created_at)->toDateTimeString(),
        ];
    }
}
