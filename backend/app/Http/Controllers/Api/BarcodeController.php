<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeviceUnit;
use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BarcodeController extends Controller
{
    public function generate(Request $request, Product $product): JsonResponse
    {
        $validated = $request->validate([
            'mode' => ['nullable', Rule::in(['auto', 'manual'])],
            'barcode' => ['nullable', 'string', 'max:80', 'regex:/^[A-Za-z0-9._\-]+$/'],
            'generate_missing_variants' => ['nullable', 'boolean'],
        ]);

        $mode = $validated['mode'] ?? ($validated['barcode'] ?? null ? 'manual' : 'auto');
        if ($mode === 'manual' && empty($validated['barcode'])) {
            return response()->json(['status' => false, 'message' => 'A barcode is required in manual mode.'], 422);
        }

        $result = DB::transaction(function () use ($request, $product, $validated, $mode) {
            $locked = Product::whereKey($product->id)->lockForUpdate()->firstOrFail();
            $barcode = $mode === 'manual'
                ? strtoupper(trim($validated['barcode']))
                : $this->uniqueBarcode('NSTP', 'products', 'barcode');

            $this->assertBarcodeAvailable($barcode, 'product', $locked->id);

            $locked->forceFill([
                'barcode' => $barcode,
                'barcode_mode' => $mode,
            ])->save();

            $variantBarcodes = [];
            if ((bool) ($validated['generate_missing_variants'] ?? false)) {
                ProductVariant::where('product_id', $locked->id)
                    ->whereNull('barcode')
                    ->lockForUpdate()
                    ->get()
                    ->each(function (ProductVariant $variant) use (&$variantBarcodes) {
                        $variant->forceFill([
                            'barcode' => $this->uniqueBarcode('NSTV', 'product_variants', 'barcode'),
                            'barcode_mode' => 'auto',
                        ])->save();
                        $variantBarcodes[] = ['id' => $variant->id, 'barcode' => $variant->barcode];
                    });
            }

            $this->logPrintAction($request, null, 'generate', [
                'entity_type' => 'product',
                'entity_id' => $locked->id,
                'barcode' => $barcode,
                'variant_barcodes' => $variantBarcodes,
            ]);

            return [
                'product' => $locked->fresh(['variants:id,product_id,variant_name,sku,barcode']),
                'label' => $this->productLabel($locked),
                'generated_variants' => $variantBarcodes,
            ];
        });

        return response()->json([
            'status' => true,
            'message' => 'Product barcode generated successfully.',
            'data' => $result,
        ]);
    }

    public function show(Product $product): JsonResponse
    {
        $product->load([
            'brandInfo:id,name',
            'categoryInfo:id,name',
            'variants:id,product_id,variant_name,sku,barcode,color_name,region,ram,storage,sim_network,sale_price,stock_quantity',
        ]);

        return response()->json([
            'status' => true,
            'data' => [
                'product' => $product,
                'label' => $this->productLabel($product),
                'variants' => $product->variants->map(fn (ProductVariant $variant) => [
                    'id' => $variant->id,
                    'name' => $variant->display_name ?: $variant->variant_name,
                    'sku' => $variant->sku,
                    'barcode' => $variant->barcode,
                    'price' => $variant->sale_price,
                    'stock_quantity' => $variant->stock_quantity,
                ]),
            ],
        ]);
    }

    public function generateVariant(Request $request, ProductVariant $productVariant): JsonResponse
    {
        $validated = $request->validate([
            'mode' => ['nullable', Rule::in(['auto', 'manual'])],
            'barcode' => ['nullable', 'string', 'max:80', 'regex:/^[A-Za-z0-9._\-]+$/'],
        ]);

        $mode = $validated['mode'] ?? ($validated['barcode'] ?? null ? 'manual' : 'auto');
        abort_if($mode === 'manual' && empty($validated['barcode']), 422, 'A barcode is required in manual mode.');

        $variant = DB::transaction(function () use ($productVariant, $validated, $mode) {
            $variant = ProductVariant::whereKey($productVariant->id)->lockForUpdate()->firstOrFail();
            $barcode = $mode === 'manual'
                ? strtoupper(trim($validated['barcode']))
                : $this->uniqueBarcode('NSTV', 'product_variants', 'barcode');
            $this->assertBarcodeAvailable($barcode, 'variant', $variant->id);
            $variant->forceFill(['barcode' => $barcode, 'barcode_mode' => $mode])->save();
            return $variant->fresh('product:id,name,sku');
        });

        return response()->json(['status' => true, 'message' => 'Variant barcode generated successfully.', 'data' => $variant]);
    }

    public function generateDeviceUnit(Request $request, DeviceUnit $deviceUnit): JsonResponse
    {
        $validated = $request->validate([
            'mode' => ['nullable', Rule::in(['auto', 'manual'])],
            'barcode' => ['nullable', 'string', 'max:80', 'regex:/^[A-Za-z0-9._\-]+$/'],
        ]);

        $mode = $validated['mode'] ?? ($validated['barcode'] ?? null ? 'manual' : 'auto');
        abort_if($mode === 'manual' && empty($validated['barcode']), 422, 'A barcode is required in manual mode.');

        $unit = DB::transaction(function () use ($request, $deviceUnit, $validated, $mode) {
            $unit = DeviceUnit::whereKey($deviceUnit->id)->lockForUpdate()->firstOrFail();
            $barcode = $mode === 'manual'
                ? strtoupper(trim($validated['barcode']))
                : $this->uniqueBarcode('NSTD', 'device_units', 'barcode');
            $this->assertBarcodeAvailable($barcode, 'device_unit', $unit->id);
            $unit->forceFill(['barcode' => $barcode, 'barcode_source' => $mode, 'updated_by' => $request->user()?->id])->save();
            $this->logPrintAction($request, $unit, 'generate', ['barcode' => $barcode]);
            return $unit->fresh(['product:id,name', 'variant:id,variant_name,sku', 'branch:id,name']);
        });

        return response()->json(['status' => true, 'message' => 'Device barcode generated successfully.', 'data' => $unit]);
    }

    private function productLabel(Product $product): array
    {
        return [
            'barcode' => $product->barcode,
            'symbology' => 'CODE128',
            'name' => $product->name,
            'sku' => $product->sku,
            'price' => $product->sale_price,
            'brand' => $product->brandInfo?->name ?? $product->brand,
            'category' => $product->categoryInfo?->name ?? $product->category,
        ];
    }

    private function uniqueBarcode(string $prefix, string $table, string $column): string
    {
        do {
            $barcode = $prefix . '-' . now()->format('ymd') . '-' . strtoupper(Str::random(8));
        } while (DB::table($table)->where($column, $barcode)->exists() || $this->existsAnywhere($barcode));

        return $barcode;
    }

    private function assertBarcodeAvailable(string $barcode, string $entity, int $entityId): void
    {
        $collisions = [
            'product' => DB::table('products')->where('barcode', $barcode)->where('id', '<>', $entityId)->exists(),
            'variant' => DB::table('product_variants')->where('barcode', $barcode)->where('id', '<>', $entityId)->exists(),
            'device_unit' => DB::table('device_units')->where('barcode', $barcode)->where('id', '<>', $entityId)->exists(),
        ];

        foreach ($collisions as $type => $exists) {
            if ($exists || ($type !== $entity && $this->entityHasBarcode($type, $barcode))) {
                abort(422, 'The barcode is already assigned to another inventory record.');
            }
        }
    }

    private function entityHasBarcode(string $entity, string $barcode): bool
    {
        return match ($entity) {
            'product' => DB::table('products')->where('barcode', $barcode)->exists(),
            'variant' => DB::table('product_variants')->where('barcode', $barcode)->exists(),
            'device_unit' => DB::table('device_units')->where('barcode', $barcode)->exists(),
            default => false,
        };
    }

    private function existsAnywhere(string $barcode): bool
    {
        return DB::table('products')->where('barcode', $barcode)->exists()
            || DB::table('product_variants')->where('barcode', $barcode)->exists()
            || DB::table('device_units')->where('barcode', $barcode)->exists();
    }

    private function logPrintAction(Request $request, ?DeviceUnit $unit, string $action, array $content): void
    {
        if (! DB::getSchemaBuilder()->hasTable('barcode_print_logs')) {
            return;
        }

        DB::table('barcode_print_logs')->insert([
            'device_unit_id' => $unit?->id,
            'action' => $action,
            'print_count' => 0,
            'reason' => null,
            'printed_by' => $request->user()?->id,
            'branch_id' => $unit?->branch_id,
            'label_size' => '40x20',
            'printer_type' => 'a4',
            'content_options' => json_encode($content, JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
