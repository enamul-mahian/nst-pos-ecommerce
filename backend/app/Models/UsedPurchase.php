<?php

namespace App\Models;

use App\Services\PublicMediaUrlService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class UsedPurchase extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'purchase_type',
        'seller_type',
        'customer_id',
        'supplier_id',
        'branch_id',
        'salesman_id',
        'customer_name',
        'customer_phone',
        'customer_nid',
        'nid_photo_path',
        'customer_product_photo_path',
        'product_image_paths',
        'product_name',
        'brand_id',
        'brand',
        'model',
        'imei_1',
        'imei_2',
        'battery_health',
        'purchase_price',
        'condition',
        'notes',
        'status',
        'ready_product_id',
        'ready_variant_id',
        'ready_device_unit_id',
        'category_id',
        'model_number',
        'color_name',
        'region',
        'sim_network',
        'ram',
        'storage',
        'activation_status',
        'box_included',
        'physical_condition',
        'condition_grade',
        'market_price',
        'minimum_booking_type',
        'minimum_booking_value',
        'emi_available',
        'allow_preorder',
        'website_published',
        'official_warranty',
        'shop_warranty',
        'warranty_duration',
        'warranty_notes',
        'whats_in_box',
        'ready_sale_price',
        'converted_to_stock_at',
        'converted_by',
        'sold_sale_id',
        'actual_sale_price',
        'profit_amount',
        'sold_at',
        'sold_by',
        'created_by',
    ];

    protected $casts = [
        'purchase_price' => 'decimal:2',
        'ready_sale_price' => 'decimal:2',
        'ready_variant_id' => 'integer',
        'ready_device_unit_id' => 'integer',
        'category_id' => 'integer',
        'market_price' => 'decimal:2',
        'minimum_booking_value' => 'decimal:2',
        'box_included' => 'boolean',
        'emi_available' => 'boolean',
        'allow_preorder' => 'boolean',
        'website_published' => 'boolean',
        'actual_sale_price' => 'decimal:2',
        'profit_amount' => 'decimal:2',
        'battery_health' => 'integer',
        'product_image_paths' => 'array',
        'converted_to_stock_at' => 'datetime',
        'sold_at' => 'datetime',
    ];

    protected $appends = [
        'nid_photo_url',
        'customer_product_photo_url',
        'product_image_urls',
    ];

    public function getNidPhotoUrlAttribute()
    {
        if (!$this->nid_photo_path) {
            return null;
        }

        return PublicMediaUrlService::forPath($this->nid_photo_path);
    }

    public function getCustomerProductPhotoUrlAttribute()
    {
        if (!$this->customer_product_photo_path) {
            return null;
        }

        return PublicMediaUrlService::forPath($this->customer_product_photo_path);
    }

    public function getProductImageUrlsAttribute()
    {
        if (!$this->product_image_paths || !is_array($this->product_image_paths)) {
            return [];
        }

        return collect($this->product_image_paths)
            ->filter()
            ->map(function ($path) {
                return PublicMediaUrlService::forPath($path);
            })
            ->values()
            ->toArray();
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function salesman()
    {
        return $this->belongsTo(User::class, 'salesman_id');
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function supplier()
    {
        return $this->belongsTo(Supplier::class);
    }

    public function readyProduct()
    {
        return $this->belongsTo(Product::class, 'ready_product_id');
    }

    public function converter()
    {
        return $this->belongsTo(User::class, 'converted_by');
    }

    public function soldSale()
    {
        return $this->belongsTo(Sale::class, 'sold_sale_id');
    }

    public function soldBy()
    {
        return $this->belongsTo(User::class, 'sold_by');
    }

    public function brandInfo()
    {
        return $this->belongsTo(Brand::class, 'brand_id');
    }
}
