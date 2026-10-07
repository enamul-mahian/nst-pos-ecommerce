<?php

use App\Http\Middleware\EnsureRoleAccess;
use App\Http\Middleware\EnsureSuperAdmin;
use App\Http\Middleware\RecordAuditLog;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->validateCsrfTokens(except: [
            'iclock/*',
        ]);

        $middleware->append(\App\Http\Middleware\NstUtf8ResponseMiddleware::class);
        $middleware->append(\App\Http\Middleware\RecordSecurityEvent::class);

        $middleware->api(append: [
            \App\Http\Middleware\SetRequestLocale::class,
        ]);

        $middleware->alias([
            'super.admin' => EnsureSuperAdmin::class,
            'role.access' => EnsureRoleAccess::class,
            'audit.log' => RecordAuditLog::class,
            'release.permission' => \App\Http\Middleware\EnsureReleasePermission::class,
            'supplier.portal' => \App\Http\Middleware\EnsureSupplierPortalUser::class,
            'financial.view' => \App\Http\Middleware\ApplyFinancialView::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })
    ->create();