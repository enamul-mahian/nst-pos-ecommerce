<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Coupon;
use Illuminate\Http\Request;

class CouponController extends Controller
{
    public function index(Request $request)
    {
        $items = Coupon::query()
            ->when($request->filled('search'), fn ($q) => $q->where('code', 'like', "%{$request->search}%")->orWhere('title', 'like', "%{$request->search}%"))
            ->latest('id')
            ->paginate((int) $request->get('per_page', 20));
        return response()->json(['success' => true, 'data' => $items]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['code'] = strtoupper($data['code']);
        $data['created_by'] = $request->user()?->id;
        $data['updated_by'] = $request->user()?->id;
        $coupon = Coupon::create($data);
        return response()->json(['success' => true, 'message' => 'Coupon created.', 'data' => $coupon], 201);
    }

    public function update(Request $request, Coupon $coupon)
    {
        $data = $this->validated($request, true);
        if (isset($data['code'])) { $data['code'] = strtoupper($data['code']); }
        $data['updated_by'] = $request->user()?->id;
        $coupon->update($data);
        return response()->json(['success' => true, 'message' => 'Coupon updated.', 'data' => $coupon->fresh()]);
    }

    public function destroy(Coupon $coupon)
    {
        $coupon->delete();
        return response()->json(['success' => true, 'message' => 'Coupon deleted.']);
    }

    public function validateCoupon(Request $request)
    {
        $validated = $request->validate(['code' => ['required', 'string'], 'amount' => ['required', 'numeric', 'min:0']]);
        $coupon = Coupon::where('code', strtoupper($validated['code']))->where('is_active', true)->first();
        if (! $coupon) {
            return response()->json(['success' => false, 'message' => 'Invalid coupon.'], 404);
        }
        $now = now();
        if (($coupon->starts_at && $coupon->starts_at->gt($now)) || ($coupon->ends_at && $coupon->ends_at->lt($now))) {
            return response()->json(['success' => false, 'message' => 'Coupon expired/not active yet.'], 422);
        }
        if ($coupon->usage_limit && $coupon->used_count >= $coupon->usage_limit) {
            return response()->json(['success' => false, 'message' => 'Coupon usage limit exceeded.'], 422);
        }
        if ((float) $validated['amount'] < (float) $coupon->minimum_amount) {
            return response()->json(['success' => false, 'message' => 'Minimum purchase amount not reached.'], 422);
        }
        $discount = $coupon->discount_type === 'percent' ? ((float) $validated['amount'] * (float) $coupon->discount_value / 100) : (float) $coupon->discount_value;
        $discount = min($discount, (float) $validated['amount']);
        return response()->json(['success' => true, 'data' => ['coupon' => $coupon, 'discount' => round($discount, 2)]]);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'code' => array_filter([$partial ? 'sometimes' : 'required', 'string', 'max:80', $partial ? null : 'unique:coupons,code']),
            'title' => ['nullable', 'string', 'max:150'],
            'discount_type' => ['nullable', 'in:fixed,percent'],
            'discount_value' => ['nullable', 'numeric', 'min:0'],
            'minimum_amount' => ['nullable', 'numeric', 'min:0'],
            'usage_limit' => ['nullable', 'integer', 'min:1'],
            'starts_at' => ['nullable', 'date'],
            'ends_at' => ['nullable', 'date'],
            'applies_to' => ['nullable', 'string', 'max:80'],
            'conditions' => ['nullable', 'array'],
            'is_active' => ['nullable', 'boolean'],
            'note' => ['nullable', 'string'],
        ]);
    }
}
