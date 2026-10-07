<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class NstLockedOperationsController extends Controller
{
    public function status(Request $request): JsonResponse
    {
        return response()->json(['status' => true, 'data' => [
            'scheduled_refunds' => Schema::hasTable('scheduled_refunds'),
            'supplier_price_comparison' => Schema::hasTable('supplier_price_submissions'),
            'purchase_orders' => Schema::hasTable('nst_purchase_orders'),
            'financial_view' => Schema::hasTable('financial_view_policies'),
            'online_activist' => $this->isOnlineActivist($request->user()),
            'super_admin' => app(AccessControlService::class)->isSuperAdmin($request->user()),
        ]]);
    }

    public function refunds(Request $request): JsonResponse
    {
        $this->refreshOverdueRefunds();
        $query = DB::table('scheduled_refunds')->latest('scheduled_at');
        if ($request->filled('status')) $query->where('status', $request->status);
        if ($request->filled('branch_id')) $query->where('branch_id', $request->branch_id);
        return response()->json(['status' => true, 'data' => $query->paginate((int) $request->get('per_page', 25))]);
    }

    public function storeRefund(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sale_id' => ['nullable', 'integer'], 'exchange_id' => ['nullable', 'integer'],
            'customer_id' => ['nullable', 'integer'], 'branch_id' => ['nullable', 'integer'],
            'amount' => ['required', 'numeric', 'gt:0'], 'method' => ['required', 'string', 'max:50'],
            'scheduled_at' => ['required', 'date'], 'reason' => ['required', 'string', 'max:3000'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $id = DB::transaction(function () use ($validated, $request) {
            $next = (int) DB::table('scheduled_refunds')->max('id') + 1;
            return DB::table('scheduled_refunds')->insertGetId(array_merge($validated, [
                'refund_no' => 'RF-' . now()->format('ymd') . '-' . str_pad((string) $next, 6, '0', STR_PAD_LEFT),
                'status' => 'pending_approval', 'created_by' => $request->user()->id,
                'updated_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(),
            ]));
        });
        return response()->json(['status' => true, 'message' => 'Refund scheduled for approval.', 'data' => DB::table('scheduled_refunds')->find($id)], 201);
    }

    public function refundAction(Request $request, int $refundId): JsonResponse
    {
        $validated = $request->validate([
            'action' => ['required', Rule::in(['approve', 'ready_to_pay', 'paid', 'reschedule', 'cancel', 'remind'])],
            'scheduled_at' => ['nullable', 'date'], 'payment_reference' => ['nullable', 'string', 'max:120'],
            'notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $refund = DB::table('scheduled_refunds')->lockForUpdate()->find($refundId);
        abort_unless($refund, 404, 'Scheduled refund not found.');
        $action = $validated['action'];
        $allowed = [
            'approve' => ['pending_approval'], 'ready_to_pay' => ['approved', 'overdue'],
            'paid' => ['ready_to_pay', 'overdue'], 'reschedule' => ['pending_approval', 'approved', 'ready_to_pay', 'overdue'],
            'cancel' => ['pending_approval', 'approved', 'ready_to_pay', 'overdue'], 'remind' => ['approved', 'ready_to_pay', 'overdue'],
        ];
        abort_unless(in_array($refund->status, $allowed[$action], true), 422, 'This refund action is not valid from the current status.');

        $updates = ['updated_by' => $request->user()->id, 'updated_at' => now()];
        if ($action === 'approve') $updates += ['status' => 'approved', 'approved_by' => $request->user()->id, 'approved_at' => now()];
        if ($action === 'ready_to_pay') $updates += ['status' => 'ready_to_pay', 'ready_by' => $request->user()->id, 'ready_at' => now()];
        if ($action === 'paid') $updates += ['status' => 'paid', 'paid_by' => $request->user()->id, 'paid_at' => now(), 'payment_reference' => $validated['payment_reference'] ?? null];
        if ($action === 'reschedule') $updates += ['status' => 'approved', 'scheduled_at' => $validated['scheduled_at'] ?? $refund->scheduled_at];
        if ($action === 'cancel') $updates += ['status' => 'cancelled'];
        if ($action === 'remind') $updates += ['last_reminded_at' => now(), 'reminder_count' => ((int) $refund->reminder_count) + 1];
        if (array_key_exists('notes', $validated)) $updates['notes'] = $validated['notes'];
        DB::table('scheduled_refunds')->where('id', $refundId)->update($updates);
        return response()->json(['status' => true, 'message' => 'Scheduled refund updated.', 'data' => DB::table('scheduled_refunds')->find($refundId)]);
    }

    public function prices(Request $request): JsonResponse
    {
        $query = DB::table('supplier_price_submissions as prices')
            ->leftJoin('suppliers', 'suppliers.id', '=', 'prices.supplier_id')
            ->select('prices.*', 'suppliers.name as supplier_name', 'suppliers.phone as supplier_phone', 'suppliers.supplier_code', 'suppliers.reliability_score');
        if ($request->filled('product_id')) $query->where('prices.product_id', $request->product_id);
        if ($request->filled('status')) $query->where('prices.status', $request->status);
        return response()->json(['status' => true, 'data' => $query->orderBy('prices.unit_price')->orderByDesc('suppliers.reliability_score')->paginate((int) $request->get('per_page', 50))]);
    }

    public function storePrice(Request $request): JsonResponse
    {
        abort_unless($this->isOnlineActivist($request->user()) || app(AccessControlService::class)->isSuperAdmin($request->user()), 403, 'Only Online Activist or Super Admin may enter supplier prices.');
        $validated = $request->validate([
            'supplier_id' => ['required', 'integer'], 'product_id' => ['nullable', 'integer'], 'product_variant_id' => ['nullable', 'integer'],
            'product_name' => ['required', 'string', 'max:255'], 'variant_name' => ['nullable', 'string', 'max:255'],
            'unit_price' => ['required', 'numeric', 'gt:0'], 'warranty' => ['nullable', 'string', 'max:255'],
            'available_quantity' => ['required', 'integer', 'min:0'], 'minimum_order_quantity' => ['required', 'integer', 'min:1'],
            'delivery_cost' => ['nullable', 'numeric', 'min:0'], 'delivery_days' => ['nullable', 'integer', 'min:0'],
            'valid_until' => ['nullable', 'date'], 'availability_status' => ['required', Rule::in(['available', 'limited', 'out_of_stock', 'preorder'])],
            'source_url' => ['nullable', 'url', 'max:2000'], 'notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $id = DB::table('supplier_price_submissions')->insertGetId(array_merge($validated, [
            'delivery_cost' => $validated['delivery_cost'] ?? 0, 'status' => 'submitted',
            'submitted_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(),
        ]));
        return response()->json(['status' => true, 'message' => 'Supplier price submitted for Super Admin comparison.', 'data' => DB::table('supplier_price_submissions')->find($id)], 201);
    }

    public function purchaseOrders(Request $request): JsonResponse
    {
        $query = DB::table('nst_purchase_orders as po')->leftJoin('suppliers', 'suppliers.id', '=', 'po.supplier_id')
            ->select('po.*', 'suppliers.name as supplier_name', 'suppliers.phone as supplier_phone', 'suppliers.supplier_code');
        if ($request->filled('status')) $query->where('po.status', $request->status);
        return response()->json(['status' => true, 'data' => $query->latest('po.id')->paginate((int) $request->get('per_page', 30))]);
    }

    public function storePurchaseOrder(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        $validated = $request->validate([
            'supplier_id' => ['required', 'integer'], 'branch_id' => ['nullable', 'integer'],
            'delivery_cost' => ['nullable', 'numeric', 'min:0'], 'expected_delivery_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:5000'], 'items' => ['required', 'array', 'min:1'],
            'items.*.supplier_price_submission_id' => ['nullable', 'integer'], 'items.*.product_id' => ['nullable', 'integer'],
            'items.*.product_variant_id' => ['nullable', 'integer'], 'items.*.product_name' => ['required', 'string', 'max:255'],
            'items.*.variant_name' => ['nullable', 'string', 'max:255'], 'items.*.quantity' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'gt:0'],
        ]);
        $poId = DB::transaction(function () use ($validated, $request) {
            $subtotal = collect($validated['items'])->sum(fn ($item) => ((int) $item['quantity']) * ((float) $item['unit_price']));
            $delivery = (float) ($validated['delivery_cost'] ?? 0);
            $next = (int) DB::table('nst_purchase_orders')->max('id') + 1;
            $id = DB::table('nst_purchase_orders')->insertGetId([
                'po_number' => 'PO-' . now()->format('ymd') . '-' . str_pad((string) $next, 6, '0', STR_PAD_LEFT),
                'supplier_id' => $validated['supplier_id'], 'branch_id' => $validated['branch_id'] ?? null,
                'status' => 'draft', 'subtotal' => $subtotal, 'delivery_cost' => $delivery, 'total' => $subtotal + $delivery,
                'expected_delivery_at' => $validated['expected_delivery_at'] ?? null, 'notes' => $validated['notes'] ?? null,
                'created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(),
            ]);
            foreach ($validated['items'] as $item) {
                DB::table('nst_purchase_order_items')->insert([
                    'purchase_order_id' => $id, 'supplier_price_submission_id' => $item['supplier_price_submission_id'] ?? null,
                    'product_id' => $item['product_id'] ?? null, 'product_variant_id' => $item['product_variant_id'] ?? null,
                    'product_name' => $item['product_name'], 'variant_name' => $item['variant_name'] ?? null,
                    'quantity' => $item['quantity'], 'unit_price' => $item['unit_price'],
                    'line_total' => ((int) $item['quantity']) * ((float) $item['unit_price']), 'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            return $id;
        });
        return response()->json(['status' => true, 'message' => 'Purchase Order draft created. Only Super Admin can approve and send it.', 'data' => DB::table('nst_purchase_orders')->find($poId)], 201);
    }

    public function purchaseOrderAction(Request $request, int $purchaseOrderId): JsonResponse
    {
        $this->requireSuperAdmin($request);
        $validated = $request->validate(['action' => ['required', Rule::in(['approve', 'send', 'cancel'])]]);
        $po = DB::table('nst_purchase_orders')->find($purchaseOrderId);
        abort_unless($po, 404, 'Purchase Order not found.');
        $action = $validated['action'];
        if ($action === 'approve') abort_unless($po->status === 'draft', 422, 'Only a draft Purchase Order can be approved.');
        if ($action === 'send') abort_unless($po->status === 'approved', 422, 'Approve the Purchase Order before sending it.');
        if ($action === 'cancel') abort_unless(in_array($po->status, ['draft', 'approved'], true), 422, 'This Purchase Order cannot be cancelled.');
        $updates = ['status' => $action === 'send' ? 'sent' : ($action === 'cancel' ? 'cancelled' : 'approved'), 'updated_at' => now()];
        if ($action === 'approve') $updates += ['approved_by' => $request->user()->id, 'approved_at' => now()];
        if ($action === 'send') $updates += ['sent_by' => $request->user()->id, 'sent_at' => now()];
        DB::table('nst_purchase_orders')->where('id', $purchaseOrderId)->update($updates);
        return response()->json(['status' => true, 'message' => 'Purchase Order updated.', 'data' => DB::table('nst_purchase_orders')->find($purchaseOrderId)]);
    }

    public function financialPolicies(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        return response()->json(['status' => true, 'data' => DB::table('financial_view_policies')->latest('id')->paginate((int) $request->get('per_page', 50))]);
    }

    public function saveFinancialPolicy(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        $validated = $request->validate([
            'id' => ['nullable', 'integer'], 'subject_type' => ['required', Rule::in(['everyone', 'role', 'user'])],
            'subject_id' => ['nullable', 'integer'], 'branch_id' => ['nullable', 'integer'], 'module_key' => ['required', 'string', 'max:80'],
            'mode' => ['required', Rule::in(['full_actual', 'restricted', 'none'])],
            'reduction_percent' => ['nullable', 'integer', 'between:40,60'], 'enabled' => ['nullable', 'boolean'],
        ]);
        if ($validated['subject_type'] !== 'everyone' && empty($validated['subject_id'])) abort(422, 'A role or user is required.');
        if ($validated['mode'] === 'restricted' && empty($validated['reduction_percent'])) $validated['reduction_percent'] = 50;
        if ($validated['mode'] !== 'restricted') $validated['reduction_percent'] = null;
        $payload = array_merge($validated, [
            'subject_id' => $validated['subject_type'] === 'everyone' ? null : $validated['subject_id'],
            'deterministic_seed' => hash('sha256', implode('|', [$validated['subject_type'], $validated['subject_id'] ?? 'all', $validated['branch_id'] ?? 'all', $validated['module_key']])),
            'enabled' => $validated['enabled'] ?? true, 'updated_by' => $request->user()->id, 'updated_at' => now(),
        ]);
        $id = $payload['id'] ?? null; unset($payload['id']);
        if ($id) DB::table('financial_view_policies')->where('id', $id)->update($payload);
        else $id = DB::table('financial_view_policies')->insertGetId($payload + ['created_by' => $request->user()->id, 'created_at' => now()]);
        return response()->json(['status' => true, 'message' => 'Financial View policy saved.', 'data' => DB::table('financial_view_policies')->find($id)]);
    }

    private function refreshOverdueRefunds(): void
    {
        if (! Schema::hasTable('scheduled_refunds')) return;
        DB::table('scheduled_refunds')->whereIn('status', ['approved', 'ready_to_pay'])->where('scheduled_at', '<', now())->update(['status' => 'overdue', 'updated_at' => now()]);
    }

    private function requireSuperAdmin(Request $request): void
    {
        abort_unless(app(AccessControlService::class)->isSuperAdmin($request->user()), 403, 'Only Super Admin may perform this action.');
    }

    private function isOnlineActivist($user): bool
    {
        return in_array('online_activist', app(AccessControlService::class)->roleNames($user), true);
    }
}
