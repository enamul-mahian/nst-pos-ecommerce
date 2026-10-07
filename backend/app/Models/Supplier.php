<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Supplier extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id',
        'supplier_code',
        'name',
        'slug',
        'company_name',
        'contact_person',
        'phone',
        'email',
        'address',
        'city',
        'country',
        'website',
        'trade_license_no',
        'tax_number',
        'opening_balance',
        'current_balance',
        'supplier_since',
        'status',
        'portal_enabled',
        'reliability_score',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'user_id' => 'integer',
        'opening_balance' => 'decimal:2',
        'current_balance' => 'decimal:2',
        'supplier_since' => 'date:Y-m-d',
        'portal_enabled' => 'boolean',
        'reliability_score' => 'decimal:2',
    ];

    protected static function booted()
    {
        static::creating(function ($supplier) {
            if (empty($supplier->slug)) {
                $supplier->slug = static::generateUniqueSlug($supplier->name);
            }
        });

        static::created(function ($supplier) {
            if (empty($supplier->supplier_code)) {
                $supplier->forceFill([
                    'supplier_code' => 'SUP-' . str_pad((string) $supplier->id, 6, '0', STR_PAD_LEFT),
                ])->saveQuietly();
            }
        });

        static::updating(function ($supplier) {
            if (empty($supplier->slug)) {
                $supplier->slug = static::generateUniqueSlug($supplier->name, $supplier->id);
            }
        });
    }

    public static function generateUniqueSlug(string $name, ?int $ignoreId = null): string
    {
        $baseSlug = Str::slug($name);
        $slug = $baseSlug;
        $count = 1;

        while (
            static::where('slug', $slug)
                ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $slug = $baseSlug . '-' . $count;
            $count++;
        }

        return $slug;
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function sales()
    {
        return $this->hasMany(Sale::class);
    }

    public function products()
    {
        return $this->hasMany(Product::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updater()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function usedPurchases()
    {
        return $this->hasMany(UsedPurchase::class);
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }
}