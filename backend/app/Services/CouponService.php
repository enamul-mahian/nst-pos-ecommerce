<?php

namespace App\Services;

use App\Models\Coupon;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * One place that decides whether a coupon applies and how much it takes off, used both by the
 * "apply coupon" check on the cart and by order creation (where the server, not the cart, sets the discount).
 */
class CouponService
{
    /**
     * @return array{coupon: Coupon, discount: float}
     */
    public function evaluate(string $code, float $amount, bool $lockForUpdate = false): array
    {
        $code = strtoupper(trim($code));
        $query = Coupon::query()->where('code', $code)->where('is_active', true);
        if ($lockForUpdate) {
            $query->lockForUpdate();
        }

        $coupon = $query->first();
        if (! $coupon) {
            throw new HttpException(404, 'Invalid coupon.');
        }

        $now = now();
        if (($coupon->starts_at && $coupon->starts_at->gt($now)) || ($coupon->ends_at && $coupon->ends_at->lt($now))) {
            throw new HttpException(422, 'Coupon expired/not active yet.');
        }
        if ($coupon->usage_limit && (int) $coupon->used_count >= (int) $coupon->usage_limit) {
            throw new HttpException(422, 'Coupon usage limit exceeded.');
        }
        if ($amount < (float) $coupon->minimum_amount) {
            throw new HttpException(422, 'Minimum purchase amount not reached.');
        }

        $discount = $coupon->discount_type === 'percent'
            ? $amount * (float) $coupon->discount_value / 100
            : (float) $coupon->discount_value;

        // Optional cap for percent coupons, e.g. conditions: {"max_discount": 2000}.
        $maxDiscount = (float) (($coupon->conditions ?? [])['max_discount'] ?? 0);
        if ($maxDiscount > 0) {
            $discount = min($discount, $maxDiscount);
        }

        return ['coupon' => $coupon, 'discount' => round(min($discount, $amount), 2)];
    }

    /** Count one use. Call inside the order transaction after evaluate(..., lockForUpdate: true). */
    public function markUsed(Coupon $coupon): void
    {
        $coupon->forceFill(['used_count' => (int) $coupon->used_count + 1])->save();
    }
}
