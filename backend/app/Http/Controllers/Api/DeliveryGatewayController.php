<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerOrder;
use App\Models\DeliveryGatewaySetting;
use App\Models\DeliveryGatewayShipment;
use App\Services\DeliveryGatewayManagerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Throwable;

class DeliveryGatewayController extends Controller
{
    public function __construct(
        private readonly DeliveryGatewayManagerService $manager,
    ) {
    }

    public function index(): JsonResponse
    {
        $rows = DeliveryGatewaySetting::query()
            ->orderByDesc('is_default')
            ->orderBy('id')
            ->get()
            ->map(fn (DeliveryGatewaySetting $provider) => $this->manager->adminProviderPayload($provider));

        return response()->json(['status' => true, 'data' => $rows]);
    }

    public function enabled(): JsonResponse
    {
        $rows = DeliveryGatewaySetting::query()
            ->where('is_enabled', true)
            ->orderByDesc('is_default')
            ->orderBy('name')
            ->get()
            ->map(fn (DeliveryGatewaySetting $provider) => $this->manager->enabledProviderPayload($provider));

        return response()->json(['status' => true, 'data' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $this->validateProvider($request);

        $provider = DB::transaction(function () use ($validated) {
            if ($validated['is_default'] ?? false) {
                DeliveryGatewaySetting::query()->update(['is_default' => false]);
            }

            return DeliveryGatewaySetting::create([
                'name' => $validated['name'],
                'code' => $validated['code'],
                'adapter' => $validated['adapter'],
                'is_enabled' => (bool) ($validated['is_enabled'] ?? false),
                'is_default' => (bool) ($validated['is_default'] ?? false),
                'base_url' => $validated['base_url'] ?? null,
                'credentials' => array_filter(
                    (array) ($validated['credentials'] ?? []),
                    fn ($value) => $value !== null && trim((string) $value) !== ''
                ),
                'settings' => (array) ($validated['settings'] ?? []),
            ]);
        });

        return response()->json([
            'status' => true,
            'message' => 'Delivery API provider created.',
            'data' => $this->manager->adminProviderPayload($provider),
        ], 201);
    }

    public function update(Request $request, DeliveryGatewaySetting $provider): JsonResponse
    {
        $validated = $this->validateProvider($request, $provider);

        DB::transaction(function () use ($validated, $provider) {
            if ($validated['is_default'] ?? false) {
                DeliveryGatewaySetting::query()
                    ->whereKeyNot($provider->id)
                    ->update(['is_default' => false]);
            }

            $provider->forceFill([
                'name' => $validated['name'],
                'code' => $validated['code'],
                'adapter' => $validated['adapter'],
                'is_enabled' => (bool) ($validated['is_enabled'] ?? false),
                'is_default' => (bool) ($validated['is_default'] ?? false),
                'base_url' => $validated['base_url'] ?? null,
                'credentials' => $this->manager->mergeCredentials(
                    $provider,
                    (array) ($validated['credentials'] ?? [])
                ),
                'settings' => (array) ($validated['settings'] ?? []),
            ])->save();
        });

        return response()->json([
            'status' => true,
            'message' => 'Delivery API provider saved.',
            'data' => $this->manager->adminProviderPayload($provider->fresh()),
        ]);
    }

    public function destroy(DeliveryGatewaySetting $provider): JsonResponse
    {
        abort_if($provider->shipments()->exists(), 422, 'Provider has shipment history and cannot be deleted. Disable it instead.');

        $provider->delete();

        return response()->json([
            'status' => true,
            'message' => 'Delivery API provider deleted.',
        ]);
    }

    public function test(DeliveryGatewaySetting $provider): JsonResponse
    {
        try {
            $result = $this->manager->testConnection($provider);

            return response()->json([
                'status' => true,
                'message' => $result['message'] ?? 'Courier API connection successful.',
                'data' => $result,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    public function shipments(Request $request): JsonResponse
    {
        $query = DeliveryGatewayShipment::query()
            ->with([
                'provider:id,name,code,adapter',
                'order:id,order_no,customer_name,customer_phone,status,delivery_status',
            ])
            ->latest('id');

        if ($request->filled('customer_order_id')) {
            $query->where('customer_order_id', $request->integer('customer_order_id'));
        }

        if ($request->filled('provider_id')) {
            $query->where('delivery_gateway_setting_id', $request->integer('provider_id'));
        }

        return response()->json([
            'status' => true,
            'data' => $query->paginate(min(200, max(10, $request->integer('per_page', 100)))),
        ]);
    }

    public function createShipment(Request $request, CustomerOrder $order): JsonResponse
    {
        $validated = $request->validate([
            'provider_id' => ['required', 'integer', 'exists:delivery_gateway_settings,id'],
            'note' => ['nullable', 'string', 'max:1000'],
            'weight' => ['nullable', 'numeric', 'min:0.1', 'max:100'],
            'force' => ['nullable', 'boolean'],
        ]);

        $provider = DeliveryGatewaySetting::findOrFail((int) $validated['provider_id']);

        try {
            $shipment = $this->manager->createShipment(
                $provider,
                $order,
                $validated,
                $request->user()?->id
            );

            return response()->json([
                'status' => true,
                'message' => 'Order sent to ' . $provider->name . '.',
                'data' => $shipment,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    public function syncShipment(DeliveryGatewayShipment $shipment): JsonResponse
    {
        try {
            $updated = $this->manager->syncShipment($shipment);

            return response()->json([
                'status' => true,
                'message' => 'Courier status synchronized.',
                'data' => $updated,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    public function webhook(Request $request, string $code): JsonResponse
    {
        $provider = DeliveryGatewaySetting::where('code', $code)->firstOrFail();

        $shipment = $this->manager->acceptWebhook(
            $provider,
            (array) $request->all(),
            $request->header('Authorization')
        );

        return response()->json([
            'status' => true,
            'message' => $shipment ? 'Courier webhook received.' : 'Webhook accepted; shipment not matched.',
        ]);
    }

    private function validateProvider(
        Request $request,
        ?DeliveryGatewaySetting $provider = null
    ): array {
        return $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'code' => [
                'required',
                'alpha_dash',
                'max:80',
                Rule::unique('delivery_gateway_settings', 'code')->ignore($provider?->id),
            ],
            'adapter' => ['required', Rule::in(['steadfast', 'pathao', 'generic'])],
            'is_enabled' => ['nullable', 'boolean'],
            'is_default' => ['nullable', 'boolean'],
            'base_url' => ['nullable', 'url', 'max:500'],
            'credentials' => ['nullable', 'array'],
            'credentials.api_key' => ['nullable', 'string', 'max:2000'],
            'credentials.secret_key' => ['nullable', 'string', 'max:2000'],
            'credentials.client_id' => ['nullable', 'string', 'max:2000'],
            'credentials.client_secret' => ['nullable', 'string', 'max:2000'],
            'credentials.username' => ['nullable', 'string', 'max:2000'],
            'credentials.password' => ['nullable', 'string', 'max:2000'],
            'credentials.token' => ['nullable', 'string', 'max:5000'],
            'credentials.webhook_token' => ['nullable', 'string', 'max:2000'],
            'settings' => ['nullable', 'array'],
        ]);
    }
}
