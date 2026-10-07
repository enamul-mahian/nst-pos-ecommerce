<?php

namespace App\Services;

use App\Models\DeviceUnit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DeviceLifecycleHistoryService
{
    public function snapshot(DeviceUnit $device): array
    {
        return [
            'id' => $device->id,
            'purchase_id' => $device->purchase_id,
            'used_purchase_id' => $device->used_purchase_id,
            'supplier_id' => $device->supplier_id,
            'branch_id' => $device->branch_id,
            'product_id' => $device->product_id,
            'product_variant_id' => $device->product_variant_id,
            'product_name' => $device->product_name,
            'sku' => $device->sku,
            'barcode' => $device->barcode,
            'imei_1' => $device->imei_1,
            'imei_2' => $device->imei_2,
            'condition' => $device->condition,
            'battery_health' => $device->battery_health,
            'purchase_cost' => $device->purchase_cost,
            'selling_price' => $device->selling_price,
            'status' => $device->status,
            'saleable' => $device->saleable,
            'website_published' => $device->website_published,
            'service_status' => $device->service_status,
            'sale_id' => $device->sale_id,
            'sale_item_id' => $device->sale_item_id,
            'sold_at' => optional($device->sold_at)->toDateTimeString(),
            'returned_at' => optional($device->returned_at)->toDateTimeString(),
            'return_reason' => $device->return_reason,
            'return_note' => $device->return_note,
            'note' => $device->note,
        ];
    }

    public function record(
        DeviceUnit $device,
        string $eventType,
        array $before = [],
        array $after = [],
        array $context = []
    ): void {
        if (! Schema::hasTable('device_unit_histories')) {
            return;
        }

        $before = $before ?: $this->snapshot($device);
        $after = $after ?: $this->snapshot($device);

        $payload = [
            'device_unit_id' => $device->id,
            'event_type' => $eventType,
            'from_status' => $before['status'] ?? null,
            'to_status' => $after['status'] ?? null,
            'from_branch_id' => $before['branch_id'] ?? null,
            'to_branch_id' => $after['branch_id'] ?? null,
            'from_saleable' => array_key_exists('saleable', $before) ? (bool) $before['saleable'] : null,
            'to_saleable' => array_key_exists('saleable', $after) ? (bool) $after['saleable'] : null,
            'from_website_published' => array_key_exists('website_published', $before) ? (bool) $before['website_published'] : null,
            'to_website_published' => array_key_exists('website_published', $after) ? (bool) $after['website_published'] : null,
            'before_data' => json_encode($before, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'after_data' => json_encode($after, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'note' => $context['note'] ?? ($after['note'] ?? $before['note'] ?? null),
            'user_id' => $context['user_id'] ?? auth()->id(),
            'event_at' => $context['event_at'] ?? now(),
            'created_at' => now(),
            'updated_at' => now(),
        ];

        $optional = [
            'reference_type' => $context['reference_type'] ?? null,
            'reference_id' => $context['reference_id'] ?? null,
            'reference_no' => $context['reference_no'] ?? null,
            'customer_id' => $context['customer_id'] ?? null,
            'supplier_id' => $context['supplier_id'] ?? null,
            'amount' => $context['amount'] ?? null,
            'currency' => $context['currency'] ?? 'BDT',
            'payment_direction' => $context['payment_direction'] ?? null,
            'payment_method' => $context['payment_method'] ?? null,
            'payment_reference' => $context['payment_reference'] ?? null,
            'metadata' => isset($context['metadata'])
                ? json_encode($context['metadata'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
                : null,
        ];

        foreach ($optional as $column => $value) {
            if (Schema::hasColumn('device_unit_histories', $column)) {
                $payload[$column] = $value;
            }
        }

        DB::table('device_unit_histories')->insert($payload);
    }
}
