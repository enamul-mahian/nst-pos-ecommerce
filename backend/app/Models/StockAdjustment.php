<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class StockAdjustment extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'adjustment_no', 'branch_id', 'product_id', 'product_variant_id', 'device_unit_id',
        'direction', 'quantity', 'quantity_before', 'quantity_after', 'reason', 'note', 'metadata', 'status',
        'created_by', 'posted_by', 'reversed_by', 'posted_at', 'reversed_at',
    ];

    protected $casts = [
        'branch_id' => 'integer', 'product_id' => 'integer', 'product_variant_id' => 'integer',
        'device_unit_id' => 'integer', 'quantity' => 'integer', 'quantity_before' => 'integer',
        'quantity_after' => 'integer', 'metadata' => 'array', 'created_by' => 'integer', 'posted_by' => 'integer',
        'reversed_by' => 'integer', 'posted_at' => 'datetime', 'reversed_at' => 'datetime',
    ];

    public function branch() { return $this->belongsTo(Branch::class); }
    public function product() { return $this->belongsTo(Product::class); }
    public function variant() { return $this->belongsTo(ProductVariant::class, 'product_variant_id'); }
    public function deviceUnit() { return $this->belongsTo(DeviceUnit::class); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function poster() { return $this->belongsTo(User::class, 'posted_by'); }
    public function reverser() { return $this->belongsTo(User::class, 'reversed_by'); }
}
