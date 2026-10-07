<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OrderDelivery extends Model
{
    protected $fillable = [
        'customer_order_id', 'sale_id', 'status', 'courier_name', 'tracking_number',
        'driver_name', 'driver_phone', 'delivery_address', 'scheduled_at', 'dispatched_at',
        'delivered_at', 'received_by', 'proof_path', 'note', 'updated_by',
    ];

    protected $casts = [
        'customer_order_id' => 'integer', 'sale_id' => 'integer', 'updated_by' => 'integer',
        'scheduled_at' => 'datetime', 'dispatched_at' => 'datetime', 'delivered_at' => 'datetime',
    ];

    public function order() { return $this->belongsTo(CustomerOrder::class, 'customer_order_id'); }
    public function sale() { return $this->belongsTo(Sale::class); }
    public function updatedBy() { return $this->belongsTo(User::class, 'updated_by'); }
}
