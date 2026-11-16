export type DocType =
  | 'quotation' | 'sales_order' | 'sales_invoice' | 'delivery_challan' | 'sales_return'
  | 'purchase_order' | 'purchase_invoice' | 'purchase_return';

export interface DocMeta {
  label: string;       // "Sales Invoice"
  plural: string;      // "Sales Invoices"
  slug: string;        // url segment
  side: 'sales' | 'purchase';
  partyLabel: string;  // "Customer" / "Supplier"
  hasStatus: boolean;  // open/completed tracking (orders etc.)
  printTitle: (isGst: boolean) => string;
}

export const DOCS: Record<DocType, DocMeta> = {
  sales_invoice:    { label: 'Sales Invoice', plural: 'Sales Invoices', slug: 'sales', side: 'sales', partyLabel: 'Customer', hasStatus: false, printTitle: (g) => (g ? 'TAX INVOICE' : 'INVOICE') },
  quotation:        { label: 'Quotation', plural: 'Quotations', slug: 'quotations', side: 'sales', partyLabel: 'Customer', hasStatus: true, printTitle: () => 'QUOTATION' },
  sales_order:      { label: 'Sales Order', plural: 'Sales Orders', slug: 'sales-orders', side: 'sales', partyLabel: 'Customer', hasStatus: true, printTitle: () => 'SALES ORDER' },
  delivery_challan: { label: 'Delivery Challan', plural: 'Delivery Challans', slug: 'challans', side: 'sales', partyLabel: 'Customer', hasStatus: true, printTitle: () => 'DELIVERY CHALLAN' },
  sales_return:     { label: 'Sales Return', plural: 'Sales Returns', slug: 'sales-returns', side: 'sales', partyLabel: 'Customer', hasStatus: false, printTitle: () => 'CREDIT NOTE' },
  purchase_invoice: { label: 'Purchase Bill', plural: 'Purchase Bills', slug: 'purchases', side: 'purchase', partyLabel: 'Supplier', hasStatus: false, printTitle: () => 'PURCHASE BILL' },
  purchase_order:   { label: 'Purchase Order', plural: 'Purchase Orders', slug: 'purchase-orders', side: 'purchase', partyLabel: 'Supplier', hasStatus: true, printTitle: () => 'PURCHASE ORDER' },
  purchase_return:  { label: 'Purchase Return', plural: 'Purchase Returns', slug: 'purchase-returns', side: 'purchase', partyLabel: 'Supplier', hasStatus: false, printTitle: () => 'DEBIT NOTE' },
};

export const docBySlug = (slug: string) => (Object.keys(DOCS) as DocType[]).find((t) => DOCS[t].slug === slug);
export const docPath = (type: DocType) => `/${DOCS[type].slug}`;
