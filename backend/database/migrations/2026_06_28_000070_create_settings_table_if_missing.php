<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('settings')) {
            Schema::create('settings', function (Blueprint $table) {
                $table->id();
                $table->string('group')->default('general')->index();
                $table->string('key')->unique();
                $table->longText('value')->nullable();
                $table->string('type')->default('string');
                $table->timestamps();
            });

            return;
        }

        Schema::table('settings', function (Blueprint $table) {
            if (! Schema::hasColumn('settings', 'group')) {
                $table->string('group')->default('general')->index()->after('id');
            }

            if (! Schema::hasColumn('settings', 'key')) {
                $table->string('key')->unique()->after('group');
            }

            if (! Schema::hasColumn('settings', 'value')) {
                $table->longText('value')->nullable()->after('key');
            }

            if (! Schema::hasColumn('settings', 'type')) {
                $table->string('type')->default('string')->after('value');
            }
        });
    }

    public function down(): void
    {
        // Safe migration: do not drop existing settings/data automatically.
    }
};
