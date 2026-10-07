<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('used_purchases', function (Blueprint $table) {
            if (!Schema::hasColumn('used_purchases', 'nid_photo_path')) {
                $table->string('nid_photo_path')->nullable()->after('customer_nid');
            }

            if (!Schema::hasColumn('used_purchases', 'customer_product_photo_path')) {
                $table->string('customer_product_photo_path')->nullable()->after('nid_photo_path');
            }

            if (!Schema::hasColumn('used_purchases', 'product_image_paths')) {
                $table->json('product_image_paths')->nullable()->after('customer_product_photo_path');
            }
        });
    }

    public function down(): void
    {
        Schema::table('used_purchases', function (Blueprint $table) {
            if (Schema::hasColumn('used_purchases', 'product_image_paths')) {
                $table->dropColumn('product_image_paths');
            }

            if (Schema::hasColumn('used_purchases', 'customer_product_photo_path')) {
                $table->dropColumn('customer_product_photo_path');
            }

            if (Schema::hasColumn('used_purchases', 'nid_photo_path')) {
                $table->dropColumn('nid_photo_path');
            }
        });
    }
};
