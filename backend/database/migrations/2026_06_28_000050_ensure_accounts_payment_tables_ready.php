<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->ensureCustomerBalanceColumns();
        $this->ensureSupplierBalanceColumns();
        $this->ensureCustomerPaymentsTable();
        $this->ensureSupplierPaymentsTable();
        $this->ensureSalePaymentsTable();
    }

    private function ensureCustomerBalanceColumns(): void
    {
        if (!Schema::hasTable('customers')) {
            return;
        }

        Schema::table('customers', function (Blueprint $table) {
            if (!Schema::hasColumn('customers', 'current_balance')) {
                $table->decimal('current_balance', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('customers', 'total_paid')) {
                $table->decimal('total_paid', 15, 2)->default(0);
            }
        });
    }

    private function ensureSupplierBalanceColumns(): void
    {
        if (!Schema::hasTable('suppliers')) {
            return;
        }

        Schema::table('suppliers', function (Blueprint $table) {
            if (!Schema::hasColumn('suppliers', 'current_balance')) {
                $table->decimal('current_balance', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('suppliers', 'advance_balance')) {
                $table->decimal('advance_balance', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('suppliers', 'total_paid')) {
                $table->decimal('total_paid', 15, 2)->default(0);
            }
        });
    }

    private function ensureCustomerPaymentsTable(): void
    {
        if (!Schema::hasTable('customer_payments')) {
            Schema::create('customer_payments', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('customer_id');
                $table->string('payment_method')->default('cash');
                $table->string('provider_name')->nullable();
                $table->string('transaction_id')->nullable();
                $table->decimal('amount', 15, 2)->default(0);
                $table->decimal('previous_balance', 15, 2)->default(0);
                $table->decimal('new_balance', 15, 2)->default(0);
                $table->decimal('extra_amount', 15, 2)->default(0);
                $table->boolean('is_applied_to_sales')->default(true);
                $table->timestamp('applied_at')->nullable();
                $table->text('note')->nullable();
                $table->unsignedBigInteger('collected_by')->nullable();
                $table->timestamps();

                $table->index('customer_id');
                $table->index('collected_by');
                $table->index('payment_method');
            });

            return;
        }

        Schema::table('customer_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('customer_payments', 'provider_name')) {
                $table->string('provider_name')->nullable();
            }

            if (!Schema::hasColumn('customer_payments', 'transaction_id')) {
                $table->string('transaction_id')->nullable();
            }

            if (!Schema::hasColumn('customer_payments', 'previous_balance')) {
                $table->decimal('previous_balance', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('customer_payments', 'new_balance')) {
                $table->decimal('new_balance', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('customer_payments', 'extra_amount')) {
                $table->decimal('extra_amount', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('customer_payments', 'is_applied_to_sales')) {
                $table->boolean('is_applied_to_sales')->default(true);
            }

            if (!Schema::hasColumn('customer_payments', 'applied_at')) {
                $table->timestamp('applied_at')->nullable();
            }

            if (!Schema::hasColumn('customer_payments', 'note')) {
                $table->text('note')->nullable();
            }

            if (!Schema::hasColumn('customer_payments', 'collected_by')) {
                $table->unsignedBigInteger('collected_by')->nullable();
            }
        });
    }

    private function ensureSupplierPaymentsTable(): void
    {
        if (!Schema::hasTable('supplier_payments')) {
            Schema::create('supplier_payments', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('supplier_id');
                $table->string('payment_method')->default('cash');
                $table->string('provider_name')->nullable();
                $table->string('transaction_id')->nullable();
                $table->string('payment_slip_path')->nullable();
                $table->decimal('amount', 15, 2)->default(0);
                $table->decimal('previous_balance', 15, 2)->default(0);
                $table->decimal('new_balance', 15, 2)->default(0);
                $table->decimal('extra_amount', 15, 2)->default(0);
                $table->boolean('is_applied_to_purchases')->default(true);
                $table->timestamp('applied_at')->nullable();
                $table->text('note')->nullable();
                $table->unsignedBigInteger('paid_by')->nullable();
                $table->timestamps();

                $table->index('supplier_id');
                $table->index('paid_by');
                $table->index('payment_method');
            });

            return;
        }

        Schema::table('supplier_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('supplier_payments', 'provider_name')) {
                $table->string('provider_name')->nullable();
            }

            if (!Schema::hasColumn('supplier_payments', 'transaction_id')) {
                $table->string('transaction_id')->nullable();
            }

            if (!Schema::hasColumn('supplier_payments', 'payment_slip_path')) {
                $table->string('payment_slip_path')->nullable();
            }

            if (!Schema::hasColumn('supplier_payments', 'previous_balance')) {
                $table->decimal('previous_balance', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('supplier_payments', 'new_balance')) {
                $table->decimal('new_balance', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('supplier_payments', 'extra_amount')) {
                $table->decimal('extra_amount', 15, 2)->default(0);
            }

            if (!Schema::hasColumn('supplier_payments', 'is_applied_to_purchases')) {
                $table->boolean('is_applied_to_purchases')->default(true);
            }

            if (!Schema::hasColumn('supplier_payments', 'applied_at')) {
                $table->timestamp('applied_at')->nullable();
            }

            if (!Schema::hasColumn('supplier_payments', 'note')) {
                $table->text('note')->nullable();
            }

            if (!Schema::hasColumn('supplier_payments', 'paid_by')) {
                $table->unsignedBigInteger('paid_by')->nullable();
            }
        });
    }

    private function ensureSalePaymentsTable(): void
    {
        if (!Schema::hasTable('sale_payments')) {
            Schema::create('sale_payments', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('sale_id');
                $table->string('payment_method')->default('cash');
                $table->string('provider_name')->nullable();
                $table->string('transaction_id')->nullable();
                $table->decimal('amount', 15, 2)->default(0);
                $table->unsignedBigInteger('received_by')->nullable();
                $table->text('note')->nullable();
                $table->timestamps();

                $table->index('sale_id');
                $table->index('received_by');
                $table->index('payment_method');
            });

            return;
        }

        Schema::table('sale_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('sale_payments', 'provider_name')) {
                $table->string('provider_name')->nullable();
            }

            if (!Schema::hasColumn('sale_payments', 'transaction_id')) {
                $table->string('transaction_id')->nullable();
            }

            if (!Schema::hasColumn('sale_payments', 'received_by')) {
                $table->unsignedBigInteger('received_by')->nullable();
            }

            if (!Schema::hasColumn('sale_payments', 'note')) {
                $table->text('note')->nullable();
            }
        });
    }

    public function down(): void
    {
        // Safe migration: intentionally no destructive rollback.
    }
};
