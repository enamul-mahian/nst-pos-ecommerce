<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeliveryGatewaySetting extends Model
{
    protected $fillable = [
        'name',
        'code',
        'adapter',
        'is_enabled',
        'is_default',
        'base_url',
        'credentials',
        'settings',
        'connection_status',
        'last_tested_at',
        'last_error',
    ];

    protected $hidden = [
        'credentials',
    ];

    protected $casts = [
        'is_enabled' => 'boolean',
        'is_default' => 'boolean',
        'credentials' => 'encrypted:array',
        'settings' => 'array',
        'last_tested_at' => 'datetime',
    ];

    public function shipments()
    {
        return $this->hasMany(DeliveryGatewayShipment::class, 'delivery_gateway_setting_id');
    }
}
