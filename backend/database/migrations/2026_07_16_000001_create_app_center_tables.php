<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::create('app_center_apps', function (Blueprint $table) {
            $table->id(); $table->string('name'); $table->string('slug')->unique();
            $table->string('package_name')->nullable()->unique(); $table->string('category')->nullable();
            $table->string('developer')->nullable(); $table->text('short_description')->nullable();
            $table->longText('description')->nullable(); $table->string('icon_path')->nullable();
            $table->string('banner_path')->nullable(); $table->json('screenshots')->nullable();
            $table->string('play_store_url')->nullable(); $table->string('website_url')->nullable();
            $table->decimal('rating',3,2)->default(0); $table->boolean('is_featured')->default(false);
            $table->boolean('is_active')->default(true); $table->unsignedBigInteger('downloads')->default(0);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete(); $table->timestamps();
        });
        Schema::create('app_center_releases', function (Blueprint $table) {
            $table->id(); $table->foreignId('app_id')->constrained('app_center_apps')->cascadeOnDelete();
            $table->string('version_name'); $table->unsignedInteger('version_code');
            $table->unsignedSmallInteger('min_android')->default(7); $table->unsignedSmallInteger('target_android')->nullable();
            $table->string('apk_path')->nullable(); $table->unsignedBigInteger('file_size')->default(0);
            $table->string('sha256',64)->nullable(); $table->string('md5',32)->nullable();
            $table->string('scan_status')->default('pending'); $table->text('scan_notes')->nullable();
            $table->longText('changelog')->nullable(); $table->string('status')->default('draft');
            $table->timestamp('published_at')->nullable(); $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps(); $table->unique(['app_id','version_code']);
        });
        Schema::create('apk_build_requests', function (Blueprint $table) {
            $table->id(); $table->foreignId('app_id')->nullable()->constrained('app_center_apps')->nullOnDelete();
            $table->uuid('build_token')->unique(); $table->string('status')->default('queued');
            $table->json('configuration'); $table->longText('build_log')->nullable();
            $table->string('artifact_path')->nullable(); $table->string('sha256',64)->nullable();
            $table->timestamp('started_at')->nullable(); $table->timestamp('finished_at')->nullable();
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete(); $table->timestamps();
        });
    }
    public function down(): void { Schema::dropIfExists('apk_build_requests'); Schema::dropIfExists('app_center_releases'); Schema::dropIfExists('app_center_apps'); }
};