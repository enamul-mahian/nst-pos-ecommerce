<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

/**
 * Recent sales for the storefront "just purchased" toast. Online orders and POS sales both
 * create a sale, so sales are the single source. Only a short first name, the city and the
 * product are returned: never phone numbers, amounts or invoice numbers.
 */
class RecentPurchaseController extends Controller
{
    private const HIDDEN_STATUSES = ['cancelled', 'canceled', 'returned', 'refunded', 'void', 'draft'];
    private const ANONYMOUS_NAMES = ['walk in', 'walk-in', 'walkin', 'guest', 'cash', 'cash customer', 'customer', 'n/a', 'na', 'unknown'];

    public function index(Request $request): JsonResponse
    {
        $days = max(1, min(365, (int) $request->query('days', 30)));
        $limit = max(1, min(30, (int) $request->query('limit', 12)));

        try {
            $rows = Cache::remember("public_recent_purchases:{$days}:{$limit}", 60, fn () => $this->recentPurchases($days, $limit));
        } catch (Throwable $exception) {
            report($exception);
            $rows = [];
        }

        return response()->json(['status' => true, 'data' => $rows]);
    }

    private function recentPurchases(int $days, int $limit): array
    {
        if (! Schema::hasTable('sales') || ! Schema::hasTable('sale_items')) {
            return [];
        }

        $sales = DB::table('sales')
            ->select(['id', 'customer_id', 'customer_name', 'created_at'])
            ->addSelect(Schema::hasColumn('sales', 'customer_order_id') ? 'customer_order_id' : DB::raw('NULL as customer_order_id'))
            ->where('created_at', '>=', now()->subDays($days))
            ->when(Schema::hasColumn('sales', 'status'), fn ($query) => $query->where(fn ($inner) => $inner->whereNull('status')->orWhereNotIn('status', self::HIDDEN_STATUSES)))
            ->when(Schema::hasColumn('sales', 'deleted_at'), fn ($query) => $query->whereNull('deleted_at'))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit($limit * 3)
            ->get();

        if ($sales->isEmpty()) {
            return [];
        }

        $items = DB::table('sale_items')
            ->select(['sale_id', 'product_id', 'product_name'])
            ->whereIn('sale_id', $sales->pluck('id'))
            ->orderBy('id')
            ->get()
            ->groupBy('sale_id')
            ->map(fn ($rows) => $rows->first());

        $products = Product::query()
            ->whereIn('id', $items->pluck('product_id')->filter()->unique()->values())
            ->get()
            ->keyBy('id');

        $cities = $this->customerCities($sales->pluck('customer_id')->filter()->unique()->values()->all());
        $orderCities = $this->orderCities($sales->pluck('customer_order_id')->filter()->unique()->values()->all());

        $now = now();
        $rows = [];
        foreach ($sales as $sale) {
            $item = $items->get($sale->id);
            if (! $item) {
                continue;
            }
            $product = $item->product_id ? $products->get($item->product_id) : null;
            if ($product && $this->hiddenFromWebsite($product)) {
                continue;
            }
            $name = trim((string) ($product?->name ?: $item->product_name));
            if ($name === '') {
                continue;
            }

            $created = $sale->created_at ? Carbon::parse($sale->created_at) : null;
            $rows[] = [
                'name' => $this->shortName((string) $sale->customer_name),
                'location' => $orderCities[$sale->customer_order_id] ?? $cities[$sale->customer_id] ?? null,
                'product' => $name,
                'image' => $product ? ($product->image_url ?: null) : null,
                'action' => 'purchased',
                'minutes_ago' => $created ? max(0, (int) $created->diffInMinutes($now, true)) : null,
            ];

            if (count($rows) >= $limit) {
                break;
            }
        }

        return $rows;
    }

    /** "Mohammad Roni Mahmud" -> "Mohammad M."; walk-in or empty names stay anonymous. */
    private function shortName(string $full): ?string
    {
        $full = trim(preg_replace('/\s+/u', ' ', $full) ?? '');
        $lower = Str::lower($full);
        if ($full === '' || in_array($lower, self::ANONYMOUS_NAMES, true) || preg_match('/^(walk[\s-]?in|guest|cash)\b/u', $lower) || preg_match('/\d{5,}/', $full)) {
            return null;
        }
        $parts = explode(' ', $full);
        $first = Str::limit($parts[0], 14, '');
        $last = count($parts) > 1 ? mb_substr(end($parts), 0, 1) : '';

        return $last !== '' ? "{$first} {$last}." : $first;
    }

    private function customerCities(array $ids): array
    {
        if (! $ids || ! Schema::hasTable('customers') || ! Schema::hasColumn('customers', 'city')) {
            return [];
        }

        return DB::table('customers')->whereIn('id', $ids)->whereNotNull('city')->where('city', '!=', '')->pluck('city', 'id')
            ->map(fn ($city) => Str::limit(trim((string) $city), 30, ''))->all();
    }

    private function orderCities(array $ids): array
    {
        if (! $ids || ! Schema::hasTable('customer_orders')) {
            return [];
        }
        $columns = array_values(array_filter(['delivery_district', 'delivery_city'], fn ($column) => Schema::hasColumn('customer_orders', $column)));
        if (! $columns) {
            return [];
        }

        return DB::table('customer_orders')->whereIn('id', $ids)->get(array_merge(['id'], $columns))
            ->mapWithKeys(function ($order) use ($columns) {
                foreach ($columns as $column) {
                    $value = trim((string) ($order->{$column} ?? ''));
                    if ($value !== '') {
                        return [$order->id => Str::limit($value, 30, '')];
                    }
                }

                return [];
            })->all();
    }

    private function hiddenFromWebsite(Product $product): bool
    {
        $published = $product->website_published ?? data_get($product->page_options, 'website_published', true);

        return $published === false || $published === 0 || $published === '0';
    }
}
