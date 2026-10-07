<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class CustomerOrderItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'customer_order_id',
        'product_id',
        'variant_id',
        'sku',
        'product_name',
        'variant_name',
        'color',
        'storage',
        'ram',
        'country_region',
        'sim_type',
        'network_carrier',
        'condition',
        'branch_id',
        'quantity',
        'unit_price',
        'line_total',
        'image_url',
        'snapshot',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'unit_price' => 'decimal:2',
        'line_total' => 'decimal:2',
        'snapshot' => 'array',
    ];

    public function order()
    {
        return $this->belongsTo(CustomerOrder::class, 'customer_order_id');
    }
}
