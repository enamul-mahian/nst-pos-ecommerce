<?php

namespace App\Services;

use Illuminate\Http\Response;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;
use App\Support\SimpleZipWriter;

class ReportFileExportService
{
    public function download(string $title, array $headers, array $rows, string $format, ?string $filename = null): StreamedResponse|BinaryFileResponse|Response
    {
        $format = strtolower($format ?: 'csv');
        $safeTitle = $this->safeFilename($filename ?: $title . '_' . now()->format('Y_m_d_His'));

        if ($format === 'xlsx') {
            return $this->downloadXlsx($safeTitle . '.xlsx', $title, $headers, $rows);
        }

        if ($format === 'pdf') {
            return $this->downloadPdf($safeTitle . '.pdf', $title, $headers, $rows);
        }

        return $this->downloadCsv($safeTitle . '.csv', $headers, $rows);
    }

    private function downloadCsv(string $filename, array $headers, array $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($headers, $rows) {
            $handle = fopen('php://output', 'wb');
            fprintf($handle, chr(0xEF) . chr(0xBB) . chr(0xBF));
            fputcsv($handle, $headers);

            foreach ($rows as $row) {
                fputcsv($handle, $this->rowValues($headers, $row));
            }

            fclose($handle);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    private function downloadXlsx(string $filename, string $title, array $headers, array $rows): BinaryFileResponse
    {
        $directory = storage_path('app/exports');
        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $path = $directory . DIRECTORY_SEPARATOR . $filename;

        $entries = [
            '[Content_Types].xml' => $this->contentTypesXml(),
            '_rels/.rels' => $this->rootRelsXml(),
            'docProps/app.xml' => $this->appXml(),
            'docProps/core.xml' => $this->coreXml($title),
            'xl/workbook.xml' => $this->workbookXml($title),
            'xl/_rels/workbook.xml.rels' => $this->workbookRelsXml(),
            'xl/styles.xml' => $this->stylesXml(),
            'xl/worksheets/sheet1.xml' => $this->sheetXml($title, $headers, $rows),
        ];

        if (class_exists('ZipArchive')) {
            $zip = new \ZipArchive();

            if ($zip->open($path, \ZipArchive::CREATE | \ZipArchive::OVERWRITE) !== true) {
                abort(500, __('messages.export.xlsx_create_failed'));
            }

            foreach ($entries as $entryName => $entryContent) {
                $zip->addFromString($entryName, $entryContent);
            }

            $zip->close();
        } else {
            // XLSX export still works without the PHP zip extension.
            // An XLSX file is a ZIP package; this writer builds a valid uncompressed ZIP.
            SimpleZipWriter::create($path, $entries);
        }

        return response()->download($path, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend(true);
    }

    private function downloadPdf(string $filename, string $title, array $headers, array $rows): Response
    {
        $lines = [];
        $lines[] = $title;
        $lines[] = 'Generated: ' . now()->format('Y-m-d H:i:s');
        $lines[] = str_repeat('-', 110);
        $lines[] = implode(' | ', $headers);
        $lines[] = str_repeat('-', 110);

        foreach (array_slice($rows, 0, 450) as $row) {
            $values = array_map(fn ($value) => $this->pdfText($value), $this->rowValues($headers, $row));
            $lines[] = mb_strimwidth(implode(' | ', $values), 0, 145, '...');
        }

        if (count($rows) > 450) {
            $lines[] = 'Only first 450 rows are printed in this simple PDF. Please use XLSX/CSV for full export.';
        }

        $pdf = $this->simplePdf($lines);

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . $filename . '"',
        ]);
    }

    private function rowValues(array $headers, array|object $row): array
    {
        $rowArray = is_array($row) ? $row : (array) $row;

        return array_map(function ($header) use ($rowArray) {
            $key = $this->keyFromHeader($header);
            $value = $rowArray[$key] ?? $rowArray[$header] ?? null;

            if (is_bool($value)) {
                return $value ? 'Yes' : 'No';
            }

            if (is_array($value) || is_object($value)) {
                return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }

            return $value;
        }, $headers);
    }

    private function keyFromHeader(string $header): string
    {
        return strtolower(preg_replace('/[^a-zA-Z0-9]+/', '_', trim($header)) ?: $header);
    }

    private function sheetXml(string $title, array $headers, array $rows): string
    {
        $sheetData = [];
        $sheetData[] = $this->xmlRow(1, [['value' => $title, 'style' => 2]]);
        $sheetData[] = $this->xmlRow(2, [['value' => 'Generated: ' . now()->format('Y-m-d H:i:s'), 'style' => 3]]);
        $sheetData[] = $this->xmlRow(4, array_map(fn ($header) => ['value' => $header, 'style' => 1], $headers));

        $rowNumber = 5;
        foreach ($rows as $row) {
            $sheetData[] = $this->xmlRow($rowNumber, array_map(fn ($value) => ['value' => $value, 'style' => 0], $this->rowValues($headers, $row)));
            $rowNumber++;
        }

        $columnXml = '';
        $columnCount = max(1, count($headers));
        for ($i = 1; $i <= $columnCount; $i++) {
            $columnXml .= '<col min="' . $i . '" max="' . $i . '" width="22" customWidth="1"/>';
        }

        $mergeXml = count($headers) > 1
            ? '<mergeCells count="1"><mergeCell ref="A1:' . $this->columnName(count($headers)) . '1"/></mergeCells>'
            : '';

        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            . '<cols>' . $columnXml . '</cols>'
            . '<sheetData>' . implode('', $sheetData) . '</sheetData>'
            . $mergeXml
            . '<autoFilter ref="A4:' . $this->columnName($columnCount) . max(4, $rowNumber - 1) . '"/>'
            . '</worksheet>';
    }

    private function xmlRow(int $rowNumber, array $cells): string
    {
        $xml = '<row r="' . $rowNumber . '">';
        $column = 1;

        foreach ($cells as $cell) {
            $ref = $this->columnName($column) . $rowNumber;
            $value = $this->xmlEscape((string) ($cell['value'] ?? ''));
            $style = (int) ($cell['style'] ?? 0);
            $xml .= '<c r="' . $ref . '" s="' . $style . '" t="inlineStr"><is><t>' . $value . '</t></is></c>';
            $column++;
        }

        return $xml . '</row>';
    }

    private function columnName(int $index): string
    {
        $name = '';
        while ($index > 0) {
            $index--;
            $name = chr(65 + ($index % 26)) . $name;
            $index = intdiv($index, 26);
        }
        return $name;
    }

    private function xmlEscape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    private function safeFilename(string $name): string
    {
        $safe = preg_replace('/[^a-zA-Z0-9_\-]+/', '_', strtolower($name));
        return trim($safe ?: 'nst_export', '_');
    }

    private function pdfText(mixed $value): string
    {
        $text = $this->pdfAscii((string) $value);
        return str_replace(["\\", "(", ")"], ["\\\\", "\\(", "\\)"], $text);
    }

    private function simplePdf(array $lines): string
    {
        $objects = [];
        $content = "BT\n/F1 9 Tf\n50 790 Td\n12 TL\n";

        foreach ($lines as $line) {
            $content .= '(' . $this->pdfText($line) . ") Tj\nT*\n";
        }

        $content .= "ET";

        $objects[] = '<< /Type /Catalog /Pages 2 0 R >>';
        $objects[] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
        $objects[] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>';
        $objects[] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
        $objects[] = '<< /Length ' . strlen($content) . " >>\nstream\n" . $content . "\nendstream";

        $pdf = "%PDF-1.4\n";
        $offsets = [0];

        foreach ($objects as $i => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= ($i + 1) . " 0 obj\n" . $object . "\nendobj\n";
        }

        $xref = strlen($pdf);
        $pdf .= "xref\n0 " . (count($objects) + 1) . "\n";
        $pdf .= "0000000000 65535 f \n";

        for ($i = 1; $i <= count($objects); $i++) {
            $pdf .= str_pad((string) $offsets[$i], 10, '0', STR_PAD_LEFT) . " 00000 n \n";
        }

        $pdf .= "trailer\n<< /Size " . (count($objects) + 1) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF";

        return $pdf;
    }

    private function contentTypesXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            . '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            . '<Default Extension="xml" ContentType="application/xml"/>'
            . '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
            . '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
            . '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            . '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            . '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            . '</Types>';
    }

    private function rootRelsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
            . '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
            . '</Relationships>';
    }

    private function workbookRelsXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            . '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            . '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            . '</Relationships>';
    }

    private function workbookXml(string $title): string
    {
        $sheetName = mb_substr(preg_replace('/[\\\/\?\*\[\]:]/', ' ', $title), 0, 31) ?: 'Report';
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            . '<sheets><sheet name="' . $this->xmlEscape($sheetName) . '" sheetId="1" r:id="rId1"/></sheets>'
            . '</workbook>';
    }

    private function stylesXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            . '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF1B2A4A"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font></fonts>'
            . '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1B2A4A"/><bgColor indexed="64"/></patternFill></fill></fills>'
            . '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border></borders>'
            . '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
            . '<cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
            . '</styleSheet>';
    }

    private function appXml(): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>New Singapur Telecom</Application></Properties>';
    }

    private function coreXml(string $title): string
    {
        return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            . '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            . '<dc:title>' . $this->xmlEscape($title) . '</dc:title><dc:creator>New Singapur Telecom</dc:creator><cp:lastModifiedBy>New Singapur Telecom</cp:lastModifiedBy>'
            . '<dcterms:created xsi:type="dcterms:W3CDTF">' . now()->toAtomString() . '</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">' . now()->toAtomString() . '</dcterms:modified>'
            . '</cp:coreProperties>';
    }

    /**
     * The built-in PDF writer uses the base-14 Helvetica font, which only covers ASCII here.
     * Transliterate common Unicode (৳, smart quotes, dashes, accents) instead of printing "?".
     */
    private function pdfAscii(string $text): string
    {
        $text = strtr($text, ['৳' => 'Tk ', '€' => 'EUR ', '£' => 'GBP ', '•' => '-', '·' => '-', '…' => '...', '–' => '-', '—' => '-', '‘' => "'", '’' => "'", '“' => '"', '”' => '"', "\u{00A0}" => ' ']);
        if (function_exists('iconv')) {
            $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
            if ($converted !== false) $text = $converted;
        }
        return preg_replace('/[^\x20-\x7E]/', '?', $text);
    }
}
