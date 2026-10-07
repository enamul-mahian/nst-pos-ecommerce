<?php
namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\CustomerOrder;
use App\Services\AccessControlService;
use App\Services\WebSaleConversionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class NstEnterpriseCommerceController extends Controller
{
    private function customerId(Request $r): int
    {
        $user = $r->user();
        $id = (int) ($user?->customer_id ?: Customer::where('user_id', $user?->id)->value('id'));
        abort_if($id < 1, 403, 'Customer profile is missing.');
        return $id;
    }

    private function staff(Request $r): void
    {
        abort_unless(app(AccessControlService::class)->canAccessPos($r->user()), 403, 'POS staff access is required.');
    }

    public function webSales(Request $r): JsonResponse
    {
        $this->staff($r);
        $query = CustomerOrder::with([
            'items', 'customer:id,name,phone,email', 'branch:id,name,code',
            'delivery:id,customer_order_id,status,courier_name,tracking_number,driver_name,driver_phone,scheduled_at,dispatched_at,delivered_at,received_by,note',
        ])->latest('id');
        $this->applyOrderScope($r, $query);

        foreach (['status', 'payment_status', 'delivery_status', 'branch_id'] as $field) {
            if ($r->filled($field)) {
                $query->where($field, $r->input($field));
            }
        }
        if ($r->filled('search')) {
            $search = trim((string) $r->input('search'));
            $query->where(fn ($q) => $q->where('order_no', 'like', "%{$search}%")
                ->orWhere('customer_name', 'like', "%{$search}%")
                ->orWhere('customer_phone', 'like', "%{$search}%"));
        }

        $page = $query->paginate(min(100, max(10, (int) $r->input('per_page', 30))));
        $page->getCollection()->transform(function (CustomerOrder $order) {
            $order->setAttribute('delivery_status', $order->delivery?->status ?: $order->delivery_status ?: 'pending');
            return $order;
        });

        return response()->json(['status' => true, 'data' => $page]);
    }
    public function authorizeOrder(Request $r, CustomerOrder $order, WebSaleConversionService $converter): JsonResponse
    {
        $this->staff($r);
        $validated = $r->validate([
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
            'assigned_staff_id' => ['nullable', 'integer', 'exists:users,id'],
        ]);

        $this->ensureBranchAllowed($r, (int) $validated['branch_id']);
        $alreadyConverted = (bool) $order->sale_id;
        $sale = $converter->convert(
            $order,
            (int) $validated['branch_id'],
            (int) $r->user()->id,
            isset($validated['assigned_staff_id']) ? (int) $validated['assigned_staff_id'] : null,
        );

        return response()->json([
            'status' => true,
            'message' => $alreadyConverted
                ? 'Order was already converted; the existing invoice was returned.'
                : 'Web order converted to a POS sale with branch stock and IMEI allocation.',
            'data' => [
                'order' => $order->fresh(['items', 'sale.items.deviceUnit', 'sale.payments']),
                'sale' => $sale,
            ],
        ]);
    }

    public function report(Request $r): JsonResponse
    {
        $this->staff($r);
        $query = CustomerOrder::query();
        $this->applyOrderScope($r, $query);
        if ($r->filled('from')) $query->whereDate('created_at', '>=', $r->date('from'));
        if ($r->filled('to')) $query->whereDate('created_at', '<=', $r->date('to'));

        $rows = (clone $query)->selectRaw('payment_method, count(*) orders, sum(total_amount) amount, sum(paid_amount) paid, sum(refund_amount) refunds')
            ->groupBy('payment_method')->get();

        return response()->json(['status' => true, 'data' => [
            'total_web_orders' => (clone $query)->count(),
            'confirmed_web_sales' => (clone $query)->whereNotNull('sale_id')->count(),
            'pending_payments' => (clone $query)->whereIn('payment_status', ['cod_pending', 'pending_verification'])->sum('total_amount'),
            'delivered_revenue' => (clone $query)->whereIn('delivery_status', ['delivered', 'completed'])->sum('total_amount'),
            'cancelled_orders' => (clone $query)->where('status', 'cancelled')->count(),
            'customer_due' => (clone $query)->whereNotNull('sale_id')->sum(DB::raw('GREATEST(total_amount-paid_amount,0)')),
            'refund_amount' => (clone $query)->sum('refund_amount'),
            'payment_methods' => $rows,
        ]]);
    }

    public function portalOrders(Request $r): JsonResponse { $id=$this->customerId($r); return response()->json(['status'=>true,'data'=>CustomerOrder::with(['items'])->where('customer_id',$id)->latest()->get()]); }
    public function createPreorder(Request $r): JsonResponse { $id=$this->customerId($r); $c=Customer::findOrFail($id); $v=$r->validate(['product_name'=>'required|string|max:255','desired_model'=>'nullable|string|max:255','variant_name'=>'nullable|string|max:255','product_link'=>'nullable|string|max:2000','product_image_url'=>'nullable|string|max:2000','delivery_address'=>'nullable|string|max:3000','requested_amount'=>'nullable|numeric|min:0','advance_amount'=>'nullable|numeric|min:0','paid_amount'=>'nullable|numeric|min:0','payment_method'=>['required',Rule::in(['cash_on_delivery','bkash_agent','nagad_agent'])],'transaction_id'=>'nullable|string|max:190','customer_note'=>'nullable|string|max:3000','product_id'=>'nullable|integer','variant_id'=>'nullable|integer']); if(!empty($v['transaction_id'])&&DB::table('customer_preorders')->where('transaction_id',$v['transaction_id'])->exists()) return response()->json(['status'=>false,'message'=>'Duplicate transaction/preorder prevented.'],422); $u=$r->user(); $idp=DB::table('customer_preorders')->insertGetId(array_merge($v,['preorder_no'=>'NST-PRE-'.now()->format('Ymd').'-'.strtoupper(Str::random(6)),'customer_id'=>$id,'user_id'=>$u->id,'customer_name'=>$c->name?:$u->name,'customer_phone'=>$c->phone?:$u->phone,'customer_email'=>$c->email?:$u->email,'delivery_address'=>$v['delivery_address']??$c->address,'status_key'=>'preorder_submitted','paid_amount'=>(float)($v['paid_amount']??0),'due_amount'=>max(0,(float)($v['requested_amount']??0)-(float)($v['paid_amount']??0)),'payment_status'=>!empty($v['transaction_id'])?'pending_verification':'pending','created_at'=>now(),'updated_at'=>now()])); DB::table('preorder_status_history')->insert(['customer_preorder_id'=>$idp,'new_status'=>'preorder_submitted','changed_by'=>$u->id,'role'=>'customer','customer_visible_note'=>'PreOrder submitted successfully.','created_at'=>now(),'updated_at'=>now()]); return response()->json(['status'=>true,'message'=>'Logged-in customer PreOrder created and linked to your account.','data'=>DB::table('customer_preorders')->find($idp)],201); }
    public function submitPreorderPayment(Request $r,int $id): JsonResponse { $cid=$this->customerId($r); $v=$r->validate(['transaction_id'=>'required|string|max:190','paid_amount'=>'required|numeric|min:0.01','payment_method'=>['required',Rule::in(['bkash_agent','nagad_agent'])]]); if(DB::table('customer_preorders')->where('transaction_id',$v['transaction_id'])->where('id','<>',$id)->exists()) return response()->json(['status'=>false,'message'=>'This transaction ID has already been submitted.'],422); $p=DB::table('customer_preorders')->where('id',$id)->where('customer_id',$cid)->first(); abort_if(!$p,404); DB::table('customer_preorders')->where('id',$id)->update(['transaction_id'=>$v['transaction_id'],'paid_amount'=>$v['paid_amount'],'due_amount'=>max(0,(float)$p->requested_amount-(float)$v['paid_amount']),'payment_method'=>$v['payment_method'],'payment_status'=>'pending_verification','status_key'=>'payment_submitted','updated_at'=>now()]); DB::table('preorder_status_history')->insert(['customer_preorder_id'=>$id,'old_status'=>$p->status_key,'new_status'=>'payment_submitted','changed_by'=>$r->user()->id,'role'=>'customer','customer_visible_note'=>'Advance payment submitted for verification.','created_at'=>now(),'updated_at'=>now()]); return response()->json(['status'=>true,'message'=>'Payment submitted for verification.']); }
    public function portalPreorders(Request $r): JsonResponse { $id=$this->customerId($r); $rows=DB::table('customer_preorders')->where('customer_id',$id)->whereNull('deleted_at')->latest()->get()->map(function($x){$x->status_history=DB::table('preorder_status_history')->where('customer_preorder_id',$x->id)->orderBy('id')->get(['old_status','new_status','customer_visible_note','created_at']); unset($x->admin_note); return $x;}); return response()->json(['status'=>true,'data'=>$rows]); }
    public function updatePreorderStatus(Request $r,int $id): JsonResponse { $this->staff($r); $v=$r->validate(['status_key'=>'required|exists:preorder_statuses,key','customer_visible_note'=>'nullable|string|max:3000','internal_note'=>'nullable|string|max:3000']); return DB::transaction(function()use($r,$id,$v){$p=DB::table('customer_preorders')->where('id',$id)->lockForUpdate()->first(); abort_if(!$p,404); DB::table('customer_preorders')->where('id',$id)->update(['status_key'=>$v['status_key'],'customer_visible_note'=>$v['customer_visible_note']??$p->customer_visible_note,'admin_note'=>$v['internal_note']??$p->admin_note,'updated_at'=>now()]); DB::table('preorder_status_history')->insert(['customer_preorder_id'=>$id,'old_status'=>$p->status_key,'new_status'=>$v['status_key'],'changed_by'=>$r->user()->id,'role'=>'staff','customer_visible_note'=>$v['customer_visible_note']??null,'internal_note'=>$v['internal_note']??null,'created_at'=>now(),'updated_at'=>now()]); return response()->json(['status'=>true]);}); }
    public function cancelPreorder(Request $r,int $id): JsonResponse { $cid=$this->customerId($r); $n=DB::table('customer_preorders')->where('id',$id)->where('customer_id',$cid)->whereNull('sale_id')->update(['status_key'=>'cancel_requested','cancel_requested_at'=>now(),'updated_at'=>now()]); abort_if(!$n,422,'Converted preorder cannot be cancelled directly.'); return response()->json(['status'=>true,'message'=>'Cancel request submitted.']); }
    public function barcodeLog(Request $r): JsonResponse { $this->staff($r); $v=$r->validate(['device_unit_ids'=>'required|array|min:1','device_unit_ids.*'=>'integer','action'=>['required',Rule::in(['print','reprint'])],'reason'=>'nullable|string|max:1000','label_size'=>['required',Rule::in(['40x20','50x25','60x30'])],'printer_type'=>['required',Rule::in(['brother','zebra','a4'])],'content_options'=>'nullable|array']); if($v['action']==='reprint'&&blank($v['reason']??null)) return response()->json(['status'=>false,'message'=>'Reprint reason is required.'],422); foreach($v['device_unit_ids'] as $du) DB::table('barcode_print_logs')->insert(['device_unit_id'=>$du,'action'=>$v['action'],'reason'=>$v['reason']??null,'printed_by'=>$r->user()->id,'branch_id'=>$r->user()->branch_id,'label_size'=>$v['label_size'],'printer_type'=>$v['printer_type'],'content_options'=>json_encode($v['content_options']??[]),'created_at'=>now(),'updated_at'=>now()]); return response()->json(['status'=>true,'message'=>'Barcode print history recorded.']); }
    public function barcodeHistory(Request $r): JsonResponse { $this->staff($r); return response()->json(['status'=>true,'data'=>DB::table('barcode_print_logs as l')->leftJoin('device_units as d','d.id','=','l.device_unit_id')->leftJoin('users as u','u.id','=','l.printed_by')->select('l.*','d.sku','d.imei_1','d.imei_2','d.barcode','d.product_name','u.name as printed_by_name')->latest('l.id')->paginate(50)]); }
    public function accessPages(Request $r): JsonResponse
    {
        $this->staff($r);
        return response()->json([
            'status' => true,
            'data' => DB::table('access_pages')->orderBy('module')->orderBy('page_name')->get(),
        ]);
    }

    public function accessOptions(Request $r): JsonResponse
    {
        $this->staff($r);
        $roles = DB::table('roles')->orderBy('name')->get(['id', 'name']);
        $users = DB::table('users')->orderBy('name')->get(['id', 'name', 'email']);
        $branches = DB::table('branches')->orderBy('name')->get(['id', 'name', 'code']);

        return response()->json([
            'status' => true,
            'data' => compact('roles', 'users', 'branches'),
        ]);
    }

    public function accessRules(Request $r): JsonResponse
    {
        $this->staff($r);
        $query = DB::table('access_rules_v12 as ar')
            ->join('access_pages as ap', 'ap.id', '=', 'ar.access_page_id')
            ->leftJoin('roles as ro', function ($join) {
                $join->on('ro.id', '=', 'ar.subject_id')->where('ar.subject_type', '=', 'role');
            })
            ->leftJoin('users as us', function ($join) {
                $join->on('us.id', '=', 'ar.subject_id')->where('ar.subject_type', '=', 'user');
            })
            ->select('ar.*', 'ap.page_key', 'ap.page_name', DB::raw("COALESCE(ro.name, us.name, 'Everyone') as subject_name"))
            ->latest('ar.id');

        if ($r->filled('page_key')) {
            $query->where('ap.page_key', $r->string('page_key'));
        }

        return response()->json(['status' => true, 'data' => $query->paginate(100)]);
    }

    public function accessHistory(Request $r): JsonResponse
    {
        $this->staff($r);
        $query = DB::table('access_rule_history_v12 as h')
            ->join('access_pages as ap', 'ap.id', '=', 'h.access_page_id')
            ->leftJoin('users as changed', 'changed.id', '=', 'h.changed_by')
            ->leftJoin('roles as ro', function ($join) {
                $join->on('ro.id', '=', 'h.subject_id')->where('h.subject_type', '=', 'role');
            })
            ->leftJoin('users as us', function ($join) {
                $join->on('us.id', '=', 'h.subject_id')->where('h.subject_type', '=', 'user');
            })
            ->select('h.*', 'ap.page_key', 'ap.page_name', 'changed.name as changed_by_name', DB::raw("COALESCE(ro.name, us.name, 'Everyone') as subject_name"))
            ->latest('h.id');

        return response()->json(['status' => true, 'data' => $query->paginate(100)]);
    }

    public function saveAccessRule(Request $r): JsonResponse
    {
        $this->staff($r);
        $v = $r->validate([
            'page_key' => 'required|exists:access_pages,page_key',
            'subject_type' => ['required', Rule::in(['everyone', 'role', 'user'])],
            'subject_id' => 'nullable|integer',
            'visibility' => ['required', Rule::in(['allow', 'deny', 'super_admin_only', 'maintenance', 'disabled'])],
            'actions' => 'nullable|array',
            'columns' => 'nullable|array',
            'row_scope' => ['nullable', Rule::in(['own_records', 'own_sales', 'own_customers', 'own_branch', 'selected_branches', 'all_branches', 'all_records'])],
            'selected_branches' => 'nullable|array',
            'expires_at' => 'nullable|date',
        ]);

        if ($v['subject_type'] !== 'everyone' && empty($v['subject_id'])) {
            return response()->json(['status' => false, 'message' => 'A role or user must be selected.'], 422);
        }

        if ($v['subject_type'] === 'everyone') {
            $v['subject_id'] = null;
        }

        $pageId = DB::table('access_pages')->where('page_key', $v['page_key'])->value('id');
        $payload = [
            'visibility' => $v['visibility'],
            'actions' => json_encode(array_values($v['actions'] ?? [])),
            'columns' => json_encode(array_values($v['columns'] ?? [])),
            'row_scope' => $v['row_scope'] ?? 'own_branch',
            'selected_branches' => json_encode(array_values($v['selected_branches'] ?? [])),
            'expires_at' => $v['expires_at'] ?? null,
            'created_by' => $r->user()->id,
            'updated_at' => now(),
            'created_at' => now(),
        ];

        DB::transaction(function () use ($pageId, $v, $payload, $r) {
            DB::table('access_rules_v12')->updateOrInsert([
                'access_page_id' => $pageId,
                'subject_type' => $v['subject_type'],
                'subject_id' => $v['subject_id'] ?? null,
            ], $payload);

            DB::table('access_rule_history_v12')->insert([
                'access_page_id' => $pageId,
                'subject_type' => $v['subject_type'],
                'subject_id' => $v['subject_id'] ?? null,
                'visibility' => $v['visibility'],
                'actions' => $payload['actions'],
                'columns' => $payload['columns'],
                'row_scope' => $payload['row_scope'],
                'selected_branches' => $payload['selected_branches'],
                'expires_at' => $payload['expires_at'],
                'changed_by' => $r->user()->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        });

        return response()->json(['status' => true, 'message' => 'Permission rule saved.']);
    }

    public function dashboardProfileOptions(Request $r): JsonResponse
    {
        $this->staff($r);
        return response()->json(['status' => true, 'data' => [
            'roles' => DB::table('roles')->orderBy('name')->get(['id','name']),
            'users' => DB::table('users')->orderBy('name')->get(['id','name','email']),
            'branches' => DB::table('branches')->orderBy('name')->get(['id','name','code']),
            'widgets' => [
                'today_sales','today_collection','today_due','today_expense','net_profit','website_orders',
                'low_stock','pending_warranty','pending_booking','open_messages','recent_activities','central_search'
            ],
        ]]);
    }

    public function dashboardProfiles(Request $r): JsonResponse
    {
        $this->staff($r);
        $rows = DB::table('dashboard_access_profiles as p')
            ->leftJoin('roles as ro', fn($j) => $j->on('ro.id','=','p.subject_id')->where('p.subject_type','=','role'))
            ->leftJoin('users as us', fn($j) => $j->on('us.id','=','p.subject_id')->where('p.subject_type','=','user'))
            ->select('p.*', DB::raw("COALESCE(ro.name, us.name) as subject_name"))->orderBy('p.subject_type')->orderBy('subject_name')->get();
        foreach ($rows as $row) {
            $row->widgets = json_decode($row->widgets ?: '[]', true);
            $row->widget_order = json_decode($row->widget_order ?: '[]', true);
            $row->selected_branches = json_decode($row->selected_branches ?: '[]', true);
        }
        return response()->json(['status' => true, 'data' => $rows]);
    }

    public function saveDashboardProfile(Request $r): JsonResponse
    {
        $this->staff($r);
        $v = $r->validate([
            'subject_type' => ['required', Rule::in(['role','user'])],
            'subject_id' => ['required','integer','min:1'],
            'widgets' => ['required','array'],
            'widget_order' => ['nullable','array'],
            'data_scope' => ['required', Rule::in(['own_branch','selected_branches','all_branches','all_records'])],
            'selected_branches' => ['nullable','array'],
            'expires_at' => ['nullable','date'],
        ]);
        DB::table('dashboard_access_profiles')->updateOrInsert(
            ['subject_type'=>$v['subject_type'], 'subject_id'=>$v['subject_id']],
            ['widgets'=>json_encode(array_values($v['widgets'])), 'widget_order'=>json_encode(array_values($v['widget_order'] ?? $v['widgets'])),
             'data_scope'=>$v['data_scope'], 'selected_branches'=>json_encode(array_values($v['selected_branches'] ?? [])),
             'expires_at'=>$v['expires_at'] ?? null, 'updated_by'=>$r->user()->id, 'updated_at'=>now(), 'created_at'=>now()]
        );
        return response()->json(['status'=>true,'message'=>'Dashboard access profile saved.']);
    }

    public function effectiveDashboardProfile(Request $r): JsonResponse
    {
        $user = $r->user();
        $row = DB::table('dashboard_access_profiles')->where('subject_type','user')->where('subject_id',$user->id)
            ->where(fn($q)=>$q->whereNull('expires_at')->orWhere('expires_at','>',now()))->first();
        if (! $row) {
            $roleIds = method_exists($user, 'roles') ? $user->roles()->pluck('roles.id') : collect();
            $row = DB::table('dashboard_access_profiles')->where('subject_type','role')->whereIn('subject_id',$roleIds)
                ->where(fn($q)=>$q->whereNull('expires_at')->orWhere('expires_at','>',now()))->latest('id')->first();
        }
        $defaults = ['today_sales','today_collection','today_due','today_expense','net_profit','website_orders','low_stock','pending_warranty','pending_booking','open_messages','recent_activities','central_search'];
        return response()->json(['status'=>true,'data'=>[
            'widgets'=>$row ? json_decode($row->widgets ?: '[]',true) : $defaults,
            'widget_order'=>$row ? json_decode($row->widget_order ?: '[]',true) : $defaults,
            'data_scope'=>$row->data_scope ?? 'own_branch',
            'selected_branches'=>$row ? json_decode($row->selected_branches ?: '[]',true) : [],
        ]]);
    }

    private function applyOrderScope(Request $request, $query): void
    {
        $rule = (array) $request->attributes->get('nst_access_rule', []);
        $scope = (string) ($rule['row_scope'] ?? 'own_branch');
        if ($scope === 'all_records' || $scope === 'all_branches') {
            return;
        }
        if ($scope === 'selected_branches') {
            $ids = array_values(array_filter(array_map('intval', (array) ($rule['selected_branches'] ?? []))));
            $query->whereIn('branch_id', $ids ?: [-1]);
            return;
        }
        if ($scope === 'own_records') {
            $query->where(function ($q) use ($request) {
                $q->where('assigned_staff_id', $request->user()->id)->orWhere('user_id', $request->user()->id);
            });
            return;
        }

        $ids = $this->branchIds($request);
        $query->whereIn('branch_id', $ids ?: [-1]);
    }

    private function ensureBranchAllowed(Request $request, int $branchId): void
    {
        $rule = (array) $request->attributes->get('nst_access_rule', []);
        $scope = (string) ($rule['row_scope'] ?? 'own_branch');
        if (in_array($scope, ['all_records', 'all_branches'], true)) {
            return;
        }
        $ids = $scope === 'selected_branches'
            ? array_values(array_filter(array_map('intval', (array) ($rule['selected_branches'] ?? []))))
            : $this->branchIds($request);
        abort_unless(in_array($branchId, $ids, true), 403, 'You cannot assign this web order to the selected branch.');
    }

    private function branchIds(Request $request): array
    {
        $ids = Schema::hasTable('branch_user')
            ? DB::table('branch_user')->where('user_id', $request->user()->id)->pluck('branch_id')->map(fn ($id) => (int) $id)->all()
            : [];
        if ($request->user()->branch_id) $ids[] = (int) $request->user()->branch_id;
        return array_values(array_unique($ids));
    }
}
