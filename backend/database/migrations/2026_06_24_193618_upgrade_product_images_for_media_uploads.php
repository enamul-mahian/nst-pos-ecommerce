<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_images', function (Blueprint $table) {
            if (!Schema::hasColumn('product_images', 'media_type')) {
                $table->enum('media_type', ['image', 'video'])->default('image')->after('product_id');
            }

            if (!Schema::hasColumn('product_images', 'thumbnail_path')) {
                $table->string('thumbnail_path')->nullable()->after('image_path');
            }

            if (!Schema::hasColumn('product_images', 'original_name')) {
                $table->string('original_name')->nullable()->after('thumbnail_path');
            }

            if (!Schema::hasColumn('product_images', 'mime_type')) {
                $table->string('mime_type')->nullable()->after('original_name');
            }

            if (!Schema::hasColumn('product_images', 'size_kb')) {
                $table->unsignedInteger('size_kb')->default(0)->after('mime_type');
            }

            if (!Schema::hasColumn('product_images', 'processed_size_kb')) {
                $table->unsignedInteger('processed_size_kb')->default(0)->after('size_kb');
            }
        });
    }

    public function down(): void
    {
        Schema::table('product_images', function (Blueprint $table) {
            $columns = [
                'media_type',
                'thumbnail_path',
                'original_name',
                'mime_type',
                'size_kb',
                'processed_size_kb',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('product_images', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};