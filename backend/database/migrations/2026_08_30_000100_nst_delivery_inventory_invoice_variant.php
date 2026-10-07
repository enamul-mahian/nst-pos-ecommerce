<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function addIfMissing(string $table, string $column, callable $definition): void
    {
        if (Schema::hasTable($table) && ! Schema::hasColumn($table, $column)) {
            Schema::table($table, function (Blueprint $blueprint) use ($definition) {
                $definition($blueprint);
            });
        }
    }

    public function up(): void
    {
        $this->addIfMissing('device_units', 'condition', fn (Blueprint $t) => $t->string('condition', 40)->nullable()->index());
        $this->addIfMissing('device_units', 'country_region', fn (Blueprint $t) => $t->string('country_region', 120)->nullable());
        $this->addIfMissing('device_units', 'sim_type', fn (Blueprint $t) => $t->string('sim_type', 120)->nullable());
        $this->addIfMissing('device_units', 'network_carrier', fn (Blueprint $t) => $t->string('network_carrier', 160)->nullable());
        $this->addIfMissing('device_units', 'saleable', fn (Blueprint $t) => $t->boolean('saleable')->default(true)->index());
        $this->addIfMissing('device_units', 'website_published', fn (Blueprint $t) => $t->boolean('website_published')->default(false)->index());

        $this->addIfMissing('product_variants', 'country_region', fn (Blueprint $t) => $t->string('country_region', 120)->nullable());
        $this->addIfMissing('product_variants', 'sim_type', fn (Blueprint $t) => $t->string('sim_type', 120)->nullable());
        $this->addIfMissing('product_variants', 'network_carrier', fn (Blueprint $t) => $t->string('network_carrier', 160)->nullable());

        if (! Schema::hasTable('device_unit_histories')) {
            Schema::create('device_unit_histories', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('device_unit_id')->nullable()->index();
                $table->string('event_type', 80)->default('updated')->index();
                $table->string('from_status', 100)->nullable()->index();
                $table->string('to_status', 100)->nullable()->index();
                $table->unsignedBigInteger('from_branch_id')->nullable()->index();
                $table->unsignedBigInteger('to_branch_id')->nullable()->index();
                $table->boolean('from_saleable')->nullable();
                $table->boolean('to_saleable')->nullable();
                $table->boolean('from_website_published')->nullable();
                $table->boolean('to_website_published')->nullable();
                $table->json('before_data')->nullable();
                $table->json('after_data')->nullable();
                $table->text('note')->nullable();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->timestamp('event_at')->useCurrent()->index();
                $table->timestamps();
            });
        }

        foreach ([
            'ram' => fn (Blueprint $t) => $t->string('ram', 120)->nullable(),
            'country_region' => fn (Blueprint $t) => $t->string('country_region', 120)->nullable(),
            'sim_type' => fn (Blueprint $t) => $t->string('sim_type', 120)->nullable(),
            'network_carrier' => fn (Blueprint $t) => $t->string('network_carrier', 160)->nullable(),
            'condition' => fn (Blueprint $t) => $t->string('condition', 60)->nullable(),
            'branch_id' => fn (Blueprint $t) => $t->unsignedBigInteger('branch_id')->nullable()->index(),
        ] as $column => $definition) {
            $this->addIfMissing('customer_order_items', $column, $definition);
        }

        foreach ([
            'product_variant_id' => fn (Blueprint $t) => $t->unsignedBigInteger('product_variant_id')->nullable()->index(),
            'sku' => fn (Blueprint $t) => $t->string('sku', 190)->nullable()->index(),
            'color' => fn (Blueprint $t) => $t->string('color', 120)->nullable(),
            'storage' => fn (Blueprint $t) => $t->string('storage', 120)->nullable(),
            'ram' => fn (Blueprint $t) => $t->string('ram', 120)->nullable(),
            'country_region' => fn (Blueprint $t) => $t->string('country_region', 120)->nullable(),
            'sim_type' => fn (Blueprint $t) => $t->string('sim_type', 120)->nullable(),
            'network_carrier' => fn (Blueprint $t) => $t->string('network_carrier', 160)->nullable(),
            'condition' => fn (Blueprint $t) => $t->string('condition', 60)->nullable(),
            'variant_snapshot' => fn (Blueprint $t) => $t->json('variant_snapshot')->nullable(),
        ] as $column => $definition) {
            $this->addIfMissing('booking_preorders', $column, $definition);
        }

        foreach ([
            'ram' => fn (Blueprint $t) => $t->string('ram', 120)->nullable(),
            'storage' => fn (Blueprint $t) => $t->string('storage', 120)->nullable(),
            'color' => fn (Blueprint $t) => $t->string('color', 120)->nullable(),
            'country_region' => fn (Blueprint $t) => $t->string('country_region', 120)->nullable(),
            'sim_type' => fn (Blueprint $t) => $t->string('sim_type', 120)->nullable(),
            'network_carrier' => fn (Blueprint $t) => $t->string('network_carrier', 160)->nullable(),
            'condition' => fn (Blueprint $t) => $t->string('condition', 60)->nullable(),
            'branch_id' => fn (Blueprint $t) => $t->unsignedBigInteger('branch_id')->nullable()->index(),
        ] as $column => $definition) {
            $this->addIfMissing('sale_items', $column, $definition);
        }

        if (! Schema::hasTable('branch_invoice_profiles')) {
            Schema::create('branch_invoice_profiles', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('branch_id')->unique();
                $table->boolean('use_custom_profile')->default(false);
                $table->string('invoice_prefix', 32)->nullable();
                $table->string('business_name')->nullable();
                $table->string('short_name', 120)->nullable();
                $table->text('logo_url')->nullable();
                $table->text('address')->nullable();
                $table->string('phone', 80)->nullable();
                $table->string('email')->nullable();
                $table->string('website')->nullable();
                $table->string('bin_vat', 120)->nullable();
                $table->string('layout', 20)->default('a4');
                $table->text('payment_details')->nullable();
                $table->text('terms')->nullable();
                $table->text('warranty_terms')->nullable();
                $table->text('return_policy')->nullable();
                $table->text('footer_text')->nullable();
                $table->text('signature_text')->nullable();
                $table->boolean('show_qr')->default(true);
                $table->boolean('show_barcode')->default(true);
                $table->boolean('auto_print')->default(false);
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('branch_invoice_sequences')) {
            Schema::create('branch_invoice_sequences', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('branch_id')->index();
                $table->string('prefix', 32);
                $table->date('sequence_date')->index();
                $table->unsignedInteger('last_number')->default(0);
                $table->timestamps();
                $table->unique(['branch_id', 'prefix', 'sequence_date'], 'branch_invoice_sequence_unique');
            });
        }

        $this->addIfMissing('sales', 'branch_invoice_profile_id', fn (Blueprint $t) => $t->unsignedBigInteger('branch_invoice_profile_id')->nullable()->index());
        $this->addIfMissing('sales', 'invoice_profile_snapshot', fn (Blueprint $t) => $t->json('invoice_profile_snapshot')->nullable());

        if (Schema::hasTable('device_units')) {
            $columns = array_flip(Schema::getColumnListing('device_units'));
            $updates = [];
            if (isset($columns['saleable'])) {
                $updates['saleable'] = DB::raw("CASE WHEN LOWER(COALESCE(status,'')) IN ('sold','damaged','supplier_return','lost','missing','inactive','awaiting_inspection','under_inspection','in_service') THEN 0 ELSE 1 END");
            }
            if (isset($columns['website_published'])) {
                $updates['website_published'] = DB::raw("CASE WHEN LOWER(COALESCE(status,'')) IN ('available','ready_for_sale','in_stock','active') THEN 1 ELSE 0 END");
            }
            if ($updates) {
                DB::table('device_units')->update($updates);
            }
        }
    }

    public function down(): void
    {
        // Data-safe rollback: business history/snapshots are intentionally preserved.
    }
};
