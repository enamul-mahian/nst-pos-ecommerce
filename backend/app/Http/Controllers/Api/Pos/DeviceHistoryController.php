<?php

namespace App\Http\Controllers\Api\Pos;

use App\Http\Controllers\Controller;
use App\Models\DeviceUnit;
use App\Services\AccessControlService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DeviceHistoryController extends Controller
{
    public function search(Request $request)
    {
        $limit = max(1, min((int) $request->integer('limit', 25), 50));
        $queryText = trim((string) $request->get('q', $request->get('search', '')));

        if (! Schema::hasTable('device_units')) {
            return response()->json([
                'status' => true,
                'data' => [
                    'query' => $queryText,
                    'items' => [],
                    'summary' => [
                        'matched_devices' => 0,
                        'sold_records' => 0,
                        'available_records' => 0,
                        'last_movement_at' => null,
                    ],
                    'message' => 'device_units table is not available yet.',
                ],
            ]);
        }

        // Identifier mode: only a full IMEI, SKU / barcode or invoice number opens a history.
        $exact = $request->boolean('exact');
        if ($exact && mb_strlen($queryText) < 3) {
            return response()->json([
                'status' => true,
                'data' => [
                    'query' => $queryText,
                    'items' => [],
                    'summary' => null,
                ],
            ]);
        }

        $deviceColumns = Schema::getColumnListing('device_units');
        $searchable = array_values(array_intersect($deviceColumns, [
            'sku', 'imei_1', 'imei_2', 'barcode', 'imei_1_barcode', 'imei_2_barcode',
            'product_name', 'model_number', 'color_name', 'region', 'sim_network',
            'country_region', 'sim_type', 'network_carrier', 'condition', 'ram',
            'storage', 'status',
        ]));

        $devices = DeviceUnit::withTrashed()
            ->with([
                'product',
                'variant',
                'branch',
                'supplier',
                'usedPurchase',
                'sale.customer',
                'sale.items',
                'saleItem',
            ])
            ->when($exact, fn ($builder) => $this->whereIdentifier($builder, $queryText, $deviceColumns))
            ->when(! $exact && $queryText !== '', function ($builder) use ($queryText, $searchable) {
                $builder->where(function ($inner) use ($queryText, $searchable) {
                    foreach ($searchable as $column) {
                        $inner->orWhere($column, 'like', '%' . $queryText . '%');
                    }

                    $inner->orWhereHas('product', function ($productQuery) use ($queryText) {
                        $productQuery->where('name', 'like', '%' . $queryText . '%')
                            ->orWhere('sku', 'like', '%' . $queryText . '%')
                            ->orWhere('barcode', 'like', '%' . $queryText . '%');
                    });

                    if (Schema::hasTable('product_variants')) {
                        $inner->orWhereHas('variant', function ($variantQuery) use ($queryText) {
                            $variantQuery->where('variant_name', 'like', '%' . $queryText . '%')
                                ->orWhere('sku', 'like', '%' . $queryText . '%')
                                ->orWhere('barcode', 'like', '%' . $queryText . '%');
                        });
                    }

                    if (Schema::hasTable('sales')) {
                        $inner->orWhereHas('sale', function ($saleQuery) use ($queryText) {
                            foreach (array_intersect(Schema::getColumnListing('sales'), [
                                'invoice_no', 'customer_name', 'customer_phone',
                            ]) as $column) {
                                $saleQuery->orWhere($column, 'like', '%' . $queryText . '%');
                            }
                        });
                    }

                    if (Schema::hasTable('device_unit_histories') && Schema::hasColumn('device_unit_histories', 'reference_no')) {
                        $inner->orWhereIn('id', function ($sub) use ($queryText) {
                            $sub->select('device_unit_id')
                                ->from('device_unit_histories')
                                ->where('reference_no', 'like', '%' . $queryText . '%');
                        });
                    }
                });
            })
            ->latest('updated_at')
            ->limit($limit)
            ->get();

        $access = app(AccessControlService::class);
        $canSeeCost = $access->canViewPurchasePrice($request->user());
        $canSeeSupplier = $access->canViewSupplierInfo($request->user());

        $items = $devices
            ->map(fn (DeviceUnit $device) => $this->formatDevice($device, $canSeeCost, $canSeeSupplier))
            ->values();

        $lastMovementAt = $items
            ->flatMap(fn ($item) => collect($item['timeline'] ?? [])->pluck('at'))
            ->filter()
            ->sortDesc()
            ->first();

        return response()->json([
            'status' => true,
            'data' => [
                'query' => $queryText,
                'items' => $items,
                'summary' => [
                    'matched_devices' => $devices->count(),
                    'sold_records' => $devices->filter(fn ($device) => strtolower((string) $device->status) === 'sold')->count(),
                    'available_records' => $devices->filter(
                        fn ($device) => in_array((string) $device->status, ['available', 'ready_for_sale', 'in_stock', 'active'], true)
                    )->count(),
                    'last_movement_at' => $lastMovementAt,
                ],
            ],
        ]);
    }

    private function formatDevice(DeviceUnit $device, bool $canSeeCost, bool $canSeeSupplier): array
    {
        $sale = $device->sale;
        $saleItem = $device->saleItem;
        $customer = $sale?->customer;
        $branch = $device->branch;
        $product = $device->product;
        $variant = $device->variant;

        $deviceData = [
            'id' => $device->id,
            'product_id' => $device->product_id,
            'product_variant_id' => $device->product_variant_id,
            'product_name' => $device->product_name ?: $product?->name,
            'model_number' => $device->model_number ?: $variant?->model_number ?: $product?->model,
            'sku' => $device->sku ?: $variant?->sku ?: $product?->sku,
            'imei_1' => $device->imei_1,
            'imei_2' => $device->imei_2,
            'barcode' => $device->barcode,
            'imei_1_barcode' => $device->imei_1_barcode,
            'imei_2_barcode' => $device->imei_2_barcode,
            'color_name' => $device->color_name ?: $variant?->color_name,
            'region' => $device->region ?: $variant?->region,
            'sim_network' => $device->sim_network ?: $variant?->sim_network,
            'country_region' => $device->country_region ?: ($variant?->country_region ?: $device->region ?: $variant?->region),
            'sim_type' => $device->sim_type ?: $variant?->sim_type,
            'network_carrier' => $device->network_carrier ?: ($variant?->network_carrier ?: $device->sim_network ?: $variant?->sim_network),
            'condition' => $device->condition ?: $variant?->condition ?: $product?->condition,
            'saleable' => (bool) ($device->saleable ?? false),
            'website_published' => (bool) ($device->website_published ?? false),
            'ram' => $device->ram ?: $variant?->ram,
            'storage' => $device->storage ?: $variant?->storage,
            'battery_health' => $device->battery_health ?: $variant?->battery_health,
            'status' => $device->status,
            'activation_status' => $device->activation_status,
            'service_status' => $device->service_status ?? 'No Service',
            'selling_price' => $device->selling_price ?: $variant?->sale_price ?: $product?->sale_price,
            'market_price' => $device->market_price ?: $variant?->market_price,
            'warranty_type' => $device->warranty_type,
            'warranty_note' => $device->warranty_note,
            'branch_name' => $branch?->name,
            'created_at' => optional($device->created_at)->toDateTimeString(),
            'updated_at' => optional($device->updated_at)->toDateTimeString(),
            'sold_at' => optional($device->sold_at)->toDateTimeString(),
            'returned_at' => optional($device->returned_at)->toDateTimeString(),
        ];

        if ($canSeeCost) {
            $deviceData['purchase_cost'] = $device->purchase_cost;
        }

        $saleData = $sale ? [
            'id' => $sale->id,
            'invoice_no' => $sale->invoice_no,
            'customer_name' => $sale->customer_name,
            'customer_phone' => $sale->customer_phone,
            'last_sale_price' => $saleItem?->sale_price ?: $saleItem?->rate ?: $device->selling_price,
            'paid_amount' => $sale->paid_amount,
            'due_amount' => $sale->due_amount,
            'status' => $sale->status,
            'sold_at' => optional($device->sold_at ?: $sale->created_at)->toDateTimeString(),
        ] : null;

        if ($saleData && $canSeeCost) {
            $saleData['profit_amount'] = $saleItem?->profit_amount ?: $sale->profit_amount;
        }

        return [
            'id' => $device->id,
            'device' => $deviceData,
            'product' => $product ? [
                'id' => $product->id,
                'name' => $product->name,
                'brand' => $product->brand,
                'category' => $product->category,
                'slug' => $product->slug,
            ] : null,
            'variant' => $variant ? [
                'id' => $variant->id,
                'name' => $variant->variant_name,
                'sku' => $variant->sku,
                'color_name' => $variant->color_name,
                'region' => $variant->region,
                'sim_network' => $variant->sim_network,
                'country_region' => $variant->country_region ?: $variant->region,
                'sim_type' => $variant->sim_type,
                'network_carrier' => $variant->network_carrier ?: $variant->sim_network,
                'condition' => $variant->condition,
                'ram' => $variant->ram,
                'storage' => $variant->storage,
            ] : null,
            'branch' => $branch ? [
                'id' => $branch->id,
                'name' => $branch->name,
                'code' => $branch->code,
            ] : null,
            'supplier' => $canSeeSupplier ? $this->supplierFor($device) : null,
            'customer' => $customer ? [
                'id' => $customer->id,
                'name' => $customer->name,
                'phone' => $customer->phone,
                'email' => $customer->email,
            ] : [
                'name' => $sale?->customer_name,
                'phone' => $sale?->customer_phone,
            ],
            'sale' => $saleData,
            'used_purchase' => $this->usedPurchaseFor($device, $canSeeCost),
            'timeline' => $this->timelineFor($device, $canSeeCost),
        ];
    }

    private function whereIdentifier($builder, string $value, array $deviceColumns): void
    {
        $lower = mb_strtolower($value);
        $builder->where(function ($inner) use ($lower, $deviceColumns) {
            foreach (array_intersect($deviceColumns, ['sku', 'imei_1', 'imei_2', 'barcode', 'imei_1_barcode', 'imei_2_barcode']) as $column) {
                $inner->orWhereRaw('LOWER(' . $column . ') = ?', [$lower]);
            }

            if (Schema::hasTable('product_variants')) {
                $inner->orWhereHas('variant', function ($variantQuery) use ($lower) {
                    $variantQuery->whereRaw('LOWER(sku) = ?', [$lower])->orWhereRaw('LOWER(barcode) = ?', [$lower]);
                });
            }

            if (Schema::hasTable('sales') && Schema::hasColumn('sales', 'invoice_no')) {
                $inner->orWhereHas('sale', fn ($saleQuery) => $saleQuery->whereRaw('LOWER(invoice_no) = ?', [$lower]));
            }

            if (Schema::hasTable('device_unit_histories') && Schema::hasColumn('device_unit_histories', 'reference_no')) {
                $inner->orWhereIn('id', function ($sub) use ($lower) {
                    $sub->select('device_unit_id')
                        ->from('device_unit_histories')
                        ->whereRaw('LOWER(reference_no) = ?', [$lower]);
                });
            }
        });
    }

    private function usedPurchaseFor(DeviceUnit $device, bool $canSeeCost): ?array
    {
        $purchase = $device->usedPurchase;

        if (! $purchase) {
            return null;
        }

        $supplierName = null;
        if (($purchase->seller_type ?? null) === 'supplier' && $purchase->supplier_id && Schema::hasTable('suppliers')) {
            $supplierName = DB::table('suppliers')->where('id', $purchase->supplier_id)->value('name');
        }

        $data = [
            'id' => $purchase->id,
            'seller_type' => $purchase->seller_type ?? 'customer',
            'seller_name' => $supplierName ?: $purchase->customer_name,
            'seller_phone' => $purchase->customer_phone,
            'purchased_at' => optional($purchase->created_at)->toDateTimeString(),
            'condition' => $purchase->condition,
        ];

        if ($canSeeCost) {
            $data['purchase_price'] = $purchase->purchase_price;
        }

        return $data;
    }

    private function supplierFor(DeviceUnit $device): ?array
    {
        $supplier = $device->supplier;

        if (! $supplier) {
            return null;
        }

        return [
            'id' => $supplier->id,
            'name' => $supplier->name ?? null,
            'company_name' => $supplier->company_name ?? null,
            'phone' => $supplier->phone ?? null,
        ];
    }

    private function timelineFor(DeviceUnit $device, bool $canSeeCost): array
    {
        $timeline = [];
        $historyReferenceIds = [];

        if (Schema::hasTable('device_unit_histories')) {
            $rows = DB::table('device_unit_histories')
                ->where('device_unit_id', $device->id)
                ->orderByDesc('event_at')
                ->orderByDesc('id')
                ->limit(200)
                ->get();

            foreach ($rows as $row) {
                $before = json_decode((string) ($row->before_data ?? ''), true) ?: [];
                $after = json_decode((string) ($row->after_data ?? ''), true) ?: [];
                $metadata = json_decode((string) ($row->metadata ?? ''), true) ?: [];

                if (! $canSeeCost) {
                    $before = $this->stripFinancialCost($before);
                    $after = $this->stripFinancialCost($after);
                    $metadata = $this->stripFinancialCost($metadata);
                }

                $fromStatus = $row->from_status ?? ($before['status'] ?? null);
                $toStatus = $row->to_status ?? ($after['status'] ?? null);
                $referenceType = $row->reference_type ?? null;
                $referenceId = $row->reference_id ?? null;
                $referenceNo = $row->reference_no ?? null;

                if ($referenceType === 'sale_exchange' && $referenceId) {
                    $historyReferenceIds[(int) $referenceId] = true;
                }

                if (! $referenceNo) {
                    $saleId = data_get($metadata, 'sale_id')
                        ?: data_get($metadata, 'original_sale_id')
                        ?: ($after['sale_id'] ?? null)
                        ?: ($before['sale_id'] ?? null);

                    if ($saleId && Schema::hasTable('sales')) {
                        $referenceNo = DB::table('sales')->where('id', $saleId)->value('invoice_no');
                        $referenceType = $referenceType ?: 'sale';
                        $referenceId = $referenceId ?: $saleId;
                    }
                }

                $timeline[] = [
                    'id' => 'history-' . $row->id,
                    'type' => $row->event_type ?: 'updated',
                    'title' => $this->eventTitle((string) ($row->event_type ?: 'updated'), $fromStatus, $toStatus),
                    'at' => $row->event_at ?? $row->created_at,
                    'amount' => property_exists($row, 'amount') ? $row->amount : null,
                    'currency' => property_exists($row, 'currency') ? $row->currency : 'BDT',
                    'payment_direction' => property_exists($row, 'payment_direction') ? $row->payment_direction : null,
                    'payment_method' => property_exists($row, 'payment_method') ? $row->payment_method : null,
                    'payment_reference' => property_exists($row, 'payment_reference') ? $row->payment_reference : null,
                    'reference_type' => $referenceType,
                    'reference_id' => $referenceId,
                    'reference_no' => $referenceNo,
                    'note' => trim((string) ($row->note ?? '')),
                    'from_status' => $fromStatus,
                    'to_status' => $toStatus,
                    'from_branch_id' => $row->from_branch_id,
                    'to_branch_id' => $row->to_branch_id,
                    'user_id' => $row->user_id,
                    'before' => $before,
                    'after' => $after,
                    'metadata' => $metadata,
                ];
            }
        }

        if (Schema::hasTable('sale_exchange_items') && Schema::hasTable('sale_exchanges')) {
            $query = DB::table('sale_exchange_items as sei')
                ->join('sale_exchanges as se', 'se.id', '=', 'sei.sale_exchange_id')
                ->where('sei.device_unit_id', $device->id)
                ->whereNull('se.deleted_at')
                ->orderByDesc('se.id');

            $exchangeRows = $query->get([
                'sei.id as exchange_item_id',
                'sei.item_type',
                'sei.line_total',
                'sei.condition_note',
                'se.id as exchange_id',
                'se.exchange_no',
                'se.exchange_mode',
                'se.returned_value',
                'se.replacement_value',
                'se.customer_payout_amount',
                'se.payout_adjustment_amount',
                'se.payout_method',
                'se.payout_reference',
                'se.reason',
                'se.completed_at',
                'se.created_at',
            ]);

            foreach ($exchangeRows as $row) {
                if (isset($historyReferenceIds[(int) $row->exchange_id])) {
                    continue;
                }

                $cash = ($row->exchange_mode ?? null) === 'cash_exchange';
                $isReturn = $row->item_type === 'return';

                $timeline[] = [
                    'id' => 'exchange-' . $row->exchange_item_id,
                    'type' => $cash ? 'cash_exchange_received' : ($isReturn ? 'exchange_return_received' : 'exchange_replacement_sold'),
                    'title' => $cash
                        ? 'Cash Exchange · Customer Paid'
                        : ($isReturn ? 'Exchange Return Received' : 'Exchange Replacement Sold'),
                    'at' => $row->completed_at ?: $row->created_at,
                    'amount' => $cash
                        ? $row->customer_payout_amount
                        : $row->line_total,
                    'currency' => 'BDT',
                    'payment_direction' => $cash ? 'outbound' : null,
                    'payment_method' => $cash ? $row->payout_method : null,
                    'payment_reference' => $cash ? $row->payout_reference : null,
                    'reference_type' => 'sale_exchange',
                    'reference_id' => $row->exchange_id,
                    'reference_no' => $row->exchange_no,
                    'note' => trim(
                        (string) ($row->reason ?? '')
                        . ($row->condition_note ? ' · ' . $row->condition_note : '')
                    ),
                    'from_status' => null,
                    'to_status' => $isReturn ? 'awaiting_inspection' : 'sold',
                    'metadata' => [
                        'returned_value' => $row->returned_value,
                        'replacement_value' => $row->replacement_value,
                        'customer_payout_amount' => $row->customer_payout_amount,
                        'payout_adjustment_amount' => $row->payout_adjustment_amount,
                    ],
                ];
            }
        }

        if (! $timeline) {
            $timeline[] = [
                'id' => 'fallback-created-' . $device->id,
                'type' => 'stock_in',
                'title' => $device->purchase_id ? 'Stock In / Purchase Added' : 'Device Created',
                'at' => optional($device->created_at)->toDateTimeString(),
                'amount' => $canSeeCost ? $device->purchase_cost : null,
                'currency' => 'BDT',
                'note' => 'SKU: ' . ($device->sku ?: 'N/A') . ' · Status: ' . ($device->status ?: 'N/A'),
                'from_status' => null,
                'to_status' => $device->status,
            ];
        }

        usort($timeline, function ($a, $b) {
            return strcmp((string) ($b['at'] ?? ''), (string) ($a['at'] ?? ''));
        });

        return array_values($timeline);
    }

    private function eventTitle(string $eventType, $fromStatus, $toStatus): string
    {
        $labels = [
            'created' => 'Device Created',
            'purchase_stock_in' => 'Supplier Purchase · Stock In',
            'used_purchase_received' => 'Used / Pre-Owned Device Received',
            'sale' => 'Sold / Invoice Generated',
            'return_received' => 'Returned Device Received',
            'exchange_return_received' => 'Exchange Return · Awaiting Inspection',
            'cash_exchange_received' => 'Cash Exchange · Customer Paid',
            'ready_for_sale' => 'Inspection Complete · Ready for Sale',
            'branch_transfer' => 'Branch Transfer',
            'service_status' => 'Service Status Updated',
            'website_published' => 'Published to Website',
            'website_unpublished' => 'Removed from Website',
            'super_admin_edit' => 'Super Admin Correction',
            'super_admin_delete' => 'Super Admin Soft Delete',
            'deleted' => 'Device Soft Deleted',
            'updated' => 'Device Updated',
        ];

        if (isset($labels[$eventType])) {
            return $labels[$eventType];
        }

        if ($fromStatus !== $toStatus && $toStatus) {
            return 'Status: ' . ($fromStatus ?: 'Created') . ' → ' . $toStatus;
        }

        return ucwords(str_replace('_', ' ', $eventType));
    }

    private function stripFinancialCost(array $payload): array
    {
        $blocked = [
            'purchase_cost',
            'purchase_price',
            'unit_cost',
            'profit',
            'profit_amount',
            'margin',
        ];

        foreach ($payload as $key => $value) {
            if (in_array(strtolower((string) $key), $blocked, true)) {
                unset($payload[$key]);
                continue;
            }

            if (is_array($value)) {
                $payload[$key] = $this->stripFinancialCost($value);
            }
        }

        return $payload;
    }
}
