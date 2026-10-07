<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerOrder;
use App\Models\CustomerOrderTimelineEvent;
use App\Models\OrderDelivery;
use App\Models\Sale;
use App\Services\AccessControlService;
use App\Services\ReleaseScopeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class DeliveryController extends Controller
{
    private const TRANSITIONS = [
        'pending' => ['scheduled', 'ready_for_delivery', 'cancelled'],
        'scheduled' => ['ready_for_delivery', 'dispatched', 'cancelled'],
        'ready_for_delivery' => ['dispatched', 'delivered', 'cancelled'],
        'dispatched' => ['delivered', 'failed', 'returned'],
        'failed' => ['scheduled', 'returned', 'cancelled'],
        'delivered' => ['completed', 'returned'],
        'completed' => [],
        'returned' => [],
        'cancelled' => [],
    ];

    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly ReleaseScopeService $releaseScope,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = OrderDelivery::with([
            'order:id,order_no,branch_id,customer_name,customer_phone,total_amount,payment_method,payment_status,status,delivery_status,delivery_address',
            'sale:id,invoice_no,status,delivery_status', 'updatedBy:id,name',
        ])->latest('id');

        if (! $this->globalScope($request)) {
            $query->whereHas('order', fn ($q) => $q->whereIn('branch_id', $this->releaseScope->branchIds($request) ?: [-1]));
        }
        if ($request->filled('status')) $query->where('status', $request->input('status'));
        if ($request->filled('branch_id')) $query->whereHas('order', fn ($q) => $q->where('branch_id', $request->integer('branch_id')));
        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(function ($q) use ($search) {
                $q->where('tracking_number', 'like', "%{$search}%")
                    ->orWhere('driver_phone', 'like', "%{$search}%")
                    ->orWhereHas('order', fn ($o) => $o->where('order_no', 'like', "%{$search}%")
                        ->orWhere('customer_name', 'like', "%{$search}%")
                        ->orWhere('customer_phone', 'like', "%{$search}%"));
            });
        }

        return response()->json(['status' => true, 'data' => $query->paginate(min(100, max(10, (int) $request->input('per_page', 30))))]);
    }

    public function show(Request $request, CustomerOrder $order): JsonResponse
    {
        $this->ensureBranchAccess($request, $order);
        $delivery = OrderDelivery::where('customer_order_id', $order->id)->first();
        if (! $delivery) {
            return response()->json(['status' => true, 'data' => [
                'id' => null,
                'customer_order_id' => $order->id,
                'sale_id' => $order->sale_id,
                'status' => $order->delivery_status ?: 'pending',
                'delivery_address' => $order->delivery_address,
                'order' => $order->load('items'),
                'sale' => $order->sale,
            ]]);
        }

        return response()->json(['status' => true, 'data' => $delivery->load(['order.items', 'sale', 'updatedBy:id,name'])]);
    }

    public function update(Request $request, CustomerOrder $order): JsonResponse
    {
        $this->ensureBranchAccess($request, $order);
        $delivery = OrderDelivery::firstOrCreate(
            ['customer_order_id' => $order->id],
            ['sale_id' => $order->sale_id, 'status' => $order->delivery_status ?: 'pending', 'delivery_address' => $order->delivery_address]
        );

        $validated = $request->validate([
            'status' => ['required', Rule::in(array_keys(self::TRANSITIONS))],
            'courier_name' => ['nullable', 'string', 'max:190'],
            'tracking_number' => ['nullable', 'string', 'max:190'],
            'driver_name' => ['nullable', 'string', 'max:190'],
            'driver_phone' => ['nullable', 'string', 'max:60'],
            'delivery_address' => ['nullable', 'string', 'max:3000'],
            'scheduled_at' => ['nullable', 'date'],
            'received_by' => ['nullable', 'string', 'max:190'],
            'proof' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);

        $current = $delivery->status ?: 'pending';
        $next = $validated['status'];
        if ($next !== $current) {
            abort_unless(in_array($next, self::TRANSITIONS[$current] ?? [], true), 422, "Delivery status cannot change from {$current} to {$next}.");
        }

        $updated = DB::transaction(function () use ($request, $order, $delivery, $validated, $current, $next) {
            $lockedOrder = CustomerOrder::whereKey($order->id)->lockForUpdate()->firstOrFail();
            $lockedDelivery = OrderDelivery::whereKey($delivery->id)->lockForUpdate()->firstOrFail();
            abort_unless(($lockedDelivery->status ?: 'pending') === $current, 409, 'Delivery was changed by another user. Reload and try again.');

            $proofPath = $lockedDelivery->proof_path;
            if ($request->hasFile('proof')) {
                $proofPath = $request->file('proof')->store('delivery-proofs/' . $lockedOrder->id, 'public');
                if ($lockedDelivery->proof_path && $lockedDelivery->proof_path !== $proofPath) {
                    Storage::disk('public')->delete($lockedDelivery->proof_path);
                }
            }

            $payload = [
                'sale_id' => $lockedOrder->sale_id,
                'status' => $next,
                'courier_name' => $validated['courier_name'] ?? $lockedDelivery->courier_name,
                'tracking_number' => $validated['tracking_number'] ?? $lockedDelivery->tracking_number,
                'driver_name' => $validated['driver_name'] ?? $lockedDelivery->driver_name,
                'driver_phone' => $validated['driver_phone'] ?? $lockedDelivery->driver_phone,
                'delivery_address' => $validated['delivery_address'] ?? $lockedDelivery->delivery_address ?? $lockedOrder->delivery_address,
                'scheduled_at' => $validated['scheduled_at'] ?? $lockedDelivery->scheduled_at,
                'received_by' => $validated['received_by'] ?? $lockedDelivery->received_by,
                'proof_path' => $proofPath,
                'note' => $validated['note'] ?? $lockedDelivery->note,
                'updated_by' => $request->user()?->id,
            ];
            if ($next === 'dispatched' && ! $lockedDelivery->dispatched_at) $payload['dispatched_at'] = now();
            if (in_array($next, ['delivered', 'completed'], true) && ! $lockedDelivery->delivered_at) $payload['delivered_at'] = now();
            $lockedDelivery->update($payload);

            $orderStatus = match ($next) {
                'scheduled', 'ready_for_delivery', 'dispatched' => 'processing',
                'delivered' => 'delivered',
                'completed' => 'completed',
                'cancelled' => 'delivery_cancelled',
                'returned' => 'delivery_returned',
                'failed' => 'delivery_failed',
                default => $lockedOrder->status,
            };
            $history = is_array($lockedOrder->status_history) ? $lockedOrder->status_history : [];
            $history[] = [
                'status' => $orderStatus,
                'custom_status' => ucwords(str_replace('_', ' ', $next)),
                'payment_status' => $lockedOrder->payment_status,
                'delivery_status' => $next,
                'changed_at' => now()->toIso8601String(),
                'changed_by' => $request->user()?->id,
                'source' => 'delivery',
                'tracking_number' => $payload['tracking_number'],
            ];

            $orderPayload = ['status' => $orderStatus, 'delivery_status' => $next, 'status_history' => $history];
            if (in_array($next, ['delivered', 'completed'], true)) $orderPayload['delivered_at'] = $lockedOrder->delivered_at ?: now();
            if ($next === 'completed') $orderPayload['completed_at'] = $lockedOrder->completed_at ?: now();
            if ($next === 'cancelled') $orderPayload['cancelled_at'] = $lockedOrder->cancelled_at ?: now();
            $lockedOrder->forceFill($orderPayload)->save();

            if ($lockedOrder->sale_id) {
                Sale::whereKey($lockedOrder->sale_id)->update([
                    'delivery_status' => $next,
                    'status' => $next === 'completed' ? 'completed' : 'processing',
                ]);
            }

            if (Schema::hasTable('customer_order_timeline_events')) {
            CustomerOrderTimelineEvent::create([
                'customer_order_id' => $lockedOrder->id,
                'event_type' => 'delivery',
                'status' => $next,
                'title' => 'Delivery ' . ucwords(str_replace('_', ' ', $next)),
                'description' => $validated['note'] ?? null,
                'metadata' => [
                    'courier_name' => $payload['courier_name'],
                    'tracking_number' => $payload['tracking_number'],
                    'driver_name' => $payload['driver_name'],
                    'received_by' => $payload['received_by'],
                ],
                'customer_visible' => true,
                'created_by' => $request->user()?->id,
                'event_at' => now(),
            ]);
            }

            return $lockedDelivery;
        });

        return response()->json(['status' => true, 'message' => 'Delivery updated successfully.', 'data' => $updated->fresh()->load(['order.items', 'sale', 'updatedBy:id,name'])]);
    }

    private function ensureBranchAccess(Request $request, CustomerOrder $order): void
    {
        if ($this->accessControl->isSuperAdmin($request->user())) {
            return;
        }
        $this->releaseScope->assertBranch($request, $order->branch_id ? (int) $order->branch_id : null, 'You cannot manage delivery for this branch.');
    }

    private function globalScope(Request $request): bool
    {
        return $this->accessControl->isSuperAdmin($request->user()) || $this->releaseScope->allowsAll($request);
    }
}
