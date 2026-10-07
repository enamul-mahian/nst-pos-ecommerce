<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('used_purchases')) {
            Schema::table('used_purchases', function (Blueprint $table) {
                $columns = [
                    'category_id' => fn () => $table->unsignedBigInteger('category_id')->nullable(),
                    'model_number' => fn () => $table->string('model_number')->nullable(),
                    'color_name' => fn () => $table->string('color_name')->nullable(),
                    'region' => fn () => $table->string('region')->nullable(),
                    'sim_network' => fn () => $table->string('sim_network')->nullable(),
                    'ram' => fn () => $table->string('ram')->nullable(),
                    'storage' => fn () => $table->string('storage')->nullable(),
                    'activation_status' => fn () => $table->string('activation_status', 40)->nullable(),
                    'box_included' => fn () => $table->boolean('box_included')->nullable(),
                    'physical_condition' => fn () => $table->string('physical_condition')->nullable(),
                    'condition_grade' => fn () => $table->string('condition_grade')->nullable(),
                    'market_price' => fn () => $table->decimal('market_price', 14, 2)->nullable(),
                    'minimum_booking_type' => fn () => $table->string('minimum_booking_type', 20)->default('percentage'),
                    'minimum_booking_value' => fn () => $table->decimal('minimum_booking_value', 14, 2)->default(10),
                    'emi_available' => fn () => $table->boolean('emi_available')->default(true),
                    'allow_preorder' => fn () => $table->boolean('allow_preorder')->default(false),
                    'website_published' => fn () => $table->boolean('website_published')->default(true),
                    'official_warranty' => fn () => $table->string('official_warranty')->nullable(),
                    'shop_warranty' => fn () => $table->string('shop_warranty')->nullable(),
                    'warranty_duration' => fn () => $table->string('warranty_duration')->nullable(),
                    'warranty_notes' => fn () => $table->text('warranty_notes')->nullable(),
                    'whats_in_box' => fn () => $table->text('whats_in_box')->nullable(),
                    'ready_variant_id' => fn () => $table->unsignedBigInteger('ready_variant_id')->nullable()->index(),
                    'ready_device_unit_id' => fn () => $table->unsignedBigInteger('ready_device_unit_id')->nullable()->index(),
                ];
                foreach ($columns as $name => $definition) {
                    if (! Schema::hasColumn('used_purchases', $name)) {
                        $definition();
                    }
                }
            });
        }

        if (Schema::hasTable('device_units') && ! Schema::hasColumn('device_units', 'used_purchase_id')) {
            Schema::table('device_units', function (Blueprint $table) {
                $table->unsignedBigInteger('used_purchase_id')->nullable()->index();
            });
        }

        if (Schema::hasTable('users') && ! Schema::hasColumn('users', 'website_registered_at')) {
            Schema::table('users', function (Blueprint $table) {
                $table->timestamp('website_registered_at')->nullable()->index();
            });
        }

        if (Schema::hasTable('users') && Schema::hasTable('customers') && Schema::hasColumn('users', 'website_registered_at')) {
            $registeredUserIds = DB::table('customers')
                ->whereIn('source', ['website_registration', 'checkout_registration'])
                ->whereNotNull('user_id')
                ->pluck('user_id');

            if ($registeredUserIds->isNotEmpty()) {
                DB::table('users')->whereIn('id', $registeredUserIds)->whereNull('website_registered_at')->update([
                    'website_registered_at' => now(),
                ]);
            }
        }

        if (Schema::hasTable('products') && Schema::hasColumn('products', 'website_published')) {
            DB::table('products')
                ->where(function ($query) {
                    $query->whereNull('status')->orWhereIn('status', ['active', 'in_stock', 'available', 'out_of_stock']);
                })
                ->where(function ($query) {
                    $query->whereNull('condition')->orWhereIn('condition', ['new', 'used', 'pre_owned', 'refurbished']);
                })
                ->update(['website_published' => true]);
        }
    }

    public function down(): void
    {
        // Data-safe rollback: columns and product publish choices are intentionally preserved.
    }
};
