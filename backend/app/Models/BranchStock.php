<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BranchStock extends Model
{
    use HasFactory;

    protected $fillable = [
        'branch_id',
        'product_id',
        'product_variant_id',
        'quantity',
        'reserved_quantity',
        'low_stock_alert',
        'alert_quantity',
        'shelf_location',
        'status',
        'note',
        'last_counted_at',
        'last_counted_by',
        'last_reconciled_at',
        'last_reconciled_by',
    ];

    protected $casts = [
        'branch_id' => 'integer',
        'product_id' => 'integer',
        'product_variant_id' => 'integer',
        'quantity' => 'integer',
        'reserved_quantity' => 'integer',
        'low_stock_alert' => 'integer',
        'alert_quantity' => 'integer',
        'last_counted_at' => 'datetime',
        'last_counted_by' => 'integer',
        'last_reconciled_at' => 'datetime',
        'last_reconciled_by' => 'integer',
    ];

    public function branch()
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function variant()
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }
}
