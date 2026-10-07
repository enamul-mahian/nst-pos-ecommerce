<?php

namespace App\Console\Commands;

use App\Services\NstAttendanceActionService;
use Illuminate\Console\Command;

class NstAttendanceRebuild extends Command
{
    protected $signature = 'nst:attendance-rebuild {--employee=} {--date=}';
    protected $description = 'Rebuild NST Face/Fingerprint attendance actions';

    public function handle(NstAttendanceActionService $service): int
    {
        $employee = $this->option('employee');
        $date = $this->option('date');

        if ($employee && $date) {
            $result = $service->rebuild((int)$employee, (string)$date);
        } else {
            $result = $service->rebuildPending();
        }

        $this->line(json_encode($result, JSON_PRETTY_PRINT));
        return self::SUCCESS;
    }
}
