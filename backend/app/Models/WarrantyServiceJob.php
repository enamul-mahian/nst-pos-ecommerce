<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class WarrantyServiceJob extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'job_no',
        'branch_id',
        'customer_id',
        'sale_id',
        'sale_item_id',
        'device_unit_id',
        'product_id',
        'customer_name',
        'customer_phone',
        'product_name',
        'imei_1',
        'imei_2',
        'barcode',
        'warranty_type',
        'issue_type',
        'issue_description',
        'priority',
        'status',
        'estimated_cost',
        'service_charge',
        'parts_cost',
        'discount_amount',
        'total_amount',
        'paid_amount',
        'due_amount',
        'payment_method',
        'transaction_id',
        'received_by',
        'assigned_to',
        'delivered_by',
        'received_at',
        'expected_delivery_date',
        'completed_at',
        'delivered_at',
        'technician_note',
        'resolution_note',
        'delivery_note',
        'note',
    ];

    protected $casts = [
        'estimated_cost' => 'decimal:2',
        'service_charge' => 'decimal:2',
        'parts_cost' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'paid_amount' => 'decimal:2',
        'due_amount' => 'decimal:2',
        'received_at' => 'datetime',
        'expected_delivery_date' => 'date',
        'completed_at' => 'datetime',
        'delivered_at' => 'datetime',
    ];

    public function logs()
    {
        return $this->hasMany(WarrantyServiceJobLog::class)->latest();
    }

    public function branch()
    {
        return $this->belongsTo(Branch::class);
    }

    public function customer()
    {
        return $this->belongsTo(Customer::class);
    }

    public function sale()
    {
        return $this->belongsTo(Sale::class);
    }

    public function saleItem()
    {
        return $this->belongsTo(SaleItem::class);
    }

    public function deviceUnit()
    {
        return $this->belongsTo(DeviceUnit::class);
    }

    public function product()
    {
        return $this->belongsTo(Product::class);
    }

    public function receiver()
    {
        return $this->belongsTo(User::class, 'received_by');
    }

    public function technician()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function deliveredBy()
    {
        return $this->belongsTo(User::class, 'delivered_by');
    }
}
