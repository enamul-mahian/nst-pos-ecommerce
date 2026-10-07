<?php

return [
    'sslcommerz' => [
        'enabled' => (bool) env('SSLCOMMERZ_ENABLED', false),
        'sandbox' => (bool) env('SSLCOMMERZ_SANDBOX', true),
        'store_id' => env('SSLCOMMERZ_STORE_ID'),
        'store_password' => env('SSLCOMMERZ_STORE_PASSWORD'),
        'currency' => env('SSLCOMMERZ_CURRENCY', 'BDT'),
        'allow_risk_level_one' => (bool) env('SSLCOMMERZ_ALLOW_RISK_LEVEL_ONE', false),
        'timeout_seconds' => (int) env('SSLCOMMERZ_TIMEOUT_SECONDS', 30),
        'frontend_url' => rtrim((string) env('FRONTEND_URL', env('APP_URL')), '/'),
    ],

    'piprapay' => [
        'enabled' => (bool) env('PIPRAPAY_ENABLED', false),
        'base_url' => rtrim((string) env('PIPRAPAY_BASE_URL', ''), '/'),
        'api_key' => env('PIPRAPAY_API_KEY'),
        'currency' => env('PIPRAPAY_CURRENCY', 'BDT'),
        'timeout_seconds' => (int) env('PIPRAPAY_TIMEOUT_SECONDS', 30),
        'frontend_url' => rtrim((string) env('PIPRAPAY_FRONTEND_URL', env('FRONTEND_URL', env('APP_URL'))), '/'),
        'refunds_enabled' => (bool) env('PIPRAPAY_REFUNDS_ENABLED', false),
        'display_name' => env('PIPRAPAY_DISPLAY_NAME', 'PipraPay'),
        'sort_order' => (int) env('PIPRAPAY_SORT_ORDER', 20),
    ],
];
