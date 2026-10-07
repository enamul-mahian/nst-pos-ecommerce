<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CommunicationLog extends Model
{
    protected $fillable = [
        'channel', 'purpose', 'recipient_name', 'recipient_phone', 'recipient_email',
        'subject', 'message', 'status', 'error_message', 'related_type', 'related_id',
        'invoice_no', 'payload', 'sent_at', 'sent_by',
    ];

    protected $casts = [
        'payload' => 'array',
        'sent_at' => 'datetime',
    ];
}
