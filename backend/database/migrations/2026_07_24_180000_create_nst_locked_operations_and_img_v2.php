<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('suppliers')) {
            Schema::table('suppliers', function (Blueprint $table) {
                if (! Schema::hasColumn('suppliers', 'supplier_code')) {
                    $table->string('supplier_code', 32)->nullable()->unique()->after('id');
                }
                if (! Schema::hasColumn('suppliers', 'supplier_since')) {
                    $table->date('supplier_since')->nullable()->after('current_balance');
                }
                if (! Schema::hasColumn('suppliers', 'portal_enabled')) {
                    $table->boolean('portal_enabled')->default(false)->after('status');
                }
                if (! Schema::hasColumn('suppliers', 'reliability_score')) {
                    $table->decimal('reliability_score', 5, 2)->default(0)->after('portal_enabled');
                }
            });
        }

        if (! Schema::hasTable('financial_view_policies')) {
            Schema::create('financial_view_policies', function (Blueprint $table) {
                $table->id();
                $table->string('subject_type', 20); // everyone, role, user
                $table->unsignedBigInteger('subject_id')->nullable();
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->string('module_key', 80)->default('*');
                $table->string('mode', 24)->default('none'); // full_actual, restricted, none
                $table->unsignedTinyInteger('reduction_percent')->nullable();
                $table->string('deterministic_seed', 100)->nullable();
                $table->boolean('enabled')->default(true);
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
                $table->index(['subject_type', 'subject_id', 'module_key'], 'nst_fin_view_subject_module_idx');
            });
        }

        if (! Schema::hasTable('scheduled_refunds')) {
            Schema::create('scheduled_refunds', function (Blueprint $table) {
                $table->id();
                $table->string('refund_no', 40)->unique();
                $table->unsignedBigInteger('sale_id')->nullable();
                $table->unsignedBigInteger('exchange_id')->nullable();
                $table->unsignedBigInteger('customer_id')->nullable();
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->decimal('amount', 14, 2);
                $table->string('method', 50);
                $table->dateTime('scheduled_at');
                $table->string('status', 30)->default('pending_approval');
                $table->text('reason')->nullable();
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('approved_by')->nullable();
                $table->dateTime('approved_at')->nullable();
                $table->unsignedBigInteger('ready_by')->nullable();
                $table->dateTime('ready_at')->nullable();
                $table->unsignedBigInteger('paid_by')->nullable();
                $table->dateTime('paid_at')->nullable();
                $table->string('payment_reference', 120)->nullable();
                $table->dateTime('last_reminded_at')->nullable();
                $table->unsignedInteger('reminder_count')->default(0);
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
                $table->index(['status', 'scheduled_at']);
                $table->index(['customer_id', 'branch_id']);
            });
        }

        if (! Schema::hasTable('supplier_price_submissions')) {
            Schema::create('supplier_price_submissions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('supplier_id');
                $table->unsignedBigInteger('product_id')->nullable();
                $table->unsignedBigInteger('product_variant_id')->nullable();
                $table->string('product_name', 255);
                $table->string('variant_name', 255)->nullable();
                $table->decimal('unit_price', 14, 2);
                $table->string('warranty', 255)->nullable();
                $table->unsignedInteger('available_quantity')->default(0);
                $table->unsignedInteger('minimum_order_quantity')->default(1);
                $table->decimal('delivery_cost', 14, 2)->default(0);
                $table->unsignedInteger('delivery_days')->nullable();
                $table->dateTime('valid_until')->nullable();
                $table->string('availability_status', 40)->default('available');
                $table->string('source_url', 2000)->nullable();
                $table->text('notes')->nullable();
                $table->string('status', 30)->default('submitted');
                $table->unsignedBigInteger('submitted_by');
                $table->unsignedBigInteger('reviewed_by')->nullable();
                $table->dateTime('reviewed_at')->nullable();
                $table->timestamps();
                $table->index(['supplier_id', 'product_id', 'product_variant_id'], 'nst_supplier_price_lookup_idx');
                $table->index(['status', 'valid_until']);
            });
        }

        if (! Schema::hasTable('nst_purchase_orders')) {
            Schema::create('nst_purchase_orders', function (Blueprint $table) {
                $table->id();
                $table->string('po_number', 40)->unique();
                $table->unsignedBigInteger('supplier_id');
                $table->unsignedBigInteger('branch_id')->nullable();
                $table->string('status', 30)->default('draft');
                $table->decimal('subtotal', 14, 2)->default(0);
                $table->decimal('delivery_cost', 14, 2)->default(0);
                $table->decimal('total', 14, 2)->default(0);
                $table->dateTime('expected_delivery_at')->nullable();
                $table->text('notes')->nullable();
                $table->unsignedBigInteger('created_by');
                $table->unsignedBigInteger('approved_by')->nullable();
                $table->dateTime('approved_at')->nullable();
                $table->unsignedBigInteger('sent_by')->nullable();
                $table->dateTime('sent_at')->nullable();
                $table->timestamps();
                $table->index(['supplier_id', 'status']);
            });
        }

        if (! Schema::hasTable('nst_purchase_order_items')) {
            Schema::create('nst_purchase_order_items', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('purchase_order_id');
                $table->unsignedBigInteger('supplier_price_submission_id')->nullable();
                $table->unsignedBigInteger('product_id')->nullable();
                $table->unsignedBigInteger('product_variant_id')->nullable();
                $table->string('product_name', 255);
                $table->string('variant_name', 255)->nullable();
                $table->unsignedInteger('quantity');
                $table->decimal('unit_price', 14, 2);
                $table->decimal('line_total', 14, 2);
                $table->timestamps();
                $table->index('purchase_order_id');
            });
        }

        if (! Schema::hasTable('bulk_import_templates')) {
            Schema::create('bulk_import_templates', function (Blueprint $table) {
                $table->id();
                $table->string('name', 150);
                $table->string('module_key', 80);
                $table->json('columns');
                $table->json('defaults')->nullable();
                $table->boolean('is_default')->default(false);
                $table->boolean('is_active')->default(true);
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
                $table->unique(['name', 'module_key']);
            });
        }

        if (! Schema::hasTable('bulk_import_histories')) {
            Schema::create('bulk_import_histories', function (Blueprint $table) {
                $table->id();
                $table->string('import_uuid', 64)->unique();
                $table->string('module_key', 80);
                $table->unsignedBigInteger('template_id')->nullable();
                $table->string('filename', 255)->nullable();
                $table->string('status', 30)->default('previewed');
                $table->unsignedInteger('total_rows')->default(0);
                $table->unsignedInteger('success_rows')->default(0);
                $table->unsignedInteger('skipped_rows')->default(0);
                $table->unsignedInteger('duplicate_rows')->default(0);
                $table->unsignedInteger('failed_rows')->default(0);
                $table->json('mapping')->nullable();
                $table->json('result')->nullable();
                $table->json('rollback_payload')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->timestamps();
                $table->index(['module_key', 'status']);
            });
        }

        if (! Schema::hasTable('product_spec_groups')) {
            Schema::create('product_spec_groups', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('product_id');
                $table->string('name', 120);
                $table->unsignedInteger('sort_order')->default(0);
                $table->boolean('is_visible')->default(true);
                $table->timestamps();
                $table->index(['product_id', 'sort_order']);
            });
        }

        if (! Schema::hasTable('product_spec_rows')) {
            Schema::create('product_spec_rows', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('group_id');
                $table->string('label', 180);
                $table->longText('value')->nullable();
                $table->unsignedInteger('sort_order')->default(0);
                $table->boolean('is_searchable')->default(true);
                $table->boolean('is_visible')->default(true);
                $table->timestamps();
                $table->index(['group_id', 'sort_order']);
            });
        }

        if (! Schema::hasTable('barcode_label_templates')) {
            Schema::create('barcode_label_templates', function (Blueprint $table) {
                $table->id();
                $table->string('name', 120);
                $table->string('template_key', 120)->unique();
                $table->boolean('is_default')->default(false);
                $table->boolean('is_active')->default(true);
                $table->json('settings');
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        $this->seedSupplierCodes();
        $this->seedAccessRegistry();
        $this->seedBarcodeTemplates();
        $this->seedOnlineActivistRole();
    }

    public function down(): void
    {
        Schema::dropIfExists('product_spec_rows');
        Schema::dropIfExists('product_spec_groups');
        Schema::dropIfExists('bulk_import_histories');
        Schema::dropIfExists('bulk_import_templates');
        Schema::dropIfExists('nst_purchase_order_items');
        Schema::dropIfExists('nst_purchase_orders');
        Schema::dropIfExists('supplier_price_submissions');
        Schema::dropIfExists('scheduled_refunds');
        Schema::dropIfExists('financial_view_policies');
        Schema::dropIfExists('barcode_label_templates');

        if (Schema::hasTable('suppliers')) {
            Schema::table('suppliers', function (Blueprint $table) {
                foreach (['supplier_code', 'supplier_since', 'portal_enabled', 'reliability_score'] as $column) {
                    if (Schema::hasColumn('suppliers', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }

    private function seedSupplierCodes(): void
    {
        if (! Schema::hasTable('suppliers') || ! Schema::hasColumn('suppliers', 'supplier_code')) {
            return;
        }

        DB::table('suppliers')->whereNull('supplier_code')->orderBy('id')->get(['id'])->each(function ($supplier): void {
            DB::table('suppliers')->where('id', $supplier->id)->update([
                'supplier_code' => 'SUP-' . str_pad((string) $supplier->id, 6, '0', STR_PAD_LEFT),
            ]);
        });
    }

    private function seedAccessRegistry(): void
    {
        if (! Schema::hasTable('access_pages')) {
            return;
        }

        $now = now();
        $pages = [
            ['page_key' => 'scheduled_refunds', 'page_name' => 'Scheduled Refunds', 'module' => 'Accounts & Finance', 'route' => '/locked-operations?tab=refunds'],
            ['page_key' => 'supplier_price_watch', 'page_name' => 'Supplier Price Comparison', 'module' => 'Purchase', 'route' => '/locked-operations?tab=prices'],
            ['page_key' => 'purchase_orders', 'page_name' => 'Purchase Orders', 'module' => 'Purchase', 'route' => '/locked-operations?tab=orders'],
            ['page_key' => 'financial_view', 'page_name' => 'NST Financial View', 'module' => 'Users & Access', 'route' => '/locked-operations?tab=financial'],
            ['page_key' => 'bulk_import_studio', 'page_name' => 'Custom Bulk Upload Studio', 'module' => 'Product & Inventory', 'route' => '/bulk-upload'],
            ['page_key' => 'product_specs', 'page_name' => 'Product Specification Studio', 'module' => 'Product & Inventory', 'route' => '/products'],
            ['page_key' => 'supplier_portal_admin', 'page_name' => 'Supplier Portal Administration', 'module' => 'Purchase', 'route' => '/suppliers'],
        ];

        foreach ($pages as $page) {
            $payload = array_merge($page, [
                'default_visibility' => 'super_admin_only',
                'available_actions' => json_encode(['view', 'create', 'edit', 'approve', 'send', 'export', 'print']),
                'available_columns' => json_encode(['*']),
                'enabled' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            DB::table('access_pages')->updateOrInsert(['page_key' => $page['page_key']], $payload);
        }
    }

    private function seedBarcodeTemplates(): void
    {
        if (! Schema::hasTable('barcode_label_templates')) {
            return;
        }

        $base = [
            'encoding' => 'CODE128',
            'encoded_field' => 'sku',
            'show_sku_text' => true,
            'show_product_name' => false,
            'show_sale_price' => true,
            'show_imei1' => false,
            'show_imei2' => false,
            'show_branch' => false,
            'show_condition' => false,
            'show_warranty' => false,
            'custom_text' => '',
            'label_width_mm' => 50,
            'label_height_mm' => 30,
            'orientation' => 'portrait',
            'font_size' => 10,
            'barcode_height' => 46,
            'barcode_width' => 2,
            'alignment' => 'center',
            'border' => true,
            'copies' => 1,
        ];

        $templates = [
            ['Standard Product Label', 'standard-product', true, $base],
            ['Compact SKU Label', 'compact-sku', false, array_merge($base, ['label_width_mm' => 40, 'label_height_mm' => 20, 'show_sale_price' => false])],
            ['Used Device Label', 'used-device', false, array_merge($base, ['show_product_name' => true, 'show_imei1' => true, 'show_condition' => true])],
            ['Price Label', 'price-label', false, array_merge($base, ['show_product_name' => true, 'show_sale_price' => true])],
            ['IMEI Label', 'imei-label', false, array_merge($base, ['show_imei1' => true, 'show_sale_price' => false])],
        ];

        foreach ($templates as [$name, $key, $default, $settings]) {
            DB::table('barcode_label_templates')->updateOrInsert(['template_key' => $key], [
                'name' => $name,
                'is_default' => $default,
                'is_active' => true,
                'settings' => json_encode($settings),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function seedOnlineActivistRole(): void
    {
        if (! Schema::hasTable('roles')) {
            return;
        }

        DB::table('roles')->updateOrInsert(
            ['name' => 'online_activist', 'guard_name' => 'web'],
            ['created_at' => now(), 'updated_at' => now()]
        );
    }
};
