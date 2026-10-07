<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GooglePost;
use App\Services\AccessControlService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class GooglePostController extends Controller
{
    public function __construct(private AccessControlService $accessControl)
    {
    }

    public function index(Request $request)
    {
        $this->authorizeStaff($request);

        if (! Schema::hasTable('google_posts')) {
            return response()->json(['success' => false, 'message' => 'google_posts table missing. Run migration.'], 404);
        }

        $query = GooglePost::query()->with(['branch:id,name', 'creator:id,name']);

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('branch_id')) {
            $query->where('branch_id', $request->branch_id);
        }

        if ($request->filled('search')) {
            $search = trim((string) $request->search);
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('description', 'like', "%{$search}%")
                    ->orWhere('external_reference_url', 'like', "%{$search}%")
                    ->orWhere('external_post_id', 'like', "%{$search}%");
            });
        }

        return response()->json([
            'success' => true,
            'data' => $query->latest()->paginate((int) $request->get('per_page', 15)),
        ]);
    }

    public function store(Request $request)
    {
        $this->authorizeStaff($request);

        $validated = $this->validatePayload($request);

        if ($request->hasFile('feature_image')) {
            $validated['feature_image'] = $request->file('feature_image')->store('google-posts', 'public');
        }

        $validated['created_by'] = $request->user()?->id;
        $validated['updated_by'] = $request->user()?->id;
        $validated = $this->normalizeStatusFields($validated);

        $post = GooglePost::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Google post saved successfully.',
            'data' => $post->fresh(['branch:id,name', 'creator:id,name']),
        ], 201);
    }

    public function show(Request $request, GooglePost $googlePost)
    {
        $this->authorizeStaff($request);

        return response()->json([
            'success' => true,
            'data' => $googlePost->load(['branch:id,name', 'creator:id,name']),
        ]);
    }

    public function update(Request $request, GooglePost $googlePost)
    {
        $this->authorizeStaff($request);

        $validated = $this->validatePayload($request, updating: true);

        if ($request->hasFile('feature_image')) {
            if ($googlePost->feature_image && Storage::disk('public')->exists($googlePost->feature_image)) {
                Storage::disk('public')->delete($googlePost->feature_image);
            }
            $validated['feature_image'] = $request->file('feature_image')->store('google-posts', 'public');
        }

        if ($request->boolean('remove_feature_image')) {
            if ($googlePost->feature_image && Storage::disk('public')->exists($googlePost->feature_image)) {
                Storage::disk('public')->delete($googlePost->feature_image);
            }
            $validated['feature_image'] = null;
        }

        $validated['updated_by'] = $request->user()?->id;
        $validated = $this->normalizeStatusFields($validated, $googlePost);

        $googlePost->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Google post updated successfully.',
            'data' => $googlePost->fresh(['branch:id,name', 'creator:id,name']),
        ]);
    }

    public function destroy(Request $request, GooglePost $googlePost)
    {
        $this->authorizeStaff($request);

        if ($googlePost->feature_image && Storage::disk('public')->exists($googlePost->feature_image)) {
            Storage::disk('public')->delete($googlePost->feature_image);
        }

        $googlePost->delete();

        return response()->json(['success' => true, 'message' => 'Google post deleted successfully.']);
    }

    private function validatePayload(Request $request, bool $updating = false): array
    {
        $required = $updating ? 'sometimes' : 'required';

        return $request->validate([
            'title' => [$required, 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'feature_image' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
            'status' => ['nullable', Rule::in(['draft', 'scheduled', 'published', 'failed'])],
            'scheduled_at' => ['nullable', 'date'],
            'published_at' => ['nullable', 'date'],
            'external_post_id' => ['nullable', 'string', 'max:255'],
            'external_reference_url' => ['nullable', 'string', 'max:1000'],
            'cta_url' => ['nullable', 'string', 'max:1000'],
            'sync_status' => ['nullable', Rule::in(['pending', 'synced', 'failed', 'skipped'])],
            'sync_error' => ['nullable', 'string'],
            'branch_id' => ['nullable', 'integer'],
            'remove_feature_image' => ['nullable', 'boolean'],
        ]);
    }

    private function normalizeStatusFields(array $data, ?GooglePost $existing = null): array
    {
        $status = $data['status'] ?? $existing?->status ?? 'draft';
        $data['status'] = $status;

        if ($status === 'published' && empty($data['published_at']) && ! $existing?->published_at) {
            $data['published_at'] = now();
        }

        if ($status === 'scheduled' && empty($data['sync_status'])) {
            $data['sync_status'] = 'pending';
        }

        return $data;
    }

    private function authorizeStaff(Request $request): void
    {
        if (! $this->accessControl->canAccessPos($request->user())) {
            abort(403, 'Supplier/Customer portal users cannot access POS Google Posts module.');
        }
    }
}
