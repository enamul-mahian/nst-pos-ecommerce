<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

/**
 * Supplier payment slips and supplier invoice files were saved on the public disk, readable by anyone with the
 * link (and through the public media route). Move them to the private local disk; they are now served through
 * authenticated routes.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->moveColumn('supplier_payments', 'payment_slip_path', 'private/supplier-payment-slips/');
        $this->moveColumn('purchases', 'supplier_invoice_file', 'private/purchase-invoices/');
    }

    public function down(): void
    {
        // Files stay private; the download routes read both disks.
    }

    private function moveColumn(string $table, string $column, string $prefix): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasColumn($table, $column)) {
            return;
        }

        DB::table($table)->whereNotNull($column)->where($column, 'not like', 'private/%')->orderBy('id')
            ->chunkById(100, function ($rows) use ($table, $column, $prefix) {
                foreach ($rows as $row) {
                    $old = (string) $row->{$column};
                    if ($old === '' || ! Storage::disk('public')->exists($old)) {
                        continue;
                    }

                    $new = $prefix . basename($old);
                    Storage::disk('local')->put($new, Storage::disk('public')->get($old));
                    DB::table($table)->where('id', $row->id)->update([$column => $new]);
                    Storage::disk('public')->delete($old);
                }
            });
    }
};
