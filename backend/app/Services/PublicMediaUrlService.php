<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;

class PublicMediaUrlService
{
    public static function forPath(?string $path, mixed $version = null): ?string
    {
        if (! $path) {
            return null;
        }

        $cleanPath = ltrim(str_replace('\\', '/', trim($path)), '/');
        if ($cleanPath === '') {
            return null;
        }

        if (Str::startsWith($cleanPath, ['http://', 'https://', 'data:', 'blob:'])) {
            return $cleanPath;
        }

        if (Str::startsWith($cleanPath, 'storage/')) {
            $cleanPath = substr($cleanPath, strlen('storage/'));
        }

        $resolvedPath = self::resolveExistingPath($cleanPath);
        if (! $resolvedPath) {
            return null;
        }

        $encodedPath = rtrim(strtr(base64_encode($resolvedPath), '+/', '-_'), '=');

        $base = rtrim((string) config('app.url'), '/');
        if (app()->bound('request')) {
            $request = request();
            if ($request && $request->getHost()) {
                $base = rtrim($request->getSchemeAndHttpHost(), '/');
            }
        }

        $url = $base . '/api/media-library/file/' . $encodedPath;
        if ($version) {
            $url .= '?v=' . rawurlencode((string) $version);
        }

        return $url;
    }

    private static function resolveExistingPath(string $path): ?string
    {
        try {
            $disk = Storage::disk('public');
            if ($disk->exists($path)) {
                return $path;
            }

            $directory = trim(dirname($path), '.');
            $filename = pathinfo($path, PATHINFO_FILENAME);
            $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

            foreach (['webp', 'jpg', 'jpeg', 'png', 'gif'] as $candidateExtension) {
                if ($candidateExtension === $extension) {
                    continue;
                }
                $candidate = trim($directory . '/' . $filename . '.' . $candidateExtension, '/');
                if ($candidate !== '' && $disk->exists($candidate)) {
                    return $candidate;
                }
            }
        } catch (Throwable $error) {
            report($error);
        }

        return null;
    }
}
