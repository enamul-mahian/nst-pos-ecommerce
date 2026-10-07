<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DangerZoneLog extends Model
{
    protected $fillable = [
        'user_id',
        'action',
        'selected_options',
        'deleted_counts',
        'deleted_files_count',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'selected_options' => 'array',
        'deleted_counts' => 'array',
    ];
}
