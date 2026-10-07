<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('product_drafts')) {
            Schema::create('product_drafts', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->index();
                $table->unsignedBigInteger('product_id')->nullable()->index();
                $table->string('draft_key', 120);
                $table->unsignedTinyInteger('current_step')->default(1);
                $table->longText('payload');
                $table->string('status', 30)->default('active')->index();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();
                $table->unique(['user_id', 'draft_key']);
            });
        }

        if (! Schema::hasTable('invoice_coupon_tiers')) {
            Schema::create('invoice_coupon_tiers', function (Blueprint $table) {
                $table->id();
                $table->decimal('minimum_amount', 14, 2)->default(0);
                $table->decimal('maximum_amount', 14, 2)->nullable();
                $table->decimal('discount_amount', 14, 2)->default(0);
                $table->unsignedInteger('sort_order')->default(0);
                $table->boolean('is_active')->default(true)->index();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('registration_promo_codes')) {
            Schema::create('registration_promo_codes', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('phone', 50)->index();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->unsignedBigInteger('generated_by')->nullable()->index();
                $table->decimal('purchase_amount', 14, 2)->nullable();
                $table->decimal('discount_amount', 14, 2)->default(0);
                $table->string('status', 30)->default('unused')->index();
                $table->unsignedBigInteger('used_customer_id')->nullable()->index();
                $table->timestamp('used_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
                $table->index(['phone', 'status']);
            });
        }

        if (! Schema::hasTable('invoice_coupon_usages')) {
            Schema::create('invoice_coupon_usages', function (Blueprint $table) {
                $table->id();
                $table->string('coupon_code', 80)->unique();
                $table->unsignedBigInteger('source_sale_id')->nullable()->unique();
                $table->string('source_invoice_no', 120)->nullable()->unique();
                $table->unsignedBigInteger('used_sale_id')->nullable()->unique();
                $table->string('used_invoice_no', 120)->nullable()->unique();
                $table->string('customer_phone', 50)->nullable()->index();
                $table->decimal('source_amount', 14, 2)->default(0);
                $table->decimal('discount_amount', 14, 2)->default(0);
                $table->string('status', 30)->default('issued')->index();
                $table->unsignedBigInteger('issued_by')->nullable();
                $table->timestamp('issued_at')->nullable();
                $table->unsignedBigInteger('used_by')->nullable();
                $table->timestamp('used_at')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('external_preorders')) {
            Schema::create('external_preorders', function (Blueprint $table) {
                $table->id();
                $table->string('preorder_no', 80)->unique();
                $table->unsignedBigInteger('customer_id')->nullable()->index();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->unsignedBigInteger('assigned_to')->nullable()->index();
                $table->string('customer_name');
                $table->string('customer_phone', 50)->index();
                $table->string('customer_email')->nullable()->index();
                $table->string('product_name');
                $table->text('product_link');
                $table->string('product_image_path')->nullable();
                $table->string('product_image_source_url', 2000)->nullable();
                $table->decimal('requested_amount', 14, 2)->default(0);
                $table->decimal('paid_amount', 14, 2)->default(0);
                $table->string('status', 60)->default('order_recorded')->index();
                $table->text('customer_note')->nullable();
                $table->text('admin_note')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('security_events')) {
            Schema::create('security_events', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->nullable()->index();
                $table->string('user_name')->nullable();
                $table->string('role_name')->nullable()->index();
                $table->string('event_type', 120)->index();
                $table->string('severity', 30)->default('medium')->index();
                $table->string('status', 30)->default('open')->index();
                $table->string('ip_address', 64)->nullable()->index();
                $table->text('user_agent')->nullable();
                $table->text('url')->nullable();
                $table->string('request_method', 20)->nullable();
                $table->unsignedSmallInteger('response_code')->nullable();
                $table->json('sanitized_details')->nullable();
                $table->timestamp('resolved_at')->nullable();
                $table->unsignedBigInteger('resolved_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('nid_verification_logs')) {
            Schema::create('nid_verification_logs', function (Blueprint $table) {
                $table->id();
                $table->string('nid_number', 40)->index();
                $table->date('date_of_birth');
                $table->string('status', 40)->default('recorded')->index();
                $table->json('api_response')->nullable();
                $table->text('short_note')->nullable();
                $table->unsignedBigInteger('checked_by')->nullable()->index();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('sms_provider_settings')) {
            Schema::create('sms_provider_settings', function (Blueprint $table) {
                $table->id();
                $table->string('provider_name')->default('Custom HTTP API');
                $table->string('sender_id')->nullable();
                $table->text('api_url')->nullable();
                $table->text('api_key')->nullable();
                $table->json('request_headers')->nullable();
                $table->json('request_parameters')->nullable();
                $table->boolean('is_active')->default(false);
                $table->decimal('last_known_balance', 14, 4)->nullable();
                $table->timestamp('balance_checked_at')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('sms_message_templates')) {
            Schema::create('sms_message_templates', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('purpose')->nullable()->index();
                $table->text('message');
                $table->boolean('is_active')->default(true)->index();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('slug_redirects')) {
            Schema::create('slug_redirects', function (Blueprint $table) {
                $table->id();
                $table->string('entity_type', 80)->index();
                $table->unsignedBigInteger('entity_id')->nullable()->index();
                $table->string('old_slug')->index();
                $table->string('new_slug');
                $table->unsignedSmallInteger('status_code')->default(301);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->unique(['entity_type', 'old_slug']);
            });
        }

        $this->ensureUserAndCustomerColumns();
        $this->ensureProductColumns();
        $this->ensureVariantColumns();
        $this->seedCouponTiers();
    }

    private function ensureUserAndCustomerColumns(): void
    {
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                if (! Schema::hasColumn('users', 'two_factor_enabled')) {
                    $table->boolean('two_factor_enabled')->default(false)->index();
                }
                if (! Schema::hasColumn('users', 'two_factor_secret')) {
                    $table->text('two_factor_secret')->nullable();
                }
                if (! Schema::hasColumn('users', 'two_factor_recovery_codes')) {
                    $table->longText('two_factor_recovery_codes')->nullable();
                }
            });
        }

        if (Schema::hasTable('customers')) {
            Schema::table('customers', function (Blueprint $table) {
                if (! Schema::hasColumn('customers', 'current_location')) {
                    $table->string('current_location')->nullable();
                }
                if (! Schema::hasColumn('customers', 'latitude')) {
                    $table->decimal('latitude', 10, 7)->nullable();
                }
                if (! Schema::hasColumn('customers', 'longitude')) {
                    $table->decimal('longitude', 10, 7)->nullable();
                }
                if (! Schema::hasColumn('customers', 'registration_promo_code')) {
                    $table->string('registration_promo_code', 80)->nullable()->index();
                }
            });
        }
    }

    private function ensureProductColumns(): void
    {
        if (! Schema::hasTable('products')) {
            return;
        }

        Schema::table('products', function (Blueprint $table) {
            if (! Schema::hasColumn('products', 'website_published')) {
                $table->boolean('website_published')->default(false)->index();
            }
            if (! Schema::hasColumn('products', 'draft_step')) {
                $table->unsignedTinyInteger('draft_step')->default(1);
            }
            if (! Schema::hasColumn('products', 'activation_status')) {
                $table->string('activation_status', 40)->nullable();
            }
            if (! Schema::hasColumn('products', 'box_included')) {
                $table->boolean('box_included')->nullable();
            }
            if (! Schema::hasColumn('products', 'physical_condition')) {
                $table->string('physical_condition')->nullable();
            }
            if (! Schema::hasColumn('products', 'condition_grade')) {
                $table->string('condition_grade')->nullable();
            }
            if (! Schema::hasColumn('products', 'official_warranty')) {
                $table->string('official_warranty')->nullable();
            }
            if (! Schema::hasColumn('products', 'shop_warranty')) {
                $table->string('shop_warranty')->nullable();
            }
            if (! Schema::hasColumn('products', 'warranty_notes')) {
                $table->text('warranty_notes')->nullable();
            }
            if (! Schema::hasColumn('products', 'whats_in_box')) {
                $table->longText('whats_in_box')->nullable();
            }
        });
    }

    private function ensureVariantColumns(): void
    {
        if (! Schema::hasTable('product_variants')) {
            return;
        }

        Schema::table('product_variants', function (Blueprint $table) {
            $columns = [
                'minimum_booking_type' => fn () => $table->string('minimum_booking_type', 20)->default('percentage'),
                'minimum_booking_value' => fn () => $table->decimal('minimum_booking_value', 14, 2)->default(10),
                'emi_available' => fn () => $table->boolean('emi_available')->default(true),
                'allow_preorder' => fn () => $table->boolean('allow_preorder')->default(true),
                'stock_state' => fn () => $table->string('stock_state', 40)->default('in_stock'),
                'serial_number' => fn () => $table->string('serial_number')->nullable(),
                'activation_status' => fn () => $table->string('activation_status', 40)->nullable(),
                'box_included' => fn () => $table->boolean('box_included')->nullable(),
                'physical_condition' => fn () => $table->string('physical_condition')->nullable(),
                'condition_grade' => fn () => $table->string('condition_grade')->nullable(),
                'official_warranty' => fn () => $table->string('official_warranty')->nullable(),
                'shop_warranty' => fn () => $table->string('shop_warranty')->nullable(),
                'warranty_duration' => fn () => $table->string('warranty_duration')->nullable(),
                'warranty_notes' => fn () => $table->text('warranty_notes')->nullable(),
                'service_status' => fn () => $table->string('service_status', 60)->default('no_service'),
                'supplier_reference' => fn () => $table->string('supplier_reference')->nullable(),
                'purchase_reference' => fn () => $table->string('purchase_reference')->nullable(),
                'entry_done_by' => fn () => $table->unsignedBigInteger('entry_done_by')->nullable(),
                'barcode_printed_at' => fn () => $table->timestamp('barcode_printed_at')->nullable(),
            ];

            foreach ($columns as $column => $definition) {
                if (! Schema::hasColumn('product_variants', $column)) {
                    $definition();
                }
            }
        });
    }

    private function seedCouponTiers(): void
    {
        if (! Schema::hasTable('invoice_coupon_tiers') || DB::table('invoice_coupon_tiers')->count() > 0) {
            return;
        }

        $rows = [
            [15000, 29999, 50],
            [30000, 49999, 100],
            [50000, 69999, 150],
            [70000, 89999, 200],
            [90000, 110000, 250],
            [110000.01, null, 300],
        ];

        foreach ($rows as $index => [$minimum, $maximum, $discount]) {
            DB::table('invoice_coupon_tiers')->insert([
                'minimum_amount' => $minimum,
                'maximum_amount' => $maximum,
                'discount_amount' => $discount,
                'sort_order' => $index + 1,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // Rollback is intentionally data-safe. The replacement package restores files; business data is never dropped automatically.
    }
};
