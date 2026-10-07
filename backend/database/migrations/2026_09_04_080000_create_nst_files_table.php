<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (Schema::hasTable('nst_files')) return;
        Schema::create('nst_files', function (Blueprint $table) {
            $table->id();
            $table->string('title', 190);
            $table->text('description')->nullable();
            $table->string('category', 80)->default('general');
            $table->string('file_path')->nullable();
            $table->string('external_url', 2000)->nullable();
            $table->string('icon_url', 2000)->nullable();
            $table->string('version', 80)->nullable();
            $table->longText('changelog')->nullable();
            $table->string('checksum', 128)->nullable();
            $table->unsignedBigInteger('file_size')->default(0);
            $table->unsignedBigInteger('download_count')->default(0);
            $table->string('status', 20)->default('draft')->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('published_at')->nullable();
            $table->timestamp('archived_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('nst_files');
    }
};