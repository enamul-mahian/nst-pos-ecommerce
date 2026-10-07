<?php

namespace App\Models;

use App\Services\PublicMediaUrlService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ProductImage extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'product_variant_id',
        'variant_key',
        'media_type',
        'image_path',
        'thumbnail_path',
        'original_name',
        'mime_type',
        'size_kb',
        'processed_size_kb',
        'is_primary',
        'sort_order',
    ];

    protected $casts = [
        'is_primary' => 'boolean',
        'sort_order' => 'integer',
        'size_kb' => 'integer',
        'processed_size_kb' => 'integer',
    ];

    protected $appends = [
        'image_url',
        'media_url',
        'thumbnail_url',
        'is_video',
        'is_image',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function variant()
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }

    public function getImageUrlAttribute()
    {
        return $this->mediaFileUrl($this->image_path);
    }

    public function getMediaUrlAttribute()
    {
        return $this->mediaFileUrl($this->image_path);
    }

    public function getThumbnailUrlAttribute()
    {
        if ($this->thumbnail_path) {
            return $this->mediaFileUrl($this->thumbnail_path);
        }

        if ($this->media_type === 'image' && $this->image_path) {
            return $this->mediaFileUrl($this->image_path);
        }

        return null;
    }

    private function mediaFileUrl(?string $path): ?string
    {
        return PublicMediaUrlService::forPath($path, $this->updated_at?->timestamp);
    }

    public function getIsVideoAttribute()
    {
        return $this->media_type === 'video';
    }

    public function getIsImageAttribute()
    {
        return $this->media_type === 'image';
    }
}
