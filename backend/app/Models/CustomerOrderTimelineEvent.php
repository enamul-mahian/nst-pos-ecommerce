<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerOrderTimelineEvent extends Model
{
    protected $fillable = [
        'customer_order_id', 'event_type', 'status', 'title', 'description', 'metadata',
        'customer_visible', 'created_by', 'event_at',
    ];

    protected $casts = [
        'customer_order_id' => 'integer', 'metadata' => 'array', 'customer_visible' => 'boolean',
        'created_by' => 'integer', 'event_at' => 'datetime',
    ];

    public function order() { return $this->belongsTo(CustomerOrder::class, 'customer_order_id'); }
    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
}
