<?php

namespace App\Providers;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\ServiceProvider;
use Throwable;

class AppServiceProvider extends ServiceProvider
{
    private const DEFAULT_TIMEZONE = 'Asia/Dhaka';

    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        $this->applyBusinessTimezone();
    }

    /**
     * Use the timezone saved in Settings > General for dates, "today" ranges and database time functions.
     */
    private function applyBusinessTimezone(): void
    {
        try {
            $timezone = DB::table('settings')->where('key', 'timezone')->value('value') ?: self::DEFAULT_TIMEZONE;
        } catch (Throwable) {
            return;
        }

        if (! is_string($timezone) || ! in_array($timezone, \DateTimeZone::listIdentifiers(), true)) {
            return;
        }

        config(['app.timezone' => $timezone]);
        date_default_timezone_set($timezone);

        try {
            if (in_array(DB::connection()->getDriverName(), ['mysql', 'mariadb'], true)) {
                DB::statement('SET time_zone = ?', [now($timezone)->format('P')]);
            }
        } catch (Throwable) {
            //
        }
    }
}
