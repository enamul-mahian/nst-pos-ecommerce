<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Services\HCaptchaService;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class UnifiedCustomerMessageController extends Controller
{
    private array $columnCache = [];

    public function publicStore(Request $request): JsonResponse
    {
        $this->normalizePublicInput($request);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'phone' => ['required', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'subject' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:80'],
            'message' => ['required', 'string', 'max:10000'],
            'invoice_no' => ['nullable', 'string', 'max:120'],
            'cloud_link' => ['nullable', 'url', 'max:2000'],
            'hcaptcha_token' => ['nullable', 'string', 'max:5000'],
        ]);

        app(HCaptchaService::class)->verify($request, 'contact_message');

        $customer = $this->resolveCustomer(null, $validated['phone'], $validated['email'] ?? null);
        $ticket = $this->uniqueTicket();
        $attachments = $this->storeAttachments($request, $ticket);
        $id = $this->createMessage([
            'ticket_no' => $ticket,
            'customer_id' => $customer?->id,
            'invoice_no' => $validated['invoice_no'] ?? null,
            'name' => $validated['name'],
            'phone' => $this->normalizePhone($validated['phone']),
            'email' => isset($validated['email']) ? Str::lower($validated['email']) : null,
            'subject' => $validated['subject'],
            'category' => $validated['category'] ?? 'general_support',
            'message' => $validated['message'],
            'status' => 'new',
            'priority' => 'medium',
            'source' => 'website_contact',
            'folder' => 'inbox',
            'staff_unread' => true,
            'customer_unread' => false,
            'is_read' => false,
            'last_message_at' => now(),
            'metadata' => $this->encodeMetadata([
                'origin' => 'customer',
                'attachments' => $attachments,
                'cloud_link' => $validated['cloud_link'] ?? null,
            ]),
        ]);
        $this->touchCustomer($customer?->id);

        return response()->json([
            'status' => true,
            'message' => 'Your message has been sent to New Singapur Telecom support.',
            'data' => $this->messageData($id),
        ], 201);
    }

    public function portalIndex(Request $request): JsonResponse
    {
        $customer = $this->requirePortalCustomer($request);
        $rows = DB::table('customer_messages')
            ->where('customer_id', $customer->id)
            ->orderByDesc($this->hasColumn('customer_messages', 'last_message_at') ? 'last_message_at' : 'updated_at')
            ->get()
            ->map(fn ($row) => $this->formatMessage($row))
            ->values();

        return response()->json([
            'status' => true,
            'data' => $rows,
            'messages' => $rows,
            'unread_count' => $rows->where('customer_unread', true)->count(),
        ]);
    }

    public function portalStore(Request $request): JsonResponse
    {
        $customer = $this->requirePortalCustomer($request);
        $validated = $request->validate([
            'subject' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:80'],
            'message' => ['required', 'string', 'max:10000'],
            'invoice_no' => ['nullable', 'string', 'max:120'],
            'cloud_link' => ['nullable', 'url', 'max:2000'],
        ]);

        $ticket = $this->uniqueTicket();
        $attachments = $this->storeAttachments($request, $ticket);
        $id = $this->createMessage([
            'ticket_no' => $ticket,
            'customer_id' => $customer->id,
            'invoice_no' => $validated['invoice_no'] ?? null,
            'name' => $customer->name,
            'phone' => $this->normalizePhone((string) $customer->phone),
            'email' => $customer->email ? Str::lower((string) $customer->email) : null,
            'subject' => $validated['subject'],
            'category' => $validated['category'],
            'message' => $validated['message'],
            'status' => 'new',
            'priority' => 'medium',
            'source' => 'customer_portal',
            'folder' => 'inbox',
            'staff_unread' => true,
            'customer_unread' => false,
            'is_read' => false,
            'customer_last_read_at' => now(),
            'last_message_at' => now(),
            'metadata' => $this->encodeMetadata([
                'origin' => 'customer',
                'attachments' => $attachments,
                'cloud_link' => $validated['cloud_link'] ?? null,
            ]),
        ]);
        $this->touchCustomer($customer->id);

        return response()->json([
            'status' => true,
            'message' => 'Support message created.',
            'data' => $this->messageData($id),
        ], 201);
    }

    public function portalShow(Request $request, int $messageId): JsonResponse
    {
        $customer = $this->requirePortalCustomer($request);
        $message = $this->ownedMessage($messageId, $customer->id);
        $this->updateMessage($messageId, [
            'customer_unread' => false,
            'customer_last_read_at' => now(),
        ]);

        return response()->json(['status' => true, 'data' => $this->messageData($messageId, true)]);
    }

    public function portalReply(Request $request, int $messageId): JsonResponse
    {
        $customer = $this->requirePortalCustomer($request);
        $message = $this->ownedMessage($messageId, $customer->id);
        if (($message->status ?? '') === 'closed') {
            return response()->json(['status' => false, 'message' => 'This conversation is closed.'], 409);
        }

        $validated = $request->validate([
            'message' => ['required', 'string', 'max:10000'],
            'cloud_link' => ['nullable', 'url', 'max:2000'],
        ]);
        $attachments = $this->storeAttachments($request, (string) $message->ticket_no);
        $this->createReply($messageId, [
            'sender_type' => 'customer',
            'sender_user_id' => $request->user()->id,
            'sender_name' => $customer->name,
            'message' => $validated['message'],
            'attachments' => $this->encodeMetadata($attachments),
            'cloud_link' => $validated['cloud_link'] ?? null,
        ]);
        $this->updateMessage($messageId, [
            'status' => 'open',
            'staff_unread' => true,
            'customer_unread' => false,
            'is_read' => false,
            'customer_last_read_at' => now(),
            'last_message_at' => now(),
        ]);
        $this->touchCustomer($customer->id);

        return response()->json([
            'status' => true,
            'message' => 'Reply sent.',
            'data' => $this->messageData($messageId, true),
        ]);
    }

    public function portalRead(Request $request, int $messageId): JsonResponse
    {
        $customer = $this->requirePortalCustomer($request);
        $this->ownedMessage($messageId, $customer->id);
        $this->updateMessage($messageId, ['customer_unread' => false, 'customer_last_read_at' => now()]);
        return response()->json(['status' => true, 'message' => 'Conversation marked as read.']);
    }

    public function index(Request $request): JsonResponse
    {
        $this->requireStaff($request);
        $query = DB::table('customer_messages');

        $search = trim((string) ($request->input('q') ?: $request->input('search')));
        if ($search !== '') {
            $query->where(function ($builder) use ($search) {
                foreach (['ticket_no', 'name', 'phone', 'email', 'subject', 'message', 'invoice_no'] as $column) {
                    if ($this->hasColumn('customer_messages', $column)) {
                        $builder->orWhere($column, 'like', '%' . $search . '%');
                    }
                }
            });
        }
        foreach (['status', 'category', 'priority', 'source'] as $filter) {
            if ($request->filled($filter) && $this->hasColumn('customer_messages', $filter)) {
                $query->where($filter, $request->input($filter));
            }
        }
        if ($request->filled('folder') && $this->hasColumn('customer_messages', 'folder')) {
            $query->where('folder', $request->input('folder'));
        }

        $perPage = max(5, min(100, (int) $request->input('per_page', 30)));
        $orderColumn = $this->hasColumn('customer_messages', 'last_message_at') ? 'last_message_at' : 'updated_at';
        $paginator = $query->orderByDesc($orderColumn)->orderByDesc('id')->paginate($perPage);
        $rows = collect($paginator->items())->map(fn ($row) => $this->formatMessage($row))->values();

        $data = [
            'current_page' => $paginator->currentPage(),
            'data' => $rows,
            'from' => $paginator->firstItem(),
            'last_page' => $paginator->lastPage(),
            'per_page' => $paginator->perPage(),
            'to' => $paginator->lastItem(),
            'total' => $paginator->total(),
        ];

        return response()->json([
            'status' => true,
            'data' => $data,
            'messages' => $rows,
            'items' => $rows,
            'counts' => $this->adminCounts(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->requireStaff($request);
        $this->normalizeAdminInput($request);
        $validated = $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:255'],
            'subject' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:80'],
            'message' => ['required', 'string', 'max:10000'],
            'invoice_no' => ['nullable', 'string', 'max:120'],
            'priority' => ['nullable', 'in:low,medium,high,urgent'],
            'cloud_link' => ['nullable', 'url', 'max:2000'],
        ]);

        $customer = $this->resolveCustomer(
            isset($validated['customer_id']) ? (int) $validated['customer_id'] : null,
            $validated['phone'] ?? null,
            $validated['email'] ?? null
        );
        if (! $customer) {
            return response()->json([
                'status' => false,
                'message' => 'Select a registered customer before sending a portal message.',
            ], 422);
        }

        $ticket = $this->uniqueTicket();
        $attachments = $this->storeAttachments($request, $ticket);
        $id = $this->createMessage([
            'ticket_no' => $ticket,
            'customer_id' => $customer->id,
            'invoice_no' => $validated['invoice_no'] ?? null,
            'name' => $customer->name,
            'phone' => $this->normalizePhone((string) $customer->phone),
            'email' => $customer->email ? Str::lower((string) $customer->email) : null,
            'subject' => $validated['subject'],
            'category' => $validated['category'] ?? 'general_support',
            'message' => $validated['message'],
            'admin_reply' => $validated['message'],
            'status' => 'replied',
            'priority' => $validated['priority'] ?? 'medium',
            'source' => 'pos_admin',
            'folder' => 'sent',
            'staff_unread' => false,
            'customer_unread' => true,
            'is_read' => true,
            'replied_by' => $request->user()->id,
            'replied_at' => now(),
            'staff_last_read_at' => now(),
            'last_message_at' => now(),
            'metadata' => $this->encodeMetadata([
                'origin' => 'staff',
                'attachments' => $attachments,
                'cloud_link' => $validated['cloud_link'] ?? null,
            ]),
        ]);
        $this->touchCustomer($customer->id);

        return response()->json([
            'status' => true,
            'message' => 'Message sent to the customer portal.',
            'data' => $this->messageData($id, true),
        ], 201);
    }

    public function show(Request $request, int $customerMessage): JsonResponse
    {
        $this->requireStaff($request);
        $message = $this->findMessage($customerMessage);
        $this->updateMessage($customerMessage, [
            'staff_unread' => false,
            'is_read' => true,
            'staff_last_read_at' => now(),
        ]);

        return response()->json(['status' => true, 'data' => $this->messageData($customerMessage, true)]);
    }

    public function reply(Request $request, int $customerMessage): JsonResponse
    {
        $this->requireStaff($request);
        $message = $this->findMessage($customerMessage);
        $content = trim((string) ($request->input('message') ?: $request->input('reply') ?: $request->input('admin_reply')));
        $request->merge(['message' => $content]);
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:10000'],
            'cloud_link' => ['nullable', 'url', 'max:2000'],
        ]);
        $attachments = $this->storeAttachments($request, (string) $message->ticket_no);

        $this->createReply($customerMessage, [
            'sender_type' => 'staff',
            'sender_user_id' => $request->user()->id,
            'sender_name' => $request->user()->name ?? 'NST Support',
            'message' => $validated['message'],
            'attachments' => $this->encodeMetadata($attachments),
            'cloud_link' => $validated['cloud_link'] ?? null,
        ]);
        $this->updateMessage($customerMessage, [
            'admin_reply' => $validated['message'],
            'status' => 'replied',
            'replied_by' => $request->user()->id,
            'replied_at' => now(),
            'staff_unread' => false,
            'customer_unread' => true,
            'is_read' => true,
            'staff_last_read_at' => now(),
            'last_message_at' => now(),
        ]);
        $this->touchCustomer(isset($message->customer_id) ? (int) $message->customer_id : null);

        return response()->json([
            'status' => true,
            'message' => 'Reply sent to the customer portal.',
            'data' => $this->messageData($customerMessage, true),
        ]);
    }

    public function close(Request $request, int $customerMessage): JsonResponse
    {
        $this->requireStaff($request);
        $this->findMessage($customerMessage);
        $this->updateMessage($customerMessage, [
            'status' => 'closed',
            'closed_at' => now(),
            'staff_unread' => false,
            'customer_unread' => true,
            'is_read' => true,
            'last_message_at' => now(),
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Conversation closed.',
            'data' => $this->messageData($customerMessage, true),
        ]);
    }

    private function normalizePublicInput(Request $request): void
    {
        $request->merge([
            'name' => $request->input('name', $request->input('customer_name')),
            'phone' => $request->input('phone', $request->input('customer_phone')),
            'email' => $request->input('email', $request->input('customer_email')),
            'message' => $request->input('message', $request->input('body')),
        ]);
    }

    private function normalizeAdminInput(Request $request): void
    {
        $request->merge([
            'name' => $request->input('name', $request->input('customer_name')),
            'phone' => $request->input('phone', $request->input('customer_phone')),
            'email' => $request->input('email', $request->input('customer_email')),
            'message' => $request->input('message', $request->input('body')),
        ]);
    }

    private function requirePortalCustomer(Request $request): Customer
    {
        $customer = $this->customerForUser($request->user());
        if (! $customer) {
            throw new HttpResponseException(response()->json([
                'status' => false,
                'message' => 'A registered customer account is required.',
            ], 403));
        }
        return $customer;
    }

    private function requireStaff(Request $request): void
    {
        if ($this->customerForUser($request->user())) {
            throw new HttpResponseException(response()->json([
                'status' => false,
                'message' => 'Customer accounts cannot access the POS inbox API.',
            ], 403));
        }
    }

    private function customerForUser($user): ?Customer
    {
        if (! $user) {
            return null;
        }
        $customer = Customer::query()->where('user_id', $user->id)->first();
        if ($customer) {
            return $customer;
        }
        if (Schema::hasColumn('users', 'customer_id') && ! empty($user->customer_id)) {
            $customer = Customer::query()->find($user->customer_id);
            if ($customer) {
                return $customer;
            }
        }
        if (Str::lower((string) ($user->profile_type ?? '')) !== 'customer') {
            try {
                if (! method_exists($user, 'hasRole') || ! $user->hasRole('customer')) {
                    return null;
                }
            } catch (Throwable) {
                return null;
            }
        }
        if (empty($user->phone) && empty($user->email)) {
            return null;
        }
        return Customer::query()
            ->where(function ($query) use ($user) {
                if (! empty($user->phone)) {
                    $query->whereIn('phone', $this->phoneVariants((string) $user->phone));
                }
                if (! empty($user->email)) {
                    $query->orWhereRaw('LOWER(email) = ?', [Str::lower((string) $user->email)]);
                }
            })
            ->first();
    }

    private function resolveCustomer(?int $customerId, ?string $phone, ?string $email): ?Customer
    {
        if ($customerId) {
            return Customer::query()->find($customerId);
        }
        $query = Customer::query();
        $hasCondition = false;
        if ($phone) {
            $query->whereIn('phone', $this->phoneVariants($phone));
            $hasCondition = true;
        }
        if ($email) {
            if ($hasCondition) {
                $query->orWhereRaw('LOWER(email) = ?', [Str::lower($email)]);
            } else {
                $query->whereRaw('LOWER(email) = ?', [Str::lower($email)]);
            }
            $hasCondition = true;
        }
        return $hasCondition ? $query->first() : null;
    }

    private function ownedMessage(int $messageId, int $customerId): object
    {
        $message = DB::table('customer_messages')->where('id', $messageId)->where('customer_id', $customerId)->first();
        if (! $message) {
            throw new HttpResponseException(response()->json(['status' => false, 'message' => 'Conversation not found.'], 404));
        }
        return $message;
    }

    private function findMessage(int $messageId): object
    {
        $message = DB::table('customer_messages')->where('id', $messageId)->first();
        if (! $message) {
            throw new HttpResponseException(response()->json(['status' => false, 'message' => 'Conversation not found.'], 404));
        }
        return $message;
    }

    private function createMessage(array $payload): int
    {
        $payload['created_at'] = now();
        $payload['updated_at'] = now();
        return (int) DB::table('customer_messages')->insertGetId($this->filterPayload('customer_messages', $payload));
    }

    private function createReply(int $messageId, array $payload): void
    {
        if (! Schema::hasTable('customer_message_replies')) {
            return;
        }
        $payload['customer_message_id'] = $messageId;
        $payload['created_at'] = now();
        $payload['updated_at'] = now();
        DB::table('customer_message_replies')->insert($this->filterPayload('customer_message_replies', $payload));
    }

    private function updateMessage(int $messageId, array $payload): void
    {
        $payload['updated_at'] = now();
        DB::table('customer_messages')->where('id', $messageId)->update($this->filterPayload('customer_messages', $payload));
    }

    private function messageData(int $messageId, bool $thread = false): array
    {
        return $this->formatMessage($this->findMessage($messageId), $thread);
    }

    private function formatMessage(object $row, bool $includeThread = false): array
    {
        $metadata = $this->decodeMetadata($row->metadata ?? null);
        $attachments = is_array($metadata['attachments'] ?? null) ? $metadata['attachments'] : [];
        $customerUnread = (bool) ($row->customer_unread ?? false);
        $staffUnread = (bool) ($row->staff_unread ?? ! (bool) ($row->is_read ?? false));
        $createdAt = $row->created_at ?? null;
        $lastMessageAt = $row->last_message_at ?? $row->updated_at ?? $createdAt;
        $name = $row->name ?? 'Customer';
        $preview = Str::limit((string) ($row->message ?? ''), 140);

        $data = [
            'id' => (int) $row->id,
            'ticket_no' => $row->ticket_no,
            'ticketNo' => $row->ticket_no,
            'customer_id' => isset($row->customer_id) ? (int) $row->customer_id : null,
            'customer_name' => $name,
            'customerName' => $name,
            'name' => $name,
            'phone' => $row->phone ?? null,
            'email' => $row->email ?? null,
            'subject' => $row->subject ?? 'Support message',
            'category' => $row->category ?? 'general_support',
            'message' => $row->message ?? '',
            'preview' => $preview,
            'invoice_no' => $row->invoice_no ?? null,
            'status' => $row->status ?? 'open',
            'priority' => $row->priority ?? 'medium',
            'source' => $row->source ?? 'customer_portal',
            'folder' => $row->folder ?? 'inbox',
            'label' => $metadata['label'] ?? 'personal',
            'assigned_to' => $row->assigned_to ?? null,
            'assignedTo' => $row->assigned_to ?? null,
            'unread' => $staffUnread,
            'staff_unread' => $staffUnread,
            'customer_unread' => $customerUnread,
            'starred' => (bool) ($row->is_starred ?? false),
            'has_attachment' => count($attachments) > 0,
            'hasAttachment' => count($attachments) > 0,
            'attachments' => $attachments,
            'cloud_link' => $metadata['cloud_link'] ?? null,
            'admin_reply' => $row->admin_reply ?? null,
            'created_at' => $createdAt,
            'createdAt' => $createdAt,
            'updated_at' => $row->updated_at ?? null,
            'last_message_at' => $lastMessageAt,
            'replied_at' => $row->replied_at ?? null,
            'closed_at' => $row->closed_at ?? null,
        ];
        if ($includeThread) {
            $data['thread'] = $this->thread($row, $metadata);
            $data['replies'] = array_values(array_filter($data['thread'], fn ($item) => ($item['kind'] ?? '') === 'reply'));
        }
        return $data;
    }

    private function thread(object $row, array $metadata): array
    {
        $origin = ($metadata['origin'] ?? 'customer') === 'staff' ? 'staff' : 'customer';
        $items = [[
            'id' => 'initial-' . $row->id,
            'kind' => 'initial',
            'sender_type' => $origin,
            'sender_name' => $origin === 'staff' ? 'NST Support' : ($row->name ?? 'Customer'),
            'message' => $row->message ?? '',
            'attachments' => $metadata['attachments'] ?? [],
            'cloud_link' => $metadata['cloud_link'] ?? null,
            'created_at' => $row->created_at ?? null,
        ]];

        $hasStaffReply = false;
        if (Schema::hasTable('customer_message_replies')) {
            $replies = DB::table('customer_message_replies')
                ->where('customer_message_id', $row->id)
                ->orderBy('id')
                ->get();
            foreach ($replies as $reply) {
                if (($reply->sender_type ?? '') === 'staff') {
                    $hasStaffReply = true;
                }
                $items[] = [
                    'id' => (int) $reply->id,
                    'kind' => 'reply',
                    'sender_type' => $reply->sender_type ?? 'staff',
                    'sender_name' => $reply->sender_name ?? (($reply->sender_type ?? '') === 'customer' ? 'Customer' : 'NST Support'),
                    'message' => $reply->message ?? '',
                    'attachments' => $this->decodeMetadata($reply->attachments ?? null),
                    'cloud_link' => $reply->cloud_link ?? null,
                    'created_at' => $reply->created_at ?? null,
                ];
            }
        }
        if (! $hasStaffReply && ! empty($row->admin_reply) && $origin !== 'staff') {
            $items[] = [
                'id' => 'legacy-reply-' . $row->id,
                'kind' => 'reply',
                'sender_type' => 'staff',
                'sender_name' => 'NST Support',
                'message' => $row->admin_reply,
                'attachments' => [],
                'cloud_link' => null,
                'created_at' => $row->replied_at ?? $row->updated_at ?? null,
            ];
        }
        return $items;
    }

    private function storeAttachments(Request $request, string $ticket): array
    {
        $request->validate([
            'attachments' => ['nullable', 'array', 'max:2'],
            'attachments.*' => ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:10240'],
        ]);
        $files = $request->file('attachments', []);
        if (! is_array($files)) {
            $files = [$files];
        }
        $files = array_values(array_filter($files));
        if (count($files) > 2) {
            throw new HttpResponseException(response()->json([
                'status' => false,
                'message' => 'Maximum 2 images are allowed. Use Google Drive, OneDrive or Dropbox for more files.',
            ], 422));
        }
        $total = array_sum(array_map(fn ($file) => (int) $file->getSize(), $files));
        if ($total > 10 * 1024 * 1024) {
            throw new HttpResponseException(response()->json([
                'status' => false,
                'message' => 'Total image size cannot exceed 10 MB. Use Google Drive, OneDrive or Dropbox for larger files.',
            ], 422));
        }

        $stored = [];
        foreach ($files as $file) {
            $path = $file->store('customer-messages/' . Str::slug($ticket), 'public');
            $stored[] = [
                'name' => $file->getClientOriginalName(),
                'path' => $path,
                'url' => asset('storage/' . ltrim($path, '/')),
                'mime' => $file->getClientMimeType(),
                'size' => (int) $file->getSize(),
            ];
        }
        return $stored;
    }

    private function uniqueTicket(): string
    {
        do {
            $ticket = 'NST-' . now()->format('ymd') . '-' . Str::upper(Str::random(6));
        } while (DB::table('customer_messages')->where('ticket_no', $ticket)->exists());
        return $ticket;
    }

    private function adminCounts(): array
    {
        $base = DB::table('customer_messages');
        $counts = [
            'all' => (clone $base)->count(),
            'new' => (clone $base)->where('status', 'new')->count(),
            'open' => (clone $base)->where('status', 'open')->count(),
            'replied' => (clone $base)->where('status', 'replied')->count(),
            'closed' => (clone $base)->where('status', 'closed')->count(),
        ];
        if ($this->hasColumn('customer_messages', 'staff_unread')) {
            $counts['unread'] = (clone $base)->where('staff_unread', true)->count();
        } else {
            $counts['unread'] = (clone $base)->where('is_read', false)->count();
        }
        return $counts;
    }

    private function touchCustomer(?int $customerId): void
    {
        if ($customerId && Schema::hasColumn('customers', 'last_message_at')) {
            DB::table('customers')->where('id', $customerId)->update(['last_message_at' => now(), 'updated_at' => now()]);
        }
    }

    private function filterPayload(string $table, array $payload): array
    {
        $columns = array_flip($this->columns($table));
        return array_intersect_key($payload, $columns);
    }

    private function columns(string $table): array
    {
        return $this->columnCache[$table] ??= Schema::getColumnListing($table);
    }

    private function hasColumn(string $table, string $column): bool
    {
        return in_array($column, $this->columns($table), true);
    }

    private function encodeMetadata($value): string
    {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?: '[]';
    }

    private function decodeMetadata($value): array
    {
        if (is_array($value)) {
            return $value;
        }
        if (! is_string($value) || trim($value) === '') {
            return [];
        }
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private function phoneVariants(string $phone): array
    {
        $normalized = $this->normalizePhone($phone);
        $variants = [$normalized, trim($phone)];
        if (str_starts_with($normalized, '0') && strlen($normalized) === 11) {
            $variants[] = '+880' . substr($normalized, 1);
            $variants[] = '880' . substr($normalized, 1);
        }
        return array_values(array_unique(array_filter($variants)));
    }

    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D+/', '', trim($phone)) ?: trim($phone);
        if (str_starts_with($digits, '880')) {
            return '0' . substr($digits, 3);
        }
        if (strlen($digits) === 10 && str_starts_with($digits, '1')) {
            return '0' . $digits;
        }
        return $digits;
    }
}
