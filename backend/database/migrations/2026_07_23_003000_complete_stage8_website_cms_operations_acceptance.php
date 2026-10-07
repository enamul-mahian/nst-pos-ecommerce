<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->extendPagesTable();
        $this->createPageSectionsTable();
        $this->createComponentRegistryTable();
        $this->createContentVersionsTable();
        $this->createSiteSettingsTable();
        $this->createOperationLogsTable();
        $this->seedDefaultSiteSettings();
    }

    private function extendPagesTable(): void
    {
        if (!Schema::hasTable('nst_cms_pages')) {
            return;
        }

        Schema::table('nst_cms_pages', function (Blueprint $table) {
            if (!Schema::hasColumn('nst_cms_pages', 'current_version_id')) {
                $table->unsignedBigInteger('current_version_id')->nullable()->after('published_by');
            }
            if (!Schema::hasColumn('nst_cms_pages', 'draft_version_id')) {
                $table->unsignedBigInteger('draft_version_id')->nullable()->after('current_version_id');
            }
            if (!Schema::hasColumn('nst_cms_pages', 'content_hash')) {
                $table->string('content_hash', 80)->nullable()->after('settings');
            }
            if (!Schema::hasColumn('nst_cms_pages', 'preview_token')) {
                $table->string('preview_token', 100)->nullable()->after('content_hash')->index('cms_pages_preview_token_idx');
            }
        });
    }

    private function createPageSectionsTable(): void
    {
        if (!Schema::hasTable('nst_cms_page_sections')) {
            Schema::create('nst_cms_page_sections', function (Blueprint $table) {
                $table->id();
                $table->foreignId('page_id')->constrained('nst_cms_pages')->cascadeOnDelete();
                $table->string('section_key', 120);
                $table->string('component_id', 160);
                $table->string('component_type', 100)->default('section');
                $table->string('title')->nullable();
                $table->longText('published_content')->nullable();
                $table->longText('draft_content')->nullable();
                $table->json('responsive_settings')->nullable();
                $table->json('effect_settings')->nullable();
                $table->boolean('is_visible')->default(true);
                $table->unsignedInteger('sort_order')->default(0);
                $table->enum('status', ['draft', 'published', 'hidden'])->default('draft');
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->unique(['page_id', 'component_id'], 'cms_sections_page_component_uniq');
                $table->index(['page_id', 'status', 'sort_order'], 'cms_sections_page_status_sort_idx');
            });
        }
    }

    private function createComponentRegistryTable(): void
    {
        if (!Schema::hasTable('nst_cms_component_registry')) {
            Schema::create('nst_cms_component_registry', function (Blueprint $table) {
                $table->id();
                $table->foreignId('page_id')->nullable()->constrained('nst_cms_pages')->cascadeOnDelete();
                $table->string('component_id', 160);
                $table->string('component_type', 100)->default('section');
                $table->string('display_name')->nullable();
                $table->string('selector_path')->nullable();
                $table->json('editable_fields')->nullable();
                $table->json('current_value')->nullable();
                $table->json('draft_value')->nullable();
                $table->boolean('is_visible')->default(true);
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->unique(['page_id', 'component_id'], 'cms_components_page_component_uniq');
                $table->index(['component_type', 'is_visible'], 'cms_components_type_visible_idx');
            });
        }
    }

    private function createContentVersionsTable(): void
    {
        if (!Schema::hasTable('nst_cms_content_versions')) {
            Schema::create('nst_cms_content_versions', function (Blueprint $table) {
                $table->id();
                $table->string('resource_type', 60)->default('page');
                $table->unsignedBigInteger('resource_id')->nullable();
                $table->unsignedInteger('version_no')->default(1);
                $table->enum('status', ['draft', 'preview', 'published', 'rollback'])->default('draft');
                $table->longText('payload');
                $table->string('content_hash', 80);
                $table->string('preview_token', 100)->nullable()->index('cms_versions_preview_token_idx');
                $table->text('change_note')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('published_at')->nullable();
                $table->unsignedBigInteger('rollback_of_id')->nullable();
                $table->timestamps();
                $table->unique(['resource_type', 'resource_id', 'version_no'], 'cms_versions_resource_version_uniq');
                $table->index(['resource_type', 'resource_id', 'status'], 'cms_versions_resource_status_idx');
            });
        }
    }

    private function createSiteSettingsTable(): void
    {
        if (!Schema::hasTable('nst_cms_site_settings')) {
            Schema::create('nst_cms_site_settings', function (Blueprint $table) {
                $table->id();
                $table->string('scope', 80)->default('global');
                $table->string('setting_key', 120);
                $table->json('draft_value')->nullable();
                $table->json('published_value')->nullable();
                $table->enum('status', ['draft', 'published'])->default('draft');
                $table->unsignedInteger('version_no')->default(1);
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('published_at')->nullable();
                $table->timestamps();
                $table->unique(['scope', 'setting_key'], 'cms_settings_scope_key_uniq');
            });
        }
    }

    private function createOperationLogsTable(): void
    {
        if (!Schema::hasTable('nst_cms_operation_logs')) {
            Schema::create('nst_cms_operation_logs', function (Blueprint $table) {
                $table->id();
                $table->string('action', 120);
                $table->string('resource_type', 80)->nullable();
                $table->unsignedBigInteger('resource_id')->nullable();
                $table->longText('before_payload')->nullable();
                $table->longText('after_payload')->nullable();
                $table->json('metadata')->nullable();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->index(['action', 'resource_type'], 'cms_ops_action_resource_idx');
            });
        }
    }

    private function seedDefaultSiteSettings(): void
    {
        if (!Schema::hasTable('nst_cms_site_settings')) {
            return;
        }

        $now = now();
        foreach ([
            'theme' => ['primary' => '#7C3AED', 'surface' => '#FFFFFF', 'text' => '#111827', 'mode' => 'light'],
            'seo_defaults' => ['robots' => 'index,follow', 'twitter_card' => 'summary_large_image'],
            'editing_policy' => ['workflow' => 'draft_preview_publish_rollback', 'server_source_of_truth' => true, 'super_admin_publish' => true],
        ] as $key => $value) {
            DB::table('nst_cms_site_settings')->updateOrInsert(
                ['scope' => 'global', 'setting_key' => $key],
                [
                    'draft_value' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'published_value' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'status' => 'published',
                    'version_no' => 1,
                    'updated_at' => $now,
                    'created_at' => $now,
                    'published_at' => $now,
                ]
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('nst_cms_operation_logs');
        Schema::dropIfExists('nst_cms_site_settings');
        Schema::dropIfExists('nst_cms_content_versions');
        Schema::dropIfExists('nst_cms_component_registry');
        Schema::dropIfExists('nst_cms_page_sections');
    }
};
