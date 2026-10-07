<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeviceUnitHistory extends Model
{
    protected $guarded = [];

    protected $casts = [
        'before_data' => 'array',
        'after_data' => 'array',
        'metadata' => 'array',
        'from_saleable' => 'boolean',
        'to_saleable' => 'boolean',
        'from_website_published' => 'boolean',
        'to_website_published' => 'boolean',
        'amount' => 'decimal:2',
        'event_at' => 'datetime',
    ];

    public function deviceUnit()
    {
        return $this->belongsTo(DeviceUnit::class);
    }
}
