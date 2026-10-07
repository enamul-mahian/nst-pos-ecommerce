<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SaleExchange extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'exchange_no',
        'sale_id',
        'branch_id',
        'customer_id',
        'returned_value',
        'replacement_value',
        'difference_amount',
        'paid_amount',
        'due_amount',
        'refund_amount',
        'payment_method',
        'exchange_mode',
        'customer_payout_amount',
        'payout_adjustment_amount',
        'payout_method',
        'payout_reference',
        'payout_note',
        'status',
        'reason',
        'note',
        'processed_by',
        'completed_at',
    ];

    protected $casts = [
        'sale_id' => 'integer',
        'branch_id' => 'integer',
        'customer_id' => 'integer',
        'returned_value' => 'decimal:2',
        'replacement_value' => 'decimal:2',
        'difference_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'due_amount' => 'decimal:2',
        'refund_amount' => 'decimal:2',
        'customer_payout_amount' => 'decimal:2',
        'payout_adjustment_amount' => 'decimal:2',
        'processed_by' => 'integer',
        'completed_at' => 'datetime',
    ];

    public function sale() { return $this->belongsTo(Sale::class); }
    public function branch() { return $this->belongsTo(Branch::class); }
    public function customer() { return $this->belongsTo(Customer::class); }
    public function processor() { return $this->belongsTo(User::class, 'processed_by'); }
    public function items() { return $this->hasMany(SaleExchangeItem::class); }
    public function payouts() { return $this->hasMany(SaleExchangePayout::class); }
}
