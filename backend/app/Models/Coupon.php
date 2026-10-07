<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Coupon extends Model
{
    protected $fillable = [
        'code', 'title', 'discount_type', 'discount_value', 'minimum_amount',
        'usage_limit', 'used_count', 'starts_at', 'ends_at', 'applies_to',
        'conditions', 'is_active', 'note', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'discount_value' => 'decimal:2',
        'minimum_amount' => 'decimal:2',
        'conditions' => 'array',
        'is_active' => 'boolean',
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
    ];
}
