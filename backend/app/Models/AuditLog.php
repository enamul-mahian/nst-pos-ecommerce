<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AuditLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'branch_id',
        'user_name',
        'user_email',
        'roles',
        'action',
        'method',
        'path',
        'route_name',
        'module',
        'model_type',
        'model_id',
        'description',
        'status_code',
        'ip_address',
        'user_agent',
        'request_payload',
        'response_payload',
        'meta',
    ];

    protected function casts(): array
    {
        return [
            'roles' => 'array',
            'request_payload' => 'array',
            'response_payload' => 'array',
            'meta' => 'array',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class, 'branch_id');
    }
}
