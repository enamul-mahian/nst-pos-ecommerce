<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;
use App\Services\AccessControlService;

class SupplierController extends Controller
{
    public function index(Request $request)
    {
        $this->ensureCanViewSuppliers($request);

        $query = Supplier::with('user:id,name,username,email,phone,status,profile_type,must_change_password,temporary_password')
            ->withCount(['products', 'usedPurchases'])
            ->latest();

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('company_name', 'like', "%{$search}%")
                    ->orWhere('contact_person', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('supplier_code', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json([
            'status' => true,
            'message' => 'Suppliers loaded successfully.',
            'data' => $query->paginate((int) $request->get('per_page', 20)),
        ]);
    }

    public function all(Request $request)
    {
        $this->ensureCanViewSuppliers($request);

        $query = Supplier::query()->orderBy('name');

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        return response()->json([
            'status' => true,
            'message' => 'Suppliers loaded successfully.',
            'data' => $query->limit((int) $request->get('limit', 500))->get()->map(function (Supplier $supplier) {
                $supplier->selection_label = trim(sprintf('%s — %s — %s', $supplier->name, $supplier->phone ?: 'No phone', $supplier->supplier_code ?: ('SUP-' . str_pad((string) $supplier->id, 6, '0', STR_PAD_LEFT))));
                return $supplier;
            }),
        ]);
    }

    public function store(Request $request)
    {
        $this->ensureCanViewSuppliers($request);

        $validated = $this->validateSupplier($request);

        $validated['slug'] = $this->generateUniqueSlug($validated['name']);
        $validated['opening_balance'] = $validated['opening_balance'] ?? 0;
        $validated['current_balance'] = $validated['current_balance'] ?? $validated['opening_balance'];

        if (auth()->check()) {
            $validated['created_by'] = auth()->id();
            $validated['updated_by'] = auth()->id();
        }

        $supplier = Supplier::create($validated);
        $this->ensureSupplierUserAccount($supplier);

        return response()->json([
            'status' => true,
            'message' => 'Supplier created successfully. Login username/password is phone number until supplier changes password.',
            'data' => $supplier->fresh('user'),
        ], 201);
    }

    public function show(Request $request, Supplier $supplier)
    {
        $this->ensureCanViewSuppliers($request);

        $supplier->load([
            'user:id,name,username,email,phone,status,profile_type,must_change_password,temporary_password',
            'usedPurchases' => function ($query) {
                $query->with([
                    'branch:id,name,code',
                    'salesman:id,name,email',
                    'brandInfo:id,name',
                ])->latest();
            },
        ])->loadCount(['products', 'usedPurchases']);

        return response()->json([
            'status' => true,
            'message' => 'Supplier fetched successfully.',
            'data' => $supplier,
        ]);
    }

    public function update(Request $request, Supplier $supplier)
    {
        $this->ensureCanViewSuppliers($request);

        $validated = $this->validateSupplier($request, $supplier->id);

        if ($supplier->name !== $validated['name']) {
            $validated['slug'] = $this->generateUniqueSlug($validated['name'], $supplier->id);
        }

        $validated['opening_balance'] = $validated['opening_balance'] ?? 0;
        $validated['current_balance'] = $validated['current_balance'] ?? $supplier->current_balance;

        if (auth()->check()) {
            $validated['updated_by'] = auth()->id();
        }

        $supplier->update($validated);
        $this->ensureSupplierUserAccount($supplier->fresh());

        return response()->json([
            'status' => true,
            'message' => 'Supplier updated successfully.',
            'data' => $supplier->fresh('user'),
        ]);
    }

    public function destroy(Request $request, Supplier $supplier)
    {
        $this->ensureCanViewSuppliers($request);

        if ($supplier->products()->exists()) {
            return response()->json([
                'status' => false,
                'message' => 'This supplier has products. You cannot delete it.',
            ], 422);
        }

        if ($supplier->usedPurchases()->exists()) {
            return response()->json([
                'status' => false,
                'message' => 'This supplier has supplied used/pre-owned device history. You cannot delete it.',
            ], 422);
        }

        $supplier->delete();

        return response()->json([
            'status' => true,
            'message' => 'Supplier deleted successfully.',
        ]);
    }


    private function ensureCanViewSuppliers(Request $request): void
    {
        if (! app(AccessControlService::class)->canViewSupplierInfo($request->user())) {
            abort(response()->json([
                'status' => false,
                'message' => 'You do not have permission to view supplier data.',
            ], 403));
        }
    }

    private function validateSupplier(Request $request, ?int $supplierId = null): array
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'contact_person' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string'],
            'city' => ['nullable', 'string', 'max:100'],
            'country' => ['nullable', 'string', 'max:100'],
            'website' => ['nullable', 'string', 'max:255'],
            'trade_license_no' => ['nullable', 'string', 'max:255'],
            'tax_number' => ['nullable', 'string', 'max:255'],
            'opening_balance' => ['nullable', 'numeric'],
            'current_balance' => ['nullable', 'numeric'],
            'supplier_since' => ['nullable', 'date'],
            'portal_enabled' => ['nullable', 'boolean'],
            'reliability_score' => ['nullable', 'numeric', 'between:0,100'],
            'status' => ['required', Rule::in(['active', 'inactive'])],
        ]);

        $phone = trim((string) ($validated['phone'] ?? ''));
        if ($phone !== '') {
            $duplicate = Supplier::query()
                ->where('phone', $phone)
                ->when($supplierId, fn ($query) => $query->whereKeyNot($supplierId))
                ->first(['id', 'name', 'phone', 'supplier_code']);
            if ($duplicate) {
                abort(response()->json([
                    'status' => false,
                    'message' => 'A supplier with this mobile number already exists.',
                    'duplicate' => $duplicate,
                ], 422));
            }
        }

        return $validated;
    }

    private function generateUniqueSlug(string $name, ?int $ignoreId = null): string
    {
        $baseSlug = Str::slug($name) ?: 'supplier';
        $slug = $baseSlug;
        $count = 1;

        while (
            Supplier::where('slug', $slug)
                ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
                ->exists()
        ) {
            $slug = $baseSlug . '-' . $count;
            $count++;
        }

        return $slug;
    }

    private function ensureSupplierUserAccount(Supplier $supplier): ?User
    {
        if (!$supplier->phone || !Schema::hasColumn('suppliers', 'user_id') || (Schema::hasColumn('suppliers', 'portal_enabled') && !$supplier->portal_enabled)) {
            return null;
        }

        $phone = trim($supplier->phone);
        $email = $supplier->email ?: 'supplier-' . preg_replace('/\D+/', '', $phone) . '@supplier.nst.local';

        $user = null;

        if ($supplier->user_id) {
            $user = User::find($supplier->user_id);
        }

        if (!$user) {
            $user = User::where('phone', $phone)->orWhere('username', $phone)->first();
        }

        $data = [
            'name' => $supplier->name,
            'username' => $phone,
            'email' => $email,
            'phone' => $phone,
            'status' => $supplier->status === 'active' ? 'active' : 'inactive',
            'profile_type' => 'supplier',
            'supplier_id' => $supplier->id,
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

        if (method_exists($user, 'assignRole') && Role::where('name', 'supplier')->exists() && !$user->hasRole('supplier')) {
            $user->assignRole('supplier');
        }

        if ($supplier->user_id !== $user->id) {
            $supplier->forceFill(['user_id' => $user->id])->save();
        }

        return $user;
    }
}
