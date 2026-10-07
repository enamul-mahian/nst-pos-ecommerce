<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BranchInvoiceProfile extends Model
{
    protected $guarded = [];

    protected $casts = [
        'use_custom_profile' => 'boolean',
        'show_qr' => 'boolean',
        'show_barcode' => 'boolean',
        'auto_print' => 'boolean',
    ];

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }
}
