<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            if (!Schema::hasColumn('products', 'meta_title')) {
                $table->string('meta_title')->nullable()->after('description');
            }

            if (!Schema::hasColumn('products', 'meta_description')) {
                $table->text('meta_description')->nullable()->after('meta_title');
            }

            if (!Schema::hasColumn('products', 'short_description')) {
                $table->text('short_description')->nullable()->after('description');
            }

            if (!Schema::hasColumn('products', 'key_features')) {
                $table->json('key_features')->nullable()->after('short_description');
            }

            if (!Schema::hasColumn('products', 'regular_price')) {
                $table->decimal('regular_price', 12, 2)->nullable()->after('sale_price');
            }

            if (!Schema::hasColumn('products', 'minimum_booking_amount')) {
                $table->decimal('minimum_booking_amount', 12, 2)->nullable()->after('discount_price');
            }

            if (!Schema::hasColumn('products', 'purchase_points')) {
                $table->integer('purchase_points')->default(0)->after('minimum_booking_amount');
            }

            if (!Schema::hasColumn('products', 'emi_monthly_amount')) {
                $table->decimal('emi_monthly_amount', 12, 2)->nullable()->after('purchase_points');
            }

            if (!Schema::hasColumn('products', 'warranty')) {
                $table->string('warranty')->nullable()->after('status');
            }

            if (!Schema::hasColumn('products', 'estimated_delivery')) {
                $table->string('estimated_delivery')->nullable()->after('warranty');
            }

            if (!Schema::hasColumn('products', 'specifications')) {
                $table->json('specifications')->nullable()->after('estimated_delivery');
            }

            if (!Schema::hasColumn('products', 'faqs')) {
                $table->json('faqs')->nullable()->after('specifications');
            }
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $columns = [
                'meta_title',
                'meta_description',
                'short_description',
                'key_features',
                'regular_price',
                'minimum_booking_amount',
                'purchase_points',
                'emi_monthly_amount',
                'warranty',
                'estimated_delivery',
                'specifications',
                'faqs',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('products', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};