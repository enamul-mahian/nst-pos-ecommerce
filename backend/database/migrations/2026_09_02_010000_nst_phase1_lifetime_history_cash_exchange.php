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
        $this->upgradeDeviceHistory();
        $this->upgradeSaleExchanges();
        $this->createExchangePayouts();
        $this->seedFinalBarcodeTemplate();
    }

    private function upgradeDeviceHistory(): void
    {
        $this->addIfMissing('device_unit_histories', 'reference_type', fn (Blueprint $t) => $t->string('reference_type', 60)->nullable()->index());
        $this->addIfMissing('device_unit_histories', 'reference_id', fn (Blueprint $t) => $t->unsignedBigInteger('reference_id')->nullable()->index());
        $this->addIfMissing('device_unit_histories', 'reference_no', fn (Blueprint $t) => $t->string('reference_no', 120)->nullable()->index());
        $this->addIfMissing('device_unit_histories', 'customer_id', fn (Blueprint $t) => $t->unsignedBigInteger('customer_id')->nullable()->index());
        $this->addIfMissing('device_unit_histories', 'supplier_id', fn (Blueprint $t) => $t->unsignedBigInteger('supplier_id')->nullable()->index());
        $this->addIfMissing('device_unit_histories', 'amount', fn (Blueprint $t) => $t->decimal('amount', 15, 2)->nullable());
        $this->addIfMissing('device_unit_histories', 'currency', fn (Blueprint $t) => $t->string('currency', 12)->nullable());
        $this->addIfMissing('device_unit_histories', 'payment_direction', fn (Blueprint $t) => $t->string('payment_direction', 20)->nullable()->index());
        $this->addIfMissing('device_unit_histories', 'payment_method', fn (Blueprint $t) => $t->string('payment_method', 60)->nullable());
        $this->addIfMissing('device_unit_histories', 'payment_reference', fn (Blueprint $t) => $t->string('payment_reference', 191)->nullable());
        $this->addIfMissing('device_unit_histories', 'metadata', fn (Blueprint $t) => $t->json('metadata')->nullable());
    }

    private function upgradeSaleExchanges(): void
    {
        $this->addIfMissing('sale_exchanges', 'exchange_mode', fn (Blueprint $t) => $t->string('exchange_mode', 30)->default('replacement')->index());
        $this->addIfMissing('sale_exchanges', 'customer_payout_amount', fn (Blueprint $t) => $t->decimal('customer_payout_amount', 15, 2)->default(0));
        $this->addIfMissing('sale_exchanges', 'payout_adjustment_amount', fn (Blueprint $t) => $t->decimal('payout_adjustment_amount', 15, 2)->default(0));
        $this->addIfMissing('sale_exchanges', 'payout_method', fn (Blueprint $t) => $t->string('payout_method', 60)->nullable());
        $this->addIfMissing('sale_exchanges', 'payout_reference', fn (Blueprint $t) => $t->string('payout_reference', 191)->nullable());
        $this->addIfMissing('sale_exchanges', 'payout_note', fn (Blueprint $t) => $t->text('payout_note')->nullable());
    }

    private function createExchangePayouts(): void
    {
        if (Schema::hasTable('sale_exchange_payouts')) {
            return;
        }

        Schema::create('sale_exchange_payouts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('sale_exchange_id')->index();
            $table->decimal('amount', 15, 2)->default(0);
            $table->string('currency', 12)->default('BDT');
            $table->string('payment_method', 60);
            $table->string('provider_name', 100)->nullable();
            $table->string('transaction_id', 191)->nullable()->index();
            $table->string('reference_no', 191)->nullable()->index();
            $table->unsignedBigInteger('paid_by')->nullable()->index();
            $table->timestamp('paid_at')->nullable()->index();
            $table->text('note')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();
        });
    }

    private function seedFinalBarcodeTemplate(): void
    {
        if (! Schema::hasTable('barcode_label_templates')) {
            return;
        }

        $settings = [
            'encoding' => 'CODE128',
            'encoded_field' => 'barcode',
            'fallback_encoded_field' => 'sku',
            'show_barcode_text' => true,
            'show_sku_text' => false,
            'show_product_name' => true,
            'show_sale_price' => true,
            'show_imei1' => false,
            'show_imei2' => false,
            'show_branch' => false,
            'show_condition' => false,
            'show_warranty' => false,
            'custom_text' => '',
            'label_width_mm' => 40,
            'label_height_mm' => 30,
            'orientation' => 'landscape',
            'font_size' => 8,
            'barcode_height' => 12,
            'barcode_width' => 1,
            'alignment' => 'center',
            'border' => false,
            'copies' => 1,
            'layout_key' => 'NST_FINAL_30x40',
            'hide_iphone_ram' => true,
        ];

        DB::table('barcode_label_templates')->update(['is_default' => false]);

        DB::table('barcode_label_templates')->updateOrInsert(
            ['template_key' => 'nst-final-30x40'],
            [
                'name' => 'NST Final 30x40',
                'is_default' => true,
                'is_active' => true,
                'settings' => json_encode($settings, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_exchange_payouts');

        if (Schema::hasTable('sale_exchanges')) {
            Schema::table('sale_exchanges', function (Blueprint $table) {
                foreach ([
                    'exchange_mode',
                    'customer_payout_amount',
                    'payout_adjustment_amount',
                    'payout_method',
                    'payout_reference',
                    'payout_note',
                ] as $column) {
                    if (Schema::hasColumn('sale_exchanges', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        if (Schema::hasTable('device_unit_histories')) {
            Schema::table('device_unit_histories', function (Blueprint $table) {
                foreach ([
                    'reference_type',
                    'reference_id',
                    'reference_no',
                    'customer_id',
                    'supplier_id',
                    'amount',
                    'currency',
                    'payment_direction',
                    'payment_method',
                    'payment_reference',
                    'metadata',
                ] as $column) {
                    if (Schema::hasColumn('device_unit_histories', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }
};
