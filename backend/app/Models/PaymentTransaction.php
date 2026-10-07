<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentTransaction extends Model
{
    protected $fillable = [
        'transaction_no', 'provider', 'customer_order_id', 'sale_id', 'user_id',
        'provider_transaction_id', 'session_key', 'amount', 'currency', 'status',
        'risk_level', 'card_type', 'bank_transaction_id', 'request_payload',
        'response_payload', 'validation_payload', 'paid_at', 'failed_at',
        'refund_amount', 'refund_payload', 'refunded_at', 'last_verified_at',
    ];

    protected $casts = [
        'customer_order_id' => 'integer', 'sale_id' => 'integer', 'user_id' => 'integer',
        'amount' => 'decimal:2', 'risk_level' => 'integer', 'request_payload' => 'array',
        'response_payload' => 'array', 'validation_payload' => 'array',
        'paid_at' => 'datetime', 'failed_at' => 'datetime',
        'refund_amount' => 'decimal:2', 'refund_payload' => 'array',
        'refunded_at' => 'datetime', 'last_verified_at' => 'datetime',
    ];

    public function order() { return $this->belongsTo(CustomerOrder::class, 'customer_order_id'); }
    public function sale() { return $this->belongsTo(Sale::class); }
    public function user() { return $this->belongsTo(User::class); }
}
