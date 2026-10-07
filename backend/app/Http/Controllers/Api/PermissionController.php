<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Permission;

class PermissionController extends Controller
{
    public function all()
    {
        $permissions = Permission::orderBy('name')->get();

        return response()->json([
            'status' => true,
            'message' => 'All permissions loaded successfully.',
            'data' => $permissions,
        ]);
    }

    public function index(Request $request)
    {
        $query = Permission::query();

        if ($request->filled('search')) {
            $query->where('name', 'like', '%' . $request->search . '%');
        }

        $permissions = $query->orderBy('name')->paginate($request->get('per_page', 15));

        return response()->json([
            'status' => true,
            'message' => 'Permissions loaded successfully.',
            'data' => $permissions,
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
                Rule::unique('permissions', 'name')->where('guard_name', $guardName),
            ],
            'guard_name' => ['nullable', 'string', 'max:255'],
        ]);

        $permission = Permission::create([
            'name' => $validated['name'],
            'guard_name' => $guardName,
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Permission created successfully.',
            'data' => $permission,
        ], 201);
    }

    public function show(string $id)
    {
        $permission = Permission::findOrFail($id);

        return response()->json([
            'status' => true,
            'message' => 'Permission details loaded successfully.',
            'data' => $permission,
        ]);
    }

    public function update(Request $request, string $id)
    {
        $permission = Permission::findOrFail($id);
        $guardName = $request->guard_name ?? $permission->guard_name ?? 'web';

        $validated = $request->validate([
            'name' => [
                'sometimes',
                'required',
                'string',
                'max:255',
                Rule::unique('permissions', 'name')
                    ->where('guard_name', $guardName)
                    ->ignore($permission->id),
            ],
            'guard_name' => ['nullable', 'string', 'max:255'],
        ]);

        if ($request->has('name')) {
            $permission->name = $validated['name'];
        }

        if ($request->has('guard_name')) {
            $permission->guard_name = $guardName;
        }

        $permission->save();

        return response()->json([
            'status' => true,
            'message' => 'Permission updated successfully.',
            'data' => $permission,
        ]);
    }

    public function destroy(string $id)
    {
        $permission = Permission::findOrFail($id);

        $permission->delete();

        return response()->json([
            'status' => true,
            'message' => 'Permission deleted successfully.',
        ]);
    }
}