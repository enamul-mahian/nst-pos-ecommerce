<?php

namespace App\Http\Controllers\Api\Pos;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class PosV27Controller extends Controller
{
    public function profile(Request $request)
    {
        return response()->json(['status' => true, 'data' => $request->user()]);
    }

    public function updateProfile(Request $request)
    {
        return response()->json(['status' => true, 'message' => 'Profile endpoint is available.', 'data' => $request->except(['password'])]);
    }

    public function twoFactorStatus()
    {
        return response()->json(['status' => true, 'data' => ['enabled' => false]]);
    }

    public function twoFactorSetup()
    {
        return response()->json(['status' => false, 'message' => '2FA setup is not enabled in this local package.'], 409);
    }

    public function twoFactorConfirm()
    {
        return response()->json(['status' => false, 'message' => '2FA confirmation is not enabled in this local package.'], 409);
    }

    public function twoFactorDisable()
    {
        return response()->json(['status' => true, 'message' => '2FA disabled state confirmed.']);
    }

    public function accessOptions()
    {
        return response()->json(['status' => true, 'data' => []]);
    }

    public function accessRules()
    {
        return response()->json(['status' => true, 'data' => []]);
    }

    public function saveAccessRules(Request $request)
    {
        return response()->json(['status' => false, 'message' => 'Access Assign is deferred until final access design.', 'data' => $request->all()], 409);
    }

    public function deviceHistorySearch(Request $request)
    {
        return app(DeviceHistoryController::class)->search($request);
    }

    public function deviceHistory(Request $request)
    {
        return app(DeviceHistoryController::class)->search($request);
    }
}
