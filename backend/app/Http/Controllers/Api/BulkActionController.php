<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Branch;
use App\Models\BranchStock;
use App\Models\BranchStockRequest;
use App\Models\Category;
use App\Models\Product;
use App\Models\Supplier;
use Illuminate\Http\Request;

class BulkActionController extends Controller
{
    private function isSuperAdmin($user): bool
    {
        if (!$user) {
            return false;
        }

        $superAdminRoles = [
            'super_admin',
            'super admin',
            'Super Admin',
            'SUPER_ADMIN',
        ];

        if (method_exists($user, 'hasAnyRole') && $user->hasAnyRole($superAdminRoles)) {
            return true;
        }

        if (method_exists($user, 'hasRole')) {
            foreach ($superAdminRoles as $role) {
                if ($user->hasRole($role)) {
                    return true;
                }
            }
        }

        if (isset($user->role) && in_array($user->role, $superAdminRoles)) {
            return true;
        }

        if (isset($user->user_type) && in_array($user->user_type, $superAdminRoles)) {
            return true;
        }

        if (isset($user->type) && in_array($user->type, $superAdminRoles)) {
            return true;
        }

        if (isset($user->roles)) {
            $roles = $user->roles;

            if (is_string($roles) && in_array($roles, $superAdminRoles)) {
                return true;
            }

            if (is_array($roles)) {
                foreach ($roles as $role) {
                    if (is_string($role) && in_array($role, $superAdminRoles)) {
                        return true;
                    }

                    if (is_array($role) && isset($role['name']) && in_array($role['name'], $superAdminRoles)) {
                        return true;
                    }

                    if (is_object($role) && isset($role->name) && in_array($role->name, $superAdminRoles)) {
                        return true;
                    }
                }
            }

            if (is_object($roles) && method_exists($roles, 'pluck')) {
                $roleNames = $roles->pluck('name')->toArray();

                foreach ($roleNames as $roleName) {
                    if (in_array($roleName, $superAdminRoles)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private function modelMap(): array
    {
        return [
            'products' => Product::class,
            'categories' => Category::class,
            'brands' => Brand::class,
            'suppliers' => Supplier::class,
            'branches' => Branch::class,
            'branch_stocks' => BranchStock::class,
            'stock_requests' => BranchStockRequest::class,
        ];
    }

    public function delete(Request $request, string $type)
    {
        $user = $request->user();

        if (!$this->isSuperAdmin($user)) {
            return response()->json([
                'success' => false,
                'message' => 'Only Super Admin can perform bulk delete.',
            ], 403);
        }

        $models = $this->modelMap();

        if (!isset($models[$type])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid bulk delete type.',
            ], 404);
        }

        $validated = $request->validate([
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['required', 'integer'],
        ]);

        $modelClass = $models[$type];

        $items = $modelClass::query()
            ->whereIn('id', $validated['ids'])
            ->get();

        if ($items->count() === 0) {
            return response()->json([
                'success' => false,
                'message' => 'No matching records found.',
            ], 404);
        }

        $deletedIds = [];

        foreach ($items as $item) {
            $deletedIds[] = $item->id;
            $item->delete();
        }

        return response()->json([
            'success' => true,
            'message' => 'Selected records deleted successfully.',
            'data' => [
                'type' => $type,
                'requested_ids' => $validated['ids'],
                'deleted_ids' => $deletedIds,
                'deleted_count' => count($deletedIds),
            ],
        ]);
    }
}