<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerPayment extends Model
{
    protected $fillable = [
        'customer_id',
        'payment_method',
        'provider_name',
        'transaction_id',
        'amount',
        'previous_balance',
        'new_balance',
        'extra_amount',
        'is_applied_to_sales',
        'applied_at',
        'note',
        'collected_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'previous_balance' => 'decimal:2',
        'new_balance' => 'decimal:2',
        'extra_amount' => 'decimal:2',
        'is_applied_to_sales' => 'boolean',
        'applied_at' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function collector()
    {
        return $this->belongsTo(User::class, 'collected_by');
    }
}