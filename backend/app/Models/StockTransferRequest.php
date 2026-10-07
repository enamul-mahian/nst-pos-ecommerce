<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class StockTransferRequest extends Model
{
    use HasFactory;

    protected $fillable = [
        'request_no',
        'from_branch_id',
        'to_branch_id',
        'requested_by',
        'approved_by',
        'status',
        'request_note',
        'admin_note',
        'requested_at',
        'approved_at',
        'assigned_at',
        'received_at',
        'cancelled_at',
        'dispatched_by',
        'received_by',
        'dispatch_note',
        'receive_note',
    ];

    protected $casts = [
        'from_branch_id' => 'integer',
        'to_branch_id' => 'integer',
        'requested_by' => 'integer',
        'approved_by' => 'integer',
        'requested_at' => 'datetime',
        'approved_at' => 'datetime',
        'assigned_at' => 'datetime',
        'received_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'dispatched_by' => 'integer',
        'received_by' => 'integer',
    ];

    public function fromBranch()
    {
        return $this->belongsTo(Branch::class, 'from_branch_id');
    }

    public function toBranch()
    {
        return $this->belongsTo(Branch::class, 'to_branch_id');
    }

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function items()
    {
        return $this->hasMany(StockTransferRequestItem::class);
    }

    public function stockMovements()
    {
        return $this->hasMany(StockMovement::class);
    }
}