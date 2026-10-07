<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('suppliers')) {
            return;
        }

        $definitions = [
            'name' => fn (Blueprint $table) => $table->string('name')->nullable(),
            'slug' => fn (Blueprint $table) => $table->string('slug')->nullable()->unique(),
            'company_name' => fn (Blueprint $table) => $table->string('company_name')->nullable(),
            'contact_person' => fn (Blueprint $table) => $table->string('contact_person')->nullable(),
            'phone' => fn (Blueprint $table) => $table->string('phone')->nullable()->unique(),
            'email' => fn (Blueprint $table) => $table->string('email')->nullable()->unique(),
            'address' => fn (Blueprint $table) => $table->text('address')->nullable(),
            'city' => fn (Blueprint $table) => $table->string('city')->nullable(),
            'country' => fn (Blueprint $table) => $table->string('country')->nullable()->default('Bangladesh'),
            'website' => fn (Blueprint $table) => $table->string('website')->nullable(),
            'trade_license_no' => fn (Blueprint $table) => $table->string('trade_license_no')->nullable(),
            'tax_number' => fn (Blueprint $table) => $table->string('tax_number')->nullable(),
            'opening_balance' => fn (Blueprint $table) => $table->decimal('opening_balance', 15, 2)->default(0),
            'current_balance' => fn (Blueprint $table) => $table->decimal('current_balance', 15, 2)->default(0),
            'status' => fn (Blueprint $table) => $table->string('status', 30)->default('active'),
            'created_by' => fn (Blueprint $table) => $table->unsignedBigInteger('created_by')->nullable()->index(),
            'updated_by' => fn (Blueprint $table) => $table->unsignedBigInteger('updated_by')->nullable()->index(),
            'deleted_at' => fn (Blueprint $table) => $table->softDeletes(),
        ];

        foreach ($definitions as $column => $definition) {
            if (! Schema::hasColumn('suppliers', $column)) {
                Schema::table('suppliers', $definition);
            }
        }
    }

    public function down(): void
    {
        // Compatibility migration: supplier data and columns are retained on rollback.
    }
};
