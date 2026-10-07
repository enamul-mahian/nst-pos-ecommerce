<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('categories')) {
            Schema::create('categories', function (Blueprint $table) {
                $table->id();

                $table->foreignId('parent_id')
                    ->nullable()
                    ->constrained('categories')
                    ->nullOnDelete();

                $table->string('name');
                $table->string('slug')->unique();
                $table->text('description')->nullable();

                $table->string('image')->nullable();
                $table->string('icon')->nullable();

                $table->unsignedInteger('sort_order')->default(0);

                $table->enum('status', [
                    'active',
                    'inactive',
                ])->default('active');

                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();

                $table->timestamps();
                $table->softDeletes();

                $table->index('parent_id');
                $table->index('status');
                $table->index('sort_order');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('categories');
    }
};