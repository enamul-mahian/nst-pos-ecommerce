<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Temporary passwords were saved in plain text next to the hash. They are now only shown once in the API
 * response, so the stored copies are removed. Accounts keep must_change_password, so nobody is locked out.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('users') && Schema::hasColumn('users', 'temporary_password')) {
            DB::table('users')->whereNotNull('temporary_password')->update(['temporary_password' => null]);
        }
    }

    public function down(): void
    {
        // Plain-text passwords cannot and should not be restored.
    }
};
