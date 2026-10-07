<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\NidVerificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class NidVerificationController extends Controller
{
    public function __construct(private readonly NidVerificationService $service)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'branch_manager']);
        $query = DB::table('nid_verification_logs')
            ->leftJoin('nid_verification_providers', 'nid_verification_providers.id', '=', 'nid_verification_logs.provider_id')
            ->select('nid_verification_logs.*', 'nid_verification_providers.name as provider_name')
            ->orderByDesc('nid_verification_logs.id');

        if ($request->filled('status')) {
            $query->where('nid_verification_logs.status', $request->string('status')->toString());
        }
        if ($request->filled('search')) {
            $search = trim($request->string('search')->toString());
            $query->where(function ($builder) use ($search): void {
                $builder->where('nid_verification_logs.nid_number', 'like', "%{$search}%")
                    ->orWhere('nid_verification_logs.request_uuid', 'like', "%{$search}%")
                    ->orWhere('nid_verification_logs.short_note', 'like', "%{$search}%");
            });
        }

        $page = $query->paginate(max(1, min((int) $request->get('per_page', 30), 100)));
        $page->setCollection($page->getCollection()->map(fn (object $row): array => $this->service->formatRecord($row)));

        return response()->json(['status' => true, 'data' => $page]);
    }

    public function show(Request $request, int $verificationId): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'branch_manager']);
        $row = DB::table('nid_verification_logs')
            ->leftJoin('nid_verification_providers', 'nid_verification_providers.id', '=', 'nid_verification_logs.provider_id')
            ->select('nid_verification_logs.*', 'nid_verification_providers.name as provider_name')
            ->where('nid_verification_logs.id', $verificationId)
            ->first();

        abort_unless($row, 404, 'NID verification request was not found.');
        return response()->json(['status' => true, 'data' => $this->service->formatRecord($row, true)]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'branch_manager']);
        $validated = $request->validate([
            'nid_number' => ['required', 'regex:/^[0-9]{10,17}$/'],
            'date_of_birth' => ['required', 'date', 'before_or_equal:today'],
            'short_note' => ['nullable', 'string', 'max:2000'],
            'consent_confirmed' => ['accepted'],
            'custom_data' => ['nullable', 'array', 'max:100'],
            'custom_data.*' => ['nullable'],
        ]);

        try {
            $row = $this->service->create($validated, (int) $request->user()->id);
        } catch (RuntimeException $exception) {
            return response()->json(['status' => false, 'message' => $exception->getMessage()], 422);
        }

        $full = DB::table('nid_verification_logs')
            ->leftJoin('nid_verification_providers', 'nid_verification_providers.id', '=', 'nid_verification_logs.provider_id')
            ->select('nid_verification_logs.*', 'nid_verification_providers.name as provider_name')
            ->where('nid_verification_logs.id', $row->id)
            ->first();

        return response()->json([
            'status' => true,
            'message' => $this->statusMessage((string) $full->status),
            'data' => $this->service->formatRecord($full, true),
        ], 201);
    }

    public function resume(Request $request, int $verificationId): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'branch_manager']);
        $row = $this->service->process($verificationId, (int) $request->user()->id);
        return response()->json([
            'status' => true,
            'message' => $this->statusMessage((string) $row->status),
            'data' => $this->service->formatRecord($row, true),
        ]);
    }

    public function manualResult(Request $request, int $verificationId): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin']);
        $validated = $request->validate([
            'decision' => ['required', Rule::in(['verified', 'rejected'])],
            'result' => ['nullable', 'array', 'max:100'],
            'note' => ['nullable', 'string', 'max:2000'],
        ]);
        $row = $this->service->saveManualResult(
            $verificationId,
            $validated['decision'],
            $validated['result'] ?? [],
            $validated['note'] ?? null,
            (int) $request->user()->id
        );

        return response()->json(['status' => true, 'message' => 'Manual verification result saved.', 'data' => $this->service->formatRecord($row, true)]);
    }

    public function cancel(Request $request, int $verificationId): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin']);
        DB::table('nid_verification_logs')->where('id', $verificationId)->whereNotIn('status', ['verified', 'rejected'])->update([
            'status' => 'cancelled',
            'error_code' => null,
            'error_message' => 'Cancelled by an authorized operator.',
            'updated_by' => $request->user()->id,
            'updated_at' => now(),
        ]);
        return response()->json(['status' => true, 'message' => 'NID verification request cancelled.']);
    }

    public function config(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin', 'branch_manager']);
        $provider = DB::table('nid_verification_providers')->orderByDesc('is_active')->orderBy('id')->first();
        $fields = DB::table('nid_verification_fields')->orderBy('sort_order')->orderBy('id')->get()->map(fn (object $row): array => [
            'id' => $row->id,
            'label' => $row->label,
            'field_key' => $row->field_key,
            'field_type' => $row->field_type,
            'placeholder' => $row->placeholder,
            'options' => $this->decodeJson($row->options),
            'validation_rule' => $row->validation_rule,
            'is_required' => (bool) $row->is_required,
            'send_to_provider' => (bool) $row->send_to_provider,
            'internal_only' => (bool) $row->internal_only,
            'is_active' => (bool) $row->is_active,
            'sort_order' => (int) $row->sort_order,
        ]);

        $counts = DB::table('nid_verification_logs')->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');

        return response()->json([
            'status' => true,
            'data' => [
                'provider' => $provider ? $this->formatProvider($provider) : null,
                'fields' => $fields,
                'status_counts' => $counts,
            ],
        ]);
    }

    public function saveProvider(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin']);
        $validated = $request->validate([
            'id' => ['nullable', 'integer', 'exists:nid_verification_providers,id'],
            'name' => ['required', 'string', 'max:190'],
            'mode' => ['required', Rule::in(['manual', 'official_api'])],
            'api_url' => ['nullable', 'required_if:mode,official_api', 'url', 'max:2000'],
            'http_method' => ['required', Rule::in(['GET', 'POST', 'PUT', 'PATCH'])],
            'request_format' => ['required', Rule::in(['json', 'form'])],
            'auth_type' => ['required', Rule::in(['none', 'bearer', 'custom_header'])],
            'auth_header' => ['nullable', 'string', 'max:100'],
            'auth_scheme' => ['nullable', 'string', 'max:40'],
            'authentication_url' => ['nullable', 'url', 'max:2000'],
            'request_headers' => ['nullable', 'array', 'max:50'],
            'request_template' => ['nullable', 'array', 'max:100'],
            'response_mapping' => ['nullable', 'array', 'max:100'],
            'success_path' => ['nullable', 'string', 'max:190'],
            'success_values' => ['nullable', 'array', 'max:30'],
            'success_values.*' => ['nullable', 'string', 'max:100'],
            'timeout_seconds' => ['required', 'integer', 'min:5', 'max:60'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        if (($validated['mode'] ?? '') === 'official_api') {
            $this->assertHttpsUrl((string) $validated['api_url'], 'Provider API URL');
        }
        if (! empty($validated['authentication_url'])) {
            $this->assertHttpsUrl((string) $validated['authentication_url'], 'Provider authentication URL');
        }

        $id = $validated['id'] ?? DB::table('nid_verification_providers')->value('id');
        $payload = [
            'name' => $validated['name'],
            'mode' => $validated['mode'],
            'api_url' => $validated['api_url'] ?? null,
            'http_method' => $validated['http_method'],
            'request_format' => $validated['request_format'],
            'auth_type' => $validated['auth_type'],
            'auth_header' => $validated['auth_header'] ?: 'Authorization',
            'auth_scheme' => $validated['auth_scheme'] ?? '',
            'authentication_url' => $validated['authentication_url'] ?? null,
            'request_headers' => json_encode($validated['request_headers'] ?? [], JSON_UNESCAPED_SLASHES),
            'request_template' => json_encode($validated['request_template'] ?? ['nid' => '{{nid_number}}', 'date_of_birth' => '{{date_of_birth}}'], JSON_UNESCAPED_SLASHES),
            'response_mapping' => json_encode($validated['response_mapping'] ?? [], JSON_UNESCAPED_SLASHES),
            'success_path' => $validated['success_path'] ?? null,
            'success_values' => json_encode($validated['success_values'] ?? ['true', 'success', 'verified', 'valid', '1'], JSON_UNESCAPED_SLASHES),
            'timeout_seconds' => $validated['timeout_seconds'],
            'is_active' => (bool) ($validated['is_active'] ?? false),
            'updated_by' => $request->user()->id,
            'updated_at' => now(),
        ];

        DB::transaction(function () use (&$id, $payload, $request): void {
            if ($payload['is_active']) {
                DB::table('nid_verification_providers')->update(['is_active' => false, 'updated_at' => now()]);
            }
            if ($id) {
                DB::table('nid_verification_providers')->where('id', $id)->update($payload);
            } else {
                $insert = $payload;
                $insert['created_by'] = $request->user()->id;
                $insert['created_at'] = now();
                $id = DB::table('nid_verification_providers')->insertGetId($insert);
            }
        });

        $provider = DB::table('nid_verification_providers')->where('id', $id)->first();
        return response()->json(['status' => true, 'message' => 'NID verification provider settings saved.', 'data' => $this->formatProvider($provider)]);
    }

    public function saveToken(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin', 'admin']);
        $validated = $request->validate([
            'provider_id' => ['required', 'integer', 'exists:nid_verification_providers,id'],
            'access_token' => ['required', 'string', 'min:8', 'max:12000'],
            'expires_at' => ['nullable', 'date', 'after:now'],
            'expires_in_minutes' => ['nullable', 'integer', 'min:1', 'max:10080'],
            'resume_pending' => ['nullable', 'boolean'],
            'resume_limit' => ['nullable', 'integer', 'min:1', 'max:25'],
        ]);

        $expiresAt = ! empty($validated['expires_at'])
            ? $validated['expires_at']
            : now()->addMinutes((int) ($validated['expires_in_minutes'] ?? 14));

        DB::table('nid_verification_providers')->where('id', $validated['provider_id'])->update([
            'access_token' => Crypt::encryptString($validated['access_token']),
            'token_expires_at' => $expiresAt,
            'token_updated_at' => now(),
            'updated_by' => $request->user()->id,
            'updated_at' => now(),
        ]);

        $summary = null;
        if ($validated['resume_pending'] ?? true) {
            $summary = $this->service->resumePending(
                (int) $validated['provider_id'],
                (int) $request->user()->id,
                (int) ($validated['resume_limit'] ?? 10)
            );
        }

        return response()->json([
            'status' => true,
            'message' => 'Provider token saved encrypted. Pending NID requests were preserved and resumed where possible.',
            'data' => ['expires_at' => $expiresAt, 'resume_summary' => $summary],
        ]);
    }

    public function clearToken(Request $request): JsonResponse
    {
        $this->requireRoles($request, ['super_admin']);
        $validated = $request->validate(['provider_id' => ['required', 'integer', 'exists:nid_verification_providers,id']]);
        DB::table('nid_verification_providers')->where('id', $validated['provider_id'])->update([
            'access_token' => null,
            'token_expires_at' => null,
            'token_updated_at' => null,
            'updated_by' => $request->user()->id,
            'updated_at' => now(),
        ]);
        return response()->json(['status' => true, 'message' => 'Saved provider token cleared.']);
    }

    public function saveField(Request $request, ?int $fieldId = null): JsonResponse
    {
        $this->requireRoles($request, ['super_admin']);
        $validated = $request->validate([
            'label' => ['required', 'string', 'max:190'],
            'field_key' => ['required', 'regex:/^[a-z][a-z0-9_.-]{1,99}$/', Rule::unique('nid_verification_fields', 'field_key')->ignore($fieldId)],
            'field_type' => ['required', Rule::in(['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'json'])],
            'placeholder' => ['nullable', 'string', 'max:190'],
            'options' => ['nullable', 'array', 'max:100'],
            'options.*' => ['nullable', 'string', 'max:190'],
            'validation_rule' => ['nullable', 'string', 'max:190'],
            'is_required' => ['nullable', 'boolean'],
            'send_to_provider' => ['nullable', 'boolean'],
            'internal_only' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0', 'max:10000'],
        ]);

        $payload = [
            'label' => $validated['label'],
            'field_key' => $validated['field_key'],
            'field_type' => $validated['field_type'],
            'placeholder' => $validated['placeholder'] ?? null,
            'options' => json_encode($validated['options'] ?? [], JSON_UNESCAPED_UNICODE),
            'validation_rule' => $validated['validation_rule'] ?? null,
            'is_required' => (bool) ($validated['is_required'] ?? false),
            'send_to_provider' => (bool) ($validated['send_to_provider'] ?? true),
            'internal_only' => (bool) ($validated['internal_only'] ?? false),
            'is_active' => (bool) ($validated['is_active'] ?? true),
            'sort_order' => (int) ($validated['sort_order'] ?? 0),
            'updated_by' => $request->user()->id,
            'updated_at' => now(),
        ];

        if ($fieldId) {
            DB::table('nid_verification_fields')->where('id', $fieldId)->update($payload);
        } else {
            $payload['created_by'] = $request->user()->id;
            $payload['created_at'] = now();
            $fieldId = DB::table('nid_verification_fields')->insertGetId($payload);
        }

        return response()->json(['status' => true, 'message' => 'Custom NID field saved.', 'data' => ['id' => $fieldId]]);
    }

    public function deleteField(Request $request, int $fieldId): JsonResponse
    {
        $this->requireRoles($request, ['super_admin']);
        DB::table('nid_verification_fields')->where('id', $fieldId)->delete();
        return response()->json(['status' => true, 'message' => 'Custom NID field deleted.']);
    }

    private function formatProvider(object $provider): array
    {
        $expiresAt = $provider->token_expires_at;
        $tokenValid = (bool) $provider->access_token && (! $expiresAt || now()->addSeconds(90)->lt($expiresAt));
        return [
            'id' => $provider->id,
            'name' => $provider->name,
            'mode' => $provider->mode,
            'api_url' => $provider->api_url,
            'http_method' => $provider->http_method,
            'request_format' => $provider->request_format,
            'auth_type' => $provider->auth_type,
            'auth_header' => $provider->auth_header,
            'auth_scheme' => $provider->auth_scheme,
            'token_configured' => (bool) $provider->access_token,
            'token_valid' => $tokenValid,
            'token_expires_at' => $provider->token_expires_at,
            'token_updated_at' => $provider->token_updated_at,
            'authentication_url' => $provider->authentication_url,
            'request_headers' => $this->decodeJson($provider->request_headers),
            'request_template' => $this->decodeJson($provider->request_template),
            'response_mapping' => $this->decodeJson($provider->response_mapping),
            'success_path' => $provider->success_path,
            'success_values' => $this->decodeJson($provider->success_values),
            'timeout_seconds' => (int) $provider->timeout_seconds,
            'is_active' => (bool) $provider->is_active,
        ];
    }

    private function statusMessage(string $status): string
    {
        return match ($status) {
            'verified' => 'NID verification completed successfully.',
            'auth_required' => 'The request is saved. Provider authentication expired; complete the provider CAPTCHA/login, save a new token, and resume.',
            'manual_review' => 'The request is saved for authorized manual review.',
            'configuration_required' => 'The request is saved, but an authorized provider must be configured.',
            'failed' => 'The request is saved but the provider call failed. It can be retried.',
            default => 'NID verification request saved.',
        };
    }

    private function requireRoles(Request $request, array $allowed): void
    {
        $roles = $this->roleNames($request->user());
        if (count(array_intersect($roles, $allowed)) === 0) {
            abort(response()->json(['status' => false, 'message' => 'You do not have permission for this operation.'], 403));
        }
    }

    private function roleNames($user): array
    {
        if (! $user) {
            return [];
        }
        $roles = method_exists($user, 'getRoleNames') ? $user->getRoleNames()->all() : [];
        foreach (['role', 'user_type', 'type', 'profile_type'] as $field) {
            if (! empty($user->{$field})) {
                $roles[] = $user->{$field};
            }
        }
        return array_values(array_unique(array_filter(array_map(
            fn ($role): string => preg_replace('/[^a-z0-9]+/', '_', strtolower(trim((string) $role))) ?: '',
            $roles
        ))));
    }

    private function decodeJson(?string $value): array
    {
        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function assertHttpsUrl(string $value, string $label): void
    {
        $parts = parse_url($value);
        if (($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])) {
            throw ValidationException::withMessages(['api_url' => "{$label} must use HTTPS."]);
        }
    }
}
