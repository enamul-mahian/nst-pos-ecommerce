<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('warranty_service_jobs')) {
            Schema::create('warranty_service_jobs', function (Blueprint $table) {
                $table->id();
                $table->string('job_no')->unique();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->unsignedBigInteger('customer_id')->nullable()->index();
                $table->unsignedBigInteger('sale_id')->nullable()->index();
                $table->unsignedBigInteger('sale_item_id')->nullable()->index();
                $table->unsignedBigInteger('device_unit_id')->nullable()->index();
                $table->unsignedBigInteger('product_id')->nullable()->index();

                $table->string('customer_name')->nullable();
                $table->string('customer_phone')->nullable()->index();
                $table->string('product_name')->nullable();
                $table->string('imei_1')->nullable()->index();
                $table->string('imei_2')->nullable()->index();
                $table->string('barcode')->nullable()->index();

                $table->string('warranty_type')->default('warranty');
                $table->string('issue_type')->nullable();
                $table->text('issue_description')->nullable();
                $table->string('priority')->default('normal');
                $table->string('status')->default('received')->index();

                $table->decimal('estimated_cost', 14, 2)->default(0);
                $table->decimal('service_charge', 14, 2)->default(0);
                $table->decimal('parts_cost', 14, 2)->default(0);
                $table->decimal('discount_amount', 14, 2)->default(0);
                $table->decimal('total_amount', 14, 2)->default(0);
                $table->decimal('paid_amount', 14, 2)->default(0);
                $table->decimal('due_amount', 14, 2)->default(0);
                $table->string('payment_method')->nullable();
                $table->string('transaction_id')->nullable();

                $table->unsignedBigInteger('received_by')->nullable()->index();
                $table->unsignedBigInteger('assigned_to')->nullable()->index();
                $table->unsignedBigInteger('delivered_by')->nullable()->index();
                $table->timestamp('received_at')->nullable();
                $table->date('expected_delivery_date')->nullable();
                $table->timestamp('completed_at')->nullable();
                $table->timestamp('delivered_at')->nullable();

                $table->text('technician_note')->nullable();
                $table->text('resolution_note')->nullable();
                $table->text('delivery_note')->nullable();
                $table->text('note')->nullable();

                $table->timestamps();
                $table->softDeletes();
            });
        } else {
            Schema::table('warranty_service_jobs', function (Blueprint $table) {
                $columns = Schema::getColumnListing('warranty_service_jobs');

                foreach ([
                    'branch_id', 'customer_id', 'sale_id', 'sale_item_id', 'device_unit_id', 'product_id',
                    'received_by', 'assigned_to', 'delivered_by',
                ] as $column) {
                    if (!in_array($column, $columns, true)) {
                        $table->unsignedBigInteger($column)->nullable()->index();
                    }
                }

                foreach (['job_no', 'customer_name', 'customer_phone', 'product_name', 'imei_1', 'imei_2', 'barcode', 'warranty_type', 'issue_type', 'priority', 'status', 'payment_method', 'transaction_id'] as $column) {
                    if (!in_array($column, $columns, true)) {
                        $table->string($column)->nullable()->index();
                    }
                }

                foreach (['issue_description', 'technician_note', 'resolution_note', 'delivery_note', 'note'] as $column) {
                    if (!in_array($column, $columns, true)) {
                        $table->text($column)->nullable();
                    }
                }

                foreach (['estimated_cost', 'service_charge', 'parts_cost', 'discount_amount', 'total_amount', 'paid_amount', 'due_amount'] as $column) {
                    if (!in_array($column, $columns, true)) {
                        $table->decimal($column, 14, 2)->default(0);
                    }
                }

                if (!in_array('received_at', $columns, true)) {
                    $table->timestamp('received_at')->nullable();
                }
                if (!in_array('expected_delivery_date', $columns, true)) {
                    $table->date('expected_delivery_date')->nullable();
                }
                if (!in_array('completed_at', $columns, true)) {
                    $table->timestamp('completed_at')->nullable();
                }
                if (!in_array('delivered_at', $columns, true)) {
                    $table->timestamp('delivered_at')->nullable();
                }
                if (!in_array('deleted_at', $columns, true)) {
                    $table->softDeletes();
                }
            });
        }

        if (!Schema::hasTable('warranty_service_job_logs')) {
            Schema::create('warranty_service_job_logs', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('warranty_service_job_id')->index();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->string('action')->nullable();
                $table->string('from_status')->nullable();
                $table->string('to_status')->nullable();
                $table->text('note')->nullable();
                $table->json('meta')->nullable();
                $table->timestamps();
            });
        }

        if (Schema::hasTable('device_units')) {
            Schema::table('device_units', function (Blueprint $table) {
                $columns = Schema::getColumnListing('device_units');

                if (!in_array('service_status', $columns, true)) {
                    $table->string('service_status')->nullable()->index()->after('status');
                }

                if (!in_array('latest_service_job_id', $columns, true)) {
                    $table->unsignedBigInteger('latest_service_job_id')->nullable()->index()->after('service_status');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('device_units')) {
            Schema::table('device_units', function (Blueprint $table) {
                $columns = Schema::getColumnListing('device_units');
                if (in_array('latest_service_job_id', $columns, true)) {
                    $table->dropColumn('latest_service_job_id');
                }
                if (in_array('service_status', $columns, true)) {
                    $table->dropColumn('service_status');
                }
            });
        }

        Schema::dropIfExists('warranty_service_job_logs');
        Schema::dropIfExists('warranty_service_jobs');
    }
};
