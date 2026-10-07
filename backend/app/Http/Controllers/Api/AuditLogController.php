<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class AuditLogController extends Controller
{
    public function index(Request $request)
    {
        $this->authorizeAuditView($request);

        if (!Schema::hasTable('audit_logs')) {
            return response()->json([
                'success' => true,
                'message' => 'audit_logs table not found yet. Please run migration.',
                'data' => [],
                'summary' => $this->emptySummary(),
                'current_page' => 1,
                'last_page' => 1,
                'per_page' => 20,
                'total' => 0,
            ]);
        }

        $perPage = max(5, min((int) $request->get('per_page', 25), 100));
        $query = AuditLog::query()->with(['user:id,name,email,branch_id', 'branch:id,name,code']);

        $this->applyFilters($query, $request);

        $summaryQuery = clone $query;

        $logs = $query
            ->orderByDesc('id')
            ->paginate($perPage);

        return response()->json([
            'success' => true,
            'message' => 'Audit logs loaded successfully.',
            'data' => $logs->items(),
            'summary' => $this->summaryFromQuery($summaryQuery),
            'current_page' => $logs->currentPage(),
            'last_page' => $logs->lastPage(),
            'per_page' => $logs->perPage(),
            'total' => $logs->total(),
        ]);
    }

    public function summary(Request $request)
    {
        $this->authorizeAuditView($request);

        if (!Schema::hasTable('audit_logs')) {
            return response()->json([
                'success' => true,
                'message' => 'audit_logs table not found yet. Please run migration.',
                'data' => $this->emptySummary(),
            ]);
        }

        $todayStart = now()->startOfDay();
        $monthStart = now()->startOfMonth();

        $summary = [
            'today_total' => AuditLog::where('created_at', '>=', $todayStart)->count(),
            'today_success' => AuditLog::where('created_at', '>=', $todayStart)->where('status_code', '<', 400)->count(),
            'today_failed' => AuditLog::where('created_at', '>=', $todayStart)->where('status_code', '>=', 400)->count(),
            'month_total' => AuditLog::where('created_at', '>=', $monthStart)->count(),
            'unique_users_today' => AuditLog::where('created_at', '>=', $todayStart)->whereNotNull('user_id')->distinct('user_id')->count('user_id'),
            'top_modules' => AuditLog::selectRaw('module, COUNT(*) as total')
                ->where('created_at', '>=', $monthStart)
                ->whereNotNull('module')
                ->groupBy('module')
                ->orderByDesc('total')
                ->limit(8)
                ->get(),
        ];

        return response()->json([
            'success' => true,
            'message' => 'Audit summary loaded successfully.',
            'data' => $summary,
        ]);
    }

    private function applyFilters($query, Request $request): void
    {
        if ($request->filled('search')) {
            $search = trim((string) $request->search);

            $query->where(function ($q) use ($search) {
                $q->where('user_name', 'like', "%{$search}%")
                    ->orWhere('user_email', 'like', "%{$search}%")
                    ->orWhere('action', 'like', "%{$search}%")
                    ->orWhere('module', 'like', "%{$search}%")
                    ->orWhere('path', 'like', "%{$search}%")
                    ->orWhere('model_id', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('ip_address', 'like', "%{$search}%");
            });
        }

        if ($request->filled('module')) {
            $query->where('module', str_replace('-', '_', $request->module));
        }

        if ($request->filled('action')) {
            $query->where('action', 'like', '%' . trim((string) $request->action) . '%');
        }

        if ($request->filled('method')) {
            $query->where('method', strtoupper((string) $request->method));
        }

        if ($request->filled('user_id')) {
            $query->where('user_id', $request->integer('user_id'));
        }

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->integer('branch_id'));
        }

        if ($request->filled('status')) {
            if ($request->status === 'failed') {
                $query->where('status_code', '>=', 400);
            }

            if ($request->status === 'success') {
                $query->where(function ($q) {
                    $q->whereNull('status_code')->orWhere('status_code', '<', 400);
                });
            }
        }

        if ($request->filled('date_from')) {
            $query->where('created_at', '>=', Carbon::parse($request->date_from)->startOfDay());
        }

        if ($request->filled('date_to')) {
            $query->where('created_at', '<=', Carbon::parse($request->date_to)->endOfDay());
        }
    }

    private function summaryFromQuery($query): array
    {
        $total = (clone $query)->count();
        $failed = (clone $query)->where('status_code', '>=', 400)->count();
        $success = max($total - $failed, 0);

        return [
            'total' => $total,
            'success' => $success,
            'failed' => $failed,
            'unique_users' => (clone $query)->whereNotNull('user_id')->distinct('user_id')->count('user_id'),
        ];
    }

    private function emptySummary(): array
    {
        return [
            'total' => 0,
            'success' => 0,
            'failed' => 0,
            'unique_users' => 0,
            'today_total' => 0,
            'today_success' => 0,
            'today_failed' => 0,
            'month_total' => 0,
            'unique_users_today' => 0,
            'top_modules' => [],
        ];
    }

    private function authorizeAuditView(Request $request): void
    {
        $user = $request->user();

        if (!$user) {
            abort(401, 'Unauthenticated.');
        }

        $allowedRoles = ['super_admin', 'admin', 'accounts', 'accountant'];

        if (method_exists($user, 'hasAnyRole') && $user->hasAnyRole($allowedRoles)) {
            return;
        }

        if (method_exists($user, 'can') && $user->can('audit.view')) {
            return;
        }

        abort(403, 'You are not allowed to view audit logs.');
    }
}
