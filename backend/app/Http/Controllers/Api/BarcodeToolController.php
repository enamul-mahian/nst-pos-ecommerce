<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeviceUnit;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\CorporateSettingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class BarcodeToolController extends Controller
{
    public function __construct(private CorporateSettingService $settings)
    {
    }

    public function settings()
    {
        return response()->json([
            'success' => true,
            'data' => $this->settings->section('barcode'),
        ]);
    }

    public function updateSettings(Request $request)
    {
        $validated = $request->validate([
            'settings' => ['required', 'array'],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Barcode settings saved.',
            'data' => $this->settings->saveSection('barcode', $validated['settings']),
        ]);
    }

    public function search(Request $request)
    {
        $q = trim((string) $request->get('q', ''));

        if ($q === '') {
            return response()->json(['success' => true, 'data' => []]);
        }

        $results = [];

        Product::query()
            ->where(function ($query) use ($q) {
                $query->where('name', 'like', "%{$q}%")
                    ->orWhere('sku', 'like', "%{$q}%")
                    ->orWhere('barcode', 'like', "%{$q}%");
            })
            ->limit(25)
            ->get()
            ->each(function (Product $product) use (&$results, $q) {
                $results[] = [
                    'type' => 'product',
                    'id' => $product->id,
                    'product_id' => $product->id,
                    'name' => $product->name,
                    'sku' => $product->sku,
                    'barcode' => $product->barcode,
                    'price' => (float) ($product->sale_price ?? 0),
                    'sale_price' => (float) ($product->sale_price ?? 0),
                    'status' => $product->status,
                    'match_score' => $this->matchScore($q, [
                        $product->barcode,
                        $product->sku,
                        $product->name,
                    ]),
                ];
            });

        if (Schema::hasTable('product_variants')) {
            ProductVariant::with('product:id,name,sku,barcode,sale_price')
                ->where(function ($query) use ($q) {
                    foreach ([
                        'variant_name', 'sku', 'barcode', 'color', 'color_name',
                        'storage', 'region', 'region_variant', 'ram', 'ram_storage',
                        'sim_network',
                    ] as $column) {
                        if (Schema::hasColumn('product_variants', $column)) {
                            $query->orWhere($column, 'like', "%{$q}%");
                        }
                    }
                })
                ->limit(25)
                ->get()
                ->each(function (ProductVariant $variant) use (&$results, $q) {
                    $variantName = $variant->display_name ?: $variant->variant_name ?: 'Variant';
                    $name = trim(($variant->product?->name ?: 'Product') . ' - ' . $variantName);
                    $price = (float) ($variant->sale_price ?: $variant->regular_price ?: $variant->product?->sale_price ?: 0);

                    $results[] = [
                        'type' => 'variant',
                        'id' => $variant->id,
                        'product_id' => $variant->product_id,
                        'product_variant_id' => $variant->id,
                        'name' => $name,
                        'product_name' => $variant->product?->name,
                        'variant_display' => $variantName,
                        'sku' => $variant->sku ?: $variant->product?->sku,
                        'barcode' => $variant->barcode,
                        'price' => $price,
                        'sale_price' => $price,
                        'color_name' => $variant->color_name ?: $variant->color,
                        'region' => $variant->region ?: $variant->region_variant,
                        'ram' => $variant->ram ?: $variant->ram_storage,
                        'storage' => $variant->storage,
                        'sim_network' => $variant->sim_network,
                        'match_score' => $this->matchScore($q, [
                            $variant->barcode,
                            $variant->sku,
                            $variantName,
                            $variant->product?->name,
                        ]),
                    ];
                });
        }

        if (Schema::hasTable('device_units')) {
            DeviceUnit::with([
                'product:id,name,sku,barcode,sale_price',
                'variant:id,product_id,variant_name,sku,barcode,color,color_name,storage,region,region_variant,ram,ram_storage,sim_network,sale_price',
                'branch:id,name,code',
            ])
                ->where(function ($query) use ($q) {
                    foreach ([
                        'sku', 'imei_1', 'imei_2', 'barcode',
                        'imei_1_barcode', 'imei_2_barcode',
                        'product_name', 'model_number',
                    ] as $column) {
                        if (Schema::hasColumn('device_units', $column)) {
                            $query->orWhere($column, 'like', "%{$q}%");
                        }
                    }

                    $query->orWhereHas('product', function ($productQuery) use ($q) {
                        $productQuery->where('name', 'like', "%{$q}%")
                            ->orWhere('sku', 'like', "%{$q}%")
                            ->orWhere('barcode', 'like', "%{$q}%");
                    });

                    if (Schema::hasTable('product_variants')) {
                        $query->orWhereHas('variant', function ($variantQuery) use ($q) {
                            $variantQuery->where('variant_name', 'like', "%{$q}%")
                                ->orWhere('sku', 'like', "%{$q}%")
                                ->orWhere('barcode', 'like', "%{$q}%");
                        });
                    }
                })
                ->limit(40)
                ->get()
                ->each(function (DeviceUnit $device) use (&$results, $q) {
                    $variant = $device->variant;
                    $variantName = $variant?->display_name ?: $variant?->variant_name;
                    $price = (float) ($device->selling_price ?: $variant?->sale_price ?: $device->product?->sale_price ?: 0);

                    $results[] = [
                        'type' => 'device',
                        'id' => $device->id,
                        'device_unit_id' => $device->id,
                        'product_id' => $device->product_id,
                        'product_variant_id' => $device->product_variant_id,
                        'name' => trim(($device->product_name ?: $device->product?->name ?: 'Device') . ($variantName ? ' - ' . $variantName : '')),
                        'product_name' => $device->product_name ?: $device->product?->name,
                        'variant_display' => $variantName,
                        'sku' => $device->sku ?: $variant?->sku ?: $device->product?->sku,
                        'imei_1' => $device->imei_1,
                        'imei_2' => $device->imei_2,
                        'barcode' => $device->barcode ?: $variant?->barcode ?: $device->product?->barcode,
                        'status' => $device->status,
                        'saleable' => (bool) ($device->saleable ?? false),
                        'price' => $price,
                        'sale_price' => $price,
                        'color_name' => $device->color_name ?: $variant?->color_name ?: $variant?->color,
                        'region' => $device->region ?: $variant?->region ?: $variant?->region_variant,
                        'ram' => $device->ram ?: $variant?->ram ?: $variant?->ram_storage,
                        'storage' => $device->storage ?: $variant?->storage,
                        'sim_network' => $device->sim_network ?: $variant?->sim_network,
                        'branch_name' => $device->branch?->name,
                        'match_score' => $this->matchScore($q, [
                            $device->barcode,
                            $device->sku,
                            $device->imei_1,
                            $device->imei_2,
                            $device->product_name,
                            $device->product?->name,
                        ]),
                    ];
                });
        }

        $results = collect($results)
            ->unique(fn ($item) => $item['type'] . ':' . $item['id'])
            ->sortByDesc('match_score')
            ->values()
            ->take(60)
            ->map(function ($item) {
                unset($item['match_score']);
                return $item;
            })
            ->all();

        return response()->json(['success' => true, 'data' => $results]);
    }

    public function updateBarcodes(Request $request)
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.type' => ['required', Rule::in(['product', 'variant', 'device'])],
            'items.*.id' => ['required', 'integer'],
            'items.*.barcode' => ['required', 'string', 'max:191', 'regex:/^[A-Za-z0-9._\-]+$/'],
        ]);

        $updated = 0;

        DB::transaction(function () use ($validated, &$updated, $request) {
            foreach ($validated['items'] as $item) {
                $barcode = strtoupper(trim((string) $item['barcode']));
                $this->assertUniqueBarcode($barcode, $item['type'], (int) $item['id']);

                if ($item['type'] === 'product') {
                    $updated += Product::whereKey($item['id'])->update(['barcode' => $barcode]);
                } elseif ($item['type'] === 'variant') {
                    $updated += ProductVariant::whereKey($item['id'])->update(['barcode' => $barcode]);
                } else {
                    $updated += DeviceUnit::whereKey($item['id'])->update([
                        'barcode' => $barcode,
                        'updated_by' => $request->user()?->id,
                    ]);
                }
            }
        });

        return response()->json([
            'success' => true,
            'message' => "{$updated} barcode updated.",
        ]);
    }

    public function printData(Request $request)
    {
        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
        ]);

        $settings = array_merge([
            'encoding' => 'CODE128',
            'encoded_field' => 'barcode',
            'fallback_encoded_field' => 'sku',
            'label_width_mm' => 40,
            'label_height_mm' => 30,
            'show_product_name' => true,
            'show_sale_price' => true,
            'show_barcode_text' => true,
        ], $this->settings->section('barcode'));

        return response()->json([
            'success' => true,
            'data' => [
                'settings' => $settings,
                'items' => $validated['items'],
            ],
        ]);
    }

    public function logPrint(Request $request)
    {
        abort_unless(Schema::hasTable('barcode_print_logs'), 503, 'Barcode print history table is not available.');

        $validated = $request->validate([
            'items' => ['required', 'array', 'min:1'],
            'items.*.type' => ['required', Rule::in(['product', 'variant', 'device'])],
            'items.*.id' => ['required', 'integer'],
            'items.*.barcode' => ['nullable', 'string', 'max:191'],
            'items.*.sku' => ['nullable', 'string', 'max:191'],
            'action' => ['required', Rule::in(['print', 'reprint'])],
            'reason' => ['nullable', 'string', 'max:1000'],
            'printer_type' => ['nullable', 'string', 'max:30'],
            'copies' => ['nullable', 'integer', 'between:1,500'],
        ]);

        if ($validated['action'] === 'reprint' && blank($validated['reason'] ?? null)) {
            return response()->json([
                'success' => false,
                'message' => 'Reprint reason is required.',
            ], 422);
        }

        foreach ($validated['items'] as $item) {
            $device = $item['type'] === 'device'
                ? DeviceUnit::find($item['id'])
                : null;

            DB::table('barcode_print_logs')->insert([
                'device_unit_id' => $device?->id,
                'action' => $validated['action'],
                'print_count' => (int) ($validated['copies'] ?? 1),
                'reason' => $validated['reason'] ?? null,
                'printed_by' => $request->user()?->id,
                'branch_id' => $device?->branch_id ?: $request->user()?->branch_id,
                'label_size' => '40x30',
                'printer_type' => $validated['printer_type'] ?? 'thermal',
                'content_options' => json_encode([
                    'entity_type' => $item['type'],
                    'entity_id' => $item['id'],
                    'barcode' => $item['barcode'] ?? null,
                    'sku' => $item['sku'] ?? null,
                    'layout' => 'NST_FINAL_30x40',
                    'physical_width_mm' => 40,
                    'physical_height_mm' => 30,
                ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            if ($device && Schema::hasColumn('device_units', 'is_barcode_printed')) {
                $device->forceFill([
                    'is_barcode_printed' => true,
                    'barcode_printed_at' => now(),
                    'updated_by' => $request->user()?->id,
                ])->save();
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Barcode print history recorded.',
        ]);
    }

    private function matchScore(string $q, array $values): int
    {
        $needle = mb_strtolower($q);
        $score = 0;

        foreach ($values as $index => $value) {
            $value = trim((string) ($value ?? ''));
            if ($value === '') {
                continue;
            }

            $haystack = mb_strtolower($value);

            if ($haystack === $needle) {
                $score = max($score, 100 - $index);
            } elseif (str_starts_with($haystack, $needle)) {
                $score = max($score, 75 - $index);
            } elseif (str_contains($haystack, $needle)) {
                $score = max($score, 50 - $index);
            }
        }

        return $score;
    }

    private function assertUniqueBarcode(string $barcode, string $type, int $id): void
    {
        $checks = [
            'product' => ['products', 'id'],
            'variant' => ['product_variants', 'id'],
            'device' => ['device_units', 'id'],
        ];

        foreach ($checks as $entityType => [$table, $idColumn]) {
            if (! Schema::hasTable($table) || ! Schema::hasColumn($table, 'barcode')) {
                continue;
            }

            $query = DB::table($table)->where('barcode', $barcode);
            if ($entityType === $type) {
                $query->where($idColumn, '<>', $id);
            }

            abort_if($query->exists(), 422, 'The barcode is already assigned to another inventory record.');
        }
    }
}
