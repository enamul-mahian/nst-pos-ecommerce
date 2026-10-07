<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('branches')) {
            Schema::create('branches', function (Blueprint $table) {
                $table->id();

                $table->string('name');
                $table->string('code')->nullable()->unique();

                $table->string('phone')->nullable();
                $table->string('email')->nullable();

                $table->text('address')->nullable();

                $table->foreignId('manager_id')
                    ->nullable()
                    ->constrained('users')
                    ->nullOnDelete();

                $table->enum('status', ['active', 'inactive'])->default('active');

                $table->timestamps();
                $table->softDeletes();
            });
        } else {
            Schema::table('branches', function (Blueprint $table) {
                if (!Schema::hasColumn('branches', 'code')) {
                    $table->string('code')->nullable()->unique()->after('name');
                }

                if (!Schema::hasColumn('branches', 'phone')) {
                    $table->string('phone')->nullable()->after('code');
                }

                if (!Schema::hasColumn('branches', 'email')) {
                    $table->string('email')->nullable()->after('phone');
                }

                if (!Schema::hasColumn('branches', 'address')) {
                    $table->text('address')->nullable()->after('email');
                }

                if (!Schema::hasColumn('branches', 'manager_id')) {
                    $table->foreignId('manager_id')
                        ->nullable()
                        ->after('address')
                        ->constrained('users')
                        ->nullOnDelete();
                }

                if (!Schema::hasColumn('branches', 'status')) {
                    $table->enum('status', ['active', 'inactive'])
                        ->default('active')
                        ->after('manager_id');
                }

                if (!Schema::hasColumn('branches', 'created_at')) {
                    $table->timestamps();
                }

                if (!Schema::hasColumn('branches', 'deleted_at')) {
                    $table->softDeletes();
                }
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('branches');
    }
};