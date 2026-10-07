<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use App\Models\SupplierPayment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class SupplierLedgerController extends Controller
{
    public function ledger(Supplier $supplier)
    {
        return response()->json([
            'success' => true,
            'data' => [
                'supplier' => $this->formatSupplier($supplier),
                'summary' => $this->getSupplierSummary($supplier),
                'purchases' => $this->getSupplierPurchases($supplier),
                'payments' => $this->getSupplierPayments($supplier),
            ],
        ]);
    }

    public function payDue(Request $request, Supplier $supplier)
    {
        $this->authorizeSupplierPayment($request);

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'payment_method' => ['required', 'string', 'max:100'],
            'provider_name' => ['nullable', 'string', 'max:150'],
            'transaction_id' => ['nullable', 'string', 'max:150'],
            'payment_slip' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,pdf', 'max:5120'],
            'note' => ['nullable', 'string'],
        ]);

        $paymentSlipPath = null;

        if ($request->hasFile('payment_slip')) {
            $paymentSlipPath = $request
                ->file('payment_slip')
                ->store('supplier-payment-slips', 'public');
        }

        try {
            $result = DB::transaction(function () use ($request, $supplier, $validated, $paymentSlipPath) {
                $lockedSupplier = Supplier::where('id', $supplier->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                $amount = (float) $validated['amount'];
                $paymentMethod = $validated['payment_method'];
                $providerName = $validated['provider_name'] ?? $this->defaultProviderName($paymentMethod);
                $transactionId = $validated['transaction_id'] ?? null;
                $note = $validated['note'] ?? null;
                $paidBy = $request->user()?->id;

                $purchaseDueBefore = $this->getSupplierPurchaseDueTotal($lockedSupplier);
                $supplierBalanceBefore = $this->getSupplierBalance($lockedSupplier);

                $previousBalance = max($purchaseDueBefore, $supplierBalanceBefore);
                $remainingAmount = $amount;

                $dueColumn = $this->firstExistingColumn('purchases', [
                    'due_amount',
                    'current_due',
                    'balance_due',
                ]);

                $updatedPurchases = [];

                if ($dueColumn) {
                    $openPurchases = $this->supplierPurchaseQuery($lockedSupplier)
                        ->where($dueColumn, '>', 0)
                        ->orderBy('id')
                        ->lockForUpdate()
                        ->get();

                    foreach ($openPurchases as $purchase) {
                        if ($remainingAmount <= 0) {
                            break;
                        }

                        $purchaseDue = (float) ($purchase->{$dueColumn} ?? 0);

                        if ($purchaseDue <= 0) {
                            continue;
                        }

                        $adjustAmount = min($remainingAmount, $purchaseDue);
                        $newPurchaseDue = max($purchaseDue - $adjustAmount, 0);

                        $this->updatePurchaseDueAndPaid(
                            $purchase,
                            $dueColumn,
                            $adjustAmount,
                            $newPurchaseDue
                        );

                        $updatedPurchases[] = [
                            'purchase_id' => $purchase->id,
                            'old_due' => $purchaseDue,
                            'paid_now' => $adjustAmount,
                            'new_due' => $newPurchaseDue,
                        ];

                        $remainingAmount -= $adjustAmount;
                    }
                }

                $purchaseDueAfter = $this->getSupplierPurchaseDueTotal($lockedSupplier);

                if ($dueColumn) {
                    $newBalance = $purchaseDueAfter;
                } else {
                    $newBalance = max($previousBalance - $amount, 0);
                }

                /*
                |--------------------------------------------------------------------------
                | Advance Payment Logic
                |--------------------------------------------------------------------------
                | If the supplier has no due, or the paid amount exceeds the due,
                | the remaining amount is counted as an advance.
                */
                $extraAmount = max($remainingAmount, 0);

                $paymentData = [
                    'supplier_id' => $lockedSupplier->id,
                    'payment_method' => $paymentMethod,
                    'provider_name' => $providerName,
                    'transaction_id' => $transactionId,
                    'amount' => $amount,
                    'previous_balance' => $previousBalance,
                    'new_balance' => $newBalance,
                    'extra_amount' => $extraAmount,
                    'note' => $note,
                    'paid_by' => $paidBy,
                ];

                if (Schema::hasColumn('supplier_payments', 'payment_slip_path')) {
                    $paymentData['payment_slip_path'] = $paymentSlipPath;
                }

                if (Schema::hasColumn('supplier_payments', 'is_applied_to_purchases')) {
                    $paymentData['is_applied_to_purchases'] = true;
                }

                if (Schema::hasColumn('supplier_payments', 'applied_at')) {
                    $paymentData['applied_at'] = now();
                }

                $payment = SupplierPayment::create($paymentData);

                $this->updateSupplierBalance(
                    $lockedSupplier->id,
                    $newBalance,
                    $paidBy,
                    $extraAmount
                );

                return [
                    'payment' => $payment->load('payer:id,name,email'),
                    'supplier' => Supplier::find($lockedSupplier->id),
                    'updated_purchases' => $updatedPurchases,
                    'previous_balance' => $previousBalance,
                    'new_balance' => $newBalance,
                    'extra_amount' => $extraAmount,
                ];
            });

            return response()->json([
                'success' => true,
                'message' => $result['extra_amount'] > 0
                    ? 'Supplier advance payment saved successfully.'
                    : 'Supplier due payment saved and purchase due adjusted successfully.',
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            if ($paymentSlipPath) {
                Storage::disk('public')->delete($paymentSlipPath);
            }

            throw $e;
        }
    }

    public function recalculate(Supplier $supplier)
    {
        if (!Schema::hasTable('purchases')) {
            return response()->json([
                'success' => false,
                'message' => 'purchases table not found.',
            ], 404);
        }

        $dueColumn = $this->firstExistingColumn('purchases', [
            'due_amount',
            'current_due',
            'balance_due',
        ]);

        if (!$dueColumn) {
            return response()->json([
                'success' => false,
                'message' => 'purchases due column not found.',
            ], 422);
        }

        $result = DB::transaction(function () use ($supplier, $dueColumn) {
            $lockedSupplier = Supplier::where('id', $supplier->id)
                ->lockForUpdate()
                ->firstOrFail();

            $totalDue = (float) $this->supplierPurchaseQuery($lockedSupplier)
                ->sum($dueColumn);

            $this->updateSupplierBalance($lockedSupplier->id, $totalDue);

            return [
                'supplier_id' => $lockedSupplier->id,
                'current_balance' => $totalDue,
                'advance_balance' => $this->getSupplierAdvanceBalance($lockedSupplier),
            ];
        });

        return response()->json([
            'success' => true,
            'message' => 'Supplier due recalculated successfully.',
            'data' => $result,
        ]);
    }

   private function authorizeSupplierPayment(Request $request)
{
    $user = $request->user();

    if (!$user) {
        abort(401, 'Unauthenticated.');
    }

    /*
    |--------------------------------------------------------------------------
    | Allowed Roles
    |--------------------------------------------------------------------------
    | Role names are matched in any format:
    | Super Admin, super_admin, super-admin, SuperAdmin
    | are all supported.
    */
    $allowedNormalizedRoles = [
        'superadmin',
        'admin',
        'accounts',
        'accountant',
    ];

    $normalizeRole = function ($roleName) {
        return strtolower(
            str_replace([' ', '_', '-'], '', (string) $roleName)
        );
    };

    /*
    |--------------------------------------------------------------------------
    | Spatie Role Check
    |--------------------------------------------------------------------------
    */
    if (method_exists($user, 'hasRole')) {
        foreach (['Super Admin', 'super_admin', 'super-admin', 'SuperAdmin', 'Admin', 'Accounts', 'Accountant'] as $roleName) {
            if ($user->hasRole($roleName)) {
                return;
            }
        }
    }

    if (method_exists($user, 'hasAnyRole')) {
        if ($user->hasAnyRole([
            'Super Admin',
            'super_admin',
            'super-admin',
            'SuperAdmin',
            'Admin',
            'admin',
            'Accounts',
            'accounts',
            'Accountant',
            'accountant',
        ])) {
            return;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Direct user role column check
    |--------------------------------------------------------------------------
    */
    $directRoleFields = [
        $user->role ?? null,
        $user->role_name ?? null,
        $user->user_role ?? null,
        $user->user_type ?? null,
        $user->type ?? null,
    ];

    foreach ($directRoleFields as $roleField) {
        if ($roleField && in_array($normalizeRole($roleField), $allowedNormalizedRoles, true)) {
            return;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Loaded roles relationship check
    |--------------------------------------------------------------------------
    */
    if (isset($user->roles)) {
        foreach ($user->roles as $role) {
            $roleName = is_string($role) ? $role : ($role->name ?? $role->slug ?? '');

            if ($roleName && in_array($normalizeRole($roleName), $allowedNormalizedRoles, true)) {
                return;
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Force load roles relationship if available
    |--------------------------------------------------------------------------
    */
    if (method_exists($user, 'roles')) {
        try {
            $roles = $user->roles()->get();

            foreach ($roles as $role) {
                $roleName = $role->name ?? $role->slug ?? '';

                if ($roleName && in_array($normalizeRole($roleName), $allowedNormalizedRoles, true)) {
                    return;
                }
            }
        } catch (\Throwable $e) {
            //
        }
    }

    abort(403, 'Only Super Admin, Admin or Accounts can pay supplier due.');
}

    private function formatSupplier($supplier)
    {
        return [
            'id' => $supplier->id,
            'name' => $this->getObjectValue($supplier, ['name', 'supplier_name'], '-'),
            'phone' => $this->getObjectValue($supplier, ['phone', 'mobile'], '-'),
            'email' => $this->getObjectValue($supplier, ['email'], '-'),
            'address' => $this->getObjectValue($supplier, ['address'], '-'),
            'current_balance' => $this->getSupplierBalance($supplier),
            'advance_balance' => $this->getSupplierAdvanceBalance($supplier),
            'status' => $this->getObjectValue($supplier, ['status'], 'active'),
            'created_at' => $this->getObjectValue($supplier, ['created_at'], null),
        ];
    }

    private function getSupplierSummary($supplier)
    {
        if (!Schema::hasTable('purchases')) {
            return [
                'total_purchase' => 0,
                'total_purchase_amount' => 0,
                'total_paid_amount' => 0,
                'total_due_amount' => 0,
                'total_advance_amount' => $this->getSupplierAdvanceBalance($supplier),
                'last_purchase_date' => null,
            ];
        }

        $finalAmountColumn = $this->firstExistingColumn('purchases', [
            'final_amount',
            'total_amount',
            'grand_total',
            'bill_amount',
            'net_amount',
        ]);

        $paidAmountColumn = $this->firstExistingColumn('purchases', [
            'paid_amount',
            'total_paid',
        ]);

        $dueAmountColumn = $this->firstExistingColumn('purchases', [
            'due_amount',
            'current_due',
            'balance_due',
        ]);

        $dateColumn = $this->firstExistingColumn('purchases', [
            'created_at',
            'purchase_date',
        ]);

        $baseQuery = $this->supplierPurchaseQuery($supplier);

        return [
            'total_purchase' => (clone $baseQuery)->count(),
            'total_purchase_amount' => $finalAmountColumn ? (float) (clone $baseQuery)->sum($finalAmountColumn) : 0,
            'total_paid_amount' => $paidAmountColumn ? (float) (clone $baseQuery)->sum($paidAmountColumn) : 0,
            'total_due_amount' => $dueAmountColumn ? (float) (clone $baseQuery)->sum($dueAmountColumn) : 0,
            'total_advance_amount' => $this->getSupplierAdvanceBalance($supplier),
            'last_purchase_date' => $dateColumn ? (clone $baseQuery)->max($dateColumn) : null,
        ];
    }

    private function getSupplierPurchases($supplier)
    {
        if (!Schema::hasTable('purchases')) {
            return [];
        }

        $dateColumn = $this->firstExistingColumn('purchases', [
            'created_at',
            'purchase_date',
        ]);

        $purchases = $this->supplierPurchaseQuery($supplier)
            ->orderByDesc($dateColumn ?: 'id')
            ->limit(100)
            ->get();

        return $purchases->map(function ($purchase) {
            return [
                'id' => $purchase->id,
                'purchase_no' => $this->getObjectValue($purchase, [
                    'purchase_no',
                    'purchase_number',
                    'invoice_no',
                    'reference_no',
                ], 'PUR-' . $purchase->id),
                'final_amount' => (float) $this->getObjectValue($purchase, [
                    'final_amount',
                    'total_amount',
                    'grand_total',
                    'bill_amount',
                    'net_amount',
                ], 0),
                'paid_amount' => (float) $this->getObjectValue($purchase, [
                    'paid_amount',
                    'total_paid',
                ], 0),
                'due_amount' => (float) $this->getObjectValue($purchase, [
                    'due_amount',
                    'current_due',
                    'balance_due',
                ], 0),
                'payment_status' => $this->getObjectValue($purchase, ['payment_status'], null),
                'status' => $this->getObjectValue($purchase, ['status'], null),
                'created_at' => $this->getObjectValue($purchase, [
                    'created_at',
                    'purchase_date',
                ], null),
            ];
        })->values();
    }

    private function getSupplierPayments($supplier)
    {
        if (!Schema::hasTable('supplier_payments')) {
            return [];
        }

        return DB::table('supplier_payments')
            ->where('supplier_id', $supplier->id)
            ->orderByDesc('id')
            ->limit(200)
            ->get()
            ->map(function ($payment) {
                $slipPath = $this->getObjectValue($payment, ['payment_slip_path'], null);

                return [
                    'id' => $payment->id,
                    'payment_method' => $this->getObjectValue($payment, ['payment_method'], '-'),
                    'provider_name' => $this->getObjectValue($payment, ['provider_name'], '-'),
                    'transaction_id' => $this->getObjectValue($payment, ['transaction_id'], '-'),
                    'payment_slip_path' => $slipPath,
                    'payment_slip_url' => $slipPath ? Storage::disk('public')->url($slipPath) : null,
                    'amount' => (float) $this->getObjectValue($payment, ['amount'], 0),
                    'previous_balance' => (float) $this->getObjectValue($payment, ['previous_balance'], 0),
                    'new_balance' => (float) $this->getObjectValue($payment, ['new_balance'], 0),
                    'extra_amount' => (float) $this->getObjectValue($payment, ['extra_amount'], 0),
                    'created_at' => $this->getObjectValue($payment, ['created_at'], null),
                ];
            })
            ->values();
    }

    private function supplierPurchaseQuery($supplier)
    {
        $query = DB::table('purchases');

        if (!Schema::hasTable('purchases')) {
            return $query->whereRaw('1 = 0');
        }

        $supplierPhone = $this->getObjectValue($supplier, [
            'phone',
            'mobile',
            'supplier_phone',
        ], null);

        $hasCondition = false;

        $query->where(function ($q) use ($supplier, $supplierPhone, &$hasCondition) {
            if (Schema::hasColumn('purchases', 'supplier_id')) {
                $q->orWhere('supplier_id', $supplier->id);
                $hasCondition = true;
            }

            if ($supplierPhone) {
                foreach (['supplier_phone', 'phone', 'mobile'] as $column) {
                    if (Schema::hasColumn('purchases', $column)) {
                        $q->orWhere($column, $supplierPhone);
                        $hasCondition = true;
                    }
                }
            }
        });

        if (!$hasCondition) {
            $query->whereRaw('1 = 0');
        }

        return $query;
    }

    private function getSupplierPurchaseDueTotal($supplier)
    {
        if (!Schema::hasTable('purchases')) {
            return 0;
        }

        $dueColumn = $this->firstExistingColumn('purchases', [
            'due_amount',
            'current_due',
            'balance_due',
        ]);

        if (!$dueColumn) {
            return 0;
        }

        return (float) $this->supplierPurchaseQuery($supplier)->sum($dueColumn);
    }

    private function updatePurchaseDueAndPaid($purchase, $dueColumn, $adjustAmount, $newPurchaseDue)
    {
        $updateData = [
            $dueColumn => $newPurchaseDue,
        ];

        $paidColumn = $this->firstExistingColumn('purchases', [
            'paid_amount',
            'total_paid',
        ]);

        if ($paidColumn) {
            $oldPaid = (float) ($purchase->{$paidColumn} ?? 0);
            $updateData[$paidColumn] = $oldPaid + $adjustAmount;
        }

        $paymentStatusColumn = $this->firstExistingColumn('purchases', [
            'payment_status',
        ]);

        if ($paymentStatusColumn) {
            $updateData[$paymentStatusColumn] = $newPurchaseDue > 0 ? 'partial' : 'paid';
        }

        if (Schema::hasColumn('purchases', 'updated_at')) {
            $updateData['updated_at'] = now();
        }

        DB::table('purchases')
            ->where('id', $purchase->id)
            ->update($updateData);
    }

    private function updateSupplierBalance($supplierId, $newBalance, $userId = null, $advanceAmount = 0)
    {
        if (!Schema::hasTable('suppliers')) {
            return;
        }

        $updateData = [];

        foreach (['current_balance', 'balance', 'due_amount'] as $column) {
            if (Schema::hasColumn('suppliers', $column)) {
                $updateData[$column] = $newBalance;
            }
        }

        if ($userId && Schema::hasColumn('suppliers', 'updated_by')) {
            $updateData['updated_by'] = $userId;
        }

        if (Schema::hasColumn('suppliers', 'updated_at')) {
            $updateData['updated_at'] = now();
        }

        if (count($updateData) > 0) {
            DB::table('suppliers')
                ->where('id', $supplierId)
                ->update($updateData);
        }

        if ($advanceAmount > 0 && Schema::hasColumn('suppliers', 'advance_balance')) {
            DB::table('suppliers')
                ->where('id', $supplierId)
                ->increment('advance_balance', $advanceAmount);
        }
    }

    private function getSupplierBalance($supplier)
    {
        return (float) $this->getObjectValue($supplier, [
            'current_balance',
            'balance',
            'due_amount',
        ], 0);
    }

    private function getSupplierAdvanceBalance($supplier)
    {
        if (Schema::hasColumn('suppliers', 'advance_balance')) {
            return (float) ($supplier->advance_balance ?? 0);
        }

        if (
            Schema::hasTable('supplier_payments') &&
            Schema::hasColumn('supplier_payments', 'extra_amount')
        ) {
            return (float) DB::table('supplier_payments')
                ->where('supplier_id', $supplier->id)
                ->sum('extra_amount');
        }

        return 0;
    }

    private function defaultProviderName($paymentMethod)
    {
        return match ($paymentMethod) {
            'cash' => 'Cash',
            'bkash' => 'bKash',
            'nagad' => 'Nagad',
            'rocket' => 'Rocket',
            'upay' => 'Upay',
            'bank' => 'Bank',
            'card' => 'Card',
            'other_mfs' => 'Other MFS',
            default => ucfirst(str_replace('_', ' ', $paymentMethod)),
        };
    }

    private function firstExistingColumn($table, array $columns)
    {
        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                return $column;
            }
        }

        return null;
    }

    private function getObjectValue($object, array $keys, $default = null)
    {
        foreach ($keys as $key) {
            if (isset($object->{$key}) && $object->{$key} !== '') {
                return $object->{$key};
            }
        }

        return $default;
    }
}