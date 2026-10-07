<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('dashboard_theme_versions', function (Blueprint $table) {
            $table->id();
            $table->string('theme_id', 80)->default('nst-01');
            $table->string('name', 150);
            $table->string('status', 20)->default('draft')->index();
            $table->json('theme_payload');
            $table->json('available_theme_ids')->nullable();
            $table->boolean('is_default')->default(false)->index();
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->unsignedBigInteger('published_by')->nullable()->index();
            $table->timestamp('published_at')->nullable();
            $table->unsignedBigInteger('source_version_id')->nullable()->index();
            $table->timestamps();
        });

        Schema::create('dashboard_theme_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('dashboard_theme_version_id')->index();
            $table->string('assignable_type', 30)->index();
            $table->string('assignable_key', 120)->index();
            $table->unsignedBigInteger('branch_id')->nullable()->index();
            $table->boolean('enabled')->default(true)->index();
            $table->timestamps();
            $table->unique(['dashboard_theme_version_id', 'assignable_type', 'assignable_key', 'branch_id'], 'dashboard_theme_assignment_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_theme_assignments');
        Schema::dropIfExists('dashboard_theme_versions');
    }
};
