<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AccountingReconciliationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class Stage58FinanceController extends Controller
{
    public function overview(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);
        $branchId = $request->integer('branch_id') ?: null;
        $cashbook = $this->cashbookSummary($from, $to, $branchId);
        $accountingReconciliation = app(AccountingReconciliationService::class)->reconcile($from, $to, $branchId);
        $due = $this->dueSummary($branchId);
        $posted = DB::table('nst_journals')
            ->where('status', 'posted')
            ->whereBetween('journal_date', [$from->toDateString(), $to->toDateString()])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId));

        $summary = [
            'posted_journals' => (clone $posted)->count(),
            'posted_debit' => round((float) DB::table('nst_journal_lines')
                ->join('nst_journals', 'nst_journals.id', '=', 'nst_journal_lines.journal_id')
                ->where('nst_journals.status', 'posted')
                ->whereBetween('nst_journals.journal_date', [$from->toDateString(), $to->toDateString()])
                ->when($branchId, fn ($q) => $q->where('nst_journals.branch_id', $branchId))
                ->sum('nst_journal_lines.debit'), 2),
            'cash_in' => $cashbook['cash_in'],
            'cash_out' => $cashbook['cash_out'],
            'net_cash' => $cashbook['net_cash'],
            'customer_receivable' => $due['customer_receivable'],
            'supplier_payable' => $due['supplier_payable'],
            'open_cash_sessions' => DB::table('nst_cash_sessions')->where('status', 'open')->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->count(),
            'unidentified_payments' => DB::table('nst_payment_reconciliations')->whereIn('status', ['unidentified', 'pending', 'variance'])->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->count(),
            'expense_total' => $this->sumIfTable('nst_finance_expenses', 'total_amount', $from, $to, $branchId, 'expense_date'),
            'transfer_total' => $this->sumIfTable('nst_finance_transfers', 'amount', $from, $to, $branchId, 'transfer_date'),
            'due_payment_total' => $this->sumIfTable('nst_finance_due_payments', 'amount', $from, $to, $branchId, 'payment_date'),
        ];

        return $this->ok([
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'summary' => $summary,
            'accounting_reconciliation' => $accountingReconciliation,
            'reconciliation' => DB::table('nst_payment_reconciliations')
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->selectRaw('status, COUNT(*) as total, COALESCE(SUM(ABS(variance_amount)), 0) as variance')
                ->groupBy('status')
                ->get(),
            'capabilities' => [
                'chart_of_accounts' => true,
                'opening_balances' => true,
                'balanced_journals' => true,
                'posting_and_reversal' => true,
                'cashbook_bankbook' => true,
                'fund_transfers' => true,
                'expense_approval_and_payment' => true,
                'customer_supplier_due_payments' => true,
                'cashier_closing' => true,
                'gateway_cod_reconciliation' => true,
                'branch_accounting' => true,
                'live_reports' => true,
                'audit_history' => true,
            ],
            'acceptance' => $this->stageFiveAcceptancePayload(),
        ]);
    }

    public function referenceData(Request $request): JsonResponse
    {
        return $this->ok([
            'groups' => DB::table('nst_account_groups')->where('is_active', true)->orderBy('sort_order')->get(),
            'accounts' => $this->accountsCollection($request),
            'cash_bank_accounts' => $this->accountsCollection($request)->filter(fn ($a) => (bool) $a->is_cash || (bool) $a->is_bank)->values(),
            'expense_accounts' => $this->accountsCollection($request)->filter(fn ($a) => $a->group_type === 'expense')->values(),
            'asset_accounts' => $this->accountsCollection($request)->filter(fn ($a) => $a->group_type === 'asset')->values(),
            'liability_accounts' => $this->accountsCollection($request)->filter(fn ($a) => $a->group_type === 'liability')->values(),
            'expense_categories' => Schema::hasTable('nst_finance_expense_categories') ? DB::table('nst_finance_expense_categories')->where('is_active', true)->orderBy('name')->get() : [],
            'branches' => Schema::hasTable('branches') ? DB::table('branches')->select('id', 'name', 'code')->orderBy('name')->get() : [],
        ]);
    }

    public function accounts(Request $request): JsonResponse
    {
        return $this->ok([
            'groups' => DB::table('nst_account_groups')->where('is_active', true)->orderBy('sort_order')->get(),
            'accounts' => $this->accountsCollection($request),
        ]);
    }

    public function storeAccount(Request $request): JsonResponse
    {
        $data = $request->validate([
            'group_id' => ['required', 'integer', 'exists:nst_account_groups,id'],
            'name' => ['required', 'string', 'max:160'],
            'code' => ['required', 'string', 'max:50', 'unique:nst_accounts,code'],
            'account_kind' => ['nullable', 'string', 'max:50'],
            'opening_balance' => ['nullable', 'numeric'],
            'opening_side' => ['nullable', 'in:debit,credit'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'bank_name' => ['nullable', 'string', 'max:160'],
            'bank_account_no' => ['nullable', 'string', 'max:160'],
            'is_cash' => ['nullable', 'boolean'],
            'is_bank' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $id = DB::table('nst_accounts')->insertGetId(array_merge($data, [
            'currency' => 'BDT',
            'account_kind' => $data['account_kind'] ?? 'ledger',
            'opening_balance' => $data['opening_balance'] ?? 0,
            'opening_side' => $data['opening_side'] ?? 'debit',
            'is_cash' => (bool) ($data['is_cash'] ?? false),
            'is_bank' => (bool) ($data['is_bank'] ?? false),
            'is_system' => false,
            'is_active' => (bool) ($data['is_active'] ?? true),
            'created_by' => optional($request->user())->id,
            'updated_by' => optional($request->user())->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        $account = DB::table('nst_accounts')->find($id);
        $this->financeEvent($request, 'account.created', 'nst_accounts', $id, null, $account);
        return $this->ok($account, 'Account created with opening balance metadata.', 201);
    }

    public function updateAccount(Request $request, int $accountId): JsonResponse
    {
        $account = DB::table('nst_accounts')->where('id', $accountId)->first();
        abort_if(!$account, 404, 'Account not found.');

        $data = $request->validate([
            'group_id' => ['sometimes', 'integer', 'exists:nst_account_groups,id'],
            'name' => ['sometimes', 'string', 'max:160'],
            'code' => ['sometimes', 'string', 'max:50', 'unique:nst_accounts,code,' . $accountId],
            'account_kind' => ['sometimes', 'string', 'max:50'],
            'opening_balance' => ['sometimes', 'numeric'],
            'opening_side' => ['sometimes', 'in:debit,credit'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'bank_name' => ['nullable', 'string', 'max:160'],
            'bank_account_no' => ['nullable', 'string', 'max:160'],
            'is_cash' => ['sometimes', 'boolean'],
            'is_bank' => ['sometimes', 'boolean'],
            'is_active' => ['sometimes', 'boolean'],
        ]);

        if ($account->is_system && array_key_exists('code', $data) && $data['code'] !== $account->code) {
            throw ValidationException::withMessages(['code' => 'System account code cannot be changed.']);
        }

        $data['updated_by'] = optional($request->user())->id;
        $data['updated_at'] = now();
        DB::table('nst_accounts')->where('id', $accountId)->update($data);
        $updated = DB::table('nst_accounts')->find($accountId);
        $this->financeEvent($request, 'account.updated', 'nst_accounts', $accountId, $account, $updated);
        return $this->ok($updated, 'Account updated with audit history.');
    }

    public function journals(Request $request): JsonResponse
    {
        $query = DB::table('nst_journals')
            ->leftJoin('branches', 'branches.id', '=', 'nst_journals.branch_id')
            ->leftJoin('users as creators', 'creators.id', '=', 'nst_journals.created_by')
            ->select('nst_journals.*', 'branches.name as branch_name', 'creators.name as created_by_name')
            ->when($request->filled('status'), fn ($q) => $q->where('nst_journals.status', $request->input('status')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_journals.branch_id', $request->integer('branch_id')))
            ->when($request->filled('date_from'), fn ($q) => $q->whereDate('nst_journals.journal_date', '>=', $request->input('date_from')))
            ->when($request->filled('date_to'), fn ($q) => $q->whereDate('nst_journals.journal_date', '<=', $request->input('date_to')))
            ->orderByDesc('nst_journals.journal_date')->orderByDesc('nst_journals.id');

        $journals = $query->limit(500)->get();
        $ids = $journals->pluck('id');
        $lines = $ids->isEmpty() ? collect() : DB::table('nst_journal_lines')
            ->join('nst_accounts', 'nst_accounts.id', '=', 'nst_journal_lines.account_id')
            ->whereIn('nst_journal_lines.journal_id', $ids)
            ->select('nst_journal_lines.*', 'nst_accounts.name as account_name', 'nst_accounts.code as account_code')
            ->orderBy('nst_journal_lines.id')->get()->groupBy('journal_id');
        $journals->each(fn ($journal) => $journal->lines = $lines->get($journal->id, collect())->values());
        return $this->ok($journals);
    }

    public function storeJournal(Request $request): JsonResponse
    {
        $data = $this->journalValidation($request);
        $journalId = DB::transaction(function () use ($data, $request) {
            return $this->createJournal($request, $data, false);
        });
        $this->financeEvent($request, 'journal.draft.created', 'nst_journals', $journalId, null, $this->journalWithLines($journalId));
        return $this->ok($this->journalWithLines($journalId), 'Balanced journal draft saved.', 201);
    }

    public function postJournal(Request $request, int $journalId): JsonResponse
    {
        $journal = DB::transaction(function () use ($request, $journalId) {
            $locked = DB::table('nst_journals')->where('id', $journalId)->lockForUpdate()->first();
            abort_if(!$locked, 404, 'Journal not found.');
            if ($locked->status !== 'draft') {
                throw ValidationException::withMessages(['status' => 'Only draft journals can be posted.']);
            }
            $lines = DB::table('nst_journal_lines')->where('journal_id', $journalId)->get()->map(fn ($line) => (array) $line)->all();
            $this->validateBalancedLines($lines);
            DB::table('nst_journals')->where('id', $journalId)->update([
                'status' => 'posted',
                'posted_by' => optional($request->user())->id,
                'posted_at' => now(),
                'updated_at' => now(),
            ]);
            return $this->journalWithLines($journalId);
        });
        $this->financeEvent($request, 'journal.posted', 'nst_journals', $journalId, null, $journal);
        return $this->ok($journal, 'Journal posted.');
    }

    public function reverseJournal(Request $request, int $journalId): JsonResponse
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:1000'], 'journal_date' => ['nullable', 'date']]);
        $newId = DB::transaction(function () use ($journalId, $request, $data) {
            $journal = DB::table('nst_journals')->where('id', $journalId)->lockForUpdate()->first();
            abort_if(!$journal, 404, 'Journal not found.');
            if ($journal->status !== 'posted' || $journal->reversed_by_journal_id) {
                throw ValidationException::withMessages(['status' => 'Only an unreversed posted journal can be reversed.']);
            }
            $newId = DB::table('nst_journals')->insertGetId([
                'journal_no' => $this->nextNumber('RV', 'nst_journals', 'journal_no'),
                'journal_date' => $data['journal_date'] ?? now()->toDateString(),
                'source_type' => 'reversal',
                'source_id' => $journalId,
                'reference_no' => $journal->journal_no,
                'branch_id' => $journal->branch_id,
                'description' => 'Reversal of ' . $journal->journal_no . ($data['reason'] ?? null ? ': ' . $data['reason'] : ''),
                'status' => 'posted',
                'reversal_of_id' => $journalId,
                'created_by' => optional($request->user())->id,
                'posted_by' => optional($request->user())->id,
                'posted_at' => now(),
                'meta' => json_encode(['reversal_reason' => $data['reason'] ?? null]),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            foreach (DB::table('nst_journal_lines')->where('journal_id', $journalId)->get() as $line) {
                DB::table('nst_journal_lines')->insert([
                    'journal_id' => $newId,
                    'account_id' => $line->account_id,
                    'debit' => $line->credit,
                    'credit' => $line->debit,
                    'party_type' => $line->party_type,
                    'party_id' => $line->party_id,
                    'memo' => 'Reversal: ' . ($line->memo ?? ''),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            DB::table('nst_journals')->where('id', $journalId)->update([
                'status' => 'reversed',
                'reversed_by_journal_id' => $newId,
                'reversed_by' => optional($request->user())->id,
                'reversed_at' => now(),
                'updated_at' => now(),
            ]);
            return $newId;
        });
        $journal = $this->journalWithLines($newId);
        $this->financeEvent($request, 'journal.reversed', 'nst_journals', $journalId, null, $journal);
        return $this->ok($journal, 'Journal reversed with immutable reversing entry.', 201);
    }

    public function transfers(Request $request): JsonResponse
    {
        $rows = DB::table('nst_finance_transfers')
            ->leftJoin('nst_accounts as from_accounts', 'from_accounts.id', '=', 'nst_finance_transfers.from_account_id')
            ->leftJoin('nst_accounts as to_accounts', 'to_accounts.id', '=', 'nst_finance_transfers.to_account_id')
            ->leftJoin('branches', 'branches.id', '=', 'nst_finance_transfers.branch_id')
            ->select('nst_finance_transfers.*', 'from_accounts.name as from_account_name', 'to_accounts.name as to_account_name', 'branches.name as branch_name')
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_finance_transfers.branch_id', $request->integer('branch_id')))
            ->orderByDesc('nst_finance_transfers.id')->limit(300)->get();
        return $this->ok($rows);
    }

    public function storeTransfer(Request $request): JsonResponse
    {
        $data = $request->validate([
            'transfer_date' => ['required', 'date'],
            'from_account_id' => ['required', 'integer', 'exists:nst_accounts,id', 'different:to_account_id'],
            'to_account_id' => ['required', 'integer', 'exists:nst_accounts,id'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'fee_amount' => ['nullable', 'numeric', 'min:0'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $id = DB::transaction(function () use ($data, $request) {
            $transferId = DB::table('nst_finance_transfers')->insertGetId([
                'transfer_no' => $this->nextNumber('FT', 'nst_finance_transfers', 'transfer_no'),
                'transfer_date' => $data['transfer_date'],
                'from_account_id' => $data['from_account_id'],
                'to_account_id' => $data['to_account_id'],
                'amount' => round((float) $data['amount'], 2),
                'fee_amount' => round((float) ($data['fee_amount'] ?? 0), 2),
                'branch_id' => $data['branch_id'] ?? null,
                'status' => 'posted',
                'note' => $data['note'] ?? null,
                'created_by' => optional($request->user())->id,
                'approved_by' => optional($request->user())->id,
                'posted_at' => now(),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $journalId = $this->createJournal($request, [
                'journal_date' => $data['transfer_date'],
                'reference_no' => 'FT#' . $transferId,
                'branch_id' => $data['branch_id'] ?? null,
                'description' => $data['note'] ?? 'Fund transfer',
                'source_type' => 'fund_transfer',
                'source_id' => $transferId,
                'lines' => [
                    ['account_id' => $data['to_account_id'], 'debit' => $data['amount'], 'credit' => 0, 'memo' => 'Fund received'],
                    ['account_id' => $data['from_account_id'], 'debit' => 0, 'credit' => $data['amount'], 'memo' => 'Fund sent'],
                ],
            ], true);
            DB::table('nst_finance_transfers')->where('id', $transferId)->update(['journal_id' => $journalId, 'updated_at' => now()]);
            return $transferId;
        });
        $row = DB::table('nst_finance_transfers')->find($id);
        $this->financeEvent($request, 'fund_transfer.posted', 'nst_finance_transfers', $id, null, $row);
        return $this->ok($row, 'Fund transfer posted to cashbook/bankbook.', 201);
    }

    public function expenses(Request $request): JsonResponse
    {
        $rows = DB::table('nst_finance_expenses')
            ->leftJoin('nst_finance_expense_categories', 'nst_finance_expense_categories.id', '=', 'nst_finance_expenses.category_id')
            ->leftJoin('nst_accounts as expense_accounts', 'expense_accounts.id', '=', 'nst_finance_expenses.expense_account_id')
            ->leftJoin('nst_accounts as payment_accounts', 'payment_accounts.id', '=', 'nst_finance_expenses.payment_account_id')
            ->leftJoin('branches', 'branches.id', '=', 'nst_finance_expenses.branch_id')
            ->select('nst_finance_expenses.*', 'nst_finance_expense_categories.name as category_name', 'expense_accounts.name as expense_account_name', 'payment_accounts.name as payment_account_name', 'branches.name as branch_name')
            ->when($request->filled('status'), fn ($q) => $q->where('nst_finance_expenses.status', $request->input('status')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_finance_expenses.branch_id', $request->integer('branch_id')))
            ->orderByDesc('nst_finance_expenses.id')->limit(500)->get();
        return $this->ok($rows);
    }

    public function storeExpense(Request $request): JsonResponse
    {
        $data = $request->validate([
            'expense_date' => ['required', 'date'],
            'category_id' => ['nullable', 'integer', 'exists:nst_finance_expense_categories,id'],
            'expense_account_id' => ['required', 'integer', 'exists:nst_accounts,id'],
            'payment_account_id' => ['required', 'integer', 'exists:nst_accounts,id', 'different:expense_account_id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'vendor_name' => ['nullable', 'string', 'max:160'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['nullable', 'string', 'max:80'],
            'status' => ['nullable', 'in:draft,approved,paid'],
            'note' => ['nullable', 'string', 'max:1000'],
            'attachment_path' => ['nullable', 'string', 'max:500'],
            'recurring_rule' => ['nullable', 'array'],
        ]);
        $id = DB::transaction(function () use ($data, $request) {
            $amount = round((float) $data['amount'], 2);
            $tax = round((float) ($data['tax_amount'] ?? 0), 2);
            $total = round($amount + $tax, 2);
            $status = $data['status'] ?? 'paid';
            $expenseId = DB::table('nst_finance_expenses')->insertGetId([
                'expense_no' => $this->nextNumber('EXP', 'nst_finance_expenses', 'expense_no'),
                'expense_date' => $data['expense_date'],
                'category_id' => $data['category_id'] ?? null,
                'expense_account_id' => $data['expense_account_id'],
                'payment_account_id' => $data['payment_account_id'],
                'branch_id' => $data['branch_id'] ?? null,
                'vendor_name' => $data['vendor_name'] ?? null,
                'amount' => $amount,
                'tax_amount' => $tax,
                'total_amount' => $total,
                'payment_method' => $data['payment_method'] ?? 'cash',
                'status' => $status,
                'attachment_path' => $data['attachment_path'] ?? null,
                'recurring_rule' => isset($data['recurring_rule']) ? json_encode($data['recurring_rule']) : null,
                'note' => $data['note'] ?? null,
                'created_by' => optional($request->user())->id,
                'approved_by' => in_array($status, ['approved', 'paid'], true) ? optional($request->user())->id : null,
                'paid_by' => $status === 'paid' ? optional($request->user())->id : null,
                'approved_at' => in_array($status, ['approved', 'paid'], true) ? now() : null,
                'paid_at' => $status === 'paid' ? now() : null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            if ($status === 'paid') {
                $journalId = $this->createJournal($request, [
                    'journal_date' => $data['expense_date'],
                    'reference_no' => 'EXP#' . $expenseId,
                    'branch_id' => $data['branch_id'] ?? null,
                    'description' => $data['note'] ?? 'Expense payment',
                    'source_type' => 'expense',
                    'source_id' => $expenseId,
                    'lines' => [
                        ['account_id' => $data['expense_account_id'], 'debit' => $total, 'credit' => 0, 'memo' => 'Expense'],
                        ['account_id' => $data['payment_account_id'], 'debit' => 0, 'credit' => $total, 'memo' => 'Expense paid'],
                    ],
                ], true);
                DB::table('nst_finance_expenses')->where('id', $expenseId)->update(['journal_id' => $journalId, 'updated_at' => now()]);
            }
            return $expenseId;
        });
        $row = DB::table('nst_finance_expenses')->find($id);
        $this->financeEvent($request, 'expense.saved', 'nst_finance_expenses', $id, null, $row);
        return $this->ok($row, 'Expense saved with ledger posting where paid.', 201);
    }

    public function duePayments(Request $request): JsonResponse
    {
        $rows = DB::table('nst_finance_due_payments')
            ->leftJoin('nst_accounts as party_accounts', 'party_accounts.id', '=', 'nst_finance_due_payments.account_id')
            ->leftJoin('nst_accounts as cash_accounts', 'cash_accounts.id', '=', 'nst_finance_due_payments.cash_bank_account_id')
            ->leftJoin('branches', 'branches.id', '=', 'nst_finance_due_payments.branch_id')
            ->select('nst_finance_due_payments.*', 'party_accounts.name as account_name', 'cash_accounts.name as cash_bank_account_name', 'branches.name as branch_name')
            ->when($request->filled('party_type'), fn ($q) => $q->where('nst_finance_due_payments.party_type', $request->input('party_type')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_finance_due_payments.branch_id', $request->integer('branch_id')))
            ->orderByDesc('nst_finance_due_payments.id')->limit(500)->get();
        return $this->ok($rows);
    }

    public function storeDuePayment(Request $request): JsonResponse
    {
        $data = $request->validate([
            'payment_date' => ['required', 'date'],
            'payment_direction' => ['required', 'in:customer_collection,supplier_payment,refund,adjustment'],
            'party_type' => ['required', 'in:customer,supplier,other'],
            'party_id' => ['nullable', 'integer'],
            'account_id' => ['required', 'integer', 'exists:nst_accounts,id'],
            'cash_bank_account_id' => ['required', 'integer', 'exists:nst_accounts,id', 'different:account_id'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'method' => ['nullable', 'string', 'max:80'],
            'reference_no' => ['nullable', 'string', 'max:160'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $id = DB::transaction(function () use ($data, $request) {
            $amount = round((float) $data['amount'], 2);
            $paymentId = DB::table('nst_finance_due_payments')->insertGetId([
                'payment_no' => $this->nextNumber('DUE', 'nst_finance_due_payments', 'payment_no'),
                'payment_date' => $data['payment_date'],
                'payment_direction' => $data['payment_direction'],
                'party_type' => $data['party_type'],
                'party_id' => $data['party_id'] ?? null,
                'account_id' => $data['account_id'],
                'cash_bank_account_id' => $data['cash_bank_account_id'],
                'branch_id' => $data['branch_id'] ?? null,
                'amount' => $amount,
                'method' => $data['method'] ?? 'cash',
                'reference_no' => $data['reference_no'] ?? null,
                'status' => 'posted',
                'note' => $data['note'] ?? null,
                'created_by' => optional($request->user())->id,
                'posted_at' => now(),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $isCashIn = in_array($data['payment_direction'], ['customer_collection'], true);
            $lines = $isCashIn
                ? [
                    ['account_id' => $data['cash_bank_account_id'], 'debit' => $amount, 'credit' => 0, 'party_type' => $data['party_type'], 'party_id' => $data['party_id'] ?? null, 'memo' => 'Due collection received'],
                    ['account_id' => $data['account_id'], 'debit' => 0, 'credit' => $amount, 'party_type' => $data['party_type'], 'party_id' => $data['party_id'] ?? null, 'memo' => 'Receivable reduced'],
                ]
                : [
                    ['account_id' => $data['account_id'], 'debit' => $amount, 'credit' => 0, 'party_type' => $data['party_type'], 'party_id' => $data['party_id'] ?? null, 'memo' => 'Payable/refund reduced'],
                    ['account_id' => $data['cash_bank_account_id'], 'debit' => 0, 'credit' => $amount, 'party_type' => $data['party_type'], 'party_id' => $data['party_id'] ?? null, 'memo' => 'Cash or bank paid'],
                ];
            $journalId = $this->createJournal($request, [
                'journal_date' => $data['payment_date'],
                'reference_no' => $data['reference_no'] ?? ('DUE#' . $paymentId),
                'branch_id' => $data['branch_id'] ?? null,
                'description' => $data['note'] ?? str_replace('_', ' ', $data['payment_direction']),
                'source_type' => 'due_payment',
                'source_id' => $paymentId,
                'lines' => $lines,
            ], true);
            DB::table('nst_finance_due_payments')->where('id', $paymentId)->update(['journal_id' => $journalId, 'updated_at' => now()]);
            return $paymentId;
        });
        $row = DB::table('nst_finance_due_payments')->find($id);
        $this->financeEvent($request, 'due_payment.posted', 'nst_finance_due_payments', $id, null, $row);
        return $this->ok($row, 'Due payment/collection posted to ledger.', 201);
    }

    public function cashSessions(Request $request): JsonResponse
    {
        $sessions = DB::table('nst_cash_sessions')
            ->leftJoin('branches', 'branches.id', '=', 'nst_cash_sessions.branch_id')
            ->leftJoin('users as cashiers', 'cashiers.id', '=', 'nst_cash_sessions.cashier_id')
            ->select('nst_cash_sessions.*', 'branches.name as branch_name', 'cashiers.name as cashier_name')
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_cash_sessions.branch_id', $request->integer('branch_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('nst_cash_sessions.status', $request->input('status')))
            ->orderByDesc('nst_cash_sessions.id')->limit(300)->get();
        return $this->ok($sessions);
    }

    public function openCashSession(Request $request): JsonResponse
    {
        $data = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'cash_account_id' => ['nullable', 'integer', 'exists:nst_accounts,id'],
            'opening_amount' => ['required', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $cashierId = optional($request->user())->id;
        $exists = DB::table('nst_cash_sessions')->where('cashier_id', $cashierId)->where('status', 'open')->exists();
        if ($exists) {
            throw ValidationException::withMessages(['session' => 'This cashier already has an open session.']);
        }
        $id = DB::table('nst_cash_sessions')->insertGetId([
            'session_no' => $this->nextNumber('CS', 'nst_cash_sessions', 'session_no'),
            'branch_id' => $data['branch_id'] ?? null,
            'cashier_id' => $cashierId,
            'cash_account_id' => $data['cash_account_id'] ?? DB::table('nst_accounts')->where('is_cash', true)->value('id'),
            'opening_amount' => $data['opening_amount'],
            'status' => 'open',
            'opened_at' => now(),
            'note' => $data['note'] ?? null,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $row = DB::table('nst_cash_sessions')->find($id);
        $this->financeEvent($request, 'cash_session.opened', 'nst_cash_sessions', $id, null, $row);
        return $this->ok($row, 'Cashier session opened.', 201);
    }

    public function closeCashSession(Request $request, int $sessionId): JsonResponse
    {
        $data = $request->validate([
            'counted_closing_amount' => ['required', 'numeric', 'min:0'],
            'denominations' => ['nullable', 'array'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        $session = DB::table('nst_cash_sessions')->where('id', $sessionId)->first();
        abort_if(!$session, 404, 'Cash session not found.');
        if ($session->status !== 'open') {
            throw ValidationException::withMessages(['status' => 'Only an open session can be closed.']);
        }
        $from = Carbon::parse($session->opened_at);
        $to = now();
        $summary = $this->cashbookSummary($from, $to, $session->branch_id);
        $systemClosing = round((float) $session->opening_amount + $summary['net_cash'], 2);
        $variance = round((float) $data['counted_closing_amount'] - $systemClosing, 2);
        DB::table('nst_cash_sessions')->where('id', $sessionId)->update([
            'system_closing_amount' => $systemClosing,
            'counted_closing_amount' => $data['counted_closing_amount'],
            'variance_amount' => $variance,
            'denominations' => json_encode($data['denominations'] ?? []),
            'status' => 'submitted',
            'closed_at' => now(),
            'note' => $data['note'] ?? $session->note,
            'updated_at' => now(),
        ]);
        $row = DB::table('nst_cash_sessions')->find($sessionId);
        $this->financeEvent($request, 'cash_session.submitted', 'nst_cash_sessions', $sessionId, $session, $row);
        return $this->ok($row, 'Cashier session submitted for approval.');
    }

    public function approveCashSession(Request $request, int $sessionId): JsonResponse
    {
        $data = $request->validate(['status' => ['required', 'in:approved,rejected'], 'note' => ['nullable', 'string', 'max:1000']]);
        $session = DB::table('nst_cash_sessions')->where('id', $sessionId)->first();
        abort_if(!$session, 404, 'Cash session not found.');
        if ($session->status !== 'submitted') {
            throw ValidationException::withMessages(['status' => 'Only a submitted session can be reviewed.']);
        }
        DB::table('nst_cash_sessions')->where('id', $sessionId)->update([
            'status' => $data['status'],
            'approved_by' => optional($request->user())->id,
            'approved_at' => now(),
            'note' => $data['note'] ?? $session->note,
            'updated_at' => now(),
        ]);
        $row = DB::table('nst_cash_sessions')->find($sessionId);
        $this->financeEvent($request, 'cash_session.reviewed', 'nst_cash_sessions', $sessionId, $session, $row);
        return $this->ok($row, 'Cash session reviewed.');
    }

    public function reconciliations(Request $request): JsonResponse
    {
        $rows = DB::table('nst_payment_reconciliations')
            ->leftJoin('branches', 'branches.id', '=', 'nst_payment_reconciliations.branch_id')
            ->select('nst_payment_reconciliations.*', 'branches.name as branch_name')
            ->when($request->filled('status'), fn ($q) => $q->where('nst_payment_reconciliations.status', $request->input('status')))
            ->when($request->filled('provider'), fn ($q) => $q->where('nst_payment_reconciliations.provider', $request->input('provider')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_payment_reconciliations.branch_id', $request->integer('branch_id')))
            ->orderByDesc('nst_payment_reconciliations.id')->limit(500)->get();
        return $this->ok($rows);
    }

    public function storeReconciliation(Request $request): JsonResponse
    {
        $data = $request->validate([
            'provider' => ['required', 'string', 'max:100'],
            'channel' => ['required', 'string', 'max:100'],
            'external_reference' => ['nullable', 'string', 'max:190'],
            'internal_reference' => ['nullable', 'string', 'max:190'],
            'expected_amount' => ['required', 'numeric', 'min:0'],
            'received_amount' => ['required', 'numeric', 'min:0'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'status' => ['nullable', 'in:unidentified,pending,matched,variance,rejected'],
            'payload' => ['nullable', 'array'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $variance = round((float) $data['received_amount'] - (float) $data['expected_amount'], 2);
        $status = $data['status'] ?? ($variance == 0.0 && !empty($data['internal_reference']) ? 'matched' : ($variance == 0.0 ? 'pending' : 'variance'));
        $insert = $data;
        $insert['variance_amount'] = $variance;
        $insert['status'] = $status;
        $insert['payload'] = isset($data['payload']) ? json_encode($data['payload']) : null;
        $insert['created_by'] = optional($request->user())->id;
        $insert['resolved_by'] = $status === 'matched' ? optional($request->user())->id : null;
        $insert['resolved_at'] = $status === 'matched' ? now() : null;
        $insert['created_at'] = now();
        $insert['updated_at'] = now();
        $id = DB::table('nst_payment_reconciliations')->insertGetId($insert);
        $row = DB::table('nst_payment_reconciliations')->find($id);
        $this->financeEvent($request, 'reconciliation.saved', 'nst_payment_reconciliations', $id, null, $row);
        return $this->ok($row, 'Payment reconciliation saved.', 201);
    }

    public function resolveReconciliation(Request $request, int $reconciliationId): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:matched,rejected,variance'],
            'matched_journal_id' => ['nullable', 'integer', 'exists:nst_journals,id'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $before = DB::table('nst_payment_reconciliations')->where('id', $reconciliationId)->first();
        abort_if(!$before, 404, 'Reconciliation not found.');
        DB::table('nst_payment_reconciliations')->where('id', $reconciliationId)->update([
            'status' => $data['status'],
            'matched_journal_id' => $data['matched_journal_id'] ?? $before->matched_journal_id,
            'resolved_by' => optional($request->user())->id,
            'resolved_at' => now(),
            'note' => $data['note'] ?? $before->note,
            'updated_at' => now(),
        ]);
        $row = DB::table('nst_payment_reconciliations')->find($reconciliationId);
        $this->financeEvent($request, 'reconciliation.resolved', 'nst_payment_reconciliations', $reconciliationId, $before, $row);
        return $this->ok($row, 'Payment reconciliation reviewed.');
    }

    public function reports(Request $request): JsonResponse
    {
        [$from, $to] = $this->period($request);
        $balances = $this->accountBalances($request, $to);
        $trial = $balances->map(fn ($row) => [
            'account_id' => $row->id,
            'code' => $row->code,
            'account' => $row->name,
            'group' => $row->group_name,
            'type' => $row->group_type,
            'debit' => $row->balance >= 0 ? round($row->balance, 2) : 0,
            'credit' => $row->balance < 0 ? round(abs($row->balance), 2) : 0,
        ])->values();
        $income = round((float) $balances->where('group_type', 'income')->sum(fn ($row) => -$row->balance), 2);
        $expense = round((float) $balances->where('group_type', 'expense')->sum('balance'), 2);
        $assets = round((float) $balances->where('group_type', 'asset')->sum('balance'), 2);
        $liabilities = round((float) $balances->where('group_type', 'liability')->sum(fn ($row) => -$row->balance), 2);
        $equity = round((float) $balances->where('group_type', 'equity')->sum(fn ($row) => -$row->balance), 2);
        $branchId = $request->integer('branch_id') ?: null;

        return $this->ok([
            'period' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'trial_balance' => [
                'rows' => $trial,
                'total_debit' => round((float) $trial->sum('debit'), 2),
                'total_credit' => round((float) $trial->sum('credit'), 2),
                'balanced' => abs($trial->sum('debit') - $trial->sum('credit')) < 0.01,
            ],
            'profit_and_loss' => ['income' => $income, 'expense' => $expense, 'net_profit' => round($income - $expense, 2)],
            'balance_sheet' => ['assets' => $assets, 'liabilities' => $liabilities, 'equity' => $equity, 'difference' => round($assets - ($liabilities + $equity), 2)],
            'cash_flow' => $this->cashbookSummary($from, $to, $branchId),
            'aging' => $this->dueSummary($branchId),
            'expense_summary' => $this->expenseSummary($from, $to, $branchId),
            'branch_id' => $branchId,
        ]);
    }

    public function exportReport(Request $request): StreamedResponse
    {
        $data = $this->reports($request)->getData(true)['data'];
        $policy = $request->attributes->get('nst_financial_view_policy', ['mode' => 'full_actual']);
        if (($policy['mode'] ?? 'full_actual') === 'restricted') {
            $data = app(\App\Services\FinancialViewService::class)->transform($data, $policy, 'finance.export');
        }
        $fileName = 'nst-finance-report-' . now()->format('Ymd-His') . '.csv';
        $this->financeEvent($request, 'report.exported', 'finance_reports', null, null, ['file' => $fileName]);
        return response()->streamDownload(function () use ($data) {
            $out = fopen('php://output', 'w');
            fputcsv($out, ['Section', 'Metric', 'Value']);
            foreach ($data['profit_and_loss'] as $key => $value) fputcsv($out, ['Profit and Loss', $key, $value]);
            foreach ($data['balance_sheet'] as $key => $value) fputcsv($out, ['Balance Sheet', $key, $value]);
            foreach ($data['cash_flow'] as $key => $value) fputcsv($out, ['Cash Flow', $key, $value]);
            fputcsv($out, []);
            fputcsv($out, ['Account Code', 'Account', 'Type', 'Debit', 'Credit']);
            foreach ($data['trial_balance']['rows'] as $row) fputcsv($out, [$row['code'], $row['account'], $row['type'], $row['debit'], $row['credit']]);
            fclose($out);
        }, $fileName, ['Content-Type' => 'text/csv']);
    }

    public function auditHistory(Request $request): JsonResponse
    {
        $logs = Schema::hasTable('nst_finance_operation_logs') ? DB::table('nst_finance_operation_logs')
            ->leftJoin('users', 'users.id', '=', 'nst_finance_operation_logs.user_id')
            ->select('nst_finance_operation_logs.*', 'users.name as user_name')
            ->when($request->filled('action'), fn ($q) => $q->where('nst_finance_operation_logs.action', $request->input('action')))
            ->when($request->filled('branch_id'), fn ($q) => $q->where('nst_finance_operation_logs.branch_id', $request->integer('branch_id')))
            ->orderByDesc('nst_finance_operation_logs.id')->limit(500)->get() : collect();
        return $this->ok(['logs' => $logs, 'total' => $logs->count()]);
    }

    public function acceptanceStatus(Request $request): JsonResponse
    {
        return $this->ok($this->stageFiveAcceptancePayload(), 'Finance acceptance status loaded.');
    }

    private function accountsCollection(Request $request)
    {
        $query = DB::table('nst_accounts')
            ->join('nst_account_groups', 'nst_account_groups.id', '=', 'nst_accounts.group_id')
            ->leftJoin('branches', 'branches.id', '=', 'nst_accounts.branch_id')
            ->select('nst_accounts.*', 'nst_account_groups.name as group_name', 'nst_account_groups.type as group_type', 'branches.name as branch_name');
        if ($request->filled('type')) $query->where('nst_account_groups.type', $request->string('type'));
        if ($request->filled('branch_id')) $query->where('nst_accounts.branch_id', $request->integer('branch_id'));
        if ($request->filled('search')) {
            $search = trim((string) $request->input('search'));
            $query->where(fn ($q) => $q->where('nst_accounts.name', 'like', "%{$search}%")->orWhere('nst_accounts.code', 'like', "%{$search}%"));
        }
        $accounts = $query->orderBy('nst_accounts.code')->get();
        $balances = $this->accountBalances($request);
        $balanceMap = $balances->keyBy('id');
        return $accounts->map(function ($account) use ($balanceMap) {
            $account->balance = (float) optional($balanceMap->get($account->id))->balance;
            return $account;
        });
    }

    private function journalValidation(Request $request): array
    {
        return $request->validate([
            'journal_date' => ['required', 'date'],
            'reference_no' => ['nullable', 'string', 'max:160'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'description' => ['nullable', 'string', 'max:2000'],
            'source_type' => ['nullable', 'string', 'max:80'],
            'source_id' => ['nullable', 'integer'],
            'lines' => ['required', 'array', 'min:2'],
            'lines.*.account_id' => ['required', 'integer', 'exists:nst_accounts,id'],
            'lines.*.debit' => ['nullable', 'numeric', 'min:0'],
            'lines.*.credit' => ['nullable', 'numeric', 'min:0'],
            'lines.*.party_type' => ['nullable', 'string', 'max:80'],
            'lines.*.party_id' => ['nullable', 'integer'],
            'lines.*.memo' => ['nullable', 'string', 'max:500'],
        ]);
    }

    private function createJournal(Request $request, array $data, bool $postNow): int
    {
        $totals = $this->validateBalancedLines($data['lines']);
        $statusColumn = $postNow ? ['status' => 'posted'] : ['status' => 'draft'];
        $journalId = DB::table('nst_journals')->insertGetId(array_merge([
            'journal_no' => $this->nextNumber($postNow ? 'AJV' : 'JV', 'nst_journals', 'journal_no'),
            'journal_date' => $data['journal_date'],
            'source_type' => $data['source_type'] ?? 'manual',
            'source_id' => $data['source_id'] ?? null,
            'reference_no' => $data['reference_no'] ?? null,
            'branch_id' => $data['branch_id'] ?? null,
            'description' => $data['description'] ?? null,
            'created_by' => optional($request->user())->id,
            'posted_by' => $postNow ? optional($request->user())->id : null,
            'posted_at' => $postNow ? now() : null,
            'meta' => json_encode(['debit_total' => $totals['debit'], 'credit_total' => $totals['credit'], 'auto_posted' => $postNow]),
            'created_at' => now(),
            'updated_at' => now(),
        ], $statusColumn));
        foreach ($data['lines'] as $line) {
            DB::table('nst_journal_lines')->insert([
                'journal_id' => $journalId,
                'account_id' => $line['account_id'],
                'debit' => round((float) ($line['debit'] ?? 0), 2),
                'credit' => round((float) ($line['credit'] ?? 0), 2),
                'party_type' => $line['party_type'] ?? null,
                'party_id' => $line['party_id'] ?? null,
                'memo' => $line['memo'] ?? null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        return $journalId;
    }

    private function accountBalances(Request $request, ?Carbon $to = null)
    {
        $query = DB::table('nst_accounts')
            ->join('nst_account_groups', 'nst_account_groups.id', '=', 'nst_accounts.group_id')
            ->leftJoin('nst_journal_lines', 'nst_journal_lines.account_id', '=', 'nst_accounts.id')
            ->leftJoin('nst_journals', function ($join) use ($to) {
                $join->on('nst_journals.id', '=', 'nst_journal_lines.journal_id')->where('nst_journals.status', '=', 'posted');
                if ($to) $join->where('nst_journals.journal_date', '<=', $to->toDateString());
            })
            ->select('nst_accounts.id', 'nst_accounts.code', 'nst_accounts.name', 'nst_accounts.opening_balance', 'nst_accounts.opening_side', 'nst_account_groups.name as group_name', 'nst_account_groups.type as group_type')
            ->selectRaw('COALESCE(SUM(CASE WHEN nst_journals.id IS NOT NULL THEN nst_journal_lines.debit ELSE 0 END),0) as posted_debit')
            ->selectRaw('COALESCE(SUM(CASE WHEN nst_journals.id IS NOT NULL THEN nst_journal_lines.credit ELSE 0 END),0) as posted_credit')
            ->when($request->filled('branch_id'), function ($q) use ($request) {
                $branch = $request->integer('branch_id');
                $q->where(fn ($inner) => $inner->whereNull('nst_accounts.branch_id')->orWhere('nst_accounts.branch_id', $branch));
            })
            ->groupBy('nst_accounts.id', 'nst_accounts.code', 'nst_accounts.name', 'nst_accounts.opening_balance', 'nst_accounts.opening_side', 'nst_account_groups.name', 'nst_account_groups.type')
            ->orderBy('nst_accounts.code')->get();
        return $query->map(function ($row) {
            $opening = (float) $row->opening_balance * ($row->opening_side === 'credit' ? -1 : 1);
            $row->balance = round($opening + (float) $row->posted_debit - (float) $row->posted_credit, 2);
            return $row;
        });
    }

    private function cashbookSummary(Carbon $from, Carbon $to, ?int $branchId): array
    {
        $rows = DB::table('nst_journal_lines')
            ->join('nst_journals', 'nst_journals.id', '=', 'nst_journal_lines.journal_id')
            ->join('nst_accounts', 'nst_accounts.id', '=', 'nst_journal_lines.account_id')
            ->where('nst_journals.status', 'posted')
            ->where(fn ($q) => $q->where('nst_accounts.is_cash', true)->orWhere('nst_accounts.is_bank', true))
            ->whereBetween('nst_journals.journal_date', [$from->toDateString(), $to->toDateString()])
            ->when($branchId, fn ($q) => $q->where('nst_journals.branch_id', $branchId))
            ->selectRaw('COALESCE(SUM(nst_journal_lines.debit),0) as cash_in, COALESCE(SUM(nst_journal_lines.credit),0) as cash_out')->first();
        $cashIn = round((float) ($rows->cash_in ?? 0), 2);
        $cashOut = round((float) ($rows->cash_out ?? 0), 2);
        return ['cash_in' => $cashIn, 'cash_out' => $cashOut, 'net_cash' => round($cashIn - $cashOut, 2)];
    }

    private function dueSummary(?int $branchId): array
    {
        $customerDue = 0.0;
        if (Schema::hasTable('sales') && Schema::hasColumn('sales', 'due_amount')) {
            $customerDue = (float) DB::table('sales')->where('due_amount', '>', 0)
                ->when($branchId && Schema::hasColumn('sales', 'branch_id'), fn ($q) => $q->where('branch_id', $branchId))->sum('due_amount');
        } elseif (Schema::hasTable('customers') && Schema::hasColumn('customers', 'current_balance')) {
            $customerDue = (float) DB::table('customers')->where('current_balance', '>', 0)->sum('current_balance');
        }
        $supplierDue = 0.0;
        if (Schema::hasTable('purchases') && Schema::hasColumn('purchases', 'due_amount')) {
            $supplierDue = (float) DB::table('purchases')->where('due_amount', '>', 0)
                ->when($branchId && Schema::hasColumn('purchases', 'branch_id'), fn ($q) => $q->where('branch_id', $branchId))->sum('due_amount');
        } elseif (Schema::hasTable('suppliers') && Schema::hasColumn('suppliers', 'current_balance')) {
            $supplierDue = (float) DB::table('suppliers')->where('current_balance', '>', 0)->sum('current_balance');
        }
        return ['customer_receivable' => round($customerDue, 2), 'supplier_payable' => round($supplierDue, 2), 'net_receivable' => round($customerDue - $supplierDue, 2)];
    }

    private function expenseSummary(Carbon $from, Carbon $to, ?int $branchId): array
    {
        if (!Schema::hasTable('nst_finance_expenses')) return ['total' => 0, 'rows' => []];
        $rows = DB::table('nst_finance_expenses')
            ->leftJoin('nst_finance_expense_categories', 'nst_finance_expense_categories.id', '=', 'nst_finance_expenses.category_id')
            ->whereBetween('expense_date', [$from->toDateString(), $to->toDateString()])
            ->when($branchId, fn ($q) => $q->where('nst_finance_expenses.branch_id', $branchId))
            ->selectRaw('COALESCE(nst_finance_expense_categories.name, "Uncategorized") as category, COALESCE(SUM(total_amount),0) as total')
            ->groupBy('category')->orderByDesc('total')->get();
        return ['total' => round((float) $rows->sum('total'), 2), 'rows' => $rows];
    }

    private function validateBalancedLines(array $lines): array
    {
        $debit = 0.0; $credit = 0.0;
        foreach ($lines as $index => $line) {
            $lineDebit = round((float) ($line['debit'] ?? 0), 2);
            $lineCredit = round((float) ($line['credit'] ?? 0), 2);
            if (($lineDebit <= 0 && $lineCredit <= 0) || ($lineDebit > 0 && $lineCredit > 0)) {
                throw ValidationException::withMessages(["lines.{$index}" => 'Each line must contain either a debit or a credit amount.']);
            }
            $debit += $lineDebit; $credit += $lineCredit;
        }
        $debit = round($debit, 2); $credit = round($credit, 2);
        if ($debit <= 0 || abs($debit - $credit) >= 0.01) {
            throw ValidationException::withMessages(['lines' => "Debit and credit totals must be equal. Debit {$debit}, Credit {$credit}."]);
        }
        return compact('debit', 'credit');
    }

    private function journalWithLines(int $journalId): object
    {
        $journal = DB::table('nst_journals')->where('id', $journalId)->first();
        abort_if(!$journal, 404, 'Journal not found.');
        $journal->lines = DB::table('nst_journal_lines')
            ->join('nst_accounts', 'nst_accounts.id', '=', 'nst_journal_lines.account_id')
            ->where('journal_id', $journalId)
            ->select('nst_journal_lines.*', 'nst_accounts.name as account_name', 'nst_accounts.code as account_code')->get();
        return $journal;
    }

    private function financeEvent(Request $request, string $action, ?string $modelType = null, mixed $modelId = null, mixed $before = null, mixed $after = null): void
    {
        $payload = [
            'action' => $action,
            'resource_type' => $modelType,
            'resource_id' => $modelId ? (string) $modelId : null,
            'before_payload' => $before ? json_encode($before) : null,
            'after_payload' => $after ? json_encode($after) : null,
            'metadata' => json_encode(['ip' => $request->ip(), 'path' => $request->path()]),
            'user_id' => optional($request->user())->id,
            'branch_id' => optional($request->user())->branch_id,
            'created_at' => now(),
        ];
        if (Schema::hasTable('nst_finance_operation_logs')) DB::table('nst_finance_operation_logs')->insert($payload);
    }

    private function stageFiveAcceptancePayload(): array
    {
        $requiredTables = ['nst_account_groups', 'nst_accounts', 'nst_journals', 'nst_journal_lines', 'nst_cash_sessions', 'nst_payment_reconciliations', 'nst_finance_expense_categories', 'nst_finance_expenses', 'nst_finance_transfers', 'nst_finance_due_payments', 'nst_finance_operation_logs'];
        $requiredRoutes = ['finance.overview', 'finance.accounts', 'finance.journals', 'finance.expenses', 'finance.transfers', 'finance.due-payments', 'finance.cash-sessions', 'finance.reconciliations', 'finance.reports', 'finance.audit-history'];
        $tableStatus = collect($requiredTables)->mapWithKeys(fn ($table) => [$table => Schema::hasTable($table)]);
        $routeStatus = collect($requiredRoutes)->mapWithKeys(fn ($name) => [$name => Route::has($name)]);
        return [
            'tables' => $tableStatus,
            'routes' => $routeStatus,
            'database_ready' => $tableStatus->every(fn ($ready) => $ready === true),
            'routes_ready' => $routeStatus->every(fn ($ready) => $ready === true),
            'business_rules' => [
                'manual_journals_require_balanced_lines' => true,
                'posting_requires_draft_status' => true,
                'reversal_creates_opposite_posted_entry' => true,
                'expenses_create_paid_journal' => true,
                'transfers_create_cashbook_journal' => true,
                'due_payments_create_party_ledger_journal' => true,
                'audit_history_records_finance_operations' => true,
            ],
        ];
    }

    private function sumIfTable(string $table, string $column, Carbon $from, Carbon $to, ?int $branchId, string $dateColumn): float
    {
        if (!Schema::hasTable($table)) return 0.0;
        return round((float) DB::table($table)->whereBetween($dateColumn, [$from->toDateString(), $to->toDateString()])->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->sum($column), 2);
    }

    private function nextNumber(string $prefix, string $table, string $column): string
    {
        do { $number = $prefix . '-' . now()->format('Ymd-His') . '-' . strtoupper(Str::random(4)); }
        while (DB::table($table)->where($column, $number)->exists());
        return $number;
    }

    private function period(Request $request): array
    {
        $from = $request->filled('date_from') ? Carbon::parse($request->input('date_from'))->startOfDay() : now()->startOfMonth();
        $to = $request->filled('date_to') ? Carbon::parse($request->input('date_to'))->endOfDay() : now()->endOfDay();
        return [$from, $to];
    }

    private function ok(mixed $data, string $message = 'Finance operation completed.', int $status = 200): JsonResponse
    {
        return response()->json(['status' => true, 'message' => $message, 'data' => $data], $status);
    }
}
