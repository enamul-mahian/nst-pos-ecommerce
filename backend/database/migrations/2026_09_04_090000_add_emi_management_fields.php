<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void {
        if (!Schema::hasTable('emi_banks')) return;
        Schema::table('emi_banks', function (Blueprint $table) {
            if (!Schema::hasColumn('emi_banks', 'processing_fee')) $table->decimal('processing_fee', 14, 2)->default(0);
            if (!Schema::hasColumn('emi_banks', 'recommendation_text')) $table->text('recommendation_text')->nullable();
            if (!Schema::hasColumn('emi_banks', 'is_recommended')) $table->boolean('is_recommended')->default(false);
        });
    }
    public function down(): void {}
};