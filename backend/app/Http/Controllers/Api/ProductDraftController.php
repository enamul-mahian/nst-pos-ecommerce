<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductDraft;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ProductDraftController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $drafts = ProductDraft::query()
            ->where('user_id', $request->user()->id)
            ->where('status', 'active')
            ->latest('updated_at')
            ->limit(50)
            ->get();

        return response()->json(['status' => true, 'data' => $drafts]);
    }

    public function show(Request $request, string $draftKey): JsonResponse
    {
        $draft = ProductDraft::query()
            ->where('user_id', $request->user()->id)
            ->where('draft_key', $draftKey)
            ->firstOrFail();

        return response()->json(['status' => true, 'data' => $draft]);
    }

    public function save(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'draft_key' => ['required', 'string', 'max:120', 'regex:/^[A-Za-z0-9._:-]+$/'],
            'product_id' => ['nullable', 'integer', 'exists:products,id'],
            'current_step' => ['required', 'integer', 'min:1', 'max:6'],
            'payload' => ['required', 'array'],
            'status' => ['nullable', Rule::in(['active', 'completed'])],
        ]);

        $draft = ProductDraft::updateOrCreate(
            [
                'user_id' => $request->user()->id,
                'draft_key' => $validated['draft_key'],
            ],
            [
                'product_id' => $validated['product_id'] ?? null,
                'current_step' => $validated['current_step'],
                'payload' => $validated['payload'],
                'status' => $validated['status'] ?? 'active',
                'completed_at' => ($validated['status'] ?? 'active') === 'completed' ? now() : null,
            ]
        );

        return response()->json([
            'status' => true,
            'message' => 'Product step draft saved.',
            'data' => $draft->fresh(),
        ]);
    }

    public function complete(Request $request, string $draftKey): JsonResponse
    {
        $draft = ProductDraft::query()
            ->where('user_id', $request->user()->id)
            ->where('draft_key', $draftKey)
            ->firstOrFail();

        $draft->update(['status' => 'completed', 'completed_at' => now()]);

        return response()->json(['status' => true, 'message' => 'Product draft completed.']);
    }

    public function destroy(Request $request, string $draftKey): JsonResponse
    {
        ProductDraft::query()
            ->where('user_id', $request->user()->id)
            ->where('draft_key', $draftKey)
            ->delete();

        return response()->json(['status' => true, 'message' => 'Product draft removed.']);
    }
}
