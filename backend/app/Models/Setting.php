<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    protected $fillable = [
        'group',
        'key',
        'value',
        'type',
    ];

    public static function getValue(string $key, mixed $default = null): mixed
    {
        $setting = static::query()->where('key', $key)->first();

        return $setting ? $setting->value : $default;
    }

    public static function setValue(string $key, mixed $value, string $group = 'general', string $type = 'string'): void
    {
        if ($type === 'json' || is_array($value) || is_object($value)) {
            $storedValue = json_encode($value ?? [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            $type = 'json';
        } elseif (is_bool($value)) {
            $storedValue = $value ? '1' : '0';
        } else {
            $storedValue = (string) ($value ?? '');
        }

        static::query()->updateOrCreate(
            ['key' => $key],
            [
                'group' => $group,
                'value' => $storedValue,
                'type' => $type,
            ]
        );
    }
}
