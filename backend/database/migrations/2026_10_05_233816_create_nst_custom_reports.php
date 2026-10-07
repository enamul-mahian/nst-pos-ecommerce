<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('nst_custom_reports')) {
            Schema::create('nst_custom_reports', function (Blueprint $table) {
                $table->id();
                $table->string('name', 180);
                $table->string('source', 60);
                $table->json('columns')->nullable();
                $table->json('filters')->nullable();
                $table->json('group_by')->nullable();
                $table->json('sorting')->nullable();
                $table->json('summary_fields')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->boolean('is_shared')->default(false);
                $table->timestamps();

                $table->index(['source','created_by']);
            });
        }
    }

    public function down(): void
    {
        // Non-destructive intentionally.
    }
};
