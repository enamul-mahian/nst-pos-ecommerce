<?php

return [

    'dashboard' => [
        'welcome_title' => 'স্বাগতম, {name}!',
        'welcome_subtitle' => 'আজ আপনার ব্যবসার সর্বশেষ অবস্থা দেখুন।',
    ],

    'export' => [
        'xlsx_create_failed' => 'XLSX file create করা যায়নি। storage/app/exports permission check করুন।',
    ],

    'product' => [
        'sku_format_invalid' => 'SKU/Barcode must follow NST-123456789 format. NST-এর পরে ঠিক ৯ digit number দিতে হবে।',
    ],

    'sale_prep' => [
        'status_locked' => 'এই device-এর status :status। শুধু Awaiting Inspection বা Ready For Sale device বিক্রির জন্য প্রস্তুত করা যায়।',
        'branch_required' => 'Ready For Sale করার আগে device-এর branch দিতে হবে।',
        'new_product_not_allowed' => 'Used device শুধু used / pre-owned catalog product-এর সাথে link করা যায়।',
        'slug_taken' => 'এই URL slug অন্য একটি product ব্যবহার করছে।',
        'too_many_images' => 'এই device-এর জন্য সর্বোচ্চ ৫টি ছবি দেওয়া যায়।',
        'imei_in_stock' => 'এই IMEI আগে থেকেই :sku হিসেবে stock-এ আছে। একই phone দুইবার যোগ করা যাবে না।',
        'ready_done' => 'Device Ready For Sale হয়েছে। Product ও variant link হয়েছে এবং stock update হয়েছে।',
        'purchase_sold' => 'এই item আগেই বিক্রি হয়েছে।',
    ],

    'security' => [
        'tamper_saved' => 'ট্যাম্পার গার্ড সেটিংস সেভ হয়েছে।',
        'super_admin_only' => 'শুধু Super Admin এই সেটিং পরিবর্তন করতে পারবেন।',
        'notification_title' => 'সিকিউরিটি সতর্কতা: :type',
        'notification_message' => ':who, IP :ip, পেজ :page',
        'guest' => 'ভিজিটর',
        'price_tampered' => ':product-এর দাম দোকানের দামের সাথে মিলছে না। অর্ডার বন্ধ করা হয়েছে। কার্ট রিফ্রেশ করে আবার চেষ্টা করুন।',
        'price_changed' => ':product-এর দাম পরিবর্তন হয়েছে। কার্টে বর্তমান দাম বসানো হয়েছে। দেখে আবার অর্ডার দিন।',
        'amount_tampered' => 'ডিসকাউন্ট যে অ্যামাউন্টের উপর দেওয়া হয়েছে তার চেয়ে বেশি। সেল সেভ হয়নি।',
    ],

    'purchase' => [
        'created' => 'পারচেজ সেভ হয়েছে।',
        'created_devices_waiting' => 'পারচেজ সেভ হয়েছে। :count টি device Device Stock-এ Awaiting Inspection অবস্থায় আছে। প্রতিটি খুলে Inspect & Prepare দিয়ে বিক্রির তথ্য দিন এবং ওয়েবসাইটে প্রকাশ করুন।',
    ],

    'sale' => [
        'insufficient_devices' => ':product এর available IMEI/device যথেষ্ট নেই। Available device: :available, required: :required.',
    ],

    'system_health' => [
        'writable' => 'Writable.',
        'not_writable' => 'Not writable. Permission check করুন।',
        'recommend_fix_failed' => 'Failed checks আগে ঠিক করুন। সাধারণত php artisan migrate এবং php artisan optimize:clear চালালে table/route issue ঠিক হয়।',
        'recommend_review_warnings' => 'Warnings business data mismatch নির্দেশ করতে পারে। Purchase/Sale/Return/Payment test flow আবার verify করুন।',
        'recommend_pre_production_test' => 'Production upload-এর আগে Settings, Backup & Export, Activity Logs, Invoice Print এবং POS Sale flow একবার করে test করুন।',
    ],

    'tracking' => [
        'default_platform_delete_blocked' => 'Default platform delete করা যাবে না, শুধু disable করুন।',
    ],

    'website_code' => [
        'too_large' => ':where এর custom code অনেক বড় (প্রতি বক্সে সর্বোচ্চ :kb KB)।',
    ],

];
