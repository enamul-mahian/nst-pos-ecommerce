<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AccessControlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Spatie\Permission\Models\Role;

class AccessMatrixController extends Controller
{
    public function __construct(private readonly AccessControlService $accessControl)
    {
    }

    public function status(): JsonResponse
    {
        return response()->json([
            'status' => true,
            'message' => 'Access Matrix is operational.',
            'data' => [
                'mode' => 'database_enforced',
                'schema_ready' => $this->schemaReady(),
                'supports' => ['page_visibility', 'actions', 'columns', 'row_scope', 'selected_branches', 'expiry', 'audit_history'],
            ],
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'status' => true,
            'data' => [
                'user' => $user?->loadMissing('roles:id,name'),
                'effective_rules' => $this->effectiveRulesForUser($user),
                'legacy_access' => $this->accessControl->userAccess($user),
            ],
        ]);
    }

    public function resources(): JsonResponse
    {
        $this->requireSchema();

        $pages = DB::table('access_pages')
            ->where('enabled', true)
            ->orderBy('module')
            ->orderBy('page_name')
            ->get()
            ->map(fn ($page) => $this->normalizePage($page));

        return response()->json(['status' => true, 'data' => $pages]);
    }

    public function roles(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);

        return response()->json([
            'status' => true,
            'data' => Role::query()->select('id', 'name', 'guard_name')->orderBy('name')->get(),
        ]);
    }

    public function users(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);

        $users = User::query()
            ->with('roles:id,name')
            ->select('id', 'name', 'username', 'email', 'phone', 'branch_id', 'status', 'profile_type')
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = trim((string) $request->input('search'));
                $query->where(function ($q) use ($search) {
                    $q->where('name', 'like', "%{$search}%")
                        ->orWhere('username', 'like', "%{$search}%")
                        ->orWhere('email', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%");
                });
            })
            ->orderBy('name')
            ->paginate(min(100, max(10, (int) $request->input('per_page', 30))));

        return response()->json(['status' => true, 'data' => $users]);
    }

    public function rules(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        $this->requireSchema();

        $query = DB::table('access_rules_v12 as rules')
            ->join('access_pages as pages', 'pages.id', '=', 'rules.access_page_id')
            ->select('rules.*', 'pages.page_key', 'pages.page_name', 'pages.module');

        if ($request->filled('page_key')) {
            $query->where('pages.page_key', $request->input('page_key'));
        }
        if ($request->filled('subject_type')) {
            $query->where('rules.subject_type', $request->input('subject_type'));
        }
        if ($request->filled('subject_id')) {
            $query->where('rules.subject_id', $request->integer('subject_id'));
        }

        $rules = $query->orderBy('pages.module')->orderBy('pages.page_name')->orderBy('rules.subject_type')->get()
            ->map(fn ($rule) => $this->normalizeRule($rule));

        return response()->json(['status' => true, 'data' => $rules]);
    }

    public function save(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        $this->requireSchema();

        $validated = $request->validate([
            'page_key' => ['required', 'string', Rule::exists('access_pages', 'page_key')->where('enabled', true)],
            'subject_type' => ['required', Rule::in(['role', 'user'])],
            'subject_id' => ['required', 'integer', 'min:1'],
            'visibility' => ['required', Rule::in(['allow', 'read_only', 'deny', 'hidden'])],
            'actions' => ['nullable', 'array'],
            'actions.*' => ['string', 'max:60'],
            'columns' => ['nullable', 'array'],
            'columns.*' => ['string', 'max:100'],
            'row_scope' => ['required', Rule::in(['own_records', 'own_branch', 'selected_branches', 'all_records'])],
            'selected_branches' => ['nullable', 'array'],
            'selected_branches.*' => ['integer', 'exists:branches,id'],
            'expires_at' => ['nullable', 'date', 'after:now'],
        ]);

        $this->validateSubject($validated['subject_type'], (int) $validated['subject_id']);

        $page = DB::table('access_pages')->where('page_key', $validated['page_key'])->firstOrFail();
        $actions = array_values(array_unique($validated['actions'] ?? []));
        $columns = array_values(array_unique($validated['columns'] ?? []));
        $branches = array_values(array_unique(array_map('intval', $validated['selected_branches'] ?? [])));

        $rule = DB::transaction(function () use ($request, $validated, $page, $actions, $columns, $branches) {
            $payload = [
                'visibility' => $validated['visibility'],
                'actions' => json_encode($actions, JSON_UNESCAPED_UNICODE),
                'columns' => json_encode($columns, JSON_UNESCAPED_UNICODE),
                'row_scope' => $validated['row_scope'],
                'selected_branches' => json_encode($branches),
                'expires_at' => $validated['expires_at'] ?? null,
                'created_by' => $request->user()->id,
                'updated_at' => now(),
            ];

            $existing = DB::table('access_rules_v12')
                ->where('access_page_id', $page->id)
                ->where('subject_type', $validated['subject_type'])
                ->where('subject_id', $validated['subject_id'])
                ->first();

            if ($existing) {
                DB::table('access_rules_v12')->where('id', $existing->id)->update($payload);
                $ruleId = $existing->id;
            } else {
                $ruleId = DB::table('access_rules_v12')->insertGetId($payload + [
                    'access_page_id' => $page->id,
                    'subject_type' => $validated['subject_type'],
                    'subject_id' => $validated['subject_id'],
                    'created_at' => now(),
                ]);
            }

            if (Schema::hasTable('access_rule_history_v12')) {
                DB::table('access_rule_history_v12')->insert([
                    'access_page_id' => $page->id,
                    'subject_type' => $validated['subject_type'],
                    'subject_id' => $validated['subject_id'],
                    'visibility' => $validated['visibility'],
                    'actions' => json_encode($actions, JSON_UNESCAPED_UNICODE),
                    'columns' => json_encode($columns, JSON_UNESCAPED_UNICODE),
                    'row_scope' => $validated['row_scope'],
                    'selected_branches' => json_encode($branches),
                    'expires_at' => $validated['expires_at'] ?? null,
                    'changed_by' => $request->user()->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return DB::table('access_rules_v12 as rules')
                ->join('access_pages as pages', 'pages.id', '=', 'rules.access_page_id')
                ->where('rules.id', $ruleId)
                ->select('rules.*', 'pages.page_key', 'pages.page_name', 'pages.module')
                ->first();
        });

        return response()->json([
            'status' => true,
            'message' => 'Access rule saved successfully.',
            'data' => $this->normalizeRule($rule),
        ]);
    }

    public function userOverride(Request $request): JsonResponse
    {
        $request->merge(['subject_type' => 'user']);
        return $this->save($request);
    }

    public function auditLogs(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        abort_unless(Schema::hasTable('access_rule_history_v12'), 503, 'Access history schema is not installed.');

        $query = DB::table('access_rule_history_v12 as history')
            ->join('access_pages as pages', 'pages.id', '=', 'history.access_page_id')
            ->leftJoin('users as changed_users', 'changed_users.id', '=', 'history.changed_by')
            ->select('history.*', 'pages.page_key', 'pages.page_name', 'pages.module', 'changed_users.name as changed_by_name');

        if ($request->filled('page_key')) {
            $query->where('pages.page_key', $request->input('page_key'));
        }

        $rows = $query->latest('history.id')
            ->paginate(min(100, max(10, (int) $request->input('per_page', 30))));

        $rows->getCollection()->transform(fn ($row) => $this->normalizeRule($row));

        return response()->json(['status' => true, 'data' => $rows]);
    }

    public function filterPreview(Request $request): JsonResponse
    {
        $this->requireSuperAdmin($request);
        $validated = $request->validate(['user_id' => ['required', 'exists:users,id']]);
        $user = User::with('roles:id,name')->findOrFail($validated['user_id']);

        return response()->json([
            'status' => true,
            'data' => [
                'user' => $user,
                'effective_rules' => $this->effectiveRulesForUser($user),
            ],
        ]);
    }

    private function effectiveRulesForUser($user): array
    {
        if (! $user || ! $this->schemaReady()) {
            return [];
        }

        if ($this->accessControl->isSuperAdmin($user)) {
            return DB::table('access_pages')->where('enabled', true)->orderBy('module')->get()
                ->mapWithKeys(fn ($page) => [$page->page_key => [
                    'visibility' => 'allow',
                    'actions' => ['*'],
                    'columns' => ['*'],
                    'row_scope' => 'all_records',
                    'selected_branches' => [],
                    'source' => 'super_admin',
                ]])->all();
        }

        $roleIds = method_exists($user, 'roles')
            ? $user->roles()->pluck('roles.id')->map(fn ($id) => (int) $id)->all()
            : [];

        $pages = DB::table('access_pages')->where('enabled', true)->get();
        $result = [];

        foreach ($pages as $page) {
            $base = DB::table('access_rules_v12')
                ->where('access_page_id', $page->id)
                ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()));

            $userRule = (clone $base)->where('subject_type', 'user')->where('subject_id', $user->id)->latest('id')->first();
            $roleRule = $roleIds === [] ? null : (clone $base)->where('subject_type', 'role')->whereIn('subject_id', $roleIds)->latest('id')->first();
            $rule = $userRule ?: $roleRule;

            if ($rule) {
                $result[$page->page_key] = [
                    'visibility' => $rule->visibility,
                    'actions' => $this->jsonArray($rule->actions),
                    'columns' => $this->jsonArray($rule->columns),
                    'row_scope' => $rule->row_scope,
                    'selected_branches' => $this->jsonArray($rule->selected_branches),
                    'expires_at' => $rule->expires_at,
                    'source' => $userRule ? 'user_override' : 'role_rule',
                ];
            } else {
                $result[$page->page_key] = [
                    'visibility' => $page->default_visibility === 'public' ? 'allow' : 'deny',
                    'actions' => [],
                    'columns' => [],
                    'row_scope' => 'own_branch',
                    'selected_branches' => [],
                    'source' => 'page_default',
                ];
            }
        }

        return $result;
    }

    private function validateSubject(string $type, int $id): void
    {
        if ($type === 'user') {
            abort_unless(User::whereKey($id)->exists(), 422, 'Selected user does not exist.');
            return;
        }

        abort_unless(Role::whereKey($id)->exists(), 422, 'Selected role does not exist.');
    }

    private function normalizePage(object $page): array
    {
        return [
            'id' => (int) $page->id,
            'page_key' => $page->page_key,
            'page_name' => $page->page_name,
            'module' => $page->module,
            'route' => $page->route,
            'sidebar_group' => $page->sidebar_group,
            'default_visibility' => $page->default_visibility,
            'available_actions' => $this->jsonArray($page->available_actions),
            'available_columns' => $this->jsonArray($page->available_columns),
            'available_row_scopes' => $this->jsonArray($page->available_row_scopes),
            'dashboard_widget_support' => (bool) $page->dashboard_widget_support,
            'enabled' => (bool) $page->enabled,
        ];
    }

    private function normalizeRule(object $rule): array
    {
        return [
            'id' => isset($rule->id) ? (int) $rule->id : null,
            'page_key' => $rule->page_key ?? null,
            'page_name' => $rule->page_name ?? null,
            'module' => $rule->module ?? null,
            'subject_type' => $rule->subject_type,
            'subject_id' => isset($rule->subject_id) ? (int) $rule->subject_id : null,
            'visibility' => $rule->visibility,
            'actions' => $this->jsonArray($rule->actions),
            'columns' => $this->jsonArray($rule->columns),
            'row_scope' => $rule->row_scope ?? null,
            'selected_branches' => $this->jsonArray($rule->selected_branches),
            'expires_at' => $rule->expires_at ?? null,
            'changed_by' => isset($rule->changed_by) ? (int) $rule->changed_by : null,
            'changed_by_name' => $rule->changed_by_name ?? null,
            'created_at' => $rule->created_at ?? null,
            'updated_at' => $rule->updated_at ?? null,
        ];
    }

    private function schemaReady(): bool
    {
        return Schema::hasTable('access_pages') && Schema::hasTable('access_rules_v12');
    }

    private function requireSchema(): void
    {
        abort_unless($this->schemaReady(), 503, 'Access Matrix schema is not installed. Run Release 1 migrations.');
    }

    private function requireSuperAdmin(Request $request): void
    {
        abort_unless($this->accessControl->isSuperAdmin($request->user()), 403, 'Only Super Admin can manage the Access Matrix.');
    }

    private function jsonArray($value): array
    {
        if (is_array($value)) {
            return array_values($value);
        }

        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? array_values($decoded) : [];
    }
}
