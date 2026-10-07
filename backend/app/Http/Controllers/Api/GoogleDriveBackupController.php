<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class GoogleDriveBackupController extends Controller
{
    public function status(): JsonResponse
    {
        return response()->json(['success'=>true,'data'=>[
            'configured'=>$this->configured(),
            'connected'=>(bool) Setting::getValue('google_drive_refresh_token_encrypted'),
            'folder_id'=>config('services.google_drive.folder_id') ?: null,
            'message'=>!$this->configured() ? 'Add Google Drive OAuth credentials to .env.' : ((bool)Setting::getValue('google_drive_refresh_token_encrypted') ? 'Google Drive backup is connected.' : 'OAuth is configured; connect a Google account.'),
        ]]);
    }

    public function authorize(Request $request): JsonResponse
    {
        abort_unless($this->configured(),503,'Google Drive OAuth is not configured.');
        $state=Str::random(64); Cache::put('google-drive-oauth:'.$state,['user_id'=>$request->user()->id],now()->addMinutes(10));
        $url='https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query([
            'client_id'=>config('services.google_drive.client_id'),'redirect_uri'=>config('services.google_drive.redirect_uri'),'response_type'=>'code',
            'scope'=>'https://www.googleapis.com/auth/drive.file','access_type'=>'offline','prompt'=>'consent','state'=>$state,
        ]);
        return response()->json(['success'=>true,'data'=>['authorization_url'=>$url]]);
    }

    public function callback(Request $request): JsonResponse
    {
        $payload=Cache::pull('google-drive-oauth:'.(string)$request->query('state'));
        abort_unless($payload && $request->filled('code'),419,'Invalid or expired Google Drive OAuth state.');
        $token=Http::asForm()->post('https://oauth2.googleapis.com/token',[
            'code'=>$request->query('code'),'client_id'=>config('services.google_drive.client_id'),'client_secret'=>config('services.google_drive.client_secret'),
            'redirect_uri'=>config('services.google_drive.redirect_uri'),'grant_type'=>'authorization_code',
        ])->throw()->json();
        Setting::setValue('google_drive_access_token_encrypted',Crypt::encryptString((string)$token['access_token']),'integration','string');
        if (!empty($token['refresh_token'])) Setting::setValue('google_drive_refresh_token_encrypted',Crypt::encryptString((string)$token['refresh_token']),'integration','string');
        Setting::setValue('google_drive_access_token_expires_at',now()->addSeconds((int)($token['expires_in']??3600))->toIso8601String(),'integration','string');
        return response()->json(['success'=>true,'message'=>'Google Drive backup account connected. You can return to Backup & Data Export.']);
    }

    public function disconnect(): JsonResponse
    {
        foreach(['google_drive_access_token_encrypted','google_drive_refresh_token_encrypted','google_drive_access_token_expires_at'] as $key) Setting::query()->where('key',$key)->delete();
        return response()->json(['success'=>true,'message'=>'Google Drive backup disconnected.']);
    }

    public function uploadLatest(): JsonResponse
    {
        $files=glob(storage_path('app/backups/nst_database_backup_*.sql')) ?: [];
        abort_if(empty($files),404,'Create a local database backup first.');
        usort($files,fn($a,$b)=>filemtime($b)<=>filemtime($a)); $path=$files[0]; $name=basename($path); $token=$this->accessToken();
        $meta=['name'=>$name]; if(config('services.google_drive.folder_id')) $meta['parents']=[config('services.google_drive.folder_id')];
        $boundary='nst'.Str::random(24);
        $body="--{$boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".json_encode($meta)."\r\n--{$boundary}\r\nContent-Type: application/sql\r\n\r\n".file_get_contents($path)."\r\n--{$boundary}--";
        $result=Http::withToken($token)->withHeaders(['Content-Type'=>'multipart/related; boundary='.$boundary])->withBody($body,'multipart/related; boundary='.$boundary)->post('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink')->throw()->json();
        return response()->json(['success'=>true,'message'=>'Latest database backup uploaded to Google Drive.','data'=>$result]);
    }

    private function accessToken(): string
    {
        $enc=Setting::getValue('google_drive_access_token_encrypted'); $expires=Setting::getValue('google_drive_access_token_expires_at');
        if($enc && $expires && now()->lt($expires)) return Crypt::decryptString($enc);
        $refresh=Setting::getValue('google_drive_refresh_token_encrypted'); abort_unless($refresh,422,'Connect Google Drive first.');
        $token=Http::asForm()->post('https://oauth2.googleapis.com/token',[
            'client_id'=>config('services.google_drive.client_id'),'client_secret'=>config('services.google_drive.client_secret'),
            'refresh_token'=>Crypt::decryptString($refresh),'grant_type'=>'refresh_token',
        ])->throw()->json();
        Setting::setValue('google_drive_access_token_encrypted',Crypt::encryptString((string)$token['access_token']),'integration','string');
        Setting::setValue('google_drive_access_token_expires_at',now()->addSeconds((int)($token['expires_in']??3600))->toIso8601String(),'integration','string');
        return (string)$token['access_token'];
    }
    private function configured(): bool { return (bool)(config('services.google_drive.client_id') && config('services.google_drive.client_secret') && config('services.google_drive.redirect_uri')); }
}
