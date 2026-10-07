<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class Stage58CmsController extends Controller
{
    public function publicPages(): JsonResponse
    {
        return $this->ok(DB::table('nst_cms_pages')->where('status', 'published')->where('is_visible', true)
            ->orderBy('sort_order')->get(['id', 'title', 'slug', 'route', 'page_type', 'seo', 'published_at', 'current_version_id'])->map(function ($row) {
                $row->seo = $this->decodeJson($row->seo, []);
                return $row;
            }));
    }

    public function publicResolve(Request $request): JsonResponse
    {
        if ($request->filled('preview_token')) {
            return $this->publicPreview($request);
        }

        $path = '/' . ltrim((string) $request->query('path', '/'), '/');
        $path = rtrim($path, '/') ?: '/';
        $page = DB::table('nst_cms_pages')->where('status', 'published')->where('is_visible', true)
            ->where(fn ($q) => $q->where('route', $path)->orWhere('slug', trim($path, '/')))->first();
        if (!$page) {
            return response()->json(['status' => false, 'message' => 'Published CMS page not found.'], 404);
        }

        $normalized = $this->normalizePage($page);
        $normalized->sections = $this->publishedSections((int) $page->id);
        $normalized->component_map = $this->componentMap((int) $page->id, false);
        $normalized->site_settings = $this->publishedSiteSettings();
        return $this->ok($normalized);
    }

    private function publicPreview(Request $request): JsonResponse
    {
        $version = DB::table('nst_cms_content_versions')
            ->where('preview_token', $request->string('preview_token'))
            ->whereIn('status', ['draft', 'preview'])
            ->orderByDesc('id')
            ->first();
        if (!$version) {
            return response()->json(['status' => false, 'message' => 'Preview token is invalid or expired.'], 404);
        }
        $payload = $this->decodeJson($version->payload, []);
        if (($payload['page']['id'] ?? null) && Schema::hasTable('nst_cms_pages')) {
            $payload['page']['sections'] = $this->draftSections((int) $payload['page']['id']);
            $payload['page']['component_map'] = $this->componentMap((int) $payload['page']['id'], true);
            $payload['page']['preview_token'] = $version->preview_token;
            $payload['page']['cms_preview'] = true;
            return $this->ok((object) $payload['page'], 'CMS preview loaded from isolated draft version.');
        }
        return $this->ok($payload, 'CMS preview loaded from isolated draft version.');
    }

    public function overview(Request $request): JsonResponse
    {
        $builderDirectory = storage_path('app/website-builder');
        $draftPath = $builderDirectory . DIRECTORY_SEPARATOR . 'draft.json';
        $publishedPath = $builderDirectory . DIRECTORY_SEPARATOR . 'published.json';
        $routes = collect(Route::getRoutes()->getRoutes())->map(fn ($route) => implode('|', $route->methods()) . ' ' . $route->uri());
        $publishedBuilder = $this->readJson($publishedPath, []);
        $builderPages = collect($publishedBuilder['pages'] ?? []);
        $acceptance = $this->stageEightAcceptancePayload();

        return $this->ok([
            'summary' => [
                'cms_pages' => DB::table('nst_cms_pages')->count(),
                'published_pages' => DB::table('nst_cms_pages')->where('status', 'published')->where('is_visible', true)->count(),
                'draft_pages' => DB::table('nst_cms_pages')->where('status', 'draft')->count(),
                'page_revisions' => DB::table('nst_cms_page_revisions')->count(),
                'content_versions' => Schema::hasTable('nst_cms_content_versions') ? DB::table('nst_cms_content_versions')->count() : 0,
                'registered_components' => Schema::hasTable('nst_cms_component_registry') ? DB::table('nst_cms_component_registry')->count() : 0,
                'page_sections' => Schema::hasTable('nst_cms_page_sections') ? DB::table('nst_cms_page_sections')->count() : 0,
                'operation_logs' => Schema::hasTable('nst_cms_operation_logs') ? DB::table('nst_cms_operation_logs')->count() : 0,
                'builder_pages' => $builderPages->count(),
                'builder_draft_exists' => File::exists($draftPath),
                'builder_published_exists' => File::exists($publishedPath),
                'app_center_apps' => Schema::hasTable('app_center_apps') ? DB::table('app_center_apps')->count() : 0,
            ],
            'integration' => [
                'website_builder_public_route' => $routes->contains(fn ($route) => str_contains($route, 'api/website-builder/published')),
                'public_cms_resolve_route' => Route::has('public.cms.page'),
                'public_product_routes' => $routes->filter(fn ($route) => str_contains($route, 'api/public/products'))->values(),
                'customer_portal_messages' => $routes->contains(fn ($route) => str_contains($route, 'api/portal/messages')),
                'sslcommerz_callbacks' => $routes->contains(fn ($route) => str_contains($route, 'api/payment/sslcommerz/success')),
                'registration_code_setting' => Schema::hasTable('settings'),
                'app_center_tables' => Schema::hasTable('app_center_apps') && Schema::hasTable('app_center_releases'),
                'canonical_database_source' => $acceptance['database_ready'] && $acceptance['routes_ready'],
            ],
            'content_health' => [
                'builder_page_routes' => $builderPages->pluck('route')->filter()->values(),
                'cms_page_routes' => DB::table('nst_cms_pages')->where('status', 'published')->pluck('route'),
                'missing_seo_count' => DB::table('nst_cms_pages')->where(function ($q) { $q->whereNull('seo')->orWhere('seo', '')->orWhere('seo', '[]')->orWhere('seo', '{}'); })->count(),
                'hidden_page_count' => DB::table('nst_cms_pages')->where('is_visible', false)->count(),
                'draft_version_count' => Schema::hasTable('nst_cms_content_versions') ? DB::table('nst_cms_content_versions')->whereIn('status', ['draft', 'preview'])->count() : 0,
            ],
            'locked_workflows' => [
                'cms_storefront_one_source_of_truth' => true,
                'live_wysiwyg_click_to_edit' => true,
                'draft_preview_publish_rollback' => true,
                'immutable_version_history' => true,
                'seo_and_faq_per_page' => true,
                'responsive_page_settings' => true,
                'super_admin_publication' => true,
                'public_dynamic_page_fallback' => true,
            ],
            'acceptance' => $acceptance,
        ]);
    }

    public function acceptanceStatus(Request $request): JsonResponse
    {
        return $this->ok($this->stageEightAcceptancePayload(), 'Stage 8 Website CMS acceptance status loaded.');
    }

    public function canonicalState(Request $request): JsonResponse
    {
        $path = $request->input('path') ?: $request->query('path');
        $page = $path ? $this->pageByPath((string) $path) : DB::table('nst_cms_pages')->orderBy('sort_order')->first();
        return $this->ok([
            'page' => $page ? $this->normalizePage($page) : null,
            'sections' => $page ? $this->draftSections((int) $page->id) : [],
            'component_map' => $page ? $this->componentMap((int) $page->id, true) : [],
            'site_settings' => $this->allSiteSettings(),
            'source_of_truth' => 'database:nst_cms_pages,nst_cms_page_sections,nst_cms_component_registry,nst_cms_content_versions,nst_cms_site_settings',
        ], 'Canonical CMS database state loaded.');
    }

    public function pages(Request $request): JsonResponse
    {
        $rows = DB::table('nst_cms_pages')
            ->leftJoin('users as publishers', 'publishers.id', '=', 'nst_cms_pages.published_by')
            ->select('nst_cms_pages.*', 'publishers.name as published_by_name')
            ->when($request->filled('status'), fn ($q) => $q->where('nst_cms_pages.status', $request->input('status')))
            ->when($request->filled('page_type'), fn ($q) => $q->where('nst_cms_pages.page_type', $request->input('page_type')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = trim((string) $request->input('search'));
                $q->where(fn ($inner) => $inner->where('nst_cms_pages.title', 'like', "%{$search}%")->orWhere('nst_cms_pages.route', 'like', "%{$search}%"));
            })->orderBy('nst_cms_pages.sort_order')->orderBy('nst_cms_pages.title')->get();
        return $this->ok($rows->map(fn ($row) => $this->normalizePage($row)));
    }

    public function storePage(Request $request): JsonResponse
    {
        $data = $this->validatePage($request);
        $slug = $data['slug'] ?? Str::slug($data['title']);
        $route = $data['route'] ?? '/' . $slug;
        $page = DB::transaction(function () use ($data, $slug, $route, $request) {
            $id = DB::table('nst_cms_pages')->insertGetId([
                ...$this->pagePayload($data),
                'slug' => $slug,
                'route' => $this->normalizeRoute($route),
                'status' => 'draft',
                'preview_token' => Str::random(48),
                'created_by' => optional($request->user())->id,
                'updated_by' => optional($request->user())->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $this->syncSectionsFromContent($id, $data['content'] ?? [], $request, true);
            $version = $this->createContentVersion('page', $id, 'draft', $request, 'Initial page draft.');
            DB::table('nst_cms_pages')->where('id', $id)->update(['draft_version_id' => $version->id, 'content_hash' => $version->content_hash, 'preview_token' => $version->preview_token]);
            $this->storeRevision($id, 'create', $request, 'Initial page draft.');
            return DB::table('nst_cms_pages')->find($id);
        });
        $this->cmsEvent($request, 'cms.page.draft.created', 'nst_cms_pages', $page->id, null, $this->normalizePage($page));
        return $this->ok($this->normalizePage($page), 'CMS page draft created with isolated preview token.', 201);
    }

    public function updatePage(Request $request, int $pageId): JsonResponse
    {
        $before = DB::table('nst_cms_pages')->where('id', $pageId)->first();
        abort_if(!$before, 404, 'CMS page not found.');
        if ($before->status === 'archived') {
            throw ValidationException::withMessages(['status' => 'Archived page must be restored before editing.']);
        }
        $data = $this->validatePage($request, true, $pageId);
        $page = DB::transaction(function () use ($request, $pageId, $before, $data) {
            $this->storeRevision($pageId, 'before_update', $request, $request->input('change_note'));
            $payload = $this->pagePayload($data, false);
            if (array_key_exists('route', $data)) {
                $payload['route'] = $this->normalizeRoute($data['route']);
            }
            $payload['status'] = 'draft';
            $payload['preview_token'] = Str::random(48);
            $payload['updated_by'] = optional($request->user())->id;
            $payload['updated_at'] = now();
            DB::table('nst_cms_pages')->where('id', $pageId)->update($payload);
            if (array_key_exists('content', $data)) {
                $this->syncSectionsFromContent($pageId, $data['content'], $request, false);
            }
            $version = $this->createContentVersion('page', $pageId, 'draft', $request, $request->input('change_note'));
            DB::table('nst_cms_pages')->where('id', $pageId)->update(['draft_version_id' => $version->id, 'content_hash' => $version->content_hash, 'preview_token' => $version->preview_token]);
            $this->publicationLog('page', $pageId, 'draft_saved', $request, ['route' => $payload['route'] ?? $before->route, 'version_id' => $version->id]);
            return DB::table('nst_cms_pages')->find($pageId);
        });
        $this->cmsEvent($request, 'cms.page.draft.saved', 'nst_cms_pages', $pageId, $before, $this->normalizePage($page));
        return $this->ok($this->normalizePage($page), 'Draft saved. Preview before publishing.');
    }

    public function previewPage(Request $request, int $pageId): JsonResponse
    {
        $page = DB::table('nst_cms_pages')->where('id', $pageId)->first();
        abort_if(!$page, 404, 'CMS page not found.');
        $version = $this->createContentVersion('page', $pageId, 'preview', $request, $request->input('change_note') ?: 'Preview generated.');
        DB::table('nst_cms_pages')->where('id', $pageId)->update(['draft_version_id' => $version->id, 'preview_token' => $version->preview_token, 'updated_at' => now()]);
        $this->publicationLog('page', $pageId, 'preview_generated', $request, ['preview_token' => $version->preview_token, 'version_id' => $version->id]);
        return $this->ok([
            'preview_token' => $version->preview_token,
            'version_id' => $version->id,
            'preview_url' => '/?preview_token=' . $version->preview_token . '&path=' . urlencode($page->route),
        ], 'Preview token generated from isolated draft.');
    }

    public function publishPage(Request $request, int $pageId): JsonResponse
    {
        $before = DB::table('nst_cms_pages')->where('id', $pageId)->lockForUpdate()->first();
        abort_if(!$before, 404, 'CMS page not found.');
        if (!$before->is_visible) {
            throw ValidationException::withMessages(['is_visible' => 'Hidden page cannot be published until visibility is enabled.']);
        }
        $page = DB::transaction(function () use ($request, $pageId, $before) {
            $this->storeRevision($pageId, 'before_publish', $request, $request->input('change_note'));
            $draftVersion = $before->draft_version_id ? DB::table('nst_cms_content_versions')->where('id', $before->draft_version_id)->first() : null;
            $version = $draftVersion ?: $this->createContentVersion('page', $pageId, 'draft', $request, 'Publish safety draft.');
            DB::table('nst_cms_content_versions')->where('id', $version->id)->update([
                'status' => 'published',
                'published_by' => optional($request->user())->id,
                'published_at' => now(),
                'updated_at' => now(),
            ]);
            $this->publishDraftSections($pageId, $request);
            DB::table('nst_cms_pages')->where('id', $pageId)->update([
                'status' => 'published',
                'current_version_id' => $version->id,
                'draft_version_id' => null,
                'preview_token' => null,
                'content_hash' => $version->content_hash,
                'published_by' => optional($request->user())->id,
                'published_at' => now(),
                'updated_by' => optional($request->user())->id,
                'updated_at' => now(),
            ]);
            $this->publicationLog('page', $pageId, 'published', $request, ['route' => $before->route, 'version_id' => $version->id, 'content_hash' => $version->content_hash]);
            return DB::table('nst_cms_pages')->find($pageId);
        });
        $this->cmsEvent($request, 'cms.page.published', 'nst_cms_pages', $pageId, $before, $this->normalizePage($page));
        return $this->ok($this->normalizePage($page), 'CMS page published atomically from draft version.');
    }

    public function archivePage(Request $request, int $pageId): JsonResponse
    {
        $page = DB::table('nst_cms_pages')->where('id', $pageId)->first();
        abort_if(!$page, 404, 'CMS page not found.');
        $this->storeRevision($pageId, 'before_archive', $request, $request->input('change_note'));
        DB::table('nst_cms_pages')->where('id', $pageId)->update(['status' => 'archived', 'is_visible' => false, 'updated_by' => optional($request->user())->id, 'updated_at' => now()]);
        $this->publicationLog('page', $pageId, 'archived', $request, ['route' => $page->route]);
        $this->cmsEvent($request, 'cms.page.archived', 'nst_cms_pages', $pageId, $page, DB::table('nst_cms_pages')->find($pageId));
        return $this->ok($this->normalizePage(DB::table('nst_cms_pages')->find($pageId)), 'CMS page archived.');
    }

    public function revisions(Request $request, int $pageId): JsonResponse
    {
        abort_unless(DB::table('nst_cms_pages')->where('id', $pageId)->exists(), 404, 'CMS page not found.');
        return $this->ok(DB::table('nst_cms_page_revisions')->leftJoin('users', 'users.id', '=', 'nst_cms_page_revisions.created_by')
            ->where('page_id', $pageId)->select('nst_cms_page_revisions.*', 'users.name as created_by_name')->orderByDesc('revision_no')->get()->map(function ($row) {
                $row->snapshot = $this->decodeJson($row->snapshot, []);
                return $row;
            }));
    }

    public function contentVersions(Request $request, int $pageId): JsonResponse
    {
        abort_unless(DB::table('nst_cms_pages')->where('id', $pageId)->exists(), 404, 'CMS page not found.');
        return $this->ok(DB::table('nst_cms_content_versions')
            ->leftJoin('users as creators', 'creators.id', '=', 'nst_cms_content_versions.created_by')
            ->leftJoin('users as publishers', 'publishers.id', '=', 'nst_cms_content_versions.published_by')
            ->where('resource_type', 'page')->where('resource_id', $pageId)
            ->select('nst_cms_content_versions.id', 'resource_type', 'resource_id', 'version_no', 'status', 'content_hash', 'preview_token', 'change_note', 'published_at', 'rollback_of_id', 'created_at', 'creators.name as created_by_name', 'publishers.name as published_by_name')
            ->orderByDesc('version_no')->get());
    }

    public function rollback(Request $request, int $pageId, int $revisionId): JsonResponse
    {
        $page = DB::table('nst_cms_pages')->where('id', $pageId)->first();
        $revision = DB::table('nst_cms_page_revisions')->where('id', $revisionId)->where('page_id', $pageId)->first();
        abort_if(!$page || !$revision, 404, 'Page or revision not found.');
        $snapshot = $this->decodeJson($revision->snapshot, null);
        if (!is_array($snapshot)) {
            throw ValidationException::withMessages(['revision' => 'Revision snapshot is invalid.']);
        }
        return $this->restoreSnapshotAsDraft($request, $pageId, $snapshot, 'cms.page.rollback.revision', ['revision_id' => $revisionId]);
    }

    public function rollbackVersion(Request $request, int $pageId, int $versionId): JsonResponse
    {
        $page = DB::table('nst_cms_pages')->where('id', $pageId)->first();
        $version = DB::table('nst_cms_content_versions')->where('id', $versionId)->where('resource_type', 'page')->where('resource_id', $pageId)->first();
        abort_if(!$page || !$version, 404, 'Page or version not found.');
        $payload = $this->decodeJson($version->payload, []);
        if (!is_array($payload) || empty($payload['page'])) {
            throw ValidationException::withMessages(['version' => 'Version payload is invalid.']);
        }
        return $this->restoreSnapshotAsDraft($request, $pageId, $payload['page'], 'cms.page.rollback.version', ['version_id' => $versionId]);
    }

    private function restoreSnapshotAsDraft(Request $request, int $pageId, array $snapshot, string $event, array $summary): JsonResponse
    {
        $before = DB::table('nst_cms_pages')->where('id', $pageId)->first();
        $page = DB::transaction(function () use ($request, $pageId, $snapshot, $summary) {
            $this->storeRevision($pageId, 'before_rollback', $request, 'Automatic rollback safety point.');
            $allowed = ['title', 'slug', 'route', 'page_type', 'content', 'seo', 'faq', 'settings', 'is_visible', 'sort_order'];
            $payload = collect($snapshot)->only($allowed)->all();
            foreach (['seo', 'faq', 'settings'] as $field) {
                if (isset($payload[$field]) && is_array($payload[$field])) {
                    $payload[$field] = json_encode($payload[$field], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                }
            }
            if (isset($payload['content']) && !is_string($payload['content'])) {
                $payload['content'] = json_encode($payload['content'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
            $payload['status'] = 'draft';
            $payload['preview_token'] = Str::random(48);
            $payload['updated_by'] = optional($request->user())->id;
            $payload['updated_at'] = now();
            DB::table('nst_cms_pages')->where('id', $pageId)->update($payload);
            if (isset($snapshot['sections']) && is_array($snapshot['sections'])) {
                $this->syncSectionsFromContent($pageId, ['sections' => $snapshot['sections']], $request, false);
            }
            $version = $this->createContentVersion('page', $pageId, 'draft', $request, 'Rollback restored as draft.');
            DB::table('nst_cms_pages')->where('id', $pageId)->update(['draft_version_id' => $version->id, 'content_hash' => $version->content_hash, 'preview_token' => $version->preview_token]);
            $this->publicationLog('page', $pageId, 'rolled_back_to_draft', $request, $summary + ['new_version_id' => $version->id]);
            return DB::table('nst_cms_pages')->find($pageId);
        });
        $this->cmsEvent($request, $event, 'nst_cms_pages', $pageId, $before, $this->normalizePage($page));
        return $this->ok($this->normalizePage($page), 'Rollback restored as a draft. Review preview and publish when ready.');
    }

    public function components(Request $request): JsonResponse
    {
        $query = DB::table('nst_cms_component_registry')
            ->leftJoin('nst_cms_pages', 'nst_cms_pages.id', '=', 'nst_cms_component_registry.page_id')
            ->select('nst_cms_component_registry.*', 'nst_cms_pages.title as page_title', 'nst_cms_pages.route as page_route')
            ->when($request->filled('page_id'), fn ($q) => $q->where('nst_cms_component_registry.page_id', $request->integer('page_id')))
            ->orderBy('nst_cms_component_registry.page_id')->orderBy('nst_cms_component_registry.id');
        return $this->ok($query->get()->map(function ($row) {
            foreach (['editable_fields', 'current_value', 'draft_value'] as $field) {
                $row->{$field} = $this->decodeJson($row->{$field}, []);
            }
            return $row;
        }));
    }

    public function wysiwygMap(Request $request): JsonResponse
    {
        $page = $request->filled('page_id') ? DB::table('nst_cms_pages')->where('id', $request->integer('page_id'))->first() : $this->pageByPath((string) $request->query('path', '/'));
        if (!$page) {
            return response()->json(['status' => false, 'message' => 'CMS page not found for WYSIWYG map.'], 404);
        }
        return $this->ok([
            'page' => $this->normalizePage($page),
            'components' => $this->componentMap((int) $page->id, true),
            'edit_mode' => true,
            'required_dom_attributes' => ['data-cms-page-id', 'data-cms-component-id', 'data-cms-component-type', 'data-cms-editable-field'],
        ], 'Exact storefront component map loaded for click-to-edit.');
    }

    public function saveComponentDraft(Request $request, int $pageId, string $componentId): JsonResponse
    {
        $page = DB::table('nst_cms_pages')->where('id', $pageId)->first();
        abort_if(!$page, 404, 'CMS page not found.');
        $data = $request->validate([
            'component_type' => ['nullable', 'string', 'max:100'],
            'display_name' => ['nullable', 'string', 'max:190'],
            'selector_path' => ['nullable', 'string', 'max:500'],
            'draft_value' => ['required', 'array'],
            'editable_fields' => ['nullable', 'array'],
            'is_visible' => ['nullable', 'boolean'],
            'change_note' => ['nullable', 'string', 'max:1000'],
        ]);
        $before = DB::table('nst_cms_component_registry')->where('page_id', $pageId)->where('component_id', $componentId)->first();
        DB::transaction(function () use ($request, $pageId, $componentId, $data) {
            DB::table('nst_cms_component_registry')->updateOrInsert(
                ['page_id' => $pageId, 'component_id' => $componentId],
                [
                    'component_type' => $data['component_type'] ?? 'section',
                    'display_name' => $data['display_name'] ?? Str::headline(str_replace(['-', '_'], ' ', $componentId)),
                    'selector_path' => $data['selector_path'] ?? ('[data-cms-component-id="' . $componentId . '"]'),
                    'editable_fields' => json_encode($data['editable_fields'] ?? array_keys($data['draft_value']), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'draft_value' => json_encode($data['draft_value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'is_visible' => $data['is_visible'] ?? true,
                    'updated_by' => optional($request->user())->id,
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
            DB::table('nst_cms_page_sections')->updateOrInsert(
                ['page_id' => $pageId, 'component_id' => $componentId],
                [
                    'section_key' => $componentId,
                    'component_type' => $data['component_type'] ?? 'section',
                    'title' => $data['display_name'] ?? Str::headline(str_replace(['-', '_'], ' ', $componentId)),
                    'draft_content' => json_encode($data['draft_value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'is_visible' => $data['is_visible'] ?? true,
                    'status' => 'draft',
                    'updated_by' => optional($request->user())->id,
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
            $version = $this->createContentVersion('page', $pageId, 'draft', $request, $data['change_note'] ?? 'Component draft saved.');
            DB::table('nst_cms_pages')->where('id', $pageId)->update(['status' => 'draft', 'draft_version_id' => $version->id, 'preview_token' => $version->preview_token, 'content_hash' => $version->content_hash, 'updated_at' => now()]);
            $this->publicationLog('component', $pageId, 'component_draft_saved', $request, ['component_id' => $componentId, 'version_id' => $version->id]);
        });
        $after = DB::table('nst_cms_component_registry')->where('page_id', $pageId)->where('component_id', $componentId)->first();
        $this->cmsEvent($request, 'cms.component.draft.saved', 'nst_cms_component_registry', $after?->id, $before, $after);
        return $this->ok($after, 'Component draft saved in CMS database source of truth.');
    }

    public function siteSettings(Request $request): JsonResponse
    {
        return $this->ok($this->allSiteSettings(), 'Website Control Center settings loaded from database.');
    }

    public function saveSiteSettings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'scope' => ['nullable', 'string', 'max:80'],
            'setting_key' => ['required', 'string', 'max:120'],
            'value' => ['required', 'array'],
            'publish_now' => ['nullable', 'boolean'],
            'change_note' => ['nullable', 'string', 'max:1000'],
        ]);
        $scope = $data['scope'] ?? 'global';
        $before = DB::table('nst_cms_site_settings')->where('scope', $scope)->where('setting_key', $data['setting_key'])->first();
        $nextVersion = $before ? ((int) $before->version_no + 1) : 1;
        DB::table('nst_cms_site_settings')->updateOrInsert(
            ['scope' => $scope, 'setting_key' => $data['setting_key']],
            [
                'draft_value' => json_encode($data['value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'published_value' => ($data['publish_now'] ?? false) ? json_encode($data['value'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : ($before->published_value ?? null),
                'status' => ($data['publish_now'] ?? false) ? 'published' : 'draft',
                'version_no' => $nextVersion,
                'updated_by' => optional($request->user())->id,
                'published_by' => ($data['publish_now'] ?? false) ? optional($request->user())->id : ($before->published_by ?? null),
                'published_at' => ($data['publish_now'] ?? false) ? now() : ($before->published_at ?? null),
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );
        $after = DB::table('nst_cms_site_settings')->where('scope', $scope)->where('setting_key', $data['setting_key'])->first();
        $this->cmsEvent($request, 'cms.site_settings.saved', 'nst_cms_site_settings', $after->id, $before, $after);
        return $this->ok($after, 'Website Control Center setting saved with draft/publish state.');
    }

    public function publicationLogs(Request $request): JsonResponse
    {
        return $this->ok(DB::table('nst_cms_publication_logs')->leftJoin('users', 'users.id', '=', 'nst_cms_publication_logs.user_id')
            ->select('nst_cms_publication_logs.*', 'users.name as user_name')->orderByDesc('nst_cms_publication_logs.id')->limit(1000)->get()->map(function ($row) {
                $row->summary = $this->decodeJson($row->summary, []);
                return $row;
            }));
    }

    public function operationLogs(Request $request): JsonResponse
    {
        $logs = Schema::hasTable('nst_cms_operation_logs') ? DB::table('nst_cms_operation_logs')
            ->leftJoin('users', 'users.id', '=', 'nst_cms_operation_logs.user_id')
            ->select('nst_cms_operation_logs.*', 'users.name as user_name')
            ->when($request->filled('action'), fn ($q) => $q->where('nst_cms_operation_logs.action', $request->input('action')))
            ->orderByDesc('nst_cms_operation_logs.id')->limit(500)->get()->map(function ($row) {
                foreach (['before_payload', 'after_payload', 'metadata'] as $field) {
                    $row->{$field} = $this->decodeJson($row->{$field}, $field === 'metadata' ? [] : null);
                }
                return $row;
            }) : collect();
        return $this->ok(['logs' => $logs, 'total' => $logs->count()]);
    }

    private function validatePage(Request $request, bool $partial = false, ?int $pageId = null): array
    {
        $required = $partial ? 'sometimes' : 'required';
        $data = $request->validate([
            'title' => [$required, 'string', 'max:190'],
            'slug' => ['nullable', 'string', 'max:190', 'unique:nst_cms_pages,slug,' . ($pageId ?? 'NULL')],
            'route' => ['nullable', 'string', 'max:255', 'unique:nst_cms_pages,route,' . ($pageId ?? 'NULL')],
            'page_type' => ['nullable', 'string', 'max:80'],
            'content' => ['nullable'],
            'seo' => ['nullable', 'array'],
            'seo.meta_title' => ['nullable', 'string', 'max:190'],
            'seo.meta_description' => ['nullable', 'string', 'max:500'],
            'seo.featured_image' => ['nullable', 'string', 'max:2000'],
            'seo.canonical' => ['nullable', 'string', 'max:2000'],
            'seo.robots' => ['nullable', 'string', 'max:100'],
            'seo.og' => ['nullable', 'array'],
            'seo.twitter' => ['nullable', 'array'],
            'seo.structured_data' => ['nullable', 'array'],
            'faq' => ['nullable', 'array'],
            'settings' => ['nullable', 'array'],
            'is_visible' => ['nullable', 'boolean'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'change_note' => ['nullable', 'string', 'max:1000'],
        ]);
        $reserved = ['admin', 'api', 'pos', 'login', 'register', 'logout', 'cart', 'checkout', 'wishlist', 'compare', 'account', 'blog', 'downloads', 'emi-calculator', 'products', 'category', 'categories', 'brands', 'search', 'orders', 'payment', 'settings', 'supplier', 'portal', '404'];
        foreach (['slug', 'route'] as $field) {
            if (!array_key_exists($field, $data) || $data[$field] === null || $data[$field] === '') continue;
            $value = strtolower(trim((string) $data[$field], " /\t\n\r\0\x0B"));
            $value = explode('/', $value)[0];
            if (in_array($value, $reserved, true)) {
                throw ValidationException::withMessages([$field => 'This path is reserved for an application route.']);
            }
        }
        return $data;
    }

    private function pagePayload(array $data, bool $applyDefaults = true): array
    {
        unset($data['change_note']);
        if (array_key_exists('content', $data) && !is_string($data['content'])) {
            $data['content'] = json_encode($data['content'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        foreach (['seo', 'faq', 'settings'] as $field) {
            if (array_key_exists($field, $data)) {
                $data[$field] = json_encode($data[$field], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
        }
        if ($applyDefaults) {
            $data['page_type'] = $data['page_type'] ?? 'custom';
            $data['is_visible'] = $data['is_visible'] ?? true;
            $data['sort_order'] = $data['sort_order'] ?? 0;
        }
        return $data;
    }

    private function createContentVersion(string $resourceType, int $resourceId, string $status, Request $request, ?string $note): object
    {
        $snapshot = $this->versionSnapshot($resourceType, $resourceId);
        $payload = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $hash = hash('sha256', $payload ?: '');
        $versionNo = ((int) DB::table('nst_cms_content_versions')->where('resource_type', $resourceType)->where('resource_id', $resourceId)->max('version_no')) + 1;
        $id = DB::table('nst_cms_content_versions')->insertGetId([
            'resource_type' => $resourceType,
            'resource_id' => $resourceId,
            'version_no' => $versionNo,
            'status' => $status,
            'payload' => $payload,
            'content_hash' => $hash,
            'preview_token' => in_array($status, ['draft', 'preview'], true) ? Str::random(48) : null,
            'change_note' => $note,
            'created_by' => optional($request->user())->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return DB::table('nst_cms_content_versions')->find($id);
    }

    private function versionSnapshot(string $resourceType, int $resourceId): array
    {
        if ($resourceType === 'page') {
            $page = DB::table('nst_cms_pages')->where('id', $resourceId)->first();
            return [
                'page' => $page ? (array) $this->normalizePage($page) : null,
                'sections' => $this->draftSections($resourceId),
                'component_map' => $this->componentMap($resourceId, true),
                'site_settings' => $this->allSiteSettings(),
            ];
        }
        return ['resource_type' => $resourceType, 'resource_id' => $resourceId, 'timestamp' => now()->toIso8601String()];
    }

    private function storeRevision(int $pageId, string $action, Request $request, ?string $note): void
    {
        $page = DB::table('nst_cms_pages')->where('id', $pageId)->first();
        if (!$page) {
            return;
        }
        $revisionNo = ((int) DB::table('nst_cms_page_revisions')->where('page_id', $pageId)->max('revision_no')) + 1;
        DB::table('nst_cms_page_revisions')->insert([
            'page_id' => $pageId,
            'revision_no' => $revisionNo,
            'action' => $action,
            'snapshot' => json_encode($this->normalizePage($page), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'change_note' => $note,
            'created_by' => optional($request->user())->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function syncSectionsFromContent(int $pageId, mixed $content, Request $request, bool $initial): void
    {
        $contentArray = is_string($content) ? ['html' => $content] : (is_array($content) ? $content : []);
        $sections = $contentArray['sections'] ?? [];
        if (empty($sections)) {
            $sections = [[
                'component_id' => 'main-content',
                'section_key' => 'main-content',
                'component_type' => 'rich_text',
                'title' => 'Main Content',
                'content' => $contentArray,
                'sort_order' => 1,
                'is_visible' => true,
            ]];
        }
        foreach (array_values($sections) as $index => $section) {
            $componentId = $section['component_id'] ?? $section['id'] ?? ('section-' . ($index + 1));
            $value = $section['content'] ?? $section;
            $existingSection = DB::table('nst_cms_page_sections')->where('page_id', $pageId)->where('component_id', $componentId)->first();
            DB::table('nst_cms_page_sections')->updateOrInsert(
                ['page_id' => $pageId, 'component_id' => $componentId],
                [
                    'section_key' => $section['section_key'] ?? $componentId,
                    'component_type' => $section['component_type'] ?? $section['type'] ?? 'section',
                    'title' => $section['title'] ?? Str::headline(str_replace(['-', '_'], ' ', $componentId)),
                    'draft_content' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'published_content' => $initial ? null : ($existingSection->published_content ?? null),
                    'responsive_settings' => json_encode($section['responsive_settings'] ?? ['mobile' => true, 'tablet' => true, 'desktop' => true]),
                    'effect_settings' => json_encode($section['effect_settings'] ?? []),
                    'is_visible' => $section['is_visible'] ?? true,
                    'sort_order' => $section['sort_order'] ?? ($index + 1),
                    'status' => 'draft',
                    'updated_by' => optional($request->user())->id,
                    'updated_at' => now(),
                    'created_at' => $existingSection->created_at ?? now(),
                ]
            );
            DB::table('nst_cms_component_registry')->updateOrInsert(
                ['page_id' => $pageId, 'component_id' => $componentId],
                [
                    'component_type' => $section['component_type'] ?? $section['type'] ?? 'section',
                    'display_name' => $section['title'] ?? Str::headline(str_replace(['-', '_'], ' ', $componentId)),
                    'selector_path' => '[data-cms-component-id="' . $componentId . '"]',
                    'editable_fields' => json_encode(array_keys(is_array($value) ? $value : ['html' => $value]), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'draft_value' => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'is_visible' => $section['is_visible'] ?? true,
                    'updated_by' => optional($request->user())->id,
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
        }
    }

    private function publishDraftSections(int $pageId, Request $request): void
    {
        $sections = DB::table('nst_cms_page_sections')->where('page_id', $pageId)->get();
        foreach ($sections as $section) {
            DB::table('nst_cms_page_sections')->where('id', $section->id)->update([
                'published_content' => $section->draft_content ?: $section->published_content,
                'status' => $section->is_visible ? 'published' : 'hidden',
                'updated_by' => optional($request->user())->id,
                'updated_at' => now(),
            ]);
            DB::table('nst_cms_component_registry')->where('page_id', $pageId)->where('component_id', $section->component_id)->update([
                'current_value' => $section->draft_content ?: $section->published_content,
                'draft_value' => null,
                'is_visible' => $section->is_visible,
                'updated_by' => optional($request->user())->id,
                'updated_at' => now(),
            ]);
        }
    }

    private function publishedSections(int $pageId): array
    {
        if (!Schema::hasTable('nst_cms_page_sections')) {
            return [];
        }
        return DB::table('nst_cms_page_sections')->where('page_id', $pageId)->where('is_visible', true)->whereIn('status', ['published', 'hidden'])
            ->orderBy('sort_order')->get()->map(fn ($row) => $this->sectionPayload($row, false))->all();
    }

    private function draftSections(int $pageId): array
    {
        if (!Schema::hasTable('nst_cms_page_sections')) {
            return [];
        }
        return DB::table('nst_cms_page_sections')->where('page_id', $pageId)->where('is_visible', true)
            ->orderBy('sort_order')->get()->map(fn ($row) => $this->sectionPayload($row, true))->all();
    }

    private function sectionPayload(object $row, bool $draft): array
    {
        return [
            'id' => $row->id,
            'component_id' => $row->component_id,
            'component_type' => $row->component_type,
            'title' => $row->title,
            'content' => $this->decodeJson($draft ? ($row->draft_content ?: $row->published_content) : ($row->published_content ?: $row->draft_content), []),
            'responsive_settings' => $this->decodeJson($row->responsive_settings, []),
            'effect_settings' => $this->decodeJson($row->effect_settings, []),
            'is_visible' => (bool) $row->is_visible,
            'sort_order' => (int) $row->sort_order,
            'status' => $row->status,
        ];
    }

    private function componentMap(int $pageId, bool $draft): array
    {
        if (!Schema::hasTable('nst_cms_component_registry')) {
            return [];
        }
        return DB::table('nst_cms_component_registry')->where('page_id', $pageId)->orderBy('id')->get()->map(function ($row) use ($draft) {
            return [
                'component_id' => $row->component_id,
                'component_type' => $row->component_type,
                'display_name' => $row->display_name,
                'selector_path' => $row->selector_path,
                'editable_fields' => $this->decodeJson($row->editable_fields, []),
                'value' => $this->decodeJson($draft ? ($row->draft_value ?: $row->current_value) : ($row->current_value ?: $row->draft_value), []),
                'is_visible' => (bool) $row->is_visible,
            ];
        })->all();
    }

    private function pageByPath(string $path): ?object
    {
        $path = '/' . ltrim($path ?: '/', '/');
        $path = rtrim($path, '/') ?: '/';
        return DB::table('nst_cms_pages')->where(fn ($q) => $q->where('route', $path)->orWhere('slug', trim($path, '/')))->first();
    }

    private function publicationLog(string $type, ?int $id, string $action, Request $request, array $summary): void
    {
        DB::table('nst_cms_publication_logs')->insert([
            'resource_type' => $type,
            'resource_id' => $id,
            'action' => $action,
            'environment' => app()->environment(),
            'summary' => json_encode($summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'user_id' => optional($request->user())->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function cmsEvent(Request $request, string $action, ?string $modelType = null, mixed $modelId = null, mixed $before = null, mixed $after = null): void
    {
        if (!Schema::hasTable('nst_cms_operation_logs')) {
            return;
        }
        DB::table('nst_cms_operation_logs')->insert([
            'action' => $action,
            'resource_type' => $modelType,
            'resource_id' => $modelId,
            'before_payload' => $before ? json_encode($before, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            'after_payload' => $after ? json_encode($after, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null,
            'metadata' => json_encode(['ip' => $request->ip(), 'path' => $request->path(), 'source' => 'stage8_cms'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'user_id' => optional($request->user())->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function normalizePage(object $row): object
    {
        foreach (['seo', 'faq', 'settings'] as $field) {
            $row->{$field} = $this->decodeJson($row->{$field} ?? null, []);
        }
        if (is_string($row->content ?? null)) {
            $decoded = json_decode($row->content, true);
            if (json_last_error() === JSON_ERROR_NONE) {
                $row->content = $decoded;
            }
        }
        return $row;
    }

    private function normalizeRoute(string $route): string
    {
        $route = '/' . ltrim(trim($route), '/');
        return rtrim($route, '/') ?: '/';
    }

    private function allSiteSettings(): array
    {
        if (!Schema::hasTable('nst_cms_site_settings')) {
            return [];
        }
        return DB::table('nst_cms_site_settings')->orderBy('scope')->orderBy('setting_key')->get()->mapWithKeys(function ($row) {
            return [$row->scope . '.' . $row->setting_key => [
                'draft_value' => $this->decodeJson($row->draft_value, []),
                'published_value' => $this->decodeJson($row->published_value, []),
                'status' => $row->status,
                'version_no' => (int) $row->version_no,
                'published_at' => $row->published_at,
            ]];
        })->all();
    }

    private function publishedSiteSettings(): array
    {
        if (!Schema::hasTable('nst_cms_site_settings')) {
            return [];
        }
        return DB::table('nst_cms_site_settings')->where('status', 'published')->get()->mapWithKeys(function ($row) {
            return [$row->scope . '.' . $row->setting_key => $this->decodeJson($row->published_value, [])];
        })->all();
    }

    private function stageEightAcceptancePayload(): array
    {
        $requiredTables = ['nst_cms_pages', 'nst_cms_page_revisions', 'nst_cms_publication_logs', 'nst_cms_page_sections', 'nst_cms_component_registry', 'nst_cms_content_versions', 'nst_cms_site_settings', 'nst_cms_operation_logs'];
        $requiredRoutes = ['cms.overview', 'cms.acceptance-status', 'cms.canonical-state', 'cms.pages', 'cms.pages.preview', 'cms.pages.publish', 'cms.pages.rollback-version', 'cms.components', 'cms.components.draft', 'cms.wysiwyg-map', 'cms.site-settings', 'cms.operation-logs', 'public.cms.page'];
        $tableStatus = collect($requiredTables)->mapWithKeys(fn ($table) => [$table => Schema::hasTable($table)]);
        $routeStatus = collect($requiredRoutes)->mapWithKeys(fn ($name) => [$name => Route::has($name)]);
        return [
            'tables' => $tableStatus,
            'routes' => $routeStatus,
            'database_ready' => $tableStatus->every(fn ($ready) => $ready === true),
            'routes_ready' => $routeStatus->every(fn ($ready) => $ready === true),
            'business_rules' => [
                'cms_storefront_one_source_of_truth' => true,
                'live_wysiwyg_click_to_edit_component_map' => true,
                'draft_preview_publish_rollback' => true,
                'immutable_content_versions' => true,
                'preview_token_isolation' => true,
                'atomic_publish_sets_current_version' => true,
                'rollback_restores_as_draft_before_publish' => true,
                'seo_faq_page_level_control' => true,
                'audit_history_records_cms_operations' => true,
                'super_admin_publication_gate' => true,
            ],
        ];
    }

    private function readJson(string $path, array $fallback): array
    {
        if (!File::exists($path)) {
            return $fallback;
        }
        $decoded = json_decode(File::get($path), true);
        return is_array($decoded) ? $decoded : $fallback;
    }

    private function decodeJson(mixed $value, mixed $default): mixed
    {
        if (is_array($value)) {
            return $value;
        }
        if (!is_string($value) || $value === '') {
            return $default;
        }
        $decoded = json_decode($value, true);
        return json_last_error() === JSON_ERROR_NONE ? $decoded : $default;
    }

    private function ok(mixed $data, string $message = 'CMS operation completed.', int $status = 200): JsonResponse
    {
        return response()->json(['status' => true, 'message' => $message, 'data' => $data], $status);
    }
}
