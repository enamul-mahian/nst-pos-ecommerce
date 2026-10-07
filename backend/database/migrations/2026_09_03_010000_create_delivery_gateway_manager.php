<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('delivery_gateway_settings')) {
            Schema::create('delivery_gateway_settings', function (Blueprint $table) {
                $table->id();
                $table->string('name', 120);
                $table->string('code', 80)->unique();
                $table->string('adapter', 40)->default('generic');
                $table->boolean('is_enabled')->default(false)->index();
                $table->boolean('is_default')->default(false)->index();
                $table->string('base_url', 500)->nullable();
                $table->longText('credentials')->nullable();
                $table->json('settings')->nullable();
                $table->string('connection_status', 30)->default('not_tested');
                $table->timestamp('last_tested_at')->nullable();
                $table->text('last_error')->nullable();
                $table->timestamps();
            });

            $now = now();

            DB::table('delivery_gateway_settings')->insert([
                [
                    'name' => 'Steadfast Courier',
                    'code' => 'steadfast',
                    'adapter' => 'steadfast',
                    'is_enabled' => false,
                    'is_default' => false,
                    'base_url' => 'https://portal.packzy.com/api/v1',
                    'settings' => json_encode([
                        'test_endpoint' => '/get_balance',
                        'create_endpoint' => '/create_order',
                        'track_endpoint' => '/status_by_trackingcode/{tracking}',
                        'default_weight' => 0.5,
                    ]),
                    'connection_status' => 'not_tested',
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
                [
                    'name' => 'Pathao Courier',
                    'code' => 'pathao',
                    'adapter' => 'pathao',
                    'is_enabled' => false,
                    'is_default' => false,
                    'base_url' => 'https://api-hermes.pathao.com',
                    'settings' => json_encode([
                        'token_endpoint' => '/aladdin/api/v1/issue-token',
                        'stores_endpoint' => '/aladdin/api/v1/stores',
                        'create_endpoint' => '/aladdin/api/v1/orders',
                        'track_endpoint' => '',
                        'store_id' => '',
                        'delivery_type' => 48,
                        'item_type' => 2,
                        'default_weight' => 0.5,
                    ]),
                    'connection_status' => 'not_tested',
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
                [
                    'name' => 'Sundarban Courier',
                    'code' => 'sundarban',
                    'adapter' => 'generic',
                    'is_enabled' => false,
                    'is_default' => false,
                    'base_url' => null,
                    'settings' => json_encode([
                        'auth_type' => 'bearer',
                        'header_name' => 'Authorization',
                        'test_endpoint' => '',
                        'create_endpoint' => '',
                        'track_endpoint' => '',
                        'default_weight' => 0.5,
                        'field_map' => [
                            'order_no' => 'order_no',
                            'recipient_name' => 'recipient_name',
                            'recipient_phone' => 'recipient_phone',
                            'recipient_address' => 'recipient_address',
                            'cod_amount' => 'cod_amount',
                            'note' => 'note',
                            'item_description' => 'item_description',
                            'quantity' => 'quantity',
                            'weight' => 'weight',
                        ],
                    ]),
                    'connection_status' => 'not_tested',
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
                [
                    'name' => 'Custom Courier API',
                    'code' => 'custom',
                    'adapter' => 'generic',
                    'is_enabled' => false,
                    'is_default' => false,
                    'base_url' => null,
                    'settings' => json_encode([
                        'auth_type' => 'bearer',
                        'header_name' => 'Authorization',
                        'test_endpoint' => '',
                        'create_endpoint' => '',
                        'track_endpoint' => '',
                        'default_weight' => 0.5,
                        'field_map' => [
                            'order_no' => 'order_no',
                            'recipient_name' => 'recipient_name',
                            'recipient_phone' => 'recipient_phone',
                            'recipient_address' => 'recipient_address',
                            'cod_amount' => 'cod_amount',
                            'note' => 'note',
                            'item_description' => 'item_description',
                            'quantity' => 'quantity',
                            'weight' => 'weight',
                        ],
                    ]),
                    'connection_status' => 'not_tested',
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
            ]);
        }

        if (! Schema::hasTable('delivery_gateway_shipments')) {
            Schema::create('delivery_gateway_shipments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('delivery_gateway_setting_id')
                    ->constrained('delivery_gateway_settings')
                    ->cascadeOnUpdate()
                    ->restrictOnDelete();
                $table->foreignId('customer_order_id')
                    ->constrained('customer_orders')
                    ->cascadeOnUpdate()
                    ->cascadeOnDelete();
                $table->unsignedBigInteger('sale_id')->nullable()->index();
                $table->string('consignment_id', 190)->nullable()->index();
                $table->string('tracking_code', 190)->nullable()->index();
                $table->string('provider_status', 120)->nullable()->index();
                $table->string('status', 40)->default('created')->index();
                $table->decimal('cod_amount', 14, 2)->default(0);
                $table->decimal('delivery_fee', 14, 2)->nullable();
                $table->json('request_payload')->nullable();
                $table->json('response_payload')->nullable();
                $table->text('last_error')->nullable();
                $table->timestamp('last_synced_at')->nullable();
                $table->unsignedBigInteger('created_by')->nullable()->index();
                $table->timestamps();

                $table->unique(
                    ['delivery_gateway_setting_id', 'customer_order_id'],
                    'delivery_gateway_order_unique'
                );
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('delivery_gateway_shipments');
        Schema::dropIfExists('delivery_gateway_settings');
    }
};
