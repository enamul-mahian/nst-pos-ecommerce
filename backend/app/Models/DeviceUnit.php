<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class DeviceUnit extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'purchase_id',
        'used_purchase_id',
        'purchase_item_id',
        'supplier_id',
        'branch_id',
        'product_id',
        'product_variant_id',
        'product_name',
        'model_number',
        'sku',
        'color_name',
        'region',
        'sim_network',
        'country_region',
        'sim_type',
        'network_carrier',
        'condition',
        'ram',
        'storage',
        'battery_health',
        'imei_1',
        'imei_2',
        'barcode',
        'imei_1_barcode',
        'imei_2_barcode',
        'barcode_source',
        'is_barcode_printed',
        'barcode_printed_at',
        'purchase_cost',
        'selling_price',
        'market_price',
        'status',
        'saleable',
        'website_published',
        'activation_status',
        'service_status',
        'latest_service_job_id',
        'warranty_type',
        'warranty_period_months',
        'warranty_start_date',
        'warranty_end_date',
        'warranty_terms',
        'warranty_note',
        'sale_id',
        'sale_item_id',
        'sold_at',
        'returned_at',
        'return_reason',
        'return_note',
        'note',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'used_purchase_id' => 'integer',
        'is_barcode_printed' => 'boolean',
        'saleable' => 'boolean',
        'website_published' => 'boolean',
        'barcode_printed_at' => 'datetime',
        'purchase_cost' => 'decimal:2',
        'selling_price' => 'decimal:2',
        'market_price' => 'decimal:2',
        'battery_health' => 'integer',
        'sold_at' => 'datetime',
        'returned_at' => 'datetime',
        'warranty_start_date' => 'date',
        'warranty_end_date' => 'date',
    ];

    protected static function booted(): void
    {
        static::creating(function (DeviceUnit $device) {
            if (strtolower((string) $device->status) === 'awaiting_inspection') {
                $device->saleable = false;
                $device->website_published = false;
            }
        });

        static::updating(function (DeviceUnit $device) {
            $originalStatus = strtolower((string) $device->getOriginal('status'));
            $nextStatus = strtolower((string) $device->status);
            $reason = strtolower(trim((string) $device->return_reason));

            // Existing ExchangeController historically puts a returned sold unit directly
            // back to "available". Preserve the transaction, but force inspection first.
            if (
                $originalStatus === 'sold'
                && in_array($nextStatus, ['available', 'ready_for_sale'], true)
                && str_starts_with($reason, 'exchange:')
            ) {
                $device->status = 'awaiting_inspection';
                $device->saleable = false;
                $device->website_published = false;
            }

            if (in_array(strtolower((string) $device->status), [
                'sold', 'awaiting_inspection', 'inactive', 'damaged',
                'lost', 'missing', 'supplier_return',
            ], true)) {
                $device->saleable = false;
                $device->website_published = false;
            }

            if (! (bool) $device->saleable) {
                $device->website_published = false;
            }
        });

        static::created(function (DeviceUnit $device) {
            $event = $device->used_purchase_id
                ? 'used_purchase_received'
                : ($device->purchase_id ? 'purchase_stock_in' : 'created');

            $device->writeLifecycleHistory($event, [], $device->historySnapshot());
        });

        static::updated(function (DeviceUnit $device) {
            $tracked = [
                'status', 'branch_id', 'saleable', 'website_published', 'note',
                'service_status', 'sale_id', 'sale_item_id', 'sold_at', 'returned_at',
                'return_reason', 'return_note', 'condition', 'battery_health', 'selling_price',
            ];

            $changes = array_intersect_key($device->getChanges(), array_flip($tracked));

            if (! $changes) {
                return;
            }

            $before = [];
            $after = [];

            foreach (array_keys($changes) as $key) {
                $before[$key] = $device->getOriginal($key);
                $after[$key] = $device->{$key};
            }

            $device->writeLifecycleHistory(
                $device->inferLifecycleEvent($before, $after),
                $before,
                $after
            );
        });

        static::deleted(function (DeviceUnit $device) {
            $device->writeLifecycleHistory('deleted', $device->historySnapshot(), []);
        });
    }

    private function inferLifecycleEvent(array $before, array $after): string
    {
        $fromStatus = strtolower((string) ($before['status'] ?? $this->getOriginal('status') ?? ''));
        $toStatus = strtolower((string) ($after['status'] ?? $this->status ?? ''));

        if ($toStatus === 'sold' && $fromStatus !== 'sold') {
            return 'sale';
        }

        if ($fromStatus === 'sold' && $toStatus === 'awaiting_inspection') {
            $reason = strtolower((string) ($after['return_reason'] ?? $this->return_reason ?? ''));
            return str_starts_with($reason, 'cash exchange:')
                ? 'cash_exchange_received'
                : (str_starts_with($reason, 'exchange:') ? 'exchange_return_received' : 'return_received');
        }

        if ($toStatus === 'ready_for_sale' && $fromStatus !== 'ready_for_sale') {
            return 'ready_for_sale';
        }

        if (array_key_exists('branch_id', $after) && ($before['branch_id'] ?? null) != ($after['branch_id'] ?? null)) {
            return 'branch_transfer';
        }

        if (array_key_exists('service_status', $after)) {
            return 'service_status';
        }

        if (array_key_exists('website_published', $after)) {
            return (bool) $after['website_published'] ? 'website_published' : 'website_unpublished';
        }

        return 'updated';
    }

    private function historySnapshot(): array
    {
        return [
            'status' => $this->status,
            'branch_id' => $this->branch_id,
            'saleable' => $this->saleable,
            'website_published' => $this->website_published,
            'condition' => $this->condition,
            'battery_health' => $this->battery_health,
            'purchase_id' => $this->purchase_id,
            'used_purchase_id' => $this->used_purchase_id,
            'supplier_id' => $this->supplier_id,
            'product_id' => $this->product_id,
            'product_variant_id' => $this->product_variant_id,
            'product_name' => $this->product_name,
            'sku' => $this->sku,
            'barcode' => $this->barcode,
            'imei_1' => $this->imei_1,
            'imei_2' => $this->imei_2,
            'purchase_cost' => $this->purchase_cost,
            'selling_price' => $this->selling_price,
            'sale_id' => $this->sale_id,
            'sale_item_id' => $this->sale_item_id,
            'sold_at' => optional($this->sold_at)->toDateTimeString(),
            'returned_at' => optional($this->returned_at)->toDateTimeString(),
            'return_reason' => $this->return_reason,
            'return_note' => $this->return_note,
            'note' => $this->note,
            'service_status' => $this->service_status,
        ];
    }

    private function writeLifecycleHistory(string $eventType, array $before, array $after): void
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('device_unit_histories')) {
            return;
        }

        $payload = [
            'device_unit_id' => $this->id,
            'event_type' => $eventType,
            'from_status' => $before['status'] ?? null,
            'to_status' => $after['status'] ?? null,
            'from_branch_id' => $before['branch_id'] ?? null,
            'to_branch_id' => $after['branch_id'] ?? null,
            'from_saleable' => array_key_exists('saleable', $before) ? (bool) $before['saleable'] : null,
            'to_saleable' => array_key_exists('saleable', $after) ? (bool) $after['saleable'] : null,
            'from_website_published' => array_key_exists('website_published', $before) ? (bool) $before['website_published'] : null,
            'to_website_published' => array_key_exists('website_published', $after) ? (bool) $after['website_published'] : null,
            'before_data' => $before ? json_encode($before, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            'after_data' => $after ? json_encode($after, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            'note' => $after['note'] ?? ($before['note'] ?? null),
            'user_id' => $this->updated_by ?: $this->created_by ?: auth()->id(),
            'event_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ];

        if (\Illuminate\Support\Facades\Schema::hasColumn('device_unit_histories', 'metadata')) {
            $payload['metadata'] = json_encode([
                'sale_id' => $after['sale_id'] ?? $before['sale_id'] ?? null,
                'sale_item_id' => $after['sale_item_id'] ?? $before['sale_item_id'] ?? null,
                'purchase_id' => $after['purchase_id'] ?? $before['purchase_id'] ?? null,
                'used_purchase_id' => $after['used_purchase_id'] ?? $before['used_purchase_id'] ?? null,
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }

        \Illuminate\Support\Facades\DB::table('device_unit_histories')->insert($payload);
    }

    public function histories()
    {
        return $this->hasMany(DeviceUnitHistory::class)
            ->orderByDesc('event_at')
            ->orderByDesc('id');
    }

    public function sale()
    {
        return $this->belongsTo(Sale::class);
    }

    public function saleItem()
    {
        return $this->belongsTo(SaleItem::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function variant()
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function usedPurchase()
    {
        return $this->belongsTo(UsedPurchase::class, 'used_purchase_id');
    }
}
