<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StockMovement extends Model
{
    use HasFactory;

    protected $fillable = [
        'movement_no',
        'branch_id',
        'product_id',
        'product_variant_id',
        'stock_transfer_request_id',
        'user_id',
        'type',
        'quantity_change',
        'quantity_before',
        'quantity_after',
        'reference_type',
        'reference_id',
        'note',
        'movement_at',
    ];

    protected $casts = [
        'branch_id' => 'integer',
        'product_id' => 'integer',
        'product_variant_id' => 'integer',
        'stock_transfer_request_id' => 'integer',
        'user_id' => 'integer',
        'quantity_change' => 'integer',
        'quantity_before' => 'integer',
        'quantity_after' => 'integer',
        'reference_id' => 'integer',
        'movement_at' => 'datetime',
    ];

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function variant()
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function transferRequest()
    {
        return $this->belongsTo(StockTransferRequest::class, 'stock_transfer_request_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}