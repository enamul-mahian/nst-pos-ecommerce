<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

class PublicChatboxController extends Controller
{
    /** Keys the storefront widget may read. Everything else (copy email etc.) stays admin-only. */
    private const PUBLIC_KEYS = [
        'enabled', 'launcher_title', 'launcher_subtitle', 'header_title', 'header_subtitle', 'welcome_message',
        'start_button_text', 'default_reply_after_submit', 'attachment_help_text', 'cloud_link_help_text',
        'transcript_checkbox_text', 'consent_checkbox_text', 'poll_seconds', 'logo_url',
        'whatsapp_business_enabled', 'whatsapp_button_label',
    ];

    private const TEXT_LIMITS = [
        'launcher_title' => 60, 'launcher_subtitle' => 80, 'header_title' => 80, 'header_subtitle' => 120,
        'welcome_message' => 1000, 'start_button_text' => 60, 'default_reply_after_submit' => 1000,
        'attachment_help_text' => 200, 'cloud_link_help_text' => 200, 'transcript_checkbox_text' => 200,
        'consent_checkbox_text' => 200, 'whatsapp_business_message' => 500, 'whatsapp_button_label' => 40,
    ];

    public function settings(): JsonResponse
    {
        $all = $this->settingsArray();
        $data = array_intersect_key($all, array_flip(self::PUBLIC_KEYS));
        $data['enabled'] = $this->flag($all['enabled'] ?? '1', true) ? '1' : '0';
        $data['nst_live_chat_enabled'] = $data['enabled'];
        $data['whatsapp_business_enabled'] = $this->flag($all['whatsapp_business_enabled'] ?? '0', false) ? '1' : '0';
        $data['whatsapp_link'] = $data['whatsapp_business_enabled'] === '1' ? $this->whatsappLink($all) : '';
        if ($data['whatsapp_link'] === '') {
            $data['whatsapp_business_enabled'] = '0';
        }

        return response()->json(['status' => true, 'data' => $data]);
    }

    public function adminSettings(): JsonResponse
    {
        $all = $this->settingsArray();
        $all['nst_live_chat_enabled'] = $this->flag($all['enabled'] ?? '1', true) ? '1' : '0';
        $all['whatsapp_business_enabled'] = $this->flag($all['whatsapp_business_enabled'] ?? '0', false) ? '1' : '0';
        $all['whatsapp_link'] = $this->whatsappLink($all);

        return response()->json(['status' => true, 'data' => $all]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        if (! Schema::hasTable('chatbox_settings')) {
            return response()->json([
                'status' => false,
                'message' => 'ChatBox settings table is not ready. Please run the chatbox migrations.',
            ], 503);
        }

        if ($request->has('nst_live_chat_enabled') && ! $request->has('enabled')) {
            $request->merge(['enabled' => $request->input('nst_live_chat_enabled')]);
        }

        $rules = [
            'enabled' => ['sometimes', 'boolean'],
            'whatsapp_business_enabled' => ['sometimes', 'boolean'],
            'whatsapp_business_number' => ['sometimes', 'nullable', 'string', 'max:32', 'regex:/^[0-9+()\-\s.]*$/'],
            'company_copy_email' => ['sometimes', 'nullable', 'email', 'max:190'],
            'poll_seconds' => ['sometimes', 'nullable', 'integer', 'min:4', 'max:60'],
            'logo_url' => ['sometimes', 'nullable', 'string', 'max:500', 'regex:#^(https?://|/)[^\s<>"\']*$#'],
        ];
        foreach (self::TEXT_LIMITS as $key => $max) {
            $rules[$key] = ['sometimes', 'nullable', 'string', 'max:' . $max];
        }
        $validated = Validator::make($request->all(), $rules)->validate();

        if (! empty($validated['whatsapp_business_number']) && $this->normalizeWhatsappNumber($validated['whatsapp_business_number']) === '') {
            return response()->json([
                'status' => false,
                'message' => 'WhatsApp number is not valid. Use the full number, for example 01XXXXXXXXX or +8801XXXXXXXXX.',
                'errors' => ['whatsapp_business_number' => ['Invalid WhatsApp number.']],
            ], 422);
        }

        foreach ($validated as $key => $value) {
            if (in_array($key, ['enabled', 'whatsapp_business_enabled'], true)) {
                $value = $this->flag($value, false) ? '1' : '0';
            } elseif ($key === 'whatsapp_business_number') {
                $value = $this->normalizeWhatsappNumber((string) $value);
            } elseif (array_key_exists($key, self::TEXT_LIMITS)) {
                $value = trim(strip_tags((string) $value));
            }

            DB::table('chatbox_settings')->updateOrInsert(
                ['key' => $key],
                ['value' => (string) ($value ?? ''), 'updated_at' => now(), 'created_at' => now()]
            );
        }

        return response()->json([
            'status' => true,
            'message' => 'ChatBox settings updated.',
            'data' => $this->adminSettings()->getData(true)['data'],
        ]);
    }

    /**
     * Digits only, international format. Bangladesh local numbers (01XXXXXXXXX) get the 880 prefix;
     * any other 8-15 digit number is taken as already international. Returns '' when unusable.
     */
    private function normalizeWhatsappNumber(string $raw): string
    {
        $digits = preg_replace('/\D+/', '', $raw) ?? '';
        if (str_starts_with($digits, '00')) {
            $digits = substr($digits, 2);
        }
        if (preg_match('/^01[3-9]\d{8}$/', $digits)) {
            $digits = '88' . $digits;
        } elseif (preg_match('/^1[3-9]\d{8}$/', $digits)) {
            $digits = '880' . $digits;
        }

        return preg_match('/^[1-9]\d{7,14}$/', $digits) ? $digits : '';
    }

    private function whatsappLink(array $settings): string
    {
        $number = $this->normalizeWhatsappNumber((string) ($settings['whatsapp_business_number'] ?? ''));
        if ($number === '') {
            return '';
        }
        $message = trim((string) ($settings['whatsapp_business_message'] ?? ''));

        return 'https://wa.me/' . $number . ($message !== '' ? '?text=' . rawurlencode($message) : '');
    }

    private function flag(mixed $value, bool $default): bool
    {
        if ($value === null || $value === '') {
            return $default;
        }

        return in_array(strtolower((string) $value), ['1', 'true', 'on', 'yes'], true);
    }

    public function start(Request $request): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'name' => ['required', 'string', 'max:120'],
            'phone' => ['required', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:190'],
            'subject' => ['nullable', 'string', 'max:190'],
            'category' => ['nullable', 'string', 'max:120'],
            'message' => ['required', 'string', 'max:5000'],
            'cloud_link' => ['nullable', 'url', 'max:2000'],
            'attachments' => ['nullable', 'array', 'max:2'],
            'attachments.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
            'wants_transcript_email' => ['nullable', 'boolean'],
            'contact_consent' => ['accepted'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => false,
                'message' => $validator->errors()->first(),
                'errors' => $validator->errors(),
            ], 422);
        }

        if ($attachmentError = $this->attachmentValidationError($request)) {
            return response()->json([
                'status' => false,
                'message' => $attachmentError,
            ], 422);
        }

        if (! Schema::hasTable('customer_messages')) {
            return response()->json([
                'status' => false,
                'message' => 'Chat service is not ready. Please run the chatbox migrations.',
            ], 503);
        }

        $validated = $validator->validated();
        $ticket = $this->newTicket();
        $token = $this->newToken();
        $attachments = $this->storeAttachments($request, $ticket);

        $metadata = [
            'attachments' => $attachments,
            'cloud_link' => $validated['cloud_link'] ?? null,
            'source' => 'website_chatbox',
            'public_session' => true,
        ];

        $settings = $this->settingsArray();

        $insert = [
            'ticket_no' => $ticket,
            'public_token' => $token,
            'name' => $validated['name'],
            'phone' => $validated['phone'],
            'email' => $validated['email'] ?? null,
            'subject' => $validated['subject'] ?? 'Website Chat',
            'category' => $validated['category'] ?? 'website_chat',
            'message' => $validated['message'],
            'status' => 'open',
            'priority' => 'medium',
            'source' => 'website_chatbox',
            'folder' => 'inbox',
            'is_read' => false,
            'staff_unread' => true,
            'customer_unread' => false,
            'last_message_at' => now(),
            'metadata' => json_encode($metadata, JSON_UNESCAPED_UNICODE),
            'wants_transcript_email' => $request->boolean('wants_transcript_email'),
            'contact_consent' => $request->boolean('contact_consent'),
            'company_copy_email' => $settings['company_copy_email'] ?? null,
            'visitor_ip' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 600, ''),
            'created_at' => now(),
            'updated_at' => now(),
        ];

        $insert = $this->filterExistingColumns('customer_messages', $insert);
        $id = DB::table('customer_messages')->insertGetId($insert);

        return response()->json([
            'status' => true,
            'message' => 'Message sent.',
            'data' => $this->formatThread($id, $token),
        ], 201);
    }

    public function show(Request $request, int $messageId): JsonResponse
    {
        $token = (string) $request->query('token', '');

        if (! $this->validPublicAccess($messageId, $token)) {
            return response()->json([
                'status' => false,
                'message' => 'Chat session not found.',
            ], 404);
        }

        $update = ['updated_at' => now()];

        if (Schema::hasColumn('customer_messages', 'customer_unread')) {
            $update['customer_unread'] = false;
        }

        if (Schema::hasColumn('customer_messages', 'customer_last_read_at')) {
            $update['customer_last_read_at'] = now();
        }

        DB::table('customer_messages')->where('id', $messageId)->update($update);

        return response()->json([
            'status' => true,
            'data' => $this->formatThread($messageId, $token),
        ]);
    }

    public function visitorReply(Request $request, int $messageId): JsonResponse
    {
        $validator = Validator::make($request->all(), [
            'token' => ['required', 'string', 'max:160'],
            'message' => ['required', 'string', 'max:5000'],
            'cloud_link' => ['nullable', 'url', 'max:2000'],
            'attachments' => ['nullable', 'array', 'max:2'],
            'attachments.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => false,
                'message' => $validator->errors()->first(),
                'errors' => $validator->errors(),
            ], 422);
        }

        if ($attachmentError = $this->attachmentValidationError($request)) {
            return response()->json([
                'status' => false,
                'message' => $attachmentError,
            ], 422);
        }

        if (! Schema::hasTable('customer_message_replies')) {
            return response()->json([
                'status' => false,
                'message' => 'Chat reply service is not ready. Please run the chatbox migrations.',
            ], 503);
        }

        $token = (string) $request->input('token');

        if (! $this->validPublicAccess($messageId, $token)) {
            return response()->json([
                'status' => false,
                'message' => 'Chat session not found.',
            ], 404);
        }

        $row = DB::table('customer_messages')->where('id', $messageId)->first();
        $attachments = $this->storeAttachments($request, (string) ($row->ticket_no ?? $messageId));

        DB::table('customer_message_replies')->insert([
            'customer_message_id' => $messageId,
            'sender_type' => 'customer',
            'sender_user_id' => null,
            'sender_name' => $row->name ?? 'Customer',
            'message' => (string) $request->input('message'),
            'attachments' => json_encode($attachments, JSON_UNESCAPED_UNICODE),
            'cloud_link' => $request->input('cloud_link'),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $update = [
            'status' => 'open',
            'folder' => 'inbox',
            'last_message_at' => now(),
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('customer_messages', 'staff_unread')) {
            $update['staff_unread'] = true;
        }

        if (Schema::hasColumn('customer_messages', 'customer_unread')) {
            $update['customer_unread'] = false;
        }

        DB::table('customer_messages')->where('id', $messageId)->update($update);

        return response()->json([
            'status' => true,
            'message' => 'Reply sent.',
            'data' => $this->formatThread($messageId, $token),
        ]);
    }

    public function trash(Request $request, int $messageId): JsonResponse
    {
        $data = ['updated_at' => now()];

        if (Schema::hasColumn('customer_messages', 'folder')) {
            $data['folder'] = 'trash';
        }

        if (Schema::hasColumn('customer_messages', 'trashed_at')) {
            $data['trashed_at'] = now();
        }

        DB::table('customer_messages')->where('id', $messageId)->update($data);

        return response()->json([
            'status' => true,
            'message' => 'Message moved to trash.',
        ]);
    }

    public function restore(Request $request, int $messageId): JsonResponse
    {
        $data = ['updated_at' => now()];

        if (Schema::hasColumn('customer_messages', 'folder')) {
            $data['folder'] = 'inbox';
        }

        if (Schema::hasColumn('customer_messages', 'trashed_at')) {
            $data['trashed_at'] = null;
        }

        DB::table('customer_messages')->where('id', $messageId)->update($data);

        return response()->json([
            'status' => true,
            'message' => 'Message restored.',
        ]);
    }

    private function settingsArray(): array
    {
        if (! Schema::hasTable('chatbox_settings')) {
            return [];
        }

        return DB::table('chatbox_settings')->pluck('value', 'key')->toArray();
    }

    private function validPublicAccess(int $messageId, string $token): bool
    {
        if ($token === '') {
            return false;
        }

        return DB::table('customer_messages')
            ->where('id', $messageId)
            ->where('public_token', $token)
            ->exists();
    }

    private function formatThread(int $messageId, string $token): array
    {
        $row = DB::table('customer_messages')->where('id', $messageId)->first();

        if (! $row) {
            return [];
        }

        $metadata = $this->decodeJson($row->metadata ?? null);

        $thread = [[
            'kind' => 'message',
            'sender_type' => 'customer',
            'sender_name' => $row->name ?? 'Customer',
            'message' => $row->message ?? '',
            'attachments' => $metadata['attachments'] ?? [],
            'cloud_link' => $metadata['cloud_link'] ?? null,
            'created_at' => $row->created_at ?? null,
        ]];

        $replies = Schema::hasTable('customer_message_replies')
            ? DB::table('customer_message_replies')
                ->where('customer_message_id', $messageId)
                ->orderBy('created_at')
                ->get()
            : collect();

        $hasStaffReply = $replies->contains(fn ($reply) => ($reply->sender_type ?? '') === 'staff');

        if (! $hasStaffReply && ! empty($row->admin_reply)) {
            $thread[] = [
                'kind' => 'reply',
                'sender_type' => 'staff',
                'sender_name' => 'NST Support',
                'message' => $row->admin_reply,
                'attachments' => [],
                'cloud_link' => null,
                'created_at' => $row->replied_at ?? $row->updated_at ?? null,
            ];
        }

        foreach ($replies as $reply) {
            $thread[] = [
                'kind' => 'reply',
                'sender_type' => $reply->sender_type ?? 'staff',
                'sender_name' => $reply->sender_name ?? null,
                'message' => $reply->message ?? '',
                'attachments' => $this->decodeJson($reply->attachments ?? null),
                'cloud_link' => $reply->cloud_link ?? null,
                'created_at' => $reply->created_at ?? null,
            ];
        }

        return [
            'id' => $row->id,
            'ticket_no' => $row->ticket_no,
            'token' => $token,
            'status' => $row->status ?? 'open',
            'folder' => $row->folder ?? 'inbox',
            'name' => $row->name,
            'phone' => $row->phone,
            'email' => $row->email,
            'subject' => $row->subject,
            'category' => $row->category,
            'thread' => $thread,
            'updated_at' => $row->updated_at ?? null,
            'last_message_at' => $row->last_message_at ?? null,
        ];
    }

    private function attachmentValidationError(Request $request): ?string
    {
        $files = $request->file('attachments', []);

        if (! is_array($files)) {
            $files = $files ? [$files] : [];
        }

        if (count($files) > 2) {
            return 'Maximum 2 images are allowed.';
        }

        $totalSize = 0;
        foreach ($files as $file) {
            if ($file && $file->isValid()) {
                $totalSize += (int) $file->getSize();
            }
        }

        if ($totalSize > 10 * 1024 * 1024) {
            return 'The total attachment size may not exceed 10 MB.';
        }

        return null;
    }

    private function storeAttachments(Request $request, string $ticket): array
    {
        $files = $request->file('attachments', []);

        if (! is_array($files)) {
            $files = [$files];
        }

        $saved = [];

        foreach (array_slice($files, 0, 2) as $file) {
            if (! $file || ! $file->isValid()) {
                continue;
            }

            $dir = 'customer-messages/' . preg_replace('/[^A-Za-z0-9_\-]/', '_', $ticket);
            $path = $file->store($dir, 'public');

            $saved[] = [
                'name' => $file->getClientOriginalName(),
                'path' => $path,
                'url' => '/storage/' . $path,
                'mime' => $file->getMimeType(),
                'size' => $file->getSize(),
            ];
        }

        return $saved;
    }

    private function filterExistingColumns(string $table, array $data): array
    {
        return array_filter(
            $data,
            fn ($value, $key) => Schema::hasColumn($table, $key),
            ARRAY_FILTER_USE_BOTH
        );
    }

    private function decodeJson($value): array
    {
        if (is_array($value)) {
            return $value;
        }

        if (! is_string($value) || $value === '') {
            return [];
        }

        $decoded = json_decode($value, true);

        return is_array($decoded) ? $decoded : [];
    }

    private function newTicket(): string
    {
        do {
            $ticket = 'NST-CHAT-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6));
        } while (DB::table('customer_messages')->where('ticket_no', $ticket)->exists());

        return $ticket;
    }

    private function newToken(): string
    {
        return bin2hex(random_bytes(24));
    }
}