<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DeliveryGatewayShipment extends Model
{
    protected $fillable = [
        'delivery_gateway_setting_id',
        'customer_order_id',
        'sale_id',
        'consignment_id',
        'tracking_code',
        'provider_status',
        'status',
        'cod_amount',
        'delivery_fee',
        'request_payload',
        'response_payload',
        'last_error',
        'last_synced_at',
        'created_by',
    ];

    protected $casts = [
        'delivery_gateway_setting_id' => 'integer',
        'customer_order_id' => 'integer',
        'sale_id' => 'integer',
        'cod_amount' => 'decimal:2',
        'delivery_fee' => 'decimal:2',
        'request_payload' => 'array',
        'response_payload' => 'array',
        'last_synced_at' => 'datetime',
        'created_by' => 'integer',
    ];

    public function provider()
    {
        return $this->belongsTo(DeliveryGatewaySetting::class, 'delivery_gateway_setting_id');
    }

    public function order()
    {
        return $this->belongsTo(CustomerOrder::class, 'customer_order_id');
    }

    public function sale()
    {
        return $this->belongsTo(Sale::class);
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
