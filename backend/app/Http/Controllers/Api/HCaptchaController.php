<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\HCaptchaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class HCaptchaController extends Controller
{
    public function config(Request $request, HCaptchaService $hCaptcha): JsonResponse
    {
        $validated = $request->validate([
            'form' => ['required', Rule::in(array_keys(HCaptchaService::FORMS))],
        ]);

        return response()->json([
            'status' => true,
            'data' => $hCaptcha->publicConfig($validated['form']),
        ]);
    }
}
