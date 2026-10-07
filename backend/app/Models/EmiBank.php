<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class EmiBank extends Model
{
    protected $fillable = [
        'bank_name', 'bank_short_name', 'minimum_amount', 'tenure_charges',
        'note', 'recommendation_text', 'processing_fee', 'is_recommended', 'is_active', 'sort_order', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'minimum_amount' => 'decimal:2',
        'tenure_charges' => 'array',
        'is_active' => 'boolean',
        'is_recommended' => 'boolean',
        'processing_fee' => 'decimal:2',
    ];
}
