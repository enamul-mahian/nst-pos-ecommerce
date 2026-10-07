<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;
use Spatie\Permission\Models\Permission;

class RoleController extends Controller
{
    public function all()
    {
        $roles = Role::with('permissions')
            ->orderBy('name')
            ->get();

        return response()->json([
            'status' => true,
            'message' => 'All roles loaded successfully.',
            'data' => $roles,
        ]);
    }

    public function index(Request $request)
    {
        $query = Role::with('permissions');

        if ($request->filled('search')) {
            $query->where('name', 'like', '%' . $request->search . '%');
        }

        $roles = $query->latest()->paginate($request->get('per_page', 15));

        return response()->json([
            'status' => true,
            'message' => 'Roles loaded successfully.',
            'data' => $roles,
        ]);
    }

    public function store(Request $request)
    {
        $guardName = $request->guard_name ?? 'web';

        $validated = $request->validate([
            'name' => [
                'required',
                'string',
                'max:255',
                Rule::unique('roles', 'name')->where('guard_name', $guardName),
            ],
            'guard_name' => ['nullable', 'string', 'max:255'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string'],
        ]);

        $role = Role::create([
            'name' => $validated['name'],
            'guard_name' => $guardName,
        ]);

        if ($request->filled('permissions')) {
            $permissions = Permission::whereIn('name', $request->permissions)->get();
            $role->syncPermissions($permissions);
        }

        return response()->json([
            'status' => true,
            'message' => 'Role created successfully.',
            'data' => $role->load('permissions'),
        ], 201);
    }

    public function show(string $id)
    {
        $role = Role::with('permissions')->findOrFail($id);

        return response()->json([
            'status' => true,
            'message' => 'Role details loaded successfully.',
            'data' => $role,
        ]);
    }

    public function update(Request $request, string $id)
    {
        $role = Role::findOrFail($id);
        $guardName = $request->guard_name ?? $role->guard_name ?? 'web';

        $validated = $request->validate([
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('roles', 'name')
                    ->where('guard_name', $guardName)
                    ->ignore($role->id),
            ],
            'guard_name' => ['nullable', 'string', 'max:255'],
            'permissions' => ['nullable', 'array'],
            'permissions.*' => ['string'],
        ]);

        if ($request->has('name')) {
            $role->name = $validated['name'];
        }

        if ($request->has('guard_name')) {
            $role->guard_name = $guardName;
        }

        $role->save();

        if ($request->has('permissions')) {
            $permissions = Permission::whereIn('name', $request->permissions ?? [])->get();
            $role->syncPermissions($permissions);
        }

        return response()->json([
            'status' => true,
            'message' => 'Role updated successfully.',
            'data' => $role->load('permissions'),
        ]);
    }

    public function destroy(string $id)
    {
        $role = Role::findOrFail($id);

        $protectedRoles = [
            'Super Admin',
            'super admin',
            'super-admin',
            'admin',
        ];

        if (in_array($role->name, $protectedRoles)) {
            return response()->json([
                'status' => false,
                'message' => 'This role is protected and cannot be deleted.',
            ], 422);
        }

        $role->delete();

        return response()->json([
            'status' => true,
            'message' => 'Role deleted successfully.',
        ]);
    }
}