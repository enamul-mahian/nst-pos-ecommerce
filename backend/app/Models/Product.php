<?php

namespace App\Models;

use App\Services\PublicMediaUrlService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'sku',
        'barcode',
        'barcode_mode',

        'brand_id',
        'category_id',
        'supplier_id',

        'brand',
        'model',
        'category',
        'condition',
        'product_type',
        'source_type',
        'battery_health',
        'notes',
        'description',
        'short_description',
        'meta_title',
        'meta_description',
        'meta_keywords',
        'seo_keywords',
        'canonical_url',
        'og_title',
        'og_description',
        'og_image',
        'schema_data',
        'key_features',
        'feature_blocks',
        'purchase_price',
        'sale_price',
        'regular_price',
        'discount_price',
        'minimum_booking_amount',
        'minimum_booking_type',
        'minimum_booking_value',
        'allow_preorder',
        'preorder_note',
        'purchase_points',
        'emi_monthly_amount',
        'stock_quantity',
        'low_stock_alert',
        'image',
        'status',
        'warranty',
        'estimated_delivery',
        'specifications',
        'specification_groups',
        'faqs',

        'color_options',
        'region_options',
        'variant_type_options',
        'storage_options',
        'ram_options',
        'key_specs',
        'page_options',
        'add_ons',
        'care_packages',
        'website_published',
        'draft_step',
        'activation_status',
        'box_included',
        'physical_condition',
        'condition_grade',
        'official_warranty',
        'shop_warranty',
        'warranty_notes',
        'whats_in_box',
    ];

    protected $casts = [
        'brand_id' => 'integer',
        'category_id' => 'integer',
        'supplier_id' => 'integer',

        'purchase_price' => 'decimal:2',
        'sale_price' => 'decimal:2',
        'regular_price' => 'decimal:2',
        'discount_price' => 'decimal:2',
        'minimum_booking_amount' => 'decimal:2',
        'minimum_booking_value' => 'decimal:2',
        'allow_preorder' => 'boolean',
        'emi_monthly_amount' => 'decimal:2',
        'purchase_points' => 'integer',
        'stock_quantity' => 'integer',
        'low_stock_alert' => 'integer',

        'key_features' => 'array',
        'feature_blocks' => 'array',
        'specifications' => 'array',
        'specification_groups' => 'array',
        'faqs' => 'array',

        'color_options' => 'array',
        'region_options' => 'array',
        'variant_type_options' => 'array',
        'storage_options' => 'array',
        'ram_options' => 'array',
        'key_specs' => 'array',
        'page_options' => 'array',
        'add_ons' => 'array',
        'care_packages' => 'array',
        'website_published' => 'boolean',
        'draft_step' => 'integer',
        'box_included' => 'boolean',
    ];

    protected $appends = [
        'image_url',
    ];

    public function categoryInfo()
    {
        return $this->belongsTo(Category::class, 'category_id');
    }

    public function brandInfo()
    {
        return $this->belongsTo(Brand::class, 'brand_id');
    }

    public function supplierInfo()
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function images()
    {
        return $this->hasMany(ProductImage::class)->orderBy('sort_order');
    }

    public function primaryImage()
    {
        return $this->hasOne(ProductImage::class)->where('is_primary', true);
    }

    public function variants()
    {
        return $this->hasMany(ProductVariant::class)->orderBy('id');
    }

    public function getImageUrlAttribute()
    {
        if ($this->image) {
            return PublicMediaUrlService::forPath($this->image);
        }

        $primaryImage = $this->primaryImage;

        if ($primaryImage) {
            return $primaryImage->thumbnail_url ?? $primaryImage->image_url;
        }

        return null;
    }
}