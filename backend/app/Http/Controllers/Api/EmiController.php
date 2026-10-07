<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\EmiBank;
use Illuminate\Http\Request;

class EmiController extends Controller
{
    public function index(Request $request)
    {
        $query = EmiBank::query()->orderBy('sort_order')->orderBy('bank_name');
        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }
        return response()->json(['success' => true, 'data' => $query->get()]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()?->id;
        $data['updated_by'] = $request->user()?->id;
        $bank = EmiBank::create($data);
        return response()->json(['success' => true, 'message' => 'EMI bank chart created.', 'data' => $bank], 201);
    }

    public function update(Request $request, EmiBank $emiBank)
    {
        $data = $this->validated($request, true);
        $data['updated_by'] = $request->user()?->id;
        $emiBank->update($data);
        return response()->json(['success' => true, 'message' => 'EMI bank chart updated.', 'data' => $emiBank->fresh()]);
    }

    public function destroy(EmiBank $emiBank)
    {
        $emiBank->delete();
        return response()->json(['success' => true, 'message' => 'EMI bank chart deleted.']);
    }

    public function calculate(Request $request)
    {
        $validated = $request->validate([
            'price' => ['required', 'numeric', 'min:1'],
            'bank_id' => ['nullable', 'integer', 'exists:emi_banks,id'],
            'tenure' => ['nullable', 'integer', 'in:3,6,9,12,18,24,30,36'],
        ]);

        $banks = EmiBank::where('is_active', true)
            ->when($validated['bank_id'] ?? null, fn ($q, $id) => $q->where('id', $id))
            ->orderBy('sort_order')->orderBy('bank_name')->get();

        $price = (float) $validated['price'];
        $tenureFilter = $validated['tenure'] ?? null;
        $rows = [];

        foreach ($banks as $bank) {
            $charges = $bank->tenure_charges ?: [];
            foreach ($charges as $tenure => $charge) {
                $tenure = (int) $tenure;
                if ($tenureFilter && $tenureFilter !== $tenure) {
                    continue;
                }
                $charge = (float) $charge;
                $total = $price + (($price * $charge) / 100);
                $rows[] = [
                    'bank_id' => $bank->id,
                    'bank_name' => $bank->bank_name,
                    'tenure' => $tenure,
                    'charge_percent' => $charge,
                    'product_price' => round($price, 2),
                    'charge_amount' => round(($price * $charge) / 100, 2),
                    'processing_fee' => (float) $bank->processing_fee,
                    'total_amount' => round($total + (float) $bank->processing_fee, 2),
                    'monthly_emi' => $tenure > 0 ? round(($total + (float) $bank->processing_fee) / $tenure, 2) : 0,
                    'minimum_amount' => (float) $bank->minimum_amount,
                    'eligible' => $price >= (float) $bank->minimum_amount,
                    'note' => $bank->note,
                    'recommendation_text' => $bank->recommendation_text,
                    'is_recommended' => (bool) $bank->is_recommended,
                ];
            }
        }

        return response()->json(['success' => true, 'data' => $rows]);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'bank_name' => [$partial ? 'sometimes' : 'required', 'string', 'max:150'],
            'bank_short_name' => ['nullable', 'string', 'max:50'],
            'minimum_amount' => ['nullable', 'numeric', 'min:0'],
            'tenure_charges' => [$partial ? 'sometimes' : 'required', 'array'],
            'note' => ['nullable', 'string'],
            'recommendation_text' => ['nullable', 'string'],
            'processing_fee' => ['nullable', 'numeric', 'min:0'],
            'is_recommended' => ['nullable', 'boolean'],
            'is_active' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);
    }
}
