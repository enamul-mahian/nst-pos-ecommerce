<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UserAccessControl extends Model
{
    protected $fillable = [
        'user_id',
        'dashboard_permissions',
        'sidebar_permissions',
        'column_permissions',
        'branch_ids',
        'financial_permissions',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'dashboard_permissions' => 'array',
        'sidebar_permissions' => 'array',
        'column_permissions' => 'array',
        'branch_ids' => 'array',
        'financial_permissions' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
