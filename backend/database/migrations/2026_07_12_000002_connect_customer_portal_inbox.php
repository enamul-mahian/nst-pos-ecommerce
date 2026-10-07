<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('customer_messages')) {
            Schema::create('customer_messages', function (Blueprint $table) {
                $table->id();
                $table->string('ticket_no')->unique();
                $table->unsignedBigInteger('customer_id')->nullable()->index();
                $table->unsignedBigInteger('sale_id')->nullable()->index();
                $table->string('invoice_no')->nullable()->index();
                $table->string('name')->nullable();
                $table->string('phone')->nullable()->index();
                $table->string('email')->nullable()->index();
                $table->string('subject')->nullable();
                $table->string('category')->nullable()->index();
                $table->longText('message');
                $table->longText('admin_reply')->nullable();
                $table->string('status')->default('open')->index();
                $table->unsignedBigInteger('assigned_to')->nullable();
                $table->unsignedBigInteger('replied_by')->nullable();
                $table->timestamp('replied_at')->nullable();
                $table->json('metadata')->nullable();
                $table->string('priority')->default('medium')->index();
                $table->string('source')->default('customer_portal')->index();
                $table->string('folder')->default('inbox')->index();
                $table->boolean('is_read')->default(false)->index();
                $table->boolean('is_starred')->default(false);
                $table->boolean('staff_unread')->default(true)->index();
                $table->boolean('customer_unread')->default(false)->index();
                $table->timestamp('customer_last_read_at')->nullable();
                $table->timestamp('staff_last_read_at')->nullable();
                $table->timestamp('last_message_at')->nullable()->index();
                $table->timestamp('closed_at')->nullable();
                $table->timestamps();
            });
        } else {
            $this->addCustomerMessageColumns();
        }

        if (! Schema::hasTable('customer_message_replies')) {
            Schema::create('customer_message_replies', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('customer_message_id')->index();
                $table->string('sender_type')->index();
                $table->unsignedBigInteger('sender_user_id')->nullable()->index();
                $table->string('sender_name')->nullable();
                $table->longText('message');
                $table->json('attachments')->nullable();
                $table->string('cloud_link', 2000)->nullable();
                $table->timestamps();
                $table->index(['customer_message_id', 'created_at'], 'cm_replies_thread_created_index');
            });
        }

        if (Schema::hasTable('customers') && ! Schema::hasColumn('customers', 'last_message_at')) {
            Schema::table('customers', function (Blueprint $table) {
                $table->timestamp('last_message_at')->nullable()->index();
            });
        }

        if (Schema::hasTable('registration_promo_codes')) {
            $this->addRegistrationCodeLifecycleColumns();
        }
    }

    public function down(): void
    {
        // Data-preserving migration: Patch Manager file rollback must not delete customer conversations or code history.
    }

    private function addCustomerMessageColumns(): void
    {
        $columns = [
            'priority' => fn (Blueprint $table) => $table->string('priority')->default('medium')->index(),
            'source' => fn (Blueprint $table) => $table->string('source')->default('customer_portal')->index(),
            'folder' => fn (Blueprint $table) => $table->string('folder')->default('inbox')->index(),
            'is_read' => fn (Blueprint $table) => $table->boolean('is_read')->default(false)->index(),
            'is_starred' => fn (Blueprint $table) => $table->boolean('is_starred')->default(false),
            'staff_unread' => fn (Blueprint $table) => $table->boolean('staff_unread')->default(true)->index(),
            'customer_unread' => fn (Blueprint $table) => $table->boolean('customer_unread')->default(false)->index(),
            'customer_last_read_at' => fn (Blueprint $table) => $table->timestamp('customer_last_read_at')->nullable(),
            'staff_last_read_at' => fn (Blueprint $table) => $table->timestamp('staff_last_read_at')->nullable(),
            'last_message_at' => fn (Blueprint $table) => $table->timestamp('last_message_at')->nullable()->index(),
            'closed_at' => fn (Blueprint $table) => $table->timestamp('closed_at')->nullable(),
        ];

        foreach ($columns as $name => $definition) {
            if (! Schema::hasColumn('customer_messages', $name)) {
                Schema::table('customer_messages', function (Blueprint $table) use ($definition) {
                    $definition($table);
                });
            }
        }
    }

    private function addRegistrationCodeLifecycleColumns(): void
    {
        $columns = [
            'is_active' => fn (Blueprint $table) => $table->boolean('is_active')->default(true)->index(),
            'starts_at' => fn (Blueprint $table) => $table->timestamp('starts_at')->nullable(),
            'expires_at' => fn (Blueprint $table) => $table->timestamp('expires_at')->nullable()->index(),
            'max_uses' => fn (Blueprint $table) => $table->unsignedInteger('max_uses')->default(1),
            'used_count' => fn (Blueprint $table) => $table->unsignedInteger('used_count')->default(0),
        ];

        foreach ($columns as $name => $definition) {
            if (! Schema::hasColumn('registration_promo_codes', $name)) {
                Schema::table('registration_promo_codes', function (Blueprint $table) use ($definition) {
                    $definition($table);
                });
            }
        }
    }
};
