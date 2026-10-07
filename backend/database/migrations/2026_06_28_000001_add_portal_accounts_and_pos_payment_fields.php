<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function addColumnIfMissing(string $table, string $column, callable $callback): void
    {
        if (Schema::hasTable($table) && !Schema::hasColumn($table, $column)) {
            Schema::table($table, function (Blueprint $tableBlueprint) use ($callback) {
                $callback($tableBlueprint);
            });
        }
    }

    public function up(): void
    {
        $this->addColumnIfMissing('users', 'username', fn (Blueprint $table) => $table->string('username')->nullable()->unique()->after('id'));
        $this->addColumnIfMissing('users', 'profile_type', fn (Blueprint $table) => $table->string('profile_type')->nullable()->after('status'));
        $this->addColumnIfMissing('users', 'customer_id', fn (Blueprint $table) => $table->foreignId('customer_id')->nullable()->after('profile_type')->constrained('customers')->nullOnDelete());
        $this->addColumnIfMissing('users', 'supplier_id', fn (Blueprint $table) => $table->foreignId('supplier_id')->nullable()->after('customer_id')->constrained('suppliers')->nullOnDelete());
        $this->addColumnIfMissing('users', 'must_change_password', fn (Blueprint $table) => $table->boolean('must_change_password')->default(false)->after('supplier_id'));
        $this->addColumnIfMissing('users', 'temporary_password', fn (Blueprint $table) => $table->string('temporary_password')->nullable()->after('must_change_password'));
        $this->addColumnIfMissing('users', 'password_reset_by', fn (Blueprint $table) => $table->foreignId('password_reset_by')->nullable()->after('temporary_password')->constrained('users')->nullOnDelete());
        $this->addColumnIfMissing('users', 'password_reset_at', fn (Blueprint $table) => $table->timestamp('password_reset_at')->nullable()->after('password_reset_by'));

        $this->addColumnIfMissing('customers', 'user_id', fn (Blueprint $table) => $table->foreignId('user_id')->nullable()->after('id')->constrained('users')->nullOnDelete());
        $this->addColumnIfMissing('suppliers', 'user_id', fn (Blueprint $table) => $table->foreignId('user_id')->nullable()->after('id')->constrained('users')->nullOnDelete());

        $this->addColumnIfMissing('sales', 'previous_due', fn (Blueprint $table) => $table->decimal('previous_due', 12, 2)->default(0)->after('discount'));
        $this->addColumnIfMissing('sales', 'cash_amount', fn (Blueprint $table) => $table->decimal('cash_amount', 12, 2)->default(0)->after('paid_amount'));
        $this->addColumnIfMissing('sales', 'bkash_amount', fn (Blueprint $table) => $table->decimal('bkash_amount', 12, 2)->default(0)->after('cash_amount'));
        $this->addColumnIfMissing('sales', 'payment_received_by', fn (Blueprint $table) => $table->string('payment_received_by')->nullable()->after('payment_method'));
        $this->addColumnIfMissing('sales', 'home_delivery', fn (Blueprint $table) => $table->boolean('home_delivery')->default(false)->after('payment_received_by'));
        $this->addColumnIfMissing('sales', 'send_sms', fn (Blueprint $table) => $table->boolean('send_sms')->default(false)->after('home_delivery'));
    }

    public function down(): void
    {
        // Safe migration: no destructive rollback by default.
    }
};
