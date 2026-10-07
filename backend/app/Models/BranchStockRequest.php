<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BranchStockRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'branch_id',
        'product_id',
        'requested_by',
        'responded_by',
        'requested_quantity',
        'approved_quantity',
        'status',
        'note',
        'admin_note',
        'responded_at',
    ];

    protected $casts = [
        'branch_id' => 'integer',
        'product_id' => 'integer',
        'requested_by' => 'integer',
        'responded_by' => 'integer',
        'requested_quantity' => 'integer',
        'approved_quantity' => 'integer',
        'responded_at' => 'datetime',
    ];

    public function branch()
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }

    public function product()
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function requester()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function responder()
    {
        return $this->belongsTo(User::class, 'responded_by');
    }
}