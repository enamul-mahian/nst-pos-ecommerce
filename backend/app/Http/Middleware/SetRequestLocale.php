<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class SetRequestLocale
{
    private const SUPPORTED = ['en', 'bn'];

    private const DEFAULT = 'en';

    public function handle(Request $request, Closure $next): Response
    {
        app()->setLocale($this->resolve($request));

        return $next($request);
    }

    private function resolve(Request $request): string
    {
        $header = $this->normalize((string) $request->header('X-Locale', ''));
        if ($header !== null) {
            return $header;
        }

        foreach ($request->getLanguages() as $language) {
            $match = $this->normalize($language);
            if ($match !== null) {
                return $match;
            }
        }

        return self::DEFAULT;
    }

    private function normalize(string $value): ?string
    {
        $code = strtolower(substr(trim($value), 0, 2));

        return in_array($code, self::SUPPORTED, true) ? $code : null;
    }
}
