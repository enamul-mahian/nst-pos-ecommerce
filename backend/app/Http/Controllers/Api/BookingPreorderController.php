<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BookingPreorder;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Services\CorporateSettingService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BookingPreorderController extends Controller
{
    private const PAYMENT_METHODS = ['cash_on_delivery', 'bkash_agent', 'nagad_agent'];
    private const PAYMENT_STATUSES = ['cod_pending', 'pending', 'pending_verification', 'approved', 'rejected'];

    public function __construct(private CorporateSettingService $settings)
    {
    }

    public function index(Request $request)
    {
        $items = BookingPreorder::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('payment_status'), fn ($q) => $q->where('payment_status', $request->payment_status))
            ->when($request->filled('search'), function ($q) use ($request) {
                $s = $request->search;
                $q->where(function ($qq) use ($s) {
                    $qq->where('booking_no', 'like', "%{$s}%")
                        ->orWhere('customer_name', 'like', "%{$s}%")
                        ->orWhere('customer_phone', 'like', "%{$s}%")
                        ->orWhere('product_name', 'like', "%{$s}%")
                        ->orWhere('transaction_id', 'like', "%{$s}%");
                });
            })
            ->latest('id')
            ->paginate((int) $request->get('per_page', 20));

        return response()->json(['success' => true, 'data' => $items]);
    }

    public function store(Request $request)
    {
        $validated = $this->validated($request);
        $booking = $this->createBooking($validated, $request->user()?->id);
        return response()->json(['success' => true, 'message' => 'Booking/pre-order saved.', 'data' => $booking], 201);
    }

    public function publicStore(Request $request)
    {
        $validated = $this->validated($request, true);
        $booking = $this->createBooking($validated, null);
        return response()->json(['success' => true, 'message' => 'Booking request submitted.', 'data' => $booking], 201);
    }

    public function show(BookingPreorder $bookingPreorder)
    {
        return response()->json(['success' => true, 'data' => $bookingPreorder]);
    }

    public function update(Request $request, BookingPreorder $bookingPreorder)
    {
        $validated = $request->validate([
            'customer_name' => ['nullable', 'string', 'max:150'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'customer_email' => ['nullable', 'email', 'max:150'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', Rule::in(self::PAYMENT_METHODS)],
            'transaction_id' => ['nullable', 'string', 'max:190'],
            'payment_status' => ['nullable', Rule::in(self::PAYMENT_STATUSES)],
            'payment_rejection_reason' => ['nullable', 'string', 'max:1000'],
            'status' => ['nullable', 'string', 'max:50'],
            'custom_status' => ['nullable', 'string', 'max:120'],
            'expected_date' => ['nullable', 'date'],
            'expires_at' => ['nullable', 'date'],
            'note' => ['nullable', 'string'],
            'admin_note' => ['nullable', 'string'],
        ]);

        $paymentMethod = $validated['payment_method'] ?? $bookingPreorder->payment_method ?? 'cash_on_delivery';
        $transactionId = trim((string) ($validated['transaction_id'] ?? $bookingPreorder->transaction_id ?? ''));
        $manualPayment = in_array($paymentMethod, ['bkash_agent', 'nagad_agent'], true);
        if ($manualPayment && array_key_exists('payment_status', $validated) && $validated['payment_status'] === 'approved' && $transactionId === '') {
            return response()->json(['success' => false, 'message' => 'Transaction ID is required before approving bKash/Nagad agent payment.'], 422);
        }

        if (isset($validated['payment_status']) && in_array($validated['payment_status'], ['approved', 'rejected'], true)) {
            $this->requirePaymentReviewer($request);
            $validated['payment_verified_at'] = now();
            $validated['payment_verified_by'] = $request->user()?->id;
            if ($validated['payment_status'] === 'approved') {
                $validated['payment_rejection_reason'] = null;
            }
        }

        $validated['updated_by'] = $request->user()?->id;
        $paid = array_key_exists('paid_amount', $validated) ? (float) $validated['paid_amount'] : (float) $bookingPreorder->paid_amount;
        $validated['due_amount'] = max(((float) $bookingPreorder->required_deposit) - $paid, 0);
        $validated['status_history'] = $this->appendHistory($bookingPreorder, [
            'status' => $validated['status'] ?? $bookingPreorder->status,
            'custom_status' => $validated['custom_status'] ?? $bookingPreorder->custom_status,
            'payment_status' => $validated['payment_status'] ?? $bookingPreorder->payment_status,
            'changed_at' => now()->toIso8601String(),
            'changed_by' => $request->user()?->id,
            'source' => 'staff_update',
        ]);

        $bookingPreorder->update($validated);
        return response()->json(['success' => true, 'message' => 'Booking updated.', 'data' => $bookingPreorder->fresh()]);
    }

    public function status(Request $request, BookingPreorder $bookingPreorder)
    {
        $validated = $request->validate([
            'status' => ['nullable', 'string', 'max:50'],
            'custom_status' => ['nullable', 'string', 'max:120'],
            'payment_status' => ['nullable', Rule::in(self::PAYMENT_STATUSES)],
            'reason' => ['nullable', 'string', 'max:1000'],
            'admin_note' => ['nullable', 'string'],
        ]);

        if (! isset($validated['status']) && ! isset($validated['custom_status']) && ! isset($validated['payment_status'])) {
            return response()->json(['success' => false, 'message' => 'Status, custom status or payment status is required.'], 422);
        }

        $payload = [
            'status' => $validated['status'] ?? $bookingPreorder->status,
            'custom_status' => $validated['custom_status'] ?? $bookingPreorder->custom_status,
            'admin_note' => $validated['admin_note'] ?? $bookingPreorder->admin_note,
            'updated_by' => $request->user()?->id,
        ];

        if (isset($validated['payment_status'])) {
            if (in_array($validated['payment_status'], ['approved', 'rejected'], true)) {
                $this->requirePaymentReviewer($request);
                if ($validated['payment_status'] === 'approved'
                    && in_array($bookingPreorder->payment_method, ['bkash_agent', 'nagad_agent'], true)
                    && ! $bookingPreorder->transaction_id) {
                    return response()->json(['success' => false, 'message' => 'Transaction ID is required before approval.'], 422);
                }
                $payload['payment_verified_at'] = now();
                $payload['payment_verified_by'] = $request->user()?->id;
                $payload['payment_rejection_reason'] = $validated['payment_status'] === 'rejected'
                    ? ($validated['reason'] ?? 'Rejected by staff.')
                    : null;
            }
            $payload['payment_status'] = $validated['payment_status'];
        }

        $payload['status_history'] = $this->appendHistory($bookingPreorder, [
            'status' => $payload['status'],
            'custom_status' => $payload['custom_status'],
            'payment_status' => $payload['payment_status'] ?? $bookingPreorder->payment_status,
            'reason' => $payload['payment_rejection_reason'] ?? null,
            'changed_at' => now()->toIso8601String(),
            'changed_by' => $request->user()?->id,
            'source' => 'staff_status',
        ]);

        $bookingPreorder->update($payload);
        return response()->json(['success' => true, 'message' => 'Booking status updated.', 'data' => $bookingPreorder->fresh()]);
    }

    public function publicStatus(Request $request)
    {
        $validated = $request->validate([
            'booking_no' => ['required', 'string'],
            'phone' => ['required', 'string'],
        ]);
        $booking = BookingPreorder::where('booking_no', $validated['booking_no'])
            ->where('customer_phone', $validated['phone'])
            ->firstOrFail();
        return response()->json(['success' => true, 'data' => $booking]);
    }

    private function createBooking(array $validated, ?int $userId): BookingPreorder
    {
        return DB::transaction(function () use ($validated, $userId) {
            $product = Product::find($validated['product_id'] ?? null);
            $variantId = $validated['product_variant_id'] ?? $validated['variant_id'] ?? null;
            $variant = $variantId && $product ? ProductVariant::query()->where('product_id', $product->id)->find($variantId) : null;
            if ($variantId && ! $variant) {
                throw new HttpResponseException(response()->json(['success' => false, 'message' => 'Selected product variant is invalid.'], 422));
            }
            $price = (float) ($validated['product_price'] ?? $product?->sale_price ?? $product?->regular_price ?? 0);
            $required = $this->requiredDeposit($price, $product);
            $paid = (float) ($validated['paid_amount'] ?? 0);
            $paymentMethod = $validated['payment_method'] ?? 'cash_on_delivery';
            $paymentSettings = $this->settings->section('payments');
            $enabledKey = $paymentMethod . '_enabled';
            if (array_key_exists($enabledKey, $paymentSettings) && ! (bool) $paymentSettings[$enabledKey]) {
                throw new HttpResponseException(response()->json([
                    'success' => false,
                    'message' => 'The selected payment method is currently disabled.',
                ], 422));
            }
            $manualPayment = in_array($paymentMethod, ['bkash_agent', 'nagad_agent'], true);
            $transactionId = trim((string) ($validated['transaction_id'] ?? ''));

            if ($manualPayment && ($transactionId === '' || $paid <= 0)) {
                throw new HttpResponseException(response()->json([
                    'success' => false,
                    'message' => 'Transaction ID and paid amount are required for bKash/Nagad agent payment.',
                ], 422));
            }

            $status = $manualPayment ? 'payment_submitted' : ($paid >= $required && $required > 0 ? 'booked' : 'pending_payment');
            $customStatus = $validated['custom_status'] ?? ($manualPayment ? 'Payment Submitted for Verification' : 'Order Recorded');
            $paymentStatus = $manualPayment ? 'pending_verification' : 'cod_pending';
            $history = [[
                'status' => $status,
                'custom_status' => $customStatus,
                'payment_status' => $paymentStatus,
                'changed_at' => now()->toIso8601String(),
                'changed_by' => $userId,
                'source' => $userId ? 'staff_create' : 'public_create',
            ]];

            return BookingPreorder::create([
                'booking_no' => $this->makeBookingNo(),
                'product_id' => $product?->id,
                'product_variant_id' => $variant?->id,
                'sku' => $variant?->sku ?: $product?->sku,
                'color' => $variant?->color_name ?: $variant?->color,
                'storage' => $variant?->storage,
                'ram' => $variant?->ram ?: $variant?->ram_storage,
                'country_region' => $variant?->country_region ?: $variant?->region ?: $variant?->region_variant,
                'sim_type' => $variant?->sim_type,
                'network_carrier' => $variant?->network_carrier ?: $variant?->sim_network,
                'condition' => $variant?->condition ?: $product?->condition,
                'variant_snapshot' => $variant ? [
                    'variant_id' => $variant->id, 'sku' => $variant->sku, 'storage' => $variant->storage,
                    'ram' => $variant->ram ?: $variant->ram_storage, 'color' => $variant->color_name ?: $variant->color,
                    'country_region' => $variant->country_region ?: $variant->region ?: $variant->region_variant,
                    'sim_type' => $variant->sim_type, 'network_carrier' => $variant->network_carrier ?: $variant->sim_network,
                    'condition' => $variant->condition ?: $product?->condition, 'branch_id' => $validated['branch_id'] ?? $variant->branch_id,
                ] : null,
                'customer_id' => $validated['customer_id'] ?? null,
                'branch_id' => $validated['branch_id'] ?? null,
                'product_name' => $validated['product_name'] ?? $product?->name,
                'customer_name' => $validated['customer_name'] ?? null,
                'customer_phone' => $validated['customer_phone'],
                'customer_email' => $validated['customer_email'] ?? null,
                'product_price' => $price,
                'required_deposit' => $required,
                'paid_amount' => $paid,
                'due_amount' => max($required - $paid, 0),
                'payment_method' => $paymentMethod,
                'transaction_id' => $manualPayment ? $transactionId : null,
                'payment_status' => $paymentStatus,
                'payment_submitted_at' => $manualPayment ? now() : null,
                'status' => $status,
                'custom_status' => $customStatus,
                'status_history' => $history,
                'expected_date' => $validated['expected_date'] ?? null,
                'expires_at' => now()->addDays((int) ($this->settings->section('booking')['booking_expiry_days'] ?? 7))->toDateString(),
                'note' => $validated['note'] ?? null,
                'created_by' => $userId,
                'updated_by' => $userId,
            ]);
        });
    }

    private function requiredDeposit(float $price, ?Product $product): float
    {
        $settings = $this->settings->section('booking');
        $percent = (float) ($product->minimum_booking_value ?? $settings['minimum_booking_percent'] ?? 10);
        $fixed = (float) ($settings['minimum_fixed_amount'] ?? 0);
        return max(round(($price * $percent) / 100, 2), $fixed);
    }

    private function makeBookingNo(): string
    {
        $prefix = 'NST-BOOK-' . now()->format('ymd') . '-';
        $next = (BookingPreorder::where('booking_no', 'like', $prefix . '%')->count() + 1);
        return $prefix . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }

    private function validated(Request $request, bool $public = false): array
    {
        return $request->validate([
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'product_variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'product_name' => ['nullable', 'string', 'max:200'],
            'customer_name' => ['nullable', 'string', 'max:150'],
            'customer_phone' => ['required', 'string', 'max:50'],
            'customer_email' => ['nullable', 'email', 'max:150'],
            'product_price' => ['nullable', 'numeric', 'min:0'],
            'paid_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', Rule::in(self::PAYMENT_METHODS)],
            'transaction_id' => ['nullable', 'string', 'max:190'],
            'custom_status' => ['nullable', 'string', 'max:120'],
            'expected_date' => ['nullable', 'date'],
            'note' => ['nullable', 'string'],
        ]);
    }

    private function appendHistory(BookingPreorder $booking, array $entry): array
    {
        $history = is_array($booking->status_history) ? $booking->status_history : [];
        $history[] = $entry;
        return array_slice($history, -100);
    }

    private function requirePaymentReviewer(Request $request): void
    {
        $user = $request->user();
        $roles = method_exists($user, 'getRoleNames')
            ? $user->getRoleNames()->map(fn ($role) => strtolower(str_replace([' ', '-'], '_', (string) $role)))->all()
            : [strtolower(str_replace([' ', '-'], '_', (string) ($user->role ?? '')))];

        if (! array_intersect($roles, ['super_admin', 'admin', 'accountant', 'accounts'])) {
            throw new HttpResponseException(response()->json([
                'success' => false,
                'message' => 'Only Super Admin, Admin or Accountant can verify or reject agent payments.',
            ], 403));
        }
    }
}
