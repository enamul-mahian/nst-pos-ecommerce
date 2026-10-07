<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DeviceUnit;
use App\Models\Sale;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class WarrantyPublicController extends Controller
{
    public function check(Request $request)
    {
        $validated = $request->validate(['query' => ['required', 'string', 'max:191']]);
        $q = $validated['query'];
        $device = DeviceUnit::with(['product', 'sale.customer'])
            ->where('imei_1', $q)->orWhere('imei_2', $q)->orWhere('barcode', $q)
            ->first();
        if (! $device) {
            $sale = Sale::with('items.deviceUnit.product')->where('invoice_no', $q)->first();
            $device = $sale?->items?->first()?->deviceUnit;
        }
        if (! $device) {
            return response()->json(['success' => false, 'message' => 'Warranty record not found.'], 404);
        }
        $end = $device->warranty_end_date ? Carbon::parse($device->warranty_end_date) : null;
        return response()->json(['success' => true, 'data' => [
            'product_name' => $device->product_name ?: optional($device->product)->name,
            'imei_1' => $device->imei_1,
            'imei_2' => $device->imei_2,
            'barcode' => $device->barcode,
            'sale_date' => optional($device->sold_at)->format('Y-m-d'),
            'warranty_type' => $device->warranty_type ?: 'Not set',
            'warranty_start_date' => $device->warranty_start_date,
            'warranty_end_date' => $device->warranty_end_date,
            'remaining_days' => $end ? max(now()->diffInDays($end, false), 0) : null,
            'status' => $end ? ($end->isPast() ? 'expired' : 'active') : 'not_set',
            'service_status' => $device->service_status,
            'terms' => $device->warranty_terms,
        ]]);
    }

    public function updateDeviceWarranty(Request $request, DeviceUnit $deviceUnit)
    {
        $validated = $request->validate([
            'warranty_type' => ['nullable', 'string', 'max:80'],
            'warranty_period_months' => ['nullable', 'integer', 'min:0', 'max:120'],
            'warranty_start_date' => ['nullable', 'date'],
            'warranty_end_date' => ['nullable', 'date'],
            'warranty_terms' => ['nullable', 'string'],
            'warranty_note' => ['nullable', 'string'],
        ]);
        if (! empty($validated['warranty_start_date']) && ! empty($validated['warranty_period_months']) && empty($validated['warranty_end_date'])) {
            $validated['warranty_end_date'] = Carbon::parse($validated['warranty_start_date'])->addMonths((int) $validated['warranty_period_months'])->toDateString();
        }
        $deviceUnit->update($validated);
        return response()->json(['success' => true, 'message' => 'Device warranty updated.', 'data' => $deviceUnit->fresh()]);
    }
}
