<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private function addColumnIfMissing(string $table, string $column, callable $callback): void
    {
        if (!Schema::hasColumn($table, $column)) {
            Schema::table($table, function (Blueprint $tableBlueprint) use ($callback) {
                $callback($tableBlueprint);
            });
        }
    }

    public function up(): void
    {
        if (Schema::hasTable('customers')) {
            $this->addColumnIfMissing('customers', 'user_id', fn (Blueprint $table) => $table->foreignId('user_id')->nullable()->after('id')->constrained('users')->nullOnDelete());
        }

        if (Schema::hasTable('suppliers')) {
            $this->addColumnIfMissing('suppliers', 'user_id', fn (Blueprint $table) => $table->foreignId('user_id')->nullable()->after('id')->constrained('users')->nullOnDelete());
        }

        if (Schema::hasTable('sales')) {
            $this->addColumnIfMissing('sales', 'invoice_discount_percent', fn (Blueprint $table) => $table->decimal('invoice_discount_percent', 8, 2)->default(0)->after('discount'));
            $this->addColumnIfMissing('sales', 'invoice_discount_amount', fn (Blueprint $table) => $table->decimal('invoice_discount_amount', 12, 2)->default(0)->after('invoice_discount_percent'));
            $this->addColumnIfMissing('sales', 'previous_due', fn (Blueprint $table) => $table->decimal('previous_due', 12, 2)->default(0)->after('total'));
            $this->addColumnIfMissing('sales', 'delivery_charge', fn (Blueprint $table) => $table->decimal('delivery_charge', 12, 2)->default(0)->after('previous_due'));
            $this->addColumnIfMissing('sales', 'final_amount', fn (Blueprint $table) => $table->decimal('final_amount', 12, 2)->default(0)->after('delivery_charge'));
            $this->addColumnIfMissing('sales', 'cash_back_amount', fn (Blueprint $table) => $table->decimal('cash_back_amount', 12, 2)->default(0)->after('due_amount'));
            $this->addColumnIfMissing('sales', 'payment_status', fn (Blueprint $table) => $table->string('payment_status')->default('paid')->after('payment_method'));
            $this->addColumnIfMissing('sales', 'payment_received_by', fn (Blueprint $table) => $table->foreignId('payment_received_by')->nullable()->after('sold_by')->constrained('users')->nullOnDelete());
            $this->addColumnIfMissing('sales', 'home_delivery', fn (Blueprint $table) => $table->boolean('home_delivery')->default(false)->after('payment_received_by'));
            $this->addColumnIfMissing('sales', 'send_sms', fn (Blueprint $table) => $table->boolean('send_sms')->default(false)->after('home_delivery'));
        }

        if (Schema::hasTable('sale_items')) {
            $this->addColumnIfMissing('sale_items', 'branch_stock_id', fn (Blueprint $table) => $table->foreignId('branch_stock_id')->nullable()->after('product_id')->constrained('branch_stocks')->nullOnDelete());
            $this->addColumnIfMissing('sale_items', 'sku', fn (Blueprint $table) => $table->string('sku')->nullable()->after('product_name'));
            $this->addColumnIfMissing('sale_items', 'rate', fn (Blueprint $table) => $table->decimal('rate', 12, 2)->default(0)->after('quantity'));
            $this->addColumnIfMissing('sale_items', 'discount_percent', fn (Blueprint $table) => $table->decimal('discount_percent', 8, 2)->default(0)->after('rate'));
            $this->addColumnIfMissing('sale_items', 'discount_amount', fn (Blueprint $table) => $table->decimal('discount_amount', 12, 2)->default(0)->after('discount_percent'));
        }

        if (!Schema::hasTable('sale_payments')) {
            Schema::create('sale_payments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
                $table->string('payment_method');
                $table->string('provider_name')->nullable();
                $table->string('transaction_id')->nullable();
                $table->decimal('amount', 12, 2)->default(0);
                $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('note')->nullable();
                $table->timestamps();

                $table->index(['sale_id', 'payment_method']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_payments');
    }
};
