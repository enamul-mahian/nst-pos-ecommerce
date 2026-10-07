<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\NstFile;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class NstFileController extends Controller
{
    public function publicIndex()
    {
        return response()->json(['status' => true, 'data' => NstFile::query()
            ->where('status', 'published')->whereNull('archived_at')->latest('published_at')->get()]);
    }

    public function publicDownload(NstFile $file)
    {
        abort_unless($file->status === 'published' && !$file->archived_at, 404);
        $file->increment('download_count');
        if ($file->external_url) return redirect()->away($file->external_url);
        abort_unless($file->file_path && Storage::disk('local')->exists($file->file_path), 404);
        return Storage::disk('local')->download($file->file_path, basename($file->file_path), ['X-Content-Type-Options' => 'nosniff']);
    }

    public function index()
    {
        return response()->json(['status' => true, 'data' => NstFile::latest()->get()]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['created_by'] = $request->user()?->id;
        $this->attachUpload($request, $data);
        $data['status'] = $data['status'] ?? 'draft';
        $data['published_at'] = $data['status'] === 'published' ? now() : null;
        return response()->json(['status' => true, 'data' => NstFile::create($data)], 201);
    }

    public function update(Request $request, NstFile $file)
    {
        $data = $this->validated($request, true);
        $this->attachUpload($request, $data);
        if (($data['status'] ?? null) === 'published' && $file->status !== 'published') $data['published_at'] = now();
        $file->update($data);
        return response()->json(['status' => true, 'data' => $file->fresh()]);
    }

    public function destroy(NstFile $file)
    {
        $file->update(['status' => 'archived', 'archived_at' => now()]);
        return response()->json(['status' => true, 'message' => 'File archived safely.']);
    }

    /** Permanently delete a file record and its stored file (admin File Center). */
    public function forceDestroy(NstFile $file)
    {
        if ($file->file_path && Storage::disk('local')->exists($file->file_path)) {
            Storage::disk('local')->delete($file->file_path);
        }
        $file->delete();
        return response()->json(['status' => true, 'message' => 'File deleted permanently.']);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        $required = $partial ? 'sometimes' : 'required';
        return $request->validate([
            'title' => [$required, 'string', 'max:190'],
            'description' => ['nullable', 'string'],
            'category' => ['nullable', 'string', 'max:80'],
            'external_url' => ['nullable', 'url', 'max:2000'],
            'icon_url' => ['nullable', 'url', 'max:2000'],
            'version' => ['nullable', 'string', 'max:80'],
            'changelog' => ['nullable', 'string'],
            'checksum' => ['nullable', 'string', 'max:128'],
            'status' => ['nullable', 'in:draft,published,archived'],
            'file' => ['nullable', 'file', 'max:512000', 'mimes:apk,pdf,zip,doc,docx,xls,xlsx,png,jpg,jpeg,webp,gif,txt,mp4'],
        ]);
    }

    private function attachUpload(Request $request, array &$data): void
    {
        if (!$request->hasFile('file')) return;
        $upload = $request->file('file');
        $path = $upload->store('private/nst-files', 'local');
        $data['file_path'] = $path;
        $data['file_size'] = $upload->getSize() ?: 0;
        $data['checksum'] = $data['checksum'] ?? hash_file('sha256', $upload->getRealPath());
        $data['external_url'] = null;
    }
}