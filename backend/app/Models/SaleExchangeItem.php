<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaleExchangeItem extends Model
{
    protected $fillable = [
        'sale_exchange_id', 'item_type', 'sale_item_id', 'product_id', 'product_variant_id',
        'device_unit_id', 'product_name', 'sku', 'imei_1', 'barcode', 'quantity',
        'unit_price', 'line_total', 'condition_note',
    ];

    protected $casts = [
        'sale_exchange_id' => 'integer', 'sale_item_id' => 'integer', 'product_id' => 'integer',
        'product_variant_id' => 'integer', 'device_unit_id' => 'integer', 'quantity' => 'integer',
        'unit_price' => 'decimal:2', 'line_total' => 'decimal:2',
    ];

    public function exchange() { return $this->belongsTo(SaleExchange::class, 'sale_exchange_id'); }
    public function saleItem() { return $this->belongsTo(SaleItem::class); }
    public function product() { return $this->belongsTo(Product::class); }
    public function variant() { return $this->belongsTo(ProductVariant::class, 'product_variant_id'); }
    public function deviceUnit() { return $this->belongsTo(DeviceUnit::class); }
}
