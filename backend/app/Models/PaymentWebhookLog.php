<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentWebhookLog extends Model
{
    protected $fillable = [
        'provider',
        'payment_transaction_id',
        'provider_transaction_id',
        'event_key',
        'status',
        'payload',
        'verification_payload',
        'response_code',
        'message',
        'received_at',
        'processed_at',
    ];

    protected $casts = [
        'payment_transaction_id' => 'integer',
        'payload' => 'array',
        'verification_payload' => 'array',
        'response_code' => 'integer',
        'received_at' => 'datetime',
        'processed_at' => 'datetime',
    ];

    public function paymentTransaction()
    {
        return $this->belongsTo(PaymentTransaction::class);
    }
}
