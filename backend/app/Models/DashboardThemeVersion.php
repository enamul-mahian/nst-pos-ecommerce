<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DashboardThemeVersion extends Model
{
    protected $fillable = ['theme_id','name','status','theme_payload','available_theme_ids','is_default','created_by','published_by','published_at','source_version_id'];

    protected function casts(): array
    {
        return ['theme_payload'=>'array','available_theme_ids'=>'array','is_default'=>'boolean','published_at'=>'datetime'];
    }

    public function assignments()
    {
        return $this->hasMany(DashboardThemeAssignment::class);
    }
}
