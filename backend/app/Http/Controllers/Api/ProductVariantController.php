<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BranchStock;
use App\Models\DeviceUnit;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProductVariantController extends Controller
{
    public function index(Request $request)
    {
        $query = ProductVariant::query()
            ->with(['product:id,name,brand,model,category,sku,barcode,stock_quantity,status'])
            ->latest();

        if ($request->filled('product_id')) {
            $query->where('product_id', $request->integer('product_id'));
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                $q->where('variant_name', 'like', "%{$search}%")
                    ->orWhere('sku', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%")
                    ->orWhere('color_name', 'like', "%{$search}%")
                    ->orWhere('region', 'like', "%{$search}%")
                    ->orWhere('variant_type', 'like', "%{$search}%")
                    ->orWhere('ram', 'like', "%{$search}%")
                    ->orWhere('storage', 'like', "%{$search}%")
                    ->orWhereHas('product', function ($productQuery) use ($search) {
                        $productQuery->where('name', 'like', "%{$search}%")
                            ->orWhere('sku', 'like', "%{$search}%")
                            ->orWhere('barcode', 'like', "%{$search}%")
                            ->orWhere('brand', 'like', "%{$search}%")
                            ->orWhere('model', 'like', "%{$search}%");
                    });
            });
        }

        $variants = $query->paginate((int) $request->get('per_page', 20));
        $variants->getCollection()->transform(fn (ProductVariant $variant) => $this->formatVariant($variant, $request));

        return response()->json([
            'status' => true,
            'message' => 'Product variants loaded successfully.',
            'data' => $variants,
        ]);
    }

    public function options(Product $product, Request $request)
    {
        $variants = $product->variants()
            ->with('images')
            ->where(function ($query) {
                $query->whereNull('status')
                    ->orWhereIn('status', ['active', 'out_of_stock']);
            })
            ->orderBy('id')
            ->get()
            ->map(function (ProductVariant $variant) {
                $image = $variant->images->first();

                return [
                    'id' => $variant->id,
                    'product_id' => $variant->product_id,
                    'name' => $variant->variant_name ?: 'Default Variant',
                    'variant_name' => $variant->variant_name ?: 'Default Variant',
                    'sku' => $variant->sku,
                    'barcode' => $variant->barcode,
                    'color_name' => $variant->color_name,
                    'color' => $variant->color_name,
                    'region' => $variant->region,
                    'variant_type' => $variant->variant_type,
                    'ram' => $variant->ram,
                    'storage' => $variant->storage,
                    'sim_network' => $variant->sim_network,
                    'condition' => $variant->condition ?? $variant->product_type,
                    'sale_price' => (float) ($variant->sale_price ?? 0),
                    'price' => (float) ($variant->discount_price ?: $variant->sale_price ?: 0),
                    'market_price' => $variant->market_price,
                    'regular_price' => $variant->regular_price,
                    'stock_quantity' => (int) ($variant->stock_quantity ?? 0),
                    'status' => $variant->status,
                    'image_url' => $image?->media_url ?? $image?->image_url,
                ];
            })
            ->values();

        return response()->json([
            'status' => true,
            'message' => 'Product variant options loaded successfully.',
            'data' => $variants,
        ]);
    }

    public function store(Request $request, \App\Services\ProductMediaService $mediaService)
    {
        $validated = $this->validateVariant($request);
        $validated = $this->prepareVariantData($validated);

        $variant = \Illuminate\Support\Facades\DB::transaction(function () use ($request, $validated, $mediaService) {
            $created = ProductVariant::create($validated);
            $this->nstVsiSyncVariantImages($request, $created, $mediaService);
            $this->nstVsiSyncStandaloneStock($request, $created);
            $this->syncProductStock($created->product_id);
            return $created->fresh(['product', 'images']);
        });

        return response()->json([
            'status' => true,
            'message' => 'Product variant created successfully.',
            'data' => $this->formatVariant($variant, $request),
        ], 201);
    }

    public function show(ProductVariant $productVariant, Request $request)
    {
        return response()->json([
            'status' => true,
            'message' => 'Product variant loaded successfully.',
            'data' => $this->formatVariant($productVariant->load(['product']), $request),
        ]);
    }

    public function update(Request $request, ProductVariant $productVariant, \App\Services\ProductMediaService $mediaService)
    {
        // Variant identity is immutable across edits. Moving an existing variant to a
        // different product would orphan device/stock/media relationships.
        if ($request->filled('product_id') && $request->integer('product_id') !== (int) $productVariant->product_id) {
            return response()->json([
                'status' => false,
                'message' => 'An existing variant cannot be moved to another product.',
            ], 422);
        }

        $validated = $this->validateVariant($request, $productVariant->id);
        unset($validated['product_id'], $validated['stock_quantity'], $validated['opening_stock_quantity']);
        $validated = $this->prepareVariantUpdateData($validated, $productVariant);

        $variant = \Illuminate\Support\Facades\DB::transaction(function () use ($request, $validated, $productVariant, $mediaService) {
            $productVariant->update($validated);
            // Media is owned by its dedicated request fields; ordinary variant edits must
            // not rewrite gallery links. Stock is owned by Inventory / Device Stock.
            if ($request->hasFile('images') || $request->has('image_ids') || $request->has('remove_image_ids')) {
                $this->nstVsiSyncVariantImages($request, $productVariant, $mediaService);
            }
            return $productVariant->fresh(['product', 'images']);
        });

        return response()->json([
            'status' => true,
            'message' => 'Product variant updated successfully.',
            'data' => $this->formatVariant($variant, $request),
        ]);
    }

    public function destroy(ProductVariant $productVariant)
    {
        $productId = $productVariant->product_id;
        $hasDevices = Schema::hasTable('device_units')
            && DeviceUnit::where('product_variant_id', $productVariant->id)->exists();
        $hasBranchStock = Schema::hasTable('branch_stocks')
            && BranchStock::where('product_variant_id', $productVariant->id)->where('quantity', '>', 0)->exists();

        if ($hasDevices || $hasBranchStock) {
            return response()->json([
                'status' => false,
                'message' => 'This variant has stock/device history. Set it inactive instead of deleting.',
            ], 422);
        }

        $productVariant->delete();
        $this->syncProductStock($productId);

        return response()->json([
            'status' => true,
            'message' => 'Product variant deleted successfully.',
        ]);
    }

    public function lookup(Request $request)
    {
        $request->validate([
            'code' => ['required', 'string', 'max:255'],
            'branch_id' => ['nullable', 'integer'],
        ]);

        $code = trim((string) $request->code);
        $branchId = $request->integer('branch_id') ?: null;

        $device = null;
        if (Schema::hasTable('device_units')) {
            $device = DeviceUnit::with(['product', 'variant'])
                ->where(function ($q) use ($code) {
                    foreach (['imei_1', 'imei_2', 'barcode', 'imei_1_barcode', 'imei_2_barcode'] as $column) {
                        if (Schema::hasColumn('device_units', $column)) {
                            $q->orWhere($column, $code);
                        }
                    }
                })
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->first();
        }

        if ($device) {
            return response()->json([
                'status' => true,
                'match_type' => 'device',
                'data' => [
                    'device' => $device,
                    'product' => $device->product,
                    'variant' => $device->variant,
                ],
            ]);
        }

        $variant = ProductVariant::with('product')
            ->where('sku', $code)
            ->orWhere('barcode', $code)
            ->first();

        if ($variant) {
            return response()->json([
                'status' => true,
                'match_type' => 'variant',
                'data' => $this->formatVariant($variant, $request),
            ]);
        }

        $product = Product::with('variants')
            ->where('sku', $code)
            ->orWhere('barcode', $code)
            ->orWhere('name', 'like', "%{$code}%")
            ->first();

        return response()->json([
            'status' => (bool) $product,
            'match_type' => $product ? 'product' : null,
            'message' => $product ? 'Product found.' : 'No product, variant or device found for this code.',
            'data' => $product,
        ], $product ? 200 : 404);
    }

    private function validateVariant(Request $request, ?int $variantId = null): array
    {
        return $request->validate([
            'product_id' => $variantId ? ['sometimes', 'integer', 'exists:products,id'] : ['required', 'integer', 'exists:products,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'supplier_id' => ['nullable', 'integer', 'exists:suppliers,id'],
            'variant_key' => ['nullable', 'string', 'max:191'],
            'model_number' => ['nullable', 'string', 'max:191'],
            'attribute_values' => ['nullable'],
            'color' => ['nullable', 'string', 'max:100'],
            'region_variant' => ['nullable', 'string', 'max:100'],
            'ram_storage' => ['nullable', 'string', 'max:100'],
            'opening_stock_quantity' => ['nullable', 'integer', 'min:0'],
            'imei_tracking' => ['nullable'],
            'warranty_period_months' => ['nullable', 'integer', 'min:0'],
            'warranty_terms' => ['nullable', 'string', 'max:5000'],
            'variant_name' => ['nullable', 'string', 'max:255'],
            'condition' => ['nullable', Rule::in(['new', 'used', 'pre_owned', 'refurbished'])],
            'color_name' => ['nullable', 'string', 'max:100'],
            'region' => ['nullable', 'string', 'max:100'],
            'sim_network' => ['nullable', 'string', 'max:100'],
            'variant_type' => ['nullable', 'string', 'max:100'],
            'ram' => ['nullable', 'string', 'max:50'],
            'storage' => ['nullable', 'string', 'max:50'],
            'product_type' => ['nullable', Rule::in(['new', 'used', 'pre_owned', 'refurbished'])],
            'sku' => ['nullable', 'string', 'max:150', Rule::unique('product_variants', 'sku')->ignore($variantId)],
            'barcode_mode' => ['nullable', Rule::in(['auto', 'manual'])],
            'barcode' => ['nullable', 'string', 'max:150', Rule::unique('product_variants', 'barcode')->ignore($variantId)],
            'purchase_price' => ['nullable', 'numeric', 'min:0'],
            'sale_price' => ['nullable', 'numeric', 'min:0'],
            'market_price' => ['nullable', 'numeric', 'min:0'],
            'regular_price' => ['nullable', 'numeric', 'min:0'],
            'discount_price' => ['nullable', 'numeric', 'min:0'],
            'stock_quantity' => ['nullable', 'integer', 'min:0'],
            'low_stock_alert' => ['nullable', 'integer', 'min:0'],
            'warranty' => ['nullable', 'string', 'max:255'],
            'status' => ['nullable', Rule::in(['active', 'inactive', 'out_of_stock'])],
        ]);
    }

    private function prepareVariantUpdateData(array $data, ProductVariant $existing): array
    {
        // PATCH semantics: omitted fields stay unchanged. Never convert a missing price,
        // status, SKU/barcode or attribute into 0/null/default during an edit.
        if (array_key_exists('attribute_values', $data) && is_string($data['attribute_values'])) {
            $decoded = json_decode($data['attribute_values'], true);
            if (is_array($decoded)) $data['attribute_values'] = $decoded;
        }

        if (array_key_exists('sku', $data) && trim((string) $data['sku']) === '') unset($data['sku']);
        if (array_key_exists('barcode', $data) && trim((string) $data['barcode']) === '') unset($data['barcode']);

        foreach (['purchase_price', 'sale_price'] as $field) {
            if (array_key_exists($field, $data) && $data[$field] !== null && $data[$field] !== '') {
                $data[$field] = (float) $data[$field];
            }
        }
        if (array_key_exists('low_stock_alert', $data) && $data['low_stock_alert'] !== null && $data['low_stock_alert'] !== '') {
            $data['low_stock_alert'] = (int) $data['low_stock_alert'];
        }

        $attributeFields = ['color_name', 'region', 'variant_type', 'ram', 'storage', 'sim_network', 'product_type'];
        if (count(array_intersect(array_keys($data), $attributeFields)) > 0) {
            $attributes = is_array($existing->attributes) ? $existing->attributes : [];
            foreach ($attributeFields as $field) {
                if (array_key_exists($field, $data)) $attributes[$field] = $data[$field];
            }
            $data['attributes'] = $attributes;
        }

        $nameFields = ['color_name', 'region', 'variant_type', 'ram', 'storage', 'sim_network'];
        if (!array_key_exists('variant_name', $data) && count(array_intersect(array_keys($data), $nameFields)) > 0) {
            $parts = [];
            foreach ($nameFields as $field) {
                $value = array_key_exists($field, $data) ? $data[$field] : $existing->{$field};
                if ($value !== null && $value !== '') $parts[] = $value;
            }
            if ($parts) $data['variant_name'] = implode(' / ', $parts);
        }

        return $data;
    }

    private function prepareVariantData(array $data, ?ProductVariant $existing = null): array
    {
        $parts = array_values(array_filter([
            $data['color_name'] ?? null,
            $data['region'] ?? null,
            $data['variant_type'] ?? null,
            $data['ram'] ?? null,
            $data['storage'] ?? null,
            $data['sim_network'] ?? null,
        ]));

        $data['variant_name'] = trim((string) ($data['variant_name'] ?? '')) ?: (count($parts) ? implode(' / ', $parts) : 'Default Variant');
        $data['condition'] = $data['condition'] ?? $data['product_type'] ?? 'new';
        $data['product_type'] = $data['product_type'] ?? $data['condition'];
        $data['barcode_mode'] = $data['barcode_mode'] ?? 'auto';
        $data['status'] = $data['status'] ?? 'active';
        $data['purchase_price'] = (float) ($data['purchase_price'] ?? 0);
        $data['sale_price'] = (float) ($data['sale_price'] ?? 0);
        $data['market_price'] = $data['market_price'] ?? null;
        $data['regular_price'] = $data['regular_price'] ?? null;
        $data['discount_price'] = $data['discount_price'] ?? null;
        $data['stock_quantity'] = (int) ($data['stock_quantity'] ?? 0);
        $data['opening_stock_quantity'] = array_key_exists('opening_stock_quantity', $data)
            ? (int) $data['opening_stock_quantity']
            : (int) $data['stock_quantity'];

        if (isset($data['attribute_values']) && is_string($data['attribute_values'])) {
            $decodedAttributeValues = json_decode($data['attribute_values'], true);
            if (is_array($decodedAttributeValues)) {
                $data['attribute_values'] = $decodedAttributeValues;
            }
        }
        $data['low_stock_alert'] = (int) ($data['low_stock_alert'] ?? 5);

        if (empty($data['sku'])) {
            $data['sku'] = $existing?->sku ?: $this->generateUniqueVariantSku();
        }

        if (($data['barcode_mode'] === 'auto') || empty($data['barcode'])) {
            $data['barcode'] = $existing?->barcode ?: $this->generateUniqueVariantBarcode();
        }

        $data['attributes'] = [
            'color_name' => $data['color_name'] ?? null,
            'region' => $data['region'] ?? null,
            'variant_type' => $data['variant_type'] ?? null,
            'ram' => $data['ram'] ?? null,
            'storage' => $data['storage'] ?? null,
            'sim_network' => $data['sim_network'] ?? null,
            'product_type' => $data['product_type'] ?? null,
        ];

        return $data;
    }

    private function formatVariant(ProductVariant $variant, Request $request): array
    {
        $branchId = $request->integer('branch_id') ?: null;
        $variant->loadMissing(['product', 'images']);

        $branchStock = null;
        if ($branchId && Schema::hasTable('branch_stocks')) {
            $branchStock = BranchStock::where('branch_id', $branchId)
                ->where('product_variant_id', $variant->id)
                ->first();
        }

        $availableDevices = 0;
        if (Schema::hasTable('device_units')) {
            $availableDevices = DeviceUnit::where('product_variant_id', $variant->id)
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->whereIn('status', ['available', 'in_stock', 'active', 'reserved', 'ready_for_sale'])
                ->when(\Illuminate\Support\Facades\Schema::hasColumn('device_units', 'saleable'), fn ($q) => $q->where('saleable', true))
                ->count();
        }

        return array_merge($variant->toArray(), [
            'product' => $variant->product,
            'product_name' => $variant->product?->name,
            'display_name' => $variant->display_name,
            'branch_quantity' => $branchStock ? (int) $branchStock->quantity : null,
            'available_device_count' => $availableDevices,
            'images' => $variant->images
                ? $variant->images->sortBy('sort_order')->values()->map(fn ($image) => [
                    'id' => $image->id,
                    'product_id' => $image->product_id,
                    'product_variant_id' => $image->product_variant_id,
                    'image_path' => $image->image_path,
                    'thumbnail_path' => $image->thumbnail_path,
                    'image_url' => $image->image_url,
                    'thumbnail_url' => $image->thumbnail_url,
                    'url' => $image->thumbnail_url ?: $image->image_url,
                    'is_primary' => (bool) $image->is_primary,
                ])->all()
                : [],
            'sale_price' => (float) ($variant->sale_price ?? 0),
            'market_price' => $variant->market_price !== null ? (float) $variant->market_price : null,
        ]);
    }

    /**
     * Product Variant Operations image persistence.
     * The frontend posts gallery_image_ids, remove_image_ids and variant_images[].
     * Physical media is never deleted by unlinking.
     */
    private function nstVsiSyncVariantImages(Request $request, ProductVariant $variant, \App\Services\ProductMediaService $mediaService): void
    {
        if (!\Illuminate\Support\Facades\Schema::hasTable('product_images')) {
            return;
        }

        $decodeIds = static function ($value): array {
            if (is_array($value)) {
                return array_values(array_filter(array_map('intval', $value)));
            }
            if ($value === null || $value === '') {
                return [];
            }
            $decoded = json_decode((string) $value, true);
            return is_array($decoded) ? array_values(array_filter(array_map('intval', $decoded))) : [];
        };

        $removeIds = $decodeIds($request->input('remove_image_ids'));
        if ($removeIds) {
            \App\Models\ProductImage::where('product_id', $variant->product_id)
                ->where('product_variant_id', $variant->id)
                ->whereIn('id', $removeIds)
                ->update([
                    'product_variant_id' => null,
                    'variant_key' => null,
                ]);
        }

        $currentCount = \App\Models\ProductImage::where('product_variant_id', $variant->id)
            ->where('media_type', 'image')
            ->count();
        $remaining = max(0, 5 - $currentCount);

        $galleryIds = $decodeIds($request->input('gallery_image_ids'));
        if ($remaining > 0 && $galleryIds) {
            $sources = \App\Models\ProductImage::whereIn('id', $galleryIds)
                ->where('media_type', 'image')
                ->limit($remaining)
                ->get();

            foreach ($sources as $source) {
                if (\App\Models\ProductImage::where('product_variant_id', $variant->id)
                    ->where('image_path', $source->image_path)
                    ->exists()) {
                    continue;
                }

                \App\Models\ProductImage::create([
                    'product_id' => $variant->product_id,
                    'product_variant_id' => $variant->id,
                    'variant_key' => $variant->sku,
                    'media_type' => 'image',
                    'image_path' => $source->image_path,
                    'thumbnail_path' => $source->thumbnail_path,
                    'original_name' => $source->original_name,
                    'mime_type' => $source->mime_type,
                    'size_kb' => $source->size_kb,
                    'processed_size_kb' => $source->processed_size_kb,
                    'is_primary' => false,
                    'sort_order' => 100 + $currentCount,
                ]);
                $currentCount++;
                $remaining = max(0, 5 - $currentCount);
                if ($remaining === 0) {
                    break;
                }
            }
        }

        if ($remaining <= 0 || !$request->hasFile('variant_images')) {
            return;
        }

        $files = $request->file('variant_images');
        $files = is_array($files) ? $files : [$files];
        $files = array_slice($files, 0, $remaining);

        foreach ($files as $offset => $file) {
            if (!$file) {
                continue;
            }
            $media = $mediaService->processUploadedMedia($file);
            if (($media['media_type'] ?? 'image') !== 'image') {
                continue;
            }

            \App\Models\ProductImage::create([
                'product_id' => $variant->product_id,
                'product_variant_id' => $variant->id,
                'variant_key' => $variant->sku,
                'media_type' => 'image',
                'image_path' => $media['image_path'],
                'thumbnail_path' => $media['thumbnail_path'],
                'original_name' => $media['original_name'],
                'mime_type' => $media['mime_type'],
                'size_kb' => $media['size_kb'],
                'processed_size_kb' => $media['processed_size_kb'],
                'is_primary' => false,
                'sort_order' => 100 + $currentCount + $offset,
            ]);
        }
    }

    /**
     * Keep ProductVariant, BranchStock and Product aggregate aligned.
     * If the variant has serialized DeviceUnit history, saleable devices are the
     * source of truth. Otherwise the entered variant quantity is retained.
     */
    private function nstVsiSyncStandaloneStock(Request $request, ProductVariant $variant): void
    {
        $branchId = (int) ($request->input('branch_id') ?: $variant->branch_id ?: 0);
        $hasDeviceRows = \Illuminate\Support\Facades\Schema::hasTable('device_units')
            && \App\Models\DeviceUnit::withTrashed()->where('product_variant_id', $variant->id)->exists();

        if ($hasDeviceRows) {
            $base = \App\Models\DeviceUnit::query()
                ->where('product_variant_id', $variant->id)
                ->whereNull('deleted_at')
                ->whereIn('status', ['available', 'in_stock', 'active', 'reserved', 'ready_for_sale']);

            if (\Illuminate\Support\Facades\Schema::hasColumn('device_units', 'saleable')) {
                $base->where('saleable', true);
            }

            $total = (int) (clone $base)->count();
            $variant->forceFill([
                'stock_quantity' => $total,
                'opening_stock_quantity' => max((int) ($variant->opening_stock_quantity ?? 0), $total),
            ])->save();

            if (\Illuminate\Support\Facades\Schema::hasTable('branch_stocks')) {
                $branchIds = \App\Models\DeviceUnit::query()
                    ->where('product_variant_id', $variant->id)
                    ->whereNotNull('branch_id')
                    ->pluck('branch_id')
                    ->map(fn ($id) => (int) $id)
                    ->unique()
                    ->values()
                    ->all();

                if ($branchId > 0) {
                    $branchIds[] = $branchId;
                    $branchIds = array_values(array_unique($branchIds));
                }

                foreach ($branchIds as $id) {
                    $branchQuery = \App\Models\DeviceUnit::query()
                        ->where('product_variant_id', $variant->id)
                        ->where('branch_id', $id)
                        ->whereNull('deleted_at')
                        ->whereIn('status', ['available', 'in_stock', 'active', 'reserved', 'ready_for_sale']);

                    if (\Illuminate\Support\Facades\Schema::hasColumn('device_units', 'saleable')) {
                        $branchQuery->where('saleable', true);
                    }

                    \App\Models\BranchStock::updateOrCreate(
                        [
                            'branch_id' => $id,
                            'product_id' => $variant->product_id,
                            'product_variant_id' => $variant->id,
                        ],
                        [
                            'quantity' => (int) $branchQuery->count(),
                            'alert_quantity' => (int) ($variant->low_stock_alert ?? 5),
                            'status' => 'active',
                        ]
                    );
                }
            }

            return;
        }

        if ($branchId > 0 && \Illuminate\Support\Facades\Schema::hasTable('branch_stocks')) {
            \App\Models\BranchStock::updateOrCreate(
                [
                    'branch_id' => $branchId,
                    'product_id' => $variant->product_id,
                    'product_variant_id' => $variant->id,
                ],
                [
                    'quantity' => max(0, (int) ($variant->stock_quantity ?? 0)),
                    'alert_quantity' => (int) ($variant->low_stock_alert ?? 5),
                    'status' => 'active',
                ]
            );
        }
    }
    private function syncProductStock(int $productId): void
    {
        $product = Product::find($productId);
        if (!$product) {
            return;
        }

        $total = (int) ProductVariant::where('product_id', $productId)->sum('stock_quantity');
        $product->update([
            'stock_quantity' => $total,
            'status' => $total <= 0 ? 'out_of_stock' : 'active',
        ]);
    }

    private function generateUniqueVariantSku(): string
    {
        do {
            $sku = 'NSTV-' . strtoupper(Str::random(8));
        } while (ProductVariant::where('sku', $sku)->exists());

        return $sku;
    }

    private function generateUniqueVariantBarcode(): string
    {
        do {
            $barcode = 'NSTV' . now()->format('ymd') . random_int(100000, 999999);
        } while (ProductVariant::where('barcode', $barcode)->exists());

        return $barcode;
    }
}
