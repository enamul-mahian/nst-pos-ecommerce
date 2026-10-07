<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TrackingIntegration extends Model
{
    protected $fillable = [
        'platform_name', 'platform_key', 'tracking_id', 'header_script', 'body_script',
        'footer_script', 'events', 'apply_to', 'is_active', 'is_custom', 'sort_order',
        'created_by', 'updated_by',
    ];

    protected $casts = [
        'events' => 'array',
        'apply_to' => 'array',
        'is_active' => 'boolean',
        'is_custom' => 'boolean',
    ];
}
