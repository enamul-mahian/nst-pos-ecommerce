<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class ProductSpecificationController extends Controller
{
    public function show(int $productId): JsonResponse
    {
        return response()->json(['status' => true, 'data' => $this->groups($productId)]);
    }

    public function save(Request $request, int $productId): JsonResponse
    {
        $validated = $request->validate([
            'mode' => ['nullable', Rule::in(['replace', 'merge'])],
            'groups' => ['required', 'array'], 'groups.*.name' => ['required', 'string', 'max:120'],
            'groups.*.is_visible' => ['nullable', 'boolean'], 'groups.*.rows' => ['required', 'array'],
            'groups.*.rows.*.label' => ['required', 'string', 'max:180'],
            'groups.*.rows.*.value' => ['nullable', 'string', 'max:20000'],
            'groups.*.rows.*.is_visible' => ['nullable', 'boolean'],
            'groups.*.rows.*.is_searchable' => ['nullable', 'boolean'],
        ]);
        abort_unless(Schema::hasTable('products') && DB::table('products')->where('id', $productId)->exists(), 404, 'Product not found.');
        DB::transaction(function () use ($validated, $productId) {
            if (($validated['mode'] ?? 'replace') === 'replace') {
                $groupIds = DB::table('product_spec_groups')->where('product_id', $productId)->pluck('id');
                if ($groupIds->isNotEmpty()) DB::table('product_spec_rows')->whereIn('group_id', $groupIds)->delete();
                DB::table('product_spec_groups')->where('product_id', $productId)->delete();
            }
            foreach ($validated['groups'] as $groupOrder => $group) {
                $existing = DB::table('product_spec_groups')->where('product_id', $productId)->where('name', $group['name'])->first();
                if ($existing) {
                    $groupId = $existing->id;
                    DB::table('product_spec_groups')->where('id', $groupId)->update(['sort_order' => $groupOrder, 'is_visible' => $group['is_visible'] ?? true, 'updated_at' => now()]);
                } else {
                    $groupId = DB::table('product_spec_groups')->insertGetId(['product_id' => $productId, 'name' => $group['name'], 'sort_order' => $groupOrder, 'is_visible' => $group['is_visible'] ?? true, 'created_at' => now(), 'updated_at' => now()]);
                }
                foreach ($group['rows'] as $rowOrder => $row) {
                    $payload = ['group_id' => $groupId, 'label' => $row['label'], 'value' => $this->sanitize($row['value'] ?? ''), 'sort_order' => $rowOrder, 'is_searchable' => $row['is_searchable'] ?? true, 'is_visible' => $row['is_visible'] ?? true, 'updated_at' => now()];
                    $existingRow = DB::table('product_spec_rows')->where('group_id', $groupId)->where('label', $row['label'])->first();
                    if ($existingRow) DB::table('product_spec_rows')->where('id', $existingRow->id)->update($payload);
                    else DB::table('product_spec_rows')->insert($payload + ['created_at' => now()]);
                }
            }
        });
        return response()->json(['status' => true, 'message' => 'Product specifications saved.', 'data' => $this->groups($productId)]);
    }

    public function import(Request $request, int $productId): JsonResponse
    {
        $validated = $request->validate([
            'source' => ['required', 'string', 'max:500000'],
            'format' => ['required', Rule::in(['auto', 'csv', 'html', 'text'])],
            'mode' => ['required', Rule::in(['replace', 'merge'])],
        ]);
        $groups = $this->parse($validated['source'], $validated['format']);
        abort_if($groups === [], 422, 'No specification rows could be detected.');
        $child = Request::create('/', 'POST', ['mode' => $validated['mode'], 'groups' => $groups]);
        $child->setUserResolver(fn () => $request->user());
        return $this->save($child, $productId);
    }

    public function extractDescriptionTables(Request $request, int $productId): JsonResponse
    {
        $validated = $request->validate(['mode' => ['required', Rule::in(['preview', 'move'])]]);
        $product = DB::table('products')->find($productId);
        abort_unless($product, 404, 'Product not found.');
        $description = (string) ($product->description ?? '');
        preg_match_all('/<table\b[^>]*>(.*?)<\/table>/is', $description, $tables);
        $groups = [];
        foreach ($tables[0] ?? [] as $index => $table) {
            $parsed = $this->parse($table, 'html');
            foreach ($parsed as $group) $groups[] = ['name' => count($tables[0]) > 1 ? $group['name'] . ' ' . ($index + 1) : $group['name'], 'rows' => $group['rows']];
        }
        if ($validated['mode'] === 'move' && $groups !== []) {
            $child = Request::create('/', 'POST', ['mode' => 'merge', 'groups' => $groups]);
            $child->setUserResolver(fn () => $request->user());
            $this->save($child, $productId);
            DB::table('products')->where('id', $productId)->update(['description' => trim(preg_replace('/<table\b[^>]*>.*?<\/table>/is', '', $description)), 'updated_at' => now()]);
        }
        return response()->json(['status' => true, 'message' => $validated['mode'] === 'move' ? 'Technical tables moved out of Description.' : 'Description table preview ready.', 'data' => ['groups' => $groups, 'table_count' => count($tables[0] ?? [])]]);
    }

    private function groups(int $productId): array
    {
        $groups = DB::table('product_spec_groups')->where('product_id', $productId)->orderBy('sort_order')->get();
        return $groups->map(function ($group) {
            $item = (array) $group;
            $item['rows'] = DB::table('product_spec_rows')->where('group_id', $group->id)->orderBy('sort_order')->get()->map(fn ($row) => (array) $row)->all();
            return $item;
        })->all();
    }

    private function parse(string $source, string $format): array
    {
        $format = $format === 'auto' ? (str_contains(Str::lower($source), '<table') ? 'html' : (str_contains($source, ',') ? 'csv' : 'text')) : $format;
        $rows = [];
        if ($format === 'html') {
            preg_match_all('/<tr\b[^>]*>(.*?)<\/tr>/is', $source, $trMatches);
            foreach ($trMatches[1] ?? [] as $tr) {
                preg_match_all('/<t[dh]\b[^>]*>(.*?)<\/t[dh]>/is', $tr, $cells);
                $values = array_map(fn ($cell) => trim(html_entity_decode(strip_tags($cell), ENT_QUOTES | ENT_HTML5, 'UTF-8')), $cells[1] ?? []);
                if (count($values) >= 2) $rows[] = [$values[0], implode(' · ', array_slice($values, 1))];
            }
        } else {
            foreach (preg_split('/\r\n|\r|\n/', $source) as $line) {
                $line = trim($line); if ($line === '') continue;
                $parts = $format === 'csv' ? str_getcsv($line) : preg_split('/\s*[:\t|]\s*/', $line, 2);
                if (count($parts) >= 2) $rows[] = [trim($parts[0]), trim(implode(' ', array_slice($parts, 1)))];
            }
        }
        if ($rows === []) return [];
        return [['name' => 'Specifications', 'is_visible' => true, 'rows' => array_map(fn ($row) => ['label' => $row[0], 'value' => $this->sanitize($row[1]), 'is_visible' => true, 'is_searchable' => true], $rows)]];
    }

    private function sanitize(string $value): string
    {
        return trim(strip_tags($value, '<br><b><strong><i><em><sup><sub><ul><ol><li>'));
    }
}
