<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use App\Services\AccessControlService;
use Spatie\Permission\Models\Role;

class CustomerController extends Controller
{
    public function index(Request $request)
    {
        $query = Customer::with('user:id,name,username,email,phone,status,profile_type,must_change_password,temporary_password')
            ->withCount('usedPurchases')
            ->latest();

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('nid_number', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $customers = $query->paginate((int) $request->get('per_page', 20));
        $accessControl = app(AccessControlService::class);

        if (! $accessControl->canViewCustomerDatabase($request->user())) {
            $customers->getCollection()->transform(function ($customer) {
                return [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'phone' => $customer->phone,
                    'email' => $customer->email,
                    'status' => $customer->status,
                ];
            });
        }

        return response()->json([
            'status' => true,
            'message' => 'Customers loaded successfully.',
            'data' => $customers,
        ]);
    }

    public function store(Request $request)
    {
        $validated = $this->validateCustomer($request);

        $validated['opening_balance'] = $validated['opening_balance'] ?? 0;
        $validated['current_balance'] = $validated['current_balance'] ?? $validated['opening_balance'];

        if (auth()->check()) {
            $validated['created_by'] = auth()->id();
            $validated['updated_by'] = auth()->id();
        }

        $customer = Customer::create($validated);
        $this->ensureCustomerUserAccount($customer);

        return response()->json([
            'status' => true,
            'message' => 'Customer created successfully. Login username/password is phone number until customer changes password.',
            'data' => $customer->fresh('user'),
        ], 201);
    }

    public function show(Request $request, Customer $customer)
    {
        if (! app(AccessControlService::class)->canViewCustomerDatabase($request->user())) {
            return response()->json([
                'status' => true,
                'message' => 'Customer basic data loaded.',
                'data' => [
                    'id' => $customer->id,
                    'name' => $customer->name,
                    'phone' => $customer->phone,
                    'email' => $customer->email,
                    'status' => $customer->status,
                ],
            ]);
        }
        $customer->load([
            'user:id,name,username,email,phone,status,profile_type,must_change_password,temporary_password',
            'usedPurchases' => function ($query) {
                $query->with([
                    'branch:id,name,code',
                    'salesman:id,name,email',
                    'brandInfo:id,name',
                ])->latest();
            },
        ])->loadCount('usedPurchases');

        return response()->json([
            'status' => true,
            'message' => 'Customer fetched successfully.',
            'data' => $customer,
        ]);
    }

    public function update(Request $request, Customer $customer)
    {
        $validated = $this->validateCustomer($request, $customer->id);

        $validated['opening_balance'] = $validated['opening_balance'] ?? 0;
        $validated['current_balance'] = $validated['current_balance'] ?? $customer->current_balance;

        if (auth()->check()) {
            $validated['updated_by'] = auth()->id();
        }

        $customer->update($validated);
        $this->ensureCustomerUserAccount($customer->fresh());

        return response()->json([
            'status' => true,
            'message' => 'Customer updated successfully.',
            'data' => $customer->fresh('user'),
        ]);
    }

    public function destroy(Customer $customer)
    {
        if ($customer->usedPurchases()->exists()) {
            return response()->json([
                'status' => false,
                'message' => 'This customer has sold devices history. You cannot delete it.',
            ], 422);
        }

        $customer->delete();

        return response()->json([
            'status' => true,
            'message' => 'Customer deleted successfully.',
        ]);
    }

    private function validateCustomer(Request $request, ?int $customerId = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'nid_number' => ['nullable', 'string', 'max:100'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:100'],
            'country' => ['nullable', 'string', 'max:100'],
            'opening_balance' => ['nullable', 'numeric'],
            'current_balance' => ['nullable', 'numeric'],
            'status' => ['required', Rule::in(['active', 'inactive'])],
        ]);
    }

    private function ensureCustomerUserAccount(Customer $customer): ?User
    {
        if (!$customer->phone || !Schema::hasColumn('customers', 'user_id')) {
            return null;
        }

        $phone = trim($customer->phone);
        $email = $customer->email ?: 'customer-' . preg_replace('/\D+/', '', $phone) . '@customer.nst.local';

        $user = null;

        if ($customer->user_id) {
            $user = User::find($customer->user_id);
        }

        if (!$user) {
            $user = User::where('phone', $phone)->orWhere('username', $phone)->first();
        }

        $data = [
            'name' => $customer->name,
            'username' => $phone,
            'email' => $email,
            'phone' => $phone,
            'status' => $customer->status === 'active' ? 'active' : 'inactive',
            'profile_type' => 'customer',
            'customer_id' => $customer->id,
        ];

        if ($user) {
            $user->update($data);
        } else {
            $data['password'] = Hash::make($phone);
            $data['temporary_password'] = $phone;
            $data['must_change_password'] = true;
            $data['password_reset_by'] = auth()->id();
            $data['password_reset_at'] = now();
            $user = User::create($data);
        }

        if (method_exists($user, 'assignRole') && Role::where('name', 'customer')->exists() && !$user->hasRole('customer')) {
            $user->assignRole('customer');
        }

        if ($customer->user_id !== $user->id) {
            $customer->forceFill(['user_id' => $user->id])->save();
        }

        return $user;
    }
}
