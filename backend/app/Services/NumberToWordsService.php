<?php

namespace App\Services;

class NumberToWordsService
{
    private array $ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    private array $tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    public function taka(float|int|string $amount): string
    {
        $amount = round((float) $amount, 2);
        $whole = (int) floor($amount);
        $poisha = (int) round(($amount - $whole) * 100);

        $words = $this->convert($whole) . ' Taka';
        if ($poisha > 0) {
            $words .= ' and ' . $this->convert($poisha) . ' Poisha';
        }

        return trim($words) . ' Only';
    }

    public function convert(int $number): string
    {
        if ($number === 0) {
            return 'Zero';
        }

        $parts = [];
        $crore = intdiv($number, 10000000);
        $number %= 10000000;
        $lakh = intdiv($number, 100000);
        $number %= 100000;
        $thousand = intdiv($number, 1000);
        $number %= 1000;
        $hundred = intdiv($number, 100);
        $number %= 100;

        if ($crore) { $parts[] = $this->convertBelowThousand($crore) . ' Crore'; }
        if ($lakh) { $parts[] = $this->convertBelowThousand($lakh) . ' Lakh'; }
        if ($thousand) { $parts[] = $this->convertBelowThousand($thousand) . ' Thousand'; }
        if ($hundred) { $parts[] = $this->ones[$hundred] . ' Hundred'; }
        if ($number) { $parts[] = $this->convertBelowHundred($number); }

        return implode(' ', array_filter($parts));
    }

    private function convertBelowThousand(int $number): string
    {
        $hundred = intdiv($number, 100);
        $rest = $number % 100;
        $text = [];
        if ($hundred) { $text[] = $this->ones[$hundred] . ' Hundred'; }
        if ($rest) { $text[] = $this->convertBelowHundred($rest); }
        return implode(' ', $text);
    }

    private function convertBelowHundred(int $number): string
    {
        if ($number < 20) {
            return $this->ones[$number];
        }

        $ten = intdiv($number, 10);
        $one = $number % 10;
        return trim($this->tens[$ten] . ' ' . ($this->ones[$one] ?? ''));
    }
}
