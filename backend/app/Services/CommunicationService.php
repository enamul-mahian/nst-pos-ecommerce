<?php

namespace App\Services;

use App\Models\CommunicationLog;
use App\Models\Sale;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Throwable;

class CommunicationService
{
    public function __construct(private CorporateSettingService $settings, private InvoiceDocumentService $invoiceDocs)
    {
    }

    public function sendInvoice(Sale $sale, array $options = [], ?int $userId = null): array
    {
        $sale->loadMissing('customer');
        $data = $this->invoiceDocs->salePayload($sale, true);
        $customer = $data['customer'];
        $sent = [];

        if (($options['send_sms'] ?? false) && $customer['phone']) {
            $message = $this->renderTemplate($this->settings->section('communication')['invoice_sms_template'] ?? '', $data);
            $sent['sms'] = $this->sendSms($customer['phone'], $message, 'invoice', $sale, $userId);
        }

        if (($options['send_email'] ?? false) && $customer['email']) {
            $subject = $this->renderTemplate($this->settings->section('communication')['invoice_email_subject'] ?? 'Your Invoice {invoice_no}', $data);
            $message = $this->renderTemplate($this->settings->section('communication')['invoice_email_template'] ?? '', $data);
            $pdf = ($options['attach_pdf'] ?? true) ? $this->invoiceDocs->simplePdf($sale) : null;
            $sent['email'] = $this->sendEmail($customer['email'], $subject, $message, 'invoice', $sale, $userId, $pdf);
        }

        return $sent;
    }

    public function sendSms(string $phone, string $message, string $purpose = 'manual', mixed $related = null, ?int $userId = null): CommunicationLog
    {
        $log = CommunicationLog::create([
            'channel' => 'sms',
            'purpose' => $purpose,
            'recipient_phone' => $phone,
            'message' => $message,
            'status' => 'pending',
            'related_type' => is_object($related) ? get_class($related) : null,
            'related_id' => is_object($related) ? ($related->id ?? null) : null,
            'invoice_no' => $related instanceof Sale ? $related->invoice_no : null,
            'sent_by' => $userId,
        ]);

        $settings = $this->settings->section('communication');
        $apiUrl = trim((string) ($settings['sms_api_url'] ?? ''));
        if ($apiUrl === '') {
            $log->update(['status' => 'skipped', 'error_message' => 'SMS API URL not configured.']);
            return $log;
        }

        try {
            $payload = [
                $settings['sms_to_param'] ?: 'to' => $phone,
                $settings['sms_message_param'] ?: 'message' => $message,
            ];
            if (! empty($settings['sms_api_token'])) {
                $payload['api_token'] = $settings['sms_api_token'];
            }
            $method = strtoupper($settings['sms_api_method'] ?? 'POST');
            $response = $method === 'GET' ? Http::get($apiUrl, $payload) : Http::asForm()->post($apiUrl, $payload);
            $log->update([
                'status' => $response->successful() ? 'sent' : 'failed',
                'error_message' => $response->successful() ? null : mb_substr($response->body(), 0, 1000),
                'payload' => ['http_status' => $response->status()],
                'sent_at' => $response->successful() ? now() : null,
            ]);
        } catch (Throwable $e) {
            $log->update(['status' => 'failed', 'error_message' => $e->getMessage()]);
        }

        return $log;
    }

    public function sendEmail(string $email, string $subject, string $message, string $purpose = 'manual', mixed $related = null, ?int $userId = null, ?string $pdf = null): CommunicationLog
    {
        $log = CommunicationLog::create([
            'channel' => 'email',
            'purpose' => $purpose,
            'recipient_email' => $email,
            'subject' => $subject,
            'message' => $message,
            'status' => 'pending',
            'related_type' => is_object($related) ? get_class($related) : null,
            'related_id' => is_object($related) ? ($related->id ?? null) : null,
            'invoice_no' => $related instanceof Sale ? $related->invoice_no : null,
            'sent_by' => $userId,
        ]);

        $settings = $this->settings->section('communication');
        if (empty($settings['smtp_host']) || empty($settings['smtp_from_email'])) {
            $log->update(['status' => 'skipped', 'error_message' => 'SMTP settings not configured.']);
            return $log;
        }

        try {
            config([
                'mail.default' => 'smtp',
                'mail.mailers.smtp.host' => $settings['smtp_host'],
                'mail.mailers.smtp.port' => $settings['smtp_port'] ?: 587,
                'mail.mailers.smtp.username' => $settings['smtp_username'] ?: null,
                'mail.mailers.smtp.password' => $settings['smtp_password'] ?: null,
                'mail.mailers.smtp.encryption' => $settings['smtp_encryption'] ?: null,
                'mail.from.address' => $settings['smtp_from_email'],
                'mail.from.name' => $settings['smtp_from_name'] ?: 'New Singapur Telecom',
            ]);

            Mail::raw($message, function ($mail) use ($email, $subject, $pdf, $related) {
                $mail->to($email)->subject($subject);
                if ($pdf) {
                    $filename = ($related instanceof Sale ? $related->invoice_no : 'invoice') . '.pdf';
                    $mail->attachData($pdf, $filename, ['mime' => 'application/pdf']);
                }
            });

            $log->update(['status' => 'sent', 'sent_at' => now()]);
        } catch (Throwable $e) {
            $log->update(['status' => 'failed', 'error_message' => $e->getMessage()]);
        }

        return $log;
    }

    public function renderTemplate(string $template, array $invoicePayload): string
    {
        $invoice = $invoicePayload['invoice'] ?? [];
        $customer = $invoicePayload['customer'] ?? [];
        $map = [
            '{invoice_no}' => $invoice['invoice_no'] ?? '',
            '{total}' => $invoice['final_amount'] ?? '',
            '{paid}' => $invoice['paid_amount'] ?? '',
            '{due}' => $invoice['due_amount'] ?? '',
            '{customer_name}' => $customer['name'] ?? 'Customer',
            '{invoice_link}' => $invoice['public_url'] ?? '',
        ];
        return strtr($template, $map);
    }
}
