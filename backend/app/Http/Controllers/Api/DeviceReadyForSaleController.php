<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeviceUnit;
use App\Services\AccessControlService;
use App\Services\DeviceSalePreparationService;
use App\Services\ReleaseScopeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DeviceReadyForSaleController extends Controller
{
    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly ReleaseScopeService $releaseScope,
        private readonly DeviceSalePreparationService $preparation,
    ) {
    }

    public function show(Request $request, DeviceUnit $deviceUnit): JsonResponse
    {
        if ($deviceUnit->branch_id) {
            $this->ensureBranchAccess($request, (int) $deviceUnit->branch_id);
        }

        return response()->json([
            'status' => true,
            'data' => $this->preparation->preparation($request, $deviceUnit),
        ]);
    }

    public function store(Request $request, DeviceUnit $deviceUnit): JsonResponse
    {
        abort_unless($deviceUnit->branch_id, 422, __('messages.sale_prep.branch_required'));
        $this->ensureBranchAccess($request, (int) $deviceUnit->branch_id);

        $result = $this->preparation->markReady($request, $deviceUnit);

        return response()->json([
            'status' => true,
            'message' => __('messages.sale_prep.ready_done'),
            'data' => $result['device'],
            'links' => collect($result)->except('device')->all(),
        ]);
    }

    private function ensureBranchAccess(Request $request, int $branchId): void
    {
        if ($this->accessControl->isSuperAdmin($request->user())) {
            return;
        }

        $this->releaseScope->assertBranch(
            $request,
            $branchId,
            'You cannot mark a device Ready for Sale for this branch.'
        );
    }
}
