export function orderMoney(total: number, fee: number, refunded: number, itemTotal: number) {
  const cents = (n: number) => Math.round(n * 100);
  const gross = Math.max(0, cents(total));
  const returned = Math.min(gross, Math.max(0, cents(refunded)));
  const netSeller = gross ? Math.round((gross - Math.min(gross, Math.max(0, cents(fee)))) * (gross - returned) / gross) : 0;
  const netFee = gross - returned - netSeller;
  return { total: gross / 100, shipping: Math.max(0, gross - cents(itemTotal)) / 100, refunded: returned / 100, retainedFee: netFee / 100, sellerNet: netSeller / 100 };
}
