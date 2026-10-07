<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class AppCenterRelease extends Model{
 protected $fillable=['app_id','version_name','version_code','min_android','target_android','apk_path','aab_path','file_size','sha256','md5','scan_status','scan_notes','changelog','status','published_at','created_by'];
 protected $casts=['published_at'=>'datetime'];
 public function app(){return $this->belongsTo(AppCenterApp::class,'app_id');}
}
