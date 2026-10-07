<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, HasRoles;

    protected $fillable = [
        'username',
        'branch_id',
        'name',
        'email',
        'phone',
        'password',
        'status',
        'profile_type',
        'customer_id',
        'supplier_id',
        'must_change_password',
        'temporary_password',
        'address',
        'profile_photo',
        'two_factor_enabled',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'password_reset_by',
        'password_reset_at',
        'website_registered_at',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'temporary_password',
        'two_factor_secret',
        'two_factor_recovery_codes',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'must_change_password' => 'boolean',
            'two_factor_enabled' => 'boolean',
            'two_factor_secret' => 'encrypted',
            'two_factor_recovery_codes' => 'encrypted:array',
            'password_reset_at' => 'datetime',
            'website_registered_at' => 'datetime',
        ];
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }

    public function managedBranch()
    {
        return $this->hasOne(Branch::class, 'manager_id');
    }

    public function customerProfile()
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function supplierProfile()
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function passwordResetBy()
    {
        return $this->belongsTo(User::class, 'password_reset_by');
    }
}
