<?php

namespace App\Support;

class SimpleZipWriter
{
    /**
     * Create a standards-compliant ZIP file without PHP ZipArchive extension.
     * Entries are stored without compression, which is valid for XLSX packages.
     *
     * @param array<string,string> $entries
     */
    public static function create(string $path, array $entries): void
    {
        $directory = dirname($path);
        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $file = fopen($path, 'wb');
        if ($file === false) {
            throw new \RuntimeException('Unable to create ZIP file: ' . $path);
        }

        $centralDirectory = '';
        $offset = 0;
        $entryCount = 0;
        [$dosTime, $dosDate] = self::dosDateTime();

        foreach ($entries as $name => $contents) {
            $name = str_replace('\\', '/', ltrim($name, '/'));
            $size = strlen($contents);
            $crc = self::crc32Unsigned($contents);
            $nameLength = strlen($name);
            $extraLength = 0;

            $localHeader = pack('VvvvvvVVVvv',
                0x04034b50, // local file header signature
                20,         // version needed to extract
                0,          // general purpose bit flag
                0,          // compression method: stored
                $dosTime,
                $dosDate,
                $crc,
                $size,
                $size,
                $nameLength,
                $extraLength
            ) . $name;

            fwrite($file, $localHeader);
            fwrite($file, $contents);

            $centralDirectory .= pack('VvvvvvvVVVvvvvvVV',
                0x02014b50, // central directory signature
                0x0314,     // version made by
                20,         // version needed
                0,          // flag
                0,          // stored
                $dosTime,
                $dosDate,
                $crc,
                $size,
                $size,
                $nameLength,
                0,          // extra length
                0,          // comment length
                0,          // disk number start
                0,          // internal attributes
                0,          // external attributes
                $offset
            ) . $name;

            $offset += strlen($localHeader) + $size;
            $entryCount++;
        }

        $centralOffset = $offset;
        $centralSize = strlen($centralDirectory);
        fwrite($file, $centralDirectory);

        $end = pack('VvvvvVVv',
            0x06054b50, // end of central dir signature
            0,
            0,
            $entryCount,
            $entryCount,
            $centralSize,
            $centralOffset,
            0
        );

        fwrite($file, $end);
        fclose($file);
    }

    public static function isAvailable(): bool
    {
        return true;
    }

    private static function crc32Unsigned(string $contents): int
    {
        return (int) hexdec(hash('crc32b', $contents));
    }

    /** @return array{0:int,1:int} */
    private static function dosDateTime(): array
    {
        $timestamp = time();
        $year = (int) date('Y', $timestamp);
        $month = (int) date('n', $timestamp);
        $day = (int) date('j', $timestamp);
        $hour = (int) date('G', $timestamp);
        $minute = (int) date('i', $timestamp);
        $second = (int) date('s', $timestamp);

        $year = max(1980, $year);
        $dosTime = ($hour << 11) | ($minute << 5) | intdiv($second, 2);
        $dosDate = (($year - 1980) << 9) | ($month << 5) | $day;

        return [$dosTime, $dosDate];
    }
}
