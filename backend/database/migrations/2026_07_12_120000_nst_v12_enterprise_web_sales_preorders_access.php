<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_orders', function (Blueprint $table) {
            foreach ([
                'sale_id' => fn() => $table->unsignedBigInteger('sale_id')->nullable()->unique(),
                'invoice_no' => fn() => $table->string('invoice_no', 100)->nullable()->unique(),
                'assigned_staff_id' => fn() => $table->unsignedBigInteger('assigned_staff_id')->nullable()->index(),
                'delivery_status' => fn() => $table->string('delivery_status', 60)->default('pending')->index(),
                'reserved_at' => fn() => $table->timestamp('reserved_at')->nullable(),
                'authorized_at' => fn() => $table->timestamp('authorized_at')->nullable(),
                'delivered_at' => fn() => $table->timestamp('delivered_at')->nullable(),
                'completed_at' => fn() => $table->timestamp('completed_at')->nullable(),
                'cancelled_at' => fn() => $table->timestamp('cancelled_at')->nullable(),
                'refund_amount' => fn() => $table->decimal('refund_amount',15,2)->default(0),
            ] as $name=>$add) if (!Schema::hasColumn('customer_orders',$name)) $add();
        });
        Schema::table('sales', function (Blueprint $table) {
            if (!Schema::hasColumn('sales','source')) $table->string('source',60)->default('pos')->index();
            if (!Schema::hasColumn('sales','customer_order_id')) $table->unsignedBigInteger('customer_order_id')->nullable()->unique();
            if (!Schema::hasColumn('sales','delivery_status')) $table->string('delivery_status',60)->default('pending')->index();
        });
        if (!Schema::hasTable('web_order_payments')) Schema::create('web_order_payments', function(Blueprint $t){$t->id();$t->unsignedBigInteger('customer_order_id')->index();$t->string('method',60);$t->decimal('amount',15,2)->default(0);$t->string('transaction_id',190)->nullable()->unique();$t->text('screenshot_path')->nullable();$t->string('status',40)->default('pending')->index();$t->text('rejection_reason')->nullable();$t->unsignedBigInteger('reviewed_by')->nullable();$t->timestamp('reviewed_at')->nullable();$t->json('history')->nullable();$t->timestamps();});
        if (!Schema::hasTable('preorder_statuses')) Schema::create('preorder_statuses', function(Blueprint $t){$t->id();$t->string('key',100)->unique();$t->string('name',190);$t->string('color',30)->default('#6D28D9');$t->unsignedInteger('sort_order')->default(0);$t->boolean('enabled')->default(true);$t->boolean('customer_visible')->default(true);$t->timestamps();});
        if (!Schema::hasTable('customer_preorders')) Schema::create('customer_preorders', function(Blueprint $t){$t->id();$t->string('preorder_no',80)->unique();$t->unsignedBigInteger('customer_id')->index();$t->unsignedBigInteger('user_id')->nullable()->index();$t->unsignedBigInteger('product_id')->nullable()->index();$t->unsignedBigInteger('variant_id')->nullable()->index();$t->unsignedBigInteger('branch_id')->nullable()->index();$t->unsignedBigInteger('assigned_staff_id')->nullable()->index();$t->unsignedBigInteger('sale_id')->nullable()->unique();$t->string('invoice_no',100)->nullable()->unique();$t->string('status_key',100)->default('preorder_submitted')->index();$t->string('customer_name');$t->string('customer_phone',60);$t->string('customer_email')->nullable();$t->text('delivery_address')->nullable();$t->string('product_name');$t->string('desired_model')->nullable();$t->string('variant_name')->nullable();$t->text('product_link')->nullable();$t->text('product_image_url')->nullable();$t->decimal('requested_amount',15,2)->default(0);$t->decimal('advance_amount',15,2)->default(0);$t->decimal('paid_amount',15,2)->default(0);$t->decimal('due_amount',15,2)->default(0);$t->string('payment_method',60)->default('cash_on_delivery');$t->string('payment_status',60)->default('pending');$t->string('transaction_id',190)->nullable()->unique();$t->text('customer_note')->nullable();$t->text('customer_visible_note')->nullable();$t->text('admin_note')->nullable();$t->string('delivery_status',60)->default('pending');$t->timestamp('arrival_notified_at')->nullable();$t->timestamp('cancel_requested_at')->nullable();$t->timestamps();$t->softDeletes();});
        if (!Schema::hasTable('preorder_status_history')) Schema::create('preorder_status_history', function(Blueprint $t){$t->id();$t->unsignedBigInteger('customer_preorder_id')->index();$t->string('old_status',100)->nullable();$t->string('new_status',100);$t->unsignedBigInteger('changed_by')->nullable();$t->string('role',100)->nullable();$t->text('customer_visible_note')->nullable();$t->text('internal_note')->nullable();$t->timestamps();});
        if (!Schema::hasTable('barcode_print_logs')) Schema::create('barcode_print_logs', function(Blueprint $t){$t->id();$t->unsignedBigInteger('device_unit_id')->nullable()->index();$t->string('action',30)->default('print')->index();$t->unsignedInteger('print_count')->default(1);$t->text('reason')->nullable();$t->unsignedBigInteger('printed_by')->nullable()->index();$t->unsignedBigInteger('branch_id')->nullable()->index();$t->string('label_size',30)->default('40x20');$t->string('printer_type',30)->default('a4');$t->json('content_options')->nullable();$t->timestamps();});
        if (!Schema::hasTable('access_pages')) Schema::create('access_pages', function(Blueprint $t){$t->id();$t->string('page_key',190)->unique();$t->string('page_name');$t->string('module',100);$t->string('route')->nullable();$t->string('sidebar_group',100)->nullable();$t->string('default_visibility',40)->default('super_admin_only');$t->json('available_actions')->nullable();$t->json('available_columns')->nullable();$t->json('available_row_scopes')->nullable();$t->boolean('dashboard_widget_support')->default(false);$t->boolean('enabled')->default(true);$t->timestamps();});
        if (!Schema::hasTable('access_rules_v12')) Schema::create('access_rules_v12', function(Blueprint $t){$t->id();$t->unsignedBigInteger('access_page_id')->index();$t->string('subject_type',30);$t->unsignedBigInteger('subject_id')->nullable();$t->string('visibility',40)->default('deny');$t->json('actions')->nullable();$t->json('columns')->nullable();$t->string('row_scope',60)->default('own_branch');$t->json('selected_branches')->nullable();$t->timestamp('expires_at')->nullable();$t->unsignedBigInteger('created_by')->nullable();$t->timestamps();$t->unique(['access_page_id','subject_type','subject_id'],'access_rule_subject_unique');});
        $pages=[
          ['web_sales','Web Sales','sales','/web-sales','Sales'],['web_sales_report','Web Sales Report','reports','/reports/web-sales','Reports'],['customer_preorders','Customer PreOrders','sales','/preorders','Sales'],['barcode_history','Barcode Print History','inventory','/barcode-history','Inventory'],['users_access','Users & Access','people','/users-access','People']
        ];
        foreach($pages as $p) DB::table('access_pages')->updateOrInsert(['page_key'=>$p[0]],['page_name'=>$p[1],'module'=>$p[2],'route'=>$p[3],'sidebar_group'=>$p[4],'default_visibility'=>'super_admin_only','available_actions'=>json_encode(['view','create','edit','delete','approve','reject','print','reprint','export','change_status','refund','cancel','complete']),'available_columns'=>json_encode([]),'available_row_scopes'=>json_encode(['own_records','own_branch','selected_branches','all_records']),'dashboard_widget_support'=>true,'enabled'=>true,'updated_at'=>now(),'created_at'=>now()]);
        $statuses=['preorder_submitted'=>'PreOrder Submitted','verification_pending'=>'Verification Pending','advance_payment_pending'=>'Advance Payment Pending','payment_submitted'=>'Payment Submitted','payment_verified'=>'Payment Verified','supplier_confirmation_pending'=>'Supplier Confirmation Pending','supplier_confirmed'=>'Supplier Confirmed','processing'=>'Processing','product_shipped_to_store'=>'Product Shipped to Store','product_arrived'=>'Product Arrived','ready_for_delivery'=>'Ready for Delivery','partially_paid'=>'Partially Paid','fully_paid'=>'Fully Paid','delivered'=>'Delivered','completed'=>'Completed','cancel_requested'=>'Cancel Requested','cancelled'=>'Cancelled','rejected'=>'Rejected'];
        $i=0; foreach($statuses as $k=>$n) DB::table('preorder_statuses')->updateOrInsert(['key'=>$k],['name'=>$n,'sort_order'=>++$i,'enabled'=>true,'customer_visible'=>true,'updated_at'=>now(),'created_at'=>now()]);
    }
    public function down(): void { foreach(['access_rules_v12','access_pages','barcode_print_logs','preorder_status_history','customer_preorders','preorder_statuses','web_order_payments'] as $t) Schema::dropIfExists($t); }
};
