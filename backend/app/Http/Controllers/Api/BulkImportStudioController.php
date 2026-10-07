<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BulkImportStudioController extends Controller
{
    private const MODULES = [
        'suppliers' => [
            'table' => 'suppliers', 'required' => ['name', 'phone'], 'duplicates' => ['phone'],
            'fields' => ['supplier_code', 'name', 'phone', 'email', 'address', 'opening_balance', 'current_balance', 'supplier_since', 'status', 'portal_enabled', 'reliability_score'],
        ],
        'products' => [
            'table' => 'products', 'required' => ['name', 'sale_price'], 'duplicates' => ['sku'],
            'fields' => ['name', 'sku', 'barcode', 'brand_id', 'category_id', 'supplier_id', 'model', 'condition', 'purchase_price', 'sale_price', 'regular_price', 'discount_price', 'status', 'short_description', 'description'],
        ],
        'device_stock' => [
            'table' => 'device_units', 'required' => ['product_id'], 'duplicates' => ['imei_1', 'sku'],
            'fields' => ['product_id', 'product_variant_id', 'branch_id', 'supplier_id', 'sku', 'barcode', 'imei_1', 'imei_2', 'color', 'ram', 'storage', 'purchase_price', 'sale_price', 'stock_status', 'service_status', 'notes'],
        ],
        'customers' => [
            'table' => 'customers', 'required' => ['name', 'phone'], 'duplicates' => ['phone', 'email'],
            'fields' => ['name', 'phone', 'email', 'address', 'branch_id', 'status', 'source'],
        ],
        'employees' => [
            'table' => 'nst_hr_employees', 'required' => ['name', 'joining_date'], 'duplicates' => ['employee_no', 'phone', 'email'],
            'fields' => ['employee_no', 'name', 'phone', 'email', 'branch_id', 'department_id', 'designation_id', 'shift_id', 'employment_type', 'joining_date', 'status'],
        ],
    ];

    public function modules(): JsonResponse
    {
        $modules = [];
        foreach (self::MODULES as $key => $definition) {
            $modules[] = [
                'key' => $key,
                'label' => Str::headline($key),
                'available' => Schema::hasTable($definition['table']),
                'table' => $definition['table'],
                'fields' => collect($definition['fields'])->map(fn ($field) => [
                    'key' => $field,
                    'label' => Str::headline($field),
                    'required' => in_array($field, $definition['required'], true),
                    'available' => Schema::hasTable($definition['table']) && Schema::hasColumn($definition['table'], $field),
                ])->values(),
                'duplicate_keys' => $definition['duplicates'],
            ];
        }
        return response()->json(['status' => true, 'data' => $modules]);
    }

    public function templates(Request $request): JsonResponse
    {
        $query = DB::table('bulk_import_templates')->where('is_active', true)->latest('id');
        if ($request->filled('module_key')) $query->where('module_key', $request->module_key);
        return response()->json(['status' => true, 'data' => $query->get()->map(fn ($row) => $this->decodeTemplate($row))]);
    }

    public function saveTemplate(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'id' => ['nullable', 'integer'], 'name' => ['required', 'string', 'max:150'],
            'module_key' => ['required', Rule::in(array_keys(self::MODULES))],
            'columns' => ['required', 'array', 'min:1'], 'columns.*' => ['required', 'string', 'max:100'],
            'defaults' => ['nullable', 'array'], 'is_default' => ['nullable', 'boolean'],
        ]);
        $definition = self::MODULES[$validated['module_key']];
        $columns = array_values(array_intersect($validated['columns'], $definition['fields']));
        abort_if($columns === [], 422, 'No supported field was selected.');
        foreach ($definition['required'] as $required) {
            abort_unless(in_array($required, $columns, true) || array_key_exists($required, $validated['defaults'] ?? []), 422, Str::headline($required) . ' must be selected or have a default value.');
        }
        if (! empty($validated['is_default'])) DB::table('bulk_import_templates')->where('module_key', $validated['module_key'])->update(['is_default' => false]);
        $payload = [
            'name' => $validated['name'], 'module_key' => $validated['module_key'],
            'columns' => json_encode($columns), 'defaults' => json_encode($validated['defaults'] ?? []),
            'is_default' => (bool) ($validated['is_default'] ?? false), 'is_active' => true,
            'updated_by' => $request->user()->id, 'updated_at' => now(),
        ];
        $id = $validated['id'] ?? null;
        if ($id) DB::table('bulk_import_templates')->where('id', $id)->update($payload);
        else $id = DB::table('bulk_import_templates')->insertGetId($payload + ['created_by' => $request->user()->id, 'created_at' => now()]);
        return response()->json(['status' => true, 'message' => 'Bulk import template saved.', 'data' => $this->decodeTemplate(DB::table('bulk_import_templates')->find($id))]);
    }

    public function downloadTemplate(Request $request, string $moduleKey)
    {
        abort_unless(isset(self::MODULES[$moduleKey]), 404, 'Unsupported import module.');
        $definition = self::MODULES[$moduleKey];
        $requested = array_filter(explode(',', (string) $request->query('columns', '')));
        $columns = $requested ? array_values(array_intersect($requested, $definition['fields'])) : $definition['fields'];
        foreach ($definition['required'] as $required) if (! in_array($required, $columns, true)) array_unshift($columns, $required);
        $columns = array_values(array_unique($columns));
        return response()->streamDownload(function () use ($columns) {
            $handle = fopen('php://output', 'w');
            fwrite($handle, "\xEF\xBB\xBF");
            fputcsv($handle, $columns);
            fclose($handle);
        }, $moduleKey . '_custom_template.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    public function preview(Request $request, string $moduleKey): JsonResponse
    {
        abort_unless(isset(self::MODULES[$moduleKey]), 404, 'Unsupported import module.');
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt', 'max:10240'],
            'mapping' => ['nullable'], 'defaults' => ['nullable'], 'template_id' => ['nullable', 'integer'],
        ]);
        $mapping = $this->jsonInput($validated['mapping'] ?? null);
        $defaults = $this->jsonInput($validated['defaults'] ?? null);
        [$header, $rows] = $this->readCsv($request->file('file')->getRealPath());
        abort_if($header === [], 422, 'CSV header is missing.');
        $definition = self::MODULES[$moduleKey];
        $mappedRows = [];
        $summary = ['total' => 0, 'valid' => 0, 'duplicate' => 0, 'failed' => 0];
        foreach ($rows as $index => $row) {
            if ($this->emptyRow($row)) continue;
            $summary['total']++;
            $data = $defaults;
            foreach ($header as $position => $csvColumn) {
                $target = $mapping[$csvColumn] ?? $csvColumn;
                if (in_array($target, $definition['fields'], true)) $data[$target] = trim((string) ($row[$position] ?? ''));
            }
            $errors = [];
            foreach ($definition['required'] as $required) if (trim((string) ($data[$required] ?? '')) === '') $errors[] = Str::headline($required) . ' is required.';
            $duplicate = $this->findDuplicate($definition, $data);
            if ($duplicate) $summary['duplicate']++;
            if ($errors) $summary['failed']++; else $summary['valid']++;
            $mappedRows[] = ['row_number' => $index + 2, 'data' => $data, 'errors' => $errors, 'duplicate' => $duplicate];
        }
        $uuid = (string) Str::uuid();
        $historyId = DB::table('bulk_import_histories')->insertGetId([
            'import_uuid' => $uuid, 'module_key' => $moduleKey, 'template_id' => $validated['template_id'] ?? null,
            'filename' => $request->file('file')->getClientOriginalName(), 'status' => 'previewed',
            'total_rows' => $summary['total'], 'duplicate_rows' => $summary['duplicate'], 'failed_rows' => $summary['failed'],
            'mapping' => json_encode($mapping), 'result' => json_encode(['summary' => $summary]),
            'rollback_payload' => json_encode(['rows' => $mappedRows, 'defaults' => $defaults]),
            'created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(),
        ]);
        return response()->json(['status' => true, 'message' => 'Preview complete. No data was imported.', 'data' => ['history_id' => $historyId, 'import_uuid' => $uuid, 'headers' => $header, 'summary' => $summary, 'rows' => array_slice($mappedRows, 0, 200)]]);
    }

    public function commit(Request $request, int $historyId): JsonResponse
    {
        $history = DB::table('bulk_import_histories')->lockForUpdate()->find($historyId);
        abort_unless($history, 404, 'Import preview not found.');
        abort_unless($history->status === 'previewed', 422, 'This preview was already committed or closed.');
        $definition = self::MODULES[$history->module_key] ?? null;
        abort_unless($definition && Schema::hasTable($definition['table']), 422, 'Target module is unavailable.');
        $payload = json_decode((string) $history->rollback_payload, true) ?: [];
        $rows = $payload['rows'] ?? [];
        $result = ['total' => count($rows), 'successful' => 0, 'skipped' => 0, 'duplicate' => 0, 'failed' => 0, 'errors' => [], 'inserted_ids' => []];

        DB::transaction(function () use ($rows, $definition, $history, &$result) {
            foreach ($rows as $row) {
                if (! empty($row['errors'])) { $result['failed']++; $result['errors'][] = ['row' => $row['row_number'], 'errors' => $row['errors']]; continue; }
                if (! empty($row['duplicate'])) { $result['duplicate']++; $result['skipped']++; continue; }
                try {
                    $id = $this->insertRow($history->module_key, $definition, $row['data']);
                    $result['successful']++; if ($id) $result['inserted_ids'][] = $id;
                } catch (\Throwable $exception) {
                    $result['failed']++; $result['errors'][] = ['row' => $row['row_number'], 'errors' => [$exception->getMessage()]];
                }
            }
            DB::table('bulk_import_histories')->where('id', $history->id)->update([
                'status' => 'committed', 'success_rows' => $result['successful'], 'skipped_rows' => $result['skipped'],
                'duplicate_rows' => $result['duplicate'], 'failed_rows' => $result['failed'], 'result' => json_encode($result),
                'rollback_payload' => json_encode(['inserted_ids' => $result['inserted_ids']]), 'updated_at' => now(),
            ]);
        });
        return response()->json(['status' => true, 'message' => 'Bulk import committed.', 'data' => $result]);
    }

    public function history(Request $request): JsonResponse
    {
        $query = DB::table('bulk_import_histories')->latest('id');
        if ($request->filled('module_key')) $query->where('module_key', $request->module_key);
        return response()->json(['status' => true, 'data' => $query->paginate((int) $request->get('per_page', 30))]);
    }

    private function insertRow(string $moduleKey, array $definition, array $data): ?int
    {
        $table = $definition['table'];
        $filtered = [];
        foreach ($definition['fields'] as $field) if (Schema::hasColumn($table, $field) && array_key_exists($field, $data) && $data[$field] !== '') $filtered[$field] = $data[$field];
        if ($moduleKey === 'suppliers') {
            $supplier = Supplier::create($filtered + ['status' => $filtered['status'] ?? 'active']);
            return $supplier->id;
        }
        if ($moduleKey === 'products') {
            if (Schema::hasColumn($table, 'slug') && empty($filtered['slug'])) $filtered['slug'] = Str::slug((string) $filtered['name']) . '-' . Str::lower(Str::random(6));
            if (Schema::hasColumn($table, 'status') && empty($filtered['status'])) $filtered['status'] = 'active';
        }
        if ($moduleKey === 'employees' && Schema::hasColumn($table, 'employee_no') && empty($filtered['employee_no'])) {
            $filtered['employee_no'] = 'EMP-' . str_pad((string) (((int) DB::table($table)->max('id')) + 1), 6, '0', STR_PAD_LEFT);
        }
        if (Schema::hasColumn($table, 'created_at')) $filtered['created_at'] = now();
        if (Schema::hasColumn($table, 'updated_at')) $filtered['updated_at'] = now();
        return DB::table($table)->insertGetId($filtered);
    }

    private function findDuplicate(array $definition, array $data): ?array
    {
        if (! Schema::hasTable($definition['table'])) return ['reason' => 'Target table is unavailable.'];
        foreach ($definition['duplicates'] as $key) {
            $value = trim((string) ($data[$key] ?? ''));
            if ($value === '' || ! Schema::hasColumn($definition['table'], $key)) continue;
            $row = DB::table($definition['table'])->where($key, $value)->first(['id', $key]);
            if ($row) return ['field' => $key, 'value' => $value, 'existing_id' => $row->id];
        }
        return null;
    }

    private function readCsv(string $path): array
    {
        $rows = []; $handle = fopen($path, 'r');
        while (($row = fgetcsv($handle, 0, ',')) !== false) $rows[] = $row;
        fclose($handle);
        if ($rows === []) return [[], []];
        $header = array_map(fn ($value) => trim(Str::lower(preg_replace('/^\xEF\xBB\xBF/', '', (string) $value))), array_shift($rows));
        return [$header, $rows];
    }

    private function emptyRow(array $row): bool
    {
        return count(array_filter($row, fn ($value) => trim((string) $value) !== '')) === 0;
    }

    private function jsonInput(mixed $value): array
    {
        if (is_array($value)) return $value;
        if (! is_string($value) || trim($value) === '') return [];
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function decodeTemplate(object $row): array
    {
        return array_merge((array) $row, [
            'columns' => json_decode((string) $row->columns, true) ?: [],
            'defaults' => json_decode((string) ($row->defaults ?? ''), true) ?: [],
        ]);
    }
}
