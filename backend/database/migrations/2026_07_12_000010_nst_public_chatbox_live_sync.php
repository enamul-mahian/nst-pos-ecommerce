<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('customer_messages')) {
            $this->addColumnIfMissing('customer_messages', 'public_token', function (Blueprint $table) {
                $table->string('public_token', 120)->nullable()->index();
            });

            $this->addColumnIfMissing('customer_messages', 'wants_transcript_email', function (Blueprint $table) {
                $table->boolean('wants_transcript_email')->default(false)->index();
            });

            $this->addColumnIfMissing('customer_messages', 'contact_consent', function (Blueprint $table) {
                $table->boolean('contact_consent')->default(false)->index();
            });

            $this->addColumnIfMissing('customer_messages', 'company_copy_email', function (Blueprint $table) {
                $table->string('company_copy_email')->nullable();
            });

            $this->addColumnIfMissing('customer_messages', 'visitor_ip', function (Blueprint $table) {
                $table->string('visitor_ip', 80)->nullable();
            });

            $this->addColumnIfMissing('customer_messages', 'user_agent', function (Blueprint $table) {
                $table->string('user_agent', 600)->nullable();
            });

            $this->addColumnIfMissing('customer_messages', 'trashed_at', function (Blueprint $table) {
                $table->timestamp('trashed_at')->nullable()->index();
            });
        }

        if (! Schema::hasTable('chatbox_settings')) {
            Schema::create('chatbox_settings', function (Blueprint $table) {
                $table->id();
                $table->string('key')->unique();
                $table->longText('value')->nullable();
                $table->timestamps();
            });
        }

        $defaults = [
            'enabled' => '1',
            'launcher_title' => 'NST Chat',
            'launcher_subtitle' => 'Need help?',
            'header_title' => 'New Singapur Telecom',
            'header_subtitle' => 'Support & Sales • Usually replies fast',
            'welcome_message' => "Assalamu Alaikum 👋\nNew Singapur Telecom support এ আপনাকে স্বাগতম। কীভাবে সাহায্য করতে পারি?",
            'start_button_text' => 'Start Conversation',
            'default_reply_after_submit' => 'ধন্যবাদ। আপনার message POS Customer Inbox-এ পৌঁছে গেছে। আমাদের team দ্রুত reply করবে।',
            'attachment_help_text' => 'Maximum 2 images, total 10 MB.',
            'cloud_link_help_text' => '২টির বেশি ছবি হলে Google Drive / OneDrive / Dropbox link দিন।',
            'transcript_checkbox_text' => 'Send this chat history to my email',
            'consent_checkbox_text' => 'I agree to be contacted by New Singapur Telecom',
            'company_copy_email' => '',
            'poll_seconds' => '6',
        ];

        if (Schema::hasTable('chatbox_settings')) {
            foreach ($defaults as $key => $value) {
                $exists = DB::table('chatbox_settings')->where('key', $key)->exists();
                if (! $exists) {
                    DB::table('chatbox_settings')->insert([
                        'key' => $key,
                        'value' => $value,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        // Data-preserving rollback. Do not drop customer messages or chatbox settings.
    }

    private function addColumnIfMissing(string $tableName, string $columnName, callable $definition): void
    {
        if (! Schema::hasColumn($tableName, $columnName)) {
            Schema::table($tableName, function (Blueprint $table) use ($definition) {
                $definition($table);
            });
        }
    }
};
