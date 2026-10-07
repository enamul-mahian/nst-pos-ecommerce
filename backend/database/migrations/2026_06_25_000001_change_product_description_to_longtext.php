<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return; // MySQL-only DDL; SQLite/PostgreSQL store TEXT/UTF-8 natively.
        }

        DB::statement('ALTER TABLE products MODIFY description LONGTEXT NULL');
        DB::statement('ALTER TABLE products MODIFY short_description LONGTEXT NULL');
    }

    public function down(): void
    {
        if (! in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            return; // MySQL-only DDL; SQLite/PostgreSQL store TEXT/UTF-8 natively.
        }

        DB::statement('ALTER TABLE products MODIFY description TEXT NULL');
        DB::statement('ALTER TABLE products MODIFY short_description TEXT NULL');
    }
};
