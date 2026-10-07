<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class EmiPlan extends Model
{
    use HasFactory;

    protected $fillable = [
        'bank_name',
        'card_type',
        'months',
        'interest_rate',
        'processing_fee_percent',
        'fixed_processing_fee',
        'minimum_amount',
        'status',
    ];

    protected $casts = [
        'months' => 'integer',
        'interest_rate' => 'decimal:2',
        'processing_fee_percent' => 'decimal:2',
        'fixed_processing_fee' => 'decimal:2',
        'minimum_amount' => 'decimal:2',
    ];

    public function calculateMonthlyAmount(float $productPrice): float
    {
        $interestAmount = ($productPrice * (float) $this->interest_rate) / 100;
        $processingPercentAmount = ($productPrice * (float) $this->processing_fee_percent) / 100;
        $total = $productPrice + $interestAmount + $processingPercentAmount + (float) $this->fixed_processing_fee;

        if ((int) $this->months <= 0) {
            return $total;
        }

        return round($total / (int) $this->months, 2);
    }
}
