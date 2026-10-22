import { useState } from "react";
import { useApp, getProductStock } from "../context/AppContext";
import { Info } from "lucide-react";
import { Page, PageHeader, Card, CardHeader, Badge, Field, Input } from "../components/ui";

// Typed amounts: empty / invalid / negative counts as 0
const amount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const ZakatCalculator = () => {
  // Zakat is for the whole shop, so use every customer and supplier (not the header seller filter)
  const { products, allCustomers, suppliers, shopSettings } = useApp();
  const curr = shopSettings.currencySymbol || "Rs.";
  const money = (n) => `${curr} ${Math.round(amount(n)).toLocaleString()}`;

  // Auto-calculated inventory, receivable and payable values
  const defaultInventoryValue = (products || [])
    .filter((p) => !p.isDeleted)
    .reduce((sum, p) => sum + Number(p.purchasePrice || 0) * getProductStock(p), 0);

  const defaultReceivablesValue = (allCustomers || []).reduce((sum, c) => sum + Math.max(0, Number(c.totalPending || 0)), 0);

  // What the shop still owes its suppliers
  const defaultPayables = (suppliers || []).reduce((sum, s) => sum + Math.max(0, Number(s.balance || 0)), 0);

  // Editable Assets & Liabilities Inputs
  const [cashInHand, setCashInHand] = useState(0);
  const [bankBalance, setBankBalance] = useState(0);
  const [goldSilverValue, setGoldSilverValue] = useState(0);
  // Inventory / receivables follow the loaded data until the user types their own value (null = not edited)
  const [inventoryEdit, setInventoryValue] = useState(null);
  const [receivablesEdit, setReceivables] = useState(null);
  const inventoryValue = inventoryEdit ?? defaultInventoryValue;
  const receivables = receivablesEdit ?? defaultReceivablesValue;
  const [liabilitiesEdit, setLiabilitiesDeductions] = useState(null);
  const liabilitiesDeductions = liabilitiesEdit ?? defaultPayables;

  const totalZakatableAssets =
    amount(cashInHand) + amount(bankBalance) + amount(goldSilverValue) + amount(inventoryValue) + amount(receivables);
  const netZakatableAssets = Math.max(0, totalZakatableAssets - amount(liabilitiesDeductions));
  const estimatedZakat = Math.round(netZakatableAssets * 0.025);

  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="Zakat calculator"
        description="2.5% zakat on the shop's net business wealth: cash, bank, stock value and Udhaar to collect, minus what the shop owes."
        actions={<Badge tone="brand">2.5% rate</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] items-start">
        {/* Inputs */}
        <Card>
          <CardHeader title={`What the shop owns (${curr})`} description="Stock, Udhaar and supplier figures are filled in from your records. You can change any of them." />

          <div className="space-y-4">
            <Field label="Cash in hand / till" htmlFor="zakat-cash">
              <Input id="zakat-cash" type="number" inputMode="decimal" min="0" value={cashInHand} onChange={(e) => setCashInHand(e.target.value)} />
            </Field>

            <Field label="Bank balance" htmlFor="zakat-bank">
              <Input id="zakat-bank" type="number" inputMode="decimal" min="0" value={bankBalance} onChange={(e) => setBankBalance(e.target.value)} />
            </Field>

            <Field label="Stock value at purchase price" hint="From your products and their stock." htmlFor="zakat-stock">
              <Input id="zakat-stock" type="number" inputMode="decimal" min="0" value={inventoryValue} onChange={(e) => setInventoryValue(e.target.value)} />
            </Field>

            <Field label="Udhaar to collect from customers" hint="From customer khatas." htmlFor="zakat-udhaar">
              <Input id="zakat-udhaar" type="number" inputMode="decimal" min="0" value={receivables} onChange={(e) => setReceivables(e.target.value)} />
            </Field>

            <Field label="Gold, silver and other investments" htmlFor="zakat-gold">
              <Input id="zakat-gold" type="number" inputMode="decimal" min="0" value={goldSilverValue} onChange={(e) => setGoldSilverValue(e.target.value)} />
            </Field>

            <div className="pt-4 border-t border-line">
              <Field label="Debts to subtract (supplier bills, loans)" hint="From supplier balances." htmlFor="zakat-debts">
                <Input id="zakat-debts" type="number" inputMode="decimal" min="0" value={liabilitiesDeductions} onChange={(e) => setLiabilitiesDeductions(e.target.value)} />
              </Field>
            </div>
          </div>
        </Card>

        {/* Result */}
        <Card className="lg:sticky lg:top-24">
          <CardHeader title="Result" />

          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Total assets</dt>
              <dd className="font-semibold text-ink tabular-nums">{money(totalZakatableAssets)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-soft">Debts subtracted</dt>
              <dd className="font-semibold text-ink tabular-nums">- {money(liabilitiesDeductions)}</dd>
            </div>
            <div className="flex justify-between gap-3 pt-2.5 border-t border-line">
              <dt className="font-semibold text-ink">Net zakatable wealth</dt>
              <dd className="font-bold text-ink tabular-nums">{money(netZakatableAssets)}</dd>
            </div>
          </dl>

          <div className="mt-5 rounded-2xl bg-brand-50 border border-brand-100 p-5 text-center">
            <div className="text-sm font-semibold text-brand-700">Zakat due (2.5%)</div>
            <div className="mt-1 font-display text-4xl sm:text-5xl font-bold text-ink leading-tight break-words">{money(estimatedZakat)}</div>
            <p className="mt-1 text-xs text-muted">Payable once a year on net wealth above Nisab</p>
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-sunken p-3 text-xs text-ink-soft">
            <Info size={16} className="text-muted shrink-0 mt-0.5" aria-hidden="true" />
            <p>Zakat is 2.5% of net wealth held for one full lunar year (Hawl).</p>
          </div>
        </Card>
      </div>
    </Page>
  );
};

export default ZakatCalculator;
