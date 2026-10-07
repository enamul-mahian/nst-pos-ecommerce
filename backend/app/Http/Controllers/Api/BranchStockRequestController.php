<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\BranchStock;
use App\Models\BranchStockRequest;
use Illuminate\Http\Request;

class BranchStockRequestController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $query = BranchStockRequest::with([
            'branch:id,name,code',
            'product:id,name,sku,sale_price,status',
            'requester:id,name,email',
            'responder:id,name,email',
        ]);

        if (!$this->isSuperAdminOrAdmin($user)) {
            if (!$user->branch_id) {
                return response()->json([
                    'message' => 'No branch assigned to this user.',
                    'data' => [],
                    'current_page' => 1,
                    'last_page' => 1,
                    'per_page' => $request->get('per_page', 10),
                    'total' => 0,
                ]);
            }

            $query->where('branch_id', $user->branch_id);
        }

        if ($request->filled('branch_id')) {
            if ($this->isSuperAdminOrAdmin($user)) {
                $query->where('branch_id', $request->branch_id);
            }
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = $request->search;

            $query->where(function ($q) use ($search) {
                $q->whereHas('branch', function ($branchQuery) use ($search) {
                    $branchQuery->where('name', 'like', "%{$search}%")
                        ->orWhere('code', 'like', "%{$search}%");
                })
                ->orWhereHas('product', function ($productQuery) use ($search) {
                    $productQuery->where('name', 'like', "%{$search}%")
                        ->orWhere('sku', 'like', "%{$search}%");
                });
            });
        }

        $requests = $query
            ->latest()
            ->paginate($request->get('per_page', 10));

        return response()->json($requests);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        $validated = $request->validate([
            'branch_id' => ['nullable', 'exists:branches,id'],
            'product_id' => ['required', 'exists:products,id'],
            'requested_quantity' => ['required', 'integer', 'min:1'],
            'note' => ['nullable', 'string'],
        ]);

        if ($this->isSuperAdminOrAdmin($user)) {
            $branchId = $validated['branch_id'] ?? $user->branch_id;
        } else {
            $branchId = $user->branch_id;
        }

        if (!$branchId) {
            return response()->json([
                'message' => 'No branch assigned to this user.',
            ], 422);
        }

        Branch::findOrFail($branchId);

        $stockRequest = BranchStockRequest::create([
            'branch_id' => $branchId,
            'product_id' => $validated['product_id'],
            'requested_by' => $user->id,
            'requested_quantity' => (int) $validated['requested_quantity'],
            'status' => 'pending',
            'note' => $validated['note'] ?? null,
        ]);

        return response()->json([
            'message' => 'Branch stock request submitted successfully.',
            'data' => $stockRequest->load([
                'branch:id,name,code',
                'product:id,name,sku',
                'requester:id,name,email',
            ]),
        ], 201);
    }

    public function show(Request $request, BranchStockRequest $stockRequest)
    {
        $this->checkRequestAccess($request, $stockRequest);

        return response()->json([
            'data' => $stockRequest->load([
                'branch:id,name,code',
                'product:id,name,sku,sale_price,status',
                'requester:id,name,email',
                'responder:id,name,email',
            ]),
        ]);
    }

    public function approve(Request $request, BranchStockRequest $stockRequest)
    {
        $user = $request->user();

        if (!$this->isSuperAdminOrAdmin($user)) {
            abort(403, 'Only Super Admin/Admin can approve stock requests.');
        }

        if ($stockRequest->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending requests can be approved.',
            ], 422);
        }

        $validated = $request->validate([
            'approved_quantity' => ['nullable', 'integer', 'min:1'],
            'admin_note' => ['nullable', 'string'],
        ]);

        $approvedQuantity = $validated['approved_quantity']
            ?? $stockRequest->requested_quantity;

        $branchStock = BranchStock::where('branch_id', $stockRequest->branch_id)
            ->where('product_id', $stockRequest->product_id)
            ->first();

        if ($branchStock) {
            $branchStock->update([
                'quantity' => (int) $branchStock->quantity + (int) $approvedQuantity,
            ]);
        } else {
            $branchStock = BranchStock::create([
                'branch_id' => $stockRequest->branch_id,
                'product_id' => $stockRequest->product_id,
                'quantity' => (int) $approvedQuantity,
                'alert_quantity' => 0,
            ]);
        }

        $stockRequest->update([
            'status' => 'approved',
            'approved_quantity' => (int) $approvedQuantity,
            'responded_by' => $user->id,
            'responded_at' => now(),
            'admin_note' => $validated['admin_note'] ?? null,
        ]);

        return response()->json([
            'message' => 'Stock request approved and branch stock updated successfully.',
            'data' => $stockRequest->fresh()->load([
                'branch:id,name,code',
                'product:id,name,sku',
                'requester:id,name,email',
                'responder:id,name,email',
            ]),
            'stock' => $branchStock->fresh()->load('product'),
        ]);
    }

    public function reject(Request $request, BranchStockRequest $stockRequest)
    {
        $user = $request->user();

        if (!$this->isSuperAdminOrAdmin($user)) {
            abort(403, 'Only Super Admin/Admin can reject stock requests.');
        }

        if ($stockRequest->status !== 'pending') {
            return response()->json([
                'message' => 'Only pending requests can be rejected.',
            ], 422);
        }

        $validated = $request->validate([
            'admin_note' => ['nullable', 'string'],
        ]);

        $stockRequest->update([
            'status' => 'rejected',
            'responded_by' => $user->id,
            'responded_at' => now(),
            'admin_note' => $validated['admin_note'] ?? null,
        ]);

        return response()->json([
            'message' => 'Stock request rejected successfully.',
            'data' => $stockRequest->fresh()->load([
                'branch:id,name,code',
                'product:id,name,sku',
                'requester:id,name,email',
                'responder:id,name,email',
            ]),
        ]);
    }

    private function checkRequestAccess(Request $request, BranchStockRequest $stockRequest): void
    {
        $user = $request->user();

        if ($this->isSuperAdminOrAdmin($user)) {
            return;
        }

        if ((int) $user->branch_id === (int) $stockRequest->branch_id) {
            return;
        }

        abort(403, 'You are not allowed to access this stock request.');
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