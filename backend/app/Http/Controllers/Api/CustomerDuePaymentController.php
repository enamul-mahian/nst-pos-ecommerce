<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerPayment;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CustomerDuePaymentController extends Controller
{
    public function receiveDue(Request $request, Customer $customer)
    {
        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:1'],
            'payment_method' => ['required', 'string', 'max:100'],
            'provider_name' => ['nullable', 'string', 'max:150'],
            'transaction_id' => ['nullable', 'string', 'max:150'],
            'note' => ['nullable', 'string'],
        ]);

        $result = DB::transaction(function () use ($request, $customer, $validated) {
            $lockedCustomer = Customer::where('id', $customer->id)
                ->lockForUpdate()
                ->firstOrFail();

            $amount = (float) $validated['amount'];
            $paymentMethod = $validated['payment_method'];
            $providerName = $validated['provider_name'] ?? $this->defaultProviderName($paymentMethod);
            $transactionId = $validated['transaction_id'] ?? null;
            $note = $validated['note'] ?? null;
            $collectorId = $request->user()?->id;

            $salesDueBefore = $this->getCustomerSalesDueTotal($lockedCustomer);
            $customerBalanceBefore = $this->getCustomerBalance($lockedCustomer);

            $previousBalance = max($salesDueBefore, $customerBalanceBefore);
            $remainingAmount = $amount;

            $dueColumn = $this->firstExistingColumn('sales', [
                'due_amount',
                'current_due',
                'balance_due',
            ]);

            $updatedInvoices = [];

            if ($dueColumn) {
                $openSales = $this->customerSalesQuery($lockedCustomer)
                    ->where($dueColumn, '>', 0)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get();

                foreach ($openSales as $sale) {
                    if ($remainingAmount <= 0) {
                        break;
                    }

                    $saleDue = (float) ($sale->{$dueColumn} ?? 0);

                    if ($saleDue <= 0) {
                        continue;
                    }

                    $adjustAmount = min($remainingAmount, $saleDue);
                    $newSaleDue = max($saleDue - $adjustAmount, 0);

                    $this->updateSaleDueAndPaid($sale, $dueColumn, $adjustAmount, $newSaleDue);
                    $this->createSalePaymentRecord(
                        $sale->id,
                        $adjustAmount,
                        $paymentMethod,
                        $providerName,
                        $transactionId,
                        $note,
                        $collectorId
                    );

                    $updatedInvoices[] = [
                        'sale_id' => $sale->id,
                        'old_due' => $saleDue,
                        'paid_now' => $adjustAmount,
                        'new_due' => $newSaleDue,
                    ];

                    $remainingAmount -= $adjustAmount;
                }
            }

            $salesDueAfter = $this->getCustomerSalesDueTotal($lockedCustomer);
            $newBalance = $dueColumn ? $salesDueAfter : max($previousBalance - $amount, 0);
            $extraAmount = max($amount - $previousBalance, 0);

            $customerPaymentData = [
                'customer_id' => $lockedCustomer->id,
                'payment_method' => $paymentMethod,
                'provider_name' => $providerName,
                'transaction_id' => $transactionId,
                'amount' => $amount,
                'previous_balance' => $previousBalance,
                'new_balance' => $newBalance,
                'extra_amount' => $extraAmount,
                'note' => $note,
                'collected_by' => $collectorId,
            ];

            if (Schema::hasColumn('customer_payments', 'is_applied_to_sales')) {
                $customerPaymentData['is_applied_to_sales'] = true;
            }

            if (Schema::hasColumn('customer_payments', 'applied_at')) {
                $customerPaymentData['applied_at'] = now();
            }

            $payment = CustomerPayment::create($customerPaymentData);

            $this->updateCustomerBalance($lockedCustomer->id, $newBalance, $collectorId);

            return [
                'payment' => $payment->load('collector:id,name,email'),
                'customer' => Customer::find($lockedCustomer->id),
                'updated_invoices' => $updatedInvoices,
                'previous_balance' => $previousBalance,
                'new_balance' => $newBalance,
                'extra_amount' => $extraAmount,
            ];
        });

        return response()->json([
            'success' => true,
            'message' => 'Customer due payment received and invoice due adjusted successfully.',
            'data' => $result,
        ]);
    }

    private function customerSalesQuery($customer)
    {
        $query = DB::table('sales');

        if (!Schema::hasTable('sales')) {
            return $query->whereRaw('1 = 0');
        }

        $customerPhone = $this->getObjectValue($customer, [
            'phone',
            'mobile',
            'customer_phone',
        ], null);

        $hasCondition = false;

        $query->where(function ($q) use ($customer, $customerPhone, &$hasCondition) {
            if (Schema::hasColumn('sales', 'customer_id')) {
                $q->orWhere('customer_id', $customer->id);
                $hasCondition = true;
            }

            if ($customerPhone) {
                foreach (['customer_phone', 'phone', 'mobile'] as $column) {
                    if (Schema::hasColumn('sales', $column)) {
                        $q->orWhere($column, $customerPhone);
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

    private function getCustomerSalesDueTotal($customer)
    {
        if (!Schema::hasTable('sales')) {
            return 0;
        }

        $dueColumn = $this->firstExistingColumn('sales', [
            'due_amount',
            'current_due',
            'balance_due',
        ]);

        if (!$dueColumn) {
            return 0;
        }

        return (float) $this->customerSalesQuery($customer)->sum($dueColumn);
    }

    private function getCustomerBalance($customer)
    {
        return (float) $this->getObjectValue($customer, [
            'current_balance',
            'balance',
            'due_amount',
        ], 0);
    }

    private function updateSaleDueAndPaid($sale, $dueColumn, $adjustAmount, $newSaleDue)
    {
        $updateData = [
            $dueColumn => $newSaleDue,
        ];

        $paidColumn = $this->firstExistingColumn('sales', [
            'paid_amount',
            'total_paid',
        ]);

        if ($paidColumn) {
            $oldPaid = (float) ($sale->{$paidColumn} ?? 0);
            $updateData[$paidColumn] = $oldPaid + $adjustAmount;
        }

        $paymentStatusColumn = $this->firstExistingColumn('sales', [
            'payment_status',
        ]);

        if ($paymentStatusColumn) {
            $updateData[$paymentStatusColumn] = $newSaleDue > 0 ? 'partial' : 'paid';
        }

        if (Schema::hasColumn('sales', 'updated_at')) {
            $updateData['updated_at'] = now();
        }

        DB::table('sales')
            ->where('id', $sale->id)
            ->update($updateData);
    }

    private function updateCustomerBalance($customerId, $newBalance, $userId = null)
    {
        $updateData = [];

        foreach (['current_balance', 'balance', 'due_amount'] as $column) {
            if (Schema::hasColumn('customers', $column)) {
                $updateData[$column] = $newBalance;
            }
        }

        if ($userId && Schema::hasColumn('customers', 'updated_by')) {
            $updateData['updated_by'] = $userId;
        }

        if (Schema::hasColumn('customers', 'updated_at')) {
            $updateData['updated_at'] = now();
        }

        if (count($updateData) > 0) {
            DB::table('customers')
                ->where('id', $customerId)
                ->update($updateData);
        }
    }

    private function createSalePaymentRecord(
        $saleId,
        $amount,
        $paymentMethod,
        $providerName = null,
        $transactionId = null,
        $note = null,
        $collectorId = null
    ) {
        if (!Schema::hasTable('sale_payments')) {
            return;
        }

        if (!Schema::hasColumn('sale_payments', 'sale_id')) {
            return;
        }

        $amountColumn = $this->firstExistingColumn('sale_payments', [
            'amount',
            'paid_amount',
        ]);

        if (!$amountColumn) {
            return;
        }

        $insertData = [
            'sale_id' => $saleId,
            $amountColumn => $amount,
        ];

        $paymentMethodColumn = $this->firstExistingColumn('sale_payments', [
            'payment_method',
            'method',
        ]);

        if ($paymentMethodColumn) {
            $insertData[$paymentMethodColumn] = $paymentMethod;
        }

        $providerColumn = $this->firstExistingColumn('sale_payments', [
            'provider_name',
            'provider',
        ]);

        if ($providerColumn) {
            $insertData[$providerColumn] = $providerName;
        }

        $transactionColumn = $this->firstExistingColumn('sale_payments', [
            'transaction_id',
            'trx_id',
            'reference_no',
        ]);

        if ($transactionColumn) {
            $insertData[$transactionColumn] = $transactionId;
        }

        if (Schema::hasColumn('sale_payments', 'note')) {
            $insertData['note'] = $note;
        }

        $collectorColumn = $this->firstExistingColumn('sale_payments', [
            'received_by',
            'collected_by',
            'created_by',
            'user_id',
        ]);

        if ($collectorColumn && $collectorId) {
            $insertData[$collectorColumn] = $collectorId;
        }

        if (Schema::hasColumn('sale_payments', 'created_at')) {
            $insertData['created_at'] = now();
        }

        if (Schema::hasColumn('sale_payments', 'updated_at')) {
            $insertData['updated_at'] = now();
        }

        DB::table('sale_payments')->insert($insertData);
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