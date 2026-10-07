<?php

namespace App\Http\Controllers\Api;

use App\Models\Product;
use Illuminate\Http\Request;

class ProductListThumbnailController extends ProductController
{
    public function index(Request $request)
    {
        return parent::index($request);
    }

    public function all(Request $request)
    {
        return parent::all($request);
    }

    public function show(Request $request, Product $product)
    {
        return parent::show($request, $product);
    }
}
