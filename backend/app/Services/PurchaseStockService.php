<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class PurchaseStockService
{
    public static function increaseBranchStock(
        ?int $branchId,
        ?int $productId,
        ?int $productVariantId,
        float $quantity,
        ?int $purchaseId = null,
        ?int $purchaseItemId = null,
        float $unitCost = 0,
        ?int $userId = null,
        ?string $note = null
    ): bool {
        if (!$branchId || !$productId || $quantity <= 0) {
            return false;
        }

        if (!Schema::hasTable('branch_stocks')) {
            self::recordMovement(
                branchId: $branchId,
                productId: $productId,
                productVariantId: $productVariantId,
                purchaseId: $purchaseId,
                purchaseItemId: $purchaseItemId,
                quantity: $quantity,
                unitCost: $unitCost,
                stockBefore: 0,
                stockAfter: 0,
                userId: $userId,
                note: 'branch_stocks table not found. ' . ($note ?: '')
            );

            return false;
        }

        if (
            !Schema::hasColumn('branch_stocks', 'branch_id') ||
            !Schema::hasColumn('branch_stocks', 'product_id')
        ) {
            return false;
        }

        $quantityColumn = self::firstExistingColumn('branch_stocks', [
            'quantity',
            'qty',
            'stock_qty',
            'current_stock',
            'available_stock',
        ]);

        if (!$quantityColumn) {
            return false;
        }

        $existingStock = DB::table('branch_stocks')
            ->where('branch_id', $branchId)
            ->where('product_id', $productId)
            ->when($productVariantId && Schema::hasColumn('branch_stocks', 'product_variant_id'), fn ($query) => $query->where('product_variant_id', $productVariantId))
            ->lockForUpdate()
            ->first();

        $stockBefore = $existingStock
            ? (float) ($existingStock->{$quantityColumn} ?? 0)
            : 0;

        $stockAfter = $stockBefore + $quantity;

        if ($existingStock) {
            $updateData = [
                $quantityColumn => $stockAfter,
            ];

            self::putIfColumnExists('branch_stocks', $updateData, 'product_variant_id', $productVariantId);
            self::putIfColumnExists('branch_stocks', $updateData, 'last_purchase_id', $purchaseId);
            self::putIfColumnExists('branch_stocks', $updateData, 'last_purchase_item_id', $purchaseItemId);
            self::putIfColumnExists('branch_stocks', $updateData, 'last_purchase_cost', $unitCost);
            self::putIfColumnExists('branch_stocks', $updateData, 'updated_by', $userId);

            if (Schema::hasColumn('branch_stocks', 'updated_at')) {
                $updateData['updated_at'] = now();
            }

            DB::table('branch_stocks')
                ->where('id', $existingStock->id)
                ->update($updateData);
        } else {
            $insertData = [
                'branch_id' => $branchId,
                'product_id' => $productId,
                $quantityColumn => $stockAfter,
            ];

            self::putIfColumnExists('branch_stocks', $insertData, 'product_variant_id', $productVariantId);
            self::putIfColumnExists('branch_stocks', $insertData, 'last_purchase_id', $purchaseId);
            self::putIfColumnExists('branch_stocks', $insertData, 'last_purchase_item_id', $purchaseItemId);
            self::putIfColumnExists('branch_stocks', $insertData, 'last_purchase_cost', $unitCost);
            self::putIfColumnExists('branch_stocks', $insertData, 'created_by', $userId);
            self::putIfColumnExists('branch_stocks', $insertData, 'updated_by', $userId);

            if (Schema::hasColumn('branch_stocks', 'created_at')) {
                $insertData['created_at'] = now();
            }

            if (Schema::hasColumn('branch_stocks', 'updated_at')) {
                $insertData['updated_at'] = now();
            }

            DB::table('branch_stocks')->insert($insertData);
        }

        self::recordMovement(
            branchId: $branchId,
            productId: $productId,
            productVariantId: $productVariantId,
            purchaseId: $purchaseId,
            purchaseItemId: $purchaseItemId,
            quantity: $quantity,
            unitCost: $unitCost,
            stockBefore: $stockBefore,
            stockAfter: $stockAfter,
            userId: $userId,
            note: $note ?: 'Stock increased from supplier purchase.'
        );

        self::syncCatalogStock($productId, $productVariantId, $quantity);

        return true;
    }

    /**
     * Keep products/product_variants.stock_quantity in step with branch stock.
     * POS sales decrement these columns, and the product list and storefront read them,
     * so a purchase that only touched branch_stocks left items showing "Out of stock".
     */
    private static function syncCatalogStock(int $productId, ?int $productVariantId, float $quantity): void
    {
        $units = (int) round($quantity);
        if ($units <= 0) {
            return;
        }

        if (Schema::hasTable('products') && Schema::hasColumn('products', 'stock_quantity')) {
            DB::table('products')->where('id', $productId)->increment('stock_quantity', $units);
            if (Schema::hasColumn('products', 'status')) {
                DB::table('products')->where('id', $productId)->where('status', 'out_of_stock')->update(['status' => 'active']);
            }
        }

        if ($productVariantId && Schema::hasTable('product_variants') && Schema::hasColumn('product_variants', 'stock_quantity')) {
            DB::table('product_variants')->where('id', $productVariantId)->increment('stock_quantity', $units);
        }
    }

    private static function recordMovement(
        ?int $branchId,
        ?int $productId,
        ?int $productVariantId,
        ?int $purchaseId,
        ?int $purchaseItemId,
        float $quantity,
        float $unitCost,
        float $stockBefore,
        float $stockAfter,
        ?int $userId = null,
        ?string $note = null
    ): void {
        if (!Schema::hasTable('stock_movements')) {
            return;
        }

        $referenceNo = $purchaseId ? 'PURCHASE-' . $purchaseId : null;
        $totalCost = round($quantity * $unitCost, 2);

        $movementData = [];

        /*
        |--------------------------------------------------------------------------
        | Supports current NST stock_movements schema
        |--------------------------------------------------------------------------
        | Your existing migration uses:
        | movement_no, type, quantity_change, quantity_before, quantity_after,
        | reference_type, reference_id, user_id, movement_at
        |
        | Some older patch/schema may use:
        | movement_type, quantity, unit_cost, total_cost, stock_before, stock_after,
        | purchase_id, purchase_item_id, reference_no, created_by
        |
        | So this method only inserts columns that actually exist in your database.
        */

        self::putIfColumnExists('stock_movements', $movementData, 'movement_no', self::generateMovementNo());
        self::putIfColumnExists('stock_movements', $movementData, 'branch_id', $branchId);
        self::putIfColumnExists('stock_movements', $movementData, 'product_id', $productId);
        self::putIfColumnExists('stock_movements', $movementData, 'product_variant_id', $productVariantId);

        self::putIfColumnExists('stock_movements', $movementData, 'purchase_id', $purchaseId);
        self::putIfColumnExists('stock_movements', $movementData, 'purchase_item_id', $purchaseItemId);

        self::putIfColumnExists('stock_movements', $movementData, 'type', 'purchase');
        self::putIfColumnExists('stock_movements', $movementData, 'movement_type', 'purchase_in');

        self::putIfColumnExists('stock_movements', $movementData, 'quantity_change', $quantity);
        self::putIfColumnExists('stock_movements', $movementData, 'quantity', $quantity);

        self::putIfColumnExists('stock_movements', $movementData, 'unit_cost', $unitCost);
        self::putIfColumnExists('stock_movements', $movementData, 'total_cost', $totalCost);

        self::putIfColumnExists('stock_movements', $movementData, 'quantity_before', $stockBefore);
        self::putIfColumnExists('stock_movements', $movementData, 'quantity_after', $stockAfter);
        self::putIfColumnExists('stock_movements', $movementData, 'stock_before', $stockBefore);
        self::putIfColumnExists('stock_movements', $movementData, 'stock_after', $stockAfter);

        self::putIfColumnExists('stock_movements', $movementData, 'reference_type', 'purchase');
        self::putIfColumnExists('stock_movements', $movementData, 'reference_id', $purchaseId);
        self::putIfColumnExists('stock_movements', $movementData, 'reference_no', $referenceNo);

        self::putIfColumnExists('stock_movements', $movementData, 'note', $note);
        self::putIfColumnExists('stock_movements', $movementData, 'user_id', $userId);
        self::putIfColumnExists('stock_movements', $movementData, 'created_by', $userId);
        self::putIfColumnExists('stock_movements', $movementData, 'movement_at', now());

        if (Schema::hasColumn('stock_movements', 'created_at')) {
            $movementData['created_at'] = now();
        }

        if (Schema::hasColumn('stock_movements', 'updated_at')) {
            $movementData['updated_at'] = now();
        }

        if (!empty($movementData)) {
            DB::table('stock_movements')->insert($movementData);
        }
    }

    private static function generateMovementNo(): string
    {
        do {
            $movementNo = 'SM-' . now()->format('YmdHis') . '-' . random_int(1000, 9999);
        } while (
            Schema::hasTable('stock_movements') &&
            Schema::hasColumn('stock_movements', 'movement_no') &&
            DB::table('stock_movements')->where('movement_no', $movementNo)->exists()
        );

        return $movementNo;
    }

    private static function firstExistingColumn(string $table, array $columns): ?string
    {
        foreach ($columns as $column) {
            if (Schema::hasColumn($table, $column)) {
                return $column;
            }
        }

        return null;
    }

    private static function putIfColumnExists(string $table, array &$data, string $column, $value): void
    {
        if (Schema::hasColumn($table, $column)) {
            $data[$column] = $value;
        }
    }
}
