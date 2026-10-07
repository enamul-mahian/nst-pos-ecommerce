<?php

use Illuminate\Database\Migrations\Migration;

/*
 | Compatibility migration marker for a legacy placeholder filename.
 | The executable, dependency-safe migration is stored under a valid
 | timestamped filename. This no-op marker prevents older databases and
 | fresh installs from executing the same schema change twice.
 */
return new class extends Migration
{
    public function up(): void {}
    public function down(): void {}
};
