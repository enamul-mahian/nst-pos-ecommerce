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
                $table->longText('state');
                $table->unsignedInteger('version')->default(1);
                $table->string('state_hash', 64)->nullable()->index();
                $table->timestamp('last_saved_at')->nullable()->index();
                $table->string('created_ip', 60)->nullable();
                $table->text('user_agent')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
                $table->index(['updated_at']);
            });
        } else {
            Schema::table('dashboard_stage1_states', function (Blueprint $table) {
                if (! Schema::hasColumn('dashboard_stage1_states', 'state_hash')) {
                    $table->string('state_hash', 64)->nullable()->after('version')->index('dash_stage1_state_hash_idx');
                }
                if (! Schema::hasColumn('dashboard_stage1_states', 'last_saved_at')) {
                    $table->timestamp('last_saved_at')->nullable()->after('state_hash')->index('dash_stage1_last_saved_idx');
                }
                if (! Schema::hasColumn('dashboard_stage1_states', 'created_ip')) {
                    $table->string('created_ip', 60)->nullable()->after('last_saved_at');
                }
                if (! Schema::hasColumn('dashboard_stage1_states', 'user_agent')) {
                    $table->text('user_agent')->nullable()->after('created_ip');
                }
            });
        }

        if (! Schema::hasTable('dashboard_stage1_state_history')) {
            Schema::create('dashboard_stage1_state_history', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('state_id')->index();
                $table->unsignedBigInteger('user_id')->index();
                $table->unsignedInteger('version')->index();
                $table->string('state_hash', 64)->nullable()->index();
                $table->string('action', 80)->default('dashboard_stage1_state_saved')->index();
                $table->longText('snapshot');
                $table->longText('previous_snapshot')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamp('created_at')->nullable()->index();
                $table->unique(['state_id', 'version'], 'dash_stage1_hist_state_version_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_stage1_state_history');

        if (Schema::hasTable('dashboard_stage1_states')) {
            Schema::table('dashboard_stage1_states', function (Blueprint $table) {
                foreach (['state_hash', 'last_saved_at', 'created_ip', 'user_agent'] as $column) {
                    if (Schema::hasColumn('dashboard_stage1_states', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
