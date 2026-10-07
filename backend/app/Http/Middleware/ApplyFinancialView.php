<?php

namespace App\Http\Middleware;

use App\Services\FinancialViewService;
use App\Services\AccessControlService;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ApplyFinancialView
{
    public function __construct(
        private readonly FinancialViewService $financialView,
        private readonly AccessControlService $accessControl,
    ) {
    }

    public function handle(Request $request, Closure $next, string $moduleKey = '*'): Response
    {
        $user = $request->user();
        if (! $user) return response()->json(['status' => false, 'message' => 'Unauthenticated.'], 401);

        $policy = $this->financialView->resolve($user, $moduleKey);
        $request->attributes->set('nst_financial_view_policy', $policy);
        if ($policy['mode'] === 'none') {
            return response()->json([
                'status' => false,
                'message' => 'Financial access is disabled for this account.',
                'financial_view' => $this->financialView->auditMetadata($policy),
            ], 403);
        }

        if ($moduleKey === 'reports'
            && str_ends_with($request->path(), 'reports/profit-loss')
            && ! $this->accessControl->canViewProfit($user)) {
            return response()->json([
                'status' => false,
                'message' => 'Profit and loss access is not allowed for this account.',
            ], 403);
        }

        $response = $next($request);
        if ($response instanceof JsonResponse) {
            $payload = $response->getData(true);

            if ($policy['mode'] === 'restricted') {
                if (array_key_exists('data', $payload)) {
                    $payload['data'] = $this->financialView->transform($payload['data'], $policy);
                } else {
                    $payload = $this->financialView->transform($payload, $policy);
                }
                $payload['financial_view'] = $this->financialView->auditMetadata($policy);
            }

            $payload = $this->enforceAccessControlVisibility(
                $payload,
                $this->accessControl->canViewPurchasePrice($user),
                $this->accessControl->canViewProfit($user),
            );
            $response->setData($payload);
        }

        $response->headers->set('X-NST-Financial-View', $policy['mode']);
        return $response;
    }

    private function enforceAccessControlVisibility(
        mixed $value,
        bool $canViewPurchasePrice,
        bool $canViewProfit,
        string $path = 'response',
    ): mixed {
        if (is_object($value)) {
            $value = (array) $value;
        }
        if (! is_array($value)) {
            return $value;
        }

        $result = [];
        foreach ($value as $key => $item) {
            $normalizedKey = strtolower((string) $key);
            $childPath = strtolower($path . '.' . $normalizedKey);

            if (! $canViewProfit && $this->isProfitKey($normalizedKey)) {
                continue;
            }

            if (! $canViewPurchasePrice && $this->isPurchaseSensitiveKey($normalizedKey, $childPath)) {
                continue;
            }

            $result[$key] = (is_array($item) || is_object($item))
                ? $this->enforceAccessControlVisibility($item, $canViewPurchasePrice, $canViewProfit, $childPath)
                : $item;
        }

        return $result;
    }

    private function isProfitKey(string $key): bool
    {
        return str_contains($key, 'profit') || str_contains($key, 'margin');
    }

    private function isPurchaseSensitiveKey(string $key, string $path): bool
    {
        foreach ([
            'purchase_price', 'purchase_cost', 'buying_price', 'buy_price',
            'cost_price', 'unit_cost', 'cost_amount', 'total_cost',
            'purchase_amount', 'total_purchase_amount', 'inventory_value', 'stock_value',
        ] as $needle) {
            if ($key === $needle || str_contains($key, $needle)) {
                return true;
            }
        }

        $purchaseContext = str_contains($path, '.purchase')
            || str_contains($path, '.purchases')
            || str_contains($path, '.latest_purchases')
            || str_contains($path, '.by_supplier');

        if (! $purchaseContext) {
            return false;
        }

        return in_array($key, [
            'amount', 'total', 'total_amount', 'paid', 'paid_amount', 'due', 'due_amount',
            'cash_paid_amount', 'advance_applied_amount', 'balance', 'payable', 'value',
        ], true);
    }
}
