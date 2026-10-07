<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('suppliers')) {
            Schema::create('suppliers', function (Blueprint $table) {
                $table->id();
                $table->string('name')->nullable();
                $table->string('slug')->nullable();
                $table->string('company_name')->nullable();
                $table->string('contact_person')->nullable();
                $table->string('phone')->nullable();
                $table->string('email')->nullable();
                $table->text('address')->nullable();
                $table->string('city')->nullable();
                $table->string('country')->default('Bangladesh');
                $table->string('website')->nullable();
                $table->string('trade_license_no')->nullable();
                $table->string('tax_number')->nullable();
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

        Schema::table('suppliers', function (Blueprint $table) {
            if (!Schema::hasColumn('suppliers', 'name')) {
                $table->string('name')->nullable()->after('id');
            }

            if (!Schema::hasColumn('suppliers', 'slug')) {
                $table->string('slug')->nullable()->after('name');
            }

            if (!Schema::hasColumn('suppliers', 'company_name')) {
                $table->string('company_name')->nullable()->after('slug');
            }

            if (!Schema::hasColumn('suppliers', 'contact_person')) {
                $table->string('contact_person')->nullable()->after('company_name');
            }

            if (!Schema::hasColumn('suppliers', 'phone')) {
                $table->string('phone')->nullable()->after('contact_person');
            }

            if (!Schema::hasColumn('suppliers', 'email')) {
                $table->string('email')->nullable()->after('phone');
            }

            if (!Schema::hasColumn('suppliers', 'address')) {
                $table->text('address')->nullable()->after('email');
            }

            if (!Schema::hasColumn('suppliers', 'city')) {
                $table->string('city')->nullable()->after('address');
            }

            if (!Schema::hasColumn('suppliers', 'country')) {
                $table->string('country')->default('Bangladesh')->after('city');
            }

            if (!Schema::hasColumn('suppliers', 'website')) {
                $table->string('website')->nullable()->after('country');
            }

            if (!Schema::hasColumn('suppliers', 'trade_license_no')) {
                $table->string('trade_license_no')->nullable()->after('website');
            }

            if (!Schema::hasColumn('suppliers', 'tax_number')) {
                $table->string('tax_number')->nullable()->after('trade_license_no');
            }

            if (!Schema::hasColumn('suppliers', 'opening_balance')) {
                $table->decimal('opening_balance', 12, 2)->default(0)->after('tax_number');
            }

            if (!Schema::hasColumn('suppliers', 'current_balance')) {
                $table->decimal('current_balance', 12, 2)->default(0)->after('opening_balance');
            }

            if (!Schema::hasColumn('suppliers', 'status')) {
                $table->string('status')->default('active')->after('current_balance');
            }

            if (!Schema::hasColumn('suppliers', 'created_by')) {
                $table->foreignId('created_by')->nullable()->after('status')->constrained('users')->nullOnDelete();
            }

            if (!Schema::hasColumn('suppliers', 'updated_by')) {
                $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
            }

            if (!Schema::hasColumn('suppliers', 'deleted_at')) {
                $table->softDeletes();
            }
        });
    }

    public function down(): void
    {
        Schema::table('suppliers', function (Blueprint $table) {
            if (Schema::hasColumn('suppliers', 'deleted_at')) {
                $table->dropSoftDeletes();
            }
        });
    }
};
