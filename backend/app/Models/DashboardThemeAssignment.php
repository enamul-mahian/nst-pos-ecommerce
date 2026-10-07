<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DashboardThemeAssignment extends Model
{
    protected $fillable = ['dashboard_theme_version_id','assignable_type','assignable_key','branch_id','enabled'];
    protected function casts(): array { return ['enabled'=>'boolean']; }
    public function themeVersion() { return $this->belongsTo(DashboardThemeVersion::class); }
}
