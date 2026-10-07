<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('customers')) {
            Schema::create('customers', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('phone')->nullable();
                $table->string('email')->nullable();
                $table->string('nid_number')->nullable();
                $table->text('address')->nullable();
                $table->string('city')->nullable();
                $table->string('country')->default('Bangladesh');
                $table->decimal('opening_balance', 12, 2)->default(0);
                $table->decimal('current_balance', 12, 2)->default(0);
                $table->string('status')->default('active');
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->softDeletes();
            });

            return;
        }

        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'name')) {
                $table->string('name')->after('id');
            }

            if (!Schema::hasColumn('customers', 'phone')) {
                $table->string('phone')->nullable()->after('name');
            }

            if (!Schema::hasColumn('customers', 'email')) {
                $table->string('email')->nullable()->after('phone');
            }

            if (!Schema::hasColumn('customers', 'nid_number')) {
                $table->string('nid_number')->nullable()->after('email');
            }

            if (!Schema::hasColumn('customers', 'address')) {
                $table->text('address')->nullable()->after('nid_number');
            }

            if (!Schema::hasColumn('customers', 'city')) {
                $table->string('city')->nullable()->after('address');
            }

            if (!Schema::hasColumn('customers', 'country')) {
                $table->string('country')->default('Bangladesh')->after('city');
            }

            if (!Schema::hasColumn('customers', 'opening_balance')) {
                $table->decimal('opening_balance', 12, 2)->default(0)->after('country');
            }

            if (!Schema::hasColumn('customers', 'current_balance')) {
                $table->decimal('current_balance', 12, 2)->default(0)->after('opening_balance');
            }

            if (!Schema::hasColumn('customers', 'status')) {
                $table->string('status')->default('active')->after('current_balance');
            }

            if (!Schema::hasColumn('customers', 'created_by')) {
                $table->foreignId('created_by')->nullable()->after('status')->constrained('users')->nullOnDelete();
            }

            if (!Schema::hasColumn('customers', 'updated_by')) {
                $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            }

            if (!Schema::hasColumn('customers', 'deleted_at')) {
                $table->softDeletes();
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};
