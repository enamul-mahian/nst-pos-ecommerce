import { humanize } from '../../components/portal/portalUtils';

export const customerCode = (user: any) => user?.customer_code || user?.customer?.customer_code || (user?.id ? `CUST-${100000 + Number(user.id)}` : 'CUST-—');

export interface PortalDevice {
  id: string;
  name: string;
  imei: string | null;
  purchasedAt: string | null;
  invoiceNo: string | null;
  warranty: string;
  image: string | null;
}

const itemName = (item: any) => item?.product_name || item?.product?.name || item?.used_purchase?.product_name || item?.usedPurchase?.product_name || 'Device';
const itemImei = (item: any) => item?.imei_1 || item?.imei || item?.used_purchase?.imei_1 || item?.usedPurchase?.imei_1 || null;

/** Every device line the customer bought, flattened from their sales/invoices. */
export const devicesFromSales = (sales: any[]): PortalDevice[] =>
  sales.flatMap((sale) => (Array.isArray(sale?.items) ? sale.items : []).map((item: any, index: number) => ({
    id: `${sale?.id ?? 's'}-${item?.id ?? index}`,
    name: itemName(item),
    imei: itemImei(item),
    purchasedAt: sale?.created_at || null,
    invoiceNo: sale?.invoice_no || null,
    warranty: item?.warranty_status || item?.warranty || sale?.warranty_status || 'active',
    image: item?.image || item?.product?.image_url || item?.product?.image || null,
  })));

export const orderTitle = (order: any) => order?.items?.[0]?.product_name || order?.items?.[0]?.name || `Order #${order?.order_no || order?.id}`;
export const orderImage = (order: any) => order?.items?.[0]?.image || order?.items?.[0]?.product_image || null;

export interface PortalNotification { id: string; text: string; at: string; kind: 'order' | 'payment' | 'preorder'; }

/** Customer-visible activity feed derived from order and preorder status. */
export const notificationsFrom = (orders: any[], preorders: any[], sales: any[] = []): PortalNotification[] => {
  const rows: PortalNotification[] = [
    ...orders.map((o) => ({ id: `o${o.id}`, kind: 'order' as const, at: o.updated_at || o.created_at, text: `Your order #${o.order_no || o.id} is ${humanize(o.status).toLowerCase()}.` })),
    ...sales.filter((s) => Number(s?.paid_amount) > 0).map((s) => ({ id: `s${s.id}`, kind: 'payment' as const, at: s.created_at, text: `Payment received for invoice ${s.invoice_no || '#' + s.id}.` })),
    ...preorders.map((p) => ({ id: `p${p.id}`, kind: 'preorder' as const, at: p.updated_at || p.created_at, text: `Your preorder for ${p.product_name || 'a device'} is ${humanize(p.status_key || p.status).toLowerCase()}.` })),
  ];
  return rows.filter((r) => r.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
};
