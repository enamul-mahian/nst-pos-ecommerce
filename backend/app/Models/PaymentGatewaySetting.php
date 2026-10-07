<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PaymentGatewaySetting extends Model
{
    protected $fillable = [
        'provider',
        'display_name',
        'enabled',
        'mode',
        'sort_order',
        'refunds_enabled',
        'config',
        'credentials',
        'updated_by',
    ];

    protected $casts = [
        'enabled' => 'boolean',
        'refunds_enabled' => 'boolean',
        'sort_order' => 'integer',
        'config' => 'array',
        'updated_by' => 'integer',
    ];

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
