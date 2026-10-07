<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PublicMediaUrlService;
use App\Services\SecurityEventService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class WebsiteBuilderController extends Controller
{
    private string $fileName = 'app/nst-website-builder.json';
    private string $storeDirectory = 'app/website-builder';
    private int $customCodeMaxLength = 100000;

    public function published(): JsonResponse
    {
        $store = $this->readStore();

        return response()->json([
            'status' => true,
            'data' => $this->applyPublicSchedule($store['published'] ?? $this->defaultContent()),
            'published_at' => $store['published_at'] ?? null,
])->withHeaders($this->publicNoCacheHeaders());
    }

    public function publishedPage(Request $request): JsonResponse
    {
        $path = '/' . ltrim((string) $request->query('path', '/'), '/');
        $path = $path === '//' ? '/' : (rtrim($path, '/') ?: '/');
        $store = $this->readStore();
        $published = $this->applyPublicSchedule($this->normalizeContent($store['published'] ?? []));
        $pages = is_array($published['pages'] ?? null) ? $published['pages'] : [];

        $page = collect($pages)->first(function ($candidate) use ($path) {
            if (!is_array($candidate) || (($candidate['status'] ?? 'published') !== 'published')) {
                return false;
            }

            $route = (string) ($candidate['route'] ?? $candidate['path'] ?? $candidate['slug'] ?? '');
            return $this->builderRouteMatches($route, $path);
        });

        if (!is_array($page)) {
            return response()->json([
                'status' => false,
                'message' => 'Published website page was not found.',
                'path' => $path,
            ], 404)->withHeaders($this->publicNoCacheHeaders());
        }

        $published['pages'] = [$page];

        return response()->json([
            'status' => true,
            'data' => $published,
            'page' => $page,
            'published_at' => $store['published_at'] ?? null,
        ])->withHeaders($this->publicNoCacheHeaders());
    }

    public function draft(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessSuperAdmin($request)) {
            return $denied;
        }

        $store = $this->readStore();

        return response()->json([
            'status' => true,
            'data' => [
                'draft' => $store['draft'],
                'published' => $store['published'],
                'revisions' => $store['revisions'],
            ],
        ]);
    }

    public function saveDraft(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessSuperAdmin($request)) {
            return $denied;
        }

        try {
            $payload = $this->readBuilderPayload($request);
            if (!is_array($payload)) {
                return response()->json(['status' => false, 'message' => 'Invalid builder content.'], 422);
            }

            $content = $this->normalizeContent($payload);
            if ($tooLarge = $this->oversizedCustomCode($content)) {
                return response()->json([
                    'status' => false,
                    'message' => __('messages.website_code.too_large', ['where' => $tooLarge, 'kb' => (int) ($this->customCodeMaxLength / 1000)]),
                ], 422);
            }
            $directory = storage_path($this->storeDirectory);
            File::ensureDirectoryExists($directory);
            $updatedAt = Carbon::now()->toIso8601String();
            $previousDraft = $this->readJsonFile($directory . DIRECTORY_SEPARATOR . 'draft.json', []);

            // Draft saves must not load published content or revision bodies into memory.
            $this->writeJsonAtomic($directory . DIRECTORY_SEPARATOR . 'draft.json', $content);
            $metaPath = $directory . DIRECTORY_SEPARATOR . 'meta.json';
            $meta = $this->readJsonFile($metaPath, []);
            $meta['updated_at'] = $updatedAt;
            $this->writeJsonAtomic($metaPath, $meta);
            $this->logCustomCodeChanges($request, $previousDraft, $content, 'draft');

            return response()->json([
                'status' => true,
                'message' => 'Website builder draft saved.',
                'updated_at' => $updatedAt,
            ]);
        } catch (Throwable $exception) {
            report($exception);

            return response()->json([
                'status' => false,
                'message' => 'Website builder draft could not be saved.',
                'error' => app()->environment('local') ? $exception->getMessage() : null,
            ], 500);
        }
    }

    public function publish(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessSuperAdmin($request)) {
            return $denied;
        }

        $store = $this->readStore();
        $currentPublished = $store['published'] ?? $this->defaultContent();
        $revision = [
            'id' => (string) Str::uuid(),
            'label' => 'Before publish ' . Carbon::now()->format('Y-m-d H:i:s'),
            'created_at' => Carbon::now()->toIso8601String(),
            'created_by' => optional($request->user())->name,
            'content' => $currentPublished,
        ];

        $revision = $this->storeRevision($revision, $currentPublished);
        array_unshift($store['revisions'], $revision);
        $store['revisions'] = array_slice($store['revisions'], 0, $this->revisionLimit());
        $this->pruneRevisionFiles($store['revisions']);
        $store['published'] = $this->normalizeContent($store['draft'] ?? $this->defaultContent());
        $store['published_at'] = Carbon::now()->toIso8601String();
        $store['updated_at'] = Carbon::now()->toIso8601String();
        $this->writeStore($store);
        $this->logCustomCodeChanges($request, $currentPublished, $store['published'], 'publish');

        return response()->json([
            'status' => true,
            'message' => 'Website content published with rollback point.',
            'updated_at' => $store['updated_at'],
        ]);
    }

    /** Stores a logo or badge image for the storefront and returns a same-origin URL for it. */
    public function uploadAsset(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessSuperAdmin($request)) {
            return $denied;
        }

        $request->validate([
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,gif', 'max:4096'],
        ]);

        $file = $request->file('file');
        $extension = strtolower($file->guessExtension() ?: $file->getClientOriginalExtension());
        if (!in_array($extension, ['jpg', 'jpeg', 'png', 'webp', 'gif'], true)) {
            return response()->json(['status' => false, 'message' => 'Unsupported image type.'], 422);
        }

        $path = $file->storeAs('website-assets/' . now()->format('Y/m'), Str::random(24) . '.' . $extension, 'public');
        if (!$path) {
            return response()->json(['status' => false, 'message' => 'Image could not be saved.'], 500);
        }

        return response()->json([
            'status' => true,
            'data' => [
                'path' => $path,
                'url' => PublicMediaUrlService::forPath($path),
                'size' => Storage::disk('public')->size($path),
            ],
        ]);
    }

    public function revisions(Request $request): JsonResponse
    {
        if ($denied = $this->denyUnlessSuperAdmin($request)) {
            return $denied;
        }

        $store = $this->readStore();

        return response()->json([
            'status' => true,
            'data' => $store['revisions'],
        ]);
    }

    public function deleteRevision(Request $request, string $revisionId): JsonResponse
    {
        if ($denied = $this->denyUnlessSuperAdmin($request)) {
            return $denied;
        }

        $store = $this->readStore();
        $before = count($store['revisions']);
        $store['revisions'] = array_values(array_filter($store['revisions'], fn ($row) => ($row['id'] ?? null) !== $revisionId));

        if (count($store['revisions']) === $before) {
            return response()->json(['status' => false, 'message' => 'Version was not found.'], 404);
        }

        $this->pruneRevisionFiles($store['revisions']);
        $store['updated_at'] = Carbon::now()->toIso8601String();
        $this->writeStore($store);

        return response()->json(['status' => true, 'data' => $store['revisions']]);
    }

    public function rollback(Request $request, string $revisionId): JsonResponse
    {
        if ($denied = $this->denyUnlessSuperAdmin($request)) {
            return $denied;
        }

        $store = $this->readStore();
        $target = collect($store['revisions'])->firstWhere('id', $revisionId);

        $targetContent = is_array($target) ? $this->loadRevisionContent($target) : null;

        if (!$target || !$targetContent) {
            return response()->json([
                'status' => false,
                'message' => 'Rollback revision was not found.',
            ], 404);
        }

        $currentPublished = $store['published'] ?? $this->defaultContent();
        $rollbackRevision = $this->storeRevision([
            'id' => (string) Str::uuid(),
            'label' => 'Before rollback ' . Carbon::now()->format('Y-m-d H:i:s'),
            'created_at' => Carbon::now()->toIso8601String(),
            'created_by' => optional($request->user())->name,
        ], $currentPublished);
        array_unshift($store['revisions'], $rollbackRevision);

        $store['published'] = $this->normalizeContent($targetContent);
        $store['draft'] = $store['published'];
        $store['revisions'] = array_slice($store['revisions'], 0, $this->revisionLimit());
        $this->pruneRevisionFiles($store['revisions']);
        $store['updated_at'] = Carbon::now()->toIso8601String();
        $this->writeStore($store);
        $this->logCustomCodeChanges($request, $currentPublished, $store['published'], 'rollback');

        return response()->json([
            'status' => true,
            'message' => 'Website content restored from selected revision.',
            'updated_at' => $store['updated_at'],
        ]);
    }

    private function publicNoCacheHeaders(): array
    {
        return [
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma' => 'no-cache',
            'Expires' => '0',
        ];
    }

    private function revisionLimit(): int
    {
        return max(10, min(200, (int) config('app.website_builder_revision_limit', 50)));
    }

    private function builderRouteMatches(string $route, string $path): bool
    {
        $route = '/' . ltrim(trim($route), '/');
        $route = $route === '//' ? '/' : (rtrim($route, '/') ?: '/');

        if ($route === $path) {
            return true;
        }

        $quoted = preg_quote($route, '#');
        $pattern = preg_replace('#\\:[^/]+#', '[^/]+', $quoted);

        return is_string($pattern) && preg_match('#^' . $pattern . '$#', $path) === 1;
    }

    private function denyUnlessSuperAdmin(Request $request): ?JsonResponse
    {
        $user = $request->user();

        if (!$user) {
            return response()->json(['status' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $roleNames = [];

        if (method_exists($user, 'getRoleNames')) {
            $roleNames = $user->getRoleNames()->map(fn ($role) => $this->normalizeRoleName($role))->all();
        }

        foreach (['role', 'user_type', 'type', 'profile_type'] as $field) {
            if (!empty($user->{$field})) {
                $roleNames[] = $this->normalizeRoleName($user->{$field});
            }
        }

        if (!in_array('super_admin', array_unique($roleNames), true)) {
            return response()->json([
                'status' => false,
                'message' => 'Website Control Center is Super Admin only.',
            ], 403);
        }

        return null;
    }

    /**
     * Every custom code box in the content: site-wide head / body end, and each Custom Code section.
     * Returns [location => ['text' => string, 'enabled' => bool]].
     */
    private function customCodeEntries(array $content): array
    {
        $entries = [];
        $site = is_array($content['site']['customCode'] ?? null) ? $content['site']['customCode'] : [];
        foreach (['head' => 'site head', 'bodyEnd' => 'site body end'] as $key => $label) {
            $text = (string) ($site[$key] ?? '');
            if ($text !== '') {
                $entries[$label] = ['text' => $text, 'enabled' => (bool) ($site['enabled'] ?? false)];
            }
        }
        foreach ((is_array($content['pages'] ?? null) ? $content['pages'] : []) as $page) {
            if (! is_array($page)) {
                continue;
            }
            foreach ((is_array($page['blocks'] ?? null) ? $page['blocks'] : []) as $section) {
                if (! is_array($section) || strtolower((string) ($section['type'] ?? '')) !== 'custom code') {
                    continue;
                }
                $code = is_array($section['code'] ?? null) ? $section['code'] : [];
                $where = 'page ' . ($page['id'] ?? '?') . ' / ' . ($section['name'] ?? $section['id'] ?? 'section');
                foreach (['html', 'css', 'js'] as $part) {
                    $entries[$where . ' / ' . $part] = [
                        'text' => (string) ($code[$part] ?? ''),
                        'enabled' => ($section['visible'] ?? true) !== false,
                        'mode' => (string) ($code['mode'] ?? 'isolated'),
                    ];
                }
            }
        }

        return $entries;
    }

    private function oversizedCustomCode(array $content): ?string
    {
        foreach ($this->customCodeEntries($content) as $where => $entry) {
            if (mb_strlen($entry['text']) > $this->customCodeMaxLength) {
                return $where;
            }
        }

        return null;
    }

    private function logCustomCodeChanges(Request $request, array $before, array $after, string $stage): void
    {
        $old = $this->customCodeEntries($before);
        $new = $this->customCodeEntries($after);
        $changes = [];
        foreach (array_unique(array_merge(array_keys($old), array_keys($new))) as $where) {
            $was = $old[$where] ?? null;
            $now = $new[$where] ?? null;
            if ($was == $now || (($was['text'] ?? '') === '' && ($now['text'] ?? '') === '')) {
                continue;
            }
            $changes[] = [
                'where' => $where,
                'change' => $was === null || $was['text'] === '' ? 'added' : ($now === null || $now['text'] === '' ? 'removed' : 'changed'),
                'enabled' => (bool) ($now['enabled'] ?? false),
                'mode' => $now['mode'] ?? null,
                'size' => mb_strlen((string) ($now['text'] ?? '')),
                'has_script' => (bool) preg_match('/<script|on[a-z]+\s*=|javascript:/i', (string) ($now['text'] ?? '')) || (str_ends_with($where, '/ js') && ($now['text'] ?? '') !== ''),
                'sha1_before' => $was ? sha1($was['text']) : null,
                'sha1_after' => $now ? sha1($now['text']) : null,
            ];
        }
        if (! $changes) {
            return;
        }

        app(SecurityEventService::class)->record($request, 'website_custom_code_' . $stage, 'medium', [
            'page' => '/website-control-center',
            'stage' => $stage,
            'changes' => $changes,
        ]);
    }

    private function normalizeRoleName(string $role): string
    {
        return preg_replace('/[^a-z0-9]+/', '_', strtolower(trim($role))) ?: '';
    }

    private function readStore(): array
    {
        $directory = storage_path($this->storeDirectory);
        $draftPath = $directory . DIRECTORY_SEPARATOR . 'draft.json';
        $publishedPath = $directory . DIRECTORY_SEPARATOR . 'published.json';
        $metaPath = $directory . DIRECTORY_SEPARATOR . 'meta.json';

        if (!File::exists($draftPath) || !File::exists($publishedPath)) {
            $this->migrateLegacyStore();
        }

        if (!File::exists($draftPath) || !File::exists($publishedPath)) {
            $this->writeStore($this->freshStore());
        }

        $draft = $this->readJsonFile($draftPath, $this->defaultContent());
        $published = $this->readJsonFile($publishedPath, $this->defaultContent());
        $meta = $this->readJsonFile($metaPath, []);

        return [
            'draft' => $this->normalizeContent($draft),
            'published' => $this->normalizeContent($published),
            'revisions' => $this->readRevisionIndex(),
            'updated_at' => $meta['updated_at'] ?? null,
            'published_at' => $meta['published_at'] ?? null,
        ];
    }

    private function writeStore(array $store): void
    {
        $directory = storage_path($this->storeDirectory);
        File::ensureDirectoryExists($directory);

        if (isset($store['draft']) && is_array($store['draft'])) {
            $this->writeJsonAtomic($directory . DIRECTORY_SEPARATOR . 'draft.json', $store['draft']);
        }

        if (isset($store['published']) && is_array($store['published'])) {
            $this->writeJsonAtomic($directory . DIRECTORY_SEPARATOR . 'published.json', $store['published']);
        }

        $this->writeJsonAtomic($directory . DIRECTORY_SEPARATOR . 'meta.json', [
            'updated_at' => $store['updated_at'] ?? Carbon::now()->toIso8601String(),
            'published_at' => $store['published_at'] ?? null,
        ]);

        if (array_key_exists('revisions', $store) && is_array($store['revisions'])) {
            $this->writeRevisionIndex($store['revisions']);
        }
    }

    private function migrateLegacyStore(): void
    {
        $legacyPath = storage_path($this->fileName);
        if (!File::exists($legacyPath)) {
            return;
        }

        $decoded = json_decode(File::get($legacyPath), true);
        if (!is_array($decoded)) {
            return;
        }

        $store = [
            'draft' => $this->normalizeContent($decoded['draft'] ?? []),
            'published' => $this->normalizeContent($decoded['published'] ?? []),
            'revisions' => [],
            'updated_at' => $decoded['updated_at'] ?? Carbon::now()->toIso8601String(),
            'published_at' => $decoded['published_at'] ?? null,
        ];

        $this->writeStore($store);
        @File::move($legacyPath, $legacyPath . '.migrated-' . Carbon::now()->format('YmdHis'));
    }

    private function readJsonFile(string $path, array $fallback): array
    {
        if (!File::exists($path)) {
            return $fallback;
        }

        $decoded = json_decode(File::get($path), true);
        return is_array($decoded) ? $decoded : $fallback;
    }

    private function writeJsonAtomic(string $path, array $value): void
    {
        File::ensureDirectoryExists(dirname($path));
        $json = json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        $temporary = $path . '.tmp-' . Str::random(8);

        if (file_put_contents($temporary, $json, LOCK_EX) === false) {
            throw new \RuntimeException('Unable to write temporary website-builder file.');
        }

        // Windows cannot always rename over an existing file. Keep the old file
        // until the new file has been fully written, then replace it safely.
        if (File::exists($path) && !File::delete($path)) {
            @unlink($temporary);
            throw new \RuntimeException('Unable to replace existing website-builder file. Check storage permissions.');
        }

        if (!@rename($temporary, $path)) {
            @unlink($temporary);
            throw new \RuntimeException('Unable to finalize website-builder file.');
        }
    }

    private function readBuilderPayload(Request $request): ?array
    {
        $contentType = strtolower((string) $request->header('Content-Type', ''));
        $isCompressed = str_contains($contentType, 'application/gzip')
            || $request->header('X-NST-Builder-Compressed') === '1';

        if ($isCompressed) {
            $raw = $request->getContent();
            $decodedRaw = gzdecode($raw);
            if ($decodedRaw === false) {
                throw new \RuntimeException('Compressed website-builder payload could not be decoded.');
            }
            $decoded = json_decode($decodedRaw, true, 512, JSON_THROW_ON_ERROR);
            return is_array($decoded['content'] ?? null) ? $decoded['content'] : (is_array($decoded) ? $decoded : null);
        }

        $payload = $request->input('content', $request->all());
        return is_array($payload) ? $payload : null;
    }

    private function revisionDirectory(): string
    {
        return storage_path($this->storeDirectory . '/revisions');
    }

    private function readRevisionIndex(): array
    {
        $path = $this->revisionDirectory() . DIRECTORY_SEPARATOR . 'index.json';
        return $this->readJsonFile($path, []);
    }

    private function writeRevisionIndex(array $revisions): void
    {
        $directory = $this->revisionDirectory();
        File::ensureDirectoryExists($directory);
        $this->writeJsonAtomic($directory . DIRECTORY_SEPARATOR . 'index.json', array_slice($revisions, 0, $this->revisionLimit()));
    }

    private function storeRevision(array $revision, array $content): array
    {
        $directory = $this->revisionDirectory();
        File::ensureDirectoryExists($directory);
        $revision['file'] = $revision['id'] . '.json.gz';
        $encoded = json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        File::put($directory . DIRECTORY_SEPARATOR . $revision['file'], gzencode($encoded, 6), true);
        unset($revision['content']);
        return $revision;
    }

    private function loadRevisionContent(array $revision): ?array
    {
        if (isset($revision['content']) && is_array($revision['content'])) {
            return $revision['content'];
        }
        if (empty($revision['file'])) {
            return null;
        }
        $path = $this->revisionDirectory() . DIRECTORY_SEPARATOR . basename((string) $revision['file']);
        if (!File::exists($path)) {
            return null;
        }
        $decoded = json_decode((string) gzdecode(File::get($path)), true);
        return is_array($decoded) ? $decoded : null;
    }

    private function pruneRevisionFiles(array $revisions): void
    {
        $keep = array_filter(array_column($revisions, 'file'));
        foreach (File::glob($this->revisionDirectory() . DIRECTORY_SEPARATOR . '*.json.gz') ?: [] as $file) {
            if (!in_array(basename($file), $keep, true)) {
                File::delete($file);
            }
        }
    }

    private function freshStore(): array
    {
        $content = $this->defaultContent();

        return [
            'draft' => $content,
            'published' => $content,
            'revisions' => [],
            'updated_at' => Carbon::now()->toIso8601String(),
            'published_at' => Carbon::now()->toIso8601String(),
        ];
    }


    private function applyPublicSchedule(array $content): array
    {
        $now = Carbon::now('Asia/Dhaka');
        $visible = function ($section) use ($now) {
            if (! is_array($section)) return false;
            $schedule = is_array($section['schedule'] ?? null) ? $section['schedule'] : [];
            if (! ($schedule['enabled'] ?? false)) return true;
            try {
                $start = ! empty($schedule['start_at']) ? Carbon::parse($schedule['start_at'], 'Asia/Dhaka') : null;
                $end = ! empty($schedule['end_at']) ? Carbon::parse($schedule['end_at'], 'Asia/Dhaka') : null;
                if ($start && $now->lt($start)) return false;
                if ($end && $now->gt($end)) return false;
                return true;
            } catch (Throwable) {
                return false;
            }
        };

        if (isset($content['sections']) && is_array($content['sections'])) {
            $content['sections'] = array_values(array_filter($content['sections'], $visible));
        }
        if (isset($content['pages']) && is_array($content['pages'])) {
            foreach ($content['pages'] as &$page) {
                if (! is_array($page)) continue;
                foreach (['sections','blocks'] as $key) {
                    if (isset($page[$key]) && is_array($page[$key])) {
                        $page[$key] = array_values(array_filter($page[$key], $visible));
                    }
                }
            }
            unset($page);
        }
        return $content;
    }

    private function normalizeContent(array $content): array
    {
        // The builder uses a self-contained visual-builder schema. Do not merge it
        // into the legacy CMS default tree: that duplicates megabytes of data and
        // causes the admin canvas and storefront to read different structures.
        if (isset($content['pages']) && is_array($content['pages'])) {
            $content['version'] = max(3, (int) ($content['version'] ?? 3));
            $content['updatedAt'] = Carbon::now()->toIso8601String();
            $content['theme'] = is_array($content['theme'] ?? null) ? $content['theme'] : [];
            $content['settings'] = is_array($content['settings'] ?? null) ? $content['settings'] : [];
            $content['library'] = is_array($content['library'] ?? null) ? $content['library'] : [
                'globalSections' => [],
                'reusableBlocks' => [],
            ];
            $content['pages'] = array_values(array_filter($content['pages'], fn ($page) => is_array($page)));
            return $content;
        }

        $default = $this->defaultContent();
        $merged = array_replace_recursive($default, $content);
        $merged['version'] = 2;
        $merged['updatedAt'] = Carbon::now()->toIso8601String();

        if (!isset($merged['sections']) || !is_array($merged['sections'])) {
            $merged['sections'] = $default['sections'];
        }

        $removedSectionIds = ['mind-blowing-offer', 'featured-products', 'recent-sales'];
        $merged['sections'] = array_values(array_filter(
            $merged['sections'],
            fn ($section) => is_array($section) && ! in_array($section['id'] ?? '', $removedSectionIds, true)
        ));

        foreach (['links', 'topLinks', 'categoryLinks'] as $linkGroup) {
            if (!isset($merged['header'][$linkGroup]) || !is_array($merged['header'][$linkGroup])) {
                $merged['header'][$linkGroup] = $default['header'][$linkGroup];
            }

            $merged['header'][$linkGroup] = array_values(array_map(function ($link, $index) {
                $link = is_array($link) ? $link : [];
                $link['label'] = (string) ($link['label'] ?? 'Menu');
                $link['path'] = (string) ($link['path'] ?? '/');
                $link['enabled'] = $link['enabled'] ?? true;
                $link['order'] = (int) ($link['order'] ?? ($index + 1));
                return $link;
            }, $merged['header'][$linkGroup], array_keys($merged['header'][$linkGroup])));

            usort($merged['header'][$linkGroup], fn ($a, $b) => ($a['order'] ?? 999) <=> ($b['order'] ?? 999));
        }

        if (!isset($merged['popup']['items']) || !is_array($merged['popup']['items'])) {
            $merged['popup']['items'] = $default['popup']['items'];
        }

        foreach (['whyBuy', 'trustStrip', 'bottomStats'] as $block) {
            if (!isset($merged['productPage'][$block]['items']) || !is_array($merged['productPage'][$block]['items'])) {
                $merged['productPage'][$block]['items'] = $default['productPage'][$block]['items'];
            }
        }

        if (!isset($merged['footer']['columns']) || !is_array($merged['footer']['columns'])) {
            $merged['footer']['columns'] = $default['footer']['columns'];
        }
        $merged['footer']['columns'] = array_values(array_map(function ($column, $columnIndex) {
            $column = is_array($column) ? $column : [];
            $column['title'] = (string) ($column['title'] ?? 'Footer Column');
            $column['enabled'] = $column['enabled'] ?? true;
            $links = is_array($column['links'] ?? null) ? $column['links'] : [];
            $column['links'] = array_values(array_map(function ($link, $linkIndex) {
                $link = is_array($link) ? $link : [];
                return [
                    'label' => (string) ($link['label'] ?? 'Link'),
                    'path' => (string) ($link['path'] ?? '/'),
                    'enabled' => $link['enabled'] ?? true,
                    'order' => (int) ($link['order'] ?? ($linkIndex + 1)),
                ];
            }, $links, array_keys($links)));
            usort($column['links'], fn ($a, $b) => ($a['order'] ?? 999) <=> ($b['order'] ?? 999));
            $column['order'] = (int) ($column['order'] ?? ($columnIndex + 1));
            return $column;
        }, $merged['footer']['columns'], array_keys($merged['footer']['columns'])));
        usort($merged['footer']['columns'], fn ($a, $b) => ($a['order'] ?? 999) <=> ($b['order'] ?? 999));

        if (!isset($merged['footer']['badges']) || !is_array($merged['footer']['badges'])) {
            $merged['footer']['badges'] = $default['footer']['badges'];
        }

        return $merged;
    }

    private function defaultContent(): array
    {
        return [
            'version' => 2,
            'updatedAt' => Carbon::now()->toIso8601String(),
            'site' => [
                'name' => 'New Singapur Telecom',
                'shortName' => 'NST',
                'adminName' => 'NST POS',
                'tagline' => 'Premium mobile, gadget and telecom shopping experience',
                'logoText' => 'NST',
                'logoUrl' => '',
                'mobileLogoUrl' => '',
                'faviconUrl' => '',
                'primaryColor' => '#16a34a',
                'contactPhone' => '+880 1XXX-XXXXXX',
                'whatsappPhone' => '',
                'headerPhoneLabel' => 'Call Now',
                'headerWhatsAppLabel' => 'WhatsApp',
            ],
            'seo' => [
                'title' => 'New Singapur Telecom | Premium Mobile & Gadget Store',
                'description' => 'Shop new, used, pre-owned and premium gadgets from New Singapur Telecom with warranty, EMI, preorder and trusted service support.',
                'ogImage' => '',
            ],
            'header' => [
                'loginText' => 'Login',
                'buttonLabel' => 'Shop Now',
                'buttonPath' => '/products',
                'buttonEnabled' => false,
                'links' => [
                    ['label' => 'Home', 'path' => '/', 'enabled' => true, 'order' => 1],
                    ['label' => 'Brands', 'path' => '/brands', 'enabled' => true, 'order' => 2],
                    ['label' => 'Services', 'path' => '/services', 'enabled' => true, 'order' => 3],
                    ['label' => 'Products', 'path' => '/products', 'enabled' => true, 'order' => 4],
                    ['label' => 'Offers', 'path' => '/offers', 'enabled' => true, 'order' => 5],
                    ['label' => 'Reviews', 'path' => '/reviews', 'enabled' => true, 'order' => 6],
                    ['label' => 'Login', 'path' => '/management', 'enabled' => true, 'order' => 7],
                    ['label' => 'Blog', 'path' => '/blog', 'enabled' => true, 'order' => 8],
                    ['label' => 'Contact', 'path' => '/contact', 'enabled' => true, 'order' => 9],
                ],
                'topLinks' => [
                    ['label' => 'Blog', 'path' => '/blog', 'enabled' => true, 'order' => 1],
                    ['label' => 'EMI Policy', 'path' => '/emi-calculator', 'enabled' => true, 'order' => 2],
                    ['label' => 'Order Tracking', 'path' => '/management', 'enabled' => true, 'order' => 3],
                    ['label' => 'Store Location', 'path' => '/contact', 'enabled' => true, 'order' => 4],
                ],
                'categoryLinks' => [
                    ['label' => 'Phones & Tablets', 'path' => '/products?category=phones-tablets', 'enabled' => true, 'order' => 1],
                    ['label' => 'Audio & Headsets', 'path' => '/products?category=audio-headsets', 'enabled' => true, 'order' => 2],
                    ['label' => 'Smart Watch', 'path' => '/products?category=smart-watch', 'enabled' => true, 'order' => 3],
                    ['label' => 'Accessories', 'path' => '/products?category=accessories', 'enabled' => true, 'order' => 4],
                ],
            ],
            'footer' => [
                'enabled' => true,
                'logoUrl' => '',
                'logoText' => 'NST',
                'brandName' => 'New Singapur Telecom',
                'tagline' => 'Premium mobile, gadget and telecom shopping experience',
                'description' => 'Trusted mobile phones, gadgets, accessories, EMI, preorder and after-sales support in one premium shopping experience.',
                'columns' => [
                    [
                        'title' => 'Explore',
                        'enabled' => true,
                        'order' => 1,
                        'links' => [
                            ['label' => 'Products', 'path' => '/products', 'enabled' => true, 'order' => 1],
                            ['label' => 'Brands', 'path' => '/brands', 'enabled' => true, 'order' => 2],
                            ['label' => 'Offers', 'path' => '/offers', 'enabled' => true, 'order' => 3],
                            ['label' => 'Blog', 'path' => '/blog', 'enabled' => true, 'order' => 4],
                        ],
                    ],
                    [
                        'title' => 'Customer Care',
                        'enabled' => true,
                        'order' => 2,
                        'links' => [
                            ['label' => 'Contact Us', 'path' => '/contact', 'enabled' => true, 'order' => 1],
                            ['label' => 'EMI Calculator', 'path' => '/emi-calculator', 'enabled' => true, 'order' => 2],
                            ['label' => 'IMEI Check', 'path' => '/imei-check', 'enabled' => true, 'order' => 3],
                            ['label' => 'Customer Login', 'path' => '/management', 'enabled' => true, 'order' => 4],
                        ],
                    ],
                ],
                'address' => '',
                'email' => '',
                'phone' => '',
                'whatsapp' => '',
                'facebook' => '',
                'youtube' => '',
                'copyright' => '',
                'bottomText' => 'Secure shopping • Authentic products • Customer-first support',
                'showTrustBadge' => true,
                'trustBadgeText' => 'Trusted & verified merchant',
                'newsletter' => [
                    'enabled' => false,
                    'title' => 'Stay Updated',
                    'text' => 'Get product news, offers and preorder updates.',
                    'placeholder' => 'Email address',
                    'buttonLabel' => 'Subscribe',
                ],
                'badges' => ['Cash on Delivery', 'bKash Agent', 'Nagad Agent', 'Nationwide Delivery'],
                'backgroundStyle' => 'glass',
            ],
            'hero' => [
                'badge' => 'New Singapur Telecom',
                'headlinePrefix' => ['Explore', 'the'],
                'rotatingWords' => ['Excellence.', 'Future.', 'Innovation.', 'Possibilities.'],
                'subtitle' => "Here Budget Can't Stop You to Explore the Excellence.",
                'highlight' => "Budget Can't Stop You",
                'buttons' => [
                    ['label' => 'Used Devices', 'path' => '/products?condition=used', 'variant' => 'primary'],
                    ['label' => 'New Devices', 'path' => '/products?condition=new', 'variant' => 'dark'],
                ],
                'features' => [
                    ['title' => 'Check Your Device', 'text' => 'Verify authenticity', 'path' => '/imei-check'],
                    ['title' => 'EMI', 'text' => '0% interest options', 'path' => '/emi-calculator'],
                    ['title' => 'Pre Order Device', 'text' => 'Latest releases', 'path' => '/management'],
                    ['title' => 'Cash Kist', 'text' => 'Easy installments'],
                ],
                'visualTitle' => 'Premium Device Zone',
                'visualSubtitle' => 'New, used and pre-owned devices with verified support.',
                'visualBadges' => ['Official Warranty', 'IMEI Verified', 'Fast Delivery'],
            ],
            'builder' => [
                'schemaVersion' => 2,
                'compareLimit' => 3,
                'responsive' => [
                    'auto' => true,
                    'breakpoints' => ['mobile' => 430, 'tablet' => 1024, 'desktop' => 1440],
                    'safeArea' => true,
                    'iosFriendly' => true,
                    'androidFriendly' => true,
                ],
                'permissions' => [
                    'mode' => 'assigned',
                    'roles' => ['super_admin'],
                    'customCodeRoles' => ['super_admin'],
                ],
                'theme' => [
                    'name' => 'NST Green Commerce',
                    'primary' => '#16a34a',
                    'secondary' => '#065f46',
                    'accent' => '#f59e0b',
                    'background' => '#f8fafc',
                    'surface' => '#ffffff',
                    'text' => '#0f172a',
                    'mutedText' => '#64748b',
                    'border' => '#e2e8f0',
                    'success' => '#16a34a',
                    'warning' => '#f59e0b',
                    'danger' => '#dc2626',
                ],
                'componentCatalog' => [
                    'header','top_bar','navigation','mega_menu','hero','image_slider','carousel','video_banner','announcement','search','breadcrumb',
                    'category_grid','category_slider','product_grid','product_slider','featured_products','new_arrivals','best_sellers','flash_sale','deals','deal_countdown',
                    'brand_showcase','brand_slider','collection_grid','product_tabs','product_comparison','wishlist','recently_viewed','quick_view','recommendations','bundle',
                    'reviews','testimonials','customer_stories','statistics','icon_box','features_grid','services','pricing','team','timeline','portfolio','gallery','masonry',
                    'before_after','faq','accordion','tabs','toggle','progress','circular_progress','cta','newsletter','contact_form','contact_info','map','store_locator',
                    'branches','business_hours','live_chat','whatsapp','social_icons','social_feed','blog_posts','blog_categories','featured_article','related_posts','author_box',
                    'comments','news_ticker','events','calendar','download_center','apk_center','file_downloads','coupon_banner','promo_banner','popup','modal','offcanvas',
                    'sidebar','sticky','floating_action','divider','spacer','heading','text','rich_text','button','dual_button','image','image_text','video','audio','lottie','svg',
                    'shape_divider','code_block','html_embed','custom_css','custom_code','countdown','table','data_table','comparison_table','login','registration','forgot_password',
                    'otp','dashboard','order_history','cart','checkout','tracking','invoice','payments','emi_calculator','loan_calculator','currency_converter','qr','barcode','imei_checker',
                    'app_download','app_screenshots','app_features','changelog','roadmap','trust_badges','certifications','partners','clients','awards','footer','copyright','back_to_top',
                    'cookie_notice','age_verification','maintenance_notice','blank','container','row','column','nested_grid','repeater','dynamic_list','template','global_section','reusable_block','viewer_360'
                ],
                'pages' => [
                    [
                        'id' => 'home', 'name' => 'Home', 'slug' => '/', 'status' => 'draft',
                        'sections' => [
                            ['id' => 'home-header', 'type' => 'header', 'name' => 'Header', 'enabled' => true, 'settings' => []],
                            ['id' => 'home-hero', 'type' => 'image_slider', 'name' => 'Hero Slider', 'enabled' => true, 'settings' => ['layout' => 'split', 'effect' => 'fade']],
                            ['id' => 'home-deals', 'type' => 'deals', 'name' => 'Deals of The Day', 'enabled' => true, 'settings' => ['source' => 'used-products', 'limit' => 8]],
                            ['id' => 'home-footer', 'type' => 'footer', 'name' => 'Footer', 'enabled' => true, 'settings' => ['style' => 'original-black']],
                        ],
                    ],
                ],
            ],
            'productCard' => [
                'showOldPrice' => true,
                'showBadge' => true,
                'buttonLabel' => 'Buy Now',
                'cardStyle' => 'premium',
            ],
            'productPage' => [
                'whyBuy' => [
                    'enabled' => true,
                    'title' => 'Why Buy From NST?',
                    'items' => [
                        ['title' => '100% Original & Authentic', 'subtitle' => '', 'icon' => 'shield-check', 'link' => '', 'enabled' => true],
                        ['title' => 'Official Warranty', 'subtitle' => '', 'icon' => 'badge-check', 'link' => '', 'enabled' => true],
                        ['title' => 'Best Price in Bangladesh', 'subtitle' => '', 'icon' => 'tag', 'link' => '', 'enabled' => true],
                        ['title' => 'Trusted by 10,000+ Customers', 'subtitle' => '', 'icon' => 'users', 'link' => '/reviews', 'enabled' => true],
                        ['title' => 'Secure Payment & Easy Return', 'subtitle' => '', 'icon' => 'wallet-cards', 'link' => '', 'enabled' => true],
                    ],
                ],
                'emiCard' => [
                    'enabled' => true,
                    'title' => 'EMI Starts From',
                    'buttonLabel' => 'Check EMI Plan',
                    'description' => 'Calculated from active bank/provider rules.',
                    'image' => '',
                ],
                'trustStrip' => [
                    'enabled' => true,
                    'items' => [
                        ['title' => '100% Original Product', 'subtitle' => 'Official Warranty', 'icon' => 'shield-check', 'link' => '', 'enabled' => true],
                        ['title' => '7 Days', 'subtitle' => 'Replacement', 'icon' => 'refresh-cw', 'link' => '', 'enabled' => true],
                        ['title' => 'Trusted Support', 'subtitle' => '24/7 Customer Service', 'icon' => 'headphones', 'link' => '/contact', 'enabled' => true],
                        ['title' => 'Secure Payment', 'subtitle' => 'bKash, Nagad, Card', 'icon' => 'credit-card', 'link' => '', 'enabled' => true],
                    ],
                ],
                'bottomStats' => [
                    'enabled' => true,
                    'items' => [
                        ['number' => '15,000+', 'title' => 'Happy Customers', 'icon' => 'users', 'link' => '/reviews', 'enabled' => true],
                        ['number' => '100%', 'title' => 'Secure Payment', 'icon' => 'wallet-cards', 'link' => '', 'enabled' => true],
                        ['number' => '30 Days', 'title' => 'Easy Return', 'icon' => 'refresh-cw', 'link' => '', 'enabled' => true],
                        ['number' => 'Fast Delivery', 'title' => 'Inside Dhaka', 'icon' => 'truck', 'link' => '', 'enabled' => true],
                        ['number' => 'Nationwide', 'title' => 'Delivery Available', 'icon' => 'map-pin', 'link' => '', 'enabled' => true],
                        ['number' => '24/7 Support', 'title' => "We're Here to Help", 'icon' => 'headphones', 'link' => '/contact', 'enabled' => true],
                    ],
                ],
                'usedOptions' => ['enabled' => true, 'title' => 'Used (Pre-Owned) Options', 'buttonLabel' => 'View Used Options'],
                'compareSimilar' => ['enabled' => true, 'title' => 'Compare With Similar'],
                'share' => ['enabled' => true, 'title' => 'Share this product'],
                'googleSearch' => ['enabled' => true, 'label' => 'Search Details in Google', 'openInNewTab' => true],
                'compareNewUsed' => ['enabled' => true, 'title' => 'Compare New vs Used', 'subtitle' => 'Save more by comparing with high-quality used devices in similar condition.'],
            ],
            'googleMap' => [
                'apiKey' => '',
                'currentLocationLabel' => 'New Singapur Telecom',
                'latitude' => '',
                'longitude' => '',
            ],
            'seoEntities' => [
                'automaticFaqSchema' => true,
                'automaticSlugRedirect' => true,
                'canonicalEnabled' => true,
            ],
            'popup' => [
                'enabled' => true,
                'mobileFadeOnly' => true,
                'desktopDiagonal' => true,
                'intervalMs' => 11500,
                'visibleMs' => 3300,
                'items' => [
                    ['name' => 'Roni Mahmud', 'district' => 'Bogura', 'item' => 'Apple iPhone 17 Pro Max', 'action' => 'just purchased'],
                    ['name' => 'MH Kafi', 'district' => 'Dhaka', 'item' => 'Samsung Galaxy S26 Ultra', 'action' => 'just pre-ordered'],
                    ['name' => 'Aysha Hossain Ritu', 'district' => 'Sylhet', 'item' => 'Apple Watch Ultra 3', 'action' => 'just purchased'],
                    ['name' => 'Sabbir Ahmed', 'district' => 'Chittagong', 'item' => 'Anker 100W GaN Fast Charger', 'action' => 'just purchased'],
                ],
            ],
            'sections' => [
                [
                    'id' => 'preorder-now',
                    'type' => 'feature_grid',
                    'enabled' => true,
                    'eyebrow' => 'Future Ready',
                    'title' => 'Pre Order Now!',
                    'description' => 'Collect preorder interest and guide customers to verified device booking.',
                    'layout' => 'three',
                    'items' => [
                        ['title' => 'Upcoming iPhone', 'subtitle' => 'Priority booking with minimum payment', 'actionLabel' => 'Pre Order', 'actionPath' => '/management'],
                        ['title' => 'Flagship Samsung', 'subtitle' => 'Reserve before official arrival', 'actionLabel' => 'Book Now', 'actionPath' => '/management'],
                        ['title' => 'Gaming & Creator Gear', 'subtitle' => 'Laptop, tablet and accessories preorder', 'actionLabel' => 'Explore', 'actionPath' => '/products'],
                    ],
                ],
                [
                    'id' => 'seo-description',
                    'type' => 'text_block',
                    'enabled' => true,
                    'eyebrow' => 'About New Singapur Telecom',
                    'title' => 'Trusted mobile and gadget shopping destination',
                    'description' => 'New Singapur Telecom provides a premium retail experience for new, used, pre-owned and preorder devices with verification, warranty support, EMI guidance and reliable after-sales service.',
                    'layout' => 'two',
                    'items' => [],
                ],
            ],
        ];
    }
}
