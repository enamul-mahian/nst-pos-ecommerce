<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('emi_banks')) {
            Schema::create('emi_banks', function (Blueprint $table) {
                $table->id();
                $table->string('bank_name');
                $table->string('bank_short_name')->nullable();
                $table->decimal('minimum_amount', 14, 2)->default(10000);
                $table->json('tenure_charges')->nullable();
                $table->text('note')->nullable();
                $table->boolean('is_active')->default(true);
                $table->unsignedInteger('sort_order')->default(0);
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('communication_logs')) {
            Schema::create('communication_logs', function (Blueprint $table) {
                $table->id();
                $table->string('channel')->index(); // sms,email
                $table->string('purpose')->nullable()->index();
                $table->string('recipient_name')->nullable();
                $table->string('recipient_phone')->nullable()->index();
                $table->string('recipient_email')->nullable()->index();
                $table->string('subject')->nullable();
                $table->longText('message')->nullable();
                $table->string('status')->default('pending')->index(); // pending,sent,failed,skipped
                $table->text('error_message')->nullable();
                $table->string('related_type')->nullable();
                $table->unsignedBigInteger('related_id')->nullable();
                $table->string('invoice_no')->nullable()->index();
                $table->json('payload')->nullable();
                $table->timestamp('sent_at')->nullable();
                $table->unsignedBigInteger('sent_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('customer_messages')) {
            Schema::create('customer_messages', function (Blueprint $table) {
                $table->id();
                $table->string('ticket_no')->unique();
                $table->unsignedBigInteger('customer_id')->nullable()->index();
                $table->unsignedBigInteger('sale_id')->nullable()->index();
                $table->string('invoice_no')->nullable()->index();
                $table->string('name')->nullable();
                $table->string('phone')->nullable()->index();
                $table->string('email')->nullable()->index();
                $table->string('subject')->nullable();
                $table->string('category')->nullable()->index();
                $table->longText('message');
                $table->longText('admin_reply')->nullable();
                $table->string('status')->default('open')->index(); // open,replied,closed
                $table->unsignedBigInteger('assigned_to')->nullable();
                $table->unsignedBigInteger('replied_by')->nullable();
                $table->timestamp('replied_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('booking_preorders')) {
            Schema::create('booking_preorders', function (Blueprint $table) {
                $table->id();
                $table->string('booking_no')->unique();
                $table->unsignedBigInteger('product_id')->nullable()->index();
                $table->unsignedBigInteger('customer_id')->nullable()->index();
                $table->unsignedBigInteger('branch_id')->nullable()->index();
                $table->string('product_name')->nullable();
                $table->string('customer_name')->nullable();
                $table->string('customer_phone')->nullable()->index();
                $table->string('customer_email')->nullable();
                $table->decimal('product_price', 14, 2)->default(0);
                $table->decimal('required_deposit', 14, 2)->default(0);
                $table->decimal('paid_amount', 14, 2)->default(0);
                $table->decimal('due_amount', 14, 2)->default(0);
                $table->string('payment_method')->nullable();
                $table->string('transaction_id')->nullable();
                $table->string('status')->default('booked')->index();
                $table->date('expected_date')->nullable();
                $table->date('expires_at')->nullable();
                $table->text('note')->nullable();
                $table->text('admin_note')->nullable();
                $table->unsignedBigInteger('converted_sale_id')->nullable();
                $table->timestamp('converted_at')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('coupons')) {
            Schema::create('coupons', function (Blueprint $table) {
                $table->id();
                $table->string('code')->unique();
                $table->string('title')->nullable();
                $table->string('discount_type')->default('fixed'); // fixed,percent
                $table->decimal('discount_value', 14, 2)->default(0);
                $table->decimal('minimum_amount', 14, 2)->default(0);
                $table->unsignedInteger('usage_limit')->nullable();
                $table->unsignedInteger('used_count')->default(0);
                $table->dateTime('starts_at')->nullable();
                $table->dateTime('ends_at')->nullable();
                $table->string('applies_to')->default('all');
                $table->json('conditions')->nullable();
                $table->boolean('is_active')->default(true);
                $table->text('note')->nullable();
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('tracking_integrations')) {
            Schema::create('tracking_integrations', function (Blueprint $table) {
                $table->id();
                $table->string('platform_name');
                $table->string('platform_key')->nullable()->index();
                $table->string('tracking_id')->nullable();
                $table->longText('header_script')->nullable();
                $table->longText('body_script')->nullable();
                $table->longText('footer_script')->nullable();
                $table->json('events')->nullable();
                $table->json('apply_to')->nullable();
                $table->boolean('is_active')->default(false);
                $table->boolean('is_custom')->default(false);
                $table->unsignedInteger('sort_order')->default(0);
                $table->unsignedBigInteger('created_by')->nullable();
                $table->unsignedBigInteger('updated_by')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('dashboard_widget_preferences')) {
            Schema::create('dashboard_widget_preferences', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id')->index();
                $table->json('widgets')->nullable();
                $table->string('layout')->default('corporate');
                $table->timestamps();
            });
        }

        $this->ensureSalesColumns();
        $this->ensureCustomersColumns();
        $this->ensureDeviceWarrantyColumns();
        $this->ensureProductColumns();
        $this->seedDefaultEmiBanks();
        $this->seedDefaultTrackingIntegrations();
    }

    private function ensureSalesColumns(): void
    {
        if (! Schema::hasTable('sales')) {
            return;
        }

        Schema::table('sales', function (Blueprint $table) {
            if (! Schema::hasColumn('sales', 'public_token')) {
                $table->string('public_token', 80)->nullable()->unique();
            }
            if (! Schema::hasColumn('sales', 'send_email')) {
                $table->boolean('send_email')->default(false);
            }
            if (! Schema::hasColumn('sales', 'email_sent_at')) {
                $table->timestamp('email_sent_at')->nullable();
            }
            if (! Schema::hasColumn('sales', 'sms_sent_at')) {
                $table->timestamp('sms_sent_at')->nullable();
            }
            if (! Schema::hasColumn('sales', 'amount_in_words')) {
                $table->text('amount_in_words')->nullable();
            }
            if (! Schema::hasColumn('sales', 'coupon_code')) {
                $table->string('coupon_code')->nullable();
            }
            if (! Schema::hasColumn('sales', 'coupon_discount')) {
                $table->decimal('coupon_discount', 14, 2)->default(0);
            }
            if (! Schema::hasColumn('sales', 'utm_source')) {
                $table->string('utm_source')->nullable();
                $table->string('utm_medium')->nullable();
                $table->string('utm_campaign')->nullable();
                $table->string('utm_content')->nullable();
                $table->string('utm_term')->nullable();
            }
        });

        DB::table('sales')->whereNull('public_token')->orderBy('id')->chunkById(200, function ($sales) {
            foreach ($sales as $sale) {
                DB::table('sales')->where('id', $sale->id)->update([
                    'public_token' => sha1(($sale->invoice_no ?: $sale->id) . '|' . uniqid('', true)),
                ]);
            }
        });
    }

    private function ensureCustomersColumns(): void
    {
        if (! Schema::hasTable('customers')) {
            return;
        }

        Schema::table('customers', function (Blueprint $table) {
            if (! Schema::hasColumn('customers', 'marketing_consent')) {
                $table->boolean('marketing_consent')->default(false);
            }
            if (! Schema::hasColumn('customers', 'source')) {
                $table->string('source')->nullable();
            }
            if (! Schema::hasColumn('customers', 'last_message_at')) {
                $table->timestamp('last_message_at')->nullable();
            }
        });
    }

    private function ensureDeviceWarrantyColumns(): void
    {
        if (! Schema::hasTable('device_units')) {
            return;
        }

        Schema::table('device_units', function (Blueprint $table) {
            if (! Schema::hasColumn('device_units', 'warranty_type')) {
                $table->string('warranty_type')->nullable();
            }
            if (! Schema::hasColumn('device_units', 'warranty_period_months')) {
                $table->unsignedInteger('warranty_period_months')->nullable();
            }
            if (! Schema::hasColumn('device_units', 'warranty_start_date')) {
                $table->date('warranty_start_date')->nullable();
            }
            if (! Schema::hasColumn('device_units', 'warranty_end_date')) {
                $table->date('warranty_end_date')->nullable();
            }
            if (! Schema::hasColumn('device_units', 'warranty_terms')) {
                $table->longText('warranty_terms')->nullable();
            }
            if (! Schema::hasColumn('device_units', 'warranty_note')) {
                $table->text('warranty_note')->nullable();
            }
        });
    }

    private function ensureProductColumns(): void
    {
        if (! Schema::hasTable('products')) {
            return;
        }

        Schema::table('products', function (Blueprint $table) {
            if (! Schema::hasColumn('products', 'seo_keywords')) {
                $table->text('seo_keywords')->nullable();
            }
            if (! Schema::hasColumn('products', 'canonical_url')) {
                $table->string('canonical_url')->nullable();
            }
            if (! Schema::hasColumn('products', 'og_image')) {
                $table->string('og_image')->nullable();
            }
            if (! Schema::hasColumn('products', 'allow_preorder')) {
                $table->boolean('allow_preorder')->default(true);
            }
            if (! Schema::hasColumn('products', 'preorder_note')) {
                $table->text('preorder_note')->nullable();
            }
        });
    }

    private function seedDefaultEmiBanks(): void
    {
        if (! Schema::hasTable('emi_banks') || DB::table('emi_banks')->count() > 0) {
            return;
        }

        $defaultCharges = json_encode([
            '3' => 4.50,
            '6' => 7.50,
            '9' => 10.00,
            '12' => 12.50,
            '18' => 18.00,
            '24' => 23.50,
            '30' => 29.00,
            '36' => 34.50,
        ]);

        $banks = ['City Bank', 'BRAC Bank', 'Eastern Bank', 'Dutch-Bangla Bank', 'Standard Chartered', 'IFIC Bank', 'Mutual Trust Bank', 'Prime Bank', 'United Commercial Bank', 'Bank Asia'];
        foreach ($banks as $index => $bank) {
            DB::table('emi_banks')->insert([
                'bank_name' => $bank,
                'bank_short_name' => strtoupper(substr(preg_replace('/[^A-Za-z]/', '', $bank), 0, 5)),
                'minimum_amount' => 10000,
                'tenure_charges' => $defaultCharges,
                'note' => 'Demo EMI chart. Update actual bank charge from Settings > EMI Settings.',
                'is_active' => true,
                'sort_order' => $index + 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function seedDefaultTrackingIntegrations(): void
    {
        if (! Schema::hasTable('tracking_integrations') || DB::table('tracking_integrations')->count() > 0) {
            return;
        }

        $rows = [
            ['Meta Pixel', 'meta_pixel'],
            ['Google Ads', 'google_ads'],
            ['Google Analytics / GTM', 'google_analytics_gtm'],
            ['TikTok Pixel', 'tiktok_pixel'],
            ['LinkedIn Insight Tag', 'linkedin_insight'],
        ];

        foreach ($rows as $index => [$name, $key]) {
            DB::table('tracking_integrations')->insert([
                'platform_name' => $name,
                'platform_key' => $key,
                'events' => json_encode(['ViewProduct', 'Search', 'Lead', 'Purchase', 'PreOrder', 'WarrantyCheck', 'InvoiceView']),
                'apply_to' => json_encode(['ecommerce', 'public_invoice', 'warranty_check']),
                'is_active' => false,
                'is_custom' => false,
                'sort_order' => $index + 1,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // Safe migration: do not drop business data automatically.
    }
};
