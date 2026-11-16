/** Mirror of the server's computeTotals so the editor shows live totals. The server recalculates on save. */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CalcLine { qty: number; rate: number; discount_pct?: number; gst_rate?: number }

export function computeTotals(lines: CalcLine[], o: { isGst: boolean; intraState: boolean; taxInclusive?: boolean; otherCharges?: number }) {
  let subtotal = 0, discount = 0, cgst = 0, sgst = 0, igst = 0;
  const out = lines.map((l) => {
    const g = o.isGst ? l.gst_rate ?? 0 : 0;
    const gross = (l.qty || 0) * (l.rate || 0);
    const after = gross * (1 - (l.discount_pct ?? 0) / 100);
    const taxable = r2(o.taxInclusive ? after / (1 + g / 100) : after);
    const tax = r2((taxable * g) / 100);
    const c = o.intraState ? r2(tax / 2) : 0;
    const s = o.intraState ? r2(tax - c) : 0;
    const i = o.intraState ? 0 : tax;
    subtotal += taxable; discount += gross - after; cgst += c; sgst += s; igst += i;
    return { taxable, tax, amount: r2(taxable + tax) };
  });
  const exact = r2(subtotal + cgst + sgst + igst + (o.otherCharges ?? 0));
  const total = Math.round(exact);
  return { lines: out, subtotal: r2(subtotal), discount: r2(discount), cgst: r2(cgst), sgst: r2(sgst), igst: r2(igst), round_off: r2(total - exact), total };
}
