<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\GoogleBusinessConnection;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Cache, Http};
use Illuminate\Support\Str;

class GoogleBusinessController extends Controller
{
    private function configured(): bool { return (bool) config('services.google_business.client_id') && (bool) config('services.google_business.client_secret') && (bool) config('services.google_business.redirect_uri'); }
    public function status(Request $request)
    {
        $configured = (bool) config('services.google_business.client_id')
            && (bool) config('services.google_business.client_secret')
            && (bool) config('services.google_business.redirect_uri');

        $connection = GoogleBusinessConnection::where('user_id', $request->user()->id)->first();
        return response()->json([
            'success' => true,
            'data' => [
                'configured' => $configured,
                'connected' => (bool) $connection,
                'account_name' => $connection?->account_name,
                'location_name' => $connection?->location_name,
                'status' => $configured ? ($connection ? 'connected' : 'ready_for_oauth') : 'not_configured',
                'message' => $configured
                    ? 'Google Business OAuth is configured; connect an account and select a location.'
                    : 'Not configured. Add Google Business OAuth settings before connecting an account.',
            ],
        ]);
    }

    public function authorize(Request $request) { abort_unless($this->configured(), 503, 'Google Business OAuth is not configured.'); $state = Str::random(64); Cache::put('google-business-oauth:'.$state, ['user_id'=>$request->user()->id], now()->addMinutes(10)); return response()->json(['success'=>true,'data'=>['authorization_url'=>'https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query(['client_id'=>config('services.google_business.client_id'),'redirect_uri'=>config('services.google_business.redirect_uri'),'response_type'=>'code','scope'=>'https://www.googleapis.com/auth/business.manage','access_type'=>'offline','prompt'=>'consent','state'=>$state])]]); }
    public function callback(Request $request) { $payload=Cache::pull('google-business-oauth:'.(string)$request->query('state')); abort_unless($payload && $request->filled('code'),419,'Invalid or expired OAuth state.'); $token=Http::asForm()->post('https://oauth2.googleapis.com/token',['code'=>$request->query('code'),'client_id'=>config('services.google_business.client_id'),'client_secret'=>config('services.google_business.client_secret'),'redirect_uri'=>config('services.google_business.redirect_uri'),'grant_type'=>'authorization_code'])->throw()->json(); GoogleBusinessConnection::updateOrCreate(['user_id'=>$payload['user_id']],['access_token'=>$token['access_token'],'refresh_token'=>$token['refresh_token']??null,'expires_at'=>now()->addSeconds((int)($token['expires_in']??3600))]); return response()->json(['success'=>true,'message'=>'Google Business account connected. Select a location next.']); }
    public function disconnect(Request $request) { GoogleBusinessConnection::where('user_id',$request->user()->id)->delete(); return response()->json(['success'=>true]); }
    public function accounts(Request $request) { $connection=$this->connection($request); return response()->json(['success'=>true,'data'=>Http::withToken($connection->access_token)->get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts')->throw()->json('accounts',[])]); }
    public function locations(Request $request) { $connection=$this->connection($request); $account=$request->validate(['account_name'=>'required|string'])['account_name']; $connection->update(['account_name'=>$account]); return response()->json(['success'=>true,'data'=>Http::withToken($connection->access_token)->get("https://mybusinessbusinessinformation.googleapis.com/v1/{$account}/locations",['readMask'=>'name,title'])->throw()->json('locations',[])]); }
    public function selectLocation(Request $request) { $data=$request->validate(['account_name'=>'required|string','location_name'=>'required|string','location_title'=>'nullable|string|max:255']); GoogleBusinessConnection::where('user_id',$request->user()->id)->update($data); return response()->json(['success'=>true]); }
    public function publish(Request $request) { $data=$request->validate(['summary'=>'required|string|max:1500','call_to_action_url'=>'nullable|url']); $connection=$this->connection($request); abort_unless($connection->location_name,422,'Select a Google Business location first.'); $body=['summary'=>$data['summary'],'topicType'=>'STANDARD']; if (!empty($data['call_to_action_url'])) $body['callToAction']=['actionType'=>'LEARN_MORE','url'=>$data['call_to_action_url']]; return response()->json(['success'=>true,'data'=>Http::withToken($connection->access_token)->post("https://mybusiness.googleapis.com/v4/{$connection->location_name}/localPosts",$body)->throw()->json()]); }
    private function connection(Request $request): GoogleBusinessConnection { abort_unless($this->configured(),503,'Google Business OAuth is not configured.'); $connection=GoogleBusinessConnection::where('user_id',$request->user()->id)->firstOrFail(); if ($connection->expires_at?->isPast() && $connection->refresh_token) { $token=Http::asForm()->post('https://oauth2.googleapis.com/token',['client_id'=>config('services.google_business.client_id'),'client_secret'=>config('services.google_business.client_secret'),'refresh_token'=>$connection->refresh_token,'grant_type'=>'refresh_token'])->throw()->json(); $connection->update(['access_token'=>$token['access_token'],'expires_at'=>now()->addSeconds((int)($token['expires_in']??3600))]); } return $connection->fresh(); }
}