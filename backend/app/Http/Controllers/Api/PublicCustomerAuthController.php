<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\User;
use App\Services\HCaptchaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Throwable;

class PublicCustomerAuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'email' => ['required', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:2000'],
            'registration_code' => ['required', 'string', 'max:80'],
            'password' => ['required', 'string', 'min:6', 'confirmed'],
            'hcaptcha_token' => ['nullable', 'string', 'max:5000'],
        ]);

        app(HCaptchaService::class)->verify($request, 'customer_registration');

        $phone = $this->normalizePhone($validated['phone']);
        $email = Str::lower(trim($validated['email']));
        $code = Str::upper(trim($validated['registration_code']));

        if ($this->userIdentityExists($phone, $email)) {
            return response()->json([
                'status' => false,
                'message' => 'This phone number or email is already registered. Please login.',
            ], 422);
        }

        return DB::transaction(function () use ($validated, $phone, $email, $code) {
            $promo = DB::table('registration_promo_codes')
                ->where('code', $code)
                ->lockForUpdate()
                ->first();

            if ($promo && $this->normalizePhone((string) $promo->phone) !== $phone) {
                $promo = null;
            }
            if ($problem = $this->registrationCodeProblem($promo)) {
                return response()->json(['status' => false, 'message' => $problem], 422);
            }

            if ($this->userIdentityExists($phone, $email)) {
                return response()->json([
                    'status' => false,
                    'message' => 'This phone number or email is already registered. Please login.',
                ], 422);
            }

            $customer = Customer::query()
                ->where(function ($query) use ($phone, $email) {
                    $query->whereIn('phone', $this->phoneVariants($phone))
                        ->orWhereRaw('LOWER(email) = ?', [$email]);
                })
                ->lockForUpdate()
                ->first();
            if ($customer && ! empty($customer->user_id)) {
                return response()->json([
                    'status' => false,
                    'message' => 'This customer record already has a login account. Please login.',
                ], 422);
            }

            $user = new User();
            $user->forceFill($this->filterPayload('users', [
                'name' => $validated['name'],
                'username' => $phone,
                'email' => $email,
                'phone' => $phone,
                'address' => $validated['address'] ?? null,
                'password' => Hash::make($validated['password']),
                'status' => 'active',
                'profile_type' => 'customer',
                'must_change_password' => false,
                'temporary_password' => null,
                'website_registered_at' => now(),
            ]));
            $user->save();

            if (Role::query()->where('name', 'customer')->exists() && method_exists($user, 'assignRole')) {
                $user->assignRole('customer');
            }

            $customer ??= new Customer();
            $customer->forceFill($this->filterPayload('customers', [
                'user_id' => $user->id,
                'name' => $validated['name'],
                'phone' => $phone,
                'email' => $email,
                'address' => $validated['address'] ?? null,
                'registration_promo_code' => $code,
                'status' => 'active',
                'source' => 'website_registration',
            ]));
            $customer->save();

            if (Schema::hasColumn('users', 'customer_id')) {
                $user->forceFill(['customer_id' => $customer->id])->save();
            }

            $this->consumeRegistrationCode($promo, $customer->id);

            $token = $user->createToken('customer_portal', ['customer-portal'])->plainTextToken;
            $userData = $this->userResponse($user, $customer);
            $customerData = $this->customerResponse($customer);

            return response()->json([
                'status' => true,
                'message' => 'Customer registration completed.',
                'token' => $token,
                'user' => $userData,
                'customer' => $customerData,
                'data' => [
                    'token' => $token,
                    'user' => $userData,
                    'customer' => $customerData,
                ],
            ], 201);
        });
    }

    public function login(Request $request): JsonResponse
    {
        /*
         * NST CUSTOMER LOGIN FIELD COMPATIBILITY
         *
         * Canonical API key is "login". Some customer UI revisions submit
         * the visible Phone Number field as "phone". Normalize only when
         * "login" is absent; all existing validation, password verification,
         * rate limiting, lockout and portal authorization remain unchanged.
         */
        if (! $request->filled('login')) {
            $loginAlias = $request->input('phone')
                ?? $request->input('email')
                ?? $request->input('username');

            if (is_string($loginAlias) && trim($loginAlias) !== '') {
                $request->merge(['login' => trim($loginAlias)]);
            }
        }

        $validated = $request->validate([
            'login' => ['required', 'string', 'max:255'],
            'password' => ['required', 'string', 'max:255'],
            'hcaptcha_token' => ['nullable', 'string', 'max:5000'],
        ]);

        app(HCaptchaService::class)->verify($request, 'customer_login');

        $login = trim($validated['login']);
        $normalizedPhone = $this->normalizePhone($login);
        $normalizedEmail = Str::lower($login);

        $user = User::query()
            ->where(function ($query) use ($login, $normalizedPhone, $normalizedEmail) {
                $query->where('email', $normalizedEmail)
                    ->orWhere('phone', $normalizedPhone)
                    ->orWhere('username', $normalizedPhone)
                    ->orWhere('phone', $login)
                    ->orWhere('username', $login);
            })
            ->first();

        if (! $user || ! Hash::check($validated['password'], (string) $user->password)) {
            return response()->json(['status' => false, 'message' => 'Invalid customer login credentials.'], 422);
        }

        $customer = Customer::query()->where('user_id', $user->id)->first();
        if (! $customer && Schema::hasColumn('users', 'customer_id') && $user->customer_id) {
            $customer = Customer::query()->find($user->customer_id);
        }
        if (! $customer && (! empty($user->phone) || ! empty($user->email))) {
            $customer = Customer::query()
                ->where(function ($query) use ($user) {
                    if (! empty($user->phone)) {
                        $query->whereIn('phone', $this->phoneVariants((string) $user->phone));
                    }
                    if (! empty($user->email)) {
                        $query->orWhereRaw('LOWER(email) = ?', [Str::lower((string) $user->email)]);
                    }
                })
                ->first();
        }

        if (! $this->isCustomerAccount($user, $customer)) {
            return response()->json([
                'status' => false,
                'message' => 'This account is not a customer account. POS staff must use Merchant Login.',
            ], 403);
        }

        if (isset($user->status) && ! in_array(Str::lower((string) $user->status), ['active', 'enabled'], true)) {
            return response()->json(['status' => false, 'message' => 'This customer account is inactive.'], 403);
        }

        $token = $user->createToken('customer_portal', ['customer-portal'])->plainTextToken;
        $userData = $this->userResponse($user, $customer);
        $customerData = $customer ? $this->customerResponse($customer) : null;

        return response()->json([
            'status' => true,
            'message' => 'Customer login successful.',
            'token' => $token,
            'user' => $userData,
            'customer' => $customerData,
            'data' => [
                'token' => $token,
                'user' => $userData,
                'customer' => $customerData,
            ],
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();
        if ($token && method_exists($token, 'delete')) {
            $token->delete();
        }

        return response()->json([
            'status' => true,
            'message' => 'Customer logout successful.',
        ]);
    }

    public function portalInvoicePdf(Request $request, int $saleId)
    {
        $customer = Customer::query()->where('user_id', $request->user()->id)->first();
        if (! $customer && Schema::hasColumn('users', 'customer_id') && ! empty($request->user()->customer_id)) {
            $customer = Customer::query()->find($request->user()->customer_id);
        }
        if (! $customer) {
            return response()->json(['status' => false, 'message' => 'A registered customer account is required.'], 403);
        }

        $sale = DB::table('sales')
            ->where('id', $saleId)
            ->where('customer_id', $customer->id)
            ->first();
        if (! $sale) {
            return response()->json(['status' => false, 'message' => 'Invoice not found for this customer account.'], 404);
        }

        $invoiceNo = trim((string) ($sale->invoice_no ?? $sale->sale_no ?? ''));
        if ($invoiceNo === '') {
            return response()->json(['status' => false, 'message' => 'Invoice number is unavailable.'], 404);
        }

        return redirect()->to(url('/api/invoice-public/' . rawurlencode($invoiceNo) . '/pdf'));
    }

    private function registrationCodeProblem(?object $promo): ?string
    {
        if (! $promo) {
            return 'Registration code is invalid or assigned to another phone number.';
        }

        $data = (array) $promo;
        if (($data['status'] ?? null) !== 'unused') {
            return 'Registration code has already been used or is unavailable.';
        }
        if (array_key_exists('is_active', $data) && ! (bool) $data['is_active']) {
            return 'Registration code is inactive.';
        }
        if (! empty($data['starts_at']) && Carbon::parse($data['starts_at'])->isFuture()) {
            return 'Registration code is not active yet.';
        }
        if (! empty($data['expires_at']) && Carbon::parse($data['expires_at'])->isPast()) {
            return 'Registration code has expired.';
        }
        if (isset($data['max_uses']) && $data['max_uses'] !== null && (int) ($data['used_count'] ?? 0) >= (int) $data['max_uses']) {
            return 'Registration code usage limit has been reached.';
        }

        return null;
    }

    private function consumeRegistrationCode(object $promo, int $customerId): void
    {
        $payload = [
            'status' => 'used',
            'used_customer_id' => $customerId,
            'used_at' => now(),
            'updated_at' => now(),
        ];
        if (Schema::hasColumn('registration_promo_codes', 'used_count')) {
            $payload['used_count'] = ((int) ($promo->used_count ?? 0)) + 1;
        }

        DB::table('registration_promo_codes')->where('id', $promo->id)->update($payload);
    }

    private function userIdentityExists(string $phone, string $email): bool
    {
        $phones = $this->phoneVariants($phone);
        return DB::table('users')
            ->where(function ($query) use ($phones, $email) {
                $query->whereIn('phone', $phones)
                    ->orWhereIn('username', $phones)
                    ->orWhereRaw('LOWER(email) = ?', [$email]);
            })
            ->exists();
    }

    private function isCustomerAccount(User $user, ?Customer $customer): bool
    {
        if ($customer) {
            return true;
        }
        if (Str::lower((string) ($user->profile_type ?? '')) === 'customer') {
            return true;
        }
        try {
            return method_exists($user, 'hasRole') && $user->hasRole('customer');
        } catch (Throwable) {
            return false;
        }
    }

    private function userResponse(User $user, ?Customer $customer): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'username' => $user->username ?? null,
            'phone' => $user->phone ?? null,
            'email' => $user->email ?? null,
            'customer_id' => $customer?->id,
            'profile_type' => 'customer',
            'must_change_password' => (bool) ($user->must_change_password ?? false),
            'can_access_pos' => false,
        ];
    }

    private function customerResponse(Customer $customer): array
    {
        return [
            'id' => $customer->id,
            'name' => $customer->name,
            'phone' => $customer->phone,
            'email' => $customer->email,
            'address' => $customer->address,
            'status' => $customer->status,
        ];
    }

    private function filterPayload(string $table, array $payload): array
    {
        $columns = array_flip(Schema::getColumnListing($table));
        return array_intersect_key($payload, $columns);
    }

    private function phoneVariants(string $phone): array
    {
        $normalized = $this->normalizePhone($phone);
        $variants = [$normalized, trim($phone)];
        if (str_starts_with($normalized, '0') && strlen($normalized) === 11) {
            $variants[] = '+880' . substr($normalized, 1);
            $variants[] = '880' . substr($normalized, 1);
        }
        return array_values(array_unique(array_filter($variants)));
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
}
