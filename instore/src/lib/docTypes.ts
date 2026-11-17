import type { DocType } from '../data/models';

export interface DocMeta { label: string; plural: string; short: string; side: 'sales' | 'purchase'; partyLabel: string; printTitle: (gst: boolean) => string }

export const DOCS: Record<DocType, DocMeta> = {
  sales_invoice:    { label: 'Sales Invoice', plural: 'Sales', short: 'Invoice', side: 'sales', partyLabel: 'Customer', printTitle: (g) => (g ? 'TAX INVOICE' : 'INVOICE') },
  quotation:        { label: 'Quotation', plural: 'Quotes', short: 'Quote', side: 'sales', partyLabel: 'Customer', printTitle: () => 'QUOTATION' },
  sales_order:      { label: 'Sales Order', plural: 'Orders', short: 'Order', side: 'sales', partyLabel: 'Customer', printTitle: () => 'SALES ORDER' },
  delivery_challan: { label: 'Delivery Challan', plural: 'Challans', short: 'Challan', side: 'sales', partyLabel: 'Customer', printTitle: () => 'DELIVERY CHALLAN' },
  sales_return:     { label: 'Sales Return', plural: 'Sales returns', short: 'Return', side: 'sales', partyLabel: 'Customer', printTitle: () => 'CREDIT NOTE' },
  purchase_invoice: { label: 'Purchase Bill', plural: 'Purchases', short: 'Purchase', side: 'purchase', partyLabel: 'Supplier', printTitle: () => 'PURCHASE BILL' },
  purchase_order:   { label: 'Purchase Order', plural: 'Purchase orders', short: 'PO', side: 'purchase', partyLabel: 'Supplier', printTitle: () => 'PURCHASE ORDER' },
  purchase_return:  { label: 'Purchase Return', plural: 'Purchase returns', short: 'Return', side: 'purchase', partyLabel: 'Supplier', printTitle: () => 'DEBIT NOTE' },
};

/** Groups shown as chips on the Bills screen. */
export const BILL_GROUPS: { id: string; label: string; types: DocType[] }[] = [
  { id: 'sales', label: 'Sales', types: ['sales_invoice'] },
  { id: 'purchases', label: 'Purchases', types: ['purchase_invoice'] },
  { id: 'quotes', label: 'Quotes', types: ['quotation'] },
  { id: 'orders', label: 'Orders', types: ['sales_order', 'purchase_order'] },
  { id: 'challans', label: 'Challans', types: ['delivery_challan'] },
  { id: 'returns', label: 'Returns', types: ['sales_return', 'purchase_return'] },
];

export const NEW_BILL_TYPES: DocType[] = ['sales_invoice', 'purchase_invoice', 'quotation', 'sales_order', 'delivery_challan', 'purchase_order', 'sales_return', 'purchase_return'];
