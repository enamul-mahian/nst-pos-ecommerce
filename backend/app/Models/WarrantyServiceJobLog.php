<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WarrantyServiceJobLog extends Model
{
    protected $fillable = [
        'warranty_service_job_id',
        'user_id',
        'action',
        'from_status',
        'to_status',
        'note',
        'meta',
    ];

    protected $casts = [
        'meta' => 'array',
    ];

    public function job()
    {
        return $this->belongsTo(WarrantyServiceJob::class, 'warranty_service_job_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
