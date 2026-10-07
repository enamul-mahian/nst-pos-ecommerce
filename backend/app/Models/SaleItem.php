<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaleItem extends Model
{
    protected $fillable = [
        'sale_id',
        'product_id',
        'product_variant_id',
        'branch_stock_id',
        'used_purchase_id',
        'device_unit_id',
        'product_name',
        'sku',
        'imei_1',
        'imei_2',
        'device_barcode',
        'ram',
        'storage',
        'color',
        'country_region',
        'sim_type',
        'network_carrier',
        'condition',
        'branch_id',
        'quantity',
        'purchase_price',
        'rate',
        'sale_price',
        'discount_percent',
        'discount_amount',
        'total',
        'profit_amount',
    ];

    protected $casts = [
        'sale_id' => 'integer',
        'product_id' => 'integer',
        'product_variant_id' => 'integer',
        'branch_stock_id' => 'integer',
        'used_purchase_id' => 'integer',
        'device_unit_id' => 'integer',
        'branch_id' => 'integer',
        'quantity' => 'integer',
        'purchase_price' => 'decimal:2',
        'rate' => 'decimal:2',
        'sale_price' => 'decimal:2',
        'discount_percent' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total' => 'decimal:2',
        'profit_amount' => 'decimal:2',
    ];

    public function sale()
    {
        return $this->belongsTo(Sale::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function variant()
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function branchStock()
    {
        return $this->belongsTo(BranchStock::class);
    }

    public function usedPurchase()
    {
        return $this->belongsTo(UsedPurchase::class);
    }

    /*
    |--------------------------------------------------------------------------
    | IMEI / Device Unit Relation
    |--------------------------------------------------------------------------
    | SaleController invoice relation loads: items.deviceUnit
    | So this relationship must exist on SaleItem model.
    |
    | Each IMEI sale item normally contains one device_unit_id.
    | device_units table also stores sale_item_id for reverse tracking.
    */
    public function deviceUnit()
    {
        return $this->belongsTo(DeviceUnit::class, 'device_unit_id');
    }

    public function linkedDeviceUnit()
    {
        return $this->hasOne(DeviceUnit::class, 'sale_item_id');
    }

    public function deviceUnits()
    {
        return $this->hasMany(DeviceUnit::class, 'sale_item_id');
    }
}
