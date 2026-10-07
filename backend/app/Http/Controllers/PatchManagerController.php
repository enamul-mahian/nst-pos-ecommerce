<?php

namespace App\Http\Controllers;

use App\Services\AccessControlService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use RuntimeException;
use ZipArchive;

class PatchManagerController extends Controller
{
    private const PROTECTED_PATHS = ['pos/nst-v2.html'];

    public function status(Request $request)
    {
        $this->requireSuperAdmin($request);
        return response()->json([
            'status' => true,
            'message' => 'Patch Manager is ready.',
            'data' => [
                'mode' => 'replacement-only',
                'project_root' => $this->projectRoot(),
                'protected_paths' => self::PROTECTED_PATHS,
                'zip_supported' => class_exists(ZipArchive::class),
            ],
        ]);
    }

    public function validatePatch(Request $request)
    {
        $this->requireSuperAdmin($request);
        $validated = $request->validate([
            'patch' => ['required', 'file', 'mimes:zip', 'max:204800'],
        ]);

        $token = now()->format('Ymd_His') . '_' . Str::lower(Str::random(10));
        $root = $this->managerRoot();
        File::ensureDirectoryExists($root . '/uploads');
        File::ensureDirectoryExists($root . '/staging');
        $zipPath = $request->file('patch')->move($root . '/uploads', $token . '.zip')->getPathname();
        $stage = $root . '/staging/' . $token;
        File::ensureDirectoryExists($stage);

        try {
            $this->extractSafe($zipPath, $stage);
            $manifest = $this->readManifest($stage);
            $this->validateManifest($stage, $manifest);
            File::put($stage . '/validation.json', json_encode([
                'validated_at' => now()->toIso8601String(),
                'zip_path' => $zipPath,
                'user_id' => $request->user()->id,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } catch (\Throwable $exception) {
            File::deleteDirectory($stage);
            File::delete($zipPath);
            return response()->json(['status' => false, 'message' => $exception->getMessage()], 422);
        }

        return response()->json([
            'status' => true,
            'message' => 'Patch preflight validation passed.',
            'data' => [
                'validation_token' => $token,
                'patch_id' => $manifest['patch_id'] ?? $token,
                'file_count' => count($manifest['files'] ?? []),
                'protected_paths' => self::PROTECTED_PATHS,
            ],
        ]);
    }

    public function execute(Request $request)
    {
        $this->requireSuperAdmin($request);
        $validated = $request->validate(['validation_token' => ['required', 'alpha_dash', 'max:80']]);
        $token = $validated['validation_token'];
        $stage = $this->managerRoot() . '/staging/' . $token;
        abort_unless(File::exists($stage . '/validation.json'), 422, 'Patch has not passed validation.');

        $manifest = $this->readManifest($stage);
        $runId = now()->format('Ymd_His') . '_' . Str::lower(Str::random(8));
        $runRoot = $this->managerRoot() . '/runs/' . $runId;
        $backupRoot = $runRoot . '/backup';
        File::ensureDirectoryExists($backupRoot);
        $log = [];
        $created = [];

        try {
            foreach ($manifest['files'] as $entry) {
                $relative = $this->cleanRelativePath((string) $entry['path']);
                $source = $stage . '/payload/' . $relative;
                $target = $this->projectRoot() . '/' . $relative;
                if (File::exists($target)) {
                    File::ensureDirectoryExists(dirname($backupRoot . '/' . $relative));
                    File::copy($target, $backupRoot . '/' . $relative);
                } else {
                    $created[] = $relative;
                }
                File::ensureDirectoryExists(dirname($target));
                $temporary = $target . '.nst-patch-' . $runId . '.tmp';
                File::copy($source, $temporary);
                File::move($temporary, $target);
                $log[] = ['path' => $relative, 'status' => 'success'];
            }

            File::put($runRoot . '/run.json', json_encode([
                'run_id' => $runId,
                'patch_id' => $manifest['patch_id'] ?? $token,
                'applied_at' => now()->toIso8601String(),
                'applied_by' => $request->user()->id,
                'created_files' => $created,
                'files' => $log,
                'rolled_back_at' => null,
            ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } catch (\Throwable $exception) {
            $this->restoreRun($backupRoot, $created);
            File::put($runRoot . '/failure.txt', $exception->getMessage());
            return response()->json(['status' => false, 'message' => 'Patch failed and automatic rollback was attempted.'], 500);
        }

        return response()->json(['status' => true, 'message' => 'Patch applied successfully.', 'data' => ['run_id' => $runId, 'files' => $log]]);
    }

    public function runs(Request $request)
    {
        $this->requireSuperAdmin($request);
        $items = collect(File::directories($this->managerRoot() . '/runs'))
            ->map(function ($directory) {
                $path = $directory . '/run.json';
                return File::exists($path) ? json_decode(File::get($path), true) : null;
            })->filter()->sortByDesc('applied_at')->values();
        return response()->json(['status' => true, 'data' => $items]);
    }

    public function log(Request $request, string $id)
    {
        $this->requireSuperAdmin($request);
        $path = $this->managerRoot() . '/runs/' . basename($id) . '/run.json';
        abort_unless(File::exists($path), 404, 'Patch run not found.');
        return response()->json(['status' => true, 'data' => json_decode(File::get($path), true)]);
    }

    public function rollback(Request $request, string $id)
    {
        $this->requireSuperAdmin($request);
        $runRoot = $this->managerRoot() . '/runs/' . basename($id);
        $path = $runRoot . '/run.json';
        abort_unless(File::exists($path), 404, 'Patch run not found.');
        $run = json_decode(File::get($path), true) ?: [];
        abort_if(! empty($run['rolled_back_at']), 409, 'This patch run is already rolled back.');

        $this->restoreRun($runRoot . '/backup', $run['created_files'] ?? []);
        $run['rolled_back_at'] = now()->toIso8601String();
        $run['rolled_back_by'] = $request->user()->id;
        File::put($path, json_encode($run, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        return response()->json(['status' => true, 'message' => 'Patch rollback completed.', 'data' => $run]);
    }

    private function validateManifest(string $stage, array $manifest): void
    {
        if (empty($manifest['patch_id']) || ! is_array($manifest['files'] ?? null)) {
            throw new RuntimeException('Invalid manifest.json.');
        }
        foreach ($manifest['files'] as $entry) {
            $relative = $this->cleanRelativePath((string) ($entry['path'] ?? ''));
            $source = $stage . '/payload/' . $relative;
            if (! File::isFile($source)) throw new RuntimeException('Missing payload file: ' . $relative);
            $expected = strtolower((string) ($entry['sha256'] ?? ''));
            if ($expected === '' || ! hash_equals($expected, hash_file('sha256', $source))) {
                throw new RuntimeException('Checksum mismatch: ' . $relative);
            }
        }
    }

    private function readManifest(string $stage): array
    {
        $path = $stage . '/manifest.json';
        if (! File::isFile($path)) throw new RuntimeException('manifest.json is required.');
        $manifest = json_decode(File::get($path), true);
        if (! is_array($manifest)) throw new RuntimeException('manifest.json is invalid.');
        return $manifest;
    }

    private function cleanRelativePath(string $path): string
    {
        $path = str_replace('\\', '/', trim($path));
        if ($path === '' || str_starts_with($path, '/') || preg_match('#(^|/)\.\.(/|$)#', $path)) {
            throw new RuntimeException('Unsafe path in patch manifest.');
        }
        foreach (self::PROTECTED_PATHS as $protected) {
            if (strcasecmp($path, $protected) === 0) throw new RuntimeException('Protected path is blocked: ' . $path);
        }
        return $path;
    }

    private function extractSafe(string $zipPath, string $stage): void
    {
        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) throw new RuntimeException('Patch ZIP could not be opened.');
        for ($index = 0; $index < $zip->numFiles; $index++) {
            $name = str_replace('\\', '/', (string) $zip->getNameIndex($index));
            if (str_starts_with($name, '/') || preg_match('#(^|/)\.\.(/|$)#', $name)) {
                $zip->close();
                throw new RuntimeException('Unsafe ZIP path detected.');
            }
        }
        if (! $zip->extractTo($stage)) {
            $zip->close();
            throw new RuntimeException('Patch ZIP could not be extracted.');
        }
        $zip->close();
    }

    private function restoreRun(string $backupRoot, array $created): void
    {
        foreach ($created as $relative) {
            $target = $this->projectRoot() . '/' . $this->cleanRelativePath($relative);
            if (File::isFile($target)) File::delete($target);
        }
        if (! File::isDirectory($backupRoot)) return;
        foreach (File::allFiles($backupRoot) as $file) {
            $relative = str_replace('\\', '/', $file->getRelativePathname());
            $target = $this->projectRoot() . '/' . $relative;
            File::ensureDirectoryExists(dirname($target));
            File::copy($file->getPathname(), $target);
        }
    }

    private function requireSuperAdmin(Request $request): void
    {
        abort_unless(app(AccessControlService::class)->isSuperAdmin($request->user()), 403, 'Super Admin access is required.');
    }

    private function projectRoot(): string
    {
        return realpath(base_path('..')) ?: dirname(base_path());
    }

    private function managerRoot(): string
    {
        $path = storage_path('app/patch-manager');
        File::ensureDirectoryExists($path . '/runs');
        return $path;
    }
}
