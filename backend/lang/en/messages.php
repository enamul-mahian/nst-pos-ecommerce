<?php

return [

    'dashboard' => [
        'welcome_title' => 'Welcome back, {name}!',
        'welcome_subtitle' => 'Here’s what’s happening with your business today.',
    ],

    'export' => [
        'xlsx_create_failed' => 'Could not create the XLSX file. Check the storage/app/exports permissions.',
    ],

    'product' => [
        'sku_format_invalid' => 'SKU/Barcode must follow the NST-123456789 format: exactly 9 digits after NST-.',
    ],

    'sale_prep' => [
        'status_locked' => 'This device is :status. Only an Awaiting Inspection or Ready For Sale device can be prepared for sale.',
        'branch_required' => 'The device needs a branch before it can be marked Ready For Sale.',
        'new_product_not_allowed' => 'A used device can only be linked to a used / pre-owned catalog product.',
        'slug_taken' => 'This URL slug is already used by another product.',
        'too_many_images' => 'A maximum of 5 images is allowed for this device.',
        'imei_in_stock' => 'This IMEI is already in stock under :sku. The same phone cannot be added twice.',
        'ready_done' => 'Device is Ready For Sale. Product and variant are linked and stock is updated.',
        'purchase_sold' => 'This item is already sold.',
    ],

    'security' => [
        'tamper_saved' => 'Tamper guard settings saved.',
        'super_admin_only' => 'Only a Super Admin can change this setting.',
        'notification_title' => 'Security alert: :type',
        'notification_message' => ':who from IP :ip on :page',
        'guest' => 'Visitor',
        'price_tampered' => 'The price of :product does not match the shop price. The order was stopped. Please refresh your cart and try again.',
        'price_changed' => 'The price of :product has changed. Your cart was updated with the current price. Please check and place the order again.',
        'amount_tampered' => 'The discount is larger than the amount it applies to. The sale was not saved.',
    ],

    'purchase' => [
        'created' => 'Purchase saved.',
        'created_devices_waiting' => 'Purchase saved. :count device(s) are in Device Stock as Awaiting Inspection. Open each one and use Inspect & Prepare to add the sale details and publish it.',
    ],

    'sale' => [
        'insufficient_devices' => 'Not enough available IMEI/devices for :product. Available devices: :available, required: :required.',
    ],

    'system_health' => [
        'writable' => 'Writable.',
        'not_writable' => 'Not writable. Check the permissions.',
        'recommend_fix_failed' => 'Fix the failed checks first. Running php artisan migrate and php artisan optimize:clear usually resolves table/route issues.',
        'recommend_review_warnings' => 'Warnings may indicate a business data mismatch. Verify the Purchase/Sale/Return/Payment test flow again.',
        'recommend_pre_production_test' => 'Before uploading to production, test Settings, Backup & Export, Activity Logs, Invoice Print and the POS Sale flow once each.',
    ],

    'tracking' => [
        'default_platform_delete_blocked' => 'A default platform cannot be deleted, only disabled.',
    ],

    'website_code' => [
        'too_large' => 'Custom code is too large in :where (max :kb KB per box).',
    ],

];
