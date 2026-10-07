<?php

namespace Database\Seeders;

use App\Models\Brand;
use App\Models\Category;
use Illuminate\Database\Seeder;

class CategoryBrandSeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            [
                'name' => 'Smartphone',
                'description' => 'All kinds of official, unofficial, used, pre-owned and refurbished smartphones.',
                'sort_order' => 1,
                'status' => 'active',
            ],
            [
                'name' => 'Used Phone',
                'description' => 'Used mobile phones collected and verified by New Singapur Telecom.',
                'sort_order' => 2,
                'status' => 'active',
            ],
            [
                'name' => 'Pre-Owned Phone',
                'description' => 'Pre-owned phones with condition verification and customer information record.',
                'sort_order' => 3,
                'status' => 'active',
            ],
            [
                'name' => 'Refurbished Phone',
                'description' => 'Refurbished smartphones with service and quality check.',
                'sort_order' => 4,
                'status' => 'active',
            ],
            [
                'name' => 'Laptop',
                'description' => 'New, used and pre-owned laptops.',
                'sort_order' => 5,
                'status' => 'active',
            ],
            [
                'name' => 'Tablet',
                'description' => 'Tablets, iPads and Android tabs.',
                'sort_order' => 6,
                'status' => 'active',
            ],
            [
                'name' => 'Smart Watch',
                'description' => 'Smart watches and wearable devices.',
                'sort_order' => 7,
                'status' => 'active',
            ],
            [
                'name' => 'Accessories',
                'description' => 'Mobile accessories, charger, cable, cover, glass protector and other items.',
                'sort_order' => 8,
                'status' => 'active',
            ],
            [
                'name' => 'Charger',
                'description' => 'Original and compatible chargers.',
                'sort_order' => 9,
                'status' => 'active',
            ],
            [
                'name' => 'Headphone & Earbuds',
                'description' => 'Wired headphone, wireless earbuds and Bluetooth audio accessories.',
                'sort_order' => 10,
                'status' => 'active',
            ],
        ];

        foreach ($categories as $category) {
            Category::updateOrCreate(
                ['name' => $category['name']],
                $category
            );
        }

        $brands = [
            [
                'name' => 'Apple',
                'description' => 'Apple iPhone, iPad, MacBook and accessories.',
                'website' => 'https://www.apple.com',
                'sort_order' => 1,
                'status' => 'active',
            ],
            [
                'name' => 'Samsung',
                'description' => 'Samsung Galaxy smartphones, tablets and accessories.',
                'website' => 'https://www.samsung.com',
                'sort_order' => 2,
                'status' => 'active',
            ],
            [
                'name' => 'Xiaomi',
                'description' => 'Xiaomi, Redmi and Poco smartphones and accessories.',
                'website' => 'https://www.mi.com',
                'sort_order' => 3,
                'status' => 'active',
            ],
            [
                'name' => 'OnePlus',
                'description' => 'OnePlus smartphones and accessories.',
                'website' => 'https://www.oneplus.com',
                'sort_order' => 4,
                'status' => 'active',
            ],
            [
                'name' => 'Vivo',
                'description' => 'Vivo smartphones and accessories.',
                'website' => 'https://www.vivo.com',
                'sort_order' => 5,
                'status' => 'active',
            ],
            [
                'name' => 'Oppo',
                'description' => 'Oppo smartphones and accessories.',
                'website' => 'https://www.oppo.com',
                'sort_order' => 6,
                'status' => 'active',
            ],
            [
                'name' => 'Realme',
                'description' => 'Realme smartphones and accessories.',
                'website' => 'https://www.realme.com',
                'sort_order' => 7,
                'status' => 'active',
            ],
            [
                'name' => 'Honor',
                'description' => 'Honor smartphones and smart devices.',
                'website' => 'https://www.hihonor.com',
                'sort_order' => 8,
                'status' => 'active',
            ],
            [
                'name' => 'Tecno',
                'description' => 'Tecno smartphones and smart devices.',
                'website' => 'https://www.tecno-mobile.com',
                'sort_order' => 9,
                'status' => 'active',
            ],
            [
                'name' => 'Infinix',
                'description' => 'Infinix smartphones and accessories.',
                'website' => 'https://www.infinixmobility.com',
                'sort_order' => 10,
                'status' => 'active',
            ],
            [
                'name' => 'Google Pixel',
                'description' => 'Google Pixel smartphones.',
                'website' => 'https://store.google.com',
                'sort_order' => 11,
                'status' => 'active',
            ],
            [
                'name' => 'Huawei',
                'description' => 'Huawei smartphones and devices.',
                'website' => 'https://consumer.huawei.com',
                'sort_order' => 12,
                'status' => 'active',
            ],
        ];

        foreach ($brands as $brand) {
            Brand::updateOrCreate(
                ['name' => $brand['name']],
                $brand
            );
        }
    }
}