<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PurchaseItem extends Model
{
    protected $fillable = [
        'purchase_id',
        'supplier_id',
        'branch_id',
        'product_id',
        'product_variant_id',
        'product_name',
        'sku',
        'barcode',
        'quantity',
        'unit_cost',
        'line_total',
        'device_count',
        'note',
    ];

    protected $casts = [
        'product_variant_id' => 'integer',
        'quantity' => 'decimal:2',
        'unit_cost' => 'decimal:2',
        'line_total' => 'decimal:2',
        'device_count' => 'integer',
    ];
}