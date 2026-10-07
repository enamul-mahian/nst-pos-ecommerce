<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\DangerZoneLog;
use App\Services\AccessControlService;
use App\Services\BusinessDataResetService;
use App\Services\ReportFileExportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class DataMaintenanceController extends Controller
{
    public function __construct(
        private ReportFileExportService $exporter,
        private BusinessDataResetService $resetService,
        private AccessControlService $accessControl
    ) {
    }

    private array $tables = [
        'users', 'roles', 'permissions', 'model_has_roles', 'role_has_permissions', 'branches',
        'categories', 'brands', 'products', 'product_variants', 'product_images', 'customers',
        'suppliers', 'purchases', 'purchase_items', 'device_units', 'branch_stocks', 'stock_movements',
        'stock_transfers', 'stock_transfer_items', 'stock_transfer_requests', 'branch_stock_requests',
        'sales', 'sale_items', 'sale_payments', 'customer_payments', 'supplier_payments',
        'expenses', 'orders', 'order_items', 'settings', 'audit_logs', 'google_posts',
        'user_access_controls', 'danger_zone_logs',
    ];

    public function overview(): JsonResponse
    {
        $tables = collect($this->availableTables())->map(function (string $table) {
            return [
                'name' => $table,
                'rows' => DB::table($table)->count(),
            ];
        })->values();

        return response()->json([
            'status' => true,
            'data' => [
                'tables' => $tables,
                'backups' => $this->backupFiles(),
                'danger_zone_options' => $this->resetService->options(),
            ],
        ]);
    }

    public function createBackup(Request $request): JsonResponse
    {
        $requestedTables = $request->input('tables', []);
        $tables = empty($requestedTables)
            ? $this->availableTables()
            : array_values(array_intersect($requestedTables, $this->availableTables()));

        if (empty($tables)) {
            return response()->json(['status' => false, 'message' => 'No valid tables selected for backup.'], 422);
        }

        $backupDirectory = storage_path('app/backups');
        if (! is_dir($backupDirectory)) {
            mkdir($backupDirectory, 0755, true);
        }

        $filename = 'nst_database_backup_' . now()->format('Y_m_d_His') . '.sql';
        $path = $backupDirectory . DIRECTORY_SEPARATOR . $filename;
        $handle = fopen($path, 'wb');

        fwrite($handle, "-- New Singapur Telecom Database Backup\n");
        fwrite($handle, "-- Created At: " . now()->toDateTimeString() . "\n");
        fwrite($handle, "-- This backup contains INSERT statements only. Restore into migrated database.\n\n");
        fwrite($handle, "SET FOREIGN_KEY_CHECKS=0;\n\n");

        foreach ($tables as $table) {
            $this->writeTableBackup($handle, $table);
        }

        fwrite($handle, "SET FOREIGN_KEY_CHECKS=1;\n");
        fclose($handle);

        return response()->json([
            'status' => true,
            'message' => 'Database backup created successfully.',
            'data' => ['file' => $filename, 'size' => filesize($path)],
        ]);
    }

    public function downloadBackup(string $file): BinaryFileResponse|JsonResponse
    {
        $filename = basename($file);
        $path = storage_path('app/backups/' . $filename);

        if (! is_file($path)) {
            return response()->json(['status' => false, 'message' => 'Backup file not found.'], 404);
        }

        return response()->download($path, $filename);
    }

    public function deleteBackup(string $file): JsonResponse
    {
        $filename = basename($file);
        $path = storage_path('app/backups/' . $filename);

        if (is_file($path)) {
            unlink($path);
        }

        return response()->json(['status' => true, 'message' => 'Backup file deleted.']);
    }

    public function exportCsv(Request $request)
    {
        $request->merge(['format' => 'csv']);
        return $this->exportTable($request);
    }

    public function exportTable(Request $request)
    {
        $table = $request->query('table', 'sales');
        $format = strtolower($request->query('format', 'csv'));

        if (! in_array($table, $this->availableTables(), true)) {
            return response()->json(['status' => false, 'message' => 'Invalid table selected for export.'], 422);
        }

        if (! in_array($format, ['csv', 'xlsx', 'pdf'], true)) {
            return response()->json(['status' => false, 'message' => 'Format must be csv, xlsx or pdf.'], 422);
        }

        $columns = Schema::getColumnListing($table);
        $query = DB::table($table);

        if (in_array('created_at', $columns, true)) {
            if ($request->filled('date_from')) {
                $query->whereDate('created_at', '>=', $request->query('date_from'));
            }
            if ($request->filled('date_to')) {
                $query->whereDate('created_at', '<=', $request->query('date_to'));
            }
        }

        $orderColumn = $this->orderColumn($table, $columns);
        $rows = $query->orderBy($orderColumn)
            ->limit(min((int) $request->query('limit', 10000), 10000))
            ->get()
            ->map(fn ($row) => (array) $row)
            ->all();

        $headers = array_map(fn ($column) => ucwords(str_replace('_', ' ', $column)), $columns);
        $normalizedRows = array_map(function (array $row) use ($columns, $headers) {
            $item = [];
            foreach ($columns as $index => $column) {
                $key = strtolower(preg_replace('/[^a-zA-Z0-9]+/', '_', trim($headers[$index])) ?: $headers[$index]);
                $item[$key] = $row[$column] ?? null;
            }
            return $item;
        }, $rows);

        return $this->exporter->download(
            'NST Table Export - ' . $table,
            $headers,
            $normalizedRows,
            $format,
            'nst_' . $table . '_' . now()->format('Y_m_d_His')
        );
    }

    public function dangerOptions(Request $request): JsonResponse
    {
        $this->authorizeDangerZone($request);

        return response()->json([
            'success' => true,
            'data' => $this->resetService->options(),
        ]);
    }

    public function cleanBusinessData(Request $request): JsonResponse
    {
        $this->authorizeDangerZone($request);

        $validated = $request->validate([
            'password' => ['required', 'string'],
            'confirmation_text' => ['required', 'string'],
            'options' => ['required', 'array', 'min:1'],
            'options.*' => ['string'],
        ]);

        if (! Hash::check($validated['password'], $request->user()->password)) {
            return response()->json(['success' => false, 'message' => 'Super Admin password is incorrect.'], 422);
        }

        if (trim($validated['confirmation_text']) !== 'DELETE BUSINESS DATA') {
            return response()->json(['success' => false, 'message' => 'Confirmation text must be DELETE BUSINESS DATA.'], 422);
        }

        $result = $this->resetService->clean($validated['options']);

        if (Schema::hasTable('danger_zone_logs')) {
            DangerZoneLog::create([
                'user_id' => $request->user()?->id,
                'action' => 'clean_business_data',
                'selected_options' => $result['selected_options'],
                'deleted_counts' => $result['deleted_counts'],
                'deleted_files_count' => $result['deleted_files_count'],
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Business data clean completed. Users, roles, permissions, branches, settings and access controls were preserved.',
            'data' => $result,
        ]);
    }

    private function authorizeDangerZone(Request $request): void
    {
        if (! $this->accessControl->isSuperAdmin($request->user())) {
            abort(403, 'Only Super Admin can use Danger Zone.');
        }
    }

    private function availableTables(): array
    {
        return array_values(array_filter($this->tables, fn (string $table) => Schema::hasTable($table)));
    }

    private function backupFiles(): array
    {
        $directory = storage_path('app/backups');
        if (! is_dir($directory)) {
            return [];
        }

        $files = glob($directory . DIRECTORY_SEPARATOR . 'nst_database_backup_*.sql') ?: [];

        return collect($files)
            ->map(fn (string $path) => ['file' => basename($path), 'size' => filesize($path), 'created_at' => date('Y-m-d H:i:s', filemtime($path))])
            ->sortByDesc('created_at')
            ->values()
            ->all();
    }

    private function writeTableBackup($handle, string $table): void
    {
        $columns = Schema::getColumnListing($table);
        if (empty($columns)) {
            return;
        }

        fwrite($handle, "-- Table: {$table}\n");
        $orderColumn = $this->orderColumn($table, $columns);

        DB::table($table)->orderBy($orderColumn)->chunk(300, function ($rows) use ($handle, $table, $columns) {
            foreach ($rows as $row) {
                $columnSql = collect($columns)->map(fn ($column) => '`' . str_replace('`', '``', $column) . '`')->implode(', ');
                $valueSql = collect($columns)->map(fn ($column) => $this->sqlValue($row->{$column} ?? null))->implode(', ');
                fwrite($handle, "INSERT INTO `{$table}` ({$columnSql}) VALUES ({$valueSql});\n");
            }
        });

        fwrite($handle, "\n");
    }

    private function orderColumn(string $table, array $columns): string
    {
        foreach (['id', 'created_at', 'updated_at'] as $candidate) {
            if (in_array($candidate, $columns, true)) {
                return $candidate;
            }
        }
        return $columns[0];
    }

    private function sqlValue(mixed $value): string
    {
        if ($value === null) {
            return 'NULL';
        }
        return "'" . str_replace(["\\", "'"], ["\\\\", "''"], (string) $value) . "'";
    }
}
