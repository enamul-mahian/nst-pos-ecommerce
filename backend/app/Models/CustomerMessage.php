<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CustomerMessage extends Model
{
    protected $fillable = [
        'ticket_no', 'customer_id', 'sale_id', 'invoice_no', 'name', 'phone', 'email',
        'subject', 'category', 'message', 'admin_reply', 'status', 'assigned_to',
        'replied_by', 'replied_at', 'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
        'replied_at' => 'datetime',
    ];

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }
}
