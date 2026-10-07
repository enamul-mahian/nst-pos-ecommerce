<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Dompdf\Dompdf;
use Dompdf\Options;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Font;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Symfony\Component\HttpFoundation\StreamedResponse;

class CustomReportController extends Controller
{
    /*
    |--------------------------------------------------------------------------
    | Source definitions
    |--------------------------------------------------------------------------
    |
    | Only business/reporting tables are exposed.
    | Sensitive auth/system tables are never available through this engine.
    |
    */

    private function definitions(): array
    {
        return [
            'sales' => [
                'label' => 'Sales',
                'tables' => ['sales', 'nst_sales'],
            ],

            'purchases' => [
                'label' => 'Purchases',
                'tables' => ['purchases', 'nst_purchases'],
            ],

            'customers' => [
                'label' => 'Customers',
                'tables' => ['customers', 'nst_customers'],
            ],

            'suppliers' => [
                'label' => 'Suppliers',
                'tables' => ['suppliers', 'nst_suppliers'],
            ],

            'sale_payments' => [
                'label' => 'Sale Payments / EMI',
                'tables' => ['sale_payments'],
            ],

            'staff' => [
                'label' => 'Staff / Employees',
                'tables' => ['nst_hr_employees'],
            ],

            'attendance' => [
                'label' => 'Attendance',
                'tables' => ['nst_hr_attendance'],
            ],

            'attendance_actions' => [
                'label' => 'Attendance IN / OUT',
                'tables' => ['nst_hr_attendance_actions'],
            ],

            'movement' => [
                'label' => 'Staff Movement',
                'tables' => ['nst_hr_movement_logs'],
            ],

            'payroll' => [
                'label' => 'Payroll',
                'tables' => ['nst_hr_payroll_entries'],
            ],

            'expenses' => [
                'label' => 'Expenses',
                'tables' => ['expenses', 'nst_expenses'],
            ],
        ];
    }

    private function resolveTable(string $source): string
    {
        $definitions = $this->definitions();

        abort_unless(
            isset($definitions[$source]),
            422,
            'Unsupported report source.'
        );

        foreach ($definitions[$source]['tables'] as $table) {
            if (Schema::hasTable($table)) {
                return $table;
            }
        }

        abort(422, 'Report source table is not available.');
    }

    /*
    |--------------------------------------------------------------------------
    | Hide sensitive/system columns
    |--------------------------------------------------------------------------
    */

    private function allowedColumns(string $table): array
    {
        $blockedExact = [
            'password',
            'remember_token',
            'token',
            'token_hash',
            'api_token',
            'access_token',
            'refresh_token',
            'two_factor_secret',
            'two_factor_recovery_codes',
        ];

        $blockedContains = [
            'password',
            'secret',
            'token_hash',
            'private_key',
        ];

        return collect(Schema::getColumnListing($table))
            ->reject(function ($column) use ($blockedExact, $blockedContains) {

                if (in_array($column, $blockedExact, true)) {
                    return true;
                }

                foreach ($blockedContains as $blocked) {
                    if (str_contains(strtolower($column), $blocked)) {
                        return true;
                    }
                }

                return false;
            })
            ->values()
            ->all();
    }

    public function sources()
    {
        $result = [];

        foreach ($this->definitions() as $key => $definition) {
            try {
                $table = $this->resolveTable($key);
            } catch (\Throwable $e) {
                continue;
            }

            $result[] = [
                'key' => $key,
                'label' => $definition['label'],
                'table' => $table,
                'columns' => $this->allowedColumns($table),
            ];
        }

        return response()->json(['data' => $result]);
    }

    private function dateColumn(string $table): ?string
    {
        foreach ([
            'attendance_date',
            'action_date',
            'movement_date',
            'sale_date',
            'purchase_date',
            'invoice_date',
            'payment_date',
            'expense_date',
            'created_at',
        ] as $column) {
            if (Schema::hasColumn($table, $column)) {
                return $column;
            }
        }

        return null;
    }

    private function build(Request $request): array
    {
        $data = $request->validate([
            'source' => ['required','string'],

            'columns' => ['nullable','array'],
            'columns.*' => ['string'],

            'filters' => ['nullable','array'],

            'group_by' => ['nullable','array'],
            'group_by.*' => ['string'],

            'sort_by' => ['nullable','string'],
            'sort_direction' => ['nullable','in:asc,desc'],

            'date_from' => ['nullable','date'],
            'date_to' => ['nullable','date'],

            'limit' => ['nullable','integer','min:1','max:10000'],

            'report_title' => ['nullable','string','max:200'],
        ]);

        $source = $data['source'];
        $table = $this->resolveTable($source);

        $allowed = $this->allowedColumns($table);

        $requestedColumns = collect($data['columns'] ?? [])
            ->filter(fn ($column) =>
                in_array($column, $allowed, true)
            )
            ->values()
            ->all();

        if (!$requestedColumns) {
            $requestedColumns = array_slice($allowed, 0, 20);
        }

        $query = DB::table($table);

        /*
        | Generic field filters
        */
        foreach (($data['filters'] ?? []) as $column => $value) {

            if (!in_array($column, $allowed, true)) {
                continue;
            }

            if ($value === '' || $value === null) {
                continue;
            }

            if (is_array($value)) {
                $clean = array_values(array_filter(
                    $value,
                    fn ($v) => $v !== '' && $v !== null
                ));

                if ($clean) {
                    $query->whereIn($column, $clean);
                }
            } else {
                $query->where($column, $value);
            }
        }

        /*
        | Date-range filter
        */
        $dateColumn = $this->dateColumn($table);

        if ($dateColumn) {

            if (!empty($data['date_from'])) {
                $query->whereDate(
                    $dateColumn,
                    '>=',
                    $data['date_from']
                );
            }

            if (!empty($data['date_to'])) {
                $query->whereDate(
                    $dateColumn,
                    '<=',
                    $data['date_to']
                );
            }
        }

        /*
        | Grouping
        */
        $groupBy = collect($data['group_by'] ?? [])
            ->filter(fn ($column) =>
                in_array($column, $allowed, true)
            )
            ->values()
            ->all();

        if ($groupBy) {

            $query->select($groupBy);
            $query->selectRaw('COUNT(*) AS row_count');

            foreach ($this->numericCandidates($table, $allowed) as $column) {
                $query->selectRaw(
                    "COALESCE(SUM(`{$column}`),0) AS `sum_{$column}`"
                );
            }

            $query->groupBy($groupBy);

        } else {

            $query->select($requestedColumns);
        }

        /*
        | Sorting
        */
        $sortBy = $data['sort_by'] ?? null;

        if (
            $sortBy &&
            (
                in_array($sortBy, $allowed, true) ||
                $sortBy === 'row_count' ||
                str_starts_with($sortBy, 'sum_')
            )
        ) {
            $query->orderBy(
                $sortBy,
                $data['sort_direction'] ?? 'asc'
            );
        } elseif ($dateColumn && !$groupBy) {
            $query->orderByDesc($dateColumn);
        }

        $limit = min(
            (int)($data['limit'] ?? 1000),
            10000
        );

        $rows = $query->limit($limit)->get();

        $outputColumns = $rows->first()
            ? array_keys((array)$rows->first())
            : ($groupBy ?: $requestedColumns);

        /*
        | Summary
        */
        $summary = [
            'records' => $rows->count(),
        ];

        foreach ($outputColumns as $column) {

            if (
                str_starts_with($column, 'sum_') ||
                $this->looksNumeric($column)
            ) {
                $summary[$column] = $rows->sum(
                    fn ($row) => is_numeric($row->{$column} ?? null)
                        ? (float)$row->{$column}
                        : 0
                );
            }
        }

        return [
            'source' => $source,
            'table' => $table,

            'title' =>
                $data['report_title']
                ?? $this->definitions()[$source]['label'].' Report',

            'columns' => $outputColumns,
            'rows' => $rows,
            'summary' => $summary,

            'date_from' => $data['date_from'] ?? null,
            'date_to' => $data['date_to'] ?? null,

            'filters' => $data['filters'] ?? [],
            'group_by' => $groupBy,
        ];
    }

    private function numericCandidates(string $table, array $columns): array
    {
        return collect($columns)
            ->filter(fn ($column) =>
                $this->looksNumeric($column)
            )
            ->take(20)
            ->values()
            ->all();
    }

    private function looksNumeric(string $column): bool
    {
        $column = strtolower($column);

        foreach ([
            'amount',
            'total',
            'price',
            'profit',
            'cost',
            'paid',
            'due',
            'discount',
            'commission',
            'bonus',
            'salary',
            'minutes',
            'count',
            'quantity',
            'qty',
        ] as $token) {
            if (str_contains($column, $token)) {
                return true;
            }
        }

        return false;
    }

    public function run(Request $request)
    {
        return response()->json([
            'data' => $this->build($request)
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | CSV
    |--------------------------------------------------------------------------
    */

    public function csv(Request $request): StreamedResponse
    {
        $report = $this->build($request);

        $filename =
            'nst-report-'.
            $report['source'].'-'.
            now()->format('Ymd-His').
            '.csv';

        return response()->streamDownload(
            function () use ($report) {

                $out = fopen('php://output', 'w');

                fprintf(
                    $out,
                    chr(0xEF).chr(0xBB).chr(0xBF)
                );

                fputcsv($out, [$report['title']]);

                fputcsv($out, [
                    'Generated',
                    now()->format('d M Y h:i A')
                ]);

                if ($report['date_from'] || $report['date_to']) {
                    fputcsv($out, [
                        'Period',
                        ($report['date_from'] ?? 'Beginning').
                        ' to '.
                        ($report['date_to'] ?? 'Today')
                    ]);
                }

                fputcsv($out, []);
                fputcsv($out, $report['columns']);

                foreach ($report['rows'] as $row) {

                    $line = [];

                    foreach ($report['columns'] as $column) {
                        $line[] = $row->{$column} ?? '';
                    }

                    fputcsv($out, $line);
                }

                fputcsv($out, []);
                fputcsv($out, ['SUMMARY']);

                foreach ($report['summary'] as $key => $value) {
                    fputcsv($out, [$key, $value]);
                }

                fclose($out);
            },
            $filename,
            ['Content-Type' => 'text/csv; charset=UTF-8']
        );
    }

    /*
    |--------------------------------------------------------------------------
    | XLSX
    |--------------------------------------------------------------------------
    */

    public function xlsx(Request $request)
    {
        $report = $this->build($request);

        $spreadsheet = new Spreadsheet();

        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Report');

        $columnCount = max(1, count($report['columns']));

        $sheet->setCellValue('A1', $report['title']);

        $sheet->mergeCells(
            'A1:'.
            \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex(
                $columnCount
            ).
            '1'
        );

        $sheet->getStyle('A1')->getFont()
            ->setBold(true)
            ->setSize(16);

        $sheet->setCellValue(
            'A2',
            'Generated: '.now()->format('d M Y h:i A')
        );

        $sheet->setCellValue(
            'A3',
            'Period: '.
            ($report['date_from'] ?? 'Beginning').
            ' to '.
            ($report['date_to'] ?? 'Today')
        );

        $headerRow = 5;

        foreach (
            $report['columns'] as $index => $column
        ) {
            $sheet->setCellValueByColumnAndRow(
                $index + 1,
                $headerRow,
                ucwords(str_replace('_',' ',$column))
            );
        }

        $sheet->getStyle(
            'A'.$headerRow.':'.
            \PhpOffice\PhpSpreadsheet\Cell\Coordinate::stringFromColumnIndex(
                $columnCount
            ).
            $headerRow
        )->getFont()->setBold(true);

        $rowNumber = $headerRow + 1;

        foreach ($report['rows'] as $row) {

            foreach (
                $report['columns'] as $index => $column
            ) {
                $value = $row->{$column} ?? '';

                $sheet->setCellValueByColumnAndRow(
                    $index + 1,
                    $rowNumber,
                    $value
                );
            }

            $rowNumber++;
        }

        $summaryStart = $rowNumber + 2;

        $sheet->setCellValue(
            'A'.$summaryStart,
            'SUMMARY'
        );

        $sheet->getStyle(
            'A'.$summaryStart
        )->getFont()->setBold(true);

        $summaryRow = $summaryStart + 1;

        foreach ($report['summary'] as $key => $value) {

            $sheet->setCellValue(
                'A'.$summaryRow,
                ucwords(str_replace('_',' ',$key))
            );

            $sheet->setCellValue(
                'B'.$summaryRow,
                $value
            );

            $summaryRow++;
        }

        for ($i = 1; $i <= $columnCount; $i++) {

            $letter =
                \PhpOffice\PhpSpreadsheet\Cell\Coordinate::
                stringFromColumnIndex($i);

            $sheet->getColumnDimension($letter)
                ->setAutoSize(true);
        }

        $sheet->freezePane('A'.($headerRow + 1));
        $sheet->setAutoFilter(
            'A'.$headerRow.':'.
            \PhpOffice\PhpSpreadsheet\Cell\Coordinate::
            stringFromColumnIndex($columnCount).
            $headerRow
        );

        $writer = new Xlsx($spreadsheet);

        $filename =
            'nst-report-'.
            $report['source'].'-'.
            now()->format('Ymd-His').
            '.xlsx';

        return response()->streamDownload(
            function () use ($writer) {
                $writer->save('php://output');
            },
            $filename,
            [
                'Content-Type' =>
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | PDF
    |--------------------------------------------------------------------------
    */

    public function pdf(Request $request)
    {
        $report = $this->build($request);

        $escape = fn ($value) =>
            htmlspecialchars(
                (string)$value,
                ENT_QUOTES,
                'UTF-8'
            );

        $html = '
<!doctype html>
<html>
<head>
<meta charset="UTF-8">
<style>
    @page {
        margin: 24px;
    }

    body {
        font-family: DejaVu Sans, sans-serif;
        font-size: 9px;
        color: #111827;
    }

    h1 {
        font-size: 18px;
        margin: 0 0 4px;
    }

    .brand {
        font-size: 12px;
        font-weight: bold;
        margin-bottom: 3px;
    }

    .meta {
        color: #4b5563;
        margin-bottom: 12px;
    }

    table {
        width: 100%;
        border-collapse: collapse;
    }

    th {
        background: #f1f5f9;
        font-weight: bold;
        text-align: left;
    }

    th, td {
        border: 1px solid #cbd5e1;
        padding: 4px;
        vertical-align: top;
        word-wrap: break-word;
    }

    .summary {
        margin-top: 18px;
        width: 45%;
    }

    .summary td:first-child {
        font-weight: bold;
    }

    .footer {
        margin-top: 15px;
        color: #64748b;
        font-size: 8px;
    }
</style>
</head>
<body>';

        $html .=
            '<div class="brand">New Singapur Telecom</div>';

        $html .=
            '<h1>'.$escape($report['title']).'</h1>';

        $html .=
            '<div class="meta">'.
            'Generated: '.
            $escape(now()->format('d M Y h:i A')).
            '<br>Period: '.
            $escape($report['date_from'] ?? 'Beginning').
            ' to '.
            $escape($report['date_to'] ?? 'Today').
            '</div>';

        $html .= '<table><thead><tr>';

        foreach ($report['columns'] as $column) {
            $html .=
                '<th>'.
                $escape(
                    ucwords(
                        str_replace('_',' ',$column)
                    )
                ).
                '</th>';
        }

        $html .= '</tr></thead><tbody>';

        foreach ($report['rows'] as $row) {

            $html .= '<tr>';

            foreach ($report['columns'] as $column) {

                $html .=
                    '<td>'.
                    $escape($row->{$column} ?? '').
                    '</td>';
            }

            $html .= '</tr>';
        }

        $html .= '</tbody></table>';

        $html .=
            '<table class="summary">'.
            '<thead><tr>'.
            '<th colspan="2">Summary</th>'.
            '</tr></thead><tbody>';

        foreach ($report['summary'] as $key => $value) {

            $html .=
                '<tr>'.
                '<td>'.
                $escape(
                    ucwords(str_replace('_',' ',$key))
                ).
                '</td>'.
                '<td>'.
                $escape($value).
                '</td>'.
                '</tr>';
        }

        $html .=
            '</tbody></table>'.
            '<div class="footer">'.
            'Generated from NST Custom Report Builder'.
            '</div>'.
            '</body></html>';

        $options = new Options();
        $options->set('isRemoteEnabled', false);
        $options->set('defaultFont', 'DejaVu Sans');

        $dompdf = new Dompdf($options);

        $dompdf->loadHtml($html, 'UTF-8');

        /*
         * Wide reports automatically use landscape.
         */
        $orientation =
            count($report['columns']) > 7
            ? 'landscape'
            : 'portrait';

        $dompdf->setPaper(
            'A4',
            $orientation
        );

        $dompdf->render();

        $filename =
            'nst-report-'.
            $report['source'].'-'.
            now()->format('Ymd-His').
            '.pdf';

        return response(
            $dompdf->output(),
            200,
            [
                'Content-Type' => 'application/pdf',
                'Content-Disposition' =>
                    'attachment; filename="'.$filename.'"',
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | Presets
    |--------------------------------------------------------------------------
    */

    public function presets(Request $request)
    {
        $query = DB::table('nst_custom_reports')
            ->orderBy('name');

        return response()->json([
            'data' => $query->get()->map(
                function ($row) {

                    foreach ([
                        'columns',
                        'filters',
                        'group_by',
                        'sorting',
                        'summary_fields'
                    ] as $field) {

                        $row->{$field} =
                            json_decode(
                                $row->{$field} ?? '[]',
                                true
                            ) ?: [];
                    }

                    return $row;
                }
            )
        ]);
    }

    public function savePreset(Request $request)
    {
        $data = $request->validate([
            'name' => ['required','string','max:180'],
            'source' => ['required','string','max:60'],

            'columns' => ['nullable','array'],
            'filters' => ['nullable','array'],
            'group_by' => ['nullable','array'],
            'sorting' => ['nullable','array'],
            'summary_fields' => ['nullable','array'],

            'is_shared' => ['nullable','boolean'],
        ]);

        /*
         * Validate source before saving.
         */
        $this->resolveTable($data['source']);

        $id = DB::table('nst_custom_reports')
            ->insertGetId([
                'name' => $data['name'],
                'source' => $data['source'],

                'columns' =>
                    json_encode($data['columns'] ?? []),

                'filters' =>
                    json_encode($data['filters'] ?? []),

                'group_by' =>
                    json_encode($data['group_by'] ?? []),

                'sorting' =>
                    json_encode($data['sorting'] ?? []),

                'summary_fields' =>
                    json_encode(
                        $data['summary_fields'] ?? []
                    ),

                'created_by' =>
                    optional($request->user())->id,

                'is_shared' =>
                    (bool)($data['is_shared'] ?? false),

                'created_at' => now(),
                'updated_at' => now(),
            ]);

        return response()->json([
            'message' =>
                'Custom report preset saved.',

            'data' =>
                DB::table('nst_custom_reports')
                ->find($id),
        ], 201);
    }

    public function deletePreset(int $id)
    {
        DB::table('nst_custom_reports')
            ->where('id', $id)
            ->delete();

        return response()->json([
            'message' => 'Preset deleted.'
        ]);
    }
}
