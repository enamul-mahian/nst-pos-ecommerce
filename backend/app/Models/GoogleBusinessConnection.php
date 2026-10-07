<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class GoogleBusinessConnection extends Model { protected $fillable=['user_id','access_token','refresh_token','expires_at','account_name','location_name','location_title']; protected $casts=['access_token'=>'encrypted','refresh_token'=>'encrypted','expires_at'=>'datetime']; }