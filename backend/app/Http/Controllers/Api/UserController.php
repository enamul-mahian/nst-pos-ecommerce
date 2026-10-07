<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\User;
use App\Services\AccessControlService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;
use Throwable;

class UserController extends Controller
{
    public function options(Request $request)
    {
        $this->authorizeUserManagement($request);

        $roles = [];
        try {
            if (Schema::hasTable('roles')) {
                $roles = Role::query()
                    ->orderBy('name')
                    ->get(['id', 'name'])
                    ->map(fn ($role) => [
                        'id' => $role->id,
                        'name' => $role->name,
                        'label' => $this->prettyRoleName($role->name),
                    ])
                    ->values()
                    ->all();
            }
        } catch (Throwable $exception) {
            $roles = [];
        }

        if (empty($roles)) {
            $roles = collect($this->defaultRoleNames())->map(fn ($role) => [
                'id' => $role,
                'name' => $role,
                'label' => $this->prettyRoleName($role),
            ])->all();
        }

        $branches = [];
        try {
            if (Schema::hasTable('branches')) {
                $branches = Branch::query()
                    ->orderBy('name')
                    ->get(['id', 'name'])
                    ->map(fn ($branch) => [
                        'id' => $branch->id,
                        'name' => $branch->name,
                    ])
                    ->values()
                    ->all();
            }
        } catch (Throwable $exception) {
            $branches = [];
        }

        return response()->json([
            'status' => true,
            'message' => 'User management options loaded successfully.',
            'data' => [
                'roles' => $roles,
                'branches' => $branches,
                'statuses' => [
                    ['value' => 'active', 'label' => 'Active'],
                    ['value' => 'inactive', 'label' => 'Inactive'],
                    ['value' => 'suspended', 'label' => 'Suspended'],
                ],
                'profile_types' => [
                    ['value' => 'staff', 'label' => 'Staff / Employee'],
                    ['value' => 'salesman', 'label' => 'Salesman'],
                    ['value' => 'branch_manager', 'label' => 'Branch Manager'],
                    ['value' => 'accountant', 'label' => 'Accountant'],
                    ['value' => 'customer', 'label' => 'Customer Login'],
                    ['value' => 'supplier', 'label' => 'Supplier Login'],
                ],
            ],
        ]);
    }

    public function index(Request $request)
    {
        $this->authorizeUserManagement($request);

        $query = User::query();

        $with = [];
        foreach (['branch', 'customerProfile', 'supplierProfile', 'roles'] as $relation) {
            if (method_exists(User::class, $relation) || in_array($relation, ['roles'], true)) {
                $with[] = $relation;
            }
        }

        if (! empty($with)) {
            $query->with($with);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");

                foreach (['phone', 'username'] as $column) {
                    if (Schema::hasColumn('users', $column)) {
                        $q->orWhere($column, 'like', "%{$search}%");
                    }
                }
            });
        }

        if ($request->filled('profile_type') && Schema::hasColumn('users', 'profile_type')) {
            $query->where('profile_type', $request->profile_type);
        }

        if ($request->filled('status') && Schema::hasColumn('users', 'status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('branch_id') && Schema::hasColumn('users', 'branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }

        if ($request->filled('role') && Schema::hasTable('roles')) {
            try {
                $query->whereHas('roles', fn ($roleQuery) => $roleQuery->where('name', $request->role));
            } catch (Throwable $exception) {
                // If Spatie relationship is not ready, skip role filter instead of breaking Settings.
            }
        }

        $perPage = min(max((int) $request->get('per_page', 15), 5), 100);
        $users = $query->latest()->paginate($perPage);

        $users->getCollection()->transform(function ($user) use ($request) {
            return $this->formatUser($user, $this->canSeeTemporaryPassword($request->user()));
        });

        return response()->json([
            'status' => true,
            'message' => 'Users loaded successfully.',
            'data' => $users,
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizeUserManagement($request);

        $rules = $this->validationRules($request, null);
        $validated = $request->validate($rules);
        $this->enforceBranchAccessRule($request);

        $plainPassword = (string) $validated['password'];
        $data = [
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => Hash::make($plainPassword),
        ];

        foreach ($this->safeUserColumns() as $column) {
            if (Schema::hasColumn('users', $column)) {
                $data[$column] = $request->input($column);
            }
        }

        if (Schema::hasColumn('users', 'username') && empty($data['username'])) {
            $data['username'] = $this->makeUsernameFromEmail($validated['email']);
        }

        if (Schema::hasColumn('users', 'status') && empty($data['status'])) {
            $data['status'] = 'active';
        }

        if (Schema::hasColumn('users', 'profile_type') && empty($data['profile_type'])) {
            $roles = $this->normalizedRequestedRoles($request);
            $data['profile_type'] = $this->profileTypeFromRoles($roles) ?: 'staff';
        }

        if (Schema::hasColumn('users', 'temporary_password')) {
            $data['temporary_password'] = $plainPassword;
        }
        if (Schema::hasColumn('users', 'must_change_password')) {
            $data['must_change_password'] = true;
        }
        if (Schema::hasColumn('users', 'password_reset_by')) {
            $data['password_reset_by'] = $request->user()?->id;
        }
        if (Schema::hasColumn('users', 'password_reset_at')) {
            $data['password_reset_at'] = now();
        }

        $user = User::create($data);
        $this->syncUserRoles($user, $request);

        return response()->json([
            'status' => true,
            'message' => 'User created successfully.',
            'data' => $this->formatUser($user->fresh(['roles']), true),
        ], 201);
    }

    public function show(Request $request, User $user)
    {
        $this->authorizeUserManagement($request);

        $relations = [];
        foreach (['branch', 'customerProfile', 'supplierProfile', 'roles'] as $relation) {
            try {
                $relations[] = $relation;
            } catch (Throwable $exception) {
                // no-op
            }
        }
        $user->loadMissing($relations);

        return response()->json([
            'status' => true,
            'message' => 'User details loaded successfully.',
            'data' => $this->formatUser($user, $this->canSeeTemporaryPassword($request->user())),
        ]);
    }

    public function update(Request $request, User $user)
    {
        $this->authorizeUserManagement($request);

        $rules = $this->validationRules($request, $user);
        $validated = $request->validate($rules);
        $this->enforceBranchAccessRule($request);

        $data = [];
        foreach (['name', 'email'] as $column) {
            if ($request->has($column)) {
                $data[$column] = $request->input($column);
            }
        }

        foreach ($this->safeUserColumns() as $column) {
            if (Schema::hasColumn('users', $column) && $request->has($column)) {
                $data[$column] = $request->input($column);
            }
        }

        if (Schema::hasColumn('users', 'status') && auth()->id() === $user->id && isset($data['status']) && $data['status'] !== 'active') {
            return response()->json([
                'status' => false,
                'message' => 'You cannot deactivate or suspend your own account.',
            ], 422);
        }

        if (! $this->isSuperAdmin($request->user()) && $user->id === $request->user()?->id && $request->has('roles')) {
            unset($data['roles']);
        }

        if ($request->filled('password')) {
            $plainPassword = (string) $validated['password'];
            $data['password'] = Hash::make($plainPassword);

            if (Schema::hasColumn('users', 'temporary_password')) {
                $data['temporary_password'] = $plainPassword;
            }
            if (Schema::hasColumn('users', 'must_change_password')) {
                $data['must_change_password'] = true;
            }
            if (Schema::hasColumn('users', 'password_reset_by')) {
                $data['password_reset_by'] = $request->user()?->id;
            }
            if (Schema::hasColumn('users', 'password_reset_at')) {
                $data['password_reset_at'] = now();
            }
        }

        $user->update($data);
        $this->syncUserRoles($user, $request);

        return response()->json([
            'status' => true,
            'message' => 'User updated successfully.',
            'data' => $this->formatUser($user->fresh(['roles']), $this->canSeeTemporaryPassword($request->user())),
        ]);
    }

    public function resetPassword(Request $request, User $user)
    {
        $this->authorizeUserManagement($request);

        $validated = $request->validate([
            'password' => ['nullable', 'string', 'min:6', 'max:100'],
        ]);

        $newPassword = $validated['password'] ?? $this->generateTemporaryPassword();
        $data = [
            'password' => Hash::make($newPassword),
        ];

        if (Schema::hasColumn('users', 'temporary_password')) {
            $data['temporary_password'] = $newPassword;
        }
        if (Schema::hasColumn('users', 'must_change_password')) {
            $data['must_change_password'] = true;
        }
        if (Schema::hasColumn('users', 'password_reset_by')) {
            $data['password_reset_by'] = $request->user()?->id;
        }
        if (Schema::hasColumn('users', 'password_reset_at')) {
            $data['password_reset_at'] = now();
        }

        $user->update($data);

        return response()->json([
            'status' => true,
            'message' => 'Password reset successfully. User must change password after login.',
            'data' => [
                'user_id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'username' => Schema::hasColumn('users', 'username') ? $user->username : null,
                'temporary_password' => $newPassword,
            ],
        ]);
    }

    public function destroy(Request $request, User $user)
    {
        $this->authorizeUserManagement($request);

        if ($request->user()?->id === $user->id) {
            return response()->json([
                'status' => false,
                'message' => 'You cannot delete your own account.',
            ], 422);
        }

        $user->delete();

        return response()->json([
            'status' => true,
            'message' => 'User deleted successfully.',
        ]);
    }

    private function validationRules(Request $request, ?User $user): array
    {
        $ignoreId = $user?->id;
        $requiredOnStore = $user ? 'sometimes' : 'required';

        $rules = [
            'name' => [$requiredOnStore, 'string', 'max:255'],
            'email' => [
                $requiredOnStore,
                'email',
                'max:255',
                Rule::unique('users', 'email')->ignore($ignoreId),
            ],
            'password' => [$user ? 'nullable' : 'required', 'string', 'min:6', 'max:100'],
            'role' => ['nullable', 'string', 'max:100'],
            'roles' => ['nullable', 'array'],
            'roles.*' => ['string', 'max:100'],
        ];

        if (Schema::hasColumn('users', 'username')) {
            $rules['username'] = ['nullable', 'string', 'max:100', Rule::unique('users', 'username')->ignore($ignoreId)];
        }

        if (Schema::hasColumn('users', 'branch_id')) {
            $rules['branch_id'] = ['nullable', 'integer', Schema::hasTable('branches') ? Rule::exists('branches', 'id') : 'integer'];
        }

        if (Schema::hasColumn('users', 'phone')) {
            $rules['phone'] = ['nullable', 'string', 'max:50', Rule::unique('users', 'phone')->ignore($ignoreId)];
        }

        if (Schema::hasColumn('users', 'status')) {
            $rules['status'] = ['nullable', Rule::in(['active', 'inactive', 'suspended'])];
        }

        if (Schema::hasColumn('users', 'profile_type')) {
            $rules['profile_type'] = ['nullable', 'string', 'max:50'];
        }

        if (Schema::hasColumn('users', 'customer_id')) {
            $rules['customer_id'] = ['nullable', 'integer'];
        }

        if (Schema::hasColumn('users', 'supplier_id')) {
            $rules['supplier_id'] = ['nullable', 'integer'];
        }

        return $rules;
    }

    private function safeUserColumns(): array
    {
        return [
            'username',
            'branch_id',
            'phone',
            'address',
            'profile_photo',
            'status',
            'profile_type',
            'customer_id',
            'supplier_id',
        ];
    }

    private function authorizeUserManagement(Request $request): void
    {
        if (! $this->isUserManager($request->user())) {
            abort(403, 'Only Super Admin/Admin can manage users from Settings.');
        }
    }

    private function isUserManager($user): bool
    {
        if (! $user) {
            return false;
        }

        $roles = $this->roleNamesFromUser($user);

        return in_array('super_admin', $roles, true)
            || in_array('super admin', $roles, true)
            || in_array('admin', $roles, true)
            || in_array('administrator', $roles, true)
            || in_array(strtolower((string) ($user->role ?? '')), ['super_admin', 'super admin', 'admin'], true);
    }

    private function isSuperAdmin($user): bool
    {
        if (! $user) {
            return false;
        }

        $roles = $this->roleNamesFromUser($user);

        return in_array('super_admin', $roles, true) || in_array('super admin', $roles, true);
    }

    private function canSeeTemporaryPassword($user): bool
    {
        return $this->isUserManager($user);
    }

    private function roleNamesFromUser($user): array
    {
        $roles = [];

        try {
            if (method_exists($user, 'getRoleNames')) {
                $roles = $user->getRoleNames()->map(fn ($role) => strtolower((string) $role))->values()->all();
            }
        } catch (Throwable $exception) {
            $roles = [];
        }

        foreach (['role', 'user_type', 'type'] as $column) {
            if (! empty($user->{$column})) {
                $roles[] = strtolower((string) $user->{$column});
            }
        }

        return array_values(array_unique(array_filter($roles)));
    }

    private function formatUser(User $user, bool $showTemporaryPassword = false): array
    {
        $roles = [];
        $permissions = [];

        try {
            if (method_exists($user, 'getRoleNames')) {
                $roles = $user->getRoleNames()->values()->all();
            }

            if (method_exists($user, 'getAllPermissions')) {
                $permissions = $user->getAllPermissions()->pluck('name')->values()->all();
            }
        } catch (Throwable $exception) {
            $roles = [];
            $permissions = [];
        }

        $data = [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'roles' => $roles,
            'permissions' => $permissions,
            'created_at' => $user->created_at,
            'updated_at' => $user->updated_at,
        ];

        foreach ([
            'username',
            'branch_id',
            'phone',
            'address',
            'profile_photo',
            'status',
            'profile_type',
            'customer_id',
            'supplier_id',
            'must_change_password',
            'password_reset_by',
            'password_reset_at',
        ] as $column) {
            if (Schema::hasColumn('users', $column)) {
                $data[$column] = $user->{$column};
            }
        }

        if (! empty($data['profile_photo'])) {
            $data['profile_photo_url'] = asset('storage/' . ltrim($data['profile_photo'], '/'));
        }

        if ($user->relationLoaded('branch') && $user->branch) {
            $data['branch'] = [
                'id' => $user->branch->id,
                'name' => $user->branch->name,
            ];
        }

        $data['access_control'] = app(AccessControlService::class)->userAccess($user);

        if ($showTemporaryPassword && Schema::hasColumn('users', 'temporary_password')) {
            $data['temporary_password'] = $user->temporary_password;
        }

        return $data;
    }

    private function syncUserRoles(User $user, Request $request): void
    {
        $roles = $this->normalizedRequestedRoles($request);

        if (empty($roles)) {
            return;
        }

        if (! $this->isSuperAdmin($request->user())) {
            $roles = array_values(array_filter($roles, fn ($role) => ! in_array(strtolower($role), ['super_admin', 'super admin'], true)));
        }

        if (empty($roles)) {
            return;
        }

        try {
            if (! method_exists($user, 'syncRoles')) {
                return;
            }

            if (Schema::hasTable('roles')) {
                foreach ($roles as $role) {
                    Role::firstOrCreate(['name' => $role, 'guard_name' => 'web']);
                }
            }

            $user->syncRoles($roles);
        } catch (Throwable $exception) {
            // A role package or role name mismatch must not break saving the user.
        }
    }

    private function normalizedRequestedRoles(Request $request): array
    {
        $roles = [];

        if ($request->filled('roles') && is_array($request->roles)) {
            $roles = $request->roles;
        } elseif ($request->filled('role')) {
            $roles = [$request->role];
        }

        if (empty($roles) && $request->filled('profile_type')) {
            $profileToRole = [
                'salesman' => 'salesman',
                'branch_manager' => 'branch_manager',
                'accountant' => 'accountant',
                'customer' => 'customer',
                'supplier' => 'supplier',
            ];

            $profileType = (string) $request->profile_type;
            if (isset($profileToRole[$profileType])) {
                $roles = [$profileToRole[$profileType]];
            }
        }

        return collect($roles)
            ->map(fn ($role) => trim((string) $role))
            ->filter()
            ->unique()
            ->values()
            ->all();
    }

    private function defaultRoleNames(): array
    {
        return [
            'super_admin',
            'admin',
            'accountant',
            'branch_manager',
            'salesman',
            'supplier',
            'customer',
        ];
    }

    private function profileTypeFromRoles(array $roles): ?string
    {
        $map = [
            'salesman' => 'salesman',
            'branch_manager' => 'branch_manager',
            'accountant' => 'accountant',
            'supplier' => 'supplier',
            'customer' => 'customer',
        ];

        foreach ($roles as $role) {
            $normalized = strtolower((string) $role);
            if (isset($map[$normalized])) {
                return $map[$normalized];
            }
        }

        return null;
    }


    private function enforceBranchAccessRule(Request $request): void
    {
        if (! Schema::hasColumn('users', 'branch_id')) {
            return;
        }

        $roles = collect($this->normalizedRequestedRoles($request))
            ->map(fn ($role) => str_replace([' ', '-'], '_', strtolower((string) $role)))
            ->values()
            ->all();

        $profileType = str_replace([' ', '-'], '_', strtolower((string) $request->input('profile_type')));
        if ($profileType === 'accounts') {
            $profileType = 'accountant';
        }

        if ($profileType && empty($roles)) {
            $roles[] = $profileType;
        }

        $roles = array_values(array_unique($roles));
        $globalAllowed = ['super_admin', 'admin', 'accountant', 'customer', 'supplier'];
        $needsBranch = count(array_intersect($roles, ['salesman', 'branch_manager', 'staff'])) > 0;

        if ($needsBranch && ! $request->filled('branch_id') && count(array_intersect($roles, $globalAllowed)) === 0) {
            abort(response()->json([
                'status' => false,
                'message' => 'Salesman/Branch Manager/Staff must be assigned to a branch. Global access is only for Super Admin/Admin and Accountant accounting scope.',
            ], 422));
        }
    }

    private function prettyRoleName(string $role): string
    {
        return Str::title(str_replace(['_', '-'], ' ', $role));
    }

    private function makeUsernameFromEmail(string $email): string
    {
        $base = Str::slug(Str::before($email, '@'), '_') ?: 'user';
        $username = $base;
        $counter = 1;

        while (Schema::hasColumn('users', 'username') && User::where('username', $username)->exists()) {
            $counter++;
            $username = $base . '_' . $counter;
        }

        return $username;
    }

    private function generateTemporaryPassword(): string
    {
        return 'NST@' . now()->format('ymd') . random_int(1000, 9999);
    }
}
