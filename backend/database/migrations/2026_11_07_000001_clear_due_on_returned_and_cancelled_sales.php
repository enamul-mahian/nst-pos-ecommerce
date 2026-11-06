<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Returned and cancelled invoices kept their old due_amount, so the sales list showed them as "Due",
 * customer ledgers counted that money as owed and due collection could apply payments to them.
 * Customer balances were already reset when the sale was returned, so only the invoice rows are fixed here.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('sales') || ! Schema::hasColumn('sales', 'status') || ! Schema::hasColumn('sales', 'due_amount')) {
            return;
        }

        DB::table('sales')
            ->whereIn('status', ['returned', 'cancelled', 'canceled'])
            ->where('due_amount', '>', 0)
            ->orderBy('id')
            ->chunkById(200, function ($sales) {
                foreach ($sales as $sale) {
                    $update = ['due_amount' => 0];
                    if (Schema::hasColumn('sales', 'payment_status')) {
                        $update['payment_status'] = $sale->status === 'canceled' ? 'cancelled' : $sale->status;
                    }
                    DB::table('sales')->where('id', $sale->id)->update($update);
                }
            });
    }

    public function down(): void
    {
        // Old due values on returned invoices were wrong; nothing to restore.
    }
};
