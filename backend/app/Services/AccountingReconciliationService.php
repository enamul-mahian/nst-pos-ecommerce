<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AccountingReconciliationService
{
    public function reconcile(Carbon $from, Carbon $to, ?int $branchId = null): array
    {
        $notes = [];
        $operational = $this->operational($from, $to, $branchId, $notes);
        $ledger = $this->ledger($from, $to, $branchId);
        $difference = round($operational['net_cash'] - $ledger['net_cash'], 2);
        return [
            'operational' => $operational,
            'ledger' => $ledger,
            'difference' => $difference,
            'status' => abs($difference) < 0.01 ? 'match' : 'attention',
            'scope_notes' => array_values(array_unique($notes)),
        ];
    }

    private function operational(Carbon $from, Carbon $to, ?int $branchId, array &$notes): array
    {
        $in = 0.0; $out = 0.0;
        $in += $this->sumTable('sale_payments', ['amount','paid_amount','payment_amount'], ['created_at','payment_date','date'], $from, $to, $branchId, 'sales', 'sale_id', $notes);
        $in += $this->sumCustomerResidual($from, $to, $branchId, $notes);
        $in += $this->sumTable('warranty_service_jobs', ['paid_amount'], ['updated_at','delivered_at','received_at','created_at'], $from, $to, $branchId, null, null, $notes, true);
        $out += $this->sumTable('supplier_payments', ['amount'], ['created_at','payment_date','date'], $from, $to, $branchId, null, null, $notes);
        $out += $this->sumTable('expenses', ['amount','total_amount','expense_amount'], ['expense_date','date','created_at'], $from, $to, $branchId, null, null, $notes);
        return ['cash_in'=>round($in,2),'cash_out'=>round($out,2),'net_cash'=>round($in-$out,2)];
    }

    private function ledger(Carbon $from, Carbon $to, ?int $branchId): array
    {
        if (!Schema::hasTable('nst_journal_lines') || !Schema::hasTable('nst_journals') || !Schema::hasTable('nst_accounts')) return ['cash_in'=>0.0,'cash_out'=>0.0,'net_cash'=>0.0];
        $row = DB::table('nst_journal_lines')->join('nst_journals','nst_journals.id','=','nst_journal_lines.journal_id')->join('nst_accounts','nst_accounts.id','=','nst_journal_lines.account_id')
            ->where('nst_journals.status','posted')->where(fn($q)=>$q->where('nst_accounts.is_cash',true)->orWhere('nst_accounts.is_bank',true))
            ->whereBetween('nst_journals.journal_date',[$from->toDateString(),$to->toDateString()])->when($branchId,fn($q)=>$q->where('nst_journals.branch_id',$branchId))
            ->selectRaw('COALESCE(SUM(nst_journal_lines.debit),0) cash_in, COALESCE(SUM(nst_journal_lines.credit),0) cash_out')->first();
        $in=(float)($row->cash_in??0); $out=(float)($row->cash_out??0);
        return ['cash_in'=>round($in,2),'cash_out'=>round($out,2),'net_cash'=>round($in-$out,2)];
    }

    private function sumCustomerResidual(Carbon $from, Carbon $to, ?int $branchId, array &$notes): float
    {
        if (!Schema::hasTable('customer_payments')) return 0.0;
        $date=$this->firstColumn('customer_payments',['created_at','payment_date','date']); if(!$date) return 0.0;
        if ($branchId && !Schema::hasColumn('customer_payments','branch_id')) { $notes[]='customer_payments excluded from branch reconciliation because no branch_id is available.'; return 0.0; }
        $q=DB::table('customer_payments')->whereBetween($date,[$from->copy()->startOfDay(),$to->copy()->endOfDay()]); if($branchId)$q->where('branch_id',$branchId);
        return (float)$q->get()->sum(function($row){ $applied=property_exists($row,'is_applied_to_sales') && (bool)$row->is_applied_to_sales; return $applied && property_exists($row,'extra_amount') ? (float)($row->extra_amount??0) : (float)($row->amount??0); });
    }

    private function sumTable(string $table,array $amountCols,array $dateCols,Carbon $from,Carbon $to,?int $branchId,?string $branchJoin,?string $joinKey,array &$notes,bool $positiveOnly=false): float
    {
        if(!Schema::hasTable($table)) return 0.0; $amount=$this->firstColumn($table,$amountCols); $date=$this->firstColumn($table,$dateCols); if(!$amount||!$date)return 0.0;
        $q=DB::table($table);
        if($branchId){
            if(Schema::hasColumn($table,'branch_id')) $q->where("$table.branch_id",$branchId);
            elseif($branchJoin && Schema::hasTable($branchJoin) && $joinKey && Schema::hasColumn($table,$joinKey) && Schema::hasColumn($branchJoin,'branch_id')) { $q->join($branchJoin,"$branchJoin.id","=","$table.$joinKey")->where("$branchJoin.branch_id",$branchId); }
            else { $notes[]="$table excluded from branch reconciliation because it cannot be assigned safely to a branch."; return 0.0; }
        }
        $q->whereBetween("$table.$date",[$from->copy()->startOfDay(),$to->copy()->endOfDay()]);
        if($positiveOnly)$q->where("$table.$amount",'>',0); if(Schema::hasColumn($table,'deleted_at'))$q->whereNull("$table.deleted_at");
        return (float)$q->sum("$table.$amount");
    }
    private function firstColumn(string $table,array $cols): ?string { foreach($cols as $c) if(Schema::hasColumn($table,$c)) return $c; return null; }
}
