<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class BranchController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $query = Branch::with(['manager:id,name,email', 'invoiceProfile'])
            ->withCount('stocks')
            ->withSum('stocks', 'quantity');

        if (!$this->isSuperAdminOrAdmin($user)) {
            if (!$user || !$user->branch_id) {
                $query->whereRaw('1 = 0');
            } else {
                $query->where('id', $user->branch_id);
            }
        }

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('address', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $branches = $query
            ->latest()
            ->paginate($request->get('per_page', 10));

        return response()->json($branches);
    }

    public function all(Request $request)
    {
        $user = $request->user();

        $query = Branch::with(['manager:id,name,email', 'invoiceProfile'])
            ->withCount('stocks')
            ->withSum('stocks', 'quantity');

        if (!$this->isSuperAdminOrAdmin($user)) {
            if (!$user || !$user->branch_id) {
                return response()->json([
                    'data' => [],
                ]);
            }

            $query->where('id', $user->branch_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        } else {
            $query->where('status', 'active');
        }

        $branches = $query
            ->orderBy('name')
            ->get();

        return response()->json([
            'data' => $branches,
        ]);
    }

    public function store(Request $request)
    {
        $this->onlySuperAdminOrAdmin($request);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:100', 'unique:branches,code'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string'],
            'manager_id' => ['nullable', 'exists:users,id'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'invoice_profile' => ['nullable', 'array'],
            'invoice_profile.use_custom_profile' => ['nullable', 'boolean'],
            'invoice_profile.invoice_prefix' => ['nullable', 'string', 'max:32'],
            'invoice_profile.business_name' => ['nullable', 'string', 'max:255'],
            'invoice_profile.short_name' => ['nullable', 'string', 'max:120'],
            'invoice_profile.logo_url' => ['nullable', 'string', 'max:2000'],
            'invoice_profile.address' => ['nullable', 'string'],
            'invoice_profile.phone' => ['nullable', 'string', 'max:80'],
            'invoice_profile.email' => ['nullable', 'email', 'max:255'],
            'invoice_profile.website' => ['nullable', 'string', 'max:255'],
            'invoice_profile.bin_vat' => ['nullable', 'string', 'max:120'],
            'invoice_profile.layout' => ['nullable', Rule::in(['a4', 'a5', '80mm', '58mm'])],
            'invoice_profile.orientation' => ['nullable', Rule::in(['portrait', 'landscape'])],
            'invoice_profile.payment_details' => ['nullable', 'string'],
            'invoice_profile.terms' => ['nullable', 'string'],
            'invoice_profile.warranty_terms' => ['nullable', 'string'],
            'invoice_profile.return_policy' => ['nullable', 'string'],
            'invoice_profile.footer_text' => ['nullable', 'string'],
            'invoice_profile.signature_text' => ['nullable', 'string'],
            'invoice_profile.show_qr' => ['nullable', 'boolean'],
            'invoice_profile.show_barcode' => ['nullable', 'boolean'],
            'invoice_profile.auto_print' => ['nullable', 'boolean'],
        ]);

        $managerId = $validated['manager_id'] ?? null;

        $branch = Branch::create([
            'name' => $validated['name'],
            'code' => $validated['code'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'email' => $validated['email'] ?? null,
            'address' => $validated['address'] ?? null,
            'manager_id' => $managerId,
            'status' => $validated['status'] ?? 'active',
        ]);

        if ($managerId) {
            User::where('id', $managerId)->update([
                'branch_id' => $branch->id,
            ]);
        }

        $this->syncInvoiceProfile($branch, $validated['invoice_profile'] ?? null, $request->user()?->id);

        return response()->json([
            'message' => 'Branch created successfully.',
            'data' => $branch->fresh()->load(['manager:id,name,email', 'invoiceProfile']),
        ], 201);
    }

    public function show(Request $request, $id)
    {
        $branch = Branch::with(['manager:id,name,email', 'invoiceProfile'])
            ->withCount('stocks')
            ->withSum('stocks', 'quantity')
            ->findOrFail($id);

        $this->checkBranchAccess($request, $branch);

        return response()->json([
            'data' => $branch,
        ]);
    }

    public function update(Request $request, $id)
    {
        $this->onlySuperAdminOrAdmin($request);

        $branch = Branch::findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'code' => [
                'nullable',
                'string',
                'max:100',
                Rule::unique('branches', 'code')->ignore($branch->id),
            ],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string'],
            'manager_id' => ['nullable', 'exists:users,id'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
            'invoice_profile' => ['nullable', 'array'],
            'invoice_profile.use_custom_profile' => ['nullable', 'boolean'],
            'invoice_profile.invoice_prefix' => ['nullable', 'string', 'max:32'],
            'invoice_profile.business_name' => ['nullable', 'string', 'max:255'],
            'invoice_profile.short_name' => ['nullable', 'string', 'max:120'],
            'invoice_profile.logo_url' => ['nullable', 'string', 'max:2000'],
            'invoice_profile.address' => ['nullable', 'string'],
            'invoice_profile.phone' => ['nullable', 'string', 'max:80'],
            'invoice_profile.email' => ['nullable', 'email', 'max:255'],
            'invoice_profile.website' => ['nullable', 'string', 'max:255'],
            'invoice_profile.bin_vat' => ['nullable', 'string', 'max:120'],
            'invoice_profile.layout' => ['nullable', Rule::in(['a4', 'a5', '80mm', '58mm'])],
            'invoice_profile.orientation' => ['nullable', Rule::in(['portrait', 'landscape'])],
            'invoice_profile.payment_details' => ['nullable', 'string'],
            'invoice_profile.terms' => ['nullable', 'string'],
            'invoice_profile.warranty_terms' => ['nullable', 'string'],
            'invoice_profile.return_policy' => ['nullable', 'string'],
            'invoice_profile.footer_text' => ['nullable', 'string'],
            'invoice_profile.signature_text' => ['nullable', 'string'],
            'invoice_profile.show_qr' => ['nullable', 'boolean'],
            'invoice_profile.show_barcode' => ['nullable', 'boolean'],
            'invoice_profile.auto_print' => ['nullable', 'boolean'],
        ]);

        $oldManagerId = $branch->manager_id;
        $newManagerId = $validated['manager_id'] ?? null;

        $branch->update([
            'name' => $validated['name'],
            'code' => $validated['code'] ?? null,
            'phone' => $validated['phone'] ?? null,
            'email' => $validated['email'] ?? null,
            'address' => $validated['address'] ?? null,
            'manager_id' => $newManagerId,
            'status' => $validated['status'] ?? 'active',
        ]);

        if ($oldManagerId && $oldManagerId != $newManagerId) {
            User::where('id', $oldManagerId)->update([
                'branch_id' => null,
            ]);
        }

        if ($newManagerId) {
            User::where('id', $newManagerId)->update([
                'branch_id' => $branch->id,
            ]);
        }

        $this->syncInvoiceProfile($branch, $validated['invoice_profile'] ?? null, $request->user()?->id);

        return response()->json([
            'message' => 'Branch updated successfully.',
            'data' => $branch->fresh()->load(['manager:id,name,email', 'invoiceProfile']),
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $this->onlySuperAdminOrAdmin($request);

        $branch = Branch::findOrFail($id);

        User::where('branch_id', $branch->id)->update([
            'branch_id' => null,
        ]);

        $branch->delete();

        return response()->json([
            'message' => 'Branch deleted successfully.',
        ]);
    }


    private function syncInvoiceProfile(Branch $branch, ?array $profile, ?int $userId): void
    {
        if ($profile === null) {
            return;
        }

        $defaults = [
            'use_custom_profile' => false,
            'layout' => 'a4',
            'orientation' => 'portrait',
            'show_qr' => true,
            'show_barcode' => true,
            'auto_print' => false,
        ];

        $branch->invoiceProfile()->updateOrCreate(
            ['branch_id' => $branch->id],
            array_merge($defaults, $profile, ['updated_by' => $userId])
        );
    }

    private function checkBranchAccess(Request $request, Branch $branch): void
    {
        $user = $request->user();

        if (!$user) {
            abort(401, 'Unauthenticated.');
        }

        if ($this->isSuperAdminOrAdmin($user)) {
            return;
        }

        if ((int) $user->branch_id === (int) $branch->id) {
            return;
        }

        abort(403, 'You are not allowed to access this branch.');
    }

    private function onlySuperAdminOrAdmin(Request $request): void
    {
        $user = $request->user();

        if (!$user) {
            abort(401, 'Unauthenticated.');
        }

        if ($this->isSuperAdminOrAdmin($user)) {
            return;
        }

        abort(403, 'Only Super Admin/Admin can perform this action.');
    }

    private function isSuperAdminOrAdmin($user): bool
    {
        if (!$user || !method_exists($user, 'hasRole')) {
            return false;
        }

        return $user->hasRole('Super Admin')
            || $user->hasRole('super admin')
            || $user->hasRole('super-admin')
            || $user->hasRole('super_admin')
            || $user->hasRole('Admin')
            || $user->hasRole('admin');
    }
}