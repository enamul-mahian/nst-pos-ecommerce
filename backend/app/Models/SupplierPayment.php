<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class SupplierPayment extends Model
{
    protected $fillable = [
        'supplier_id',
        'payment_method',
        'provider_name',
        'transaction_id',
        'payment_slip_path',
        'amount',
        'previous_balance',
        'new_balance',
        'extra_amount',
        'is_applied_to_purchases',
        'applied_at',
        'note',
        'paid_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'previous_balance' => 'decimal:2',
        'new_balance' => 'decimal:2',
        'extra_amount' => 'decimal:2',
        'is_applied_to_purchases' => 'boolean',
        'applied_at' => 'datetime',
    ];

    protected $appends = [
        'payment_slip_url',
    ];

    public function getPaymentSlipUrlAttribute()
    {
        if (!$this->payment_slip_path) {
            return null;
        }

        return Storage::disk('public')->url($this->payment_slip_path);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function payer()
    {
        return $this->belongsTo(User::class, 'paid_by');
    }
}