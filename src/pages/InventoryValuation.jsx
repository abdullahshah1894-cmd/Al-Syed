import { useApp, getProductStock } from "../context/AppContext";
import { Boxes, Wallet, Tag, TrendingUp } from "lucide-react";
import { Page, PageHeader, Card, CardHeader, Stat, Money, TableWrap, Th, Td, EmptyState } from "../components/ui";

const CATEGORIES = ["Smartphones", "Tablets & iPads", "Accessories", "Spare Parts", "Wearables"];

// Units actually in the shop (sold IMEIs never count; a negative quantity counts as 0)
const unitsInStock = (p) => Math.max(0, getProductStock(p) || 0);

// A product with sale price 0 is "not priced yet", not something sold for Rs 0
const isPriced = (p) => (Number(p.salePrice) || 0) > 0;

// Quantity, cost and retail value of a list of products. Selling value and profit only count
// priced products (pricedCost is their cost); unpriced = products in stock with no sale price.
const valuate = (list) =>
  list.reduce(
    (acc, p) => {
      const qty = unitsInStock(p);
      const cost = (Number(p.purchasePrice) || 0) * qty;
      acc.qty += qty;
      acc.cost += cost;
      if (isPriced(p)) {
        acc.retail += Number(p.salePrice) * qty;
        acc.pricedCost += cost;
      } else if (qty > 0) {
        acc.unpriced += 1;
      }
      return acc;
    },
    { qty: 0, cost: 0, retail: 0, pricedCost: 0, unpriced: 0 }
  );

const InventoryValuation = () => {
  const { products, shopSettings } = useApp();
  const curr = shopSettings.currencySymbol || "Rs.";

  // Deleted products are not part of the shop's stock
  const liveProducts = (products || []).filter((p) => p && !p.isDeleted);

  const {
    qty: totalQty,
    cost: totalCostValuation,
    retail: totalSellingValuation,
    pricedCost: totalPricedCost,
    unpriced: unpricedCount,
  } = valuate(liveProducts);
  const expectedProfit = totalSellingValuation - totalPricedCost;
  const unpricedNote =
    unpricedCount > 0
      ? `${unpricedCount} product${unpricedCount === 1 ? " has" : "s have"} no sale price and ${unpricedCount === 1 ? "is" : "are"} not counted`
      : "";

  // Products with a category outside the standard list still count, under "Other"
  const otherProducts = liveProducts.filter((p) => !CATEGORIES.includes(p.category));
  const categoryRows = [
    ...CATEGORIES.map((cat) => ({ cat, list: liveProducts.filter((p) => p.category === cat) })),
    ...(otherProducts.length > 0 ? [{ cat: "Other", list: otherProducts }] : []),
  ];


  return (
    <Page>
      <PageHeader
        title="Stock value"
        description="What the stock in the shop cost, what it sells for, and the profit in it. Sold and deleted items are not counted."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Items in stock"
          icon={Boxes}
          value={`${totalQty.toLocaleString()} units`}
          hint={`Across ${liveProducts.length} product(s)`}
        />
        <Stat
          label="Cost of stock"
          icon={Wallet}
          value={<Money amount={totalCostValuation} currency={curr} />}
          hint="Money put into the stock in the shop"
        />
        <Stat
          label="Selling value"
          icon={Tag}
          tone="brand"
          value={<Money amount={totalSellingValuation} currency={curr} />}
          hint={unpricedNote || "If everything sells at its sale price"}
        />
        <Stat
          label="Expected profit"
          icon={TrendingUp}
          tone={expectedProfit >= 0 ? "paid" : "saffron"}
          value={<Money amount={expectedProfit} currency={curr} />}
          hint={unpricedCount > 0 ? "Priced products only: selling value minus their cost" : "Selling value minus cost"}
        />
      </div>

      <Card>
        <CardHeader title="By category" description="Stock, cost and selling value for each category" />
        {liveProducts.length === 0 ? (
          <EmptyState icon={Boxes} title="No stock yet" description="Add products in Inventory and their value shows here." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Category</Th>
                <Th className="text-right">Products</Th>
                <Th className="text-right">Units</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Selling value</Th>
                <Th className="text-right">Profit</Th>
              </tr>
            </thead>
            <tbody>
              {categoryRows.map(({ cat, list }) => {
                const { qty: catQty, cost: catCost, retail: catRetail, pricedCost: catPricedCost, unpriced: catUnpriced } = valuate(list);

                return (
                  <tr key={cat} className="hover:bg-sunken/60 transition-colors">
                    <Td className="font-semibold text-ink whitespace-nowrap">{cat}</Td>
                    <Td className="text-right text-ink-soft">{list.length}</Td>
                    <Td className="text-right text-ink-soft">{catQty.toLocaleString()}</Td>
                    <Td className="text-right text-ink-soft"><Money amount={catCost} currency={curr} /></Td>
                    <Td className="text-right text-ink">
                      <Money amount={catRetail} currency={curr} />
                      {catUnpriced > 0 && (
                        <div className="text-[11px] font-normal text-saffron-700">{catUnpriced} without sale price</div>
                      )}
                    </Td>
                    <Td className={`text-right font-semibold ${catRetail - catPricedCost < 0 ? "text-saffron-700" : "text-paid-600"}`}>
                      <Money amount={catRetail - catPricedCost} currency={curr} />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold text-ink">
                <td className="px-3 py-3">All stock</td>
                <td className="px-3 py-3 text-right">{liveProducts.length}</td>
                <td className="px-3 py-3 text-right">{totalQty.toLocaleString()}</td>
                <td className="px-3 py-3 text-right"><Money amount={totalCostValuation} currency={curr} /></td>
                <td className="px-3 py-3 text-right"><Money amount={totalSellingValuation} currency={curr} /></td>
                <td className={`px-3 py-3 text-right ${expectedProfit < 0 ? "text-saffron-700" : "text-paid-600"}`}><Money amount={expectedProfit} currency={curr} /></td>
              </tr>
            </tfoot>
          </TableWrap>
        )}
        {unpricedCount > 0 && (
          <p className="mt-3 rounded-xl border border-saffron-100 bg-saffron-50 px-3 py-2 text-sm text-saffron-700">
            {unpricedNote} in the selling value or profit. Set a sale price in Inventory to include them.
          </p>
        )}
      </Card>
    </Page>
  );
};

export default InventoryValuation;
