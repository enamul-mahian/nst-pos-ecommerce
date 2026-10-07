<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('access_rule_history_v12')) {
            Schema::create('access_rule_history_v12', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('access_page_id')->index();
                $table->string('subject_type', 30);
                $table->unsignedBigInteger('subject_id')->nullable()->index();
                $table->string('visibility', 40);
                $table->json('actions')->nullable();
                $table->json('columns')->nullable();
                $table->string('row_scope', 60)->nullable();
                $table->json('selected_branches')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->unsignedBigInteger('changed_by')->nullable()->index();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('access_rule_history_v12');
    }
};
