<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ProductVariant extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'branch_id',
        'supplier_id',
        'variant_name',
        'model_number',
        'condition',
        'sku',
        'barcode_mode',
        'barcode',
        'imei_1',
        'imei_2',
        'purchase_price',
        'sale_price',
        'market_price',
        'regular_price',
        'discount_price',
        'stock_quantity',
        'opening_stock_quantity',
        'imei_tracking',
        'low_stock_alert',
        'warranty',
        'short_note',
        'status',
        'device_status',
        'color_name',
        'region',
        'sim_network',
        'country_region',
        'sim_type',
        'network_carrier',
        'ram',
        'storage',
        'product_type',
        'variant_type',
        'attributes',
        'attribute_values',
        'color',
        'region_variant',
        'ram_storage',
        'reserved_quantity',
        'warranty_period_months',
        'warranty_terms',
        'image',
        'battery_health',
        'minimum_booking_type',
        'minimum_booking_value',
        'emi_available',
        'allow_preorder',
        'stock_state',
        'serial_number',
        'activation_status',
        'box_included',
        'physical_condition',
        'condition_grade',
        'official_warranty',
        'shop_warranty',
        'warranty_duration',
        'warranty_notes',
        'service_status',
        'supplier_reference',
        'purchase_reference',
        'entry_done_by',
        'barcode_printed_at',
    ];

    protected $casts = [
        'branch_id' => 'integer',
        'supplier_id' => 'integer',
        'purchase_price' => 'decimal:2',
        'sale_price' => 'decimal:2',
        'market_price' => 'decimal:2',
        'regular_price' => 'decimal:2',
        'discount_price' => 'decimal:2',
        'stock_quantity' => 'integer',
        'opening_stock_quantity' => 'integer',
        'imei_tracking' => 'boolean',
        'low_stock_alert' => 'integer',
        'battery_health' => 'integer',
        'attributes' => 'array',
        'attribute_values' => 'array',
        'reserved_quantity' => 'integer',
        'warranty_period_months' => 'integer',
        'minimum_booking_value' => 'decimal:2',
        'emi_available' => 'boolean',
        'allow_preorder' => 'boolean',
        'box_included' => 'boolean',
        'entry_done_by' => 'integer',
        'barcode_printed_at' => 'datetime',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function getDisplayNameAttribute()
    {
        return $this->variant_name
            ?: collect([
                $this->color_name ?: $this->color,
                $this->region ?: $this->region_variant,
                $this->ram ?: $this->ram_storage,
                $this->storage,
                $this->sim_network,
            ])->filter()->implode(' / ');
    }

    public function images()
    {
        return $this->hasMany(ProductImage::class, 'product_variant_id');
    }

    public function deviceUnits()
    {
        return $this->hasMany(DeviceUnit::class, 'product_variant_id');
    }
}
