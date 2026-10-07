<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserAccessControl;
use App\Services\AccessControlService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class AccessControlController extends Controller
{
    public function __construct(private AccessControlService $accessControl)
    {
    }

    public function show(Request $request, User $user)
    {
        $this->authorizeSuperAdmin($request);

        $roles = method_exists($user, 'getRoleNames') ? $user->getRoleNames()->toArray() : [];
        $defaults = $this->accessControl->defaultAccessForRoles($roles);
        $stored = $this->accessControl->userAccess($user);

        return response()->json([
            'success' => true,
            'data' => array_replace_recursive($defaults, $stored),
        ]);
    }

    public function update(Request $request, User $user)
    {
        $this->authorizeSuperAdmin($request);

        if (! Schema::hasTable('user_access_controls')) {
            return response()->json(['success' => false, 'message' => 'user_access_controls table missing. Run migration.'], 422);
        }

        $validated = $request->validate([
            'dashboard_permissions' => ['nullable', 'array'],
            'sidebar_permissions' => ['nullable', 'array'],
            'column_permissions' => ['nullable', 'array'],
            'branch_ids' => ['nullable', 'array'],
            'branch_ids.*' => ['integer'],
            'financial_permissions' => ['nullable', 'array'],
        ]);

        $access = UserAccessControl::updateOrCreate(
            ['user_id' => $user->id],
            [
                'dashboard_permissions' => $validated['dashboard_permissions'] ?? [],
                'sidebar_permissions' => $validated['sidebar_permissions'] ?? [],
                'column_permissions' => $validated['column_permissions'] ?? [],
                'branch_ids' => $validated['branch_ids'] ?? [],
                'financial_permissions' => $validated['financial_permissions'] ?? [],
                'updated_by' => $request->user()?->id,
                'created_by' => $request->user()?->id,
            ]
        );

        return response()->json([
            'success' => true,
            'message' => 'User access control updated successfully.',
            'data' => $access,
        ]);
    }

    private function authorizeSuperAdmin(Request $request): void
    {
        if (! $this->accessControl->isSuperAdmin($request->user())) {
            abort(403, 'Only Super Admin can change user-wise access control.');
        }
    }
}
