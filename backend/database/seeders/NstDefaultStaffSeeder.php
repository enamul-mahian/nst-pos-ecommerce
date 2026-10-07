<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Spatie\Permission\Models\Role;

class NstDefaultStaffSeeder extends Seeder
{
    public function run(): void
    {
        if (! filter_var(env('NST_SEED_DEFAULT_STAFF', false), FILTER_VALIDATE_BOOL)) {
            $this->command?->info('Default staff seeding skipped. Set NST_SEED_DEFAULT_STAFF=true only when these accounts are explicitly required.');
            return;
        }

        $password = (string) env('NST_DEFAULT_STAFF_PASSWORD', '');
        if (strlen($password) < 12) {
            throw new RuntimeException('NST_DEFAULT_STAFF_PASSWORD must contain at least 12 characters when default staff seeding is enabled.');
        }

        $salesmanRole = Role::firstOrCreate(['name' => 'salesman', 'guard_name' => 'web']);
        $accountantRole = Role::firstOrCreate(['name' => 'accountant', 'guard_name' => 'web']);

        for ($i = 1; $i <= 8; $i++) {
            $salesman = User::firstOrCreate(
                ['email' => "salesman{$i}@newsingapurtele.com"],
                $this->userPayload([
                    'name' => "Salesman {$i}",
                    'username' => "salesman{$i}",
                    'phone' => '0170000100' . $i,
                    'password' => Hash::make($password),
                    'status' => 'active',
                    'profile_type' => 'salesman',
                    'must_change_password' => true,
                    'temporary_password' => null,
                    'email_verified_at' => now(),
                ])
            );

            if (! $salesman->hasRole($salesmanRole->name)) {
                $salesman->assignRole($salesmanRole);
            }
        }

        $accountant = User::firstOrCreate(
            ['email' => 'accounts@newsingapurtele.com'],
            $this->userPayload([
                'name' => 'Accounts Officer',
                'username' => 'accounts',
                'phone' => '01700001999',
                'password' => Hash::make($password),
                'status' => 'active',
                'profile_type' => 'accountant',
                'must_change_password' => true,
                'temporary_password' => null,
                'email_verified_at' => now(),
            ])
        );

        if (! $accountant->hasRole($accountantRole->name)) {
            $accountant->assignRole($accountantRole);
        }

        $this->command?->info('NST default staff accounts created with an environment-supplied one-time password.');
    }

    private function userPayload(array $payload): array
    {
        return collect($payload)
            ->filter(fn ($value, $key) => $key === 'email_verified_at' || Schema::hasColumn('users', $key))
            ->toArray();
    }
}
