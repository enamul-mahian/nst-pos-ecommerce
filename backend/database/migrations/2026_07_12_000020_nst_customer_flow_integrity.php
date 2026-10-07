<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->ensureCustomerMessages();
        $this->ensureMessageReplies();
        $this->ensureExternalPreorderPayment();
        $this->ensureBookingCustomStatus();
        $this->normalizeExistingRows();
        $this->convertCustomerFlowTablesToUtf8mb4();
    }

    public function down(): void
    {
        // Data-preserving rollback: columns and customer history are intentionally retained.
    }

    private function ensureCustomerMessages(): void
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
                $table->string('public_token', 120)->nullable()->index();
                $table->boolean('wants_transcript_email')->default(false)->index();
                $table->boolean('contact_consent')->default(false)->index();
                $table->string('company_copy_email')->nullable();
                $table->string('visitor_ip', 80)->nullable();
                $table->string('user_agent', 600)->nullable();
                $table->timestamp('trashed_at')->nullable()->index();
                $table->timestamps();
            });

            return;
        }

        $columns = [
            'ticket_no' => fn (Blueprint $table) => $table->string('ticket_no')->nullable(),
            'customer_id' => fn (Blueprint $table) => $table->unsignedBigInteger('customer_id')->nullable()->index(),
            'sale_id' => fn (Blueprint $table) => $table->unsignedBigInteger('sale_id')->nullable()->index(),
            'invoice_no' => fn (Blueprint $table) => $table->string('invoice_no')->nullable()->index(),
            'name' => fn (Blueprint $table) => $table->string('name')->nullable(),
            'phone' => fn (Blueprint $table) => $table->string('phone')->nullable()->index(),
            'email' => fn (Blueprint $table) => $table->string('email')->nullable()->index(),
            'subject' => fn (Blueprint $table) => $table->string('subject')->nullable(),
            'category' => fn (Blueprint $table) => $table->string('category')->nullable()->index(),
            'message' => fn (Blueprint $table) => $table->longText('message')->nullable(),
            'admin_reply' => fn (Blueprint $table) => $table->longText('admin_reply')->nullable(),
            'status' => fn (Blueprint $table) => $table->string('status')->default('open')->index(),
            'assigned_to' => fn (Blueprint $table) => $table->unsignedBigInteger('assigned_to')->nullable(),
            'replied_by' => fn (Blueprint $table) => $table->unsignedBigInteger('replied_by')->nullable(),
            'replied_at' => fn (Blueprint $table) => $table->timestamp('replied_at')->nullable(),
            'metadata' => fn (Blueprint $table) => $table->json('metadata')->nullable(),
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
            'public_token' => fn (Blueprint $table) => $table->string('public_token', 120)->nullable()->index(),
            'wants_transcript_email' => fn (Blueprint $table) => $table->boolean('wants_transcript_email')->default(false)->index(),
            'contact_consent' => fn (Blueprint $table) => $table->boolean('contact_consent')->default(false)->index(),
            'company_copy_email' => fn (Blueprint $table) => $table->string('company_copy_email')->nullable(),
            'visitor_ip' => fn (Blueprint $table) => $table->string('visitor_ip', 80)->nullable(),
            'user_agent' => fn (Blueprint $table) => $table->string('user_agent', 600)->nullable(),
            'trashed_at' => fn (Blueprint $table) => $table->timestamp('trashed_at')->nullable()->index(),
        ];

        foreach ($columns as $name => $definition) {
            $this->addColumnIfMissing('customer_messages', $name, $definition);
        }
    }

    private function ensureMessageReplies(): void
    {
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

            return;
        }

        // Repair partially-created legacy/experimental reply tables without deleting conversation data.
        $columns = [
            'customer_message_id' => fn (Blueprint $table) => $table->unsignedBigInteger('customer_message_id')->nullable()->index(),
            'sender_type' => fn (Blueprint $table) => $table->string('sender_type')->default('customer')->index(),
            'sender_user_id' => fn (Blueprint $table) => $table->unsignedBigInteger('sender_user_id')->nullable()->index(),
            'sender_name' => fn (Blueprint $table) => $table->string('sender_name')->nullable(),
            'message' => fn (Blueprint $table) => $table->longText('message')->nullable(),
            'attachments' => fn (Blueprint $table) => $table->json('attachments')->nullable(),
            'cloud_link' => fn (Blueprint $table) => $table->string('cloud_link', 2000)->nullable(),
            'created_at' => fn (Blueprint $table) => $table->timestamp('created_at')->nullable(),
            'updated_at' => fn (Blueprint $table) => $table->timestamp('updated_at')->nullable(),
        ];

        foreach ($columns as $name => $definition) {
            $this->addColumnIfMissing('customer_message_replies', $name, $definition);
        }
    }

    private function ensureExternalPreorderPayment(): void
    {
        if (! Schema::hasTable('external_preorders')) {
            return;
        }

        $columns = [
            'custom_status' => fn (Blueprint $table) => $table->string('custom_status', 120)->nullable()->index(),
            'payment_method' => fn (Blueprint $table) => $table->string('payment_method', 40)->default('cash_on_delivery')->index(),
            'payment_status' => fn (Blueprint $table) => $table->string('payment_status', 40)->default('cod_pending')->index(),
            'transaction_id' => fn (Blueprint $table) => $table->string('transaction_id', 190)->nullable()->index(),
            'payment_submitted_at' => fn (Blueprint $table) => $table->timestamp('payment_submitted_at')->nullable(),
            'payment_verified_at' => fn (Blueprint $table) => $table->timestamp('payment_verified_at')->nullable(),
            'payment_verified_by' => fn (Blueprint $table) => $table->unsignedBigInteger('payment_verified_by')->nullable()->index(),
            'payment_rejection_reason' => fn (Blueprint $table) => $table->text('payment_rejection_reason')->nullable(),
            'status_history' => fn (Blueprint $table) => $table->json('status_history')->nullable(),
        ];

        foreach ($columns as $name => $definition) {
            $this->addColumnIfMissing('external_preorders', $name, $definition);
        }
    }

    private function ensureBookingCustomStatus(): void
    {
        if (! Schema::hasTable('booking_preorders')) {
            return;
        }

        $columns = [
            'custom_status' => fn (Blueprint $table) => $table->string('custom_status', 120)->nullable()->index(),
            'payment_status' => fn (Blueprint $table) => $table->string('payment_status', 40)->default('cod_pending')->index(),
            'payment_submitted_at' => fn (Blueprint $table) => $table->timestamp('payment_submitted_at')->nullable(),
            'payment_verified_at' => fn (Blueprint $table) => $table->timestamp('payment_verified_at')->nullable(),
            'payment_verified_by' => fn (Blueprint $table) => $table->unsignedBigInteger('payment_verified_by')->nullable()->index(),
            'payment_rejection_reason' => fn (Blueprint $table) => $table->text('payment_rejection_reason')->nullable(),
            'status_history' => fn (Blueprint $table) => $table->json('status_history')->nullable(),
        ];

        foreach ($columns as $name => $definition) {
            $this->addColumnIfMissing('booking_preorders', $name, $definition);
        }
    }

    private function normalizeExistingRows(): void
    {
        if (Schema::hasTable('customer_messages') && Schema::hasColumn('customer_messages', 'ticket_no')) {
            DB::table('customer_messages')
                ->whereNull('ticket_no')
                ->orWhere('ticket_no', '')
                ->orderBy('id')
                ->chunkById(100, function ($rows) {
                    foreach ($rows as $row) {
                        DB::table('customer_messages')->where('id', $row->id)->update([
                            'ticket_no' => 'NST-LEGACY-' . str_pad((string) $row->id, 8, '0', STR_PAD_LEFT),
                        ]);
                    }
                });
        }

        if (Schema::hasTable('external_preorders')) {
            if (Schema::hasColumn('external_preorders', 'custom_status')) {
                DB::table('external_preorders')->whereNull('custom_status')->update(['custom_status' => 'Order Recorded']);
            }
            if (Schema::hasColumn('external_preorders', 'payment_method')) {
                DB::table('external_preorders')->whereNull('payment_method')->update(['payment_method' => 'cash_on_delivery']);
            }
            if (Schema::hasColumn('external_preorders', 'payment_status')) {
                DB::table('external_preorders')->whereNull('payment_status')->update(['payment_status' => 'cod_pending']);
            }
        }

        if (Schema::hasTable('booking_preorders')) {
            if (Schema::hasColumn('booking_preorders', 'custom_status')) {
                DB::table('booking_preorders')->whereNull('custom_status')->update(['custom_status' => 'Order Recorded']);
            }
            if (Schema::hasColumn('booking_preorders', 'payment_method')) {
                DB::table('booking_preorders')->whereNull('payment_method')->update(['payment_method' => 'cash_on_delivery']);
            }
            if (Schema::hasColumn('booking_preorders', 'payment_status')) {
                DB::table('booking_preorders')->whereNull('payment_status')->update(['payment_status' => 'cod_pending']);
            }
        }
    }

    private function convertCustomerFlowTablesToUtf8mb4(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }

        $prefix = DB::getTablePrefix();
        foreach (['customer_messages', 'customer_message_replies', 'chatbox_settings', 'external_preorders', 'booking_preorders', 'settings'] as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $qualified = str_replace('`', '``', $prefix . $table);
            DB::statement("ALTER TABLE `{$qualified}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        }
    }

    private function addColumnIfMissing(string $tableName, string $columnName, callable $definition): void
    {
        if (Schema::hasColumn($tableName, $columnName)) {
            return;
        }

        Schema::table($tableName, function (Blueprint $table) use ($definition) {
            $definition($table);
        });
    }
};
