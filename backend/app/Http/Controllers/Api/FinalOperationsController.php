<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Setting;
use App\Models\User;
use App\Services\HCaptchaService;
use App\Services\CorporateSettingService;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;
use Spatie\Permission\Models\Role;
use Throwable;

class FinalOperationsController extends Controller
{
    public function couponTiers(): JsonResponse
    {
        return response()->json([
            'status' => true,
            'data' => DB::table('invoice_coupon_tiers')->orderBy('sort_order')->orderBy('minimum_amount')->get(),
        ]);
    }

    public function saveCouponTier(Request $request, ?int $tierId = null): JsonResponse
    {
        $this->requireSuperAdmin($request);

        $validated = $request->validate([
            'minimum_amount' => ['required', 'numeric', 'min:0'],
            'maximum_amount' => ['nullable', 'numeric', 'gte:minimum_amount'],
            'discount_amount' => ['required', 'numeric', 'min:0'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $payload = [
            'minimum_amount' => $validated['minimum_amount'],
            'maximum_amount' => $validated['maximum_amount'] ?? null,
            'discount_amount' => $validated['discount_amount'],
            'sort_order' => $validated['sort_order'] ?? 0,
            'is_active' => $validated['is_active'] ?? true,
            'updated_by' => $request->user()->id,
            'updated_at' => now(),
        ];

        if ($tierId) {
            DB::table('invoice_coupon_tiers')->where('id', $tierId)->update($payload);
        } else {
            $payload['created_by'] = $request->user()->id;
            $payload['created_at'] = now();
            $tierId = DB::table('invoice_coupon_tiers')->insertGetId($payload);
        }

        return response()->json([
            'status' => true,
            'message' => 'Coupon discount tier saved.',
            'data' => DB::table('invoice_coupon_tiers')->where('id', $tierId)->first(),
        ]);
    }

    public function deleteCouponTier(Request $request, int $tierId): JsonResponse
    {
        $this->requireSuperAdmin($request);
        DB::table('invoice_coupon_tiers')->where('id', $tierId)->delete();

        return response()->json(['status' => true, 'message' => 'Coupon discount tier deleted.']);
    }

    public function registrationPromoCodes(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'branch_manager', 'salesman']);

        $query = DB::table('registration_promo_codes')
            ->leftJoin('branches', 'branches.id', '=', 'registration_promo_codes.branch_id')
            ->leftJoin('users', 'users.id', '=', 'registration_promo_codes.generated_by')
            ->select('registration_promo_codes.*', 'branches.name as branch_name', 'users.name as generated_by_name')
            ->orderByDesc('registration_promo_codes.id');

        if ($request->filled('phone')) {
            $query->where('registration_promo_codes.phone', 'like', '%' . trim((string) $request->phone) . '%');
        }
        if ($request->filled('status')) {
            $query->where('registration_promo_codes.status', $request->status);
        }

        return response()->json(['status' => true, 'data' => $query->paginate((int) $request->get('per_page', 30))]);
    }

    public function generateRegistrationPromo(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'branch_manager', 'salesman']);

        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:50'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'purchase_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $phone = $this->normalizePhone($validated['phone']);
        $existing = DB::table('registration_promo_codes')
            ->where('phone', $phone)
            ->where('status', 'unused')
            ->first();

        if ($existing) {
            return response()->json([
                'status' => false,
                'message' => 'This phone already has an unused registration promo code.',
                'data' => $existing,
            ], 409);
        }

        $roles = $this->roleNames($request->user());
        $isAdmin = count(array_intersect($roles, ['super_admin', 'admin'])) > 0;
        $branchId = $isAdmin ? ($validated['branch_id'] ?? null) : ($request->user()->branch_id ?? null);
        $amount = (float) ($validated['purchase_amount'] ?? 0);
        $discount = $amount > 0 ? $this->discountForAmount($amount) : 0;
        $code = $this->uniqueCode('NSTREG');

        $id = DB::table('registration_promo_codes')->insertGetId([
            'code' => $code,
            'phone' => $phone,
            'branch_id' => $branchId,
            'generated_by' => $request->user()->id,
            'purchase_amount' => $amount ?: null,
            'discount_amount' => $discount,
            'status' => 'unused',
            'metadata' => json_encode(['generator_roles' => $roles], JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Registration promo code generated.',
            'data' => DB::table('registration_promo_codes')->where('id', $id)->first(),
        ], 201);
    }

    public function validateRegistrationPromo(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:80'],
            'phone' => ['required', 'string', 'max:50'],
            'purchase_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        $promo = $this->findRegistrationPromo($validated['code'], $validated['phone']);
        if ($problem = $this->registrationPromoProblem($promo)) {
            return response()->json(['status' => false, 'message' => $problem], 422);
        }

        $amount = (float) ($validated['purchase_amount'] ?? $promo->purchase_amount ?? 0);
        $discount = $amount > 0 ? $this->discountForAmount($amount) : (float) $promo->discount_amount;

        return response()->json([
            'status' => true,
            'message' => 'Registration promo code is valid and applied.',
            'data' => [
                'code' => $promo->code,
                'phone' => $promo->phone,
                'branch_id' => $promo->branch_id,
                'discount_amount' => $discount,
                'expires_at' => $promo->expires_at ?? null,
            ],
        ]);
    }

    public function consumeRegistrationPromo(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:80'],
            'phone' => ['required', 'string', 'max:50'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'purchase_amount' => ['nullable', 'numeric', 'min:0'],
        ]);

        return DB::transaction(function () use ($validated) {
            $promo = $this->findRegistrationPromo($validated['code'], $validated['phone'], true);
            if ($problem = $this->registrationPromoProblem($promo)) {
                return response()->json(['status' => false, 'message' => $problem], 409);
            }

            $amount = (float) ($validated['purchase_amount'] ?? $promo->purchase_amount ?? 0);
            $discount = $amount > 0 ? $this->discountForAmount($amount) : (float) $promo->discount_amount;
            $payload = [
                'status' => 'used',
                'used_customer_id' => $validated['customer_id'] ?? null,
                'purchase_amount' => $amount ?: null,
                'discount_amount' => $discount,
                'used_at' => now(),
                'updated_at' => now(),
            ];
            if (Schema::hasColumn('registration_promo_codes', 'used_count')) {
                $payload['used_count'] = ((int) ($promo->used_count ?? 0)) + 1;
            }
            DB::table('registration_promo_codes')->where('id', $promo->id)->update($payload);

            return response()->json([
                'status' => true,
                'message' => 'Registration promo code consumed.',
                'data' => ['discount_amount' => $discount, 'branch_id' => $promo->branch_id],
            ]);
        });
    }

    public function invoiceCouponHistory(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'accountant', 'accounts']);

        return response()->json([
            'status' => true,
            'data' => DB::table('invoice_coupon_usages')->orderByDesc('id')->paginate((int) $request->get('per_page', 30)),
        ]);
    }

    public function issueInvoiceCoupon(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'accountant', 'accounts']);

        $validated = $request->validate([
            'source_sale_id' => ['nullable', 'integer', 'exists:sales,id'],
            'source_invoice_no' => ['required_without:source_sale_id', 'nullable', 'string', 'max:120'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'source_amount' => ['required', 'numeric', 'min:0'],
        ]);

        $duplicate = DB::table('invoice_coupon_usages')
            ->where(function ($query) use ($validated) {
                if (! empty($validated['source_sale_id'])) {
                    $query->where('source_sale_id', $validated['source_sale_id']);
                }
                if (! empty($validated['source_invoice_no'])) {
                    $query->orWhere('source_invoice_no', $validated['source_invoice_no']);
                }
            })
            ->exists();

        if ($duplicate) {
            return response()->json(['status' => false, 'message' => 'This source invoice already generated a coupon.'], 409);
        }

        $code = $this->uniqueCode('NSTINV');
        $discount = $this->discountForAmount((float) $validated['source_amount']);
        $id = DB::table('invoice_coupon_usages')->insertGetId([
            'coupon_code' => $code,
            'source_sale_id' => $validated['source_sale_id'] ?? null,
            'source_invoice_no' => $validated['source_invoice_no'] ?? null,
            'customer_phone' => isset($validated['customer_phone']) ? $this->normalizePhone($validated['customer_phone']) : null,
            'source_amount' => $validated['source_amount'],
            'discount_amount' => $discount,
            'status' => 'issued',
            'issued_by' => $request->user()->id,
            'issued_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Invoice coupon issued.',
            'data' => DB::table('invoice_coupon_usages')->where('id', $id)->first(),
        ], 201);
    }

    public function useInvoiceCoupon(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'coupon_code' => ['required', 'string', 'max:80'],
            'used_sale_id' => ['nullable', 'integer', 'exists:sales,id'],
            'used_invoice_no' => ['required_without:used_sale_id', 'nullable', 'string', 'max:120'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
        ]);

        return DB::transaction(function () use ($request, $validated) {
            $coupon = DB::table('invoice_coupon_usages')
                ->where('coupon_code', strtoupper(trim($validated['coupon_code'])))
                ->lockForUpdate()
                ->first();

            if (! $coupon || $coupon->status !== 'issued') {
                return response()->json(['status' => false, 'message' => 'Coupon is invalid or already used.'], 409);
            }

            $invoiceAlreadyUsed = DB::table('invoice_coupon_usages')
                ->where(function ($query) use ($validated) {
                    if (! empty($validated['used_sale_id'])) {
                        $query->where('used_sale_id', $validated['used_sale_id']);
                    }
                    if (! empty($validated['used_invoice_no'])) {
                        $query->orWhere('used_invoice_no', $validated['used_invoice_no']);
                    }
                })
                ->exists();

            if ($invoiceAlreadyUsed) {
                return response()->json(['status' => false, 'message' => 'This invoice already used a coupon and cannot generate or use another.'], 409);
            }

            DB::table('invoice_coupon_usages')->where('id', $coupon->id)->update([
                'used_sale_id' => $validated['used_sale_id'] ?? null,
                'used_invoice_no' => $validated['used_invoice_no'] ?? null,
                'customer_phone' => isset($validated['customer_phone']) ? $this->normalizePhone($validated['customer_phone']) : $coupon->customer_phone,
                'status' => 'used',
                'used_by' => $request->user()?->id,
                'used_at' => now(),
                'updated_at' => now(),
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Invoice coupon applied.',
                'data' => ['discount_amount' => (float) $coupon->discount_amount],
            ]);
        });
    }


    public function checkoutRegister(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:255'],
            'address' => ['required', 'string', 'max:2000'],
            'current_location' => ['nullable', 'string', 'max:255'],
            'latitude' => ['nullable', 'numeric', 'between:-90,90'],
            'longitude' => ['nullable', 'numeric', 'between:-180,180'],
            'registration_promo_code' => ['required', 'string', 'max:80'],
            'purchase_amount' => ['nullable', 'numeric', 'min:0'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
            'hcaptcha_token' => ['nullable', 'string', 'max:5000'],
        ]);

        app(HCaptchaService::class)->verify($request, 'checkout_registration');

        $phone = $this->normalizePhone($validated['phone']);

        if (User::query()->where('phone', $phone)->orWhere('username', $phone)->exists()) {
            return response()->json(['status' => false, 'message' => 'This phone number is already registered. Please login.'], 422);
        }
        if (User::query()->where('email', strtolower($validated['email']))->exists()) {
            return response()->json(['status' => false, 'message' => 'This email address is already registered. Please login.'], 422);
        }

        return DB::transaction(function () use ($validated, $phone) {
            $promo = $this->findRegistrationPromo($validated['registration_promo_code'], $phone, true);
            if ($problem = $this->registrationPromoProblem($promo)) {
                return response()->json(['status' => false, 'message' => $problem], 422);
            }

            $amount = (float) ($validated['purchase_amount'] ?? $promo->purchase_amount ?? 0);
            $discount = $amount > 0 ? $this->discountForAmount($amount) : (float) $promo->discount_amount;

            $userPayload = [
                'name' => $validated['name'],
                'username' => $phone,
                'email' => strtolower($validated['email']),
                'phone' => $phone,
                'password' => Hash::make($validated['password']),
                'status' => 'active',
                'profile_type' => 'customer',
                'must_change_password' => false,
                'temporary_password' => null,
                'website_registered_at' => now(),
            ];
            if (Schema::hasColumn('users', 'address')) $userPayload['address'] = $validated['address'];
            $user = User::create($userPayload);

            if (Role::query()->where('name', 'customer')->exists()) {
                $user->assignRole('customer');
            }

            $customerPayload = [
                'user_id' => $user->id,
                'name' => $validated['name'],
                'phone' => $phone,
                'email' => strtolower($validated['email']),
                'address' => $validated['address'],
                'status' => 'active',
                'source' => 'checkout_registration',
            ];
            foreach (['current_location', 'latitude', 'longitude', 'registration_promo_code'] as $column) {
                if (Schema::hasColumn('customers', $column)) {
                    $customerPayload[$column] = $column === 'registration_promo_code'
                        ? strtoupper(trim($validated['registration_promo_code']))
                        : ($validated[$column] ?? null);
                }
            }
            $customer = Customer::create($customerPayload);
            if (Schema::hasColumn('users', 'customer_id')) {
                $user->forceFill(['customer_id' => $customer->id])->save();
            }

            $promoUpdate = [
                'status' => 'used',
                'used_customer_id' => $customer->id,
                'purchase_amount' => $validated['purchase_amount'] ?? $promo->purchase_amount,
                'discount_amount' => $discount,
                'used_at' => now(),
                'updated_at' => now(),
            ];
            if (Schema::hasColumn('registration_promo_codes', 'used_count')) {
                $promoUpdate['used_count'] = ((int) ($promo->used_count ?? 0)) + 1;
            }
            DB::table('registration_promo_codes')->where('id', $promo->id)->update($promoUpdate);

            $token = $user->createToken('customer_checkout', ['customer-portal'])->plainTextToken;
            return response()->json([
                'status' => true,
                'message' => 'Registration completed and checkout login created.',
                'data' => [
                    'token' => $token,
                    'user' => [
                        'id' => $user->id,
                        'name' => $user->name,
                        'phone' => $user->phone,
                        'email' => $user->email,
                        'customer_id' => $customer->id,
                        'must_change_password' => false,
                    ],
                    'discount_amount' => $discount,
                    'automatic_checkout_login' => true,
                    'first_manual_login_requires_password_change' => false,
                    'access' => ['can_access_pos' => false, 'portal' => 'customer'],
                ],
            ], 201);
        });
    }

    public function publicPaymentOptions(): JsonResponse
    {
        $settings = app(CorporateSettingService::class)->section('payments');
        $gatewayManager = app(\App\Services\PaymentGatewayManagerService::class);

        $options = [
            [
                'key' => 'cash_on_delivery',
                'label' => 'Cash on Delivery',
                'enabled' => (bool) ($settings['cash_on_delivery_enabled'] ?? true),
                'requires_transaction_id' => false,
                'agent_number' => null,
                'online' => false,
            ],
            [
                'key' => 'bkash_agent',
                'label' => 'bKash Agent Cash-out',
                'enabled' => (bool) ($settings['bkash_agent_enabled'] ?? true),
                'requires_transaction_id' => true,
                'agent_number' => trim((string) ($settings['bkash_agent_number'] ?? '')),
                'online' => false,
            ],
            [
                'key' => 'nagad_agent',
                'label' => 'Nagad Agent Cash-out',
                'enabled' => (bool) ($settings['nagad_agent_enabled'] ?? true),
                'requires_transaction_id' => true,
                'agent_number' => trim((string) ($settings['nagad_agent_number'] ?? '')),
                'online' => false,
            ],
        ];

        foreach ($gatewayManager->publicProviders() as $gateway) {
            $options[] = $gateway;
        }

        $online = array_values(array_filter($options, fn (array $item) => ($item['online'] ?? false) && ($item['enabled'] ?? false)));

        return response()->json([
            'status' => true,
            'data' => [
                'default_method' => $settings['default_method'] ?? 'cash_on_delivery',
                'online_gateway_enabled' => count($online) > 0,
                'online_gateway_mode' => $settings['online_gateway_mode'] ?? 'managed',
                'instructions' => $settings['manual_payment_instructions'] ?? '',
                'options' => $options,
            ],
        ]);
    }

    public function publicExternalPreorderStore(Request $request): JsonResponse
    {
        $request->merge([
            'customer_phone' => $request->input('customer_phone', $request->input('phone')),
            'customer_email' => $request->input('customer_email', $request->input('email')),
            'payment_method' => $request->input('payment_method', 'cash_on_delivery'),
        ]);

        $manualPayment = in_array($request->input('payment_method'), ['bkash_agent', 'nagad_agent'], true);
        $validated = $request->validate([
            'customer_name' => ['required', 'string', 'max:255'],
            'customer_phone' => ['required', 'string', 'max:50'],
            'customer_email' => ['required', 'email', 'max:255'],
            'product_name' => ['required', 'string', 'max:500'],
            'product_link' => ['required', 'url', 'max:2000'],
            'product_image' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
            'product_image_url' => ['nullable', 'url', 'max:2000'],
            'customer_note' => ['nullable', 'string', 'max:3000'],
            'requested_amount' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => [$manualPayment ? 'required' : 'nullable', 'numeric', $manualPayment ? 'min:0.01' : 'min:0'],
            'payment_method' => ['required', Rule::in(['cash_on_delivery', 'bkash_agent', 'nagad_agent'])],
            'transaction_id' => [$manualPayment ? 'required' : 'nullable', 'string', 'max:190'],
        ]);

        $paymentSettings = app(CorporateSettingService::class)->section('payments');
        $enabledKey = $validated['payment_method'] . '_enabled';
        if (array_key_exists($enabledKey, $paymentSettings) && ! (bool) $paymentSettings[$enabledKey]) {
            return response()->json(['status' => false, 'message' => 'The selected payment method is currently disabled.'], 422);
        }

        if (! $request->hasFile('product_image') && empty($validated['product_image_url'])) {
            return response()->json(['status' => false, 'message' => 'Upload one product image or provide an image URL.'], 422);
        }

        if ($manualPayment && Schema::hasColumn('external_preorders', 'transaction_id')) {
            $duplicate = DB::table('external_preorders')
                ->where('transaction_id', trim((string) $validated['transaction_id']))
                ->exists();
            if ($duplicate) {
                return response()->json([
                    'status' => false,
                    'message' => 'This transaction ID has already been submitted.',
                ], 422);
            }
        }

        try {
            $imagePath = $request->hasFile('product_image')
                ? $request->file('product_image')->store('external-preorders', 'public')
                : $this->copyRemoteImageToMedia((string) $validated['product_image_url']);
        } catch (Throwable $exception) {
            return response()->json(['status' => false, 'message' => $exception->getMessage()], 422);
        }

        $preorderNo = 'NST-EXT-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6));
        $paymentMethod = $validated['payment_method'];
        $paymentStatus = $paymentMethod === 'cash_on_delivery' ? 'cod_pending' : 'pending_verification';
        $initialStatus = $manualPayment ? 'payment_submitted' : 'order_recorded';
        $initialCustomStatus = $manualPayment ? 'Payment Submitted for Verification' : 'Order Recorded';
        $history = [[
            'status' => $initialStatus,
            'custom_status' => $initialCustomStatus,
            'payment_status' => $paymentStatus,
            'changed_at' => now()->toIso8601String(),
            'changed_by' => $request->user()?->id,
            'source' => 'customer',
        ]];

        $payload = [
            'preorder_no' => $preorderNo,
            'customer_id' => $request->user()?->customer_id,
            'customer_name' => $validated['customer_name'],
            'customer_phone' => $this->normalizePhone($validated['customer_phone']),
            'customer_email' => Str::lower($validated['customer_email']),
            'product_name' => $validated['product_name'],
            'product_link' => $validated['product_link'],
            'product_image_path' => $imagePath,
            'product_image_source_url' => $validated['product_image_url'] ?? null,
            'requested_amount' => $validated['requested_amount'] ?? 0,
            'paid_amount' => $validated['paid_amount'] ?? 0,
            'status' => $initialStatus,
            'custom_status' => $initialCustomStatus,
            'payment_method' => $paymentMethod,
            'transaction_id' => $manualPayment ? trim((string) $validated['transaction_id']) : null,
            'payment_status' => $paymentStatus,
            'payment_submitted_at' => $manualPayment ? now() : null,
            'status_history' => json_encode($history, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'customer_note' => $validated['customer_note'] ?? null,
            'metadata' => json_encode([
                'ip' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'payment_gateway_mode' => 'manual_verification',
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'created_by' => $request->user()?->id,
            'created_at' => now(),
            'updated_at' => now(),
        ];

        $id = DB::table('external_preorders')->insertGetId($this->filterTableColumns('external_preorders', $payload));

        return response()->json([
            'status' => true,
            'message' => $manualPayment
                ? 'Preorder recorded. Your agent payment is pending staff verification.'
                : 'Preorder recorded with Cash on Delivery.',
            'data' => $this->formatExternalPreorder(DB::table('external_preorders')->where('id', $id)->first()),
        ], 201);
    }

    public function externalPreorders(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'accountant', 'accounts']);
        $query = DB::table('external_preorders')->orderByDesc('id');
        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('payment_status') && Schema::hasColumn('external_preorders', 'payment_status')) {
            $query->where('payment_status', $request->payment_status);
        }

        $page = $query->paginate(max(5, min(100, (int) $request->get('per_page', 30))));
        $page->getCollection()->transform(fn ($row) => $this->formatExternalPreorder($row));

        return response()->json(['status' => true, 'data' => $page]);
    }

    public function updateExternalPreorder(Request $request, int $preorderId): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'accountant', 'accounts']);
        $row = DB::table('external_preorders')->where('id', $preorderId)->first();
        if (! $row) {
            return response()->json(['status' => false, 'message' => 'External preorder not found.'], 404);
        }

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'max:60'],
            'custom_status' => ['nullable', 'string', 'max:120'],
            'requested_amount' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'assigned_to' => ['nullable', 'integer', 'exists:users,id'],
            'admin_note' => ['nullable', 'string', 'max:3000'],
        ]);

        $payload = $validated;
        $payload['updated_by'] = $request->user()->id;
        $payload['updated_at'] = now();
        $payload['status_history'] = $this->appendPreorderHistory($row, [
            'status' => $validated['status'] ?? ($row->status ?? null),
            'custom_status' => $validated['custom_status'] ?? ($row->custom_status ?? null),
            'payment_status' => $row->payment_status ?? null,
            'changed_at' => now()->toIso8601String(),
            'changed_by' => $request->user()->id,
            'source' => 'staff',
        ]);

        DB::table('external_preorders')->where('id', $preorderId)->update($this->filterTableColumns('external_preorders', $payload));

        return response()->json([
            'status' => true,
            'message' => 'External preorder updated.',
            'data' => $this->formatExternalPreorder(DB::table('external_preorders')->where('id', $preorderId)->first()),
        ]);
    }

    public function reviewExternalPreorderPayment(Request $request, int $preorderId): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'accountant', 'accounts']);
        $row = DB::table('external_preorders')->where('id', $preorderId)->first();
        if (! $row) {
            return response()->json(['status' => false, 'message' => 'External preorder not found.'], 404);
        }

        $validated = $request->validate([
            'action' => ['required', Rule::in(['approve', 'reject'])],
            'reason' => ['nullable', 'string', 'max:1000'],
            'custom_status' => ['nullable', 'string', 'max:120'],
        ]);

        $approve = $validated['action'] === 'approve';
        if ($approve && in_array($row->payment_method ?? '', ['bkash_agent', 'nagad_agent'], true) && empty($row->transaction_id)) {
            return response()->json(['status' => false, 'message' => 'A transaction ID is required before approval.'], 422);
        }

        $payload = [
            'payment_status' => $approve ? 'approved' : 'rejected',
            'payment_verified_at' => now(),
            'payment_verified_by' => $request->user()->id,
            'payment_rejection_reason' => $approve ? null : ($validated['reason'] ?? 'Rejected by staff.'),
            'status' => $approve ? 'payment_approved' : ($row->status ?? 'order_recorded'),
            'custom_status' => $validated['custom_status'] ?? ($approve ? 'Payment Approved' : 'Payment Rejected'),
            'updated_by' => $request->user()->id,
            'updated_at' => now(),
        ];
        $payload['status_history'] = $this->appendPreorderHistory($row, [
            'status' => $payload['status'],
            'custom_status' => $payload['custom_status'],
            'payment_status' => $payload['payment_status'],
            'reason' => $payload['payment_rejection_reason'],
            'changed_at' => now()->toIso8601String(),
            'changed_by' => $request->user()->id,
            'source' => 'payment_review',
        ]);

        DB::table('external_preorders')->where('id', $preorderId)->update($this->filterTableColumns('external_preorders', $payload));

        return response()->json([
            'status' => true,
            'message' => $approve ? 'Payment approved.' : 'Payment rejected.',
            'data' => $this->formatExternalPreorder(DB::table('external_preorders')->where('id', $preorderId)->first()),
        ]);
    }

    public function securitySettings(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin']);
        return response()->json([
            'status' => true,
            'data' => [
                'alert_email' => Setting::getValue('security_alert_email', ''),
                'high_critical_email_enabled' => (bool) Setting::getValue('security_high_critical_email_enabled', true),
                'hcaptcha_enabled' => filter_var(Setting::getValue('hcaptcha_enabled', false), FILTER_VALIDATE_BOOLEAN),
                'hcaptcha_site_key' => (string) Setting::getValue('hcaptcha_site_key', ''),
                'hcaptcha_secret_configured' => app(HCaptchaService::class)->secretConfigured(),
                'hcaptcha_test_mode' => filter_var(Setting::getValue('hcaptcha_test_mode', false), FILTER_VALIDATE_BOOLEAN),
                'hcaptcha_customer_login' => filter_var(Setting::getValue('hcaptcha_customer_login', true), FILTER_VALIDATE_BOOLEAN),
                'hcaptcha_customer_registration' => filter_var(Setting::getValue('hcaptcha_customer_registration', true), FILTER_VALIDATE_BOOLEAN),
                'hcaptcha_checkout_registration' => filter_var(Setting::getValue('hcaptcha_checkout_registration', true), FILTER_VALIDATE_BOOLEAN),
                'hcaptcha_supplier_login' => filter_var(Setting::getValue('hcaptcha_supplier_login', true), FILTER_VALIDATE_BOOLEAN),
                'hcaptcha_admin_login' => filter_var(Setting::getValue('hcaptcha_admin_login', false), FILTER_VALIDATE_BOOLEAN),
            ],
        ]);
    }

    public function saveSecuritySettings(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        $validated = $request->validate([
            'alert_email' => ['nullable', 'email', 'max:255'],
            'high_critical_email_enabled' => ['nullable', 'boolean'],
            'hcaptcha_enabled' => ['nullable', 'boolean'],
            'hcaptcha_site_key' => ['nullable', 'string', 'max:255'],
            'hcaptcha_secret_key' => ['nullable', 'string', 'max:500'],
            'hcaptcha_clear_secret' => ['nullable', 'boolean'],
            'hcaptcha_test_mode' => ['nullable', 'boolean'],
            'hcaptcha_customer_login' => ['nullable', 'boolean'],
            'hcaptcha_customer_registration' => ['nullable', 'boolean'],
            'hcaptcha_checkout_registration' => ['nullable', 'boolean'],
            'hcaptcha_supplier_login' => ['nullable', 'boolean'],
            'hcaptcha_admin_login' => ['nullable', 'boolean'],
        ]);

        $testMode = (bool) ($validated['hcaptcha_test_mode'] ?? false);
        $enabled = (bool) ($validated['hcaptcha_enabled'] ?? false);
        $siteKey = trim((string) ($validated['hcaptcha_site_key'] ?? ''));
        $newSecret = trim((string) ($validated['hcaptcha_secret_key'] ?? ''));
        $clearSecret = (bool) ($validated['hcaptcha_clear_secret'] ?? false);
        $secretConfigured = app(HCaptchaService::class)->secretConfigured();

        if ($enabled && ! $testMode && ($siteKey === '' || (! $secretConfigured && $newSecret === '') || $clearSecret)) {
            return response()->json([
                'status' => false,
                'message' => 'A production hCaptcha site key and secret key are required before enabling protection.',
            ], 422);
        }

        Setting::setValue('security_alert_email', $validated['alert_email'] ?? '', 'security');
        Setting::setValue('security_high_critical_email_enabled', (bool) ($validated['high_critical_email_enabled'] ?? true), 'security', 'boolean');
        Setting::setValue('hcaptcha_enabled', $enabled, 'security', 'boolean');
        Setting::setValue('hcaptcha_site_key', $siteKey, 'security');
        Setting::setValue('hcaptcha_test_mode', $testMode, 'security', 'boolean');
        Setting::setValue('hcaptcha_customer_login', (bool) ($validated['hcaptcha_customer_login'] ?? true), 'security', 'boolean');
        Setting::setValue('hcaptcha_customer_registration', (bool) ($validated['hcaptcha_customer_registration'] ?? true), 'security', 'boolean');
        Setting::setValue('hcaptcha_checkout_registration', (bool) ($validated['hcaptcha_checkout_registration'] ?? true), 'security', 'boolean');
        Setting::setValue('hcaptcha_supplier_login', (bool) ($validated['hcaptcha_supplier_login'] ?? true), 'security', 'boolean');
        Setting::setValue('hcaptcha_admin_login', (bool) ($validated['hcaptcha_admin_login'] ?? false), 'security', 'boolean');

        if ($clearSecret) {
            Setting::setValue('hcaptcha_secret_key', '', 'security', 'encrypted');
        } elseif ($newSecret !== '') {
            Setting::setValue('hcaptcha_secret_key', Crypt::encryptString($newSecret), 'security', 'encrypted');
        }

        return response()->json(['status' => true, 'message' => 'Security and hCaptcha settings saved.']);
    }

    public function securityEvents(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin']);
        $query = DB::table('security_events')->orderByDesc('id');
        foreach (['severity', 'status', 'event_type'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, $request->{$filter});
            }
        }

        return response()->json(['status' => true, 'data' => $query->paginate((int) $request->get('per_page', 50))]);
    }

    public function reportSecurityEvent(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'event_type' => ['required', 'string', 'max:120'],
            'severity' => ['required', Rule::in(['low', 'medium', 'high', 'critical'])],
            'status' => ['nullable', Rule::in(['open', 'blocked', 'resolved', 'ignored'])],
            'response_code' => ['nullable', 'integer', 'min:100', 'max:599'],
            'details' => ['nullable', 'array'],
        ]);

        $user = $request->user();
        $id = DB::table('security_events')->insertGetId([
            'user_id' => $user?->id,
            'user_name' => $user?->name,
            'role_name' => implode(',', $this->roleNames($user)),
            'event_type' => $validated['event_type'],
            'severity' => $validated['severity'],
            'status' => $validated['status'] ?? 'open',
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'url' => $request->fullUrl(),
            'request_method' => $request->method(),
            'response_code' => $validated['response_code'] ?? null,
            'sanitized_details' => json_encode($this->sanitizeDetails($validated['details'] ?? []), JSON_UNESCAPED_UNICODE),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['status' => true, 'message' => 'Security event recorded.', 'data' => ['id' => $id]], 201);
    }

    public function resolveSecurityEvent(Request $request, int $eventId): JsonResponse
    {
        $this->requireSuperAdmin($request);
        DB::table('security_events')->where('id', $eventId)->update([
            'status' => 'resolved',
            'resolved_at' => now(),
            'resolved_by' => $request->user()->id,
            'updated_at' => now(),
        ]);

        return response()->json(['status' => true, 'message' => 'Security event resolved.']);
    }

    public function nidVerifications(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'branch_manager']);
        return response()->json([
            'status' => true,
            'data' => DB::table('nid_verification_logs')->orderByDesc('id')->paginate((int) $request->get('per_page', 30)),
        ]);
    }

    public function storeNidVerification(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'branch_manager']);
        $validated = $request->validate([
            'nid_number' => ['required', 'string', 'max:40'],
            'date_of_birth' => ['required', 'date'],
            'short_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $id = DB::table('nid_verification_logs')->insertGetId([
            'nid_number' => preg_replace('/\s+/', '', $validated['nid_number']),
            'date_of_birth' => $validated['date_of_birth'],
            'status' => 'recorded',
            'api_response' => json_encode(['integration' => 'pending', 'message' => 'NID API integration will be connected later.'], JSON_UNESCAPED_UNICODE),
            'short_note' => $validated['short_note'] ?? null,
            'checked_by' => $request->user()->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['status' => true, 'message' => 'NID verification check recorded.', 'data' => ['id' => $id]], 201);
    }

    public function smsSettings(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'accountant', 'accounts']);
        $row = DB::table('sms_provider_settings')->first();

        return response()->json([
            'status' => true,
            'data' => $row ? [
                'id' => $row->id,
                'provider_name' => $row->provider_name,
                'sender_id' => $row->sender_id,
                'api_url' => $row->api_url,
                'api_key_masked' => $row->api_key ? '••••••••' . substr($this->decryptSafe($row->api_key), -4) : '',
                'request_headers' => $this->decodeJson($row->request_headers),
                'request_parameters' => $this->decodeJson($row->request_parameters),
                'is_active' => (bool) $row->is_active,
                'last_known_balance' => $row->last_known_balance,
                'balance_checked_at' => $row->balance_checked_at,
            ] : null,
        ]);
    }

    public function saveSmsSettings(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        $validated = $request->validate([
            'provider_name' => ['required', 'string', 'max:190'],
            'sender_id' => ['nullable', 'string', 'max:100'],
            'api_url' => ['nullable', 'url', 'max:2000'],
            'api_key' => ['nullable', 'string', 'max:4000'],
            'request_headers' => ['nullable', 'array'],
            'request_parameters' => ['nullable', 'array'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $existing = DB::table('sms_provider_settings')->first();
        $payload = [
            'provider_name' => $validated['provider_name'],
            'sender_id' => $validated['sender_id'] ?? null,
            'api_url' => $validated['api_url'] ?? null,
            'request_headers' => json_encode($validated['request_headers'] ?? [], JSON_UNESCAPED_UNICODE),
            'request_parameters' => json_encode($validated['request_parameters'] ?? [], JSON_UNESCAPED_UNICODE),
            'is_active' => $validated['is_active'] ?? false,
            'updated_by' => $request->user()->id,
            'updated_at' => now(),
        ];
        if (! empty($validated['api_key'])) {
            $payload['api_key'] = Crypt::encryptString($validated['api_key']);
        }

        if ($existing) {
            DB::table('sms_provider_settings')->where('id', $existing->id)->update($payload);
        } else {
            $payload['created_at'] = now();
            DB::table('sms_provider_settings')->insert($payload);
        }

        return response()->json(['status' => true, 'message' => 'SMS provider settings saved securely.']);
    }

    public function smsTemplates(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'accountant', 'accounts']);
        return response()->json(['status' => true, 'data' => DB::table('sms_message_templates')->orderBy('name')->get()]);
    }

    public function saveSmsTemplate(Request $request, ?int $templateId = null): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin']);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:190'],
            'purpose' => ['nullable', 'string', 'max:100'],
            'message' => ['required', 'string', 'max:3000'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $payload = [
            ...$validated,
            'is_active' => $validated['is_active'] ?? true,
            'updated_by' => $request->user()->id,
            'updated_at' => now(),
        ];

        if ($templateId) {
            DB::table('sms_message_templates')->where('id', $templateId)->update($payload);
        } else {
            $payload['created_by'] = $request->user()->id;
            $payload['created_at'] = now();
            $templateId = DB::table('sms_message_templates')->insertGetId($payload);
        }

        return response()->json(['status' => true, 'message' => 'SMS template saved.', 'data' => DB::table('sms_message_templates')->where('id', $templateId)->first()]);
    }

    private function findRegistrationPromo(string $code, string $phone, bool $lock = false): ?object
    {
        $query = DB::table('registration_promo_codes')
            ->where('code', strtoupper(trim($code)));
        if ($lock) {
            $query->lockForUpdate();
        }
        $promo = $query->first();
        if ($promo && $this->normalizePhone((string) $promo->phone) !== $this->normalizePhone($phone)) {
            return null;
        }
        return $promo;
    }

    private function registrationPromoProblem(?object $promo): ?string
    {
        if (! $promo) {
            return 'Registration promo code is invalid or assigned to another phone number.';
        }
        $data = (array) $promo;
        if (($data['status'] ?? null) !== 'unused') {
            return 'Registration promo code has already been used or is unavailable.';
        }
        if (array_key_exists('is_active', $data) && ! (bool) $data['is_active']) {
            return 'Registration promo code is inactive.';
        }
        try {
            if (! empty($data['starts_at']) && Carbon::parse($data['starts_at'])->isFuture()) {
                return 'Registration promo code is not active yet.';
            }
            if (! empty($data['expires_at']) && Carbon::parse($data['expires_at'])->isPast()) {
                return 'Registration promo code has expired.';
            }
        } catch (Throwable) {
            return 'Registration promo code lifecycle data is invalid.';
        }
        if (isset($data['max_uses']) && $data['max_uses'] !== null && (int) ($data['used_count'] ?? 0) >= (int) $data['max_uses']) {
            return 'Registration promo code usage limit has been reached.';
        }
        return null;
    }

    private function discountForAmount(float $amount): float
    {
        $tier = DB::table('invoice_coupon_tiers')
            ->where('is_active', true)
            ->where('minimum_amount', '<=', $amount)
            ->where(function ($query) use ($amount) {
                $query->whereNull('maximum_amount')->orWhere('maximum_amount', '>=', $amount);
            })
            ->orderByDesc('minimum_amount')
            ->first();

        return (float) ($tier->discount_amount ?? 0);
    }

    private function uniqueCode(string $prefix): string
    {
        do {
            $code = $prefix . '-' . strtoupper(Str::random(8));
            $exists = DB::table('registration_promo_codes')->where('code', $code)->exists()
                || DB::table('invoice_coupon_usages')->where('coupon_code', $code)->exists();
        } while ($exists);

        return $code;
    }

    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', trim($phone)) ?: trim($phone);
        if (str_starts_with($digits, '880')) {
            return '0' . substr($digits, 3);
        }
        if (strlen($digits) === 10 && str_starts_with($digits, '1')) {
            return '0' . $digits;
        }
        return $digits;
    }

    private function requireSuperAdmin(Request $request): void
    {
        $this->requireRoles($request, ['super_admin']);
    }

    private function requireRoles(Request $request, array $allowed): void
    {
        $roles = $this->roleNames($request->user());
        if (count(array_intersect($roles, $allowed)) === 0) {
            abort(response()->json(['status' => false, 'message' => 'You do not have permission for this operation.'], 403));
        }
    }

    private function roleNames($user): array
    {
        if (! $user) {
            return [];
        }

        $roles = [];
        if (method_exists($user, 'getRoleNames')) {
            $roles = $user->getRoleNames()->all();
        }
        foreach (['role', 'user_type', 'type', 'profile_type'] as $field) {
            if (! empty($user->{$field})) {
                $roles[] = $user->{$field};
            }
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($role) => preg_replace('/[^a-z0-9]+/', '_', strtolower(trim((string) $role))),
            $roles
        ))));
    }

    private function copyRemoteImageToMedia(string $url): string
    {
        $parts = parse_url($url);
        if (($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])) {
            throw new RuntimeException('Remote image URL must use HTTPS.');
        }

        $resolved = gethostbyname($parts['host']);
        if (! filter_var($resolved, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw new RuntimeException('Remote image host is not allowed.');
        }

        try {
            $response = Http::timeout(12)->withHeaders(['Accept' => 'image/jpeg,image/png,image/webp'])->get($url);
        } catch (ConnectionException) {
            throw new RuntimeException('Remote image could not be downloaded.');
        }

        if (! $response->successful()) {
            throw new RuntimeException('Remote image download failed.');
        }

        $content = $response->body();
        if (strlen($content) > 10 * 1024 * 1024) {
            throw new RuntimeException('Remote image exceeds 10 MB.');
        }

        $mime = strtolower((string) $response->header('Content-Type'));
        $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
        $extension = $extensions[strtok($mime, ';')] ?? null;
        if (! $extension) {
            throw new RuntimeException('Remote image must be JPG, JPEG, PNG or WebP.');
        }

        $path = 'external-preorders/' . Str::uuid() . '.' . $extension;
        Storage::disk('public')->put($path, $content);

        return $path;
    }

    private function filterTableColumns(string $table, array $payload): array
    {
        $columns = array_flip(Schema::getColumnListing($table));
        return array_intersect_key($payload, $columns);
    }

    private function appendPreorderHistory(object $row, array $entry): string
    {
        $history = $this->decodeJson($row->status_history ?? null);
        $history[] = $entry;
        return json_encode(array_slice($history, -100), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]';
    }

    private function formatExternalPreorder(?object $row): ?array
    {
        if (! $row) {
            return null;
        }

        $data = (array) $row;
        $data['status_history'] = $this->decodeJson($row->status_history ?? null);
        $data['product_image_url'] = $row->product_image_path
            ? url('/storage/' . ltrim($row->product_image_path, '/'))
            : null;

        return $data;
    }

    private function sanitizeDetails(array $details): array
    {
        $blocked = ['password', 'password_confirmation', 'token', 'authorization', 'api_key', 'secret', 'recovery_codes'];
        foreach ($details as $key => $value) {
            if (in_array(strtolower((string) $key), $blocked, true)) {
                $details[$key] = '[redacted]';
            } elseif (is_array($value)) {
                $details[$key] = $this->sanitizeDetails($value);
            }
        }

        return $details;
    }

    private function decodeJson($value): array
    {
        if (is_array($value)) {
            return $value;
        }
        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function decryptSafe(?string $value): string
    {
        if (! $value) {
            return '';
        }
        try {
            return Crypt::decryptString($value);
        } catch (Throwable) {
            return '';
        }
    }
}
