<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration{
 public function up():void{
  Schema::table('app_center_releases',function(Blueprint $t){if(!Schema::hasColumn('app_center_releases','aab_path'))$t->string('aab_path')->nullable()->after('apk_path');});
  Schema::table('apk_build_requests',function(Blueprint $t){
   if(!Schema::hasColumn('apk_build_requests','apk_path'))$t->string('apk_path')->nullable()->after('artifact_path');
   if(!Schema::hasColumn('apk_build_requests','aab_path'))$t->string('aab_path')->nullable()->after('apk_path');
   if(!Schema::hasColumn('apk_build_requests','file_size'))$t->unsignedBigInteger('file_size')->nullable()->after('aab_path');
   if(!Schema::hasColumn('apk_build_requests','md5'))$t->string('md5',32)->nullable()->after('sha256');
   if(!Schema::hasColumn('apk_build_requests','error_message'))$t->longText('error_message')->nullable()->after('build_log');
   if(!Schema::hasColumn('apk_build_requests','worker_id'))$t->string('worker_id',120)->nullable()->index()->after('status');
  });
 }
 public function down():void{}
};
