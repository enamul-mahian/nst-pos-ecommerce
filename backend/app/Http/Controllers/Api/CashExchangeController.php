<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeviceUnit;
use App\Models\Sale;
use App\Models\SaleExchange;
use App\Models\SaleExchangeItem;
use App\Models\SaleExchangePayout;
use App\Models\SaleItem;
use App\Services\AccessControlService;
use App\Services\DeviceLifecycleHistoryService;
use App\Services\ReleaseScopeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CashExchangeController extends Controller
{
    public function __construct(
        private readonly AccessControlService $accessControl,
        private readonly ReleaseScopeService $releaseScope,
        private readonly DeviceLifecycleHistoryService $history,
    ) {
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'sale_id' => ['required', 'exists:sales,id'],
            'reason' => ['required', 'string', 'max:190'],
            'note' => ['nullable', 'string', 'max:2000'],

            'returned_items' => ['required', 'array', 'min:1'],
            'returned_items.*.sale_item_id' => ['required', 'exists:sale_items,id'],
            'returned_items.*.accepted_value' => ['nullable', 'numeric', 'min:0.01'],
            'returned_items.*.condition_note' => ['nullable', 'string', 'max:1000'],

            'customer_payout_amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', Rule::in(['cash', 'bkash', 'nagad', 'rocket', 'upay', 'bank', 'card', 'other_mfs'])],
            'provider_name' => ['nullable', 'string', 'max:100'],
            'transaction_id' => ['nullable', 'string', 'max:191'],
            'payment_reference' => ['nullable', 'string', 'max:191'],
            'payout_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $sale = Sale::findOrFail($validated['sale_id']);
        $this->ensureBranchAccess($request, (int) $sale->branch_id);

        abort_unless(
            in_array($sale->status, ['completed', 'processing'], true),
            422,
            'Only active completed or processing sales can be used for Cash Exchange.'
        );

        $exchange = DB::transaction(function () use ($request, $validated, $sale) {
            $lockedSale = Sale::whereKey($sale->id)->lockForUpdate()->firstOrFail();

            $exchange = SaleExchange::create([
                'exchange_no' => $this->exchangeNo(),
                'sale_id' => $lockedSale->id,
                'branch_id' => $lockedSale->branch_id,
                'customer_id' => $lockedSale->customer_id,
                'exchange_mode' => 'cash_exchange',
                'reason' => $validated['reason'],
                'note' => $validated['note'] ?? null,
                'payment_method' => $validated['payment_method'],
                'payout_method' => $validated['payment_method'],
                'payout_reference' => $validated['payment_reference'] ?? $validated['transaction_id'] ?? null,
                'payout_note' => $validated['payout_note'] ?? null,
                'status' => 'processing',
                'processed_by' => $request->user()?->id,
            ]);

            $returned = [];
            $returnedValue = 0.0;

            foreach ($validated['returned_items'] as $row) {
                $item = SaleItem::whereKey($row['sale_item_id'])
                    ->where('sale_id', $lockedSale->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                abort_if(
                    (int) $item->quantity !== 1,
                    422,
                    'Cash Exchange requires one tracked physical device per selected sale item.'
                );

                abort_unless(
                    $item->device_unit_id,
                    422,
                    "{$item->product_name} is not linked to a Device Stock IMEI record."
                );

                $device = DeviceUnit::whereKey($item->device_unit_id)
                    ->lockForUpdate()
                    ->firstOrFail();

                abort_unless(
                    (int) $device->sale_id === (int) $lockedSale->id
                    && strtolower((string) $device->status) === 'sold',
                    422,
                    'Returned device is not linked to this sale or is no longer in Sold status.'
                );

                $originalSaleValue = round(
                    (float) ($item->total ?: $item->sale_price ?: $item->rate ?: 0),
                    2
                );

                $acceptedValue = array_key_exists('accepted_value', $row)
                    && $row['accepted_value'] !== null
                    && $row['accepted_value'] !== ''
                        ? round((float) $row['accepted_value'], 2)
                        : $originalSaleValue;

                abort_if($acceptedValue <= 0, 422, 'Accepted device value must be greater than zero.');

                $returnedValue += $acceptedValue;

                $returned[] = [
                    'item' => $item,
                    'device' => $device,
                    'original_sale_value' => $originalSaleValue,
                    'accepted_value' => $acceptedValue,
                    'condition_note' => $row['condition_note'] ?? null,
                ];
            }

            $payout = round((float) $validated['customer_payout_amount'], 2);
            $returnedValue = round($returnedValue, 2);

            abort_if(
                $payout > $returnedValue,
                422,
                'Actual customer payout cannot exceed the total accepted device value.'
            );

            $adjustment = round($returnedValue - $payout, 2);

            $exchange->update([
                'returned_value' => $returnedValue,
                'replacement_value' => 0,
                'difference_amount' => -$returnedValue,
                'paid_amount' => 0,
                'due_amount' => 0,
                'refund_amount' => $payout,
                'customer_payout_amount' => $payout,
                'payout_adjustment_amount' => $adjustment,
                'status' => 'completed',
                'completed_at' => now(),
            ]);

            SaleExchangePayout::create([
                'sale_exchange_id' => $exchange->id,
                'amount' => $payout,
                'currency' => 'BDT',
                'payment_method' => $validated['payment_method'],
                'provider_name' => $validated['provider_name'] ?? null,
                'transaction_id' => $validated['transaction_id'] ?? null,
                'reference_no' => $validated['payment_reference'] ?? $validated['transaction_id'] ?? null,
                'paid_by' => $request->user()?->id,
                'paid_at' => now(),
                'note' => $validated['payout_note'] ?? null,
                'metadata' => [
                    'accepted_device_value_total' => $returnedValue,
                    'customer_payout_amount' => $payout,
                    'payout_adjustment_amount' => $adjustment,
                    'sale_id' => $lockedSale->id,
                    'invoice_no' => $lockedSale->invoice_no,
                ],
            ]);

            $remainingPayout = $payout;
            $lastIndex = count($returned) - 1;

            foreach ($returned as $index => $entry) {
                /** @var SaleItem $item */
                $item = $entry['item'];
                /** @var DeviceUnit $device */
                $device = $entry['device'];

                $before = $this->history->snapshot($device);

                SaleExchangeItem::create([
                    'sale_exchange_id' => $exchange->id,
                    'item_type' => 'return',
                    'sale_item_id' => $item->id,
                    'product_id' => $item->product_id,
                    'product_variant_id' => $item->product_variant_id,
                    'device_unit_id' => $device->id,
                    'product_name' => $item->product_name,
                    'sku' => $item->sku,
                    'imei_1' => $item->imei_1 ?: $device->imei_1,
                    'barcode' => $item->device_barcode ?: $device->barcode,
                    'quantity' => 1,
                    'unit_price' => $entry['accepted_value'],
                    'line_total' => $entry['accepted_value'],
                    'condition_note' => $entry['condition_note'],
                ]);

                // Use a direct database update intentionally so the model's generic
                // update observer does not create a second duplicate Cash Exchange event.
                DB::table('device_units')
                    ->where('id', $device->id)
                    ->update([
                        'status' => 'awaiting_inspection',
                        'saleable' => false,
                        'website_published' => false,
                        'sale_id' => null,
                        'sale_item_id' => null,
                        'sold_at' => null,
                        'returned_at' => now(),
                        'return_reason' => 'Cash Exchange: ' . $exchange->exchange_no . ' - ' . $validated['reason'],
                        'return_note' => $entry['condition_note'],
                        'updated_by' => $request->user()?->id,
                        'updated_at' => now(),
                    ]);

                $device->refresh();

                $share = $index === $lastIndex
                    ? round($remainingPayout, 2)
                    : round(($entry['accepted_value'] / $returnedValue) * $payout, 2);

                $remainingPayout = round($remainingPayout - $share, 2);
                $shareAdjustment = round($entry['accepted_value'] - $share, 2);

                $this->history->record(
                    $device,
                    'cash_exchange_received',
                    $before,
                    $this->history->snapshot($device),
                    [
                        'reference_type' => 'sale_exchange',
                        'reference_id' => $exchange->id,
                        'reference_no' => $exchange->exchange_no,
                        'customer_id' => $lockedSale->customer_id,
                        'amount' => $share,
                        'currency' => 'BDT',
                        'payment_direction' => 'outbound',
                        'payment_method' => $validated['payment_method'],
                        'payment_reference' => $validated['payment_reference']
                            ?? $validated['transaction_id']
                            ?? null,
                        'user_id' => $request->user()?->id,
                        'note' => 'Cash Exchange received. Device placed in Awaiting Inspection before resale.',
                        'metadata' => [
                            'original_sale_id' => $lockedSale->id,
                            'original_invoice_no' => $lockedSale->invoice_no,
                            'original_sale_value' => $entry['original_sale_value'],
                            'accepted_device_value' => $entry['accepted_value'],
                            'actual_customer_payout_share' => $share,
                            'payout_adjustment_share' => $shareAdjustment,
                            'condition_note' => $entry['condition_note'],
                            'provider_name' => $validated['provider_name'] ?? null,
                            'transaction_id' => $validated['transaction_id'] ?? null,
                        ],
                    ]
                );
            }

            return $exchange;
        });

        return response()->json([
            'status' => true,
            'message' => 'Cash Exchange completed. Accepted value, actual payout and lifetime IMEI history were recorded.',
            'data' => $exchange->fresh()->load(['sale', 'items.deviceUnit', 'payouts']),
        ], 201);
    }

    private function ensureBranchAccess(Request $request, int $branchId): void
    {
        if ($this->accessControl->isSuperAdmin($request->user())) {
            return;
        }

        $this->releaseScope->assertBranch(
            $request,
            $branchId,
            'You cannot process a Cash Exchange for this branch.'
        );
    }

    private function exchangeNo(): string
    {
        do {
            $no = 'CX-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6));
        } while (SaleExchange::where('exchange_no', $no)->exists());

        return $no;
    }
}
