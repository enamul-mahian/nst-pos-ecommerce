<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CustomerLedgerController extends Controller
{
    public function index(Request $request)
    {
        if (!Schema::hasTable('customers')) {
            return response()->json([
                'message' => 'customers table not found.',
                'data' => [],
            ], 404);
        }

        $perPage = (int) $request->get('per_page', 15);
        $perPage = $perPage > 0 ? $perPage : 15;

        $query = DB::table('customers');

        if (Schema::hasColumn('customers', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        if ($request->filled('search')) {
            $search = trim($request->search);

            $query->where(function ($q) use ($search) {
                $searchableColumns = [
                    'name',
                    'customer_name',
                    'full_name',
                    'phone',
                    'mobile',
                    'customer_phone',
                    'email',
                    'nid_number',
                    'customer_nid',
                ];

                foreach ($searchableColumns as $column) {
                    if (Schema::hasColumn('customers', $column)) {
                        $q->orWhere($column, 'like', "%{$search}%");
                    }
                }
            });
        }

        $customers = $query
            ->orderByDesc('id')
            ->paginate($perPage);

        $items = collect($customers->items())
            ->map(function ($customer) {
                return $this->formatCustomer($customer, true);
            })
            ->values();

        return response()->json([
            'data' => $items,
            'current_page' => $customers->currentPage(),
            'last_page' => $customers->lastPage(),
            'per_page' => $customers->perPage(),
            'total' => $customers->total(),
        ]);
    }

    public function show($customer)
    {
        $customerData = $this->findCustomer($customer);

        if (!$customerData) {
            return response()->json([
                'message' => 'Customer not found.',
            ], 404);
        }

        return response()->json([
            'data' => $this->formatCustomer($customerData, true),
        ]);
    }

    public function ledger($customer)
    {
        $customerData = $this->findCustomer($customer);

        if (!$customerData) {
            return response()->json([
                'message' => 'Customer not found.',
            ], 404);
        }

        $summary = $this->getCustomerSaleSummary($customerData);
        $sales = $this->getCustomerSales($customerData);
        $payments = $this->getCustomerPayments($customerData);

        return response()->json([
            'data' => [
                'customer' => $this->formatCustomer($customerData, false),
                'summary' => $summary,
                'sales' => $sales,
                'payments' => $payments,
            ],
        ]);
    }

    private function findCustomer($customerId)
    {
        if (!Schema::hasTable('customers')) {
            return null;
        }

        $query = DB::table('customers');

        if (Schema::hasColumn('customers', 'deleted_at')) {
            $query->whereNull('deleted_at');
        }

        return $query->where('id', $customerId)->first();
    }

    private function formatCustomer($customer, $withSummary = false)
    {
        $name = $this->getObjectValue($customer, [
            'name',
            'customer_name',
            'full_name',
        ], '-');

        $phone = $this->getObjectValue($customer, [
            'phone',
            'mobile',
            'customer_phone',
        ], '-');

        $email = $this->getObjectValue($customer, [
            'email',
        ], '-');

        $address = $this->getObjectValue($customer, [
            'address',
            'customer_address',
        ], '-');

        $currentBalance = (float) $this->getObjectValue($customer, [
            'current_balance',
            'balance',
            'due_amount',
        ], 0);

        $data = [
            'id' => $customer->id,
            'name' => $name,
            'phone' => $phone,
            'email' => $email,
            'address' => $address,
            'current_balance' => $currentBalance,
            'created_at' => $this->getObjectValue($customer, ['created_at'], null),
        ];

        if ($withSummary) {
            $summary = $this->getCustomerSaleSummary($customer);

            $data = array_merge($data, [
                'total_invoice' => $summary['total_invoice'],
                'total_purchase_amount' => $summary['total_purchase_amount'],
                'total_paid_amount' => $summary['total_paid_amount'],
                'total_due_amount' => $summary['total_due_amount'],
                'last_sale_date' => $summary['last_sale_date'],
            ]);
        }

        return $data;
    }

    private function getCustomerSaleSummary($customer)
    {
        if (!Schema::hasTable('sales')) {
            return [
                'total_invoice' => 0,
                'total_purchase_amount' => 0,
                'total_paid_amount' => 0,
                'total_due_amount' => 0,
                'last_sale_date' => null,
            ];
        }

        $finalAmountColumn = $this->firstExistingColumn('sales', [
            'final_amount',
            'total_amount',
            'grand_total',
            'bill_amount',
        ]);

        $paidAmountColumn = $this->firstExistingColumn('sales', [
            'paid_amount',
            'total_paid',
        ]);

        $dueAmountColumn = $this->firstExistingColumn('sales', [
            'due_amount',
            'current_due',
        ]);

        $dateColumn = $this->firstExistingColumn('sales', [
            'created_at',
            'sale_date',
        ]);

        $baseQuery = $this->customerSaleQuery($customer);

        return [
            'total_invoice' => (clone $baseQuery)->count(),
            'total_purchase_amount' => $finalAmountColumn ? (float) (clone $baseQuery)->sum($finalAmountColumn) : 0,
            'total_paid_amount' => $paidAmountColumn ? (float) (clone $baseQuery)->sum($paidAmountColumn) : 0,
            'total_due_amount' => $dueAmountColumn ? (float) (clone $baseQuery)->sum($dueAmountColumn) : 0,
            'last_sale_date' => $dateColumn ? (clone $baseQuery)->max($dateColumn) : null,
        ];
    }

    private function getCustomerSales($customer)
    {
        if (!Schema::hasTable('sales')) {
            return [];
        }

        $dateColumn = $this->firstExistingColumn('sales', [
            'created_at',
            'sale_date',
        ]);

        $sales = $this->customerSaleQuery($customer)
            ->orderByDesc($dateColumn ?: 'id')
            ->limit(100)
            ->get();

        return $sales->map(function ($sale) {
            return [
                'id' => $sale->id,
                'invoice_no' => $this->getObjectValue($sale, [
                    'invoice_no',
                    'invoice_number',
                ], 'INV-' . $sale->id),
                'final_amount' => (float) $this->getObjectValue($sale, [
                    'final_amount',
                    'total_amount',
                    'grand_total',
                    'bill_amount',
                ], 0),
                'paid_amount' => (float) $this->getObjectValue($sale, [
                    'paid_amount',
                    'total_paid',
                ], 0),
                'due_amount' => (float) $this->getObjectValue($sale, [
                    'due_amount',
                    'current_due',
                ], 0),
                'payment_status' => $this->getObjectValue($sale, [
                    'payment_status',
                ], null),
                'sale_status' => $this->getObjectValue($sale, [
                    'sale_status',
                    'status',
                ], 'completed'),
                'created_at' => $this->getObjectValue($sale, [
                    'created_at',
                    'sale_date',
                ], null),
            ];
        })->values();
    }

    private function getCustomerPayments($customer)
    {
        if (!Schema::hasTable('sales') || !Schema::hasTable('sale_payments')) {
            return [];
        }

        $saleIds = $this->customerSaleQuery($customer)
            ->pluck('id')
            ->toArray();

        if (count($saleIds) === 0) {
            return [];
        }

        $payments = DB::table('sale_payments')
            ->whereIn('sale_id', $saleIds)
            ->orderByDesc('id')
            ->limit(200)
            ->get();

        return $payments->map(function ($payment) {
            return [
                'id' => $payment->id,
                'sale_id' => $payment->sale_id,
                'payment_method' => $this->getObjectValue($payment, [
                    'payment_method',
                    'method',
                ], '-'),
                'provider_name' => $this->getObjectValue($payment, [
                    'provider_name',
                    'provider',
                ], '-'),
                'transaction_id' => $this->getObjectValue($payment, [
                    'transaction_id',
                    'trx_id',
                    'reference_no',
                ], '-'),
                'amount' => (float) $this->getObjectValue($payment, [
                    'amount',
                    'paid_amount',
                ], 0),
                'created_at' => $this->getObjectValue($payment, [
                    'created_at',
                ], null),
            ];
        })->values();
    }

    private function customerSaleQuery($customer)
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
                $phoneColumns = [
                    'customer_phone',
                    'phone',
                    'mobile',
                ];

                foreach ($phoneColumns as $column) {
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