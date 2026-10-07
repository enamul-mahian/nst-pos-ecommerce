<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Throwable;

class BusinessDataResetService
{
    private array $categoryTables = [
        'sales_data' => [
            'sale_payments', 'sale_items', 'sales', 'orders', 'order_items', 'customer_payments',
        ],
        'purchase_data' => [
            'purchase_items', 'purchases', 'supplier_payments',
        ],
        'product_stock_data' => [
            'device_units', 'branch_stocks', 'stock_movements', 'stock_transfer_items', 'stock_transfers', 'stock_transfer_request_items', 'stock_transfer_requests', 'branch_stock_request_items', 'branch_stock_requests', 'product_images', 'product_variants', 'products',
        ],
        'customer_business_data' => [
            'customer_payments', 'customer_messages', 'booking_preorders', 'used_purchases',
        ],
        'supplier_business_data' => [
            'supplier_payments',
        ],
        'logs' => [
            'audit_logs', 'communication_logs', 'danger_zone_logs',
        ],
    ];

    private array $businessFileDirectories = [
        'products',
        'product-media',
        'purchase-invoices',
        'supplier-invoices',
        'used-purchases',
        'customer-documents',
        'customer-nid',
        'google-posts',
        'invoices',
    ];

    public function options(): array
    {
        return [
            ['key' => 'sales_data', 'label' => 'Sales Data', 'description' => 'Sales, sale items, sale payments, orders and customer payment records.'],
            ['key' => 'purchase_data', 'label' => 'Purchase Data & Supplier Invoice Files', 'description' => 'Purchases, purchase items, supplier payment records and purchase invoice files.'],
            ['key' => 'product_stock_data', 'label' => 'Product & Stock Data', 'description' => 'Products, variants, device IMEI units, stock movements and product media.'],
            ['key' => 'customer_business_data', 'label' => 'Customer Business Data', 'description' => 'Used/pre-owned purchase records, customer messages and customer business documents.'],
            ['key' => 'supplier_business_data', 'label' => 'Supplier Business Data', 'description' => 'Supplier ledger/payment business records but supplier profiles stay.'],
            ['key' => 'uploaded_files', 'label' => 'Uploaded Business Files', 'description' => 'Product images, invoices, customer uploaded documents and other business media.'],
            ['key' => 'logs', 'label' => 'Business Logs', 'description' => 'Audit/activity/communication logs.'],
            ['key' => 'full_clean_setup', 'label' => 'Full Clean Setup', 'description' => 'Clean business data and uploaded business files. Users, roles, permissions, branches and settings stay.'],
        ];
    }

    public function clean(array $selectedOptions): array
    {
        $selected = collect($selectedOptions)->map(fn ($item) => strtolower((string) $item))->unique()->values()->all();

        if (in_array('full_clean_setup', $selected, true)) {
            $selected = ['sales_data', 'purchase_data', 'product_stock_data', 'customer_business_data', 'supplier_business_data', 'uploaded_files', 'logs'];
        }

        $deletedCounts = [];
        $deletedFiles = 0;

        DB::statement('SET FOREIGN_KEY_CHECKS=0');
        try {
            foreach ($selected as $option) {
                foreach ($this->categoryTables[$option] ?? [] as $table) {
                    if (! Schema::hasTable($table)) {
                        continue;
                    }

                    $count = DB::table($table)->count();
                    DB::table($table)->truncate();
                    $deletedCounts[$table] = $count;
                }
            }
        } finally {
            DB::statement('SET FOREIGN_KEY_CHECKS=1');
        }

        if (in_array('uploaded_files', $selected, true) || in_array('purchase_data', $selected, true) || in_array('product_stock_data', $selected, true)) {
            $deletedFiles = $this->deleteBusinessFiles();
        }

        return [
            'selected_options' => $selected,
            'deleted_counts' => $deletedCounts,
            'deleted_files_count' => $deletedFiles,
        ];
    }

    private function deleteBusinessFiles(): int
    {
        $deleted = 0;
        $disk = Storage::disk('public');

        foreach ($this->businessFileDirectories as $directory) {
            if (! $disk->exists($directory)) {
                continue;
            }

            try {
                $deleted += count($disk->allFiles($directory));
                $disk->deleteDirectory($directory);
            } catch (Throwable $exception) {
                report($exception);
            }
        }

        return $deleted;
    }
}
