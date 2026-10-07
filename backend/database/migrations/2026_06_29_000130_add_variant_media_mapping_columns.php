<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('product_variants')) {
            Schema::table('product_variants', function (Blueprint $table) {
                if (! Schema::hasColumn('product_variants', 'variant_key')) {
                    $table->string('variant_key')->nullable()->after('product_id');
                    $table->index('variant_key');
                }

                if (! Schema::hasColumn('product_variants', 'variant_images')) {
                    $table->json('variant_images')->nullable()->after('battery_health');
                }
            });
        }

        if (Schema::hasTable('product_images')) {
            Schema::table('product_images', function (Blueprint $table) {
                if (! Schema::hasColumn('product_images', 'product_variant_id')) {
                    $table->unsignedBigInteger('product_variant_id')->nullable()->after('product_id');
                    $table->index('product_variant_id');
                }

                if (! Schema::hasColumn('product_images', 'variant_key')) {
                    $table->string('variant_key')->nullable()->after('product_variant_id');
                    $table->index('variant_key');
                }
            });
        }
    }

    public function down(): void
    {
        // Safe rollback disabled to protect existing product media and variant data.
    }
};
