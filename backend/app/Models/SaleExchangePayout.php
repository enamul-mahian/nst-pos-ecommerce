<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaleExchangePayout extends Model
{
    protected $fillable = [
        'sale_exchange_id',
        'amount',
        'currency',
        'payment_method',
        'provider_name',
        'transaction_id',
        'reference_no',
        'paid_by',
        'paid_at',
        'note',
        'metadata',
    ];

    protected $casts = [
        'sale_exchange_id' => 'integer',
        'amount' => 'decimal:2',
        'paid_by' => 'integer',
        'paid_at' => 'datetime',
        'metadata' => 'array',
    ];

    public function exchange()
    {
        return $this->belongsTo(SaleExchange::class, 'sale_exchange_id');
    }

    public function payer()
    {
        return $this->belongsTo(User::class, 'paid_by');
    }
}
