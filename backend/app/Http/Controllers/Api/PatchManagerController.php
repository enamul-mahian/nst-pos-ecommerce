<?php

namespace App\Http\Controllers\Api;

class PatchManagerController extends \App\Http\Controllers\PatchManagerController
{
    public function upload(\Illuminate\Http\Request $request)
    {
        return $this->validatePatch($request);
    }
}
