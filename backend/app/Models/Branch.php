<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Branch extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'name',
        'code',
        'phone',
        'email',
        'address',
        'manager_id',
        'status',
    ];

    public function invoiceProfile()
    {
        return $this->hasOne(BranchInvoiceProfile::class);
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_id');
    }

    public function users()
    {
        return $this->hasMany(User::class, 'branch_id');
    }

    public function stocks()
    {
        return $this->hasMany(BranchStock::class, 'branch_id');
    }

    public function stockRequests()
    {
        return $this->hasMany(BranchStockRequest::class, 'branch_id');
    }
}