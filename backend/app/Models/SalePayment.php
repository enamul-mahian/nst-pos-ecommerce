<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SalePayment extends Model
{
    protected $fillable = [
        'sale_id',
        'payment_method',
        'provider_name',
        'transaction_id',
        'amount',
        'received_by',
        'note',
        'emi_bank_name',
        'emi_months',
        'emi_reference',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'emi_months' => 'integer',
    ];

    public function sale()
    {
        return $this->belongsTo(Sale::class);
    }

    public function receiver()
    {
        return $this->belongsTo(User::class, 'received_by');
    }
}
