<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Category;
use Illuminate\Http\Request;
use App\Services\AccessControlService;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function publicIndex(Request $request)
    {
        $query = Category::query()
            ->with(['children'])
            ->whereNull('parent_id')
            ->where('status', 'active');

        if ($request->filled('search')) {
            $this->applySearch($query, $request->search);
        }

        $categories = $query
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->map(function ($category) {
                return $this->formatCategory($category);
            });

        return response()->json([
            'status' => true,
            'message' => 'Public categories loaded successfully.',
            'data' => $categories,
        ]);
    }

    public function all(Request $request)
    {
        $query = Category::query();

        if ($request->filled('search')) {
            $this->applySearch($query, $request->search);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        } else {
            $query->where('status', 'active');
        }

        $categories = $query
            ->orderBy('sort_order')
            ->orderBy('name')
            ->limit($request->get('limit', 50))
            ->get()
            ->map(function ($category) {
                return $this->formatCategory($category);
            });

        return response()->json([
            'status' => true,
            'message' => 'All categories loaded successfully.',
            'data' => $categories,
        ]);
    }

    public function index(Request $request)
    {
        $query = Category::query()->with(['parent']);

        if ($request->filled('search')) {
            $this->applySearch($query, $request->search);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('parent_id')) {
            if ($request->parent_id === 'null' || $request->parent_id === 'root') {
                $query->whereNull('parent_id');
            } else {
                $query->where('parent_id', $request->parent_id);
            }
        }

        $categories = $query
            ->orderBy('sort_order')
            ->orderBy('name')
            ->paginate($request->get('per_page', 15));

        $categories->getCollection()->transform(function ($category) {
            return $this->formatCategory($category);
        });

        return response()->json([
            'status' => true,
            'message' => 'Categories loaded successfully.',
            'data' => $categories,
        ]);
    }

    public function store(Request $request)
    {
        $this->ensureCanManageCatalog($request);

        $validated = $this->validateCategory($request);

        $data = [
            'parent_id' => $validated['parent_id'] ?? null,
            'name' => $validated['name'],
            'slug' => ($validated['slug'] ?? null) ?: Category::generateUniqueSlug($validated['name']),
            'description' => $validated['description'] ?? null,
            'icon' => $validated['icon'] ?? null,
            'sort_order' => $validated['sort_order'] ?? 0,
            'status' => $validated['status'] ?? 'active',
            'created_by' => auth()->id(),
            'updated_by' => auth()->id(),
        ];

        if ($request->hasFile('image')) {
            $data['image'] = $request->file('image')->store('categories', 'public');
        } else {
            $data['image'] = $validated['image'] ?? null;
        }

        $category = Category::create($data);

        return response()->json([
            'status' => true,
            'message' => 'Category created successfully.',
            'data' => $this->formatCategory($category->fresh(['parent'])),
        ], 201);
    }

    public function show(Category $category)
    {
        return response()->json([
            'status' => true,
            'message' => 'Category details loaded successfully.',
            'data' => $this->formatCategory($category->load(['parent', 'children'])),
        ]);
    }

    public function update(Request $request, Category $category)
    {
        $this->ensureCanManageCatalog($request);

        $validated = $this->validateCategory($request, $category->id);

        $data = [
            'parent_id' => $validated['parent_id'] ?? null,
            'name' => $validated['name'],
            'slug' => ($validated['slug'] ?? null) ?: Category::generateUniqueSlug($validated['name'], $category->id),
            'description' => $validated['description'] ?? null,
            'icon' => $validated['icon'] ?? null,
            'sort_order' => $validated['sort_order'] ?? 0,
            'status' => $validated['status'] ?? 'active',
            'updated_by' => auth()->id(),
        ];

        if ((int) ($data['parent_id'] ?? 0) === (int) $category->id) {
            return response()->json([
                'status' => false,
                'message' => 'Category cannot be parent of itself.',
            ], 422);
        }

        if ($request->hasFile('image')) {
            if ($category->image && Storage::disk('public')->exists($category->image)) {
                Storage::disk('public')->delete($category->image);
            }

            $data['image'] = $request->file('image')->store('categories', 'public');
        } elseif ($request->has('image')) {
            $data['image'] = $validated['image'] ?? null;
        }

        $category->update($data);

        return response()->json([
            'status' => true,
            'message' => 'Category updated successfully.',
            'data' => $this->formatCategory($category->fresh(['parent'])),
        ]);
    }

    public function destroy(Category $category)
    {
        $this->ensureCanManageCatalog(request());

        if ($category->children()->count() > 0) {
            return response()->json([
                'status' => false,
                'message' => 'This category has child categories. Please delete or move child categories first.',
            ], 422);
        }

        if ($category->products()->count() > 0) {
            return response()->json([
                'status' => false,
                'message' => 'This category has products. Please move products to another category first.',
            ], 422);
        }

        $category->delete();

        return response()->json([
            'status' => true,
            'message' => 'Category deleted successfully.',
        ]);
    }

    private function validateCategory(Request $request, ?int $categoryId = null): array
    {
        return $request->validate([
            'parent_id' => ['nullable', 'integer', 'exists:categories,id'],
            'name' => ['required', 'string', 'max:255'],
            'slug' => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('categories', 'slug')->ignore($categoryId),
            ],
            'description' => ['nullable', 'string'],
            'image' => ['nullable'],
            'icon' => ['nullable', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'status' => ['nullable', Rule::in(['active', 'inactive'])],
        ]);
    }

    private function applySearch($query, string $search): void
    {
        $query->where(function ($q) use ($search) {
            $q->where('name', 'like', "%{$search}%")
                ->orWhere('slug', 'like', "%{$search}%")
                ->orWhere('description', 'like', "%{$search}%");
        });
    }

    private function formatCategory(Category $category): array
    {
        return [
            'id' => $category->id,
            'parent_id' => $category->parent_id,
            'parent' => $category->relationLoaded('parent') && $category->parent
                ? [
                    'id' => $category->parent->id,
                    'name' => $category->parent->name,
                ]
                : null,
            'name' => $category->name,
            'slug' => $category->slug,
            'description' => $category->description,
            'image' => $category->image,
            'image_url' => $this->fileUrl($category->image),
            'icon' => $category->icon,
            'sort_order' => $category->sort_order,
            'status' => $category->status,
            'children' => $category->relationLoaded('children')
                ? $category->children->map(function ($child) {
                    return $this->formatCategory($child);
                })->values()
                : [],
            'created_at' => $category->created_at,
            'updated_at' => $category->updated_at,
        ];
    }

    private function fileUrl(?string $path): ?string
    {
        if (!$path) {
            return null;
        }

        if (Str::startsWith($path, ['http://', 'https://'])) {
            return $path;
        }

        return asset('storage/' . ltrim($path, '/'));
    }

    private function ensureCanManageCatalog(Request $request): void
    {
        if (! app(AccessControlService::class)->canManageCatalog($request->user())) {
            abort(response()->json([
                'status' => false,
                'message' => 'You do not have permission to manage catalog data.',
            ], 403));
        }
    }


}