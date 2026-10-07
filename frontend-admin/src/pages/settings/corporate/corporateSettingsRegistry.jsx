import {
  Barcode, CalendarClock, FileText, Gauge, Globe2, Mail, MessageSquareText, WalletCards,
} from 'lucide-react';

export const corporateSettingsDomains = Object.freeze([
  {
    key: 'domain',
    title: 'Domain',
    description: 'Corporate domain, URL and related business identity settings.',
    path: '/settings/corporate/domain',
    section: 'domain',
    icon: Globe2,
  },
  {
    key: 'invoice-design',
    title: 'Invoice Design',
    description: 'Invoice presentation, labels, instructions and print-facing configuration.',
    path: '/settings/corporate/invoice-design',
    section: 'invoice_design',
    icon: FileText,
  },
  {
    key: 'sms',
    title: 'SMS',
    description: 'SMS provider connection and business message templates.',
    path: '/settings/corporate/sms',
    section: 'sms',
    sourceSection: 'communication',
    icon: MessageSquareText,
    fields: ['default_sender_name','sms_api_url','sms_api_method','sms_api_token','sms_to_param','sms_message_param','invoice_sms_template','marketing_sms_template','due_reminder_template','warranty_template'],
  },
  {
    key: 'email',
    title: 'Email',
    description: 'SMTP identity and invoice email templates used by corporate communication.',
    path: '/settings/corporate/email',
    section: 'email',
    sourceSection: 'communication',
    icon: Mail,
    fields: ['smtp_host','smtp_port','smtp_username','smtp_password','smtp_encryption','smtp_from_email','smtp_from_name','invoice_email_subject','invoice_email_template'],
  },
  {
    key: 'barcode',
    title: 'Barcode',
    description: 'Corporate barcode defaults that are separate from operational Barcode Tools.',
    path: '/settings/corporate/barcode',
    section: 'barcode',
    icon: Barcode,
  },
  {
    key: 'booking',
    title: 'Booking',
    description: 'Booking and preorder defaults used by corporate operations.',
    path: '/settings/corporate/booking',
    section: 'booking',
    icon: CalendarClock,
  },
  {
    key: 'payments',
    title: 'Payment Configuration',
    description: 'Corporate payment defaults. Gateway credentials remain in Payment Gateway Manager.',
    path: '/settings/corporate/payments',
    section: 'payments',
    icon: WalletCards,
  },
  {
    key: 'dashboard',
    title: 'Dashboard Access',
    description: 'Role/user widget visibility, order and data scope.',
    path: '/settings/corporate/dashboard',
    section: 'dashboard',
    icon: Gauge,
  },
]);

export function getCorporateSettingsDomain(key) {
  return corporateSettingsDomains.find((item) => item.key === key) || null;
}

export function humanizeSettingKey(key = '') {
  return String(key).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
