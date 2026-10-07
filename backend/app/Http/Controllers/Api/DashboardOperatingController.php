<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\Setting;
use App\Models\User;
use App\Services\AccessControlService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Throwable;

class DashboardOperatingController extends Controller
{
    public function actionSummary(Request $request, AccessControlService $access)
    {
        $user = $request->user();
        $roleFingerprint = sha1(json_encode($access->roleNames($user), JSON_UNESCAPED_UNICODE));
        $cacheKey = sprintf(
            'nst:dashboard:action-summary:v3:user:%s:branch:%s:roles:%s',
            (string) $user->id,
            (string) ($user->branch_id ?? 'none'),
            $roleFingerprint
        );

        $data = Cache::remember($cacheKey, now()->addSeconds(20), function () use ($user, $access) {
            $notifications = collect();

            if (Schema::hasTable('sales')) {
                $query = DB::table('sales')->orderByDesc('created_at')->limit(8);
                if (! $access->isAdmin($user) && ! $access->hasAnyRole($user, ['accountant']) && ! empty($user->branch_id) && Schema::hasColumn('sales', 'branch_id')) {
                    $query->where('branch_id', $user->branch_id);
                }
                foreach ($query->get() as $row) {
                    $notifications->push([
                        'id' => 'sale-' . $row->id,
                        'type' => 'sale',
                        'title' => 'Sale ' . ($row->invoice_no ?? ('#' . $row->id)),
                        'message' => ($row->customer_name ?? 'Customer') . ' — ৳' . number_format((float) ($row->final_amount ?? $row->total ?? 0), 2),
                        'created_at' => $row->created_at,
                        'url' => '/sales/' . $row->id . '/invoice',
                    ]);
                }
            }

            if (Schema::hasTable('purchases')) {
                $query = DB::table('purchases')->orderByDesc('created_at')->limit(8);
                if (! $access->isAdmin($user) && ! $access->hasAnyRole($user, ['accountant']) && ! empty($user->branch_id) && Schema::hasColumn('purchases', 'branch_id')) {
                    $query->where('branch_id', $user->branch_id);
                }
                foreach ($query->get() as $row) {
                    $notifications->push([
                        'id' => 'purchase-' . $row->id,
                        'type' => 'purchase',
                        'title' => 'Purchase ' . ($row->purchase_no ?? $row->invoice_no ?? ('#' . $row->id)),
                        'message' => 'Purchase entry updated',
                        'created_at' => $row->created_at,
                        'url' => '/purchases',
                    ]);
                }
            }

            if ($access->isSuperAdmin($user) && Schema::hasTable('security_events')) {
                $critical = DB::table('security_events')
                    ->where('severity', 'critical')
                    ->where('status', '<>', 'resolved')
                    ->where('created_at', '>=', now()->subDays(7))
                    ->orderByDesc('id')
                    ->limit(6)
                    ->get();
                foreach ($critical as $row) {
                    $details = json_decode((string) $row->sanitized_details, true) ?: [];
                    $notifications->push([
                        'id' => 'security-' . $row->id,
                        'type' => 'security',
                        'title' => __('messages.security.notification_title', ['type' => str_replace('_', ' ', (string) ($details['action'] ?? $row->event_type))]),
                        'message' => __('messages.security.notification_message', [
                            'who' => $row->user_name ?: __('messages.security.guest'),
                            'ip' => $row->ip_address ?: '-',
                            'page' => $details['page'] ?? parse_url((string) $row->url, PHP_URL_PATH) ?? '-',
                        ]),
                        'created_at' => $row->created_at,
                        'url' => '/security-center',
                    ]);
                }
            }

            $unreadChat = 0;
            if (Schema::hasTable('nst_staff_chat_participants') && Schema::hasTable('nst_staff_chat_messages')) {
                $unreadChat = DB::table('nst_staff_chat_participants as p')
                    ->join('nst_staff_chat_messages as m', 'm.thread_id', '=', 'p.thread_id')
                    ->where('p.user_id', $user->id)
                    ->where('m.sender_id', '<>', $user->id)
                    ->where(function ($query) {
                        $query->whereNull('p.last_read_message_id')->orWhereColumn('m.id', '>', 'p.last_read_message_id');
                    })->count();
            }

            $bulletins = $this->visibleBulletins($user, $access)->take(10);
            if (Schema::hasTable('business_bulletin_reads')) {
                $readIds = DB::table('business_bulletin_reads')->where('user_id', $user->id)->pluck('bulletin_id');
                $unreadBulletins = $bulletins->whereNotIn('id', $readIds)->count();
            } else {
                $unreadBulletins = $bulletins->count();
            }

            return [
                'notifications' => $notifications->sortByDesc('created_at')->take(12)->values(),
                'counts' => [
                    'notifications' => $notifications->count(),
                    'unread_chat' => $unreadChat,
                    'unread_bulletins' => $unreadBulletins,
                ],
                'health' => $this->healthSnapshot(),
                'generated_at' => now()->toIso8601String(),
                'cache_ttl_seconds' => 20,
            ];
        });

        return response()->json(['success' => true, 'data' => $data]);
    }

    public function welcome(Request $request, AccessControlService $access)
    {
        $defaults = [
            'visible' => true,
            'icon' => '👋',
            'title_en' => 'Welcome back, {name}!',
            'subtitle_en' => "Here’s what’s happening with your business today.",
            'title_bn' => __('messages.dashboard.welcome_title', [], 'bn'),
            'subtitle_bn' => __('messages.dashboard.welcome_subtitle', [], 'bn'),
        ];

        // Read the persisted row directly so a stale model/cache layer cannot
        // overwrite the just-saved Dashboard welcome content on page refresh.
        $raw = Schema::hasTable('settings')
            ? DB::table('settings')->where('key', 'dashboard_welcome_config')->value('value')
            : '';

        $stored = json_decode((string) $raw, true);
        if (is_string($stored)) {
            $legacyDecoded = json_decode($stored, true);
            if (is_array($legacyDecoded)) {
                $stored = $legacyDecoded;
            }
        }
        $config = array_merge($defaults, is_array($stored) ? $stored : []);

        // Keep {name} as a template token. The React dashboard already resolves
        // it for the authenticated user, so the stored value stays reusable.
        return response()->json([
            'success' => true,
            'can_manage' => $access->isSuperAdmin($request->user()),
            'data' => $config,
        ]);
    }

    public function saveWelcome(Request $request, AccessControlService $access)
    {
        abort_unless($access->isSuperAdmin($request->user()), 403, 'Only Super Admin can manage the Dashboard welcome section.');

        $validated = $request->validate([
            'visible' => ['required', 'boolean'],
            'icon' => ['nullable', 'string', 'max:20'],
            'title_en' => ['required', 'string', 'max:190'],
            'subtitle_en' => ['nullable', 'string', 'max:500'],
            'title_bn' => ['required', 'string', 'max:190'],
            'subtitle_bn' => ['nullable', 'string', 'max:500'],
        ]);

        Setting::setValue(
            'dashboard_welcome_config',
            $validated,
            'dashboard',
            'json'
        );

        // Verify the real database value before telling the browser "Saved".
        $persistedRaw = Schema::hasTable('settings')
            ? DB::table('settings')->where('key', 'dashboard_welcome_config')->value('value')
            : null;
        $persisted = json_decode((string) $persistedRaw, true);
        if (is_string($persisted)) {
            $legacyDecoded = json_decode($persisted, true);
            if (is_array($legacyDecoded)) {
                $persisted = $legacyDecoded;
            }
        }

        if (! is_array($persisted)) {
            abort(500, 'Dashboard welcome could not be verified after save.');
        }

        foreach ($validated as $key => $value) {
            if (! array_key_exists($key, $persisted) || $persisted[$key] !== $value) {
                abort(500, 'Dashboard welcome did not persist correctly. Save was not confirmed.');
            }
        }

        AuditLog::create([
            'user_id' => $request->user()->id,
            'branch_id' => $request->user()->branch_id,
            'user_name' => $request->user()->name,
            'user_email' => $request->user()->email,
            'roles' => $access->roleNames($request->user()),
            'action' => 'update',
            'method' => 'POST',
            'path' => $request->path(),
            'module' => 'dashboard_welcome',
            'description' => 'Dashboard welcome content updated.',
            'status_code' => 200,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'meta' => ['after' => $persisted],
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Dashboard welcome saved and verified.',
            'data' => $persisted,
        ]);
    }

    public function targets(Request $request, AccessControlService $access)
    {
        if (! Schema::hasTable('dashboard_targets')) {
            return response()->json(['success' => true, 'migration_required' => true, 'data' => ['branches' => [], 'combined' => null]]);
        }

        $date = Carbon::parse($request->input('date', now()->toDateString()), config('app.timezone'))->toDateString();
        $type = (string) $request->input('target_type', 'sales_amount');
        $allowedTypes = ['sales_amount', 'sales_quantity', 'profit', 'collection', 'purchase'];
        abort_unless(in_array($type, $allowedTypes, true), 422, 'Unsupported target type.');

        $user = $request->user();
        if ($type === 'profit') {
            abort_unless($access->canViewProfit($user), 403, 'Profit target access is restricted.');
        }
        if ($type === 'purchase') {
            abort_unless($access->canViewPurchasePrice($user), 403, 'Purchase target access is restricted.');
        }
        $branches = Branch::query()->when(Schema::hasColumn('branches', 'status'), fn ($q) => $q->whereIn('status', ['active', 'Active', 1]))->orderBy('name')->get(['id', 'name', 'code']);
        if (! $access->isAdmin($user) && ! $access->hasAnyRole($user, ['accountant'])) {
            $branchIds = array_values(array_unique(array_filter(array_merge([$user->branch_id], $access->userAccess($user)['branch_ids'] ?? []))));
            $branches = $branches->whereIn('id', $branchIds)->values();
        }

        $targets = DB::table('dashboard_targets')->where('target_date', $date)->where('target_type', $type)->where('is_active', true)->get()->keyBy('scope_key');
        $branchRows = $branches->map(function ($branch) use ($targets, $date, $type) {
            $target = $targets->get('branch:' . $branch->id);
            $actual = $this->targetActual($date, $type, (int) $branch->id);
            $value = (float) ($target->target_value ?? 0);
            return $this->targetRow($branch->id, $branch->name, $value, $actual, $target);
        })->values();

        $combinedTarget = $targets->get('combined');
        $mode = $combinedTarget->combined_mode ?? 'auto_total';
        $configured = $mode === 'manual' ? (float) ($combinedTarget->target_value ?? 0) : (float) $branchRows->sum('target_value');
        $actual = (float) $branchRows->sum('actual_value');

        return response()->json([
            'success' => true,
            'data' => [
                'date' => $date,
                'target_type' => $type,
                'can_manage' => $access->isSuperAdmin($user),
                'branches' => $branchRows,
                'combined' => array_merge($this->targetRow(null, 'All Branches / Combined', $configured, $actual, $combinedTarget), ['combined_mode' => $mode]),
            ],
        ]);
    }

    public function saveTargets(Request $request, AccessControlService $access)
    {
        abort_unless($access->isSuperAdmin($request->user()), 403, 'Only Super Admin can manage targets.');
        abort_unless(Schema::hasTable('dashboard_targets'), 409, 'Dashboard target migration is required.');

        $validated = $request->validate([
            'date' => ['required', 'date'],
            'target_type' => ['required', Rule::in(['sales_amount', 'sales_quantity', 'profit', 'collection', 'purchase'])],
            'combined_mode' => ['required', Rule::in(['manual', 'auto_total'])],
            'combined_target' => ['nullable', 'numeric', 'min:0'],
            'branch_targets' => ['required', 'array'],
            'branch_targets.*.branch_id' => ['required', 'integer', 'exists:branches,id'],
            'branch_targets.*.target_value' => ['required', 'numeric', 'min:0'],
        ]);

        $user = $request->user();
        $before = DB::table('dashboard_targets')->where('target_date', $validated['date'])->where('target_type', $validated['target_type'])->get()->map(fn ($x) => (array) $x)->all();

        DB::transaction(function () use ($validated, $user) {
            foreach ($validated['branch_targets'] as $row) {
                DB::table('dashboard_targets')->updateOrInsert(
                    ['target_date' => $validated['date'], 'target_type' => $validated['target_type'], 'scope_key' => 'branch:' . $row['branch_id']],
                    ['branch_id' => $row['branch_id'], 'target_value' => $row['target_value'], 'combined_mode' => null, 'is_active' => true, 'updated_by' => $user->id, 'created_by' => $user->id, 'updated_at' => now(), 'created_at' => now()]
                );
            }
            DB::table('dashboard_targets')->updateOrInsert(
                ['target_date' => $validated['date'], 'target_type' => $validated['target_type'], 'scope_key' => 'combined'],
                ['branch_id' => null, 'target_value' => $validated['combined_target'] ?? 0, 'combined_mode' => $validated['combined_mode'], 'is_active' => true, 'updated_by' => $user->id, 'created_by' => $user->id, 'updated_at' => now(), 'created_at' => now()]
            );
        });

        AuditLog::create([
            'user_id' => $user->id,
            'branch_id' => $user->branch_id,
            'user_name' => $user->name,
            'user_email' => $user->email,
            'roles' => $access->roleNames($user),
            'action' => 'update',
            'method' => 'POST',
            'path' => $request->path(),
            'module' => 'dashboard_targets',
            'description' => 'Dashboard branch and combined targets updated.',
            'status_code' => 200,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'meta' => ['before' => $before, 'after' => $validated],
        ]);

        return $this->targets($request->merge(['date' => $validated['date'], 'target_type' => $validated['target_type']]), $access);
    }

    public function chatUsers(Request $request, AccessControlService $access)
    {
        $users = User::query()->where('id', '<>', $request->user()->id)->where(function ($q) {
            $q->whereNull('status')->orWhereIn('status', ['active', 'Active', 1]);
        })->with('branch:id,name')->orderBy('name')->get(['id', 'name', 'email', 'phone', 'branch_id', 'profile_photo']);

        return response()->json(['success' => true, 'data' => $users->map(fn ($user) => [
            'id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'phone' => $user->phone,
            'branch' => $user->branch?->name, 'roles' => $access->roleNames($user), 'profile_photo' => $user->profile_photo,
        ])->values()]);
    }

    public function chatThreads(Request $request)
    {
        if (! Schema::hasTable('nst_staff_chat_threads')) return response()->json(['success' => true, 'migration_required' => true, 'data' => []]);
        $userId = $request->user()->id;
        $threads = DB::table('nst_staff_chat_threads as t')
            ->join('nst_staff_chat_participants as p', 'p.thread_id', '=', 't.id')
            ->where('p.user_id', $userId)
            ->select('t.*', 'p.last_read_message_id')
            ->orderByDesc(DB::raw('COALESCE(t.last_message_at,t.created_at)'))
            ->get();

        $data = $threads->map(function ($thread) use ($userId) {
            $participants = DB::table('nst_staff_chat_participants as p')->join('users as u', 'u.id', '=', 'p.user_id')->where('p.thread_id', $thread->id)->get(['u.id', 'u.name', 'u.profile_photo']);
            $last = DB::table('nst_staff_chat_messages')->where('thread_id', $thread->id)->latest('id')->first();
            $unread = DB::table('nst_staff_chat_messages')->where('thread_id', $thread->id)->where('sender_id', '<>', $userId)
                ->when($thread->last_read_message_id, fn ($q) => $q->where('id', '>', $thread->last_read_message_id))->count();
            return [
                'id' => $thread->id,
                'title' => $thread->title ?: $participants->where('id', '<>', $userId)->pluck('name')->join(', '),
                'is_group' => (bool) $thread->is_group,
                'participants' => $participants,
                'last_message' => $last?->body,
                'last_message_at' => $last?->created_at ?: $thread->last_message_at,
                'unread_count' => $unread,
            ];
        })->values();
        return response()->json(['success' => true, 'data' => $data]);
    }

    public function createChatThread(Request $request)
    {
        abort_unless(Schema::hasTable('nst_staff_chat_threads'), 409, 'Staff Chat migration is required.');
        $validated = $request->validate(['title' => ['nullable', 'string', 'max:120'], 'participant_ids' => ['required', 'array', 'min:1'], 'participant_ids.*' => ['integer', 'exists:users,id']]);
        $ids = array_values(array_unique(array_merge([$request->user()->id], $validated['participant_ids'])));
        if (count($ids) === 2) {
            $existing = DB::table('nst_staff_chat_participants as a')->join('nst_staff_chat_participants as b', 'a.thread_id', '=', 'b.thread_id')
                ->join('nst_staff_chat_threads as t', 't.id', '=', 'a.thread_id')
                ->where('t.is_group', false)->where('a.user_id', $ids[0])->where('b.user_id', $ids[1])->value('t.id');
            if ($existing) return response()->json(['success' => true, 'data' => ['id' => $existing, 'existing' => true]]);
        }
        $id = DB::transaction(function () use ($request, $validated, $ids) {
            $id = DB::table('nst_staff_chat_threads')->insertGetId(['title' => $validated['title'] ?? null, 'is_group' => count($ids) > 2, 'created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now()]);
            foreach ($ids as $userId) DB::table('nst_staff_chat_participants')->insert(['thread_id' => $id, 'user_id' => $userId, 'created_at' => now(), 'updated_at' => now()]);
            return $id;
        });
        return response()->json(['success' => true, 'data' => ['id' => $id]], 201);
    }

    public function chatMessages(Request $request, int $thread)
    {
        $participant = DB::table('nst_staff_chat_participants')->where('thread_id', $thread)->where('user_id', $request->user()->id)->first();
        abort_unless($participant, 403, 'You are not a participant in this chat.');
        $messages = DB::table('nst_staff_chat_messages as m')->join('users as u', 'u.id', '=', 'm.sender_id')->where('m.thread_id', $thread)
            ->orderByDesc('m.id')->limit(500)->get(['m.*', 'u.name as sender_name', 'u.profile_photo as sender_photo'])->reverse()->values();
        $lastId = $messages->max('id');
        if ($lastId) DB::table('nst_staff_chat_participants')->where('thread_id', $thread)->where('user_id', $request->user()->id)->update(['last_read_message_id' => $lastId, 'last_seen_at' => now(), 'updated_at' => now()]);
        return response()->json(['success' => true, 'data' => $messages->map(function ($row) use ($thread) {
            $item = (array) $row;
            $attachments = json_decode($row->attachments ?: '[]', true) ?: [];
            $item['attachments'] = collect($attachments)->values()->map(function ($attachment, $index) use ($thread, $row) {
                unset($attachment['path']);
                $attachment['url'] = url("/api/staff-chat/threads/{$thread}/messages/{$row->id}/attachments/{$index}");
                return $attachment;
            })->all();
            return $item;
        })->values()]);
    }

    public function sendChatMessage(Request $request, int $thread)
    {
        abort_unless(DB::table('nst_staff_chat_participants')->where('thread_id', $thread)->where('user_id', $request->user()->id)->exists(), 403, 'You are not a participant in this chat.');
        $validated = $request->validate(['body' => ['nullable', 'string', 'max:10000'], 'attachments' => ['nullable', 'array', 'max:5'], 'attachments.*' => ['file', 'max:10240', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx,xls,xlsx,csv,txt,zip']]);
        $attachments = [];
        foreach ($request->file('attachments', []) as $file) {
            $path = $file->store('nst-chat/' . now()->format('Y/m'), 'local');
            $attachments[] = ['name' => $file->getClientOriginalName(), 'mime' => $file->getClientMimeType(), 'size' => $file->getSize(), 'path' => $path];
        }
        abort_if(trim((string) ($validated['body'] ?? '')) === '' && $attachments === [], 422, 'Message or attachment is required.');
        $id = DB::transaction(function () use ($request, $thread, $validated, $attachments) {
            $id = DB::table('nst_staff_chat_messages')->insertGetId(['thread_id' => $thread, 'sender_id' => $request->user()->id, 'body' => trim((string) ($validated['body'] ?? '')) ?: null, 'attachments' => json_encode($attachments), 'created_at' => now(), 'updated_at' => now()]);
            DB::table('nst_staff_chat_threads')->where('id', $thread)->update(['last_message_at' => now(), 'updated_at' => now()]);
            DB::table('nst_staff_chat_participants')->where('thread_id', $thread)->where('user_id', $request->user()->id)->update(['last_read_message_id' => $id, 'last_seen_at' => now(), 'updated_at' => now()]);
            return $id;
        });
        return response()->json(['success' => true, 'data' => ['id' => $id]], 201);
    }

    public function downloadChatAttachment(Request $request, int $thread, int $message, int $attachment)
    {
        abort_unless(DB::table('nst_staff_chat_participants')->where('thread_id', $thread)->where('user_id', $request->user()->id)->exists(), 403, 'You are not a participant in this chat.');
        $row = DB::table('nst_staff_chat_messages')->where('id', $message)->where('thread_id', $thread)->first();
        abort_unless($row, 404);
        $attachments = json_decode($row->attachments ?: '[]', true) ?: [];
        $item = $attachments[$attachment] ?? null;
        abort_unless(is_array($item) && ! empty($item['path']) && Storage::disk('local')->exists($item['path']), 404);
        return Storage::disk('local')->download($item['path'], $item['name'] ?? basename($item['path']), ['Content-Type' => $item['mime'] ?? 'application/octet-stream']);
    }

    public function chatPresence(Request $request, ?int $thread = null)
    {
        $user = $request->user();
        Cache::put('nst-chat-online:' . $user->id, now()->timestamp, 90);
        if ($request->isMethod('post') && $thread) {
            abort_unless(DB::table('nst_staff_chat_participants')->where('thread_id', $thread)->where('user_id', $user->id)->exists(), 403);
            Cache::put("nst-chat-typing:{$thread}:{$user->id}", (bool) $request->boolean('typing'), 15);
        }
        if (! $thread) return response()->json(['success' => true]);
        $participants = DB::table('nst_staff_chat_participants as p')->join('users as u', 'u.id', '=', 'p.user_id')->where('p.thread_id', $thread)->get(['u.id', 'u.name']);
        return response()->json(['success' => true, 'data' => $participants->map(fn ($p) => ['id' => $p->id, 'name' => $p->name, 'online' => Cache::has('nst-chat-online:' . $p->id), 'typing' => (bool) Cache::get("nst-chat-typing:{$thread}:{$p->id}", false)])->values()]);
    }

    public function bulletins(Request $request, AccessControlService $access)
    {
        if (! Schema::hasTable('business_bulletins')) return response()->json(['success' => true, 'migration_required' => true, 'data' => []]);
        $user = $request->user();
        $rows = $this->visibleBulletins($user, $access);
        $readIds = Schema::hasTable('business_bulletin_reads') ? DB::table('business_bulletin_reads')->where('user_id', $user->id)->pluck('bulletin_id')->all() : [];
        return response()->json(['success' => true, 'can_manage' => $access->isSuperAdmin($user), 'data' => $rows->map(function ($row) use ($readIds) { $item = (array) $row; $item['audience_roles'] = json_decode($row->audience_roles ?: '[]', true) ?: []; $item['branch_ids'] = json_decode($row->branch_ids ?: '[]', true) ?: []; $item['is_read'] = in_array($row->id, $readIds); $item['attachment_url'] = $row->attachment_path ? url('/api/business-bulletins/' . $row->id . '/attachment') : null; return $item; })->values()]);
    }

    public function saveBulletin(Request $request, AccessControlService $access, ?int $bulletin = null)
    {
        abort_unless($access->isSuperAdmin($request->user()), 403, 'Only Super Admin can manage bulletins.');
        abort_unless(Schema::hasTable('business_bulletins'), 409, 'Business Bulletin migration is required.');
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:190'], 'body' => ['required', 'string', 'max:20000'],
            'priority' => ['required', Rule::in(['normal', 'important', 'urgent'])], 'audience_roles' => ['nullable', 'array'],
            'branch_ids' => ['nullable', 'array'], 'branch_ids.*' => ['integer', 'exists:branches,id'],
            'publish_at' => ['nullable', 'date'], 'expires_at' => ['nullable', 'date', 'after:publish_at'],
            'status' => ['required', Rule::in(['draft', 'published', 'archived'])], 'attachment' => ['nullable', 'file', 'max:10240', 'mimes:jpg,jpeg,png,webp,pdf,doc,docx,xls,xlsx,csv,txt,zip'],
        ]);
        $existing = $bulletin ? DB::table('business_bulletins')->where('id', $bulletin)->first() : null;
        abort_if($bulletin && ! $existing, 404);
        $path = $existing?->attachment_path;
        if ($request->hasFile('attachment')) $path = $request->file('attachment')->store('business-bulletins/' . now()->format('Y/m'), 'local');
        $payload = [
            'title' => $validated['title'], 'body' => $validated['body'], 'priority' => $validated['priority'],
            'audience_roles' => json_encode($validated['audience_roles'] ?? []), 'branch_ids' => json_encode($validated['branch_ids'] ?? []),
            'publish_at' => $validated['publish_at'] ?? now(), 'expires_at' => $validated['expires_at'] ?? null, 'status' => $validated['status'],
            'attachment_path' => $path, 'updated_by' => $request->user()->id, 'updated_at' => now(),
        ];
        if ($existing) DB::table('business_bulletins')->where('id', $bulletin)->update($payload);
        else { $payload['created_by'] = $request->user()->id; $payload['created_at'] = now(); $bulletin = DB::table('business_bulletins')->insertGetId($payload); }
        return response()->json(['success' => true, 'data' => ['id' => $bulletin]]);
    }

    public function downloadBulletinAttachment(Request $request, AccessControlService $access, int $bulletin)
    {
        $visible = $this->visibleBulletins($request->user(), $access)->firstWhere('id', $bulletin);
        abort_unless($visible && $visible->attachment_path && Storage::disk('local')->exists($visible->attachment_path), 404);
        return Storage::disk('local')->download($visible->attachment_path, basename($visible->attachment_path));
    }

    public function readBulletin(Request $request, int $bulletin)
    {
        abort_unless(DB::table('business_bulletins')->where('id', $bulletin)->exists(), 404);
        DB::table('business_bulletin_reads')->updateOrInsert(['bulletin_id' => $bulletin, 'user_id' => $request->user()->id], ['read_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        return response()->json(['success' => true]);
    }

    public function businessHealth(Request $request)
    {
        return response()->json(['success' => true, 'data' => $this->healthSnapshot()]);
    }

    private function visibleBulletins($user, AccessControlService $access)
    {
        if (! Schema::hasTable('business_bulletins')) return collect();
        $roles = $access->roleNames($user);
        $branchId = (int) ($user->branch_id ?? 0);
        return DB::table('business_bulletins')
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('publish_at')->orWhere('publish_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 1 WHEN 'important' THEN 2 ELSE 3 END")
            ->orderByDesc('publish_at')
            ->get()
            ->filter(function ($row) use ($roles, $branchId) {
                $audience = json_decode($row->audience_roles ?: '[]', true) ?: [];
                $branches = json_decode($row->branch_ids ?: '[]', true) ?: [];
                return ($audience === [] || array_intersect($roles, $audience)) && ($branches === [] || in_array($branchId, array_map('intval', $branches), true));
            })
            ->values();
    }

    private function businessTimezone(): string
    {
        try {
            if (Schema::hasTable('settings')) {
                $saved = DB::table('settings')->where('key', 'timezone')->value('value');
                if (is_string($saved) && in_array($saved, timezone_identifiers_list(), true)) {
                    return $saved;
                }
            }
        } catch (Throwable $e) {
            report($e);
        }

        return 'Asia/Dhaka';
    }

    private function targetActual(string $date, string $type, ?int $branchId): float
    {
        try {
            // Same business day as the dashboard KPI cards (shop timezone), not the UTC app clock.
            $timezone = $this->businessTimezone();
            $start = Carbon::parse($date, $timezone)->startOfDay()->utc();
            $end = Carbon::parse($date, $timezone)->endOfDay()->utc();
            if (in_array($type, ['sales_amount', 'profit', 'collection'], true) && Schema::hasTable('sales')) {
                $q = DB::table('sales')->whereBetween('created_at', [$start, $end]);
                if ($branchId && Schema::hasColumn('sales', 'branch_id')) $q->where('branch_id', $branchId);
                if (Schema::hasColumn('sales', 'status')) $q->whereNotIn('status', ['cancelled', 'returned', 'void']);
                $column = $type === 'profit' ? 'profit_amount' : ($type === 'collection' ? 'paid_amount' : (Schema::hasColumn('sales', 'final_amount') ? 'final_amount' : 'total'));
                return Schema::hasColumn('sales', $column) ? (float) $q->sum($column) : 0;
            }
            if ($type === 'sales_quantity' && Schema::hasTable('sales') && Schema::hasTable('sale_items')) {
                $q = DB::table('sale_items as si')->join('sales as s', 's.id', '=', 'si.sale_id')->whereBetween('s.created_at', [$start, $end]);
                if ($branchId && Schema::hasColumn('sales', 'branch_id')) $q->where('s.branch_id', $branchId);
                if (Schema::hasColumn('sales', 'status')) $q->whereNotIn('s.status', ['cancelled', 'returned', 'void']);
                return (float) $q->sum('si.quantity');
            }
            if ($type === 'purchase' && Schema::hasTable('purchases')) {
                $q = DB::table('purchases')->whereBetween('created_at', [$start, $end]);
                if ($branchId && Schema::hasColumn('purchases', 'branch_id')) $q->where('branch_id', $branchId);
                foreach (['final_amount', 'grand_total', 'total_amount', 'total'] as $column) if (Schema::hasColumn('purchases', $column)) return (float) $q->sum($column);
            }
        } catch (Throwable $e) { report($e); }
        return 0;
    }

    private function targetRow($branchId, string $name, float $target, float $actual, $record): array
    {
        $remaining = max(0, $target - $actual);
        $percentage = $target > 0 ? round(($actual / $target) * 100, 2) : 0;
        return ['branch_id' => $branchId, 'branch_name' => $name, 'target_value' => $target, 'actual_value' => $actual, 'remaining_value' => $remaining, 'percentage' => $percentage, 'status' => $target <= 0 ? 'not_set' : ($actual >= $target ? 'achieved' : 'in_progress'), 'last_refreshed_at' => now()->toIso8601String(), 'updated_at' => $record->updated_at ?? null];
    }

    private function healthSnapshot(): array
    {
        return Cache::remember('nst:dashboard:health-snapshot:v2', now()->addSeconds(60), function () {
            $checks = [];
            try {
                DB::select('select 1');
                $checks['database'] = ['status' => 'pass', 'message' => 'Database connection successful.'];
            } catch (Throwable $e) {
                $checks['database'] = ['status' => 'fail', 'message' => $e->getMessage()];
            }
            $checks['application'] = ['status' => 'pass', 'message' => 'Laravel application responded.'];
            $checks['api'] = ['status' => 'pass', 'message' => 'Authenticated dashboard API responded.'];
            $checks['storage'] = ['status' => is_writable(storage_path()) ? 'pass' : 'fail', 'message' => is_writable(storage_path()) ? 'Storage is writable.' : 'Storage is not writable.'];
            $checks['cache'] = ['status' => config('cache.default') ? 'pass' : 'warning', 'message' => 'Driver: ' . (config('cache.default') ?: 'not configured')];
            $checks['queue'] = ['status' => config('queue.default') === 'sync' ? 'warning' : 'pass', 'message' => 'Driver: ' . config('queue.default')];
            $checks['scheduler'] = ['status' => Schema::hasTable('migrations') ? 'pass' : 'warning', 'message' => 'Scheduler command availability requires host cron verification.'];
            $checks['mail'] = ['status' => config('mail.default') ? 'pass' : 'warning', 'message' => 'Mailer: ' . (config('mail.default') ?: 'not configured')];
            $backupRoot = storage_path('app/backups');
            $checks['backup'] = ['status' => is_dir($backupRoot) && is_writable($backupRoot) ? 'pass' : 'warning', 'message' => is_dir($backupRoot) ? 'Backup directory detected.' : 'No backup directory detected yet.'];
            $checks['environment'] = ['status' => config('app.key') ? 'pass' : 'fail', 'message' => 'APP_ENV=' . app()->environment() . '; timezone=' . config('app.timezone')];
            $failed = collect($checks)->where('status', 'fail')->count();
            $warnings = collect($checks)->where('status', 'warning')->count();

            return ['overall_status' => $failed ? 'error' : ($warnings ? 'warning' : 'ok'), 'checks' => $checks, 'failed' => $failed, 'warnings' => $warnings, 'checked_at' => now()->toIso8601String()];
        });
    }
}
