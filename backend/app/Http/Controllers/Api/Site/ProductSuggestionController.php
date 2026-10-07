<?php

namespace App\Http\Controllers\Api\Site;

use App\Http\Controllers\Controller;

class ProductSuggestionController extends Controller
{
    public function bySlug(string $slug)
    {
        return response()->json(['status' => true, 'data' => ['slug' => $slug, 'suggestions' => []]]);
    }
}
