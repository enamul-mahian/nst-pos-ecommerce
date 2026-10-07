<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ProductDraft extends Model
{
    protected $fillable = [
        'user_id',
        'product_id',
        'draft_key',
        'current_step',
        'payload',
        'status',
        'completed_at',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'product_id' => 'integer',
        'current_step' => 'integer',
        'payload' => 'array',
        'completed_at' => 'datetime',
    ];
}
