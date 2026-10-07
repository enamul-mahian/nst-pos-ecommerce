<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

require '/opt/newsingapurtele/nst_app/vendor/autoload.php';

/** @var Application $app */
$app = require_once '/opt/newsingapurtele/nst_app/bootstrap/app.php';

$app->handleRequest(Request::capture());
