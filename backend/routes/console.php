<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('nst:media:audit {--apply : Remove stale local media references whose physical files no longer exist}', function () {
    $apply = (bool) $this->option('apply');
    $disk = \Illuminate\Support\Facades\Storage::disk('public');
    $missingProductImages = [];
    $missingProductFields = [];

    $resolveExisting = static function (?string $path) use ($disk): ?string {
        $path = ltrim(str_replace('\\', '/', trim((string) $path)), '/');
        if ($path === '' || \Illuminate\Support\Str::startsWith($path, ['http://', 'https://', 'data:', 'blob:'])) {
            return $path ?: null;
        }
        if (\Illuminate\Support\Str::startsWith($path, 'storage/')) {
            $path = substr($path, strlen('storage/'));
        }
        if ($disk->exists($path)) return $path;
        $directory = trim(dirname($path), '.');
        $filename = pathinfo($path, PATHINFO_FILENAME);
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        foreach (['webp', 'jpg', 'jpeg', 'png', 'gif'] as $candidateExtension) {
            if ($candidateExtension === $extension) continue;
            $candidate = trim($directory . '/' . $filename . '.' . $candidateExtension, '/');
            if ($candidate !== '' && $disk->exists($candidate)) return $candidate;
        }
        return null;
    };

    if (\Illuminate\Support\Facades\Schema::hasTable('product_images')) {
        \App\Models\ProductImage::query()->orderBy('id')->chunkById(200, function ($images) use (&$missingProductImages, $resolveExisting, $apply) {
            foreach ($images as $image) {
                if ($resolveExisting($image->image_path)) continue;
                $missingProductImages[] = [
                    'id' => $image->id,
                    'product_id' => $image->product_id,
                    'product_variant_id' => $image->product_variant_id,
                    'image_path' => $image->image_path,
                    'was_primary' => (bool) $image->is_primary,
                ];
            }
        });
    }

    if (\Illuminate\Support\Facades\Schema::hasTable('products') && \Illuminate\Support\Facades\Schema::hasColumn('products', 'image')) {
        \App\Models\Product::query()->whereNotNull('image')->orderBy('id')->chunkById(200, function ($products) use (&$missingProductFields, $resolveExisting, $apply) {
            foreach ($products as $product) {
                if ($resolveExisting($product->image)) continue;
                $missingProductFields[] = [
                    'id' => $product->id,
                    'sku' => $product->sku,
                    'name' => $product->name,
                    'image' => $product->image,
                ];
            }
        });
    }

    if ($apply) {
        \Illuminate\Support\Facades\DB::transaction(function () use ($missingProductImages, $missingProductFields) {
            $imageIds = collect($missingProductImages)->pluck('id')->filter()->values();
            foreach ($imageIds->chunk(500) as $chunk) {
                \App\Models\ProductImage::query()->whereIn('id', $chunk->all())->delete();
            }

            $productIds = collect($missingProductFields)->pluck('id')->filter()->values();
            foreach ($productIds->chunk(500) as $chunk) {
                \App\Models\Product::query()->whereIn('id', $chunk->all())->update(['image' => null]);
            }

            $groups = collect($missingProductImages)->groupBy(fn ($row) => ($row['product_id'] ?? 'none') . ':' . ($row['product_variant_id'] ?? 'none'));
            foreach ($groups as $rows) {
                if (! collect($rows)->contains('was_primary', true)) continue;
                $first = $rows->first();
                $replacement = \App\Models\ProductImage::query()
                    ->where('product_id', $first['product_id'])
                    ->when($first['product_variant_id'], fn ($query) => $query->where('product_variant_id', $first['product_variant_id']), fn ($query) => $query->whereNull('product_variant_id'))
                    ->orderBy('sort_order')->orderBy('id')->first();
                if ($replacement) {
                    $replacement->update(['is_primary' => true]);
                }
            }
        });
    }

    $report = [
        'mode' => $apply ? 'apply' : 'dry-run',
        'generated_at' => now()->toIso8601String(),
        'missing_product_image_records' => $missingProductImages,
        'missing_product_image_fields' => $missingProductFields,
        'removed_records' => $apply ? count($missingProductImages) : 0,
        'cleared_product_fields' => $apply ? count($missingProductFields) : 0,
    ];
    $reportPath = 'nst-media-audits/media-audit-' . now()->format('Ymd-His') . '.json';
    \Illuminate\Support\Facades\Storage::disk('local')->put($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    $this->info('NST media audit completed in ' . strtoupper($report['mode']) . ' mode.');
    $this->line('Missing product_images records: ' . count($missingProductImages));
    $this->line('Missing products.image fields: ' . count($missingProductFields));
    $this->line('Report: storage/app/' . $reportPath);
    if (! $apply && (count($missingProductImages) + count($missingProductFields)) > 0) {
        $this->warn('Run php artisan nst:media:audit --apply to remove only stale local references.');
    }
})->purpose('Audit and optionally repair missing NST product media references');

Artisan::command('nst:hrm:audit', function () {
    $tables = [
        'nst_hr_departments', 'nst_hr_designations', 'nst_hr_shifts', 'nst_hr_employees',
        'nst_hr_attendance', 'nst_hr_leave_types', 'nst_hr_leave_requests',
        'nst_hr_salary_structures', 'nst_hr_payroll_periods', 'nst_hr_payroll_entries',
        'nst_hr_loans', 'nst_hr_performance_reviews', 'nst_hr_operation_logs',
        'nst_hr_payslip_publications', 'nst_hr_payroll_entry_adjustments',
    ];
    $routes = [
        'hrm.overview', 'hrm.reference-data', 'hrm.reference-data.store',
        'hrm.reference-data.update', 'hrm.reference-data.delete', 'hrm.employees',
        'hrm.employees.store', 'hrm.employees.update', 'hrm.attendance',
        'hrm.attendance-summary', 'hrm.leaves', 'hrm.leaves.review',
        'hrm.leave-balances', 'hrm.salary-structures', 'hrm.payroll',
        'hrm.payroll.detail', 'hrm.payroll.action', 'hrm.payroll-entry.update',
        'hrm.payslips', 'hrm.payslips.publish', 'hrm.payroll.export',
        'hrm.loans', 'hrm.loans.action', 'hrm.performance',
        'hrm.performance.update', 'hrm.audit-history', 'hrm.acceptance-status',
    ];

    $tableStatus = collect($tables)->mapWithKeys(fn ($table) => [$table => \Illuminate\Support\Facades\Schema::hasTable($table)]);
    $routeStatus = collect($routes)->mapWithKeys(fn ($route) => [$route => \Illuminate\Support\Facades\Route::has($route)]);
    $counts = [];
    foreach ($tables as $table) {
        if ($tableStatus[$table]) $counts[$table] = \Illuminate\Support\Facades\DB::table($table)->count();
    }
    $report = [
        'generated_at' => now()->toIso8601String(),
        'database_ready' => $tableStatus->every(fn ($ready) => $ready === true),
        'routes_ready' => $routeStatus->every(fn ($ready) => $ready === true),
        'tables' => $tableStatus,
        'routes' => $routeStatus,
        'record_counts' => $counts,
    ];
    $reportPath = 'nst-hrm-audits/hrm-audit-' . now()->format('Ymd-His') . '.json';
    \Illuminate\Support\Facades\Storage::disk('local')->put($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    $this->line('Database ready: ' . ($report['database_ready'] ? 'YES' : 'NO'));
    $this->line('Routes ready: ' . ($report['routes_ready'] ? 'YES' : 'NO'));
    $this->line('Report: storage/app/' . $reportPath);
    foreach ($tableStatus->filter(fn ($ready) => ! $ready) as $table => $ready) $this->error('Missing table: ' . $table);
    foreach ($routeStatus->filter(fn ($ready) => ! $ready) as $route => $ready) $this->error('Missing route: ' . $route);
    return ($report['database_ready'] && $report['routes_ready']) ? 0 : 1;
})->purpose('Audit NST HRM database tables, routes and record counts');
