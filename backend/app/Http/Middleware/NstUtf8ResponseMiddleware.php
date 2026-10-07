<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class NstUtf8ResponseMiddleware
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $contentType = (string) $response->headers->get('Content-Type', '');

        if ($contentType !== '' && stripos($contentType, 'charset=') === false) {
            $base = strtolower(trim(explode(';', $contentType)[0]));

            $utf8Types = [
                'application/json',
                'application/problem+json',
                'text/html',
                'text/plain',
                'text/css',
                'text/javascript',
                'application/javascript',
                'application/xml',
                'text/xml',
                'image/svg+xml',
            ];

            if (in_array($base, $utf8Types, true) || str_ends_with($base, '+json')) {
                $response->headers->set('Content-Type', $base . '; charset=UTF-8');
            }
        }

        $response->headers->set('X-Content-Type-Options', 'nosniff');

        return $response;
    }
}
