<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NstFile extends Model
{
    protected $table = 'nst_files';

    protected $fillable = [
        'title', 'description', 'category', 'file_path', 'external_url', 'icon_url',
        'version', 'changelog', 'checksum', 'file_size', 'download_count', 'status',
        'created_by', 'published_at', 'archived_at',
    ];

    protected $casts = [
        'file_size' => 'integer',
        'download_count' => 'integer',
        'published_at' => 'datetime',
        'archived_at' => 'datetime',
    ];
}