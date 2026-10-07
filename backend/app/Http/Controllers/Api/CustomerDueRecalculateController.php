<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CustomerDueRecalculateController extends Controller
{
    public function recalculate(Customer $customer)
    {
        if (!Schema::hasTable('sales')) {
            return response()->json([
                'success' => false,
                'message' => 'sales table not found.',
            ], 404);
        }

        $dueColumn = $this->firstExistingColumn('sales', [
            'due_amount',
            'current_due',
            'balance_due',
        ]);

        if (!$dueColumn) {
            return response()->json([
                'success' => false,
                'message' => 'sales due column not found.',
            ], 422);
        }

        $result = DB::transaction(function () use ($customer, $dueColumn) {
            $lockedCustomer = Customer::where('id', $customer->id)
                ->lockForUpdate()
                ->firstOrFail();

            $appliedPayments = 0;
            $appliedAmount = 0;
            $updatedInvoices = 0;

            if (Schema::hasTable('customer_payments')) {
                $paymentsQuery = DB::table('customer_payments')
                    ->where('customer_id', $lockedCustomer->id);

                if (Schema::hasColumn('customer_payments', 'is_applied_to_sales')) {
                    $paymentsQuery->where(function ($q) {
                        $q->where('is_applied_to_sales', false)
                            ->orWhereNull('is_applied_to_sales');
                    });
                }

                $payments = $paymentsQuery
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get();

                foreach ($payments as $payment) {
                    $remainingAmount = (float) ($payment->amount ?? 0);

                    if ($remainingAmount <= 0) {
                        $this->markCustomerPaymentApplied($payment->id);
                        continue;
                    }

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
                        $this->createSalePaymentRecord($sale->id, $payment, $adjustAmount);

                        $remainingAmount -= $adjustAmount;
                        $appliedAmount += $adjustAmount;
                        $updatedInvoices++;
                    }

                    $this->markCustomerPaymentApplied($payment->id);
                    $appliedPayments++;
                }
            }

            $totalDue = (float) $this->customerSalesQuery($lockedCustomer)
                ->sum($dueColumn);

            $this->updateCustomerBalance($lockedCustomer->id, $totalDue);

            return [
                'customer_id' => $lockedCustomer->id,
                'current_balance' => $totalDue,
                'applied_payments' => $appliedPayments,
                'applied_amount' => $appliedAmount,
                'updated_invoices' => $updatedInvoices,
            ];
        });

        return response()->json([
            'success' => true,
            'message' => 'Customer due recalculated and old payments applied successfully.',
            'data' => $result,
        ]);
    }

    private function customerSalesQuery($customer)
    {
        $query = DB::table('sales');

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

    private function createSalePaymentRecord($saleId, $customerPayment, $amount)
    {
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
            $insertData[$paymentMethodColumn] = $customerPayment->payment_method ?? 'cash';
        }

        $providerColumn = $this->firstExistingColumn('sale_payments', [
            'provider_name',
            'provider',
        ]);

        if ($providerColumn) {
            $insertData[$providerColumn] = $customerPayment->provider_name ?? null;
        }

        $transactionColumn = $this->firstExistingColumn('sale_payments', [
            'transaction_id',
            'trx_id',
            'reference_no',
        ]);

        if ($transactionColumn) {
            $insertData[$transactionColumn] = $customerPayment->transaction_id ?? null;
        }

        if (Schema::hasColumn('sale_payments', 'note')) {
            $insertData['note'] = 'Auto applied from customer due payment #' . $customerPayment->id;
        }

        $collectorColumn = $this->firstExistingColumn('sale_payments', [
            'received_by',
            'collected_by',
            'created_by',
            'user_id',
        ]);

        if ($collectorColumn && !empty($customerPayment->collected_by)) {
            $insertData[$collectorColumn] = $customerPayment->collected_by;
        }

        if (Schema::hasColumn('sale_payments', 'created_at')) {
            $insertData['created_at'] = $customerPayment->created_at ?? now();
        }

        if (Schema::hasColumn('sale_payments', 'updated_at')) {
            $insertData['updated_at'] = now();
        }

        DB::table('sale_payments')->insert($insertData);
    }

    private function markCustomerPaymentApplied($paymentId)
    {
        if (!Schema::hasTable('customer_payments')) {
            return;
        }

        $updateData = [];

        if (Schema::hasColumn('customer_payments', 'is_applied_to_sales')) {
            $updateData['is_applied_to_sales'] = true;
        }

        if (Schema::hasColumn('customer_payments', 'applied_at')) {
            $updateData['applied_at'] = now();
        }

        if (Schema::hasColumn('customer_payments', 'updated_at')) {
            $updateData['updated_at'] = now();
        }

        if (count($updateData) > 0) {
            DB::table('customer_payments')
                ->where('id', $paymentId)
                ->update($updateData);
        }
    }

    private function updateCustomerBalance($customerId, $newBalance)
    {
        $updateData = [];

        foreach (['current_balance', 'balance', 'due_amount'] as $column) {
            if (Schema::hasColumn('customers', $column)) {
                $updateData[$column] = $newBalance;
            }
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