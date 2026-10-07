<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class ProductVariantOption extends Model
{
    use HasFactory;

    protected $fillable = [
        'product_id',
        'variant_group_id',
        'value',
        'slug',
        'image',
        'hex_color',
        'sort_order',
        'is_active',
    ];

    protected $casts = [
        'product_id' => 'integer',
        'variant_group_id' => 'integer',
        'sort_order' => 'integer',
        'is_active' => 'boolean',
    ];

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function group()
    {
        return $this->belongsTo(ProductVariantGroup::class, 'variant_group_id');
    }
}
