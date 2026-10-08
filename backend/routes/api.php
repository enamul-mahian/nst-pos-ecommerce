<?php

/* Access matrix routes */
\Illuminate\Support\Facades\Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class, 'audit.log'])
    ->prefix('access-matrix')->group(function () {
    \Illuminate\Support\Facades\Route::get('/status', [\App\Http\Controllers\Api\AccessMatrixController::class, 'status']);
    \Illuminate\Support\Facades\Route::get('/me', [\App\Http\Controllers\Api\AccessMatrixController::class, 'me']);
    \Illuminate\Support\Facades\Route::get('/resources', [\App\Http\Controllers\Api\AccessMatrixController::class, 'resources']);
    \Illuminate\Support\Facades\Route::get('/roles', [\App\Http\Controllers\Api\AccessMatrixController::class, 'roles']);
    \Illuminate\Support\Facades\Route::get('/users', [\App\Http\Controllers\Api\AccessMatrixController::class, 'users']);
    \Illuminate\Support\Facades\Route::get('/rules', [\App\Http\Controllers\Api\AccessMatrixController::class, 'rules']);
    \Illuminate\Support\Facades\Route::post('/save', [\App\Http\Controllers\Api\AccessMatrixController::class, 'save']);
    \Illuminate\Support\Facades\Route::post('/user-override', [\App\Http\Controllers\Api\AccessMatrixController::class, 'userOverride']);
    \Illuminate\Support\Facades\Route::get('/audit-logs', [\App\Http\Controllers\Api\AccessMatrixController::class, 'auditLogs']);
    \Illuminate\Support\Facades\Route::post('/filter-preview', [\App\Http\Controllers\Api\AccessMatrixController::class, 'filterPreview']);
});

/* Patch manager routes */
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->prefix('patch-manager')->group(function () {
    Route::get('/status-v1', [\App\Http\Controllers\PatchManagerController::class, 'status']);
    Route::post('/status-v1', [\App\Http\Controllers\PatchManagerController::class, 'status']);
    Route::get('/status', [\App\Http\Controllers\PatchManagerController::class, 'status']);
    Route::post('/upload', [\App\Http\Controllers\Api\PatchManagerController::class, 'upload']);
    Route::post('/validate', [\App\Http\Controllers\PatchManagerController::class, 'validatePatch']);
    Route::post('/execute', [\App\Http\Controllers\PatchManagerController::class, 'execute']);
    Route::get('/runs', [\App\Http\Controllers\PatchManagerController::class, 'runs']);
    Route::get('/log/{id}', [\App\Http\Controllers\PatchManagerController::class, 'log']);
    Route::post('/rollback/{id}', [\App\Http\Controllers\PatchManagerController::class, 'rollback']);
});

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Controllers
|--------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DashboardThemeController;
use App\Http\Controllers\Api\AuditLogController;
use App\Http\Controllers\Api\AccountsController;
use App\Http\Controllers\Api\DataMaintenanceController;
use App\Http\Controllers\Api\ReportExportController;
use App\Http\Controllers\Api\SystemHealthController;
use App\Http\Controllers\Api\GooglePostController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\TwoFactorController;
use App\Http\Controllers\Api\AccessControlController;

use App\Http\Controllers\Api\BranchController;
use App\Http\Controllers\Api\BranchStockController;

use App\Http\Controllers\Api\CategoryController;
use App\Http\Controllers\Api\BrandController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductVariantController;
use App\Http\Controllers\Api\MediaLibraryController;
use App\Http\Controllers\Api\PatchManagerController;
use App\Http\Controllers\Api\PortalController;
use App\Http\Controllers\Api\BarcodeController;

use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CustomerLedgerController;
use App\Http\Controllers\Api\SupplierController;

use App\Http\Controllers\Api\PurchaseController;
use App\Http\Controllers\Api\SaleController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\ExpenseController;

use App\Http\Controllers\Api\StockTransferRequestController;
use App\Http\Controllers\Api\StockAdjustmentController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\ExchangeController;
use App\Http\Controllers\Api\DeliveryController;
use App\Http\Controllers\Api\DeliveryGatewayController;
use App\Http\Controllers\Api\OrderTimelineController;
use App\Http\Controllers\Api\ReportController;

use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\PermissionController;

use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\SslCommerzController;
use App\Http\Controllers\Api\UsedPurchaseController;
use App\Http\Controllers\Api\BulkUploadController;
use App\Http\Controllers\Api\BulkActionController;
use App\Http\Controllers\Api\DeviceUnitController;
use App\Http\Controllers\Api\WarrantyServiceController;
use App\Http\Controllers\Api\CorporateSettingsController;
use App\Http\Controllers\Api\EmiController;
use App\Http\Controllers\Api\MarketingCommunicationController;
use App\Http\Controllers\Api\InvoicePublicController;
use App\Http\Controllers\Api\PublicCustomerAuthController;
use App\Http\Controllers\Api\UnifiedCustomerMessageController;
use App\Http\Controllers\Api\PublicChatboxController;
use App\Http\Controllers\Api\CustomerMessageActionController;
use App\Http\Controllers\Api\BookingPreorderController;
use App\Http\Controllers\Api\CouponController;
use App\Http\Controllers\Api\DashboardEnhancementController;
use App\Http\Controllers\Api\DashboardOperatingController;
use App\Http\Controllers\Api\CustomerSupportController;
use App\Http\Controllers\Api\BarcodeToolController;
use App\Http\Controllers\Api\WarrantyPublicController;
use App\Http\Controllers\Api\ProductDraftController;
use App\Http\Controllers\Api\FinalOperationsController;
use App\Http\Controllers\Api\HCaptchaController;
use App\Http\Controllers\Api\NidVerificationController;

use App\Http\Controllers\Api\CustomerDuePaymentController;
use App\Http\Controllers\Api\CustomerDueRecalculateController;

use App\Http\Controllers\Api\SupplierLedgerController;

/*
|--------------------------------------------------------------------------
| Public API Routes
|--------------------------------------------------------------------------
*/

Route::get('/health', function () {
    return response()->json([
        'status' => true,
        'message' => 'New Singapur Telecom API is running',
        'app' => config('app.name'),
    ]);
});

/* NST public media file route: fixes broken images when public/storage symlink or WebP support is missing. */
Route::get('/media-library/file/{encodedPath}', [MediaLibraryController::class, 'publicFile'])->where('encodedPath', '.*');

/* NST Delivery Gateway webhook endpoint. Provider-specific bearer token can be configured in Delivery API Manager. */
Route::post('/delivery-webhooks/{code}', [DeliveryGatewayController::class, 'webhook']);

/*
|--------------------------------------------------------------------------
| Login Route Fix
|--------------------------------------------------------------------------
*/

Route::get('/login', function () {
    return response()->json([
        'status' => false,
        'message' => 'Unauthenticated. Please login first.',
    ], 401);
})->name('login');

Route::post('/login', [AuthController::class, 'login'])->name('api.login');

// OAuth callbacks are state-protected and must be reachable without a bearer token after Google redirects the browser.
Route::get('/google-business/callback', [\App\Http\Controllers\Api\GoogleBusinessController::class, 'callback']);
Route::get('/google-drive-backup/callback', [\App\Http\Controllers\Api\GoogleDriveBackupController::class, 'callback']);

/*
|--------------------------------------------------------------------------
| Public Product / eCommerce Routes
|--------------------------------------------------------------------------
*/

Route::get('/public/categories', [CategoryController::class, 'publicIndex']);
Route::get('/public/brands', [BrandController::class, 'publicIndex']);
Route::get('/public/brands/{brand:slug}', [BrandController::class, 'publicShowBySlug'])->middleware('throttle:60,1');
Route::get('/public/coupons/validate', [CouponController::class, 'validateCoupon'])->middleware('throttle:30,1');
Route::get('/public/recent-purchases', [\App\Http\Controllers\Api\RecentPurchaseController::class, 'index'])->middleware('throttle:60,1');

/*
|--------------------------------------------------------------------------
| Public Customer Tools: warranty, invoice, EMI, booking, message
|--------------------------------------------------------------------------
*/
Route::get('/public/warranty-check', [WarrantyPublicController::class, 'check']);
Route::get('/public/emi-banks', [EmiController::class, 'index']);
Route::get('/public/emi-calculate', [EmiController::class, 'calculate']);
Route::post('/public/bookings', [BookingPreorderController::class, 'publicStore']);
Route::get('/public/bookings/status', [BookingPreorderController::class, 'publicStatus']);
Route::post('/public/customer-messages', [UnifiedCustomerMessageController::class, 'publicStore'])->middleware('throttle:10,1');
Route::get('/public/hcaptcha/config', [HCaptchaController::class, 'config'])->middleware('throttle:60,1');
Route::post('/public/customer-register', [PublicCustomerAuthController::class, 'register'])->middleware('throttle:5,1');
Route::post('/public/customer-login', [PublicCustomerAuthController::class, 'login'])->middleware('throttle:10,1');
Route::post('/public/supplier-login', [\App\Http\Controllers\Api\SupplierPortalAuthController::class, 'login'])->middleware('throttle:10,1');
Route::get('/public/products/{productId}/specifications', [\App\Http\Controllers\Api\ProductSpecificationController::class, 'show'])->middleware('throttle:60,1');
Route::post('/public/registration-promo/validate', [FinalOperationsController::class, 'validateRegistrationPromo'])->middleware('throttle:20,1');
Route::post('/public/checkout-register', [FinalOperationsController::class, 'checkoutRegister'])->middleware('throttle:5,1');
Route::get('/public/payment-options', [FinalOperationsController::class, 'publicPaymentOptions'])->middleware('throttle:60,1');
Route::post('/public/external-preorders', [FinalOperationsController::class, 'publicExternalPreorderStore'])
    ->middleware(['auth:sanctum', \App\Http\Middleware\EnsureCustomerPortalUser::class]);
Route::get('/invoice-public/{invoiceNo}', [InvoicePublicController::class, 'show']);
Route::get('/invoice-public/{invoiceNo}/pdf', [InvoicePublicController::class, 'pdf']);

/*
|--------------------------------------------------------------------------
| SSLCommerz Public Callback Routes
|--------------------------------------------------------------------------
*/

Route::prefix('payment/sslcommerz')->group(function () {
    Route::match(['get', 'post'], '/success', [SslCommerzController::class, 'success'])->middleware('throttle:60,1');
    Route::match(['get', 'post'], '/fail', [SslCommerzController::class, 'fail'])->middleware('throttle:60,1');
    Route::match(['get', 'post'], '/cancel', [SslCommerzController::class, 'cancel'])->middleware('throttle:60,1');
    Route::post('/ipn', [SslCommerzController::class, 'ipn'])->middleware('throttle:120,1');
});

/*
|--------------------------------------------------------------------------
| PipraPay Public Return / Webhook
|--------------------------------------------------------------------------
*/
Route::post('/payment/piprapay/webhook', [\App\Http\Controllers\Api\PipraPayController::class, 'webhook'])->middleware('throttle:120,1');
Route::get('/payment/piprapay/return', [\App\Http\Controllers\Api\PipraPayController::class, 'returnFromGateway'])->middleware('throttle:60,1');

/*
|--------------------------------------------------------------------------
| Protected API Routes
|--------------------------------------------------------------------------
*/

Route::middleware(['auth:sanctum'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::get('/user', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/change-password', [AuthController::class, 'changePassword']);
    Route::get('/profile', [ProfileController::class, 'show']);
    Route::post('/profile', [ProfileController::class, 'update']);
});

Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsureCustomerPortalUser::class])->group(function () {
    Route::post('/portal/logout', [PublicCustomerAuthController::class, 'logout']);
    Route::get('/portal/profile', [PortalController::class, 'profile']);
    Route::get('/portal/sales', [PortalController::class, 'sales']);
    Route::get('/portal/purchases', [PortalController::class, 'purchases']);
    Route::get('/portal/external-preorders', [PortalController::class, 'externalPreorders']);
    Route::post('/portal/external-preorders/{preorderId}/payment', [PortalController::class, 'submitExternalPreorderPayment']);
    Route::get('/portal/coupons', [PortalController::class, 'coupons']);
    Route::get('/portal/sales/{saleId}/invoice-pdf', [PublicCustomerAuthController::class, 'portalInvoicePdf']);
    Route::get('/portal/orders', [OrderController::class, 'portalIndex']);
    Route::post('/portal/orders', [OrderController::class, 'portalStore']);
    Route::get('/portal/orders/{order}/timeline', [OrderTimelineController::class, 'portal']);
    Route::post('/payment/sslcommerz/init', [SslCommerzController::class, 'init'])->middleware('throttle:10,1');
    Route::post('/payment/piprapay/init', [\App\Http\Controllers\Api\PipraPayController::class, 'init'])->middleware('throttle:10,1');
    Route::post('/payment/piprapay/verify', [\App\Http\Controllers\Api\PipraPayController::class, 'verify'])->middleware('throttle:20,1');
    Route::get('/portal/messages', [UnifiedCustomerMessageController::class, 'portalIndex']);
    Route::post('/portal/messages', [UnifiedCustomerMessageController::class, 'portalStore']);
    Route::get('/portal/messages/{messageId}', [UnifiedCustomerMessageController::class, 'portalShow']);
    Route::post('/portal/messages/{messageId}/reply', [UnifiedCustomerMessageController::class, 'portalReply']);
    Route::post('/portal/messages/{messageId}/read', [UnifiedCustomerMessageController::class, 'portalRead']);
});

Route::middleware(['auth:sanctum', 'super.admin'])->group(function () {
    Route::get('/payment-gateways', [\App\Http\Controllers\Api\PaymentGatewayController::class, 'index']);
    Route::put('/payment-gateways/{provider}', [\App\Http\Controllers\Api\PaymentGatewayController::class, 'update']);
    Route::get('/payment-gateways/transactions', [\App\Http\Controllers\Api\PaymentGatewayController::class, 'transactions']);
    Route::get('/payment-gateways/webhook-logs', [\App\Http\Controllers\Api\PaymentGatewayController::class, 'webhookLogs']);
    Route::post('/payment-gateways/transactions/{paymentTransaction}/refund', [\App\Http\Controllers\Api\PaymentGatewayController::class, 'refund'])->middleware('throttle:10,1');
    Route::get('/google-drive-backup/status', [\App\Http\Controllers\Api\GoogleDriveBackupController::class, 'status']);
    Route::get('/google-drive-backup/authorize', [\App\Http\Controllers\Api\GoogleDriveBackupController::class, 'authorize']);
    Route::post('/google-drive-backup/upload-latest', [\App\Http\Controllers\Api\GoogleDriveBackupController::class, 'uploadLatest']);
    Route::delete('/google-drive-backup/connection', [\App\Http\Controllers\Api\GoogleDriveBackupController::class, 'disconnect']);
});
Route::middleware(['auth:sanctum', 'supplier.portal'])->prefix('supplier-portal')->group(function () {
    Route::get('/profile', [\App\Http\Controllers\Api\SupplierPortalAuthController::class, 'profile']);
    Route::post('/logout', [\App\Http\Controllers\Api\SupplierPortalAuthController::class, 'logout']);
    Route::get('/dashboard', [\App\Http\Controllers\Api\SupplierPortalController::class, 'dashboard']);
    Route::get('/purchases', [\App\Http\Controllers\Api\SupplierPortalController::class, 'purchases']);
    Route::get('/used-devices', [\App\Http\Controllers\Api\SupplierPortalController::class, 'usedDevices']);
    Route::get('/payments', [\App\Http\Controllers\Api\SupplierPortalController::class, 'payments']);
    Route::get('/price-submissions', [\App\Http\Controllers\Api\SupplierPortalController::class, 'priceSubmissions']);
    Route::post('/price-submissions', [\App\Http\Controllers\Api\SupplierPortalController::class, 'storePriceSubmission']);
    Route::get('/purchase-orders', [\App\Http\Controllers\Api\SupplierPortalController::class, 'purchaseOrders']);
});

Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class, 'audit.log'])->group(function () {

    Route::prefix('locked-operations')->group(function () {
        Route::get('/status', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'status']);
        Route::get('/refunds', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'refunds'])->middleware('release.permission:scheduled_refunds,view');
        Route::post('/refunds', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'storeRefund'])->middleware('release.permission:scheduled_refunds,create');
        Route::post('/refunds/{refundId}/action', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'refundAction'])->middleware('release.permission:scheduled_refunds,approve');
        Route::get('/supplier-prices', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'prices'])->middleware('release.permission:supplier_price_watch,view');
        Route::post('/supplier-prices', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'storePrice'])->middleware('release.permission:supplier_price_watch,create');
        Route::get('/purchase-orders', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'purchaseOrders'])->middleware('release.permission:purchase_orders,view');
        Route::post('/purchase-orders', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'storePurchaseOrder'])->middleware('release.permission:purchase_orders,create');
        Route::post('/purchase-orders/{purchaseOrderId}/action', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'purchaseOrderAction'])->middleware('release.permission:purchase_orders,approve');
        Route::get('/financial-policies', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'financialPolicies'])->middleware('super.admin');
        Route::post('/financial-policies', [\App\Http\Controllers\Api\NstLockedOperationsController::class, 'saveFinancialPolicy'])->middleware('super.admin');
    });

    Route::prefix('bulk-import-studio')->middleware('release.permission:bulk_import_studio,view')->group(function () {
        Route::get('/modules', [\App\Http\Controllers\Api\BulkImportStudioController::class, 'modules']);
        Route::get('/templates', [\App\Http\Controllers\Api\BulkImportStudioController::class, 'templates']);
        Route::post('/templates', [\App\Http\Controllers\Api\BulkImportStudioController::class, 'saveTemplate'])->middleware('release.permission:bulk_import_studio,edit');
        Route::get('/template/{moduleKey}', [\App\Http\Controllers\Api\BulkImportStudioController::class, 'downloadTemplate'])->middleware('release.permission:bulk_import_studio,export');
        Route::post('/preview/{moduleKey}', [\App\Http\Controllers\Api\BulkImportStudioController::class, 'preview'])->middleware('release.permission:bulk_import_studio,import');
        Route::post('/commit/{historyId}', [\App\Http\Controllers\Api\BulkImportStudioController::class, 'commit'])->middleware('release.permission:bulk_import_studio,import');
        Route::get('/history', [\App\Http\Controllers\Api\BulkImportStudioController::class, 'history']);
    });

    Route::prefix('products/{productId}/specifications')->group(function () {
        Route::get('/', [\App\Http\Controllers\Api\ProductSpecificationController::class, 'show'])->middleware('release.permission:product_specs,view');
        Route::put('/', [\App\Http\Controllers\Api\ProductSpecificationController::class, 'save'])->middleware('release.permission:product_specs,edit');
        Route::post('/import', [\App\Http\Controllers\Api\ProductSpecificationController::class, 'import'])->middleware('release.permission:product_specs,edit');
        Route::post('/extract-description-tables', [\App\Http\Controllers\Api\ProductSpecificationController::class, 'extractDescriptionTables'])->middleware('release.permission:product_specs,edit');
    });

    Route::prefix('barcode-label-templates')->group(function () {
        Route::get('/', [\App\Http\Controllers\Api\BarcodeLabelTemplateController::class, 'index'])->middleware('release.permission:barcode,view');
        Route::post('/', [\App\Http\Controllers\Api\BarcodeLabelTemplateController::class, 'store'])->middleware('release.permission:barcode,edit');
        Route::post('/print-payload', [\App\Http\Controllers\Api\BarcodeLabelTemplateController::class, 'printPayload'])->middleware('release.permission:barcode,print');
    });

    /*
    |--------------------------------------------------------------------------
    | POS User Security
    |--------------------------------------------------------------------------
    */

    Route::get('/two-factor/status', [TwoFactorController::class, 'status']);
    Route::post('/two-factor/setup', [TwoFactorController::class, 'setup']);
    Route::post('/two-factor/confirm', [TwoFactorController::class, 'confirm']);
    Route::post('/two-factor/disable', [TwoFactorController::class, 'disable']);
    Route::post('/two-factor/recovery-codes', [TwoFactorController::class, 'recoveryCodes']);

    /*
    |--------------------------------------------------------------------------
    | Dashboard
    |--------------------------------------------------------------------------
    */

    Route::get('/dashboard', [DashboardController::class, 'index']);
    Route::get('/dashboard/stats', [DashboardController::class, 'stats']);

    /*
    |--------------------------------------------------------------------------
    | Corporate Dashboard, Search & Notifications
    |--------------------------------------------------------------------------
    */
    Route::get('/dashboard/corporate-summary', [DashboardEnhancementController::class, 'corporateSummary']);
    Route::get('/dashboard/notifications', [DashboardEnhancementController::class, 'notifications']);
    Route::get('/dashboard/central-search', [DashboardEnhancementController::class, 'centralSearch']);
    Route::get('/dashboard/widget-preferences', [DashboardEnhancementController::class, 'widgetPreferences'])->name('dashboard.widget-preferences');
    Route::post('/dashboard/widget-preferences', [DashboardEnhancementController::class, 'saveWidgetPreferences'])->name('dashboard.widget-preferences.save');
    Route::get('/dashboard/stage1-state', [DashboardEnhancementController::class, 'stage1State'])->name('dashboard.stage1-state');
    Route::post('/dashboard/stage1-state', [DashboardEnhancementController::class, 'saveStage1State'])->name('dashboard.stage1-state.save');
    Route::get('/dashboard/theme/effective', [DashboardThemeController::class, 'effective']);
    Route::get('/dashboard/theme/manage', [DashboardThemeController::class, 'manage']);
    Route::post('/dashboard/theme/drafts', [DashboardThemeController::class, 'saveDraft']);
    Route::post('/dashboard/theme/{version}/publish', [DashboardThemeController::class, 'publish']);
    Route::post('/dashboard/theme/{version}/rollback', [DashboardThemeController::class, 'rollback']);

    /* Dashboard Final: live targets, customer support, staff chat, bulletin and business health */
    Route::get('/dashboard/action-summary', [DashboardOperatingController::class, 'actionSummary']);
    Route::get('/dashboard/welcome', [DashboardOperatingController::class, 'welcome']);
    Route::post('/dashboard/welcome', [DashboardOperatingController::class, 'saveWelcome']);
    Route::get('/dashboard/targets', [DashboardOperatingController::class, 'targets']);
    Route::post('/dashboard/targets', [DashboardOperatingController::class, 'saveTargets']);
    Route::get('/dashboard/business-health', [DashboardOperatingController::class, 'businessHealth']);

    Route::get('/customer-support/search', [CustomerSupportController::class, 'search']);
    Route::get('/customer-support/customers/{customer}', [CustomerSupportController::class, 'show']);

    Route::get('/staff-chat/users', [DashboardOperatingController::class, 'chatUsers']);
    Route::get('/staff-chat/threads', [DashboardOperatingController::class, 'chatThreads']);
    Route::post('/staff-chat/threads', [DashboardOperatingController::class, 'createChatThread']);
    Route::get('/staff-chat/threads/{thread}/messages', [DashboardOperatingController::class, 'chatMessages']);
    Route::post('/staff-chat/threads/{thread}/messages', [DashboardOperatingController::class, 'sendChatMessage']);
    Route::get('/staff-chat/threads/{thread}/messages/{message}/attachments/{attachment}', [DashboardOperatingController::class, 'downloadChatAttachment']);
    Route::get('/staff-chat/threads/{thread}/presence', [DashboardOperatingController::class, 'chatPresence']);
    Route::post('/staff-chat/threads/{thread}/presence', [DashboardOperatingController::class, 'chatPresence']);
    Route::post('/staff-chat/presence', [DashboardOperatingController::class, 'chatPresence']);

    Route::get('/business-bulletins', [DashboardOperatingController::class, 'bulletins']);
    Route::post('/business-bulletins', [DashboardOperatingController::class, 'saveBulletin']);
    Route::put('/business-bulletins/{bulletin}', [DashboardOperatingController::class, 'saveBulletin']);
    Route::post('/business-bulletins/{bulletin}/read', [DashboardOperatingController::class, 'readBulletin']);
    Route::get('/business-bulletins/{bulletin}/attachment', [DashboardOperatingController::class, 'downloadBulletinAttachment']);


    /*
    |--------------------------------------------------------------------------
    | Corporate Settings, Invoice Design, Communication, SEO/Tracking, Barcode
    |--------------------------------------------------------------------------
    */
    Route::get('/corporate-settings', [CorporateSettingsController::class, 'index']);
    Route::get('/corporate-settings/{section}', [CorporateSettingsController::class, 'show']);
    Route::post('/corporate-settings/{section}', [CorporateSettingsController::class, 'update']);
    Route::get('/tracking-integrations', [CorporateSettingsController::class, 'trackingIndex']);
    Route::post('/tracking-integrations', [CorporateSettingsController::class, 'trackingStore']);
    Route::put('/tracking-integrations/{trackingIntegration}', [CorporateSettingsController::class, 'trackingUpdate']);
    Route::delete('/tracking-integrations/{trackingIntegration}', [CorporateSettingsController::class, 'trackingDestroy']);

    Route::get('/barcode-tools/settings', [BarcodeToolController::class, 'settings'])->middleware('release.permission:barcode,view');
    Route::post('/barcode-tools/settings', [BarcodeToolController::class, 'updateSettings'])->middleware('release.permission:barcode,edit');
    Route::get('/barcode-tools/search', [BarcodeToolController::class, 'search'])->middleware('release.permission:barcode,search');
    Route::post('/barcode-tools/update-barcodes', [BarcodeToolController::class, 'updateBarcodes'])->middleware('release.permission:barcode,edit');
    Route::post('/barcode-tools/print-data', [BarcodeToolController::class, 'printData'])->middleware('release.permission:barcode,print');
    Route::post('/barcode-tools/log-v2', [BarcodeToolController::class, 'logPrint'])
        ->middleware('release.permission:barcode,print');

    Route::apiResource('google-posts', GooglePostController::class);
    Route::get('/google-business/status', [\App\Http\Controllers\Api\GoogleBusinessController::class, 'status']);
    Route::get('/google-business/authorize', [\App\Http\Controllers\Api\GoogleBusinessController::class, 'authorize']);
    Route::delete('/google-business/connection', [\App\Http\Controllers\Api\GoogleBusinessController::class, 'disconnect']);
    Route::get('/google-business/accounts', [\App\Http\Controllers\Api\GoogleBusinessController::class, 'accounts']);
    Route::get('/google-business/locations', [\App\Http\Controllers\Api\GoogleBusinessController::class, 'locations']);
    Route::post('/google-business/location', [\App\Http\Controllers\Api\GoogleBusinessController::class, 'selectLocation']);
    Route::post('/google-business/posts', [\App\Http\Controllers\Api\GoogleBusinessController::class, 'publish']);

    /*
    |--------------------------------------------------------------------------
    | EMI, Bookings/Preorders, Coupons, Messages, Communications
    |--------------------------------------------------------------------------
    */
    Route::get('/emi-banks/calculate', [EmiController::class, 'calculate'])->middleware('release.permission:emi,view');
    Route::get('/emi-banks', [EmiController::class, 'index'])->middleware('release.permission:emi,view');
    Route::post('/emi-banks', [EmiController::class, 'store'])->middleware('release.permission:emi,create');
    Route::match(['put', 'patch'], '/emi-banks/{emiBank}', [EmiController::class, 'update'])->middleware('release.permission:emi,edit');
    Route::delete('/emi-banks/{emiBank}', [EmiController::class, 'destroy'])->middleware('release.permission:emi,delete');

    Route::get('/bookings', [BookingPreorderController::class, 'index'])->middleware('release.permission:preorder,view');
    Route::post('/bookings', [BookingPreorderController::class, 'store'])->middleware('release.permission:preorder,create');
    Route::get('/bookings/{bookingPreorder}', [BookingPreorderController::class, 'show'])->middleware('release.permission:preorder,view');
    Route::match(['put', 'patch'], '/bookings/{bookingPreorder}', [BookingPreorderController::class, 'update'])->middleware('release.permission:preorder,edit');
    Route::post('/bookings/{bookingPreorder}/status', [BookingPreorderController::class, 'status'])->middleware('release.permission:preorder,change_status');

    Route::get('/coupons/validate', [CouponController::class, 'validateCoupon'])->middleware('release.permission:coupon,view');
    Route::get('/coupons', [CouponController::class, 'index'])->middleware('release.permission:coupon,view');
    Route::post('/coupons', [CouponController::class, 'store'])->middleware('release.permission:coupon,create');
    Route::match(['put', 'patch'], '/coupons/{coupon}', [CouponController::class, 'update'])->middleware('release.permission:coupon,edit');
    Route::delete('/coupons/{coupon}', [CouponController::class, 'destroy'])->middleware('release.permission:coupon,delete');

    Route::get('/customer-messages', [UnifiedCustomerMessageController::class, 'index']);
    Route::post('/customer-messages', [UnifiedCustomerMessageController::class, 'store']);
    Route::get('/customer-messages/{customerMessage}', [UnifiedCustomerMessageController::class, 'show']);
    Route::post('/customer-messages/{customerMessage}/reply', [UnifiedCustomerMessageController::class, 'reply']);
    Route::post('/customer-messages/{customerMessage}/close', [UnifiedCustomerMessageController::class, 'close']);

    Route::get('/communications/logs', [MarketingCommunicationController::class, 'logs']);
    Route::post('/communications/send-manual', [MarketingCommunicationController::class, 'sendManual']);
    Route::post('/communications/send-bulk', [MarketingCommunicationController::class, 'sendBulk']);
    Route::post('/sales/{sale}/send-invoice', [MarketingCommunicationController::class, 'sendInvoice'])->middleware('release.permission:invoice,send');
    Route::get('/sales/{sale}/invoice-data', [InvoicePublicController::class, 'protectedShow'])->middleware('release.permission:invoice,view');
    Route::get('/sales/{sale}/invoice-pdf', [InvoicePublicController::class, 'protectedPdf'])->middleware('release.permission:invoice,print');

    Route::post('/device-units/{deviceUnit}/warranty', [WarrantyPublicController::class, 'updateDeviceWarranty'])->middleware('release.permission:service_status,edit');


    /*
    |--------------------------------------------------------------------------
    | System Health / Final QA
    |--------------------------------------------------------------------------
    */

    Route::get('/system-health', [SystemHealthController::class, 'index']);
    Route::get('/system-health/export', [SystemHealthController::class, 'export']);
    Route::post('/system-health/repair', [SystemHealthController::class, 'repair']);

    /*
    |--------------------------------------------------------------------------
    | Audit Logs / Activity History
    |--------------------------------------------------------------------------
    */

    Route::get('/audit-logs/summary', [AuditLogController::class, 'summary']);
    Route::get('/audit-logs', [AuditLogController::class, 'index']);

    /*
    |--------------------------------------------------------------------------
    | User, Role, Permission Management
    |--------------------------------------------------------------------------
    */

    Route::get('/users/options', [UserController::class, 'options']);
    Route::post('/users/{user}/reset-password', [UserController::class, 'resetPassword']);
    Route::get('/users/{user}/access-control', [AccessControlController::class, 'show']);
    Route::post('/users/{user}/access-control', [AccessControlController::class, 'update']);
    Route::apiResource('users', UserController::class);

    Route::get('/roles/all', [RoleController::class, 'all']);
    Route::apiResource('roles', RoleController::class);

    Route::get('/permissions/all', [PermissionController::class, 'all']);
    Route::apiResource('permissions', PermissionController::class);

    /*
    |--------------------------------------------------------------------------
    | Branch Management
    |--------------------------------------------------------------------------
    */

    Route::get('/branches/all', [BranchController::class, 'all']);
    Route::apiResource('branches', BranchController::class)->except(['destroy']);

    Route::get('/branches/{branch}/stock', [BranchStockController::class, 'branchStock'])->middleware('release.permission:device_stock,view');
    Route::get('/branches/{branch}/products', [BranchStockController::class, 'branchProducts'])->middleware('release.permission:device_stock,view');
    Route::post('/branches/{branch}/assign-stock', [BranchStockController::class, 'assignStock'])->middleware('release.permission:stock_transfer,create');

    Route::put('/branch-stocks/{branchStock}', [BranchStockController::class, 'updateStock'])->middleware('release.permission:stock_adjustment,edit');

    /*
    |--------------------------------------------------------------------------
    | Branch Stock Request
    |--------------------------------------------------------------------------
    */


    /*
    |--------------------------------------------------------------------------
    | Product Management
    |--------------------------------------------------------------------------
    */

    Route::get('/categories/all', [CategoryController::class, 'all'])->middleware('release.permission:catalog,view');
    Route::get('/categories', [CategoryController::class, 'index'])->middleware('release.permission:catalog,view');
    Route::post('/categories', [CategoryController::class, 'store'])->middleware('release.permission:catalog,create');
    Route::get('/categories/{category}', [CategoryController::class, 'show'])->middleware('release.permission:catalog,view');
    Route::match(['put', 'patch'], '/categories/{category}', [CategoryController::class, 'update'])->middleware('release.permission:catalog,edit');

    Route::get('/brands/all', [BrandController::class, 'all'])->middleware('release.permission:catalog,view');
    Route::get('/brands', [BrandController::class, 'index'])->middleware('release.permission:catalog,view');
    Route::get('/brands/logo-suggestion', [BrandController::class, 'logoSuggestion'])->middleware('release.permission:catalog,edit');
    Route::post('/brands', [BrandController::class, 'store'])->middleware('release.permission:catalog,create');
    Route::get('/brands/{brand}', [BrandController::class, 'show'])->middleware('release.permission:catalog,view');
    Route::match(['put', 'patch'], '/brands/{brand}', [BrandController::class, 'update'])->middleware('release.permission:catalog,edit');

    Route::get('/products/all', [ProductController::class, 'all'])->middleware('release.permission:products,view');
    Route::get('/products', [ProductController::class, 'index'])->middleware('release.permission:products,view');
    Route::post('/products', [ProductController::class, 'store'])->middleware('release.permission:products,create');
    Route::get('/products/{product}/variants/options', [ProductVariantController::class, 'options'])->middleware('release.permission:variants,view');
    Route::get('/products/{product}', [ProductController::class, 'show'])->middleware('release.permission:products,view');
    Route::match(['put', 'patch'], '/products/{product}', [ProductController::class, 'update'])->middleware('release.permission:products,edit');

    Route::get('/product-variants', [ProductVariantController::class, 'index'])->middleware('release.permission:variants,view');
    Route::post('/product-variants', [ProductVariantController::class, 'store'])->middleware('release.permission:variants,create');
    Route::get('/product-variants/{productVariant}', [ProductVariantController::class, 'show'])->middleware('release.permission:variants,view');
    Route::match(['put', 'patch'], '/product-variants/{productVariant}', [ProductVariantController::class, 'update'])->middleware('release.permission:variants,edit');
    Route::delete('/product-variants/{productVariant}', [ProductVariantController::class, 'destroy'])->middleware('release.permission:variants,delete');

    Route::get('/product-drafts', [ProductDraftController::class, 'index']);
    Route::get('/product-drafts/{draftKey}', [ProductDraftController::class, 'show']);
    Route::put('/product-drafts', [ProductDraftController::class, 'save']);
    Route::post('/product-drafts/{draftKey}/complete', [ProductDraftController::class, 'complete']);
    Route::delete('/product-drafts/{draftKey}', [ProductDraftController::class, 'destroy']);

    Route::get('/final-operations/coupon-tiers', [FinalOperationsController::class, 'couponTiers']);
    Route::post('/final-operations/coupon-tiers', [FinalOperationsController::class, 'saveCouponTier']);
    Route::put('/final-operations/coupon-tiers/{tierId}', [FinalOperationsController::class, 'saveCouponTier']);
    Route::delete('/final-operations/coupon-tiers/{tierId}', [FinalOperationsController::class, 'deleteCouponTier']);
    Route::get('/final-operations/registration-promos', [FinalOperationsController::class, 'registrationPromoCodes']);
    Route::post('/final-operations/registration-promos', [FinalOperationsController::class, 'generateRegistrationPromo']);
    Route::get('/final-operations/invoice-coupons', [FinalOperationsController::class, 'invoiceCouponHistory']);
    Route::post('/final-operations/invoice-coupons/issue', [FinalOperationsController::class, 'issueInvoiceCoupon']);
    Route::post('/final-operations/invoice-coupons/use', [FinalOperationsController::class, 'useInvoiceCoupon']);
    Route::get('/final-operations/external-preorders', [FinalOperationsController::class, 'externalPreorders']);
    Route::put('/final-operations/external-preorders/{preorderId}', [FinalOperationsController::class, 'updateExternalPreorder']);
    Route::post('/final-operations/external-preorders/{preorderId}/payment-review', [FinalOperationsController::class, 'reviewExternalPreorderPayment']);
    Route::get('/final-operations/security-settings', [FinalOperationsController::class, 'securitySettings']);
    Route::put('/final-operations/security-settings', [FinalOperationsController::class, 'saveSecuritySettings']);
    Route::get('/final-operations/security-events', [FinalOperationsController::class, 'securityEvents']);
    Route::post('/final-operations/security-events', [FinalOperationsController::class, 'reportSecurityEvent']);
    Route::post('/final-operations/security-events/{eventId}/resolve', [FinalOperationsController::class, 'resolveSecurityEvent']);
    Route::get('/final-operations/nid-verifications', [NidVerificationController::class, 'index']);
    Route::post('/final-operations/nid-verifications', [NidVerificationController::class, 'store']);
    Route::get('/final-operations/nid-verifications/config', [NidVerificationController::class, 'config']);
    Route::put('/final-operations/nid-verifications/provider', [NidVerificationController::class, 'saveProvider']);
    Route::post('/final-operations/nid-verifications/provider/token', [NidVerificationController::class, 'saveToken']);
    Route::delete('/final-operations/nid-verifications/provider/token', [NidVerificationController::class, 'clearToken']);
    Route::post('/final-operations/nid-verifications/fields', [NidVerificationController::class, 'saveField']);
    Route::put('/final-operations/nid-verifications/fields/{fieldId}', [NidVerificationController::class, 'saveField']);
    Route::delete('/final-operations/nid-verifications/fields/{fieldId}', [NidVerificationController::class, 'deleteField']);
    Route::get('/final-operations/nid-verifications/{verificationId}', [NidVerificationController::class, 'show']);
    Route::post('/final-operations/nid-verifications/{verificationId}/resume', [NidVerificationController::class, 'resume']);
    Route::post('/final-operations/nid-verifications/{verificationId}/manual-result', [NidVerificationController::class, 'manualResult']);
    Route::post('/final-operations/nid-verifications/{verificationId}/cancel', [NidVerificationController::class, 'cancel']);
    Route::get('/final-operations/sms/settings', [FinalOperationsController::class, 'smsSettings']);
    Route::put('/final-operations/sms/settings', [FinalOperationsController::class, 'saveSmsSettings']);
    Route::get('/final-operations/sms/templates', [FinalOperationsController::class, 'smsTemplates']);
    Route::post('/final-operations/sms/templates', [FinalOperationsController::class, 'saveSmsTemplate']);
    Route::put('/final-operations/sms/templates/{templateId}', [FinalOperationsController::class, 'saveSmsTemplate']);

    Route::post('/products/{product}/generate-barcode', [BarcodeController::class, 'generate'])->middleware('release.permission:barcode,create');
    Route::get('/products/{product}/barcode', [BarcodeController::class, 'show'])->middleware('release.permission:barcode,view');
    Route::post('/product-variants/{productVariant}/generate-barcode', [BarcodeController::class, 'generateVariant'])->middleware('release.permission:barcode,create');
    Route::post('/device-units/{deviceUnit}/generate-barcode', [BarcodeController::class, 'generateDeviceUnit'])->middleware('release.permission:barcode,create');

    /*
    |--------------------------------------------------------------------------
    | Customer, Customer Ledger & Supplier
    |--------------------------------------------------------------------------
    */

    Route::apiResource('customers', CustomerController::class);
    Route::post('/customers/{customer}/receive-due', [CustomerDuePaymentController::class, 'receiveDue'])->middleware('release.permission:due_collection,create');
    Route::post('/customers/{customer}/recalculate-due', [CustomerDueRecalculateController::class, 'recalculate'])->middleware('release.permission:due_collection,edit');
    Route::prefix('customer-ledgers')->group(function () {
        Route::get('/', [CustomerLedgerController::class, 'index']);
        Route::get('/{customer}', [CustomerLedgerController::class, 'show']);
    });

    Route::get('/customers/{customer}/ledger', [CustomerLedgerController::class, 'ledger']);

    Route::get('/suppliers/all', [SupplierController::class, 'all'])->middleware('release.permission:suppliers,view');
    Route::get('/suppliers/{supplier}/ledger', [SupplierLedgerController::class, 'ledger'])->middleware('release.permission:suppliers,view');
    Route::post('/suppliers/{supplier}/pay-due', [SupplierLedgerController::class, 'payDue'])->middleware('release.permission:payments,create');
    Route::post('/suppliers/{supplier}/recalculate-due', [SupplierLedgerController::class, 'recalculate'])->middleware('release.permission:suppliers,edit');
    Route::get('/suppliers', [SupplierController::class, 'index'])->middleware('release.permission:suppliers,view');
    Route::post('/suppliers', [SupplierController::class, 'store'])->middleware('release.permission:suppliers,create');
    Route::get('/suppliers/{supplier}', [SupplierController::class, 'show'])->middleware('release.permission:suppliers,view');
    Route::match(['put', 'patch'], '/suppliers/{supplier}', [SupplierController::class, 'update'])->middleware('release.permission:suppliers,edit');

    /*
    |--------------------------------------------------------------------------
    | Used / Pre-Owned Purchase
    |--------------------------------------------------------------------------
    */

    Route::get('/used-purchases/options', [UsedPurchaseController::class, 'options'])->middleware('release.permission:used_purchase,view');
    Route::get('/used-purchases/{used_purchase}/sale-preparation', [UsedPurchaseController::class, 'salePreparation'])->middleware('release.permission:used_purchase,view');
    Route::post('/used-purchases/{used_purchase}/mark-ready-for-sale', [UsedPurchaseController::class, 'markReadyForSale'])->middleware('release.permission:used_purchase,edit');
    Route::get('/used-purchases', [UsedPurchaseController::class, 'index'])->middleware('release.permission:used_purchase,view');
    Route::post('/used-purchases', [UsedPurchaseController::class, 'store'])->middleware('release.permission:used_purchase,create');
    Route::get('/used-purchases/{used_purchase}', [UsedPurchaseController::class, 'show'])->middleware('release.permission:used_purchase,view');
    Route::match(['put', 'patch'], '/used-purchases/{used_purchase}', [UsedPurchaseController::class, 'update'])->middleware('release.permission:used_purchase,edit');
    Route::delete('/used-purchases/{used_purchase}', [UsedPurchaseController::class, 'destroy'])->middleware('release.permission:used_purchase,delete');

    /*
    |--------------------------------------------------------------------------
    | Purchase / Stock In
    |--------------------------------------------------------------------------
    */

    Route::get('/purchases', [PurchaseController::class, 'index'])->middleware('release.permission:purchases,view');
    Route::post('/purchases', [PurchaseController::class, 'store'])->middleware('release.permission:purchases,create');
    Route::get('/purchases/{purchase}', [PurchaseController::class, 'show'])->middleware('release.permission:purchases,view');
    Route::match(['put', 'patch'], '/purchases/{purchase}', [PurchaseController::class, 'update'])->middleware('release.permission:purchases,edit');
    Route::delete('/purchases/{purchase}', [PurchaseController::class, 'destroy'])->middleware('release.permission:purchases,delete');
    Route::post('/purchases/{purchase}/receive', [PurchaseController::class, 'receive'])->middleware('release.permission:purchases,receive');
    Route::post('/purchases/{purchase}/cancel', [PurchaseController::class, 'cancel'])->middleware('release.permission:purchases,cancel');

    Route::get('/device-units/summary', [DeviceUnitController::class, 'summary'])->middleware('release.permission:device_stock,view');
    Route::get('/device-units', [DeviceUnitController::class, 'index'])->middleware('release.permission:device_stock,view');
    Route::get('/device-units/{deviceUnit}', [DeviceUnitController::class, 'show'])->middleware('release.permission:device_stock,view');
    Route::post('/device-units/{deviceUnit}/mark-printed', [DeviceUnitController::class, 'markPrinted'])->middleware('release.permission:barcode,print');
    Route::get('/device-units/{deviceUnit}/sale-preparation', [\App\Http\Controllers\Api\DeviceReadyForSaleController::class, 'show'])
        ->middleware('release.permission:device_stock,view');
    Route::post('/device-units/{deviceUnit}/ready-for-sale', [\App\Http\Controllers\Api\DeviceReadyForSaleController::class, 'store'])
        ->middleware('release.permission:device_stock,edit');
    Route::put('/device-units/{deviceUnit}', [DeviceUnitController::class, 'update'])->middleware('super.admin');
    Route::delete('/device-units/{deviceUnit}', [DeviceUnitController::class, 'destroy'])->middleware('super.admin');

    /*
    |--------------------------------------------------------------------------
    | POS Sale / Order
    |--------------------------------------------------------------------------
    */

    Route::get('/sales/pos-options', [SaleController::class, 'posOptions'])->middleware('release.permission:pos_sales,view');
    Route::get('/sales/customer-by-phone', [SaleController::class, 'customerByPhone'])->middleware('release.permission:pos_sales,view');
    Route::get('/sales/ready-items', [SaleController::class, 'readyItems'])->middleware('release.permission:pos_sales,view');
    Route::get('/sales/search-products', [SaleController::class, 'searchProducts'])->middleware('release.permission:pos_sales,view');
    Route::get('/sales/available-devices', [SaleController::class, 'availableDevices'])->middleware('release.permission:pos_sales,view');
    Route::get('/sales', [SaleController::class, 'index'])->middleware('release.permission:sales_list,view');
    Route::post('/sales', [SaleController::class, 'store'])->middleware('release.permission:pos_sales,create');
    Route::get('/sales/{sale}', [SaleController::class, 'show'])->middleware('release.permission:sales_list,view');
    Route::match(['put', 'patch'], '/sales/{sale}', [SaleController::class, 'update'])->middleware('release.permission:pos_sales,edit');
    Route::delete('/sales/{sale}', [SaleController::class, 'destroy'])->middleware('release.permission:pos_sales,delete');
    Route::post('/sales/{sale}/return', [SaleController::class, 'returnSale'])->middleware('release.permission:returns,create');
    Route::post('/sales/{sale}/cancel', [SaleController::class, 'cancel'])->middleware('release.permission:pos_sales,cancel');

    Route::get('/orders', [OrderController::class, 'index'])->middleware('release.permission:web_sales,view');
    Route::post('/orders', [OrderController::class, 'store'])->middleware('release.permission:web_sales,create');
    Route::get('/orders/{order}', [OrderController::class, 'show'])->middleware('release.permission:web_sales,view');
    Route::match(['put', 'patch'], '/orders/{order}', [OrderController::class, 'update'])->middleware('release.permission:web_sales,edit');
    Route::delete('/orders/{order}', [OrderController::class, 'destroy'])->middleware('release.permission:web_sales,delete');
    Route::post('/orders/{order}/confirm', [OrderController::class, 'confirm'])->middleware('release.permission:web_sales,approve');
    Route::post('/orders/{order}/cancel', [OrderController::class, 'cancel'])->middleware('release.permission:web_sales,cancel');
    Route::post('/orders/{order}/complete', [OrderController::class, 'complete'])->middleware('release.permission:web_sales,complete');
    Route::post('/orders/{order}/payment-review', [OrderController::class, 'reviewPayment'])->middleware('release.permission:payments,approve');

    /*
    |--------------------------------------------------------------------------
    | Stock Transfer
    |--------------------------------------------------------------------------
    */

    Route::get('/stock-transfers', [StockTransferRequestController::class, 'index'])->middleware('release.permission:stock_transfer,view');
    Route::post('/stock-transfers', [StockTransferRequestController::class, 'store'])->middleware('release.permission:stock_transfer,create');
    Route::get('/stock-transfers/{stockTransferRequest}', [StockTransferRequestController::class, 'show'])->middleware('release.permission:stock_transfer,view');
    Route::post('/stock-transfers/{stockTransferRequest}/approve', [StockTransferRequestController::class, 'approve'])->middleware('release.permission:stock_transfer,approve');
    Route::post('/stock-transfers/{stockTransferRequest}/reject', [StockTransferRequestController::class, 'reject'])->middleware('release.permission:stock_transfer,reject');
    Route::post('/stock-transfers/{stockTransferRequest}/assign', [StockTransferRequestController::class, 'assign'])->middleware('release.permission:stock_transfer,approve');
    Route::post('/stock-transfers/{stockTransferRequest}/receive', [StockTransferRequestController::class, 'receive'])->middleware('release.permission:stock_transfer,receive');
    Route::post('/stock-transfers/{stockTransferRequest}/cancel', [StockTransferRequestController::class, 'cancel'])->middleware('release.permission:stock_transfer,cancel');


    // Transaction routes
    Route::get('/inventory/overview', [InventoryController::class, 'overview'])->middleware('release.permission:device_stock,view');
    Route::get('/inventory/branches', [InventoryController::class, 'branches'])->middleware('release.permission:device_stock,view');
    Route::get('/inventory/low-stock', [InventoryController::class, 'lowStock'])->middleware('release.permission:device_stock,view');
    Route::get('/inventory/movements', [InventoryController::class, 'movements'])->middleware('release.permission:device_stock,view');
    Route::get('/inventory/reconciliation', [InventoryController::class, 'reconciliation'])->middleware('release.permission:stock_adjustment,view');
    Route::post('/inventory/reconcile', [InventoryController::class, 'reconcile'])->middleware('release.permission:stock_adjustment,post');
    Route::patch('/inventory/branch-stocks/{branchStock}/threshold', [InventoryController::class, 'updateThreshold'])->middleware('release.permission:stock_adjustment,edit');
    Route::patch('/inventory/device-units/{deviceUnit}/status', [InventoryController::class, 'updateDeviceStatus'])->middleware('release.permission:device_stock,edit');

    Route::get('/stock-adjustments', [StockAdjustmentController::class, 'index'])->middleware('release.permission:stock_adjustment,view');
    Route::post('/stock-adjustments', [StockAdjustmentController::class, 'store'])->middleware('release.permission:stock_adjustment,create');
    Route::get('/stock-adjustments/{stockAdjustment}', [StockAdjustmentController::class, 'show'])->middleware('release.permission:stock_adjustment,view');
    Route::put('/stock-adjustments/{stockAdjustment}', [StockAdjustmentController::class, 'update'])->middleware('release.permission:stock_adjustment,edit');
    Route::post('/stock-adjustments/{stockAdjustment}/post', [StockAdjustmentController::class, 'post'])->middleware('release.permission:stock_adjustment,post');
    Route::post('/stock-adjustments/{stockAdjustment}/reverse', [StockAdjustmentController::class, 'reverse'])->middleware('release.permission:stock_adjustment,reverse');

    Route::get('/exchanges', [ExchangeController::class, 'index'])->middleware('release.permission:exchange,view');
    Route::post('/exchanges', [ExchangeController::class, 'store'])->middleware('release.permission:exchange,create');
    Route::post('/cash-exchanges', [\App\Http\Controllers\Api\CashExchangeController::class, 'store'])
        ->middleware('release.permission:exchange,create');
    Route::get('/exchanges/{exchange}', [ExchangeController::class, 'show'])->middleware('release.permission:exchange,view');
    Route::get('/sales/{sale}/exchange-options', [ExchangeController::class, 'options'])->middleware('release.permission:exchange,view');

    Route::get('/deliveries', [DeliveryController::class, 'index'])->middleware('release.permission:delivery,view');
    Route::get('/orders/{order}/delivery', [DeliveryController::class, 'show'])->middleware('release.permission:delivery,view');
    Route::post('/orders/{order}/delivery', [DeliveryController::class, 'update'])->middleware('release.permission:delivery,change_status');

    /* NST Delivery API Manager */
    Route::get('/delivery-gateways/enabled', [DeliveryGatewayController::class, 'enabled'])
        ->middleware('release.permission:delivery,view');
    Route::get('/delivery-gateways/shipments', [DeliveryGatewayController::class, 'shipments'])
        ->middleware('release.permission:delivery,view');
    Route::post('/orders/{order}/courier-shipment', [DeliveryGatewayController::class, 'createShipment'])
        ->middleware('release.permission:delivery,change_status');
    Route::post('/delivery-gateways/shipments/{shipment}/sync', [DeliveryGatewayController::class, 'syncShipment'])
        ->middleware('release.permission:delivery,change_status');

    Route::middleware('super.admin')->prefix('delivery-gateways')->group(function () {
        Route::get('/', [DeliveryGatewayController::class, 'index']);
        Route::post('/', [DeliveryGatewayController::class, 'store']);
        Route::put('/{provider}', [DeliveryGatewayController::class, 'update']);
        Route::delete('/{provider}', [DeliveryGatewayController::class, 'destroy']);
        Route::post('/{provider}/test', [DeliveryGatewayController::class, 'test']);
    });
    Route::get('/orders/{order}/timeline', [OrderTimelineController::class, 'staff'])->middleware('release.permission:customer_order_timeline,view');


    /*
    |--------------------------------------------------------------------------
    | Warranty / Service Center
    |--------------------------------------------------------------------------
    */

    Route::get('/warranty-services/summary', [WarrantyServiceController::class, 'summary'])->middleware('release.permission:service_status,view');
    Route::get('/warranty-services/search-devices', [WarrantyServiceController::class, 'searchDevices'])->middleware('release.permission:service_status,search');
    Route::get('/warranty-services', [WarrantyServiceController::class, 'index'])->middleware('release.permission:service_status,view');
    Route::post('/warranty-services', [WarrantyServiceController::class, 'store'])->middleware('release.permission:service_status,create');
    Route::get('/warranty-services/{warrantyService}', [WarrantyServiceController::class, 'show'])->middleware('release.permission:service_status,view');
    Route::put('/warranty-services/{warrantyService}', [WarrantyServiceController::class, 'update'])->middleware('release.permission:service_status,edit');
    Route::post('/warranty-services/{warrantyService}/status', [WarrantyServiceController::class, 'updateStatus'])->middleware('release.permission:service_status,change_status');
    Route::post('/warranty-services/{warrantyService}/receive-payment', [WarrantyServiceController::class, 'receivePayment'])->middleware('release.permission:payments,create');

    /*
    |--------------------------------------------------------------------------
    | Accounts Cashbook / Due Center
    |--------------------------------------------------------------------------
    */

    Route::prefix('accounts')->middleware('financial.view:accounts')->group(function () {
        Route::get('/cashbook', [AccountsController::class, 'cashbook']);
        Route::get('/due-center', [AccountsController::class, 'dueCenter']);
    });

    /*
    |--------------------------------------------------------------------------
    | Expense
    |--------------------------------------------------------------------------
    */

    Route::apiResource('expenses', ExpenseController::class)->middleware('financial.view:expenses');

    /*
    |--------------------------------------------------------------------------
    | Bulk Upload
    |--------------------------------------------------------------------------
    */

    Route::get('/bulk-upload/types', [BulkUploadController::class, 'supportedTypes']);
    Route::get('/bulk-upload/template/{type}', [BulkUploadController::class, 'downloadTemplate']);
    Route::post('/bulk-upload/{type}', [BulkUploadController::class, 'import']);

    /*
    |--------------------------------------------------------------------------
    | Reports
    |--------------------------------------------------------------------------
    */

    Route::prefix('reports')->middleware('financial.view:reports')->group(function () {
        Route::get('/export', [ReportExportController::class, 'export']);
        Route::get('/summary', [ReportController::class, 'summary']);
        Route::get('/sales', [ReportController::class, 'sales']);
        Route::get('/purchases', [ReportController::class, 'purchases']);
        Route::get('/stock', [ReportController::class, 'stock']);
        Route::get('/profit-loss', [ReportController::class, 'profitLoss']);
        Route::get('/branch-wise', [ReportController::class, 'branchWise']);
        Route::get('/customer-due', [ReportController::class, 'customerDue']);
        Route::get('/supplier-due', [ReportController::class, 'supplierDue']);
        Route::get('/expenses', [ReportController::class, 'expenses']);
    });

    /*
    |--------------------------------------------------------------------------
    | SSLCommerz Payment Init
    |--------------------------------------------------------------------------
    */


    /*
    |--------------------------------------------------------------------------
    | Settings / Backup / Data Export
    |--------------------------------------------------------------------------
    */

    Route::get('/settings', [SettingsController::class, 'index']);
    Route::post('/settings', [SettingsController::class, 'update'])->middleware('super.admin');

    Route::prefix('data-maintenance')->middleware('super.admin')->group(function () {
        Route::get('/overview', [DataMaintenanceController::class, 'overview']);
        Route::post('/backup', [DataMaintenanceController::class, 'createBackup']);
        Route::get('/backups/{file}/download', [DataMaintenanceController::class, 'downloadBackup']);
        Route::delete('/backups/{file}', [DataMaintenanceController::class, 'deleteBackup']);
        Route::get('/export-csv', [DataMaintenanceController::class, 'exportCsv']);
        Route::get('/export-table', [DataMaintenanceController::class, 'exportTable']);
        Route::get('/danger-zone/options', [DataMaintenanceController::class, 'dangerOptions']);
        Route::post('/danger-zone/clean-business-data', [DataMaintenanceController::class, 'cleanBusinessData']);
    });

    /*
    |--------------------------------------------------------------------------
    | Super Admin Only Delete Routes
    |--------------------------------------------------------------------------
    */

    Route::middleware('super.admin')->group(function () {
        Route::delete('/branches/{branch}', [BranchController::class, 'destroy']);
        Route::delete('/products/{product}', [ProductController::class, 'destroy']);
        Route::delete('/categories/{category}', [CategoryController::class, 'destroy']);
        Route::delete('/brands/bulk-delete', [BrandController::class, 'bulkDestroy']);
        Route::delete('/brands/{brand}', [BrandController::class, 'destroy']);
        Route::delete('/suppliers/{supplier}', [SupplierController::class, 'destroy']);

        Route::delete('/branch-stocks/{branchStock}', [BranchStockController::class, 'removeStock'])->middleware('release.permission:stock_adjustment,delete');
        Route::delete('/bulk-delete/{type}', [BulkActionController::class, 'delete']);
    });

});

// Public system UI settings
Route::get('/public/system-ui-settings', [SettingsController::class, 'publicAppearance']);

// Browser tamper guard
Route::get('/public/tamper-guard', [\App\Http\Controllers\Api\TamperGuardController::class, 'config'])->middleware('throttle:60,1');
Route::post('/public/tamper-guard/report', [\App\Http\Controllers\Api\TamperGuardController::class, 'report'])->middleware('throttle:30,1');
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->group(function () {
    Route::get('/security/tamper-guard-settings', [\App\Http\Controllers\Api\TamperGuardController::class, 'settings']);
    Route::put('/security/tamper-guard-settings', [\App\Http\Controllers\Api\TamperGuardController::class, 'saveSettings']);
});

// NST Media Library routes
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->get('/media-library/images', [\App\Http\Controllers\Api\MediaLibraryController::class, 'images']);
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->delete('/media-library/images/delete', [\App\Http\Controllers\Api\MediaLibraryController::class, 'destroyPhysical']);

// NST Variant Image Manager routes
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->get('/products/{product}/variant-image-matrix', [\App\Http\Controllers\Api\VariantImageManagerController::class, 'productMatrix']);
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->get('/product-variants/{variant}/images', [\App\Http\Controllers\Api\VariantImageManagerController::class, 'variantImages']);
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->post('/product-variants/{variant}/images/link', [\App\Http\Controllers\Api\VariantImageManagerController::class, 'linkToVariant']);
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->post('/product-variants/{variant}/images/upload', [\App\Http\Controllers\Api\VariantImageManagerController::class, 'uploadToVariant']);
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->delete('/product-variants/{variant}/images/unlink', [\App\Http\Controllers\Api\VariantImageManagerController::class, 'unlinkFromVariant']);
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->post('/product-variants/bulk/images/link', [\App\Http\Controllers\Api\VariantImageManagerController::class, 'bulkLink']);



// NST eCommerce Product Sync routes
Route::get('/site/website/home', [\App\Http\Controllers\Api\SiteProductSyncController::class, 'home']);
Route::get('/public/website/home', [\App\Http\Controllers\Api\SiteProductSyncController::class, 'home']);
Route::get('/public/home-feed', [\App\Http\Controllers\Api\HomeFeedController::class, 'index'])->middleware('throttle:120,1');

Route::get('/site/products/slug/{slug}', [\App\Http\Controllers\Api\SiteProductSyncController::class, 'bySlug']);
Route::get('/site/products/{product}', [\App\Http\Controllers\Api\SiteProductSyncController::class, 'show']);
Route::get('/site/products', [\App\Http\Controllers\Api\SiteProductSyncController::class, 'index']);

Route::get('/public/products/slug/{slug}', [\App\Http\Controllers\Api\SiteProductSyncController::class, 'bySlug']);
Route::get('/public/products/{product}', [\App\Http\Controllers\Api\SiteProductSyncController::class, 'show']);
Route::get('/public/products', [\App\Http\Controllers\Api\SiteProductSyncController::class, 'index']);
// End NST eCommerce Product Sync routes

// Customer product suggestions
\Illuminate\Support\Facades\Route::get('site/products/slug/{slug}/suggestions', [\App\Http\Controllers\Api\Site\ProductSuggestionController::class, 'bySlug']);
\Illuminate\Support\Facades\Route::get('public/products/slug/{slug}/suggestions', [\App\Http\Controllers\Api\Site\ProductSuggestionController::class, 'bySlug']);

// Device History API
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class, 'release.permission:device_history,search'])->get('pos/device-history/search', [\App\Http\Controllers\Api\Pos\DeviceHistoryController::class, 'search']);

// POS delivery core routes
\Illuminate\Support\Facades\Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->group(function () {
    \Illuminate\Support\Facades\Route::get('pos/profile-v27', [\App\Http\Controllers\Api\Pos\PosV27Controller::class, 'profile']);
    \Illuminate\Support\Facades\Route::post('pos/profile-v27', [\App\Http\Controllers\Api\Pos\PosV27Controller::class, 'updateProfile']);
    \Illuminate\Support\Facades\Route::post('pos/2fa/setup-v27', [\App\Http\Controllers\Api\Pos\PosV27Controller::class, 'twoFactorSetup']);
    \Illuminate\Support\Facades\Route::post('pos/2fa/confirm-v27', [\App\Http\Controllers\Api\Pos\PosV27Controller::class, 'twoFactorConfirm']);
    \Illuminate\Support\Facades\Route::post('pos/2fa/disable-v27', [\App\Http\Controllers\Api\Pos\PosV27Controller::class, 'twoFactorDisable']);
    \Illuminate\Support\Facades\Route::get('pos/adaptive-access/options-v27', [\App\Http\Controllers\Api\Pos\PosV27Controller::class, 'accessOptions']);
    \Illuminate\Support\Facades\Route::get('pos/adaptive-access/rules-v27', [\App\Http\Controllers\Api\Pos\PosV27Controller::class, 'accessRules']);
    \Illuminate\Support\Facades\Route::post('pos/adaptive-access/rules-v27', [\App\Http\Controllers\Api\Pos\PosV27Controller::class, 'saveAccessRules']);
});

// POS recovery routes
\Illuminate\Support\Facades\Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class, 'audit.log'])->group(function () {
    \Illuminate\Support\Facades\Route::get('pos/profile-v28', [\App\Http\Controllers\Api\Pos\PosV28Controller::class, 'profile']);
    \Illuminate\Support\Facades\Route::post('pos/profile-v28', [\App\Http\Controllers\Api\Pos\PosV28Controller::class, 'updateProfile']);

    \Illuminate\Support\Facades\Route::get('pos/2fa/status-v28', [\App\Http\Controllers\Api\Pos\PosV28Controller::class, 'twoFactorStatus']);
    \Illuminate\Support\Facades\Route::post('pos/2fa/setup-v28', [\App\Http\Controllers\Api\Pos\PosV28Controller::class, 'twoFactorSetup']);
    \Illuminate\Support\Facades\Route::post('pos/2fa/confirm-v28', [\App\Http\Controllers\Api\Pos\PosV28Controller::class, 'twoFactorConfirm']);
    \Illuminate\Support\Facades\Route::post('pos/2fa/disable-v28', [\App\Http\Controllers\Api\Pos\PosV28Controller::class, 'twoFactorDisable']);

    \Illuminate\Support\Facades\Route::get('pos/adaptive-access/options-v28', [\App\Http\Controllers\Api\Pos\PosV28Controller::class, 'accessOptions']);
    \Illuminate\Support\Facades\Route::get('pos/adaptive-access/rules-v28', [\App\Http\Controllers\Api\Pos\PosV28Controller::class, 'accessRules']);
    \Illuminate\Support\Facades\Route::post('pos/adaptive-access/rules-v28', [\App\Http\Controllers\Api\Pos\PosV28Controller::class, 'saveAccessRules']);

    \Illuminate\Support\Facades\Route::get('pos/device-history/search-v28', [\App\Http\Controllers\Api\Pos\PosV28Controller::class, 'deviceHistorySearch'])->middleware('release.permission:device_history,search');
});

// Main POS routes
\Illuminate\Support\Facades\Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class, 'audit.log'])->group(function () {
    \Illuminate\Support\Facades\Route::get('pos/main/profile', [\App\Http\Controllers\Api\Pos\PosV28MainController::class, 'profile']);
    \Illuminate\Support\Facades\Route::post('pos/main/profile', [\App\Http\Controllers\Api\Pos\PosV28MainController::class, 'updateProfile']);

    \Illuminate\Support\Facades\Route::get('pos/main/device-history/search', [\App\Http\Controllers\Api\Pos\PosV28MainController::class, 'deviceHistory'])->middleware('release.permission:device_history,search');

    \Illuminate\Support\Facades\Route::get('pos/main/2fa/status', [\App\Http\Controllers\Api\Pos\PosV28MainController::class, 'twoFactorStatus']);
    \Illuminate\Support\Facades\Route::post('pos/main/2fa/setup', [\App\Http\Controllers\Api\Pos\PosV28MainController::class, 'twoFactorSetup']);
    \Illuminate\Support\Facades\Route::post('pos/main/2fa/confirm', [\App\Http\Controllers\Api\Pos\PosV28MainController::class, 'twoFactorConfirm']);
    \Illuminate\Support\Facades\Route::post('pos/main/2fa/disable', [\App\Http\Controllers\Api\Pos\PosV28MainController::class, 'twoFactorDisable']);

    \Illuminate\Support\Facades\Route::get('pos/main/access/options', [\App\Http\Controllers\Api\Pos\PosV28MainController::class, 'accessOptions']);
    \Illuminate\Support\Facades\Route::get('pos/main/access/rules', [\App\Http\Controllers\Api\Pos\PosV28MainController::class, 'accessRules']);
    \Illuminate\Support\Facades\Route::post('pos/main/access/rules', [\App\Http\Controllers\Api\Pos\PosV28MainController::class, 'saveAccessRules']);
});


/* Website builder routes */
\Illuminate\Support\Facades\Route::get('/website-builder/published', [\App\Http\Controllers\Api\WebsiteBuilderController::class, 'published']);
\Illuminate\Support\Facades\Route::get('/website-builder/page', [\App\Http\Controllers\Api\WebsiteBuilderController::class, 'publishedPage']);
\Illuminate\Support\Facades\Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->prefix('website-builder')->group(function () {
    \Illuminate\Support\Facades\Route::get('/draft', [\App\Http\Controllers\Api\WebsiteBuilderController::class, 'draft']);
    \Illuminate\Support\Facades\Route::put('/draft', [\App\Http\Controllers\Api\WebsiteBuilderController::class, 'saveDraft']);
    \Illuminate\Support\Facades\Route::post('/publish', [\App\Http\Controllers\Api\WebsiteBuilderController::class, 'publish']);
    \Illuminate\Support\Facades\Route::post('/assets', [\App\Http\Controllers\Api\WebsiteBuilderController::class, 'uploadAsset'])->middleware('throttle:30,1');
    \Illuminate\Support\Facades\Route::get('/revisions', [\App\Http\Controllers\Api\WebsiteBuilderController::class, 'revisions']);
    \Illuminate\Support\Facades\Route::post('/rollback/{revisionId}', [\App\Http\Controllers\Api\WebsiteBuilderController::class, 'rollback']);
    \Illuminate\Support\Facades\Route::delete('/revisions/{revisionId}', [\App\Http\Controllers\Api\WebsiteBuilderController::class, 'deleteRevision']);
});


// Public chatbox live sync
Route::get('/public/chatbox/settings', [PublicChatboxController::class, 'settings']);
Route::post('/public/chatbox/start', [PublicChatboxController::class, 'start'])->middleware('throttle:10,1');
Route::get('/public/chatbox/thread/{messageId}', [PublicChatboxController::class, 'show'])->middleware('throttle:60,1');
Route::post('/public/chatbox/thread/{messageId}/reply', [PublicChatboxController::class, 'visitorReply'])->middleware('throttle:30,1');

Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->group(function () {
    Route::get('/chatbox/settings', [PublicChatboxController::class, 'adminSettings']);
    Route::post('/chatbox/settings', [PublicChatboxController::class, 'updateSettings'])->middleware('role.access:super_admin,admin');
    Route::post('/customer-messages/{messageId}/trash', [PublicChatboxController::class, 'trash']);
    Route::post('/customer-messages/{messageId}/restore', [PublicChatboxController::class, 'restore']);
});

// Customer message actions
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class])->group(function () {
    Route::delete('/customer-messages/{messageId}', [CustomerMessageActionController::class, 'destroy']);
    Route::post('/customer-messages/{messageId}/delete', [CustomerMessageActionController::class, 'destroy']);
    Route::post('/customer-messages/{messageId}/hard-delete', [CustomerMessageActionController::class, 'destroy']);
    Route::post('/customer-messages/{messageId}/close-ticket', [CustomerMessageActionController::class, 'close']);
    Route::patch('/customer-messages/{messageId}/status', [CustomerMessageActionController::class, 'status']);
    Route::post('/customer-messages/{messageId}/status', [CustomerMessageActionController::class, 'status']);
});









/* Enterprise commerce routes */
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsureCustomerPortalUser::class])->group(function () {
    Route::get('/portal/web-orders', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'portalOrders']);
    Route::post('/portal/preorders', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'createPreorder']);
    Route::get('/portal/preorders', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'portalPreorders']);
    Route::post('/portal/preorders/{id}/payment', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'submitPreorderPayment']);
    Route::post('/portal/preorders/{id}/cancel', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'cancelPreorder']);
});

Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class, 'audit.log'])->group(function () {
    Route::get('/web-sales', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'webSales'])->middleware('release.permission:web_sales,view');
    Route::post('/web-sales/{order}/delivery', [DeliveryController::class, 'update'])->middleware('release.permission:delivery,change_status');
    Route::post('/web-sales/{order}/authorize', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'authorizeOrder'])->middleware('release.permission:web_sales,approve');
    Route::get('/reports/web-sales', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'report'])->middleware('release.permission:web_sales,export');
    Route::post('/preorders/{id}/status', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'updatePreorderStatus'])->middleware('release.permission:preorder,change_status');
    Route::post('/barcode-tools/log', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'barcodeLog'])->middleware('release.permission:barcode,print');
    Route::get('/barcode-tools/history', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'barcodeHistory'])->middleware('release.permission:barcode,view');
    Route::get('/users-access/pages', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'accessPages'])->middleware('super.admin');
    Route::get('/users-access/options', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'accessOptions'])->middleware('super.admin');
    Route::get('/users-access/rules', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'accessRules'])->middleware('super.admin');
    Route::get('/users-access/history', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'accessHistory'])->middleware('super.admin');
    Route::post('/users-access/rules', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'saveAccessRule'])->middleware('super.admin');
    Route::get('/dashboard-access/options', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'dashboardProfileOptions'])->middleware('super.admin');
    Route::get('/dashboard-access/profiles', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'dashboardProfiles'])->middleware('super.admin');
    Route::post('/dashboard-access/profiles', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'saveDashboardProfile'])->middleware('super.admin');
    Route::get('/dashboard-access/effective', [\App\Http\Controllers\Api\NstEnterpriseCommerceController::class, 'effectiveDashboardProfile']);
});

/* App center routes */
Route::get('/public/downloads', [\App\Http\Controllers\Api\NstFileController::class, 'publicIndex']);
Route::get('/public/downloads/{file}/download', [\App\Http\Controllers\Api\NstFileController::class, 'publicDownload'])->middleware('throttle:30,1');
Route::get('/public/app-center', [\App\Http\Controllers\Api\AppCenterController::class, 'publicIndex']);
Route::get('/public/app-center/{slug}', [\App\Http\Controllers\Api\AppCenterController::class, 'publicShow']);
Route::get('/public/app-center/releases/{release}/download', [\App\Http\Controllers\Api\AppCenterController::class, 'download'])->middleware('throttle:30,1');
Route::post('/apk-builder/worker/fetch', [\App\Http\Controllers\Api\AppCenterController::class, 'workerFetch'])->middleware('throttle:10,1');
Route::post('/apk-builder/worker/{token}/complete', [\App\Http\Controllers\Api\AppCenterController::class, 'workerComplete'])->middleware('throttle:10,1');
Route::post('/apk-builder/worker/{token}/fail', [\App\Http\Controllers\Api\AppCenterController::class, 'workerFail'])->middleware('throttle:10,1');
Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class, 'audit.log'])->prefix('app-center')->group(function(){
 Route::get('/apps',[\App\Http\Controllers\Api\AppCenterController::class,'index']);
 Route::post('/apps',[\App\Http\Controllers\Api\AppCenterController::class,'store']);
 Route::put('/apps/{id}',[\App\Http\Controllers\Api\AppCenterController::class,'update']);
 Route::delete('/apps/{id}',[\App\Http\Controllers\Api\AppCenterController::class,'destroy']);
 Route::post('/apps/{app}/releases',[\App\Http\Controllers\Api\AppCenterController::class,'uploadRelease']);
 Route::patch('/releases/{id}/status',[\App\Http\Controllers\Api\AppCenterController::class,'releaseStatus']);
 Route::post('/builds',[\App\Http\Controllers\Api\AppCenterController::class,'createBuild']);
 Route::get('/builds',[\App\Http\Controllers\Api\AppCenterController::class,'builds']);
});

Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class, 'audit.log'])->prefix('downloads')->group(function () {
    Route::get('/files', [\App\Http\Controllers\Api\NstFileController::class, 'index']);
    Route::post('/files', [\App\Http\Controllers\Api\NstFileController::class, 'store']);
    Route::match(['put', 'patch'], '/files/{file}', [\App\Http\Controllers\Api\NstFileController::class, 'update']);
    Route::delete('/files/{file}', [\App\Http\Controllers\Api\NstFileController::class, 'destroy']);
    Route::delete('/files/{file}/permanent', [\App\Http\Controllers\Api\NstFileController::class, 'forceDestroy']);
});



/* CMS, HRM and operations routes */
Route::get('/public/cms/pages', [\App\Http\Controllers\Api\Stage58CmsController::class, 'publicPages'])->name('public.cms.pages');
Route::get('/public/cms/page', [\App\Http\Controllers\Api\Stage58CmsController::class, 'publicResolve'])->name('public.cms.page');

Route::middleware(['auth:sanctum', \App\Http\Middleware\EnsurePosStaff::class, 'audit.log'])->group(function () {
    Route::prefix('finance')->middleware('financial.view:finance')->group(function () {
        Route::get('/overview', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'overview'])->name('finance.overview')->middleware('release.permission:accounts,view');
        Route::get('/reference-data', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'referenceData'])->name('finance.reference-data')->middleware('release.permission:accounts,view');
        Route::get('/acceptance-status', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'acceptanceStatus'])->name('finance.acceptance-status')->middleware('release.permission:finance_reports,view');
        Route::get('/audit-history', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'auditHistory'])->name('finance.audit-history')->middleware('release.permission:finance_reports,view');
        Route::get('/accounts', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'accounts'])->name('finance.accounts')->middleware('release.permission:accounts,view');
        Route::post('/accounts', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'storeAccount'])->middleware('release.permission:accounts,create');
        Route::put('/accounts/{accountId}', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'updateAccount'])->middleware('release.permission:accounts,edit');
        Route::get('/journals', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'journals'])->name('finance.journals')->middleware('release.permission:finance_journal,view');
        Route::post('/journals', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'storeJournal'])->middleware('release.permission:finance_journal,create');
        Route::post('/journals/{journalId}/post', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'postJournal'])->middleware('release.permission:finance_journal,post');
        Route::post('/journals/{journalId}/reverse', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'reverseJournal'])->middleware('release.permission:finance_journal,reverse');
        Route::get('/expenses', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'expenses'])->name('finance.expenses')->middleware('release.permission:finance_expense,view');
        Route::post('/expenses', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'storeExpense'])->middleware('release.permission:finance_expense,create');
        Route::get('/transfers', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'transfers'])->name('finance.transfers')->middleware('release.permission:finance_transfer,view');
        Route::post('/transfers', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'storeTransfer'])->middleware('release.permission:finance_transfer,create');
        Route::get('/due-payments', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'duePayments'])->name('finance.due-payments')->middleware('release.permission:finance_due,view');
        Route::post('/due-payments', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'storeDuePayment'])->middleware('release.permission:finance_due,create');
        Route::get('/cash-sessions', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'cashSessions'])->name('finance.cash-sessions')->middleware('release.permission:cash_closing,view');
        Route::post('/cash-sessions/open', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'openCashSession'])->middleware('release.permission:cash_closing,create');
        Route::post('/cash-sessions/{sessionId}/close', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'closeCashSession'])->middleware('release.permission:cash_closing,close');
        Route::post('/cash-sessions/{sessionId}/review', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'approveCashSession'])->middleware('release.permission:cash_closing,approve');
        Route::get('/reconciliations', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'reconciliations'])->name('finance.reconciliations')->middleware('release.permission:finance_reconciliation,view');
        Route::post('/reconciliations', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'storeReconciliation'])->middleware('release.permission:finance_reconciliation,create');
        Route::post('/reconciliations/{reconciliationId}/resolve', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'resolveReconciliation'])->middleware('release.permission:finance_reconciliation,edit');
        Route::get('/reports', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'reports'])->name('finance.reports')->middleware('release.permission:finance_reports,view');
        Route::get('/reports/export', [\App\Http\Controllers\Api\Stage58FinanceController::class, 'exportReport'])->name('finance.reports.export')->middleware('release.permission:finance_reports,export');
    });

    Route::prefix('crm')->group(function () {
        Route::get('/overview', [\App\Http\Controllers\Api\Stage58CrmController::class, 'overview'])->name('crm.overview')->middleware('release.permission:crm,view');
        Route::get('/reference-data', [\App\Http\Controllers\Api\Stage58CrmController::class, 'referenceData'])->name('crm.reference-data')->middleware('release.permission:crm,view');
        Route::get('/customers', [\App\Http\Controllers\Api\Stage58CrmController::class, 'customers'])->name('crm.customers')->middleware('release.permission:crm,view');
        Route::get('/customers/export', [\App\Http\Controllers\Api\Stage58CrmController::class, 'exportCustomers'])->name('crm.customers.export')->middleware('release.permission:crm,export');
        Route::get('/customers/{customerId}/timeline', [\App\Http\Controllers\Api\Stage58CrmController::class, 'customerTimeline'])->name('crm.customers.timeline')->middleware('release.permission:crm,view');
        Route::put('/customers/{customerId}/profile', [\App\Http\Controllers\Api\Stage58CrmController::class, 'saveProfile'])->name('crm.customers.profile')->middleware('release.permission:crm,edit');
        Route::get('/leads', [\App\Http\Controllers\Api\Stage58CrmController::class, 'leads'])->name('crm.leads')->middleware('release.permission:crm_leads,view');
        Route::post('/leads', [\App\Http\Controllers\Api\Stage58CrmController::class, 'storeLead'])->name('crm.leads.store')->middleware('release.permission:crm_leads,create');
        Route::put('/leads/{leadId}', [\App\Http\Controllers\Api\Stage58CrmController::class, 'updateLead'])->name('crm.leads.update')->middleware('release.permission:crm_leads,edit');
        Route::post('/leads/{leadId}/convert', [\App\Http\Controllers\Api\Stage58CrmController::class, 'convertLead'])->name('crm.convert-lead')->middleware('release.permission:crm_leads,convert');
        Route::get('/activities', [\App\Http\Controllers\Api\Stage58CrmController::class, 'activities'])->name('crm.activities')->middleware('release.permission:crm,view');
        Route::post('/activities', [\App\Http\Controllers\Api\Stage58CrmController::class, 'storeActivity'])->name('crm.activities.store')->middleware('release.permission:crm,create');
        Route::post('/activities/{activityId}/complete', [\App\Http\Controllers\Api\Stage58CrmController::class, 'completeActivity'])->name('crm.activities.complete')->middleware('release.permission:crm,edit');
        Route::get('/loyalty', [\App\Http\Controllers\Api\Stage58CrmController::class, 'loyalty'])->name('crm.loyalty')->middleware('release.permission:crm_loyalty,view');
        Route::post('/loyalty', [\App\Http\Controllers\Api\Stage58CrmController::class, 'adjustLoyalty'])->name('crm.loyalty.adjust')->middleware('release.permission:crm_loyalty,edit');
        Route::get('/feedback', [\App\Http\Controllers\Api\Stage58CrmController::class, 'feedback'])->name('crm.feedback')->middleware('release.permission:crm_feedback,view');
        Route::post('/feedback', [\App\Http\Controllers\Api\Stage58CrmController::class, 'storeFeedback'])->name('crm.feedback.store')->middleware('release.permission:crm_feedback,create');
        Route::get('/support-cases', [\App\Http\Controllers\Api\Stage58CrmController::class, 'supportCases'])->name('crm.support-cases')->middleware('release.permission:crm_support,view');
        Route::post('/support-cases', [\App\Http\Controllers\Api\Stage58CrmController::class, 'storeSupportCase'])->name('crm.support-cases.store')->middleware('release.permission:crm_support,create');
        Route::put('/support-cases/{caseId}', [\App\Http\Controllers\Api\Stage58CrmController::class, 'updateSupportCase'])->name('crm.support-cases.update')->middleware('release.permission:crm_support,edit');
        Route::get('/segments', [\App\Http\Controllers\Api\Stage58CrmController::class, 'segments'])->name('crm.segments')->middleware('release.permission:crm_segments,view');
        Route::post('/segments', [\App\Http\Controllers\Api\Stage58CrmController::class, 'storeSegment'])->name('crm.segments.store')->middleware('release.permission:crm_segments,create');
        Route::get('/segments/{segmentId}/members', [\App\Http\Controllers\Api\Stage58CrmController::class, 'segmentMembers'])->name('crm.segments.members')->middleware('release.permission:crm_segments,view');
        Route::get('/campaigns', [\App\Http\Controllers\Api\Stage58CrmController::class, 'campaigns'])->name('crm.campaigns')->middleware('release.permission:crm_campaigns,view');
        Route::post('/campaigns', [\App\Http\Controllers\Api\Stage58CrmController::class, 'storeCampaign'])->name('crm.campaigns.store')->middleware('release.permission:crm_campaigns,create');
        Route::post('/campaigns/{campaignId}/launch', [\App\Http\Controllers\Api\Stage58CrmController::class, 'launchCampaign'])->name('crm.campaigns.launch')->middleware('release.permission:crm_campaigns,launch');
        Route::get('/campaigns/{campaignId}/audience', [\App\Http\Controllers\Api\Stage58CrmController::class, 'campaignAudience'])->name('crm.campaigns.audience')->middleware('release.permission:crm_campaigns,view');
        Route::get('/duplicates', [\App\Http\Controllers\Api\Stage58CrmController::class, 'duplicateCandidates'])->name('crm.duplicates')->middleware('release.permission:crm,view');
        Route::post('/merge-customers', [\App\Http\Controllers\Api\Stage58CrmController::class, 'mergeCustomers'])->name('crm.merge-customers')->middleware('release.permission:crm,merge');
        Route::get('/audit-history', [\App\Http\Controllers\Api\Stage58CrmController::class, 'auditHistory'])->name('crm.audit-history')->middleware('release.permission:crm,view');
        Route::get('/acceptance-status', [\App\Http\Controllers\Api\Stage58CrmController::class, 'acceptanceStatus'])->name('crm.acceptance-status')->middleware('release.permission:crm,view');
    });

    Route::prefix('hrm')->group(function () {
        Route::get('/overview', [\App\Http\Controllers\Api\Stage58HrmController::class, 'overview'])->name('hrm.overview')->middleware('release.permission:hrm,view');
        Route::get('/reference-data', [\App\Http\Controllers\Api\Stage58HrmController::class, 'referenceData'])->name('hrm.reference-data')->middleware('release.permission:hrm,view');
        Route::post('/reference-data/{type}', [\App\Http\Controllers\Api\Stage58HrmController::class, 'storeReference'])->name('hrm.reference-data.store')->middleware('release.permission:hrm,create');
        Route::put('/reference-data/{type}/{referenceId}', [\App\Http\Controllers\Api\Stage58HrmController::class, 'updateReference'])->name('hrm.reference-data.update')->middleware('release.permission:hrm,edit');
        Route::delete('/reference-data/{type}/{referenceId}', [\App\Http\Controllers\Api\Stage58HrmController::class, 'deleteReference'])->name('hrm.reference-data.delete')->middleware('release.permission:hrm,delete');
        Route::get('/employees', [\App\Http\Controllers\Api\Stage58HrmController::class, 'employees'])->name('hrm.employees')->middleware('release.permission:hrm,view');
        Route::post('/employees', [\App\Http\Controllers\Api\Stage58HrmController::class, 'storeEmployee'])->name('hrm.employees.store')->middleware('release.permission:hrm,create');
        Route::put('/employees/{employeeId}', [\App\Http\Controllers\Api\Stage58HrmController::class, 'updateEmployee'])->name('hrm.employees.update')->middleware('release.permission:hrm,edit');
        Route::get('/attendance', [\App\Http\Controllers\Api\Stage58HrmController::class, 'attendance'])->name('hrm.attendance')->middleware('release.permission:hrm_attendance,view');
        Route::post('/attendance', [\App\Http\Controllers\Api\Stage58HrmController::class, 'storeAttendance'])->name('hrm.attendance.store')->middleware('release.permission:hrm_attendance,edit');
        Route::get('/attendance-summary', [\App\Http\Controllers\Api\Stage58HrmController::class, 'attendanceSummary'])->name('hrm.attendance-summary')->middleware('release.permission:hrm_attendance,view');
        /* ZKTeco attendance devices */
        Route::get('/zkteco/status', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'status'])->name('hrm.zkteco.status')->middleware('release.permission:hrm_attendance,view');
        Route::get('/zkteco/devices', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'devices'])->name('hrm.zkteco.devices')->middleware('release.permission:hrm_attendance,view');
        Route::post('/zkteco/devices', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'storeDevice'])->name('hrm.zkteco.devices.store')->middleware('release.permission:hrm_attendance,edit');
        Route::put('/zkteco/devices/{deviceId}', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'updateDevice'])->name('hrm.zkteco.devices.update')->middleware('release.permission:hrm_attendance,edit');
        Route::get('/zkteco/mappings', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'mappings'])->name('hrm.zkteco.mappings')->middleware('release.permission:hrm_attendance,view');
        Route::post('/zkteco/mappings', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'storeMapping'])->name('hrm.zkteco.mappings.store')->middleware('release.permission:hrm_attendance,edit');
        Route::delete('/zkteco/mappings/{mappingId}', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'deleteMapping'])->name('hrm.zkteco.mappings.delete')->middleware('release.permission:hrm_attendance,edit');
        Route::get('/zkteco/events', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'events'])->name('hrm.zkteco.events')->middleware('release.permission:hrm_attendance,view');
        Route::get('/zkteco/packets', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'packets'])->name('hrm.zkteco.packets')->middleware('release.permission:hrm_attendance,view');
        Route::get('/zkteco/movements', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'movements'])->name('hrm.zkteco.movements')->middleware('release.permission:hrm_attendance,view');
        Route::get('/zkteco/report', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'report'])->name('hrm.zkteco.report')->middleware('release.permission:hrm_attendance,view');
        Route::post('/zkteco/rebuild', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'rebuild'])->name('hrm.zkteco.rebuild')->middleware('release.permission:hrm_attendance,edit');
        Route::get('/leaves', [\App\Http\Controllers\Api\Stage58HrmController::class, 'leaves'])->name('hrm.leaves')->middleware('release.permission:hrm_leave,view');
        Route::post('/leaves', [\App\Http\Controllers\Api\Stage58HrmController::class, 'storeLeave'])->name('hrm.leaves.store')->middleware('release.permission:hrm_leave,create');
        Route::post('/leaves/{leaveId}/review', [\App\Http\Controllers\Api\Stage58HrmController::class, 'reviewLeave'])->name('hrm.leaves.review')->middleware('release.permission:hrm_leave,approve');
        Route::get('/leave-balances', [\App\Http\Controllers\Api\Stage58HrmController::class, 'leaveBalances'])->name('hrm.leave-balances')->middleware('release.permission:hrm_leave,view');
        Route::get('/salary-structures', [\App\Http\Controllers\Api\Stage58HrmController::class, 'salaryStructures'])->name('hrm.salary-structures')->middleware('release.permission:payroll,view');
        Route::post('/salary-structures', [\App\Http\Controllers\Api\Stage58HrmController::class, 'storeSalaryStructure'])->name('hrm.salary-structures.store')->middleware('release.permission:payroll,edit');
        Route::get('/payroll', [\App\Http\Controllers\Api\Stage58HrmController::class, 'payroll'])->name('hrm.payroll')->middleware('release.permission:payroll,view');
        Route::post('/payroll/generate', [\App\Http\Controllers\Api\Stage58HrmController::class, 'generatePayroll'])->name('hrm.payroll.generate')->middleware('release.permission:payroll,create');
        Route::get('/payroll/export', [\App\Http\Controllers\Api\Stage58HrmController::class, 'exportPayroll'])->name('hrm.payroll.export')->middleware('release.permission:payroll_reports,export');
        Route::get('/payroll/{periodId}', [\App\Http\Controllers\Api\Stage58HrmController::class, 'payrollDetail'])->name('hrm.payroll.detail')->middleware('release.permission:payroll,view');
        Route::post('/payroll/{periodId}/action', [\App\Http\Controllers\Api\Stage58HrmController::class, 'payrollAction'])->name('hrm.payroll.action')->middleware('release.permission:payroll,approve');
        Route::put('/payroll/{periodId}/entries/{entryId}', [\App\Http\Controllers\Api\Stage58HrmController::class, 'updatePayrollEntry'])->name('hrm.payroll-entry.update')->middleware('release.permission:payroll,edit');
        Route::get('/payroll/{periodId}/payslips', [\App\Http\Controllers\Api\Stage58HrmController::class, 'payslips'])->name('hrm.payslips')->middleware('release.permission:payroll,view');
        Route::post('/payroll/{periodId}/payslips/publish', [\App\Http\Controllers\Api\Stage58HrmController::class, 'publishPayslips'])->name('hrm.payslips.publish')->middleware('release.permission:payroll,approve');
        Route::get('/loans', [\App\Http\Controllers\Api\Stage58HrmController::class, 'loans'])->name('hrm.loans')->middleware('release.permission:hrm,view');
        Route::post('/loans', [\App\Http\Controllers\Api\Stage58HrmController::class, 'storeLoan'])->name('hrm.loans.store')->middleware('release.permission:hrm,create');
        Route::post('/loans/{loanId}/action', [\App\Http\Controllers\Api\Stage58HrmController::class, 'loanAction'])->name('hrm.loans.action')->middleware('release.permission:hrm,approve');
        Route::get('/performance', [\App\Http\Controllers\Api\Stage58HrmController::class, 'performance'])->name('hrm.performance')->middleware('release.permission:hrm,view');
        Route::post('/performance', [\App\Http\Controllers\Api\Stage58HrmController::class, 'storePerformance'])->name('hrm.performance.store')->middleware('release.permission:hrm,create');
        Route::put('/performance/{reviewId}', [\App\Http\Controllers\Api\Stage58HrmController::class, 'updatePerformance'])->name('hrm.performance.update')->middleware('release.permission:hrm,edit');
        Route::get('/audit-history', [\App\Http\Controllers\Api\Stage58HrmController::class, 'auditHistory'])->name('hrm.audit-history')->middleware('release.permission:hrm_audit,view');
        Route::get('/acceptance-status', [\App\Http\Controllers\Api\Stage58HrmController::class, 'acceptanceStatus'])->name('hrm.acceptance-status')->middleware('release.permission:hrm,view');
    });

    Route::middleware('super.admin')->prefix('cms-operations')->group(function () {
        Route::get('/overview', [\App\Http\Controllers\Api\Stage58CmsController::class, 'overview'])->name('cms.overview');
        Route::get('/acceptance-status', [\App\Http\Controllers\Api\Stage58CmsController::class, 'acceptanceStatus'])->name('cms.acceptance-status');
        Route::get('/canonical-state', [\App\Http\Controllers\Api\Stage58CmsController::class, 'canonicalState'])->name('cms.canonical-state');
        Route::get('/pages', [\App\Http\Controllers\Api\Stage58CmsController::class, 'pages'])->name('cms.pages');
        Route::post('/pages', [\App\Http\Controllers\Api\Stage58CmsController::class, 'storePage'])->name('cms.pages.store');
        Route::put('/pages/{pageId}', [\App\Http\Controllers\Api\Stage58CmsController::class, 'updatePage'])->name('cms.pages.update');
        Route::post('/pages/{pageId}/preview', [\App\Http\Controllers\Api\Stage58CmsController::class, 'previewPage'])->name('cms.pages.preview');
        Route::post('/pages/{pageId}/publish', [\App\Http\Controllers\Api\Stage58CmsController::class, 'publishPage'])->name('cms.pages.publish');
        Route::post('/pages/{pageId}/archive', [\App\Http\Controllers\Api\Stage58CmsController::class, 'archivePage'])->name('cms.pages.archive');
        Route::get('/pages/{pageId}/revisions', [\App\Http\Controllers\Api\Stage58CmsController::class, 'revisions'])->name('cms.pages.revisions');
        Route::get('/pages/{pageId}/versions', [\App\Http\Controllers\Api\Stage58CmsController::class, 'contentVersions'])->name('cms.pages.versions');
        Route::post('/pages/{pageId}/rollback/{revisionId}', [\App\Http\Controllers\Api\Stage58CmsController::class, 'rollback'])->name('cms.pages.rollback');
        Route::post('/pages/{pageId}/versions/{versionId}/rollback', [\App\Http\Controllers\Api\Stage58CmsController::class, 'rollbackVersion'])->name('cms.pages.rollback-version');
        Route::get('/components', [\App\Http\Controllers\Api\Stage58CmsController::class, 'components'])->name('cms.components');
        Route::get('/wysiwyg-map', [\App\Http\Controllers\Api\Stage58CmsController::class, 'wysiwygMap'])->name('cms.wysiwyg-map');
        Route::put('/pages/{pageId}/components/{componentId}', [\App\Http\Controllers\Api\Stage58CmsController::class, 'saveComponentDraft'])->name('cms.components.draft');
        Route::get('/site-settings', [\App\Http\Controllers\Api\Stage58CmsController::class, 'siteSettings'])->name('cms.site-settings');
        Route::post('/site-settings', [\App\Http\Controllers\Api\Stage58CmsController::class, 'saveSiteSettings'])->name('cms.site-settings.save');
        Route::get('/publication-logs', [\App\Http\Controllers\Api\Stage58CmsController::class, 'publicationLogs'])->name('cms.publication-logs');
        Route::get('/operation-logs', [\App\Http\Controllers\Api\Stage58CmsController::class, 'operationLogs'])->name('cms.operation-logs');
    });
});

/* ZKTeco generic push */
Route::post('/zkteco/push/{serial}', [\App\Http\Controllers\Api\ZktecoAttendanceController::class, 'genericPush'])->middleware('throttle:240,1');

/* API fallback must remain the final route. */
Route::fallback(function () {
    return response()->json([
        'status' => false,
        'message' => 'API route not found.',
    ], 404);
});
