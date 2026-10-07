<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerOrder;
use App\Models\CustomerOrderTimelineEvent;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\CorporateSettingService;
use App\Services\AccessControlService;
use App\Services\SecurityEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class OrderController extends Controller
{
    public function portalIndex(Request $request): JsonResponse
    {
        $customerId = $this->resolveCustomerId($request);

        $orders = CustomerOrder::query()
            ->with('items')
            ->where('customer_id', $customerId)
            ->latest('id')
            ->get();

        return response()->json([
            'status' => true,
            'data' => $orders,
        ]);
    }

    public function portalStore(Request $request, CorporateSettingService $settings): JsonResponse
    {
        $customerId = $this->resolveCustomerId($request);
        $customer = Customer::query()->findOrFail($customerId);
        $user = $request->user();

        $requestedPaymentMethod = $request->input('payment_method', 'cash_on_delivery');
        if ($requestedPaymentMethod === 'peppapay') {
            // Legacy typo compatibility: normalize to the real PipraPay provider.
            $requestedPaymentMethod = 'piprapay';
        }
        $deliveryAddress = $request->input('delivery_address');
        if (! $deliveryAddress) {
            $deliveryAddress = collect([
                $request->input('address_line'),
                $request->input('city'),
                $request->input('district'),
                $request->input('postal_code'),
            ])->filter()->implode(', ');
        }

        $request->merge([
            'customer_name' => $request->input('customer_name', $request->input('name', $customer->name ?: $user?->name)),
            'customer_phone' => $request->input('customer_phone', $request->input('phone', $customer->phone ?: $user?->phone)),
            'customer_email' => $request->input('customer_email', $request->input('email', $customer->email ?: $user?->email)),
            'delivery_address' => $deliveryAddress,
            'payment_method' => $requestedPaymentMethod,
        ]);

        $manualPayment = in_array($request->input('payment_method'), ['bkash_agent', 'nagad_agent'], true);
        $validated = $request->validate([
            'customer_name' => ['required', 'string', 'max:255'],
            'customer_phone' => ['required', 'string', 'max:60'],
            'customer_email' => ['nullable', 'email', 'max:255'],
            'delivery_address' => ['required', 'string', 'max:3000'],
            'city' => ['required', 'string', 'max:120'],
            'district' => ['required', 'string', 'max:120'],
            'postal_code' => ['nullable', 'string', 'max:30'],
            'current_location' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'customer_note' => ['nullable', 'string', 'max:3000'],
            'payment_method' => ['required', Rule::in(['cash_on_delivery', 'bkash_agent', 'nagad_agent', 'sslcommerz', 'piprapay'])],
            'shipping_method' => ['nullable', Rule::in(['inside_dhaka', 'outside_dhaka', 'cash_on_delivery'])],
            'transaction_id' => [$manualPayment ? 'required' : 'nullable', 'string', 'max:190'],
            'paid_amount' => [$manualPayment ? 'required' : 'nullable', 'numeric', $manualPayment ? 'min:0.01' : 'min:0'],
            'promo_code' => ['nullable', 'string', 'max:100'],
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.product_id' => ['required', 'integer', 'min:1'],
            'items.*.variant_id' => ['nullable', 'integer', 'min:1'],
            'items.*.branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'items.*.quantity' => ['required', 'integer', 'min:1', 'max:99'],
            'items.*.rate' => ['nullable', 'numeric', 'min:0'],
        ]);

        $paymentSettings = $settings->section('payments');
        $priceChanges = [];
        $tampered = [];
        $enabledKey = $validated['payment_method'] . '_enabled';
        if (array_key_exists($enabledKey, $paymentSettings) && ! (bool) $paymentSettings[$enabledKey]) {
            return response()->json([
                'status' => false,
                'message' => 'The selected payment method is currently disabled.',
            ], 422);
        }

        if ($manualPayment) {
            $duplicate = CustomerOrder::query()
                ->where('transaction_id', trim((string) $validated['transaction_id']))
                ->exists();
            if ($duplicate) {
                return response()->json([
                    'status' => false,
                    'message' => 'This transaction ID has already been submitted.',
                ], 422);
            }
        }

        $preparedItems = [];
        $subtotal = 0.0;

        foreach ($validated['items'] as $row) {
            $product = Product::query()->findOrFail((int) $row['product_id']);
            $variant = null;
            if (! empty($row['variant_id'])) {
                $variant = ProductVariant::query()
                    ->where('product_id', $product->id)
                    ->findOrFail((int) $row['variant_id']);
            }

            $quantity = (int) $row['quantity'];
            $unitPrice = $this->resolvePublicPrice($product, $variant);
            if ($unitPrice <= 0) {
                return response()->json([
                    'status' => false,
                    'message' => "{$product->name} does not have a valid public sale price.",
                ], 422);
            }

            // The server price always wins. A cart price that differs is never used: the order stops so the
            // customer sees the real price; a lower price than the shop price is logged as tampering.
            if (isset($row['rate']) && ! $this->matchesShownPrice((float) $row['rate'], $unitPrice, $product, $variant)) {
                $priceChanges[] = ['product_id' => $product->id, 'variant_id' => $variant?->id, 'price' => $unitPrice, 'name' => $product->name];
                if ((float) $row['rate'] < $unitPrice) {
                    $tampered[] = ['product_id' => $product->id, 'variant_id' => $variant?->id, 'sent_price' => (float) $row['rate'], 'shop_price' => $unitPrice];
                }
            }

            $lineTotal = round($unitPrice * $quantity, 2);
            $subtotal += $lineTotal;
            $preparedItems[] = [
                'product_id' => $product->id,
                'variant_id' => $variant?->id,
                'sku' => $variant?->sku ?: $product->sku,
                'product_name' => $product->name,
                'variant_name' => $variant?->display_name,
                'color' => $variant?->color_name ?: $variant?->color,
                'storage' => $variant?->storage,
                'ram' => $variant?->ram ?: $variant?->ram_storage,
                'country_region' => $variant?->country_region ?: $variant?->region ?: $variant?->region_variant,
                'sim_type' => $variant?->sim_type,
                'network_carrier' => $variant?->network_carrier ?: $variant?->sim_network,
                'condition' => $variant?->condition ?: $product->condition,
                'branch_id' => $row['branch_id'] ?? $variant?->branch_id,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'line_total' => $lineTotal,
                'image_url' => $product->image_url,
                'snapshot' => [
                    'product_slug' => $product->slug,
                    'product_condition' => $product->condition,
                    'variant_attributes' => $variant?->attributes,
                    'storage' => $variant?->storage,
                    'ram' => $variant?->ram ?: $variant?->ram_storage,
                    'color' => $variant?->color_name ?: $variant?->color,
                    'country_region' => $variant?->country_region ?: $variant?->region ?: $variant?->region_variant,
                    'sim_type' => $variant?->sim_type,
                    'network_carrier' => $variant?->network_carrier ?: $variant?->sim_network,
                    'condition' => $variant?->condition ?: $product->condition,
                    'branch_id' => $row['branch_id'] ?? $variant?->branch_id,
                ],
            ];
        }

        if ($priceChanges) {
            if ($tampered) {
                app(SecurityEventService::class)->record($request, 'tampered_price', 'critical', [
                    'page' => '/checkout',
                    'items' => $tampered,
                ], null, 422);
            }

            return response()->json([
                'status' => false,
                'message' => __($tampered ? 'messages.security.price_tampered' : 'messages.security.price_changed', ['product' => $priceChanges[0]['name']]),
                'price_changes' => $priceChanges,
            ], 422);
        }

        $discount = 0.0;
        $promoCode = strtoupper(trim((string) ($validated['promo_code'] ?? '')));
        $promoRow = null;

        if ($promoCode !== '' && Schema::hasTable('registration_promo_codes')) {
            $promoQuery = DB::table('registration_promo_codes')
                ->where('code', $promoCode)
                ->where('used_customer_id', $customerId)
                ->where('status', 'used');

            if (Schema::hasColumn('registration_promo_codes', 'order_applied_at')) {
                $promoQuery->whereNull('order_applied_at');
            }

            $promoRow = $promoQuery->latest('id')->first();
            if ($promoRow) {
                $discount = min((float) ($promoRow->discount_amount ?? 0), $subtotal);
            }
        }

        $deliveryCharge = match ($validated['shipping_method'] ?? null) {
            'inside_dhaka' => 60.0,
            'outside_dhaka' => 120.0,
            'cash_on_delivery' => 200.0,
            default => $validated['payment_method'] === 'cash_on_delivery' ? 200.0 : 0.0,
        };
        $total = max(0, round($subtotal - $discount + $deliveryCharge, 2));
        $paymentMethod = $validated['payment_method'];
        $paymentStatus = $paymentMethod === 'cash_on_delivery' ? 'cod_pending' : 'pending_verification';
        $status = $manualPayment ? 'payment_submitted' : 'order_recorded';
        $customStatus = $manualPayment ? 'Payment Submitted for Verification' : 'Order Recorded';

        $order = DB::transaction(function () use (
            $validated,
            $preparedItems,
            $subtotal,
            $discount,
            $deliveryCharge,
            $total,
            $paymentMethod,
            $paymentStatus,
            $status,
            $customStatus,
            $manualPayment,
            $customerId,
            $customer,
            $user,
            $promoCode,
            $promoRow
        ) {
            $order = CustomerOrder::query()->create([
                'order_no' => $this->generateOrderNo(),
                'customer_id' => $customerId,
                'user_id' => $user?->id,
                'branch_id' => (int) ($promoRow->branch_id ?? 0) ?: null,
                'status' => $status,
                'custom_status' => $customStatus,
                'payment_method' => $paymentMethod,
                'shipping_method' => $validated['shipping_method'] ?? null,
                'payment_status' => $paymentStatus,
                'transaction_id' => $manualPayment ? trim((string) $validated['transaction_id']) : null,
                'paid_amount' => $manualPayment ? (float) $validated['paid_amount'] : 0,
                'subtotal' => $subtotal,
                'discount_amount' => $discount,
                'delivery_charge' => $deliveryCharge,
                'total_amount' => $total,
                'customer_name' => $validated['customer_name'],
                'customer_phone' => $validated['customer_phone'],
                'customer_email' => $validated['customer_email'] ?? null,
                'delivery_address' => $validated['delivery_address'],
                'delivery_city' => $validated['city'],
                'delivery_district' => $validated['district'],
                'delivery_postal_code' => $validated['postal_code'] ?? null,
                'current_location' => $validated['current_location'] ?? null,
                'latitude' => $validated['latitude'] ?? null,
                'longitude' => $validated['longitude'] ?? null,
                'promo_code' => $promoCode !== '' ? $promoCode : null,
                'customer_note' => $validated['customer_note'] ?? null,
                'source' => 'website',
                'placed_at' => now(),
                'status_history' => [[
                    'status' => $status,
                    'custom_status' => $customStatus,
                    'payment_status' => $paymentStatus,
                    'changed_at' => now()->toIso8601String(),
                    'changed_by' => $user?->id,
                    'source' => 'customer',
                ]],
            ]);

            $order->items()->createMany($preparedItems);

            if (Schema::hasTable('customer_order_timeline_events')) {
                CustomerOrderTimelineEvent::query()->create([
                    'customer_order_id' => $order->id,
                    'event_type' => 'order',
                    'status' => $status,
                    'title' => $customStatus,
                    'description' => 'Order submitted from the authenticated customer checkout.',
                    'metadata' => ['payment_method' => $paymentMethod, 'shipping_method' => $validated['shipping_method'] ?? null],
                    'customer_visible' => true,
                    'created_by' => $user?->id,
                    'event_at' => now(),
                ]);
            }

            if ($promoRow && Schema::hasColumn('registration_promo_codes', 'customer_order_id')) {
                DB::table('registration_promo_codes')
                    ->where('id', $promoRow->id)
                    ->update([
                        'customer_order_id' => $order->id,
                        'order_applied_at' => now(),
                        'updated_at' => now(),
                    ]);
            }

            $customer->forceFill([
                'address' => $validated['delivery_address'],
                'current_location' => $validated['current_location'] ?? $customer->current_location,
                'latitude' => $validated['latitude'] ?? $customer->latitude,
                'longitude' => $validated['longitude'] ?? $customer->longitude,
            ])->save();

            return $order->load('items');
        });

        return response()->json([
            'status' => true,
            'message' => 'Order placed successfully.',
            'data' => $order,
        ], 201);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeStaff($request);

        $query = CustomerOrder::query()->with(['items', 'customer:id,name,phone,email', 'branch:id,name,code']);

        if ($request->filled('status')) {
            $query->where('status', $request->string('status'));
        }
        if ($request->filled('payment_status')) {
            $query->where('payment_status', $request->string('payment_status'));
        }
        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($inner) use ($search) {
                $inner->where('order_no', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%")
                    ->orWhere('transaction_id', 'like', "%{$search}%");
            });
        }

        $orders = $query->latest('id')->paginate(min(100, max(10, (int) $request->input('per_page', 30))));

        return response()->json([
            'status' => true,
            'data' => $orders,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        return response()->json([
            'status' => false,
            'message' => 'POS staff should create sales from the POS Sale module. Website customer orders are created from customer checkout.',
        ], 422);
    }

    public function show(Request $request, CustomerOrder $order): JsonResponse
    {
        $this->authorizeStaff($request);

        return response()->json([
            'status' => true,
            'data' => $order->load(['items', 'customer', 'branch:id,name,code', 'paymentReviewer:id,name']),
        ]);
    }

    public function update(Request $request, CustomerOrder $order): JsonResponse
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'max:60'],
            'custom_status' => ['nullable', 'string', 'max:190'],
            'customer_note' => ['nullable', 'string', 'max:3000'],
        ]);

        $status = $validated['status'] ?? $order->status;
        $customStatus = trim((string) ($validated['custom_status'] ?? $order->custom_status));
        $history = is_array($order->status_history) ? $order->status_history : [];
        $history[] = [
            'status' => $status,
            'custom_status' => $customStatus,
            'payment_status' => $order->payment_status,
            'changed_at' => now()->toIso8601String(),
            'changed_by' => $request->user()?->id,
            'source' => 'pos',
        ];

        $order->forceFill([
            'status' => $status,
            'custom_status' => $customStatus ?: $order->custom_status,
            'customer_note' => $validated['customer_note'] ?? $order->customer_note,
            'status_history' => $history,
        ])->save();

        return response()->json([
            'status' => true,
            'message' => 'Order status updated.',
            'data' => $order->fresh()->load('items'),
        ]);
    }

    public function reviewPayment(Request $request, CustomerOrder $order): JsonResponse
    {
        $this->authorizeStaff($request);

        $validated = $request->validate([
            'decision' => ['required', Rule::in(['approved', 'rejected'])],
            'reason' => ['nullable', 'string', 'max:2000'],
        ]);

        if (! in_array($order->payment_method, ['bkash_agent', 'nagad_agent'], true)) {
            return response()->json([
                'status' => false,
                'message' => 'Cash on Delivery orders do not require transaction verification.',
            ], 422);
        }

        $approved = $validated['decision'] === 'approved';
        $paymentStatus = $approved ? 'approved' : 'rejected';
        $status = $approved ? 'payment_approved' : 'payment_rejected';
        $customStatus = $approved ? 'Payment Verified' : 'Payment Rejected';
        $history = is_array($order->status_history) ? $order->status_history : [];
        $history[] = [
            'status' => $status,
            'custom_status' => $customStatus,
            'payment_status' => $paymentStatus,
            'changed_at' => now()->toIso8601String(),
            'changed_by' => $request->user()?->id,
            'source' => 'pos',
            'reason' => $validated['reason'] ?? null,
        ];

        $order->forceFill([
            'status' => $status,
            'custom_status' => $customStatus,
            'payment_status' => $paymentStatus,
            'payment_reviewed_by' => $request->user()?->id,
            'payment_reviewed_at' => now(),
            'payment_rejection_reason' => $approved ? null : ($validated['reason'] ?? null),
            'status_history' => $history,
        ])->save();

        return response()->json([
            'status' => true,
            'message' => $approved ? 'Payment approved.' : 'Payment rejected.',
            'data' => $order->fresh()->load('items'),
        ]);
    }

    public function confirm(Request $request, CustomerOrder $order): JsonResponse
    {
        return $this->setFixedStatus($request, $order, 'confirmed', 'Order Confirmed');
    }

    public function cancel(Request $request, CustomerOrder $order): JsonResponse
    {
        return $this->setFixedStatus($request, $order, 'cancelled', 'Order Cancelled');
    }

    public function complete(Request $request, CustomerOrder $order): JsonResponse
    {
        return $this->setFixedStatus($request, $order, 'completed', 'Order Completed');
    }

    public function destroy(Request $request, CustomerOrder $order): JsonResponse
    {
        $this->authorizeStaff($request);
        $order->delete();

        return response()->json([
            'status' => true,
            'message' => 'Order moved to Trash.',
        ]);
    }

    private function setFixedStatus(Request $request, CustomerOrder $order, string $status, string $customStatus): JsonResponse
    {
        $this->authorizeStaff($request);
        $history = is_array($order->status_history) ? $order->status_history : [];
        $history[] = [
            'status' => $status,
            'custom_status' => $customStatus,
            'payment_status' => $order->payment_status,
            'changed_at' => now()->toIso8601String(),
            'changed_by' => $request->user()?->id,
            'source' => 'pos',
        ];

        $order->forceFill([
            'status' => $status,
            'custom_status' => $customStatus,
            'status_history' => $history,
        ])->save();

        return response()->json([
            'status' => true,
            'message' => $customStatus . '.',
            'data' => $order->fresh()->load('items'),
        ]);
    }

    private function resolveCustomerId(Request $request): int
    {
        $user = $request->user();
        $customerId = (int) ($user?->customer_id ?: 0);

        if ($customerId <= 0 && $user) {
            $customerId = (int) Customer::query()->where('user_id', $user->id)->value('id');
        }

        abort_if($customerId <= 0, 403, 'Customer profile is missing for this login.');

        return $customerId;
    }

    /** A cart price is fine when it is one of the prices the storefront can show for this item. */
    private function matchesShownPrice(float $sent, float $unitPrice, Product $product, ?ProductVariant $variant): bool
    {
        $shown = [$unitPrice];
        $variantIds = $variant ? [$variant->id] : ProductVariant::query()->where('product_id', $product->id)->pluck('id')->all();
        if ($variantIds && Schema::hasTable('device_units') && Schema::hasColumn('device_units', 'selling_price')) {
            $shown = array_merge($shown, DB::table('device_units')
                ->whereIn('product_variant_id', $variantIds)
                ->whereNull('sale_id')
                ->where('selling_price', '>', 0)
                ->pluck('selling_price')->map(fn ($value) => (float) $value)->all());
        }
        if (! $variant) {
            foreach (ProductVariant::query()->where('product_id', $product->id)->get() as $row) {
                $shown[] = $this->resolvePublicPrice($product, $row);
            }
        }

        foreach ($shown as $price) {
            if (abs($sent - (float) $price) <= 0.5) {
                return true;
            }
        }

        return false;
    }

    private function resolvePublicPrice(Product $product, ?ProductVariant $variant): float
    {
        $candidates = $variant
            ? [$variant->discount_price, $variant->sale_price, $variant->regular_price]
            : [$product->discount_price, $product->sale_price, $product->regular_price];

        if ($variant) {
            $candidates[] = $product->discount_price;
            $candidates[] = $product->sale_price;
            $candidates[] = $product->regular_price;
        }

        foreach ($candidates as $candidate) {
            if ((float) $candidate > 0) {
                return round((float) $candidate, 2);
            }
        }

        return 0.0;
    }

    private function generateOrderNo(): string
    {
        do {
            $number = 'NST-WEB-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6));
        } while (CustomerOrder::query()->where('order_no', $number)->exists());

        return $number;
    }

    private function authorizeStaff(Request $request): void
    {
        $accessControl = app(AccessControlService::class);
        abort_unless(
            $accessControl->hasAnyRole($request->user(), ['super_admin', 'admin', 'accountant']),
            403,
            'Only Super Admin, Admin or Accountant can manage website orders.'
        );
    }
}
