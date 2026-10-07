<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StockTransferRequestItem extends Model
{
    use HasFactory;

    protected $fillable = [
        'stock_transfer_request_id',
        'product_id',
        'product_variant_id',
        'requested_quantity',
        'approved_quantity',
        'assigned_quantity',
        'received_quantity',
        'source_quantity_snapshot',
        'in_transit_quantity',
        'note',
    ];

    protected $casts = [
        'stock_transfer_request_id' => 'integer',
        'product_id' => 'integer',
        'product_variant_id' => 'integer',
        'requested_quantity' => 'integer',
        'approved_quantity' => 'integer',
        'assigned_quantity' => 'integer',
        'received_quantity' => 'integer',
        'source_quantity_snapshot' => 'integer',
        'in_transit_quantity' => 'integer',
    ];

    public function transferRequest()
    {
        return $this->belongsTo(StockTransferRequest::class, 'stock_transfer_request_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function variant()
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }
}