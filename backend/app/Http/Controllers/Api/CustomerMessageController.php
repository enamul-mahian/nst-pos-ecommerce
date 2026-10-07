<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CustomerMessage;
use Illuminate\Http\Request;

class CustomerMessageController extends Controller
{
    public function index(Request $request)
    {
        $items = CustomerMessage::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('search'), function ($q) use ($request) {
                $s = $request->search;
                $q->where(function ($qq) use ($s) {
                    $qq->where('ticket_no', 'like', "%{$s}%")
                        ->orWhere('name', 'like', "%{$s}%")
                        ->orWhere('phone', 'like', "%{$s}%")
                        ->orWhere('email', 'like', "%{$s}%")
                        ->orWhere('invoice_no', 'like', "%{$s}%")
                        ->orWhere('subject', 'like', "%{$s}%");
                });
            })
            ->latest('id')
            ->paginate((int) $request->get('per_page', 20));
        return response()->json(['success' => true, 'data' => $items]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $data['ticket_no'] = $this->makeTicketNo();
        $message = CustomerMessage::create($data);
        return response()->json(['success' => true, 'message' => 'Message submitted.', 'data' => $message], 201);
    }

    public function show(CustomerMessage $customerMessage)
    {
        return response()->json(['success' => true, 'data' => $customerMessage]);
    }

    public function reply(Request $request, CustomerMessage $customerMessage)
    {
        $validated = $request->validate([
            'admin_reply' => ['required', 'string'],
            'status' => ['nullable', 'string', 'max:40'],
        ]);
        $customerMessage->update([
            'admin_reply' => $validated['admin_reply'],
            'status' => $validated['status'] ?? 'replied',
            'replied_by' => $request->user()?->id,
            'replied_at' => now(),
        ]);
        return response()->json(['success' => true, 'message' => 'Reply saved.', 'data' => $customerMessage->fresh()]);
    }

    public function close(CustomerMessage $customerMessage)
    {
        $customerMessage->update(['status' => 'closed']);
        return response()->json(['success' => true, 'message' => 'Message closed.']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'customer_id' => ['nullable', 'integer', 'exists:customers,id'],
            'sale_id' => ['nullable', 'integer', 'exists:sales,id'],
            'invoice_no' => ['nullable', 'string', 'max:100'],
            'name' => ['nullable', 'string', 'max:150'],
            'phone' => ['nullable', 'string', 'max:50'],
            'email' => ['nullable', 'email', 'max:150'],
            'subject' => ['nullable', 'string', 'max:200'],
            'category' => ['nullable', 'string', 'max:80'],
            'message' => ['required', 'string'],
            'metadata' => ['nullable', 'array'],
        ]);
    }

    private function makeTicketNo(): string
    {
        return 'NST-MSG-' . now()->format('ymd') . '-' . str_pad((string) (CustomerMessage::whereDate('created_at', today())->count() + 1), 4, '0', STR_PAD_LEFT);
    }
}
