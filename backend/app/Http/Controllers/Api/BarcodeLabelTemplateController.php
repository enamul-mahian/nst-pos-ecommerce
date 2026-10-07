<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BarcodeLabelTemplateController extends Controller
{
    private function defaults(): array
    {
        return [
            'encoding' => 'CODE128',
            'encoded_field' => 'barcode',
            'fallback_encoded_field' => 'sku',
            'show_barcode_text' => true,
            'show_sku_text' => false,
            'show_product_name' => true,
            'show_sale_price' => true,
            'show_imei1' => false,
            'show_imei2' => false,
            'show_branch' => false,
            'show_condition' => false,
            'show_warranty' => false,
            'custom_text' => '',
            'label_width_mm' => 40,
            'label_height_mm' => 30,
            'orientation' => 'landscape',
            'font_size' => 8,
            'barcode_height' => 12,
            'barcode_width' => 1,
            'alignment' => 'center',
            'border' => false,
            'copies' => 1,
            'layout_key' => 'NST_FINAL_30x40',
            'hide_iphone_ram' => true,
        ];
    }

    public function index(): JsonResponse
    {
        return response()->json([
            'status' => true,
            'data' => DB::table('barcode_label_templates')
                ->where('is_active', true)
                ->orderByDesc('is_default')
                ->orderBy('name')
                ->get()
                ->map(fn ($row) => $this->decode($row)),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id' => ['nullable', 'integer'],
            'name' => ['required', 'string', 'max:120'],
            'template_key' => ['nullable', 'string', 'max:120'],
            'is_default' => ['nullable', 'boolean'],
            'settings' => ['required', 'array'],
            'settings.show_product_name' => ['nullable', 'boolean'],
            'settings.show_sale_price' => ['nullable', 'boolean'],
            'settings.show_barcode_text' => ['nullable', 'boolean'],
            'settings.show_sku_text' => ['nullable', 'boolean'],
            'settings.show_imei1' => ['nullable', 'boolean'],
            'settings.show_imei2' => ['nullable', 'boolean'],
            'settings.show_branch' => ['nullable', 'boolean'],
            'settings.show_condition' => ['nullable', 'boolean'],
            'settings.show_warranty' => ['nullable', 'boolean'],
            'settings.hide_iphone_ram' => ['nullable', 'boolean'],
            'settings.custom_text' => ['nullable', 'string', 'max:120'],
            'settings.label_width_mm' => ['nullable', 'numeric', 'between:15,200'],
            'settings.label_height_mm' => ['nullable', 'numeric', 'between:10,200'],
            'settings.orientation' => ['nullable', Rule::in(['portrait', 'landscape'])],
            'settings.copies' => ['nullable', 'integer', 'between:1,500'],
            'settings.alignment' => ['nullable', Rule::in(['left', 'center', 'right'])],
        ]);

        $settings = array_merge($this->defaults(), $validated['settings']);
        $settings['encoding'] = 'CODE128';
        $settings['encoded_field'] = 'barcode';
        $settings['fallback_encoded_field'] = 'sku';

        if (! empty($validated['is_default'])) {
            DB::table('barcode_label_templates')->update(['is_default' => false]);
        }

        $payload = [
            'name' => $validated['name'],
            'template_key' => $validated['template_key'] ?? Str::slug($validated['name']) . '-' . Str::lower(Str::random(5)),
            'is_default' => (bool) ($validated['is_default'] ?? false),
            'is_active' => true,
            'settings' => json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'updated_by' => $request->user()?->id,
            'updated_at' => now(),
        ];

        $id = $validated['id'] ?? null;

        if ($id) {
            DB::table('barcode_label_templates')->where('id', $id)->update($payload);
        } else {
            $id = DB::table('barcode_label_templates')->insertGetId($payload + [
                'created_by' => $request->user()?->id,
                'created_at' => now(),
            ]);
        }

        return response()->json([
            'status' => true,
            'message' => 'Barcode label template saved.',
            'data' => $this->decode(DB::table('barcode_label_templates')->find($id)),
        ]);
    }

    public function printPayload(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'barcode' => ['nullable', 'string', 'max:191'],
            'sku' => ['nullable', 'string', 'max:191'],
            'template_id' => ['nullable', 'integer'],
            'product' => ['nullable', 'array'],
        ]);

        $encoded = trim((string) ($validated['barcode'] ?? ''));
        if ($encoded === '') {
            $encoded = trim((string) ($validated['sku'] ?? ''));
        }
        abort_if($encoded === '', 422, 'Barcode or SKU is required for printing.');

        $template = ! empty($validated['template_id'])
            ? DB::table('barcode_label_templates')->find($validated['template_id'])
            : DB::table('barcode_label_templates')->where('is_default', true)->first();

        abort_unless($template, 422, 'No barcode template is available.');

        $settings = array_merge($this->defaults(), json_decode((string) $template->settings, true) ?: []);

        return response()->json([
            'status' => true,
            'data' => [
                'symbology' => 'CODE128',
                'encoded_value' => $encoded,
                'scan_result' => $encoded,
                'visible' => [
                    'barcode' => $validated['barcode'] ?? null,
                    'sku' => $validated['sku'] ?? null,
                    'product_name' => ! empty($settings['show_product_name']) ? data_get($validated, 'product.name') : null,
                    'sale_price' => ! empty($settings['show_sale_price']) ? data_get($validated, 'product.sale_price') : null,
                    'imei1' => ! empty($settings['show_imei1']) ? data_get($validated, 'product.imei_1') : null,
                    'imei2' => ! empty($settings['show_imei2']) ? data_get($validated, 'product.imei_2') : null,
                    'branch' => ! empty($settings['show_branch']) ? data_get($validated, 'product.branch') : null,
                    'condition' => ! empty($settings['show_condition']) ? data_get($validated, 'product.condition') : null,
                    'warranty' => ! empty($settings['show_warranty']) ? data_get($validated, 'product.warranty') : null,
                    'custom_text' => $settings['custom_text'] ?? null,
                ],
                'settings' => $settings,
            ],
        ]);
    }

    private function decode(object $row): array
    {
        return array_merge((array) $row, [
            'settings' => array_merge($this->defaults(), json_decode((string) $row->settings, true) ?: []),
        ]);
    }
}
