<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GooglePost extends Model
{
    protected $fillable = [
        'title',
        'description',
        'feature_image',
        'status',
        'scheduled_at',
        'published_at',
        'external_post_id',
        'external_reference_url',
        'cta_url',
        'sync_status',
        'sync_error',
        'branch_id',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'scheduled_at' => 'datetime',
        'published_at' => 'datetime',
    ];

    protected $appends = ['feature_image_url'];

    public function getFeatureImageUrlAttribute(): ?string
    {
        if (! $this->feature_image) {
            return null;
        }

        if (str_starts_with($this->feature_image, 'http://') || str_starts_with($this->feature_image, 'https://')) {
            return $this->feature_image;
        }

        return asset('storage/' . ltrim($this->feature_image, '/'));
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
