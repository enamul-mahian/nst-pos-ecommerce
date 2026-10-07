<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\BranchStock;
use App\Models\BranchStockRequest;
use App\Models\Product;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    private function isAdminUser($user): bool
    {
        if (!$user) {
            return false;
        }

        $adminRoles = [
            'super_admin',
            'admin',
            'super admin',
            'Super Admin',
            'Admin',
            'SUPER_ADMIN',
            'ADMIN',
        ];

        if (method_exists($user, 'hasAnyRole') && $user->hasAnyRole($adminRoles)) {
            return true;
        }

        if (isset($user->role) && in_array($user->role, $adminRoles)) {
            return true;
        }

        if (isset($user->user_type) && in_array($user->user_type, $adminRoles)) {
            return true;
        }

        if (isset($user->type) && in_array($user->type, $adminRoles)) {
            return true;
        }

        if (isset($user->roles)) {
            $roles = $user->roles;

            if (is_string($roles) && in_array($roles, $adminRoles)) {
                return true;
            }

            if (is_array($roles)) {
                foreach ($roles as $role) {
                    if (is_string($role) && in_array($role, $adminRoles)) {
                        return true;
                    }

                    if (is_array($role) && isset($role['name']) && in_array($role['name'], $adminRoles)) {
                        return true;
                    }

                    if (is_object($role) && isset($role->name) && in_array($role->name, $adminRoles)) {
                        return true;
                    }
                }
            }

            if (is_object($roles) && method_exists($roles, 'pluck')) {
                $roleNames = $roles->pluck('name')->toArray();

                foreach ($roleNames as $roleName) {
                    if (in_array($roleName, $adminRoles)) {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private function getUserBranchIds($user)
    {
        if (!$user) {
            return collect([]);
        }

        $branchIds = collect([]);

        if (isset($user->branch_id) && $user->branch_id) {
            $branchIds->push($user->branch_id);
        }

        $managedBranchIds = Branch::query()
            ->where('manager_id', $user->id)
            ->pluck('id');

        $branchIds = $branchIds->merge($managedBranchIds);

        return $branchIds->unique()->values();
    }

    public function index(Request $request)
    {
        $user = $request->user();
        $isAdmin = $this->isAdminUser($user);

        if ($isAdmin) {
            $branchIds = Branch::query()->pluck('id');

            $totalProducts = Product::query()->count();
            $totalBranches = Branch::query()->count();
        } else {
            $branchIds = $this->getUserBranchIds($user);

            $totalProducts = BranchStock::query()
                ->whereIn('branch_id', $branchIds)
                ->distinct('product_id')
                ->count('product_id');

            $totalBranches = Branch::query()
                ->whereIn('id', $branchIds)
                ->count();
        }

        $branchStockQuery = BranchStock::query();

        if (!$isAdmin) {
            $branchStockQuery->whereIn('branch_id', $branchIds);
        }

        $totalStockItems = (clone $branchStockQuery)->count();

        $totalStockQty = (int) (clone $branchStockQuery)->sum('quantity');

        $lowStockCount = (clone $branchStockQuery)
            ->where('quantity', '>', 0)
            ->where('quantity', '<=', 5)
            ->count();

        $outOfStockCount = (clone $branchStockQuery)
            ->where('quantity', '<=', 0)
            ->count();

        $stockRequestQuery = BranchStockRequest::query();

        if (!$isAdmin) {
            $stockRequestQuery->whereIn('branch_id', $branchIds);
        }

        $totalStockRequests = (clone $stockRequestQuery)->count();

        $pendingStockRequests = (clone $stockRequestQuery)
            ->where('status', 'pending')
            ->count();

        $approvedStockRequests = (clone $stockRequestQuery)
            ->where('status', 'approved')
            ->count();

        $rejectedStockRequests = (clone $stockRequestQuery)
            ->where('status', 'rejected')
            ->count();

        return response()->json([
            'success' => true,
            'message' => 'Dashboard stats loaded successfully.',
            'data' => [
                'is_admin' => $isAdmin,

                'total_products' => $totalProducts,
                'total_branches' => $totalBranches,

                'total_stock_items' => $totalStockItems,
                'total_stock_qty' => $totalStockQty,
                'low_stock_count' => $lowStockCount,
                'out_of_stock_count' => $outOfStockCount,

                'total_stock_requests' => $totalStockRequests,
                'pending_stock_requests' => $pendingStockRequests,
                'approved_stock_requests' => $approvedStockRequests,
                'rejected_stock_requests' => $rejectedStockRequests,
            ],
        ]);
    }

    public function stats(Request $request)
    {
        return $this->index($request);
    }
}