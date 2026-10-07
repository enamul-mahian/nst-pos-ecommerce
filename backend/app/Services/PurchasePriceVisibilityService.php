<?php

namespace App\Services;

use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;

class PurchasePriceVisibilityService
{
    public function __construct(private AccessControlService $accessControl)
    {
    }

    public function canView($user): bool
    {
        return $this->accessControl->canViewPurchasePrice($user);
    }

    public function stripForUser($payload, $user)
    {
        if ($this->canView($user)) {
            return $payload;
        }

        return $this->strip($payload);
    }

    public function strip($payload)
    {
        if ($payload instanceof LengthAwarePaginator) {
            $payload->getCollection()->transform(fn ($item) => $this->strip($item));
            return $payload;
        }

        if ($payload instanceof Collection) {
            return $payload->map(fn ($item) => $this->strip($item));
        }

        if (is_array($payload)) {
            foreach ($payload as $key => $value) {
                if ($this->isCostKey((string) $key)) {
                    unset($payload[$key]);
                    continue;
                }
                $payload[$key] = $this->strip($value);
            }
            return $payload;
        }

        if (is_object($payload)) {
            foreach (array_keys(get_object_vars($payload)) as $key) {
                if ($this->isCostKey((string) $key)) {
                    unset($payload->{$key});
                    continue;
                }
                $payload->{$key} = $this->strip($payload->{$key});
            }
            return $payload;
        }

        return $payload;
    }

    private function isCostKey(string $key): bool
    {
        $normalized = strtolower($key);

        return in_array($normalized, [
            'purchase_price',
            'purchase_cost',
            'unit_cost',
            'line_total',
            'subtotal',
            'final_amount',
            'total_amount',
            'grand_total',
            'bill_amount',
            'net_amount',
            'profit_amount',
            'profit',
            'margin',
            'available_stock_value',
            'average_purchase_cost',
        ], true);
    }
}
