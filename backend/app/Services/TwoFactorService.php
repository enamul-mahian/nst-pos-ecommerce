<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Str;

class TwoFactorService
{
    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public function generateSecret(int $length = 32): string
    {
        $secret = '';
        for ($i = 0; $i < $length; $i++) {
            $secret .= self::ALPHABET[random_int(0, 31)];
        }
        return $secret;
    }

    public function currentCode(string $secret, ?int $timestamp = null): string
    {
        $counter = intdiv($timestamp ?? time(), 30);
        $binaryCounter = pack('N*', 0) . pack('N*', $counter);
        $hash = hash_hmac('sha1', $binaryCounter, $this->base32Decode($secret), true);
        $offset = ord($hash[19]) & 0x0f;
        $value = ((ord($hash[$offset]) & 0x7f) << 24)
            | ((ord($hash[$offset + 1]) & 0xff) << 16)
            | ((ord($hash[$offset + 2]) & 0xff) << 8)
            | (ord($hash[$offset + 3]) & 0xff);

        return str_pad((string) ($value % 1000000), 6, '0', STR_PAD_LEFT);
    }

    public function verifyCode(?string $secret, ?string $code, int $window = 1): bool
    {
        $secret = strtoupper(trim((string) $secret));
        $code = preg_replace('/\D+/', '', (string) $code);
        if ($secret === '' || strlen($code) !== 6) {
            return false;
        }

        $now = time();
        for ($offset = -$window; $offset <= $window; $offset++) {
            if (hash_equals($this->currentCode($secret, $now + ($offset * 30)), $code)) {
                return true;
            }
        }
        return false;
    }

    public function provisioningUri(User $user, string $secret): string
    {
        $issuer = 'New Singapur Telecom';
        $account = $user->email ?: ($user->username ?: ('user-' . $user->id));
        return 'otpauth://totp/' . rawurlencode($issuer . ':' . $account)
            . '?secret=' . rawurlencode($secret)
            . '&issuer=' . rawurlencode($issuer)
            . '&algorithm=SHA1&digits=6&period=30';
    }

    public function generateRecoveryCodes(int $count = 8): array
    {
        return collect(range(1, $count))
            ->map(fn () => strtoupper(Str::random(5) . '-' . Str::random(5)))
            ->all();
    }

    public function consumeRecoveryCode(User $user, ?string $candidate): bool
    {
        $candidate = strtoupper(trim((string) $candidate));
        if ($candidate === '') {
            return false;
        }

        $codes = is_array($user->two_factor_recovery_codes) ? $user->two_factor_recovery_codes : [];
        $matchedIndex = null;
        foreach ($codes as $index => $code) {
            if (hash_equals(strtoupper((string) $code), $candidate)) {
                $matchedIndex = $index;
                break;
            }
        }
        if ($matchedIndex === null) {
            return false;
        }

        unset($codes[$matchedIndex]);
        $user->forceFill(['two_factor_recovery_codes' => array_values($codes)])->save();
        return true;
    }

    private function base32Decode(string $value): string
    {
        $value = strtoupper(preg_replace('/[^A-Z2-7]/', '', $value));
        $buffer = 0;
        $bitsLeft = 0;
        $output = '';

        foreach (str_split($value) as $character) {
            $index = strpos(self::ALPHABET, $character);
            if ($index === false) {
                continue;
            }
            $buffer = ($buffer << 5) | $index;
            $bitsLeft += 5;
            if ($bitsLeft >= 8) {
                $bitsLeft -= 8;
                $output .= chr(($buffer >> $bitsLeft) & 0xff);
            }
        }

        return $output;
    }
}
