<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return view('welcome');
});

/* ZKTeco device push (ADMS) */
Route::match(['get', 'post'], '/iclock/cdata', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'cdata'])->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class])->middleware('throttle:240,1');
Route::match(['get', 'post'], '/iclock/getrequest', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'getRequest'])->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class])->middleware('throttle:240,1');
Route::match(['get', 'post'], '/iclock/devicecmd', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'deviceCommand'])->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class])->middleware('throttle:240,1');
Route::match(['get', 'post'], '/iclock/registry', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'registry'])->withoutMiddleware([\Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class])->middleware('throttle:120,1');
