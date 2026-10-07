<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('product_variants')) {
            Schema::table('product_variants', function (Blueprint $table) {
                if (! Schema::hasColumn('product_variants', 'model_number')) {
                    $table->string('model_number')->nullable()->after('variant_name');
                }
            });
        }

        if (Schema::hasTable('device_units')) {
            Schema::table('device_units', function (Blueprint $table) {
                if (! Schema::hasColumn('device_units', 'model_number')) {
                    $table->string('model_number')->nullable()->after('product_name');
                }
            });
        }

        if (Schema::hasTable('purchases')) {
            Schema::table('purchases', function (Blueprint $table) {
                if (! Schema::hasColumn('purchases', 'supplier_invoice_number')) {
                    $table->string('supplier_invoice_number')->nullable()->after('purchase_no');
                }
                if (! Schema::hasColumn('purchases', 'supplier_invoice_date')) {
                    $table->date('supplier_invoice_date')->nullable()->after('purchase_date');
                }
                if (! Schema::hasColumn('purchases', 'supplier_invoice_file')) {
                    $table->string('supplier_invoice_file')->nullable()->after('supplier_invoice_date');
                }
            });
        }

        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                if (! Schema::hasColumn('users', 'address')) {
                    $table->text('address')->nullable()->after('phone');
                }
                if (! Schema::hasColumn('users', 'profile_photo')) {
                    $table->string('profile_photo')->nullable()->after('address');
                }
            });
        }

        if (! Schema::hasTable('google_posts')) {
            Schema::create('google_posts', function (Blueprint $table) {
                $table->id();
                $table->string('title');
                $table->longText('description')->nullable();
                $table->string('feature_image')->nullable();
                $table->string('status')->default('draft'); // draft/scheduled/published/failed
                $table->timestamp('scheduled_at')->nullable();
                $table->timestamp('published_at')->nullable();
                $table->string('external_post_id')->nullable();
                $table->string('external_reference_url')->nullable();
                $table->string('cta_url')->nullable();
                $table->string('sync_status')->default('pending'); // pending/synced/failed/skipped
                $table->text('sync_error')->nullable();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->unsignedBigInteger('created_by')->nullable()->index();
                $table->unsignedBigInteger('updated_by')->nullable()->index();
                $table->timestamps();
                $table->index(['status', 'sync_status']);
            });
        }

        if (! Schema::hasTable('user_access_controls')) {
            Schema::create('user_access_controls', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->unique();
                $table->json('dashboard_permissions')->nullable();
                $table->json('sidebar_permissions')->nullable();
                $table->json('column_permissions')->nullable();
                $table->json('branch_ids')->nullable();
                $table->json('financial_permissions')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('danger_zone_logs')) {
            Schema::create('danger_zone_logs', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->string('action')->index();
                $table->json('selected_options')->nullable();
                $table->json('deleted_counts')->nullable();
                $table->unsignedInteger('deleted_files_count')->default(0);
                $table->string('ip_address')->nullable();
                $table->text('user_agent')->nullable();
                $table->timestamps();
            });
        }

        $this->normalizeAccountsRoleToAccountant();
    }

    public function down(): void
    {
        // Safe migration: no destructive rollback to protect live business data.
    }

    private function normalizeAccountsRoleToAccountant(): void
    {
        if (! Schema::hasTable('roles')) {
            return;
        }

        $accounts = DB::table('roles')->where('name', 'accounts')->first();
        $accountant = DB::table('roles')->where('name', 'accountant')->first();

        if ($accounts && ! $accountant) {
            DB::table('roles')->where('id', $accounts->id)->update(['name' => 'accountant']);
            $accountant = DB::table('roles')->where('id', $accounts->id)->first();
        }

        if ($accounts && $accountant && (int) $accounts->id !== (int) $accountant->id && Schema::hasTable('model_has_roles')) {
            DB::table('model_has_roles')
                ->where('role_id', $accounts->id)
                ->update(['role_id' => $accountant->id]);
            DB::table('roles')->where('id', $accounts->id)->delete();
        }

        if (Schema::hasTable('users') && Schema::hasColumn('users', 'profile_type')) {
            DB::table('users')->where('profile_type', 'accounts')->update(['profile_type' => 'accountant']);
        }
    }
};
