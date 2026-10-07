<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class ApkBuildRequest extends Model{
 protected $fillable=['app_id','build_token','status','configuration','build_log','artifact_path','apk_path','aab_path','file_size','sha256','md5','error_message','worker_id','started_at','finished_at','requested_by'];
 protected $casts=['configuration'=>'array','started_at'=>'datetime','finished_at'=>'datetime'];
 public function app(){return $this->belongsTo(AppCenterApp::class,'app_id');}
}
