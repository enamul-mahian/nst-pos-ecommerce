<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BookingPreorder extends Model
{
    protected $fillable = [
        'booking_no', 'product_id', 'product_variant_id', 'customer_id', 'branch_id', 'product_name',
        'sku', 'color', 'storage', 'ram', 'country_region', 'sim_type', 'network_carrier', 'condition', 'variant_snapshot',
        'customer_name', 'customer_phone', 'customer_email', 'product_price',
        'required_deposit', 'paid_amount', 'due_amount', 'payment_method',
        'transaction_id', 'payment_status', 'payment_submitted_at',
        'payment_verified_at', 'payment_verified_by', 'payment_rejection_reason',
        'status', 'custom_status', 'status_history', 'expected_date', 'expires_at',
        'note', 'admin_note', 'converted_sale_id', 'converted_at', 'created_by', 'updated_by',
    ];

    protected $casts = [
        'product_price' => 'decimal:2',
        'required_deposit' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'due_amount' => 'decimal:2',
        'payment_submitted_at' => 'datetime',
        'payment_verified_at' => 'datetime',
        'status_history' => 'array',
        'variant_snapshot' => 'array',
        'expected_date' => 'date',
        'expires_at' => 'date',
        'converted_at' => 'datetime',
    ];
}
