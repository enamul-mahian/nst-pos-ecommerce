<?php

namespace App\Http\Middleware;

use App\Services\AccessControlService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

class EnsureReleasePermission
{
    public function __construct(private readonly AccessControlService $accessControl)
    {
    }

    public function handle(Request $request, Closure $next, string $pageKey, string $action = 'view'): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['status' => false, 'message' => 'Unauthenticated.'], 401);
        }

        if ($this->accessControl->isSuperAdmin($user)) {
            $rule = $this->superAdminRule($pageKey);
            $request->attributes->set('nst_access_rule', $rule);
            return $this->finalizeResponse($request, $next, $rule);
        }

        $rule = $this->databaseRule($user, $pageKey);
        if ($rule !== null) {
            $request->attributes->set('nst_access_rule', $rule);
            $readActions = ['view', 'list', 'show', 'print', 'reprint', 'export', 'search'];
            $isRead = in_array($action, $readActions, true);
            $visibility = $rule['visibility'];
            $visible = in_array($visibility, ['allow', 'read_only'], true);
            $actions = $rule['actions'];
            $allowedByAction = in_array('*', $actions, true) || in_array($action, $actions, true);
            if ($visibility === 'read_only') {
                $allowedByAction = $isRead;
            }

            if (! $visible || ! $allowedByAction) {
                return response()->json([
                    'status' => false,
                    'message' => 'You do not have permission to perform this action.',
                    'permission' => ['page_key' => $pageKey, 'action' => $action],
                ], 403);
            }

            return $this->finalizeResponse($request, $next, $rule);
        }

        if (! $this->allowedByReleaseDefaults($user, $pageKey, $action)) {
            return response()->json([
                'status' => false,
                'message' => 'You do not have permission to access this Release 1 module.',
                'permission' => ['page_key' => $pageKey, 'action' => $action],
            ], 403);
        }

        $rule = [
            'page_key' => $pageKey,
            'visibility' => 'allow',
            'actions' => [$action],
            'columns' => [],
            'row_scope' => 'own_branch',
            'selected_branches' => [],
            'source' => 'release_default',
        ];
        $request->attributes->set('nst_access_rule', $rule);

        return $this->finalizeResponse($request, $next, $rule);
    }

    private function databaseRule($user, string $pageKey): ?array
    {
        if (! Schema::hasTable('access_pages') || ! Schema::hasTable('access_rules_v12')) {
            return null;
        }

        try {
            $page = DB::table('access_pages')->where('page_key', $pageKey)->where('enabled', true)->first();
            if (! $page) {
                $this->registerUnknownPage($pageKey);
                $page = DB::table('access_pages')->where('page_key', $pageKey)->where('enabled', true)->first();
            }
            if (! $page) {
                return [
                    'page_key' => $pageKey,
                    'visibility' => 'deny',
                    'actions' => [],
                    'columns' => [],
                    'row_scope' => 'own_branch',
                    'selected_branches' => [],
                    'source' => 'unregistered_page_deny',
                ];
            }

            $roleIds = [];
            if (method_exists($user, 'roles')) {
                $roleIds = $user->roles()->pluck('roles.id')->map(fn ($id) => (int) $id)->all();
            }

            $query = DB::table('access_rules_v12')
                ->where('access_page_id', $page->id)
                ->where(function ($q) {
                    $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
                });

            $userRule = (clone $query)
                ->where('subject_type', 'user')
                ->where('subject_id', $user->id)
                ->latest('id')
                ->first();

            $roleRule = null;
            if ($roleIds !== []) {
                $roleRule = (clone $query)
                    ->where('subject_type', 'role')
                    ->whereIn('subject_id', $roleIds)
                    ->orderByRaw("CASE visibility WHEN 'deny' THEN 0 WHEN 'hidden' THEN 1 ELSE 2 END")
                    ->latest('id')
                    ->first();
            }

            $everyoneRule = (clone $query)
                ->where('subject_type', 'everyone')
                ->whereNull('subject_id')
                ->latest('id')
                ->first();

            $rule = $userRule ?: $roleRule ?: $everyoneRule;
            if (! $rule) {
                $public = (string) ($page->default_visibility ?? '') === 'public';
                return [
                    'page_key' => $pageKey,
                    'visibility' => $public ? 'allow' : 'deny',
                    'actions' => $public ? ['view', 'list', 'show', 'search'] : [],
                    'columns' => [],
                    'row_scope' => 'own_branch',
                    'selected_branches' => [],
                    'source' => 'registered_page_default',
                ];
            }

            return [
                'page_key' => $pageKey,
                'visibility' => (string) $rule->visibility,
                'actions' => $this->jsonArray($rule->actions),
                'columns' => $this->jsonArray($rule->columns),
                'row_scope' => (string) ($rule->row_scope ?: 'own_branch'),
                'selected_branches' => $this->jsonArray($rule->selected_branches),
                'source' => $userRule ? 'user_override' : ($roleRule ? 'role_rule' : 'everyone_rule'),
                'rule_id' => (int) $rule->id,
            ];
        } catch (Throwable $exception) {
            report($exception);

            return [
                'page_key' => $pageKey,
                'visibility' => 'deny',
                'actions' => [],
                'columns' => [],
                'row_scope' => 'own_branch',
                'selected_branches' => [],
                'source' => 'access_rule_error',
            ];
        }
    }

    private function registerUnknownPage(string $pageKey): void
    {
        try {
            $payload = [
                'page_key' => $pageKey,
                'page_name' => ucwords(str_replace(['_', '-'], ' ', $pageKey)),
                'module' => 'Auto Registered',
                'route' => null,
                'description' => 'Automatically registered from a protected backend action.',
                'default_visibility' => 'super_admin_only',
                'available_actions' => json_encode(['view', 'create', 'edit', 'delete', 'approve', 'export', 'print', 'reprint']),
                'available_columns' => json_encode(['*']),
                'enabled' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ];
            $columns = Schema::getColumnListing('access_pages');
            DB::table('access_pages')->updateOrInsert(
                ['page_key' => $pageKey],
                array_intersect_key($payload, array_flip($columns))
            );
        } catch (Throwable $exception) {
            report($exception);
        }
    }

    private function allowedByReleaseDefaults($user, string $pageKey, string $action): bool
    {
        $roles = $this->accessControl->roleNames($user);
        $has = static fn (array $wanted): bool => count(array_intersect($roles, $wanted)) > 0;

        $readActions = ['view', 'list', 'show', 'print', 'reprint', 'export', 'search'];
        $isRead = in_array($action, $readActions, true);

        return match ($pageKey) {
            'catalog' => $isRead ? $has(['admin', 'branch_manager', 'accountant', 'salesman', 'staff']) : $has(['admin']),
            'products', 'variants', 'device_stock', 'device_history', 'barcode', 'stock_transfer', 'stock_adjustment', 'service_status' =>
                $isRead
                    ? $has(['admin', 'branch_manager', 'accountant', 'salesman', 'staff'])
                    : $has(['admin', 'branch_manager']),
            'suppliers', 'purchases', 'used_purchase' =>
                $isRead
                    ? $has(['admin', 'branch_manager', 'accountant'])
                    : $has(['admin', 'branch_manager']),
            'pos_sales', 'sales_list', 'invoice', 'customer_order_timeline' =>
                $isRead
                    ? $has(['admin', 'branch_manager', 'accountant', 'salesman', 'staff'])
                    : $has(['admin', 'branch_manager', 'salesman', 'staff']),
            'web_sales', 'delivery', 'preorder' => $has(['admin', 'branch_manager', 'accountant']),
            'payments', 'due_collection', 'coupon', 'emi', 'returns', 'exchange' =>
                $isRead
                    ? $has(['admin', 'branch_manager', 'accountant', 'salesman'])
                    : $has(['admin', 'accountant', 'branch_manager']),
            'accounts', 'finance_journal', 'finance_expense', 'finance_transfer', 'finance_due', 'finance_reconciliation', 'cash_closing', 'finance_reports' =>
                $isRead
                    ? $has(['admin', 'branch_manager', 'accountant'])
                    : $has(['admin', 'accountant']),
            'crm', 'crm_leads', 'crm_feedback', 'crm_support', 'crm_segments', 'crm_campaigns' =>
                $isRead
                    ? $has(['admin', 'branch_manager', 'accountant', 'salesman', 'staff'])
                    : $has(['admin', 'branch_manager']),
            'crm_loyalty' =>
                $isRead
                    ? $has(['admin', 'branch_manager', 'accountant', 'salesman'])
                    : $has(['admin', 'accountant', 'branch_manager']),
            'hrm', 'hrm_attendance', 'hrm_leave', 'hrm_audit' =>
                $isRead
                    ? $has(['admin', 'branch_manager', 'accountant'])
                    : $has(['admin', 'branch_manager']),
            'payroll', 'payroll_reports' => $has(['admin', 'accountant']),
            'website_cms', 'access_matrix' => false,
            default => false,
        };
    }

    private function finalizeResponse(Request $request, Closure $next, array $rule): Response
    {
        $this->applyRequestBranchScope($request, $rule);
        $response = $next($request);

        if ($response instanceof JsonResponse) {
            $columns = array_values(array_unique(array_map('strval', (array) ($rule['columns'] ?? []))));
            if ($columns !== [] && ! in_array('*', $columns, true)) {
                $payload = $response->getData(true);
                if (array_key_exists('data', $payload)) {
                    $payload['data'] = $this->filterDataColumns($payload['data'], $columns);
                    $response->setData($payload);
                }
            }
        }

        return $response;
    }

    private function applyRequestBranchScope(Request $request, array $rule): void
    {
        $scope = (string) ($rule['row_scope'] ?? 'own_branch');
        if (in_array($scope, ['all_records', 'all_branches'], true)) {
            $request->attributes->set('nst_allowed_branch_ids', []);
            return;
        }

        $allowed = $scope === 'selected_branches'
            ? array_values(array_filter(array_map('intval', (array) ($rule['selected_branches'] ?? []))))
            : $this->userBranchIds($request);
        $request->attributes->set('nst_allowed_branch_ids', $allowed);

        foreach (['branch_id', 'from_branch_id', 'to_branch_id', 'source_branch_id', 'target_branch_id'] as $field) {
            if ($request->filled($field)) {
                abort_unless(in_array((int) $request->input($field), $allowed, true), 403, 'The selected branch is outside your assigned data scope.');
            }
        }

        if (! $request->filled('branch_id') && count($allowed) === 1) {
            $request->merge(['branch_id' => $allowed[0]]);
        }

        foreach ((array) optional($request->route())->parameters() as $name => $parameter) {
            $branchIds = [];
            if (is_object($parameter)) {
                foreach (['branch_id', 'from_branch_id', 'to_branch_id', 'source_branch_id', 'target_branch_id'] as $attribute) {
                    if (isset($parameter->{$attribute}) && $parameter->{$attribute}) {
                        $branchIds[] = (int) $parameter->{$attribute};
                    }
                }
                if ($name === 'branch' && method_exists($parameter, 'getKey')) {
                    $branchIds[] = (int) $parameter->getKey();
                }
            }

            foreach (array_unique($branchIds) as $branchId) {
                abort_unless(in_array($branchId, $allowed, true), 403, 'The requested record is outside your assigned branch scope.');
            }
        }
    }

    private function userBranchIds(Request $request): array
    {
        $user = $request->user();
        $ids = [];
        if (Schema::hasTable('branch_user')) {
            $ids = DB::table('branch_user')->where('user_id', $user->id)->pluck('branch_id')->map(fn ($id) => (int) $id)->all();
        }
        if (! empty($user->branch_id)) {
            $ids[] = (int) $user->branch_id;
        }
        return array_values(array_unique($ids));
    }

    private function filterDataColumns($data, array $columns)
    {
        if (! is_array($data)) {
            return $data;
        }

        if (array_is_list($data)) {
            return array_map(fn ($row) => $this->filterRecord($row, $columns), $data);
        }

        if (isset($data['data']) && is_array($data['data'])) {
            $data['data'] = array_is_list($data['data'])
                ? array_map(fn ($row) => $this->filterRecord($row, $columns), $data['data'])
                : $this->filterRecord($data['data'], $columns);
            return $data;
        }

        return $this->filterRecord($data, $columns);
    }

    private function filterRecord($record, array $columns)
    {
        if (! is_array($record) || array_is_list($record)) {
            return $record;
        }

        $always = ['id', 'uuid', 'created_at', 'updated_at'];
        $allowed = array_flip(array_merge($always, $columns));
        return array_intersect_key($record, $allowed);
    }

    private function superAdminRule(string $pageKey): array
    {
        return [
            'page_key' => $pageKey,
            'visibility' => 'allow',
            'actions' => ['*'],
            'columns' => ['*'],
            'row_scope' => 'all_records',
            'selected_branches' => [],
            'source' => 'super_admin',
        ];
    }

    private function jsonArray($value): array
    {
        if (is_array($value)) {
            return $value;
        }

        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? array_values($decoded) : [];
    }
}
