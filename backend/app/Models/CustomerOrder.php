<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class CustomerOrder extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'order_no',
        'customer_id',
        'user_id',
        'branch_id',
        'status',
        'custom_status',
        'payment_method',
        'shipping_method',
        'payment_status',
        'transaction_id',
        'paid_amount',
        'subtotal',
        'discount_amount',
        'delivery_charge',
        'total_amount',
        'customer_name',
        'customer_phone',
        'customer_email',
        'delivery_address',
        'delivery_city',
        'delivery_district',
        'delivery_postal_code',
        'current_location',
        'latitude',
        'longitude',
        'promo_code',
        'customer_note',
        'source',
        'status_history',
        'payment_reviewed_by',
        'payment_reviewed_at',
        'payment_rejection_reason',
        'placed_at',
        'sale_id', 'invoice_no', 'assigned_staff_id', 'delivery_status', 'reserved_at', 'authorized_at', 'delivered_at', 'completed_at', 'cancelled_at', 'refund_amount',
    ];

    protected $casts = [
        'paid_amount' => 'decimal:2',
        'subtotal' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'delivery_charge' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'status_history' => 'array',
        'payment_reviewed_at' => 'datetime',
        'placed_at' => 'datetime',
        'reserved_at' => 'datetime', 'authorized_at' => 'datetime', 'delivered_at' => 'datetime', 'completed_at' => 'datetime', 'cancelled_at' => 'datetime', 'refund_amount' => 'decimal:2',
    ];

    public function items()
    {
        return $this->hasMany(CustomerOrderItem::class);
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function sale() { return $this->belongsTo(Sale::class); }

    public function assignedStaff() { return $this->belongsTo(User::class, 'assigned_staff_id'); }


    public function delivery()
    {
        return $this->hasOne(OrderDelivery::class);
    }

    public function timelineEvents()
    {
        return $this->hasMany(CustomerOrderTimelineEvent::class);
    }

    public function paymentTransactions()
    {
        return $this->hasMany(PaymentTransaction::class);
    }

    public function paymentReviewer()
    {
        return $this->belongsTo(User::class, 'payment_reviewed_by');
    }
}
