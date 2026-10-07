<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Expense;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class ExpenseController extends Controller
{
    public function index(Request $request)
    {
        if (!Schema::hasTable('expenses')) {
            return response()->json([
                'success' => true,
                'message' => 'expenses table not found yet. Please run migration.',
                'data' => [],
                'summary' => [
                    'expense_count' => 0,
                    'total_expense' => 0,
                ],
            ]);
        }

        $perPage = max(1, min((int) $request->get('per_page', 20), 100));
        $query = Expense::query()
            ->with([
                'branch:id,name,code',
                'creator:id,name,email',
            ]);

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->integer('branch_id'));
        }

        if ($request->filled('category')) {
            $query->where('category', $request->category);
        }

        if ($request->filled('payment_method')) {
            $query->where('payment_method', $request->payment_method);
        }

        if ($request->filled('date_from')) {
            $query->whereDate('expense_date', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('expense_date', '<=', $request->date_to);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);

            $query->where(function ($q) use ($search) {
                $q->where('expense_no', 'like', "%{$search}%")
                    ->orWhere('title', 'like', "%{$search}%")
                    ->orWhere('category', 'like', "%{$search}%")
                    ->orWhere('payment_method', 'like', "%{$search}%")
                    ->orWhere('provider_name', 'like', "%{$search}%")
                    ->orWhere('transaction_id', 'like', "%{$search}%")
                    ->orWhere('note', 'like', "%{$search}%");
            });
        }

        $summaryQuery = clone $query;

        $expenses = $query
            ->orderByDesc('expense_date')
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'message' => 'Expenses loaded successfully.',
            'data' => $expenses->items(),
            'summary' => [
                'expense_count' => (clone $summaryQuery)->count(),
                'total_expense' => round((float) (clone $summaryQuery)->sum('amount'), 2),
            ],
            'current_page' => $expenses->currentPage(),
            'last_page' => $expenses->lastPage(),
            'per_page' => $expenses->perPage(),
            'total' => $expenses->total(),
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizeAccountsAction($request);

        $validated = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'title' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:150'],
            'amount' => ['required', 'numeric', 'min:1'],
            'payment_method' => ['required', 'string', 'max:100'],
            'provider_name' => ['nullable', 'string', 'max:150'],
            'transaction_id' => ['nullable', 'string', 'max:150'],
            'expense_date' => ['nullable', 'date'],
            'note' => ['nullable', 'string'],
        ]);

        $expense = DB::transaction(function () use ($request, $validated) {
            $validated['expense_no'] = $this->makeExpenseNo();
            $validated['expense_date'] = $validated['expense_date'] ?? now()->toDateString();
            $validated['provider_name'] = $validated['provider_name'] ?? $this->defaultProviderName($validated['payment_method']);
            $validated['created_by'] = $request->user()?->id;

            return Expense::create($validated)->load(['branch:id,name,code', 'creator:id,name,email']);
        });

        return response()->json([
            'success' => true,
            'message' => 'Expense saved successfully.',
            'data' => $expense,
        ], 201);
    }

    public function show(Expense $expense)
    {
        return response()->json([
            'success' => true,
            'message' => 'Expense loaded successfully.',
            'data' => $expense->load(['branch:id,name,code', 'creator:id,name,email', 'updater:id,name,email']),
        ]);
    }

    public function update(Request $request, Expense $expense)
    {
        $this->authorizeAccountsAction($request);

        $validated = $request->validate([
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
            'title' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:150'],
            'amount' => ['required', 'numeric', 'min:1'],
            'payment_method' => ['required', 'string', 'max:100'],
            'provider_name' => ['nullable', 'string', 'max:150'],
            'transaction_id' => ['nullable', 'string', 'max:150'],
            'expense_date' => ['nullable', 'date'],
            'note' => ['nullable', 'string'],
        ]);

        $validated['provider_name'] = $validated['provider_name'] ?? $this->defaultProviderName($validated['payment_method']);
        $validated['updated_by'] = $request->user()?->id;

        $expense->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Expense updated successfully.',
            'data' => $expense->fresh(['branch:id,name,code', 'creator:id,name,email', 'updater:id,name,email']),
        ]);
    }

    public function destroy(Request $request, Expense $expense)
    {
        $this->authorizeAccountsAction($request);

        $expense->delete();

        return response()->json([
            'success' => true,
            'message' => 'Expense deleted successfully.',
        ]);
    }

    private function makeExpenseNo(): string
    {
        $prefix = 'EXP-' . now()->format('Ymd') . '-';
        $last = Expense::withTrashed()
            ->where('expense_no', 'like', $prefix . '%')
            ->orderByDesc('id')
            ->first();

        $next = 1;

        if ($last && preg_match('/(\d+)$/', (string) $last->expense_no, $matches)) {
            $next = ((int) $matches[1]) + 1;
        }

        return $prefix . str_pad((string) $next, 4, '0', STR_PAD_LEFT);
    }

    private function authorizeAccountsAction(Request $request): void
    {
        $user = $request->user();

        if (!$user) {
            abort(401, 'Unauthenticated.');
        }

        if (method_exists($user, 'hasAnyRole') && $user->hasAnyRole([
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

        $roleNames = collect($user->roles ?? [])
            ->map(fn ($role) => is_string($role) ? $role : ($role->name ?? ''))
            ->push($user->role ?? null)
            ->push($user->role_name ?? null)
            ->filter()
            ->map(fn ($role) => Str::lower(str_replace([' ', '_', '-'], '', (string) $role)))
            ->values()
            ->all();

        if (count(array_intersect($roleNames, ['superadmin', 'admin', 'accounts', 'accountant'])) > 0) {
            return;
        }

        abort(403, 'Only Super Admin, Admin or Accounts can manage expenses.');
    }

    private function defaultProviderName($paymentMethod): string
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
            default => ucfirst(str_replace('_', ' ', (string) $paymentMethod)),
        };
    }
}
