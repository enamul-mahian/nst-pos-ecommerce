<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\DashboardThemeVersion;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;

class DashboardThemeController extends Controller
{
    public function effective(Request $request)
    {
        if (!Schema::hasTable('dashboard_theme_versions')) {
            return response()->json(['success' => true, 'data' => $this->fallback()]);
        }

        $versions = DashboardThemeVersion::query()
            ->with('assignments')
            ->where('status', 'published')
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->get();

        $selected = $this->resolveEffectiveVersion($request->user(), $versions);

        return response()->json([
            'success' => true,
            'data' => $selected ? $this->serialize($selected) : $this->fallback(),
        ]);
    }

    public function manage(Request $request)
    {
        $this->superAdmin($request);

        if (!Schema::hasTable('dashboard_theme_versions')) {
            return response()->json(['success' => true, 'data' => [
                'draft' => null,
                'published' => null,
                'global_default' => null,
                'history' => [],
            ]]);
        }

        $publishedVersions = DashboardThemeVersion::query()
            ->with('assignments')
            ->where('status', 'published')
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->get();

        return response()->json(['success' => true, 'data' => [
            'draft' => $this->nullableSerialize(
                DashboardThemeVersion::with('assignments')->where('status', 'draft')->latest('id')->first()
            ),
            'published' => $this->nullableSerialize(
                $this->resolveEffectiveVersion($request->user(), $publishedVersions)
            ),
            'global_default' => $this->nullableSerialize(
                $publishedVersions->first(fn (DashboardThemeVersion $version) => $this->isGlobalVersion($version))
            ),
            'history' => $this->serializeHistory(
                DashboardThemeVersion::with('assignments')
                    ->orderByDesc('published_at')
                    ->orderByDesc('id')
                    ->limit(50)
                    ->get(),
                AuditLog::query()
                    ->where('module', 'dashboard_theme')
                    ->whereIn('action', ['dashboard_theme.published', 'dashboard_theme.rolled_back'])
                    ->orderByDesc('id')
                    ->limit(100)
                    ->get()
            ),
        ]]);
    }

    public function saveDraft(Request $request)
    {
        $this->superAdmin($request);
        $data = $this->validated($request);

        $version = DB::transaction(function () use ($request, $data) {
            DashboardThemeVersion::where('status', 'draft')->update(['status' => 'superseded']);

            $version = DashboardThemeVersion::create([
                'theme_id' => $data['theme']['id'],
                'name' => $data['theme']['name'],
                'status' => 'draft',
                'theme_payload' => $data['theme'],
                'available_theme_ids' => $data['available_theme_ids'] ?? [],
                'is_default' => false,
                'created_by' => $request->user()->id,
            ]);

            $this->syncAssignments($version, $data['assignments'] ?? []);
            $this->audit($request, 'dashboard_theme.draft_saved', null, $version->fresh('assignments')->toArray(), $version->id);

            return $version->load('assignments');
        });

        return response()->json([
            'success' => true,
            'message' => 'Dashboard theme draft saved.',
            'data' => $this->serialize($version),
        ]);
    }

    public function publish(Request $request, DashboardThemeVersion $version)
    {
        $this->superAdmin($request);
        abort_unless($version->status === 'draft', 422, 'Only the current draft can be published.');

        DB::transaction(function () use ($request, $version) {
            $version->load('assignments');
            $isGlobal = $this->isGlobalVersion($version);
            $old = $isGlobal
                ? DashboardThemeVersion::with('assignments')->where('status', 'published')->where('is_default', true)->latest('id')->first()
                : $this->latestMatchingScope($version);

            if ($isGlobal) {
                DashboardThemeVersion::where('status', 'published')->where('is_default', true)->update(['is_default' => false]);
            }

            $version->update([
                'status' => 'published',
                'is_default' => $isGlobal,
                'published_by' => $request->user()->id,
                'published_at' => now(),
            ]);

            $this->audit(
                $request,
                'dashboard_theme.published',
                $old?->toArray(),
                $version->fresh('assignments')->toArray(),
                $version->id
            );
        });

        return response()->json([
            'success' => true,
            'message' => 'Dashboard theme published.',
            'data' => $this->serialize($version->fresh('assignments')),
        ]);
    }

    public function rollback(Request $request, DashboardThemeVersion $version)
    {
        $this->superAdmin($request);
        abort_unless($version->status === 'published', 422, 'Only a published version can be restored.');
        $version->load('assignments');
        abort_if($this->isCurrentScopeVersion($version), 422, 'The current published version cannot be restored again.');

        $copy = DB::transaction(function () use ($request, $version) {
            $version->load('assignments');
            $isGlobal = $this->isGlobalVersion($version);

            if ($isGlobal) {
                DashboardThemeVersion::where('status', 'published')->where('is_default', true)->update(['is_default' => false]);
            }

            $copy = DashboardThemeVersion::create([
                'theme_id' => $version->theme_id,
                'name' => $version->name.' (Restored)',
                'status' => 'published',
                'theme_payload' => $version->theme_payload,
                'available_theme_ids' => $version->available_theme_ids,
                'is_default' => $isGlobal,
                'created_by' => $request->user()->id,
                'published_by' => $request->user()->id,
                'published_at' => now(),
                'source_version_id' => $version->id,
            ]);

            foreach ($version->assignments as $assignment) {
                $copy->assignments()->create($assignment->only([
                    'assignable_type', 'assignable_key', 'branch_id', 'enabled',
                ]));
            }

            $this->audit($request, 'dashboard_theme.rolled_back', null, $copy->fresh('assignments')->toArray(), $copy->id);

            return $copy->load('assignments');
        });

        return response()->json([
            'success' => true,
            'message' => 'Dashboard theme restored and published.',
            'data' => $this->serialize($copy),
        ]);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'theme' => 'required|array',
            'theme.id' => 'required|string|max:80',
            'theme.name' => 'required|string|max:150',
            'theme.primary' => 'required|string|max:40',
            'theme.accent' => 'required|string|max:40',
            'theme.background' => 'required|string|max:60',
            'theme.surface' => 'required|string|max:60',
            'theme.text' => 'required|string|max:40',
            'theme.muted' => 'nullable|string|max:40',
            'theme.border' => 'nullable|string|max:80',
            'theme.sidebar' => 'nullable|string|max:60',
            'theme.topbar' => 'nullable|string|max:60',
            'theme.radius' => 'nullable|string|max:30',
            'theme.shadow' => 'nullable|string|max:150',
            'theme.blur' => 'nullable|string|max:30',
            'available_theme_ids' => 'nullable|array|max:99',
            'available_theme_ids.*' => 'string|max:80',
            'assignments' => 'nullable|array|max:250',
            'assignments.*.assignable_type' => ['required', Rule::in(['all', 'role', 'user'])],
            'assignments.*.assignable_key' => 'required|string|max:120',
            'assignments.*.branch_id' => 'nullable|integer|exists:branches,id',
            'assignments.*.enabled' => 'nullable|boolean',
        ]);
    }

    private function syncAssignments(DashboardThemeVersion $version, array $assignments): void
    {
        $seen = [];

        foreach ($assignments as $assignment) {
            $branchId = $assignment['branch_id'] ?? null;
            $signature = implode('|', [
                $assignment['assignable_type'],
                strtolower(trim($assignment['assignable_key'])),
                $branchId === null ? '*' : (string) $branchId,
            ]);

            if (isset($seen[$signature])) {
                continue;
            }
            $seen[$signature] = true;

            $version->assignments()->create([
                'assignable_type' => $assignment['assignable_type'],
                'assignable_key' => strtolower(trim($assignment['assignable_key'])),
                'branch_id' => $branchId,
                'enabled' => $assignment['enabled'] ?? true,
            ]);
        }
    }

    private function resolveEffectiveVersion($user, Collection $versions): ?DashboardThemeVersion
    {
        if (!$user) {
            return $versions->first(fn (DashboardThemeVersion $version) => $this->isGlobalVersion($version));
        }

        $roles = method_exists($user, 'getRoleNames')
            ? $user->getRoleNames()->map(fn ($role) => $this->normalizeRole($role))->values()->all()
            : [];
        $branchId = $user->branch_id;

        $best = null;
        $bestScore = -1;

        foreach ($versions as $version) {
            $score = $this->versionMatchScore($version, $user->id, $roles, $branchId);
            if ($score > $bestScore) {
                $best = $version;
                $bestScore = $score;
            }
        }

        return $bestScore >= 0 ? $best : null;
    }

    private function versionMatchScore(DashboardThemeVersion $version, $userId, array $roles, $branchId): int
    {
        if ($version->assignments->isEmpty()) {
            return $version->is_default ? 100 : -1;
        }

        $score = -1;
        foreach ($version->assignments as $assignment) {
            if (!$assignment->enabled) {
                continue;
            }

            $branchMatches = $assignment->branch_id === null || (int) $assignment->branch_id === (int) $branchId;
            if (!$branchMatches) {
                continue;
            }

            $hasBranch = $assignment->branch_id !== null;
            $key = $this->normalizeRole($assignment->assignable_key);

            if ($assignment->assignable_type === 'user' && (string) $assignment->assignable_key === (string) $userId) {
                $score = max($score, $hasBranch ? 600 : 550);
            } elseif ($assignment->assignable_type === 'role' && in_array($key, $roles, true)) {
                $score = max($score, $hasBranch ? 500 : 450);
            } elseif ($assignment->assignable_type === 'all') {
                $score = max($score, $hasBranch ? 300 : 100);
            }
        }

        return $score;
    }

    private function isGlobalVersion(DashboardThemeVersion $version): bool
    {
        if ($version->assignments->isEmpty()) {
            return true;
        }

        return $version->assignments->contains(fn ($assignment) =>
            $assignment->enabled
            && $assignment->assignable_type === 'all'
            && strtolower($assignment->assignable_key) === 'all'
            && $assignment->branch_id === null
        );
    }

    private function isCurrentScopeVersion(DashboardThemeVersion $version): bool
    {
        if ($this->isGlobalVersion($version)) {
            $current = DashboardThemeVersion::query()
                ->where('status', 'published')
                ->where('is_default', true)
                ->orderByDesc('published_at')
                ->orderByDesc('id')
                ->first();

            return $current && (int) $current->id === (int) $version->id;
        }

        $current = DashboardThemeVersion::with('assignments')
            ->where('status', 'published')
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->get()
            ->first(fn (DashboardThemeVersion $candidate) =>
                $this->scopeSignature($candidate) === $this->scopeSignature($version)
            );

        return $current && (int) $current->id === (int) $version->id;
    }

    private function latestMatchingScope(DashboardThemeVersion $version): ?DashboardThemeVersion
    {
        $signature = $this->scopeSignature($version);

        return DashboardThemeVersion::with('assignments')
            ->where('status', 'published')
            ->where('id', '!=', $version->id)
            ->orderByDesc('published_at')
            ->orderByDesc('id')
            ->get()
            ->first(fn (DashboardThemeVersion $candidate) => $this->scopeSignature($candidate) === $signature);
    }

    private function scopeSignature(DashboardThemeVersion $version): string
    {
        return $version->assignments
            ->filter(fn ($assignment) => $assignment->enabled)
            ->map(fn ($assignment) => implode('|', [
                $assignment->assignable_type,
                strtolower($assignment->assignable_key),
                $assignment->branch_id === null ? '*' : (string) $assignment->branch_id,
            ]))
            ->sort()
            ->values()
            ->implode(';');
    }

    private function normalizeRole(string $role): string
    {
        return strtolower(str_replace(['-', ' '], '_', trim($role)));
    }

    private function serialize(DashboardThemeVersion $version): array
    {
        return [
            'id' => $version->id,
            'theme' => $version->theme_payload,
            'status' => $version->status,
            'is_default' => $version->is_default,
            'is_global' => $this->isGlobalVersion($version),
            'available_theme_ids' => $version->available_theme_ids ?: [],
            'assignments' => $version->assignments->map->only([
                'id', 'assignable_type', 'assignable_key', 'branch_id', 'enabled',
            ])->values(),
            'published_at' => $version->published_at?->toIso8601String(),
            'created_at' => $version->created_at?->toIso8601String(),
            'source_version_id' => $version->source_version_id,
        ];
    }


    private function serializeHistory(Collection $versions, Collection $auditLogs): Collection
    {
        $currentScopes = [];
        $auditByVersion = $auditLogs->groupBy(fn ($log) => (string) $log->model_id);

        return $versions->map(function (DashboardThemeVersion $version) use (&$currentScopes, $auditByVersion) {
            $row = $this->serialize($version);
            $row['is_current_scope'] = false;
            $audit = $auditByVersion->get((string) $version->id)?->first();
            $row['audit'] = $audit ? [
                'action' => $audit->action,
                'user_id' => $audit->user_id,
                'user_name' => $audit->user_name,
                'user_email' => $audit->user_email,
                'roles' => $audit->roles ?: [],
                'branch_id' => $audit->branch_id,
                'ip_address' => $audit->ip_address,
                'user_agent' => $audit->user_agent,
                'created_at' => $audit->created_at?->toIso8601String(),
                'changes' => $audit->request_payload,
                'rollback_available' => (bool) data_get($audit->meta, 'rollback_available', false),
            ] : null;

            if ($version->status !== 'published') {
                return $row;
            }

            $scope = $this->scopeSignature($version);
            if (!array_key_exists($scope, $currentScopes)) {
                $currentScopes[$scope] = $version->id;
                $row['is_current_scope'] = true;
            }

            return $row;
        })->values();
    }

    private function nullableSerialize($version)
    {
        return $version ? $this->serialize($version) : null;
    }

    private function fallback(): array
    {
        return [
            'id' => null,
            'theme' => null,
            'status' => 'fallback',
            'is_default' => true,
            'is_global' => true,
            'available_theme_ids' => [],
            'assignments' => [],
        ];
    }

    private function superAdmin(Request $request): void
    {
        $user = $request->user();
        abort_unless(
            $user
            && method_exists($user, 'hasRole')
            && ($user->hasRole('super_admin') || $user->hasRole('Super Admin')),
            403,
            'Super Admin access required.'
        );
    }

    private function audit(Request $request, string $action, $old, $new, $modelId): void
    {
        if (!Schema::hasTable('audit_logs')) {
            return;
        }

        $user = $request->user();
        AuditLog::create([
            'user_id' => $user->id,
            'branch_id' => $user->branch_id,
            'user_name' => $user->name,
            'user_email' => $user->email,
            'roles' => method_exists($user, 'getRoleNames') ? $user->getRoleNames()->values()->all() : [],
            'action' => $action,
            'method' => $request->method(),
            'path' => $request->path(),
            'route_name' => optional($request->route())->getName(),
            'module' => 'dashboard_theme',
            'model_type' => DashboardThemeVersion::class,
            'model_id' => (string) $modelId,
            'description' => $action,
            'status_code' => 200,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'request_payload' => ['old' => $old, 'new' => $new],
            'response_payload' => null,
            'meta' => ['rollback_available' => true],
        ]);
    }
}
