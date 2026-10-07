<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\Branch;
use App\Models\BranchStock;
use App\Models\BranchStockRequest;
use App\Models\Category;
use App\Models\Product;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class BulkUploadController extends Controller
{
    private array $templates = [
        'categories' => ['name', 'description', 'status'],
        'brands' => ['name', 'description', 'status'],
        'suppliers' => ['name', 'phone', 'email', 'address', 'status'],
        'branches' => ['name', 'code', 'phone', 'email', 'address', 'manager_email', 'status'],
        'products' => [
            'name',
            'sku',
            'barcode',
            'brand',
            'category',
            'supplier',
            'model',
            'condition',
            'purchase_price',
            'sale_price',
            'regular_price',
            'discount_price',
            'stock_quantity',
            'low_stock_alert',
            'warranty',
            'estimated_delivery',
            'status',
            'short_description',
            'description',
        ],
        'branch_stocks' => ['branch_code', 'branch_name', 'product_sku', 'product_name', 'quantity'],
        'stock_requests' => ['branch_code', 'branch_name', 'product_sku', 'product_name', 'quantity', 'note'],
    ];

    public function supportedTypes()
    {
        return response()->json([
            'success' => true,
            'data' => array_keys($this->templates),
        ]);
    }

    public function downloadTemplate(string $type)
    {
        if (!isset($this->templates[$type])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid bulk upload type.',
            ], 404);
        }

        $filename = $type . '_bulk_sample.csv';

        $rows = $this->getSampleRows($type);

        $callback = function () use ($rows) {
            $file = fopen('php://output', 'w');

            // UTF-8 BOM for Excel support
            fprintf($file, chr(0xEF) . chr(0xBB) . chr(0xBF));

            foreach ($rows as $row) {
                fputcsv($file, $row);
            }

            fclose($file);
        };

        return response()->streamDownload($callback, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function import(Request $request, string $type)
    {
        if (!isset($this->templates[$type])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid bulk upload type.',
            ], 404);
        }

        $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:10240'],
        ]);

        $file = $request->file('file');

        $rows = $this->readCsvFile($file->getRealPath());

        if (count($rows) < 2) {
            return response()->json([
                'success' => false,
                'message' => 'CSV file is empty or header missing.',
            ], 422);
        }

        $header = array_map(fn ($value) => $this->cleanHeader($value), $rows[0]);
        $dataRows = array_slice($rows, 1);

        $imported = 0;
        $updated = 0;
        $skipped = 0;
        $errors = [];

        foreach ($dataRows as $index => $row) {
            $rowNumber = $index + 2;

            if ($this->isEmptyRow($row)) {
                $skipped++;
                continue;
            }

            $data = $this->combineRow($header, $row);

            try {
                DB::beginTransaction();

                $result = match ($type) {
                    'categories' => $this->importCategory($data),
                    'brands' => $this->importBrand($data),
                    'suppliers' => $this->importSupplier($data),
                    'branches' => $this->importBranch($data),
                    'products' => $this->importProduct($data),
                    'branch_stocks' => $this->importBranchStock($data),
                    'stock_requests' => $this->importStockRequest($data),
                    default => 'skipped',
                };

                DB::commit();

                if ($result === 'created') {
                    $imported++;
                } elseif ($result === 'updated') {
                    $updated++;
                } else {
                    $skipped++;
                }
            } catch (\Throwable $exception) {
                DB::rollBack();

                $errors[] = [
                    'row' => $rowNumber,
                    'message' => $exception->getMessage(),
                ];

                $skipped++;
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Bulk upload completed.',
            'data' => [
                'type' => $type,
                'imported' => $imported,
                'updated' => $updated,
                'skipped' => $skipped,
                'errors' => $errors,
            ],
        ]);
    }

    private function readCsvFile(string $path): array
    {
        $rows = [];

        $handle = fopen($path, 'r');

        while (($row = fgetcsv($handle, 0, ',')) !== false) {
            $rows[] = $row;
        }

        fclose($handle);

        return $rows;
    }

    private function cleanHeader($value): string
    {
        $value = preg_replace('/^\xEF\xBB\xBF/', '', (string) $value);

        return trim(Str::lower($value));
    }

    private function combineRow(array $header, array $row): array
    {
        $data = [];

        foreach ($header as $index => $key) {
            if (!$key) {
                continue;
            }

            $data[$key] = isset($row[$index]) ? trim((string) $row[$index]) : null;
        }

        return $data;
    }

    private function isEmptyRow(array $row): bool
    {
        foreach ($row as $value) {
            if (trim((string) $value) !== '') {
                return false;
            }
        }

        return true;
    }

    private function value(array $data, string $key, $default = null)
    {
        return isset($data[$key]) && $data[$key] !== '' ? $data[$key] : $default;
    }

    private function intValue($value, int $default = 0): int
    {
        if ($value === null || $value === '') {
            return $default;
        }

        return (int) $value;
    }

    private function moneyValue($value, float $default = 0): float
    {
        if ($value === null || $value === '') {
            return $default;
        }

        return (float) $value;
    }

    private function hasColumn(string $table, string $column): bool
    {
        return Schema::hasColumn($table, $column);
    }

    private function onlyExistingColumns(string $table, array $data): array
    {
        return collect($data)
            ->filter(fn ($value, $key) => $this->hasColumn($table, $key))
            ->toArray();
    }

    private function makeSlug(string $name): string
    {
        return Str::slug($name) ?: Str::random(8);
    }

    private function importCategory(array $data): string
    {
        $name = $this->value($data, 'name');

        if (!$name) {
            throw new \Exception('Category name is required.');
        }

        $category = Category::query()->where('name', $name)->first();

        $payload = $this->onlyExistingColumns('categories', [
            'name' => $name,
            'slug' => $this->makeSlug($name),
            'description' => $this->value($data, 'description'),
            'status' => $this->value($data, 'status', 'active'),
        ]);

        if ($category) {
            $category->update($payload);
            return 'updated';
        }

        Category::create($payload);

        return 'created';
    }

    private function importBrand(array $data): string
    {
        $name = $this->value($data, 'name');

        if (!$name) {
            throw new \Exception('Brand name is required.');
        }

        $brand = Brand::query()->where('name', $name)->first();

        $payload = $this->onlyExistingColumns('brands', [
            'name' => $name,
            'slug' => $this->makeSlug($name),
            'description' => $this->value($data, 'description'),
            'status' => $this->value($data, 'status', 'active'),
        ]);

        if ($brand) {
            $brand->update($payload);
            return 'updated';
        }

        Brand::create($payload);

        return 'created';
    }

    private function importSupplier(array $data): string
    {
        $name = $this->value($data, 'name');

        if (!$name) {
            throw new \Exception('Supplier name is required.');
        }

        $supplier = Supplier::query()
            ->when($this->value($data, 'email'), fn ($query) => $query->where('email', $this->value($data, 'email')))
            ->orWhere('name', $name)
            ->first();

        $payload = $this->onlyExistingColumns('suppliers', [
            'name' => $name,
            'phone' => $this->value($data, 'phone'),
            'email' => $this->value($data, 'email'),
            'address' => $this->value($data, 'address'),
            'status' => $this->value($data, 'status', 'active'),
        ]);

        if ($supplier) {
            $supplier->update($payload);
            return 'updated';
        }

        Supplier::create($payload);

        return 'created';
    }

    private function importBranch(array $data): string
    {
        $name = $this->value($data, 'name');
        $code = $this->value($data, 'code');

        if (!$name) {
            throw new \Exception('Branch name is required.');
        }

        $managerId = null;

        if ($this->value($data, 'manager_email')) {
            $manager = User::query()
                ->where('email', $this->value($data, 'manager_email'))
                ->first();

            $managerId = $manager?->id;
        }

        $branch = Branch::query()
            ->when($code, fn ($query) => $query->where('code', $code))
            ->orWhere('name', $name)
            ->first();

        $payload = $this->onlyExistingColumns('branches', [
            'name' => $name,
            'code' => $code,
            'phone' => $this->value($data, 'phone'),
            'email' => $this->value($data, 'email'),
            'address' => $this->value($data, 'address'),
            'manager_id' => $managerId,
            'status' => $this->value($data, 'status', 'active'),
        ]);

        if ($branch) {
            $branch->update($payload);
            return 'updated';
        }

        Branch::create($payload);

        return 'created';
    }

    private function importProduct(array $data): string
    {
        $name = $this->value($data, 'name');

        if (!$name) {
            throw new \Exception('Product name is required.');
        }

        $sku = $this->value($data, 'sku');

        $brandName = $this->value($data, 'brand');
        $categoryName = $this->value($data, 'category');
        $supplierName = $this->value($data, 'supplier');

        $brand = $brandName ? Brand::firstOrCreate(
            ['name' => $brandName],
            $this->onlyExistingColumns('brands', [
                'slug' => $this->makeSlug($brandName),
                'status' => 'active',
            ])
        ) : null;

        $category = $categoryName ? Category::firstOrCreate(
            ['name' => $categoryName],
            $this->onlyExistingColumns('categories', [
                'slug' => $this->makeSlug($categoryName),
                'status' => 'active',
            ])
        ) : null;

        $supplier = $supplierName ? Supplier::firstOrCreate(
            ['name' => $supplierName],
            $this->onlyExistingColumns('suppliers', [
                'status' => 'active',
            ])
        ) : null;

        $productQuery = Product::query()->where('name', $name);

        if ($sku) {
            $productQuery->orWhere('sku', $sku);
        }

        $product = $productQuery->first();

        $payload = [
            'name' => $name,
            'slug' => $this->makeSlug($name),
            'sku' => $sku ?: null,
            'barcode' => $this->value($data, 'barcode'),
            'brand' => $brandName,
            'category' => $categoryName,
            'model' => $this->value($data, 'model'),
            'condition' => $this->value($data, 'condition', 'new'),
            'purchase_price' => $this->moneyValue($this->value($data, 'purchase_price')),
            'sale_price' => $this->moneyValue($this->value($data, 'sale_price')),
            'regular_price' => $this->moneyValue($this->value($data, 'regular_price')),
            'discount_price' => $this->moneyValue($this->value($data, 'discount_price')),
            'stock_quantity' => $this->intValue($this->value($data, 'stock_quantity')),
            'low_stock_alert' => $this->intValue($this->value($data, 'low_stock_alert'), 5),
            'warranty' => $this->value($data, 'warranty'),
            'estimated_delivery' => $this->value($data, 'estimated_delivery'),
            'status' => $this->value($data, 'status', 'active'),
            'short_description' => $this->value($data, 'short_description'),
            'description' => $this->value($data, 'description'),
        ];

        if ($brand && $this->hasColumn('products', 'brand_id')) {
            $payload['brand_id'] = $brand->id;
        }

        if ($category && $this->hasColumn('products', 'category_id')) {
            $payload['category_id'] = $category->id;
        }

        if ($supplier && $this->hasColumn('products', 'supplier_id')) {
            $payload['supplier_id'] = $supplier->id;
        }

        $payload = $this->onlyExistingColumns('products', $payload);

        if ($product) {
            $product->update($payload);
            return 'updated';
        }

        Product::create($payload);

        return 'created';
    }

    private function importBranchStock(array $data): string
    {
        $branch = $this->findBranch($data);
        $product = $this->findProduct($data);
        $quantity = $this->intValue($this->value($data, 'quantity'));

        if (!$branch) {
            throw new \Exception('Branch not found. Use branch_code or branch_name.');
        }

        if (!$product) {
            throw new \Exception('Product not found. Use product_sku or product_name.');
        }

        if ($quantity <= 0) {
            throw new \Exception('Quantity must be greater than 0.');
        }

        $stock = BranchStock::query()
            ->where('branch_id', $branch->id)
            ->where('product_id', $product->id)
            ->first();

        if ($stock) {
            $stock->quantity = (int) $stock->quantity + $quantity;
            $stock->save();

            return 'updated';
        }

        BranchStock::create($this->onlyExistingColumns('branch_stocks', [
            'branch_id' => $branch->id,
            'product_id' => $product->id,
            'quantity' => $quantity,
        ]));

        return 'created';
    }

    private function importStockRequest(array $data): string
    {
        $branch = $this->findBranch($data);
        $product = $this->findProduct($data);
        $quantity = $this->intValue($this->value($data, 'quantity'));

        if (!$branch) {
            throw new \Exception('Branch not found. Use branch_code or branch_name.');
        }

        if (!$product) {
            throw new \Exception('Product not found. Use product_sku or product_name.');
        }

        if ($quantity <= 0) {
            throw new \Exception('Quantity must be greater than 0.');
        }

        $payload = [
            'branch_id' => $branch->id,
            'product_id' => $product->id,
            'quantity' => $quantity,
            'requested_quantity' => $quantity,
            'note' => $this->value($data, 'note'),
            'remarks' => $this->value($data, 'note'),
            'status' => 'pending',
        ];

        BranchStockRequest::create($this->onlyExistingColumns('branch_stock_requests', $payload));

        return 'created';
    }

    private function findBranch(array $data): ?Branch
    {
        $branchCode = $this->value($data, 'branch_code');
        $branchName = $this->value($data, 'branch_name');

        return Branch::query()
            ->when($branchCode, fn ($query) => $query->where('code', $branchCode))
            ->when(!$branchCode && $branchName, fn ($query) => $query->where('name', $branchName))
            ->first();
    }

    private function findProduct(array $data): ?Product
    {
        $productSku = $this->value($data, 'product_sku');
        $productName = $this->value($data, 'product_name');

        return Product::query()
            ->when($productSku, fn ($query) => $query->where('sku', $productSku))
            ->when(!$productSku && $productName, fn ($query) => $query->where('name', $productName))
            ->first();
    }

    private function getSampleRows(string $type): array
    {
        return match ($type) {
            'categories' => [
                $this->templates[$type],
                ['Smart Phone', 'All smartphone products', 'active'],
                ['Accessories', 'Mobile accessories', 'active'],
            ],
            'brands' => [
                $this->templates[$type],
                ['Samsung', 'Samsung mobile brand', 'active'],
                ['Apple', 'Apple iPhone brand', 'active'],
            ],
            'suppliers' => [
                $this->templates[$type],
                ['Rahman Telecom Supplier', '01710000001', 'supplier1@example.com', 'Dhaka, Bangladesh', 'active'],
                ['Bogura Mobile House', '01710000002', 'supplier2@example.com', 'Bogura, Bangladesh', 'active'],
            ],
            'branches' => [
                $this->templates[$type],
                ['Police Plaza-Branch 03', 'POL-03', '01710000003', 'policeplaza@example.com', 'Police Plaza, Dhaka', 'manager1@example.com', 'active'],
                ['TMSS Market - Branch 001', 'BOG-001', '01799333640', 'tmss@example.com', 'TMSS Market, Bogura', 'super_admin@example.com', 'active'],
            ],
            'products' => [
                $this->templates[$type],
                ['Samsung Galaxy S25', 'S25-256-BLK', 'NST-S25-001', 'Samsung', 'Smart Phone', 'Rahman Telecom Supplier', 'S25 256GB', 'new', '85000', '92000', '95000', '90000', '10', '2', 'Official warranty', '2-3 days', 'active', 'Samsung Galaxy S25 256GB', 'Samsung Galaxy S25 new phone available at New Singapur Telecom'],
            ],
            'branch_stocks' => [
                $this->templates[$type],
                ['BOG-001', 'TMSS Market - Branch 001', 'S25-256-BLK', 'Samsung Galaxy S25', '3'],
            ],
            'stock_requests' => [
                $this->templates[$type],
                ['BOG-001', 'TMSS Market - Branch 001', 'S25-256-BLK', 'Samsung Galaxy S25', '5', 'Need more stock'],
            ],
            default => [$this->templates[$type]],
        };
    }
}