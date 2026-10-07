<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasTable('dashboard_access_profiles')) {
            Schema::create('dashboard_access_profiles', function (Blueprint $table) {
                $table->id();
                $table->string('subject_type', 20); // role|user
                $table->unsignedBigInteger('subject_id');
                $table->json('widgets')->nullable();
                $table->json('widget_order')->nullable();
                $table->string('data_scope', 40)->default('own_branch');
                $table->json('selected_branches')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
                $table->unique(['subject_type', 'subject_id'], 'dashboard_profile_subject_unique');
            });
        }

        foreach ([
            ['key' => 'dashboard', 'name' => 'Dashboard', 'module' => 'dashboard', 'route' => '/dashboard'],
        ] as $page) {
            if (Schema::hasTable('access_pages')) {
                DB::table('access_pages')->updateOrInsert(['page_key' => $page['key']], [
                    'page_name' => $page['name'], 'module' => $page['module'], 'route' => $page['route'],
                    'sidebar_group' => 'Main', 'default_visibility' => 'super_admin_only',
                    'available_actions' => json_encode(['view','configure_widgets']),
                    'available_columns' => json_encode([]), 'available_row_scopes' => json_encode(['own_branch','selected_branches','all_branches','all_records']),
                    'dashboard_widget_support' => true, 'updated_at' => now(), 'created_at' => now(),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('dashboard_access_profiles');
    }
};
