<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Sale extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'invoice_no',
        'public_token',
        'branch_id',
        'branch_invoice_profile_id',
        'invoice_profile_snapshot',
        'customer_id',
        'supplier_id',
        'used_purchase_id',
        'customer_name',
        'customer_phone',
        'customer_email',
        'subtotal',
        'discount',
        'invoice_discount_percent',
        'invoice_discount_amount',
        'coupon_code',
        'coupon_discount',
        'total',
        'previous_due',
        'delivery_charge',
        'final_amount',
        'amount_in_words',
        'paid_amount',
        'due_amount',
        'cash_back_amount',
        'profit_amount',
        'payment_method',
        'payment_status',
        'status',
        'sold_by',
        'payment_received_by',
        'home_delivery',
        'send_sms',
        'send_email',
        'email_sent_at',
        'sms_sent_at',
        'note',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'utm_term',
        'cancel_reason',
        'return_reason',
        'source', 'customer_order_id', 'delivery_status',
        'cancelled_at',
        'returned_at',
    ];

    protected $casts = [
        'subtotal' => 'decimal:2',
        'discount' => 'decimal:2',
        'invoice_discount_percent' => 'decimal:2',
        'invoice_discount_amount' => 'decimal:2',
        'coupon_discount' => 'decimal:2',
        'total' => 'decimal:2',
        'previous_due' => 'decimal:2',
        'delivery_charge' => 'decimal:2',
        'final_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'due_amount' => 'decimal:2',
        'cash_back_amount' => 'decimal:2',
        'profit_amount' => 'decimal:2',
        'home_delivery' => 'boolean',
        'send_sms' => 'boolean',
        'send_email' => 'boolean',
        'email_sent_at' => 'datetime',
        'sms_sent_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'returned_at' => 'datetime',
        'invoice_profile_snapshot' => 'array',
    ];

    public function customerOrder() { return $this->belongsTo(CustomerOrder::class); }

    public function items()
    {
        return $this->hasMany(SaleItem::class);
    }

    public function payments()
    {
        return $this->hasMany(SalePayment::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function usedPurchase()
    {
        return $this->belongsTo(UsedPurchase::class);
    }

    public function soldBy()
    {
        return $this->belongsTo(User::class, 'sold_by');
    }

    public function paymentReceiver()
    {
        return $this->belongsTo(User::class, 'payment_received_by');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }
}
