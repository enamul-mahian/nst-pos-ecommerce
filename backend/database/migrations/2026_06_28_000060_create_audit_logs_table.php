<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('audit_logs')) {
            Schema::table('audit_logs', function (Blueprint $table) {
                $this->addColumnIfMissing($table, 'user_id', 'unsignedBigInteger', true);
                $this->addColumnIfMissing($table, 'branch_id', 'unsignedBigInteger', true);
                $this->addColumnIfMissing($table, 'user_name', 'string', true, 150);
                $this->addColumnIfMissing($table, 'user_email', 'string', true, 150);
                $this->addJsonColumnIfMissing($table, 'roles');
                $this->addColumnIfMissing($table, 'action', 'string', false, 80);
                $this->addColumnIfMissing($table, 'method', 'string', false, 20);
                $this->addColumnIfMissing($table, 'path', 'string', false, 255);
                $this->addColumnIfMissing($table, 'route_name', 'string', true, 150);
                $this->addColumnIfMissing($table, 'module', 'string', true, 80);
                $this->addColumnIfMissing($table, 'model_type', 'string', true, 150);
                $this->addColumnIfMissing($table, 'model_id', 'string', true, 80);
                $this->addColumnIfMissing($table, 'description', 'text', true);
                $this->addColumnIfMissing($table, 'status_code', 'unsignedSmallInteger', true);
                $this->addColumnIfMissing($table, 'ip_address', 'string', true, 60);
                $this->addColumnIfMissing($table, 'user_agent', 'text', true);
                $this->addJsonColumnIfMissing($table, 'request_payload');
                $this->addJsonColumnIfMissing($table, 'response_payload');
                $this->addJsonColumnIfMissing($table, 'meta');
            });

            return;
        }

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id')->nullable()->index();
            $table->unsignedBigInteger('branch_id')->nullable()->index();
            $table->string('user_name', 150)->nullable();
            $table->string('user_email', 150)->nullable();
            $table->json('roles')->nullable();
            $table->string('action', 80)->index();
            $table->string('method', 20)->index();
            $table->string('path', 255)->index();
            $table->string('route_name', 150)->nullable();
            $table->string('module', 80)->nullable()->index();
            $table->string('model_type', 150)->nullable();
            $table->string('model_id', 80)->nullable()->index();
            $table->text('description')->nullable();
            $table->unsignedSmallInteger('status_code')->nullable()->index();
            $table->string('ip_address', 60)->nullable();
            $table->text('user_agent')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['created_at', 'module']);
            $table->index(['created_at', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }

    private function addColumnIfMissing(Blueprint $table, string $column, string $type, bool $nullable = false, ?int $length = null): void
    {
        if (Schema::hasColumn('audit_logs', $column)) {
            return;
        }

        $definition = match ($type) {
            'unsignedBigInteger' => $table->unsignedBigInteger($column),
            'unsignedSmallInteger' => $table->unsignedSmallInteger($column),
            'text' => $table->text($column),
            default => $length ? $table->string($column, $length) : $table->string($column),
        };

        if ($nullable) {
            $definition->nullable();
        }
    }

    private function addJsonColumnIfMissing(Blueprint $table, string $column): void
    {
        if (!Schema::hasColumn('audit_logs', $column)) {
            $table->json($column)->nullable();
        }
    }
};
