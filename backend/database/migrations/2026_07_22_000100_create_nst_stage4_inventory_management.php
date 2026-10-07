<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->upgradeTransferRequests();
        $this->upgradeTransferItems();
        $this->createTransferDevices();
        $this->upgradeBranchStocks();
        $this->createReconciliationRuns();
        $this->registerInventoryPage();
    }

    private function upgradeTransferRequests(): void
    {
        if (! Schema::hasTable('stock_transfer_requests')) {
            return;
        }

        Schema::table('stock_transfer_requests', function (Blueprint $table) {
            if (! Schema::hasColumn('stock_transfer_requests', 'dispatched_by')) {
                $table->unsignedBigInteger('dispatched_by')->nullable()->index();
            }
            if (! Schema::hasColumn('stock_transfer_requests', 'received_by')) {
                $table->unsignedBigInteger('received_by')->nullable()->index();
            }
            if (! Schema::hasColumn('stock_transfer_requests', 'dispatch_note')) {
                $table->text('dispatch_note')->nullable();
            }
            if (! Schema::hasColumn('stock_transfer_requests', 'receive_note')) {
                $table->text('receive_note')->nullable();
            }
        });
    }

    private function upgradeTransferItems(): void
    {
        if (! Schema::hasTable('stock_transfer_request_items')) {
            return;
        }

        Schema::table('stock_transfer_request_items', function (Blueprint $table) {
            if (! Schema::hasColumn('stock_transfer_request_items', 'source_quantity_snapshot')) {
                $table->integer('source_quantity_snapshot')->default(0);
            }
            if (! Schema::hasColumn('stock_transfer_request_items', 'in_transit_quantity')) {
                $table->integer('in_transit_quantity')->default(0);
            }
        });
    }

    private function createTransferDevices(): void
    {
        if (Schema::hasTable('stock_transfer_device_units')) {
            return;
        }

        Schema::create('stock_transfer_device_units', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('stock_transfer_request_id')->index();
            $table->unsignedBigInteger('stock_transfer_request_item_id')->index();
            $table->unsignedBigInteger('device_unit_id')->index();
            $table->unsignedBigInteger('from_branch_id')->nullable()->index();
            $table->unsignedBigInteger('to_branch_id')->index();
            $table->string('status', 30)->default('assigned')->index();
            $table->unsignedBigInteger('assigned_by')->nullable()->index();
            $table->unsignedBigInteger('received_by')->nullable()->index();
            $table->timestamp('assigned_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->timestamps();
            $table->unique(['stock_transfer_request_id', 'device_unit_id'], 'str_device_unique');
        });
    }

    private function upgradeBranchStocks(): void
    {
        if (! Schema::hasTable('branch_stocks')) {
            return;
        }

        Schema::table('branch_stocks', function (Blueprint $table) {
            if (! Schema::hasColumn('branch_stocks', 'last_counted_at')) {
                $table->timestamp('last_counted_at')->nullable();
            }
            if (! Schema::hasColumn('branch_stocks', 'last_counted_by')) {
                $table->unsignedBigInteger('last_counted_by')->nullable()->index();
            }
            if (! Schema::hasColumn('branch_stocks', 'last_reconciled_at')) {
                $table->timestamp('last_reconciled_at')->nullable();
            }
            if (! Schema::hasColumn('branch_stocks', 'last_reconciled_by')) {
                $table->unsignedBigInteger('last_reconciled_by')->nullable()->index();
            }
        });
    }

    private function createReconciliationRuns(): void
    {
        if (Schema::hasTable('inventory_reconciliations')) {
            return;
        }

        Schema::create('inventory_reconciliations', function (Blueprint $table) {
            $table->id();
            $table->string('run_no', 60)->unique();
            $table->string('mode', 20)->default('dry_run')->index();
            $table->string('status', 30)->default('completed')->index();
            $table->unsignedInteger('issues_found')->default(0);
            $table->unsignedInteger('issues_fixed')->default(0);
            $table->json('summary')->nullable();
            $table->json('details')->nullable();
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    private function registerInventoryPage(): void
    {
        if (! Schema::hasTable('access_pages')) {
            return;
        }

        $values = [
            'page_name' => 'Inventory Control Center',
            'module' => 'inventory',
            'route' => '/inventory-control',
            'sidebar_group' => 'Product & Inventory',
            'default_visibility' => 'super_admin_only',
            'available_actions' => json_encode(['view', 'list', 'search', 'edit', 'reconcile', 'export', 'change_status']),
            'available_columns' => json_encode([]),
            'available_row_scopes' => json_encode(['own_branch', 'selected_branches', 'all_records']),
            'dashboard_widget_support' => true,
            'enabled' => true,
            'updated_at' => now(),
        ];

        $existing = DB::table('access_pages')->where('page_key', 'inventory_control')->value('id');
        if ($existing) {
            DB::table('access_pages')->where('id', $existing)->update($values);
        } else {
            DB::table('access_pages')->insert(['page_key' => 'inventory_control', 'created_at' => now()] + $values);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('inventory_reconciliations');
        Schema::dropIfExists('stock_transfer_device_units');
    }
};
