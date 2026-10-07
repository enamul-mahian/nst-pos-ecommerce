<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class AppCenterApp extends Model {
 protected $fillable=['name','slug','package_name','category','developer','short_description','description','icon_path','banner_path','screenshots','play_store_url','website_url','rating','is_featured','is_active','downloads','created_by'];
 protected $casts=['screenshots'=>'array','is_featured'=>'boolean','is_active'=>'boolean','rating'=>'decimal:2'];
 public function releases(){return $this->hasMany(AppCenterRelease::class,'app_id');}
 public function publishedRelease(){return $this->hasOne(AppCenterRelease::class,'app_id')->where('status','published')->latestOfMany('version_code');}
}