<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class CustomerMessageActionController extends Controller
{
    public function destroy(Request $request, int $messageId): JsonResponse
    {
        if (! $this->messageExists($messageId)) {
            return $this->notFound();
        }

        DB::transaction(function () use ($messageId) {
            if (Schema::hasTable('customer_message_replies')) {
                DB::table('customer_message_replies')
                    ->where('customer_message_id', $messageId)
                    ->delete();
            }

            DB::table('customer_messages')
                ->where('id', $messageId)
                ->delete();
        });

        return response()->json([
            'status' => true,
            'message' => 'Message permanently deleted.',
            'deleted_id' => $messageId,
        ]);
    }

    public function close(Request $request, int $messageId): JsonResponse
    {
        if (! $this->messageExists($messageId)) {
            return $this->notFound();
        }

        $data = [
            'status' => 'closed',
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('customer_messages', 'closed_at')) {
            $data['closed_at'] = now();
        }

        if (Schema::hasColumn('customer_messages', 'staff_unread')) {
            $data['staff_unread'] = false;
        }

        if (Schema::hasColumn('customer_messages', 'customer_unread')) {
            $data['customer_unread'] = true;
        }

        if (Schema::hasColumn('customer_messages', 'is_read')) {
            $data['is_read'] = true;
        }

        if (Schema::hasColumn('customer_messages', 'last_message_at')) {
            $data['last_message_at'] = now();
        }

        DB::table('customer_messages')->where('id', $messageId)->update($data);

        return response()->json([
            'status' => true,
            'message' => 'Message closed.',
            'data' => $this->message($messageId),
        ]);
    }

    public function status(Request $request, int $messageId): JsonResponse
    {
        if (! $this->messageExists($messageId)) {
            return $this->notFound();
        }

        $request->validate([
            'status' => ['required', 'string', 'max:40'],
        ]);

        $allowed = ['new', 'open', 'pending', 'replied', 'closed', 'archived', 'trash'];
        $status = strtolower((string) $request->input('status'));

        if (! in_array($status, $allowed, true)) {
            return response()->json([
                'status' => false,
                'message' => 'Invalid status.',
            ], 422);
        }

        $data = [
            'status' => $status,
            'updated_at' => now(),
        ];

        if (Schema::hasColumn('customer_messages', 'closed_at')) {
            $data['closed_at'] = $status === 'closed' ? now() : null;
        }

        if (Schema::hasColumn('customer_messages', 'folder')) {
            if ($status === 'trash') {
                $data['folder'] = 'trash';
            } elseif ($status === 'archived') {
                $data['folder'] = 'archive';
            } else {
                $data['folder'] = 'inbox';
            }
        }

        if (Schema::hasColumn('customer_messages', 'last_message_at')) {
            $data['last_message_at'] = now();
        }

        DB::table('customer_messages')->where('id', $messageId)->update($data);

        return response()->json([
            'status' => true,
            'message' => 'Message status updated.',
            'data' => $this->message($messageId),
        ]);
    }

    private function messageExists(int $messageId): bool
    {
        return Schema::hasTable('customer_messages')
            && DB::table('customer_messages')->where('id', $messageId)->exists();
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'status' => false,
            'message' => 'Customer message not found.',
        ], 404);
    }

    private function message(int $messageId): ?array
    {
        $row = DB::table('customer_messages')->where('id', $messageId)->first();

        if (! $row) {
            return null;
        }

        return [
            'id' => $row->id,
            'ticket_no' => $row->ticket_no ?? null,
            'status' => $row->status ?? null,
            'folder' => $row->folder ?? null,
            'created_at' => $row->created_at ?? null,
            'updated_at' => $row->updated_at ?? null,
            'created_at_dhaka' => $this->dhaka($row->created_at ?? null),
            'updated_at_dhaka' => $this->dhaka($row->updated_at ?? null),
            'closed_at_dhaka' => $this->dhaka($row->closed_at ?? null),
        ];
    }

    private function dhaka($value): ?string
    {
        if (! $value) {
            return null;
        }

        try {
            return \Carbon\Carbon::parse($value)
                ->timezone(config('app.timezone', 'Asia/Dhaka'))
                ->format('d M Y, h:i:s A');
        } catch (\Throwable) {
            return null;
        }
    }
}
