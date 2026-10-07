<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProductMediaService
{
    private int $maxImageWidth = 1400;
    private int $maxThumbnailWidth = 420;
    private string $watermarkText = 'New Singapur Telecom';

    public function processUploadedMedia(UploadedFile $file): array
    {
        $mimeType = $file->getMimeType() ?: $file->getClientMimeType();
        $originalName = $file->getClientOriginalName();
        $sizeKb = (int) ceil($file->getSize() / 1024);

        if ($this->isVideo($file)) {
            return $this->processVideo($file, $originalName, $mimeType, $sizeKb);
        }

        return $this->processImage($file, $originalName, $mimeType, $sizeKb);
    }

    private function processImage(UploadedFile $file, string $originalName, ?string $mimeType, int $sizeKb): array
    {
        $folder = 'products/media/' . now()->format('Y/m');
        $thumbnailFolder = 'products/thumbnails/' . now()->format('Y/m');

        $baseName = Str::uuid()->toString();
        $imagePath = $folder . '/' . $baseName . '.webp';
        $thumbnailPath = $thumbnailFolder . '/' . $baseName . '_thumb.webp';

        $sourceImage = $this->createImageResource($file->getRealPath(), $mimeType);

        if (!$sourceImage) {
            $fallbackPath = $file->storeAs(
                $folder,
                $baseName . '.' . strtolower($file->getClientOriginalExtension()),
                'public'
            );

            return [
                'media_type' => 'image',
                'image_path' => $fallbackPath,
                'thumbnail_path' => $fallbackPath,
                'original_name' => $originalName,
                'mime_type' => $mimeType,
                'size_kb' => $sizeKb,
                'processed_size_kb' => $this->fileSizeKbFromStorage($fallbackPath),
            ];
        }

        $processedImage = $this->resizeImageToMaxWidth($sourceImage, $this->maxImageWidth);
        $this->applyWatermark($processedImage);

        $thumbnailImage = $this->resizeImageToMaxWidth($sourceImage, $this->maxThumbnailWidth);

        $storedImage = $this->storeOptimizedImage($processedImage, $imagePath, 82);
        $storedThumbnail = $this->storeOptimizedImage($thumbnailImage, $thumbnailPath, 78);

        imagedestroy($sourceImage);

        if ($processedImage) {
            imagedestroy($processedImage);
        }

        if ($thumbnailImage) {
            imagedestroy($thumbnailImage);
        }

        return [
            'media_type' => 'image',
            'image_path' => $storedImage['path'],
            'thumbnail_path' => $storedThumbnail['path'] ?: $storedImage['path'],
            'original_name' => $originalName,
            'mime_type' => $storedImage['mime_type'],
            'size_kb' => $sizeKb,
            'processed_size_kb' => $this->fileSizeKbFromStorage($storedImage['path']),
        ];
    }

    private function processVideo(UploadedFile $file, string $originalName, ?string $mimeType, int $sizeKb): array
    {
        $folder = 'products/videos/' . now()->format('Y/m');

        $extension = strtolower($file->getClientOriginalExtension() ?: 'mp4');
        $fileName = Str::uuid()->toString() . '.' . $extension;

        $videoPath = $file->storeAs($folder, $fileName, 'public');

        return [
            'media_type' => 'video',
            'image_path' => $videoPath,
            'thumbnail_path' => null,
            'original_name' => $originalName,
            'mime_type' => $mimeType ?: 'video/mp4',
            'size_kb' => $sizeKb,
            'processed_size_kb' => $this->fileSizeKbFromStorage($videoPath),
        ];
    }

    private function isVideo(UploadedFile $file): bool
    {
        $mimeType = strtolower($file->getMimeType() ?: $file->getClientMimeType() ?: '');
        $extension = strtolower($file->getClientOriginalExtension() ?: '');

        return str_starts_with($mimeType, 'video/')
            || in_array($extension, ['mp4', 'mov', 'avi', 'mkv', 'webm'], true);
    }

    private function createImageResource(string $path, ?string $mimeType)
    {
        $mimeType = strtolower($mimeType ?: '');

        try {
            if (str_contains($mimeType, 'jpeg') || str_contains($mimeType, 'jpg')) {
                return imagecreatefromjpeg($path);
            }

            if (str_contains($mimeType, 'png')) {
                return imagecreatefrompng($path);
            }

            if (str_contains($mimeType, 'webp') && function_exists('imagecreatefromwebp')) {
                return imagecreatefromwebp($path);
            }

            $imageInfo = @getimagesize($path);

            if (!$imageInfo || empty($imageInfo['mime'])) {
                return null;
            }

            return match ($imageInfo['mime']) {
                'image/jpeg' => imagecreatefromjpeg($path),
                'image/png' => imagecreatefrompng($path),
                'image/webp' => function_exists('imagecreatefromwebp') ? imagecreatefromwebp($path) : null,
                default => null,
            };
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function resizeImageToMaxWidth($sourceImage, int $maxWidth)
    {
        $sourceWidth = imagesx($sourceImage);
        $sourceHeight = imagesy($sourceImage);

        if ($sourceWidth <= 0 || $sourceHeight <= 0) {
            return null;
        }

        if ($sourceWidth <= $maxWidth) {
            $newWidth = $sourceWidth;
            $newHeight = $sourceHeight;
        } else {
            $newWidth = $maxWidth;
            $newHeight = (int) round(($sourceHeight / $sourceWidth) * $newWidth);
        }

        $newImage = imagecreatetruecolor($newWidth, $newHeight);

        imagealphablending($newImage, false);
        imagesavealpha($newImage, true);

        $transparent = imagecolorallocatealpha($newImage, 255, 255, 255, 127);
        imagefilledrectangle($newImage, 0, 0, $newWidth, $newHeight, $transparent);

        imagecopyresampled(
            $newImage,
            $sourceImage,
            0,
            0,
            0,
            0,
            $newWidth,
            $newHeight,
            $sourceWidth,
            $sourceHeight
        );

        return $newImage;
    }

    private function applyWatermark($image): void
    {
        if (!$image) {
            return;
        }

        $width = imagesx($image);
        $height = imagesy($image);

        if ($width < 250 || $height < 120) {
            return;
        }

        $fontSize = 5;
        $padding = 14;

        $textWidth = imagefontwidth($fontSize) * strlen($this->watermarkText);
        $textHeight = imagefontheight($fontSize);

        $x = max($padding, $width - $textWidth - $padding);
        $y = max($padding, $height - $textHeight - $padding);

        $bgColor = imagecolorallocatealpha($image, 0, 0, 0, 70);
        $textColor = imagecolorallocatealpha($image, 255, 255, 255, 10);

        imagefilledrectangle(
            $image,
            $x - 8,
            $y - 6,
            $x + $textWidth + 8,
            $y + $textHeight + 6,
            $bgColor
        );

        imagestring($image, $fontSize, $x, $y, $this->watermarkText, $textColor);
    }

    private function storeOptimizedImage($image, string $path, int $quality = 82): array
    {
        if (!$image) {
            return [
                'path' => null,
                'mime_type' => null,
            ];
        }

        if (function_exists('imagewebp')) {
            ob_start();
            imagewebp($image, null, $quality);
            $imageData = ob_get_clean();

            if ($imageData !== false && $imageData !== '') {
                Storage::disk('public')->put($path, $imageData);

                return [
                    'path' => $path,
                    'mime_type' => 'image/webp',
                ];
            }
        }

        $jpegPath = preg_replace('/\.webp$/', '.jpg', $path) ?: $path . '.jpg';

        ob_start();
        imagejpeg($image, null, min(95, max(60, $quality)));
        $imageData = ob_get_clean();

        Storage::disk('public')->put($jpegPath, $imageData ?: '');

        return [
            'path' => $jpegPath,
            'mime_type' => 'image/jpeg',
        ];
    }

    private function fileSizeKbFromStorage(?string $path): int
    {
        if (!$path || !Storage::disk('public')->exists($path)) {
            return 0;
        }

        return (int) ceil(Storage::disk('public')->size($path) / 1024);
    }
}