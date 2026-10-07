<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->normalizeBranchStocks();
        $this->normalizeStockMovements();
        $this->normalizeCustomerOrders();
        $this->createStockAdjustments();
        $this->createSaleExchanges();
        $this->createOrderDeliveries();
        $this->createOrderTimelineEvents();
        $this->createPaymentTransactions();
        $this->registerReleasePages();
    }

    private function normalizeBranchStocks(): void
    {
        if (! Schema::hasTable('branch_stocks')) {
            return;
        }

        Schema::table('branch_stocks', function (Blueprint $table) {
            if (! Schema::hasColumn('branch_stocks', 'product_variant_id')) {
                $table->unsignedBigInteger('product_variant_id')->nullable()->index();
            }
            if (! Schema::hasColumn('branch_stocks', 'reserved_quantity')) {
                $table->integer('reserved_quantity')->default(0);
            }
            if (! Schema::hasColumn('branch_stocks', 'low_stock_alert')) {
                $table->integer('low_stock_alert')->default(5);
            }
            if (! Schema::hasColumn('branch_stocks', 'alert_quantity')) {
                $table->integer('alert_quantity')->default(5);
            }
            if (! Schema::hasColumn('branch_stocks', 'shelf_location')) {
                $table->string('shelf_location')->nullable();
            }
            if (! Schema::hasColumn('branch_stocks', 'status')) {
                $table->string('status', 30)->default('active')->index();
            }
            if (! Schema::hasColumn('branch_stocks', 'note')) {
                $table->text('note')->nullable();
            }
        });
    }

    private function normalizeStockMovements(): void
    {
        if (! Schema::hasTable('stock_movements')) {
            return;
        }

        Schema::table('stock_movements', function (Blueprint $table) {
            if (! Schema::hasColumn('stock_movements', 'movement_no')) {
                $table->string('movement_no')->nullable()->unique();
            }
            if (! Schema::hasColumn('stock_movements', 'product_variant_id')) {
                $table->unsignedBigInteger('product_variant_id')->nullable()->index();
            }
            if (! Schema::hasColumn('stock_movements', 'stock_transfer_request_id')) {
                $table->unsignedBigInteger('stock_transfer_request_id')->nullable()->index();
            }
            if (! Schema::hasColumn('stock_movements', 'user_id')) {
                $table->unsignedBigInteger('user_id')->nullable()->index();
            }
            if (! Schema::hasColumn('stock_movements', 'type')) {
                $table->string('type', 60)->nullable()->index();
            }
            if (! Schema::hasColumn('stock_movements', 'quantity_change')) {
                $table->integer('quantity_change')->default(0);
            }
            if (! Schema::hasColumn('stock_movements', 'quantity_before')) {
                $table->integer('quantity_before')->default(0);
            }
            if (! Schema::hasColumn('stock_movements', 'quantity_after')) {
                $table->integer('quantity_after')->default(0);
            }
            if (! Schema::hasColumn('stock_movements', 'reference_type')) {
                $table->string('reference_type', 80)->nullable()->index();
            }
            if (! Schema::hasColumn('stock_movements', 'reference_id')) {
                $table->unsignedBigInteger('reference_id')->nullable()->index();
            }
            if (! Schema::hasColumn('stock_movements', 'movement_at')) {
                $table->timestamp('movement_at')->nullable()->index();
            }
        });
    }


    private function normalizeCustomerOrders(): void
    {
        if (! Schema::hasTable('customer_orders')) {
            return;
        }

        Schema::table('customer_orders', function (Blueprint $table) {
            if (! Schema::hasColumn('customer_orders', 'shipping_method')) {
                $table->string('shipping_method', 60)->nullable()->index();
            }
            if (! Schema::hasColumn('customer_orders', 'delivery_city')) {
                $table->string('delivery_city', 120)->nullable();
            }
            if (! Schema::hasColumn('customer_orders', 'delivery_district')) {
                $table->string('delivery_district', 120)->nullable();
            }
            if (! Schema::hasColumn('customer_orders', 'delivery_postal_code')) {
                $table->string('delivery_postal_code', 30)->nullable();
            }
        });
    }

    private function createStockAdjustments(): void
    {
        if (Schema::hasTable('stock_adjustments')) {
            return;
        }

        Schema::create('stock_adjustments', function (Blueprint $table) {
            $table->id();
            $table->string('adjustment_no', 60)->unique();
            $table->unsignedBigInteger('branch_id')->index();
            $table->unsignedBigInteger('product_id')->index();
            $table->unsignedBigInteger('product_variant_id')->nullable()->index();
            $table->unsignedBigInteger('device_unit_id')->nullable()->index();
            $table->string('direction', 20);
            $table->unsignedInteger('quantity');
            $table->integer('quantity_before')->default(0);
            $table->integer('quantity_after')->default(0);
            $table->string('reason', 100);
            $table->text('note')->nullable();
            $table->json('metadata')->nullable();
            $table->string('status', 30)->default('draft')->index();
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->unsignedBigInteger('posted_by')->nullable()->index();
            $table->unsignedBigInteger('reversed_by')->nullable()->index();
            $table->timestamp('posted_at')->nullable();
            $table->timestamp('reversed_at')->nullable();
            $table->timestamps();
            $table->softDeletes();
        });
    }

    private function createSaleExchanges(): void
    {
        if (! Schema::hasTable('sale_exchanges')) {
            Schema::create('sale_exchanges', function (Blueprint $table) {
                $table->id();
                $table->string('exchange_no', 60)->unique();
                $table->unsignedBigInteger('sale_id')->index();
                $table->unsignedBigInteger('branch_id')->index();
                $table->unsignedBigInteger('customer_id')->nullable()->index();
                $table->decimal('returned_value', 15, 2)->default(0);
                $table->decimal('replacement_value', 15, 2)->default(0);
                $table->decimal('difference_amount', 15, 2)->default(0);
                $table->decimal('paid_amount', 15, 2)->default(0);
                $table->decimal('due_amount', 15, 2)->default(0);
                $table->decimal('refund_amount', 15, 2)->default(0);
                $table->string('payment_method', 60)->nullable();
                $table->string('status', 30)->default('completed')->index();
                $table->string('reason', 190);
                $table->text('note')->nullable();
                $table->unsignedBigInteger('processed_by')->nullable()->index();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (! Schema::hasTable('sale_exchange_items')) {
            Schema::create('sale_exchange_items', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('sale_exchange_id')->index();
                $table->string('item_type', 20)->index();
                $table->unsignedBigInteger('sale_item_id')->nullable()->index();
                $table->unsignedBigInteger('product_id')->nullable()->index();
                $table->unsignedBigInteger('product_variant_id')->nullable()->index();
                $table->unsignedBigInteger('device_unit_id')->nullable()->index();
                $table->string('product_name');
                $table->string('sku')->nullable();
                $table->string('imei_1')->nullable();
                $table->string('barcode')->nullable();
                $table->unsignedInteger('quantity')->default(1);
                $table->decimal('unit_price', 15, 2)->default(0);
                $table->decimal('line_total', 15, 2)->default(0);
                $table->text('condition_note')->nullable();
                $table->timestamps();
            });
        }
    }

    private function createOrderDeliveries(): void
    {
        if (Schema::hasTable('order_deliveries')) {
            return;
        }

        Schema::create('order_deliveries', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_order_id')->unique();
            $table->unsignedBigInteger('sale_id')->nullable()->index();
            $table->string('status', 40)->default('pending')->index();
            $table->string('courier_name')->nullable();
            $table->string('tracking_number')->nullable()->index();
            $table->string('driver_name')->nullable();
            $table->string('driver_phone', 40)->nullable();
            $table->text('delivery_address')->nullable();
            $table->timestamp('scheduled_at')->nullable();
            $table->timestamp('dispatched_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->string('received_by')->nullable();
            $table->string('proof_path')->nullable();
            $table->text('note')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable()->index();
            $table->timestamps();
        });
    }

    private function createOrderTimelineEvents(): void
    {
        if (Schema::hasTable('customer_order_timeline_events')) {
            return;
        }

        Schema::create('customer_order_timeline_events', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('customer_order_id')->index();
            $table->string('event_type', 60)->index();
            $table->string('status', 60)->nullable()->index();
            $table->string('title');
            $table->text('description')->nullable();
            $table->json('metadata')->nullable();
            $table->boolean('customer_visible')->default(true)->index();
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->timestamp('event_at')->index();
            $table->timestamps();
        });
    }

    private function createPaymentTransactions(): void
    {
        if (Schema::hasTable('payment_transactions')) {
            return;
        }

        Schema::create('payment_transactions', function (Blueprint $table) {
            $table->id();
            $table->string('transaction_no', 80)->unique();
            $table->string('provider', 40)->index();
            $table->unsignedBigInteger('customer_order_id')->nullable()->index();
            $table->unsignedBigInteger('sale_id')->nullable()->index();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->string('provider_transaction_id')->nullable()->index();
            $table->string('session_key')->nullable()->index();
            $table->decimal('amount', 15, 2);
            $table->string('currency', 10)->default('BDT');
            $table->string('status', 40)->default('initiated')->index();
            $table->unsignedTinyInteger('risk_level')->nullable();
            $table->string('card_type')->nullable();
            $table->string('bank_transaction_id')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->json('validation_payload')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();
        });
    }

    private function registerReleasePages(): void
    {
        if (! Schema::hasTable('access_pages')) {
            return;
        }

        $pages = [
            ['catalog', 'Category, Brand & Catalog', 'products', '/catalog', 'Product & Inventory'],
            ['products', 'Products', 'products', '/products', 'Product & Inventory'],
            ['variants', 'Variant Management', 'products', '/products/variant-operations', 'Product & Inventory'],
            ['suppliers', 'Suppliers', 'purchases', '/suppliers', 'Purchases'],
            ['purchases', 'Purchases', 'purchases', '/purchases', 'Purchases'],
            ['used_purchase', 'Used Purchase', 'purchases', '/used-purchase', 'Purchases'],
            ['device_stock', 'Device Stock', 'inventory', '/device-stock', 'Product & Inventory'],
            ['device_history', 'Device History', 'inventory', '/device-history', 'Product & Inventory'],
            ['barcode', 'Barcode Management', 'inventory', '/settings/barcode-tools', 'Product & Inventory'],
            ['stock_transfer', 'Stock Transfer', 'inventory', '/branch-stock-requests', 'Product & Inventory'],
            ['stock_adjustment', 'Stock Adjustment', 'inventory', '/stock-adjustments', 'Product & Inventory'],
            ['service_status', 'Service Status', 'service', '/warranty-service', 'Service'],
            ['pos_sales', 'POS Sales', 'sales', '/sales/create', 'Sales & Order'],
            ['sales_list', 'Sales List', 'sales', '/sales', 'Sales & Order'],
            ['web_sales', 'Web Sales', 'sales', '/web-sales', 'Sales & Order'],
            ['invoice', 'Invoice', 'sales', '/sales', 'Sales & Order'],
            ['payments', 'Payments', 'accounts', '/accounts', 'Accounts'],
            ['returns', 'Returns', 'sales', '/sales', 'Sales & Order'],
            ['exchange', 'Exchange', 'sales', '/exchanges', 'Sales & Order'],
            ['due_collection', 'Due Collection', 'accounts', '/customer-due-collection', 'Accounts'],
            ['coupon', 'Coupon', 'sales', '/coupons', 'Marketing Center'],
            ['emi', 'EMI', 'sales', '/settings/emi', 'Settings'],
            ['delivery', 'Delivery', 'sales', '/deliveries', 'Sales & Order'],
            ['customer_order_timeline', 'Customer Order Timeline', 'sales', '/orders', 'Sales & Order'],
            ['preorder', 'PreOrder', 'sales', '/bookings', 'Sales & Order'],
            ['access_matrix', 'Access Matrix', 'security', '/users-access', 'Settings'],
        ];

        foreach ($pages as [$key, $name, $module, $route, $group]) {
            $values = [
                'page_name' => $name,
                'module' => $module,
                'route' => $route,
                'sidebar_group' => $group,
                'default_visibility' => 'super_admin_only',
                'available_actions' => json_encode(['view', 'list', 'show', 'search', 'create', 'edit', 'delete', 'approve', 'reject', 'receive', 'post', 'reverse', 'print', 'reprint', 'export', 'send', 'change_status', 'refund', 'cancel', 'complete']),
                'available_columns' => json_encode([]),
                'available_row_scopes' => json_encode(['own_records', 'own_branch', 'selected_branches', 'all_records']),
                'dashboard_widget_support' => true,
                'enabled' => true,
                'updated_at' => now(),
            ];

            $existingId = DB::table('access_pages')->where('page_key', $key)->value('id');
            if ($existingId) {
                DB::table('access_pages')->where('id', $existingId)->update($values);
            } else {
                DB::table('access_pages')->insert(['page_key' => $key, 'created_at' => now()] + $values);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_transactions');
        Schema::dropIfExists('customer_order_timeline_events');
        Schema::dropIfExists('order_deliveries');
        Schema::dropIfExists('sale_exchange_items');
        Schema::dropIfExists('sale_exchanges');
        Schema::dropIfExists('stock_adjustments');
    }
};
