<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AccountsController extends Controller
{
    public function cashbook(Request $request)
    {
        [$dateFrom, $dateTo] = $this->dateRange($request);
        $limit = max(10, min((int) $request->get('limit', 200), 500));

        $transactions = collect();

        $salePayments = $this->salePaymentTransactions($request, $dateFrom, $dateTo);
        $transactions = $transactions->merge($salePayments);

        // Due receive can create both sale_payments and customer_payments. Count
        // invoice-applied money from sale_payments and only the residual/extra
        // amount from customer_payments, per payment. This avoids the old
        // period-wide fallback that could hide unrelated customer receipts.
        $transactions = $transactions->merge($this->customerPaymentTransactions($request, $dateFrom, $dateTo));

        $transactions = $transactions
            ->merge($this->servicePaymentTransactions($request, $dateFrom, $dateTo))
            ->merge($this->supplierPaymentTransactions($request, $dateFrom, $dateTo))
            ->merge($this->expenseTransactions($request, $dateFrom, $dateTo))
            ->sortByDesc('sort_date')
            ->take($limit)
            ->values();

        $cashIn = round((float) $transactions->where('direction', 'in')->sum('amount'), 2);
        $cashOut = round((float) $transactions->where('direction', 'out')->sum('amount'), 2);

        return response()->json([
            'success' => true,
            'message' => 'Accounts cashbook loaded successfully.',
            'data' => [
                'period' => $this->periodPayload($dateFrom, $dateTo),
                'summary' => [
                    'cash_in' => $cashIn,
                    'cash_out' => $cashOut,
                    'net_cash' => round($cashIn - $cashOut, 2),
                    'transaction_count' => $transactions->count(),
                ],
                'by_payment_method' => $this->groupByPaymentMethod($transactions),
                'transactions' => $transactions,
                'note' => 'Invoice-applied due receipts are represented by sale payments; only unapplied/extra customer-payment residuals are added separately.',
            ],
        ]);
    }

    public function dueCenter(Request $request)
    {
        $customerRows = $this->customerDueRows($request);
        $supplierRows = $this->supplierDueRows($request);

        return response()->json([
            'success' => true,
            'message' => 'Accounts due center loaded successfully.',
            'data' => [
                'summary' => [
                    'customer_count' => $customerRows->count(),
                    'customer_due_total' => round((float) $customerRows->sum('due_amount'), 2),
                    'supplier_count' => $supplierRows->count(),
                    'supplier_due_total' => round((float) $supplierRows->sum('due_amount'), 2),
                    'net_receivable_minus_payable' => round((float) $customerRows->sum('due_amount') - (float) $supplierRows->sum('due_amount'), 2),
                ],
                'customers' => $customerRows->values(),
                'suppliers' => $supplierRows->values(),
            ],
        ]);
    }

    private function salePaymentTransactions(Request $request, Carbon $dateFrom, Carbon $dateTo): Collection
    {
        if (!Schema::hasTable('sale_payments')) {
            return collect();
        }

        $dateColumn = $this->firstExistingColumn('sale_payments', ['created_at', 'payment_date', 'date']);
        $amountColumn = $this->firstExistingColumn('sale_payments', ['amount', 'paid_amount', 'payment_amount']);

        if (!$dateColumn || !$amountColumn) {
            return collect();
        }

        $query = DB::table('sale_payments')
            ->leftJoin('sales', function ($join) {
                if (Schema::hasTable('sales') && Schema::hasColumn('sale_payments', 'sale_id')) {
                    $join->on('sales.id', '=', 'sale_payments.sale_id');
                }
            })
            ->leftJoin('customers', function ($join) {
                if (Schema::hasTable('customers') && Schema::hasColumn('sales', 'customer_id')) {
                    $join->on('customers.id', '=', 'sales.customer_id');
                }
            })
            ->leftJoin('users as receivers', function ($join) {
                if (Schema::hasTable('users') && Schema::hasColumn('sale_payments', 'received_by')) {
                    $join->on('receivers.id', '=', 'sale_payments.received_by');
                }
            })
            ->whereBetween("sale_payments.$dateColumn", [$dateFrom->copy()->startOfDay(), $dateTo->copy()->endOfDay()]);

        if ($request->filled('payment_method') && Schema::hasColumn('sale_payments', 'payment_method')) {
            $query->where('sale_payments.payment_method', $request->payment_method);
        }

        if ($request->filled('branch_id') && Schema::hasColumn('sales', 'branch_id')) {
            $query->where('sales.branch_id', $request->branch_id);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);

            $query->where(function ($q) use ($search) {
                if (Schema::hasColumn('sales', 'invoice_no')) {
                    $q->orWhere('sales.invoice_no', 'like', "%{$search}%");
                }

                if (Schema::hasColumn('customers', 'name')) {
                    $q->orWhere('customers.name', 'like', "%{$search}%");
                }

                if (Schema::hasColumn('customers', 'phone')) {
                    $q->orWhere('customers.phone', 'like', "%{$search}%");
                }
            });
        }

        return $query
            ->select('sale_payments.*')
            ->when(Schema::hasTable('sales'), fn ($q) => $q->addSelect('sales.invoice_no as reference_no', 'sales.id as sale_id'))
            ->when(Schema::hasTable('customers'), fn ($q) => $q->addSelect('customers.name as party_name', 'customers.phone as party_phone'))
            ->when(Schema::hasTable('users'), fn ($q) => $q->addSelect('receivers.name as user_name'))
            ->orderByDesc("sale_payments.$dateColumn")
            ->limit(500)
            ->get()
            ->map(function ($row) use ($amountColumn, $dateColumn) {
                return [
                    'id' => 'sale_payment_' . $row->id,
                    'raw_id' => $row->id,
                    'direction' => 'in',
                    'type' => 'cash_in',
                    'source' => 'Sale Collection',
                    'reference_no' => $row->reference_no ?? ('SALE-' . ($row->sale_id ?? $row->id)),
                    'party_name' => $row->party_name ?? 'Walk-in Customer',
                    'party_phone' => $row->party_phone ?? null,
                    'payment_method' => $row->payment_method ?? '-',
                    'provider_name' => $row->provider_name ?? null,
                    'transaction_id' => $row->transaction_id ?? null,
                    'amount' => round((float) ($row->{$amountColumn} ?? 0), 2),
                    'note' => $row->note ?? null,
                    'user_name' => $row->user_name ?? null,
                    'date' => $row->{$dateColumn} ?? null,
                    'sort_date' => $row->{$dateColumn} ?? null,
                ];
            });
    }

    private function customerPaymentTransactions(Request $request, Carbon $dateFrom, Carbon $dateTo): Collection
    {
        if (!Schema::hasTable('customer_payments')) {
            return collect();
        }

        $dateColumn = $this->firstExistingColumn('customer_payments', ['created_at', 'payment_date', 'date']);

        if (!$dateColumn) {
            return collect();
        }

        $query = DB::table('customer_payments')
            ->leftJoin('customers', function ($join) {
                if (Schema::hasTable('customers') && Schema::hasColumn('customer_payments', 'customer_id')) {
                    $join->on('customers.id', '=', 'customer_payments.customer_id');
                }
            })
            ->leftJoin('users as collectors', function ($join) {
                if (Schema::hasTable('users') && Schema::hasColumn('customer_payments', 'collected_by')) {
                    $join->on('collectors.id', '=', 'customer_payments.collected_by');
                }
            })
            ->whereBetween("customer_payments.$dateColumn", [$dateFrom->copy()->startOfDay(), $dateTo->copy()->endOfDay()]);

        if ($request->filled('payment_method') && Schema::hasColumn('customer_payments', 'payment_method')) {
            $query->where('customer_payments.payment_method', $request->payment_method);
        }

        return $query
            ->select('customer_payments.*')
            ->when(Schema::hasTable('customers'), fn ($q) => $q->addSelect('customers.name as party_name', 'customers.phone as party_phone'))
            ->when(Schema::hasTable('users'), fn ($q) => $q->addSelect('collectors.name as user_name'))
            ->orderByDesc("customer_payments.$dateColumn")
            ->limit(500)
            ->get()
            ->map(function ($row) use ($dateColumn) {
                $isApplied = property_exists($row, 'is_applied_to_sales') ? (bool) $row->is_applied_to_sales : false;
                $amount = $isApplied && property_exists($row, 'extra_amount')
                    ? (float) ($row->extra_amount ?? 0)
                    : (float) ($row->amount ?? 0);
                if ($amount <= 0) return null;
                return [
                    'id' => 'customer_payment_' . $row->id,
                    'raw_id' => $row->id,
                    'direction' => 'in',
                    'type' => 'cash_in',
                    'source' => 'Customer Due Collection',
                    'reference_no' => 'CP-' . $row->id,
                    'party_name' => $row->party_name ?? 'Customer',
                    'party_phone' => $row->party_phone ?? null,
                    'payment_method' => $row->payment_method ?? '-',
                    'provider_name' => $row->provider_name ?? null,
                    'transaction_id' => $row->transaction_id ?? null,
                    'amount' => round($amount, 2),
                    'note' => $row->note ?? null,
                    'user_name' => $row->user_name ?? null,
                    'date' => $row->{$dateColumn} ?? null,
                    'sort_date' => $row->{$dateColumn} ?? null,
                ];
            });
    }


    private function servicePaymentTransactions(Request $request, Carbon $dateFrom, Carbon $dateTo): Collection
    {
        if (!Schema::hasTable('warranty_service_jobs')) {
            return collect();
        }

        $dateColumn = $this->firstExistingColumn('warranty_service_jobs', ['updated_at', 'delivered_at', 'received_at', 'created_at']);

        if (!$dateColumn || !Schema::hasColumn('warranty_service_jobs', 'paid_amount')) {
            return collect();
        }

        $query = DB::table('warranty_service_jobs')
            ->leftJoin('users as receivers', function ($join) {
                if (Schema::hasTable('users') && Schema::hasColumn('warranty_service_jobs', 'received_by')) {
                    $join->on('receivers.id', '=', 'warranty_service_jobs.received_by');
                }
            })
            ->where('warranty_service_jobs.paid_amount', '>', 0)
            ->whereBetween("warranty_service_jobs.$dateColumn", [$dateFrom->copy()->startOfDay(), $dateTo->copy()->endOfDay()]);

        if ($request->filled('payment_method') && Schema::hasColumn('warranty_service_jobs', 'payment_method')) {
            $query->where('warranty_service_jobs.payment_method', $request->payment_method);
        }

        if ($request->filled('branch_id') && Schema::hasColumn('warranty_service_jobs', 'branch_id')) {
            $query->where('warranty_service_jobs.branch_id', $request->branch_id);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                foreach (['job_no', 'customer_name', 'customer_phone', 'product_name', 'imei_1', 'imei_2', 'barcode', 'transaction_id'] as $column) {
                    if (Schema::hasColumn('warranty_service_jobs', $column)) {
                        $q->orWhere("warranty_service_jobs.$column", 'like', "%{$search}%");
                    }
                }
            });
        }

        if (Schema::hasColumn('warranty_service_jobs', 'deleted_at')) {
            $query->whereNull('warranty_service_jobs.deleted_at');
        }

        return $query
            ->select('warranty_service_jobs.*')
            ->when(Schema::hasTable('users'), fn ($q) => $q->addSelect('receivers.name as user_name'))
            ->orderByDesc("warranty_service_jobs.$dateColumn")
            ->limit(500)
            ->get()
            ->map(function ($row) use ($dateColumn) {
                return [
                    'id' => 'service_payment_' . $row->id,
                    'raw_id' => $row->id,
                    'direction' => 'in',
                    'type' => 'cash_in',
                    'source' => 'Service / Warranty Payment',
                    'reference_no' => $row->job_no ?? ('SRV-' . $row->id),
                    'party_name' => $row->customer_name ?? 'Service Customer',
                    'party_phone' => $row->customer_phone ?? null,
                    'payment_method' => $row->payment_method ?? '-',
                    'provider_name' => null,
                    'transaction_id' => $row->transaction_id ?? null,
                    'amount' => round((float) ($row->paid_amount ?? 0), 2),
                    'note' => $row->product_name ?? ($row->issue_type ?? null),
                    'user_name' => $row->user_name ?? null,
                    'date' => $row->{$dateColumn} ?? null,
                    'sort_date' => $row->{$dateColumn} ?? null,
                ];
            });
    }

    private function supplierPaymentTransactions(Request $request, Carbon $dateFrom, Carbon $dateTo): Collection
    {
        if (!Schema::hasTable('supplier_payments')) {
            return collect();
        }

        $dateColumn = $this->firstExistingColumn('supplier_payments', ['created_at', 'payment_date', 'date']);

        if (!$dateColumn) {
            return collect();
        }

        $query = DB::table('supplier_payments')
            ->leftJoin('suppliers', function ($join) {
                if (Schema::hasTable('suppliers') && Schema::hasColumn('supplier_payments', 'supplier_id')) {
                    $join->on('suppliers.id', '=', 'supplier_payments.supplier_id');
                }
            })
            ->leftJoin('users as payers', function ($join) {
                if (Schema::hasTable('users') && Schema::hasColumn('supplier_payments', 'paid_by')) {
                    $join->on('payers.id', '=', 'supplier_payments.paid_by');
                }
            })
            ->whereBetween("supplier_payments.$dateColumn", [$dateFrom->copy()->startOfDay(), $dateTo->copy()->endOfDay()]);

        if ($request->filled('payment_method') && Schema::hasColumn('supplier_payments', 'payment_method')) {
            $query->where('supplier_payments.payment_method', $request->payment_method);
        }

        return $query
            ->select('supplier_payments.*')
            ->when(Schema::hasTable('suppliers'), fn ($q) => $q->addSelect('suppliers.name as party_name', 'suppliers.phone as party_phone'))
            ->when(Schema::hasTable('users'), fn ($q) => $q->addSelect('payers.name as user_name'))
            ->orderByDesc("supplier_payments.$dateColumn")
            ->limit(500)
            ->get()
            ->map(function ($row) use ($dateColumn) {
                return [
                    'id' => 'supplier_payment_' . $row->id,
                    'raw_id' => $row->id,
                    'direction' => 'out',
                    'type' => 'cash_out',
                    'source' => ((float) ($row->extra_amount ?? 0) > 0) ? 'Supplier Advance Payment' : 'Supplier Due Payment',
                    'reference_no' => 'SP-' . $row->id,
                    'party_name' => $row->party_name ?? 'Supplier',
                    'party_phone' => $row->party_phone ?? null,
                    'payment_method' => $row->payment_method ?? '-',
                    'provider_name' => $row->provider_name ?? null,
                    'transaction_id' => $row->transaction_id ?? null,
                    'amount' => round((float) ($row->amount ?? 0), 2),
                    'note' => $row->note ?? null,
                    'user_name' => $row->user_name ?? null,
                    'date' => $row->{$dateColumn} ?? null,
                    'sort_date' => $row->{$dateColumn} ?? null,
                ];
            });
    }

    private function expenseTransactions(Request $request, Carbon $dateFrom, Carbon $dateTo): Collection
    {
        if (!Schema::hasTable('expenses')) {
            return collect();
        }

        $dateColumn = $this->firstExistingColumn('expenses', ['expense_date', 'date', 'created_at']);
        $amountColumn = $this->firstExistingColumn('expenses', ['amount', 'total_amount', 'expense_amount']);

        if (!$dateColumn || !$amountColumn) {
            return collect();
        }

        $query = DB::table('expenses')
            ->leftJoin('branches', function ($join) {
                if (Schema::hasTable('branches') && Schema::hasColumn('expenses', 'branch_id')) {
                    $join->on('branches.id', '=', 'expenses.branch_id');
                }
            })
            ->leftJoin('users as creators', function ($join) {
                if (Schema::hasTable('users') && Schema::hasColumn('expenses', 'created_by')) {
                    $join->on('creators.id', '=', 'expenses.created_by');
                }
            })
            ->whereBetween("expenses.$dateColumn", [$dateFrom->copy()->startOfDay(), $dateTo->copy()->endOfDay()]);

        if (Schema::hasColumn('expenses', 'deleted_at')) {
            $query->whereNull('expenses.deleted_at');
        }

        if ($request->filled('payment_method') && Schema::hasColumn('expenses', 'payment_method')) {
            $query->where('expenses.payment_method', $request->payment_method);
        }

        if ($request->filled('branch_id') && Schema::hasColumn('expenses', 'branch_id')) {
            $query->where('expenses.branch_id', $request->branch_id);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                foreach (['expense_no', 'title', 'category', 'transaction_id', 'note'] as $column) {
                    if (Schema::hasColumn('expenses', $column)) {
                        $q->orWhere("expenses.$column", 'like', "%{$search}%");
                    }
                }
            });
        }

        return $query
            ->select('expenses.*')
            ->when(Schema::hasTable('branches'), fn ($q) => $q->addSelect('branches.name as branch_name'))
            ->when(Schema::hasTable('users'), fn ($q) => $q->addSelect('creators.name as user_name'))
            ->orderByDesc("expenses.$dateColumn")
            ->limit(500)
            ->get()
            ->map(function ($row) use ($amountColumn, $dateColumn) {
                return [
                    'id' => 'expense_' . $row->id,
                    'raw_id' => $row->id,
                    'direction' => 'out',
                    'type' => 'cash_out',
                    'source' => 'Expense',
                    'reference_no' => $row->expense_no ?? ('EXP-' . $row->id),
                    'party_name' => $row->title ?? 'Expense',
                    'party_phone' => null,
                    'payment_method' => $row->payment_method ?? '-',
                    'provider_name' => $row->provider_name ?? null,
                    'transaction_id' => $row->transaction_id ?? null,
                    'amount' => round((float) ($row->{$amountColumn} ?? 0), 2),
                    'note' => $row->category ?? ($row->note ?? null),
                    'user_name' => $row->user_name ?? null,
                    'date' => $row->{$dateColumn} ?? null,
                    'sort_date' => $row->{$dateColumn} ?? null,
                ];
            });
    }

    private function customerDueRows(Request $request): Collection
    {
        if (!Schema::hasTable('customers')) {
            return collect();
        }

        $balanceColumn = $this->firstExistingColumn('customers', ['current_balance', 'balance', 'due_amount']);

        if (!$balanceColumn) {
            return collect();
        }

        $query = DB::table('customers')
            ->select('customers.id')
            ->selectRaw($this->nameExpression('customers') . ' as name')
            ->when(Schema::hasColumn('customers', 'phone'), fn ($q) => $q->addSelect('customers.phone'))
            ->when(Schema::hasColumn('customers', 'email'), fn ($q) => $q->addSelect('customers.email'))
            ->selectRaw("customers.$balanceColumn as due_amount")
            ->where("customers.$balanceColumn", '>', 0);

        if (Schema::hasColumn('customers', 'deleted_at')) {
            $query->whereNull('customers.deleted_at');
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                foreach (['name', 'customer_name', 'full_name', 'phone', 'mobile', 'email'] as $column) {
                    if (Schema::hasColumn('customers', $column)) {
                        $q->orWhere("customers.$column", 'like', "%{$search}%");
                    }
                }
            });
        }

        return $query
            ->orderByDesc('due_amount')
            ->limit(200)
            ->get()
            ->map(function ($row) {
                return [
                    'id' => $row->id,
                    'name' => $row->name ?? '-',
                    'phone' => $row->phone ?? '-',
                    'email' => $row->email ?? '-',
                    'due_amount' => round((float) ($row->due_amount ?? 0), 2),
                    'ledger_url' => '/customers/' . $row->id . '/ledger',
                ];
            });
    }

    private function supplierDueRows(Request $request): Collection
    {
        if (!Schema::hasTable('suppliers')) {
            return collect();
        }

        $balanceColumn = $this->firstExistingColumn('suppliers', ['current_balance', 'balance', 'due_amount']);

        if (!$balanceColumn) {
            return collect();
        }

        $query = DB::table('suppliers')
            ->select('suppliers.id')
            ->selectRaw($this->nameExpression('suppliers') . ' as name')
            ->when(Schema::hasColumn('suppliers', 'phone'), fn ($q) => $q->addSelect('suppliers.phone'))
            ->when(Schema::hasColumn('suppliers', 'email'), fn ($q) => $q->addSelect('suppliers.email'))
            ->selectRaw("suppliers.$balanceColumn as due_amount")
            ->where("suppliers.$balanceColumn", '>', 0);

        if (Schema::hasColumn('suppliers', 'deleted_at')) {
            $query->whereNull('suppliers.deleted_at');
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                foreach (['name', 'supplier_name', 'phone', 'mobile', 'email'] as $column) {
                    if (Schema::hasColumn('suppliers', $column)) {
                        $q->orWhere("suppliers.$column", 'like', "%{$search}%");
                    }
                }
            });
        }

        return $query
            ->orderByDesc('due_amount')
            ->limit(200)
            ->get()
            ->map(function ($row) {
                return [
                    'id' => $row->id,
                    'name' => $row->name ?? '-',
                    'phone' => $row->phone ?? '-',
                    'email' => $row->email ?? '-',
                    'due_amount' => round((float) ($row->due_amount ?? 0), 2),
                    'ledger_url' => '/suppliers/' . $row->id . '/ledger',
                ];
            });
    }

    private function groupByPaymentMethod(Collection $transactions): array
    {
        return $transactions
            ->groupBy(fn ($row) => $row['payment_method'] ?: '-')
            ->map(function ($rows, $method) {
                return [
                    'payment_method' => $method,
                    'cash_in' => round((float) collect($rows)->where('direction', 'in')->sum('amount'), 2),
                    'cash_out' => round((float) collect($rows)->where('direction', 'out')->sum('amount'), 2),
                    'net_cash' => round((float) collect($rows)->where('direction', 'in')->sum('amount') - (float) collect($rows)->where('direction', 'out')->sum('amount'), 2),
                ];
            })
            ->values()
            ->all();
    }

    private function dateRange(Request $request): array
    {
        $dateFrom = $request->filled('date_from')
            ? Carbon::parse($request->date_from)->startOfDay()
            : now()->startOfMonth()->startOfDay();

        $dateTo = $request->filled('date_to')
            ? Carbon::parse($request->date_to)->endOfDay()
            : now()->endOfDay();

        return [$dateFrom, $dateTo];
    }

    private function periodPayload(Carbon $dateFrom, Carbon $dateTo): array
    {
        return [
            'date_from' => $dateFrom->toDateString(),
            'date_to' => $dateTo->toDateString(),
            'monthly_rule' => 'If date_from is empty, report starts from the 1st day of the current month.',
        ];
    }

    private function firstExistingColumn(string $table, array $columns): ?string
    {
        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                return $column;
            }
        }

        return null;
    }

    private function nameExpression(string $table): string
    {
        foreach (['name', 'customer_name', 'supplier_name', 'full_name'] as $column) {
            if (Schema::hasColumn($table, $column)) {
                return "COALESCE($table.$column, '-')";
            }
        }

        return "'-'";
    }
}
