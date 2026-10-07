-- New Singapur Telecom domain-ready default settings
-- Run this in phpMyAdmin only after taking a database backup.

INSERT INTO settings (`group`, `key`, `value`, `type`, `created_at`, `updated_at`) VALUES
('general', 'company_name', 'New Singapur Telecom', 'string', NOW(), NOW()),
('general', 'company_legal_name', 'New Singapur Telecom', 'string', NOW(), NOW()),
('general', 'company_email', 'info@newsingapurtele.com', 'string', NOW(), NOW()),
('general', 'email', 'info@newsingapurtele.com', 'string', NOW(), NOW()),
('general', 'website', 'https://newsingapurtele.com', 'string', NOW(), NOW()),
('general', 'company_website', 'https://newsingapurtele.com', 'string', NOW(), NOW()),
('domain', 'pos_domain', 'https://pos.newsingapurtele.com', 'string', NOW(), NOW()),
('domain', 'ecommerce_domain', 'https://newsingapurtele.com', 'string', NOW(), NOW()),
('domain', 'api_domain', 'https://api.newsingapurtele.com', 'string', NOW(), NOW()),
('communication', 'default_sender_name', 'New Singapur Telecom', 'string', NOW(), NOW()),
('communication', 'smtp_from_email', 'no-reply@newsingapurtele.com', 'string', NOW(), NOW()),
('communication', 'smtp_from_name', 'New Singapur Telecom', 'string', NOW(), NOW()),
('communication', 'invoice_email_subject', 'Your Invoice from New Singapur Telecom - {invoice_no}', 'string', NOW(), NOW()),
('communication', 'invoice_email_template', 'Dear Customer,\n\nThank you for shopping with New Singapur Telecom. Your invoice PDF is attached.\n\nInvoice: {invoice_no}\nTotal: {total}\nPaid: {paid}\nDue: {due}\nView: {invoice_link}', 'string', NOW(), NOW()),
('invoice_design', 'watermark_text', 'New Singapur Telecom', 'string', NOW(), NOW()),
('invoice_design', 'footer_text', 'Thank you for shopping with New Singapur Telecom.', 'string', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  `group` = VALUES(`group`),
  `value` = VALUES(`value`),
  `type` = VALUES(`type`),
  `updated_at` = NOW();

-- Update old demo/staff email domain if already seeded.
UPDATE users
SET email = REPLACE(email, '@newsingapurtele.com', '@newsingapurtele.com')
WHERE email LIKE '%@newsingapurtele.com';
