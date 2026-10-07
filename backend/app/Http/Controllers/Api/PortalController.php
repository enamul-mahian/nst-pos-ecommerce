<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Models\UsedPurchase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PortalController extends Controller
{
    public function profile(Request $request)
    {
        $user = $request->user()->load(['customerProfile', 'supplierProfile']);

        return response()->json([
            'success' => true,
            'message' => 'Portal profile loaded successfully.',
            'data' => [
                'user' => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'username' => $user->username,
                    'email' => $user->email,
                    'phone' => $user->phone,
                    'profile_type' => $user->profile_type,
                    'must_change_password' => (bool) $user->must_change_password,
                ],
                'customer' => $user->customerProfile,
                'supplier' => $user->supplierProfile,
            ],
        ]);
    }

    public function sales(Request $request)
    {
        $user = $request->user();

        $query = Sale::with([
                'items.product:id,name,sku,barcode,sale_price',
                'items.usedPurchase:id,product_name,imei_1,imei_2,purchase_price',
                'branch:id,name,code',
            ])
            ->latest();

        if ($user->customer_id) {
            $query->where('customer_id', $user->customer_id);
        } elseif ($user->phone) {
            $query->where('customer_phone', $user->phone);
        } else {
            $query->whereRaw('1 = 0');
        }

        return response()->json([
            'success' => true,
            'message' => 'Customer sales loaded successfully.',
            'data' => $query->paginate((int) $request->get('per_page', 20)),
        ]);
    }

    public function purchases(Request $request)
    {
        $user = $request->user();

        $query = UsedPurchase::with([
                'branch:id,name,code',
                'brandInfo:id,name',
                'readyProduct:id,name,sku,barcode,sale_price,stock_quantity',
            ])
            ->latest();

        if ($user->profile_type === 'supplier' && $user->supplier_id) {
            $query->where('supplier_id', $user->supplier_id);
        } elseif ($user->customer_id) {
            $query->where('customer_id', $user->customer_id);
        } elseif ($user->phone) {
            $query->where('customer_phone', $user->phone);
        } else {
            $query->whereRaw('1 = 0');
        }

        return response()->json([
            'success' => true,
            'message' => 'Portal purchases loaded successfully.',
            'data' => $query->paginate((int) $request->get('per_page', 20)),
        ]);
    }
    public function externalPreorders(Request $request)
    {
        $user = $request->user();
        if (! Schema::hasTable('external_preorders')) {
            return response()->json(['success' => true, 'data' => []]);
        }

        $query = DB::table('external_preorders')->orderByDesc('id');
        $query->where(function ($builder) use ($user) {
            if ($user->customer_id) {
                $builder->where('customer_id', $user->customer_id);
            }
            if ($user->phone) {
                $builder->orWhere('customer_phone', $user->phone);
            }
            if ($user->email) {
                $builder->orWhere('customer_email', $user->email);
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'External preorders loaded successfully.',
            'data' => $query->get()->map(function ($row) {
                $item = (array) $row;
                $item['product_image_url'] = $row->product_image_path
                    ? url('/storage/' . ltrim($row->product_image_path, '/'))
                    : null;
                return $item;
            }),
        ]);
    }

    public function submitExternalPreorderPayment(Request $request, int $preorderId)
    {
        if (! Schema::hasTable('external_preorders')) {
            return response()->json(['status' => false, 'message' => 'External preorder service is not ready.'], 503);
        }

        $user = $request->user();
        $query = DB::table('external_preorders')->where('id', $preorderId);
        $query->where(function ($builder) use ($user) {
            $matched = false;
            if ($user->customer_id && Schema::hasColumn('external_preorders', 'customer_id')) {
                $builder->where('customer_id', $user->customer_id);
                $matched = true;
            }
            if ($user->phone) {
                $method = $matched ? 'orWhere' : 'where';
                $builder->{$method}('customer_phone', $user->phone);
                $matched = true;
            }
            if ($user->email) {
                $method = $matched ? 'orWhere' : 'where';
                $builder->{$method}('customer_email', $user->email);
            }
        });
        $row = $query->first();
        if (! $row) {
            return response()->json(['status' => false, 'message' => 'Preorder not found for this customer.'], 404);
        }

        $validated = $request->validate([
            'payment_method' => ['required', 'in:cash_on_delivery,bkash_agent,nagad_agent'],
            'transaction_id' => ['nullable', 'string', 'max:190'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
        ]);
        $paymentSettings = app(\App\Services\CorporateSettingService::class)->section('payments');
        $enabledKey = $validated['payment_method'] . '_enabled';
        if (array_key_exists($enabledKey, $paymentSettings) && ! (bool) $paymentSettings[$enabledKey]) {
            return response()->json(['status' => false, 'message' => 'The selected payment method is currently disabled.'], 422);
        }

        $manual = in_array($validated['payment_method'], ['bkash_agent', 'nagad_agent'], true);
        if ($manual && (empty($validated['transaction_id']) || (float) ($validated['paid_amount'] ?? 0) <= 0)) {
            return response()->json([
                'status' => false,
                'message' => 'Transaction ID and paid amount are required for bKash/Nagad agent payment.',
            ], 422);
        }

        if ($manual && Schema::hasColumn('external_preorders', 'transaction_id')) {
            $duplicate = DB::table('external_preorders')
                ->where('transaction_id', trim((string) $validated['transaction_id']))
                ->where('id', '<>', $preorderId)
                ->exists();
            if ($duplicate) {
                return response()->json(['status' => false, 'message' => 'This transaction ID has already been submitted.'], 422);
            }
        }

        $status = $manual ? 'payment_submitted' : ($row->status ?? 'order_recorded');
        $customStatus = $manual ? 'Payment Submitted for Verification' : 'Cash on Delivery';
        $history = json_decode((string) ($row->status_history ?? '[]'), true);
        if (! is_array($history)) {
            $history = [];
        }
        $history[] = [
            'status' => $status,
            'custom_status' => $customStatus,
            'payment_status' => $manual ? 'pending_verification' : 'cod_pending',
            'changed_at' => now()->toIso8601String(),
            'changed_by' => $user->id,
            'source' => 'customer_payment_submission',
        ];

        $payload = [
            'payment_method' => $validated['payment_method'],
            'transaction_id' => $manual ? trim((string) $validated['transaction_id']) : null,
            'paid_amount' => $manual ? $validated['paid_amount'] : ($row->paid_amount ?? 0),
            'payment_status' => $manual ? 'pending_verification' : 'cod_pending',
            'payment_submitted_at' => $manual ? now() : null,
            'payment_verified_at' => null,
            'payment_verified_by' => null,
            'payment_rejection_reason' => null,
            'status' => $status,
            'custom_status' => $customStatus,
            'status_history' => json_encode(array_slice($history, -100), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'updated_at' => now(),
        ];
        $columns = array_flip(Schema::getColumnListing('external_preorders'));
        DB::table('external_preorders')->where('id', $preorderId)->update(array_intersect_key($payload, $columns));

        $updated = DB::table('external_preorders')->where('id', $preorderId)->first();
        $data = (array) $updated;
        $data['product_image_url'] = $updated?->product_image_path
            ? url('/storage/' . ltrim($updated->product_image_path, '/'))
            : null;

        return response()->json([
            'status' => true,
            'message' => $manual ? 'Payment submitted for staff verification.' : 'Cash on Delivery selected.',
            'data' => $data,
        ]);
    }

    public function coupons(Request $request)
    {
        $user = $request->user();
        $phone = $user->phone;
        $registration = Schema::hasTable('registration_promo_codes') && $phone
            ? DB::table('registration_promo_codes')->where('phone', $phone)->orderByDesc('id')->get()
            : collect();
        $invoice = Schema::hasTable('invoice_coupon_usages') && $phone
            ? DB::table('invoice_coupon_usages')->where('customer_phone', $phone)->orderByDesc('id')->get()
            : collect();

        return response()->json([
            'success' => true,
            'data' => [
                'registration_promos' => $registration,
                'invoice_coupons' => $invoice,
            ],
        ]);
    }

}
