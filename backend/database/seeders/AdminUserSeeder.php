<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use RuntimeException;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $email = trim((string) env('NST_BOOTSTRAP_ADMIN_EMAIL', 'admin@newsingapurtele.com'));
        $password = (string) env('NST_BOOTSTRAP_ADMIN_PASSWORD', '');
        $existing = User::query()->where('email', $email)->first();

        if (! $existing && strlen($password) < 12) {
            if (app()->environment('production')) {
                throw new RuntimeException('NST_BOOTSTRAP_ADMIN_PASSWORD must be configured with at least 12 characters before production seeding.');
            }

            $password = Str::password(24, symbols: true);
            $this->command?->warn("Generated one-time local bootstrap password for {$email}: {$password}");
        }

        $admin = $existing ?: User::query()->create([
            'name' => (string) env('NST_BOOTSTRAP_ADMIN_NAME', 'Super Admin'),
            'email' => $email,
            'phone' => env('NST_BOOTSTRAP_ADMIN_PHONE'),
            'password' => Hash::make($password),
            'status' => 'active',
            'profile_type' => 'super_admin',
            'must_change_password' => true,
            'temporary_password' => null,
            'email_verified_at' => now(),
        ]);

        if (! $admin->hasRole('super_admin')) {
            $admin->assignRole('super_admin');
        }

        $this->command?->info("Super Admin ready: {$email}. Password is never stored in plaintext.");
    }
}
