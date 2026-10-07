<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private function addColumnIfMissing(string $table, string $column, callable $callback): void
    {
        if (! Schema::hasColumn($table, $column)) {
            Schema::table($table, function (Blueprint $tableBlueprint) use ($callback) {
                $callback($tableBlueprint);
            });
        }
    }

    public function up(): void
    {
        if (! Schema::hasTable('users')) {
            return;
        }

        $this->addColumnIfMissing('users', 'username', fn (Blueprint $table) => $table->string('username')->nullable()->after('id'));
        $this->addColumnIfMissing('users', 'branch_id', fn (Blueprint $table) => $table->unsignedBigInteger('branch_id')->nullable()->after('username'));
        $this->addColumnIfMissing('users', 'phone', fn (Blueprint $table) => $table->string('phone', 50)->nullable()->after('email'));
        $this->addColumnIfMissing('users', 'status', fn (Blueprint $table) => $table->string('status', 30)->default('active')->after('password'));
        $this->addColumnIfMissing('users', 'profile_type', fn (Blueprint $table) => $table->string('profile_type', 50)->nullable()->after('status'));
        $this->addColumnIfMissing('users', 'customer_id', fn (Blueprint $table) => $table->unsignedBigInteger('customer_id')->nullable()->after('profile_type'));
        $this->addColumnIfMissing('users', 'supplier_id', fn (Blueprint $table) => $table->unsignedBigInteger('supplier_id')->nullable()->after('customer_id'));
        $this->addColumnIfMissing('users', 'must_change_password', fn (Blueprint $table) => $table->boolean('must_change_password')->default(false)->after('supplier_id'));
        $this->addColumnIfMissing('users', 'temporary_password', fn (Blueprint $table) => $table->string('temporary_password')->nullable()->after('must_change_password'));
        $this->addColumnIfMissing('users', 'password_reset_by', fn (Blueprint $table) => $table->unsignedBigInteger('password_reset_by')->nullable()->after('temporary_password'));
        $this->addColumnIfMissing('users', 'password_reset_at', fn (Blueprint $table) => $table->timestamp('password_reset_at')->nullable()->after('password_reset_by'));
        $this->addColumnIfMissing('users', 'last_login_at', fn (Blueprint $table) => $table->timestamp('last_login_at')->nullable()->after('password_reset_at'));

        if (Schema::hasColumn('users', 'status')) {
            DB::table('users')->whereNull('status')->update(['status' => 'active']);
        }
    }

    public function down(): void
    {
        // Safe production migration: no automatic column drop to protect existing users.
    }
};
