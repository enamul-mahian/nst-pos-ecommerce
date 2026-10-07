<?php

namespace App\Services;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class ReleaseScopeService
{
    public function allowsAll(Request $request): bool
    {
        $rule = $this->rule($request);
        return in_array((string) ($rule['row_scope'] ?? 'own_branch'), ['all_records', 'all_branches'], true);
    }

    public function branchIds(Request $request): array
    {
        $rule = $this->rule($request);
        $scope = (string) ($rule['row_scope'] ?? 'own_branch');

        if (in_array($scope, ['all_records', 'all_branches'], true)) {
            return [];
        }

        if ($scope === 'selected_branches') {
            return array_values(array_unique(array_filter(array_map('intval', (array) ($rule['selected_branches'] ?? [])))));
        }

        $user = $request->user();
        if (! $user) {
            return [];
        }

        $ids = Schema::hasTable('branch_user')
            ? DB::table('branch_user')->where('user_id', $user->id)->pluck('branch_id')->map(fn ($id) => (int) $id)->all()
            : [];

        if (! empty($user->branch_id)) {
            $ids[] = (int) $user->branch_id;
        }

        return array_values(array_unique($ids));
    }

    public function assertBranch(Request $request, ?int $branchId, string $message = 'This branch is outside your assigned data scope.'): void
    {
        if ($this->allowsAll($request)) {
            return;
        }

        abort_unless($branchId && in_array($branchId, $this->branchIds($request), true), 403, $message);
    }

    public function rule(Request $request): array
    {
        return (array) $request->attributes->get('nst_access_rule', [
            'row_scope' => 'own_branch',
            'selected_branches' => [],
        ]);
    }
}
