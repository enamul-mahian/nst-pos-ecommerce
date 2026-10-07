<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('device_units')) {
            return;
        }

        Schema::create('device_units', function (Blueprint $table) {
            $table->id();

            $table->unsignedBigInteger('purchase_id')->nullable();
            $table->unsignedBigInteger('purchase_item_id')->nullable();

            $table->unsignedBigInteger('supplier_id')->nullable();
            $table->unsignedBigInteger('branch_id')->nullable();
            $table->unsignedBigInteger('product_id')->nullable();

            $table->string('product_name')->nullable();
            $table->string('sku')->nullable();

            /*
            |--------------------------------------------------------------------------
            | IMEI & Barcode
            |--------------------------------------------------------------------------
            | imei_1 and imei_2 are stored separately.
            | barcode is the NST system-generated or manual main barcode.
            | imei_1_barcode and imei_2_barcode can be used as separate barcode labels.
            */
            $table->string('imei_1')->nullable()->unique();
            $table->string('imei_2')->nullable()->unique();

            $table->string('barcode')->nullable()->unique();
            $table->string('imei_1_barcode')->nullable()->unique();
            $table->string('imei_2_barcode')->nullable()->unique();

            $table->string('barcode_source')->default('auto'); // auto/manual
            $table->boolean('is_barcode_printed')->default(false);
            $table->timestamp('barcode_printed_at')->nullable();

            /*
            |--------------------------------------------------------------------------
            | Cost / Status
            |--------------------------------------------------------------------------
            */
            $table->decimal('purchase_cost', 15, 2)->default(0);
            $table->decimal('selling_price', 15, 2)->default(0);

            $table->string('status')->default('available');
            /*
                available
                sold
                returned
                damaged
                supplier_return
                warranty_claim
                reserved
            */

            /*
            |--------------------------------------------------------------------------
            | Sale / Return Future Tracking
            |--------------------------------------------------------------------------
            */
            $table->unsignedBigInteger('sale_id')->nullable();
            $table->unsignedBigInteger('sale_item_id')->nullable();

            $table->timestamp('sold_at')->nullable();
            $table->timestamp('returned_at')->nullable();

            $table->string('return_reason')->nullable();
            $table->text('return_note')->nullable();

            $table->text('note')->nullable();

            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('updated_by')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->index('purchase_id');
            $table->index('purchase_item_id');
            $table->index('supplier_id');
            $table->index('branch_id');
            $table->index('product_id');
            $table->index('sku');
            $table->index('status');
            $table->index('sale_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('device_units');
    }
};