<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\PublicMediaUrlService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        return response()->json([
            'success' => true,
            'data' => $this->formatUser($request->user()),
        ]);
    }

    public function update(Request $request)
    {
        $user = $request->user();

        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'phone' => ['nullable', 'string', 'max:50'],
            'username' => ['nullable', 'string', 'max:100'],
            'address' => ['nullable', 'string', 'max:2000'],
            'profile_photo' => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'current_password' => ['nullable', 'string'],
            'password' => ['nullable', 'string', 'min:6', 'confirmed'],
        ];

        if (Schema::hasColumn('users', 'phone')) {
            $rules['phone'][] = Rule::unique('users', 'phone')->ignore($user->id);
        }
        if (Schema::hasColumn('users', 'username')) {
            $rules['username'][] = Rule::unique('users', 'username')->ignore($user->id);
        }

        $validated = $request->validate($rules);

        if (! empty($validated['password'])) {
            if (! Hash::check((string) $request->current_password, $user->password)) {
                return response()->json(['success' => false, 'message' => 'Current password is incorrect.'], 422);
            }
        }

        $data = [];
        foreach (['name', 'email', 'phone', 'username', 'address'] as $column) {
            if (Schema::hasColumn('users', $column) && $request->has($column)) {
                $data[$column] = $validated[$column] ?? null;
            }
        }

        if ($request->hasFile('profile_photo') && Schema::hasColumn('users', 'profile_photo')) {
            if ($user->profile_photo && Storage::disk('public')->exists($user->profile_photo)) {
                Storage::disk('public')->delete($user->profile_photo);
            }
            $data['profile_photo'] = $request->file('profile_photo')->store('profile-photos', 'public');
        }

        if (! empty($validated['password'])) {
            $data['password'] = Hash::make($validated['password']);
            if (Schema::hasColumn('users', 'must_change_password')) {
                $data['must_change_password'] = false;
            }
            if (Schema::hasColumn('users', 'temporary_password')) {
                $data['temporary_password'] = null;
            }
        }

        $user->update($data);

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully.',
            'data' => $this->formatUser($user->fresh()),
        ]);
    }

    private function formatUser($user): array
    {
        $data = [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
        ];

        foreach (['username', 'phone', 'address', 'profile_photo', 'status', 'profile_type', 'branch_id', 'customer_id', 'supplier_id'] as $column) {
            if (Schema::hasColumn('users', $column)) {
                $data[$column] = $user->{$column};
            }
        }

        $data['profile_photo_url'] = ! empty($data['profile_photo']) ? PublicMediaUrlService::forPath($data['profile_photo'], optional($user->updated_at)->timestamp) : null;

        return $data;
    }
}
