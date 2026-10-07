<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the WhatsApp Business keys (off by default) and moves the untouched launcher / header
 * labels to the new names. Values an admin already changed are left as they are.
 */
return new class extends Migration
{
    private array $renamed = [
        'launcher_title' => ['NST Chat', 'NST Live Support'],
        'header_title' => ['New Singapur Telecom', 'New Singapur Telecom Support'],
        'launcher_subtitle' => ['Need help?', 'Chat with our team'],
    ];

    private array $added = [
        'whatsapp_business_enabled' => '0',
        'whatsapp_business_number' => '',
        'whatsapp_business_message' => 'Hello New Singapur Telecom, I need assistance.',
        'whatsapp_button_label' => 'WhatsApp Us',
        'logo_url' => '',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('chatbox_settings')) {
            return;
        }

        foreach ($this->added as $key => $value) {
            if (! DB::table('chatbox_settings')->where('key', $key)->exists()) {
                DB::table('chatbox_settings')->insert(['key' => $key, 'value' => $value, 'created_at' => now(), 'updated_at' => now()]);
            }
        }

        foreach ($this->renamed as $key => [$old, $new]) {
            DB::table('chatbox_settings')->where('key', $key)->where('value', $old)->update(['value' => $new, 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('chatbox_settings')) {
            return;
        }

        foreach ($this->renamed as $key => [$old, $new]) {
            DB::table('chatbox_settings')->where('key', $key)->where('value', $new)->update(['value' => $old, 'updated_at' => now()]);
        }
    }
};
