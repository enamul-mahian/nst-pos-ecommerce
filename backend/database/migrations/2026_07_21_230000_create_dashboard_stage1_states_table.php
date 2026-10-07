<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('dashboard_stage1_states')) {
            Schema::create('dashboard_stage1_states', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->unique();
                $table->json('state');
                $table->unsignedInteger('version')->default(1);
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
                $table->index(['updated_at']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_stage1_states');
    }
};
