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
        if (!Schema::hasTable('sales')) {
            Schema::create('sales', function (Blueprint $table) {
                $table->id();
                $table->string('invoice_no')->unique();

                $table->foreignId('branch_id')->nullable()->constrained('branches')->nullOnDelete();
                $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
                $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
                $table->foreignId('used_purchase_id')->nullable()->constrained('used_purchases')->nullOnDelete();

                $table->string('customer_name')->nullable();
                $table->string('customer_phone')->nullable();

                $table->decimal('subtotal', 12, 2)->default(0);
                $table->decimal('discount', 12, 2)->default(0);
                $table->decimal('total', 12, 2)->default(0);
                $table->decimal('paid_amount', 12, 2)->default(0);
                $table->decimal('due_amount', 12, 2)->default(0);
                $table->decimal('profit_amount', 12, 2)->default(0);

                $table->string('payment_method')->default('cash');
                $table->string('status')->default('completed');
                $table->foreignId('sold_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('note')->nullable();

                $table->timestamps();
                $table->softDeletes();

                $table->index(['branch_id', 'status']);
                $table->index(['used_purchase_id']);
            });
        } else {
            $this->addColumnIfMissing('sales', 'invoice_no', fn (Blueprint $table) => $table->string('invoice_no')->unique()->after('id'));
            $this->addColumnIfMissing('sales', 'branch_id', fn (Blueprint $table) => $table->foreignId('branch_id')->nullable()->after('invoice_no')->constrained('branches')->nullOnDelete());
            $this->addColumnIfMissing('sales', 'customer_id', fn (Blueprint $table) => $table->foreignId('customer_id')->nullable()->after('branch_id')->constrained('customers')->nullOnDelete());
            $this->addColumnIfMissing('sales', 'supplier_id', fn (Blueprint $table) => $table->foreignId('supplier_id')->nullable()->after('customer_id')->constrained('suppliers')->nullOnDelete());
            $this->addColumnIfMissing('sales', 'used_purchase_id', fn (Blueprint $table) => $table->foreignId('used_purchase_id')->nullable()->after('supplier_id')->constrained('used_purchases')->nullOnDelete());
            $this->addColumnIfMissing('sales', 'customer_name', fn (Blueprint $table) => $table->string('customer_name')->nullable()->after('used_purchase_id'));
            $this->addColumnIfMissing('sales', 'customer_phone', fn (Blueprint $table) => $table->string('customer_phone')->nullable()->after('customer_name'));
            $this->addColumnIfMissing('sales', 'subtotal', fn (Blueprint $table) => $table->decimal('subtotal', 12, 2)->default(0)->after('customer_phone'));
            $this->addColumnIfMissing('sales', 'discount', fn (Blueprint $table) => $table->decimal('discount', 12, 2)->default(0)->after('subtotal'));
            $this->addColumnIfMissing('sales', 'total', fn (Blueprint $table) => $table->decimal('total', 12, 2)->default(0)->after('discount'));
            $this->addColumnIfMissing('sales', 'paid_amount', fn (Blueprint $table) => $table->decimal('paid_amount', 12, 2)->default(0)->after('total'));
            $this->addColumnIfMissing('sales', 'due_amount', fn (Blueprint $table) => $table->decimal('due_amount', 12, 2)->default(0)->after('paid_amount'));
            $this->addColumnIfMissing('sales', 'profit_amount', fn (Blueprint $table) => $table->decimal('profit_amount', 12, 2)->default(0)->after('due_amount'));
            $this->addColumnIfMissing('sales', 'payment_method', fn (Blueprint $table) => $table->string('payment_method')->default('cash')->after('profit_amount'));
            $this->addColumnIfMissing('sales', 'status', fn (Blueprint $table) => $table->string('status')->default('completed')->after('payment_method'));
            $this->addColumnIfMissing('sales', 'sold_by', fn (Blueprint $table) => $table->foreignId('sold_by')->nullable()->after('status')->constrained('users')->nullOnDelete());
            $this->addColumnIfMissing('sales', 'note', fn (Blueprint $table) => $table->text('note')->nullable()->after('sold_by'));
            $this->addColumnIfMissing('sales', 'deleted_at', fn (Blueprint $table) => $table->softDeletes()->after('updated_at'));
        }

        if (!Schema::hasTable('sale_items')) {
            Schema::create('sale_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
                $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
                $table->foreignId('used_purchase_id')->nullable()->constrained('used_purchases')->nullOnDelete();

                $table->string('product_name');
                $table->string('imei_1')->nullable();
                $table->string('imei_2')->nullable();

                $table->integer('quantity')->default(1);
                $table->decimal('purchase_price', 12, 2)->default(0);
                $table->decimal('sale_price', 12, 2)->default(0);
                $table->decimal('total', 12, 2)->default(0);
                $table->decimal('profit_amount', 12, 2)->default(0);

                $table->timestamps();

                $table->index(['sale_id', 'product_id']);
                $table->index(['used_purchase_id']);
            });
        }

        if (Schema::hasTable('used_purchases')) {
            Schema::table('used_purchases', function (Blueprint $table) {
                if (!Schema::hasColumn('used_purchases', 'sold_sale_id')) {
                    $table->foreignId('sold_sale_id')
                        ->nullable()
                        ->after('converted_by')
                        ->constrained('sales')
                        ->nullOnDelete();
                }

                if (!Schema::hasColumn('used_purchases', 'actual_sale_price')) {
                    $table->decimal('actual_sale_price', 12, 2)
                        ->nullable()
                        ->after('sold_sale_id');
                }

                if (!Schema::hasColumn('used_purchases', 'profit_amount')) {
                    $table->decimal('profit_amount', 12, 2)
                        ->nullable()
                        ->after('actual_sale_price');
                }

                if (!Schema::hasColumn('used_purchases', 'sold_at')) {
                    $table->timestamp('sold_at')
                        ->nullable()
                        ->after('profit_amount');
                }

                if (!Schema::hasColumn('used_purchases', 'sold_by')) {
                    $table->foreignId('sold_by')
                        ->nullable()
                        ->after('sold_at')
                        ->constrained('users')
                        ->nullOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('used_purchases')) {
            Schema::table('used_purchases', function (Blueprint $table) {
                if (Schema::hasColumn('used_purchases', 'sold_by')) {
                    $table->dropConstrainedForeignId('sold_by');
                }

                if (Schema::hasColumn('used_purchases', 'sold_at')) {
                    $table->dropColumn('sold_at');
                }

                if (Schema::hasColumn('used_purchases', 'profit_amount')) {
                    $table->dropColumn('profit_amount');
                }

                if (Schema::hasColumn('used_purchases', 'actual_sale_price')) {
                    $table->dropColumn('actual_sale_price');
                }

                if (Schema::hasColumn('used_purchases', 'sold_sale_id')) {
                    $table->dropConstrainedForeignId('sold_sale_id');
                }
            });
        }

        Schema::dropIfExists('sale_items');
        Schema::dropIfExists('sales');
    }
};
