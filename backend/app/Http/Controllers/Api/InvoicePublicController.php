<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Sale;
use App\Services\InvoiceDocumentService;
use Illuminate\Http\Request;

class InvoicePublicController extends Controller
{
    public function __construct(private InvoiceDocumentService $invoiceDocs)
    {
    }

    public function show(Request $request, string $invoiceNo)
    {
        $sale = $this->findPublicSale($invoiceNo, $request->query('token'));
        return response()->json(['success' => true, 'data' => $this->invoiceDocs->salePayload($sale, true)]);
    }

    public function pdf(Request $request, string $invoiceNo)
    {
        $sale = $this->findPublicSale($invoiceNo, $request->query('token'));
        $pdf = $this->invoiceDocs->simplePdf($sale);
        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . preg_replace('/[^A-Za-z0-9_\-]/', '_', $sale->invoice_no) . '.pdf"',
        ]);
    }

    public function protectedShow(Sale $sale)
    {
        return response()->json(['success' => true, 'data' => $this->invoiceDocs->salePayload($sale, false)]);
    }

    public function protectedPdf(Sale $sale)
    {
        return response($this->invoiceDocs->simplePdf($sale), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . preg_replace('/[^A-Za-z0-9_\-]/', '_', $sale->invoice_no) . '.pdf"',
        ]);
    }

    private function findPublicSale(string $invoiceNo, ?string $token): Sale
    {
        abort_if(! $token, 403, 'Invalid invoice token.');
        return Sale::where('invoice_no', $invoiceNo)->where('public_token', $token)->firstOrFail();
    }
}
