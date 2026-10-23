import { memo } from "react";
import { Barcode, Edit2, Trash2, PlusCircle } from "lucide-react";
import { getProductStock } from "../../context/AppContext";
import { Badge, Button, IconButton, TableWrap, Th, Td } from "../ui";
import { StockBadge, ImeiList } from "./parts";

// Per-row numbers used by both the table (desktop) and the cards (phones)
const rowInfo = (prod) => {
  const availableImeis = Array.isArray(prod.imeis) ? prod.imeis.filter((i) => i && i.status === "in_stock") : [];
  const stock = getProductStock(prod);
  const isLowStock = stock <= Number(prod.minStockAlert || 0);
  const purchasePriceNum = Number(prod.purchasePrice || 0);
  const salePriceNum = Number(prod.salePrice || 0);
  return { availableImeis, stock, isLowStock, purchasePriceNum, salePriceNum, profitMargin: salePriceNum - purchasePriceNum };
};

const money = (curr, n) => `${curr} ${n.toLocaleString()}`;
const HIDDEN = "••••••";

const ProductTitle = ({ prod }) => (
  <div className="min-w-0">
    <div className="font-semibold text-ink">{prod.name}</div>
    <div className="text-xs text-muted">{prod.brand} {prod.model}</div>
    {prod.barcode && (
      <div className="flex items-center gap-1 font-mono text-[11px] text-ink-soft mt-0.5">
        <Barcode size={12} aria-hidden="true" />
        <span>{prod.barcode}</span>
      </div>
    )}
  </div>
);

// Rows re-render only when their own product (or the owner / currency) changes
const ProductRow = memo(function ProductRow({ prod, isAdmin, curr, onAddStock, onEdit, onDelete }) {
  const { availableImeis, stock, isLowStock, purchasePriceNum, salePriceNum, profitMargin } = rowInfo(prod);
  return (
    <tr className="hover:bg-sunken/60 transition-colors">
      <Td className="align-top min-w-[12rem]"><ProductTitle prod={prod} /></Td>
      <Td className="align-top">
        <Badge tone="neutral">{prod.category}</Badge>
      </Td>
      <Td className="align-top min-w-[15rem]">
        <StockBadge stock={stock} isLowStock={isLowStock} />
        {prod.imeis && prod.imeis.length > 0 && <ImeiList units={availableImeis} />}
      </Td>
      <Td className="align-top text-right whitespace-nowrap text-ink-soft">{isAdmin ? money(curr, purchasePriceNum) : HIDDEN}</Td>
      <Td className="align-top text-right whitespace-nowrap font-semibold text-ink">{money(curr, salePriceNum)}</Td>
      <Td className={`align-top text-right whitespace-nowrap font-semibold ${profitMargin < 0 ? "text-saffron-700" : "text-paid-600"}`}>
        {isAdmin ? money(curr, profitMargin) : HIDDEN}
      </Td>
      {isAdmin && (
        <Td className="align-top text-right">
          <div className="flex items-center justify-end gap-1">
            <IconButton icon={PlusCircle} label="Add stock" onClick={() => onAddStock(prod)} />
            <IconButton icon={Edit2} label="Edit product" onClick={() => onEdit(prod)} />
            <IconButton icon={Trash2} label="Delete product" onClick={() => onDelete(prod)} className="hover:text-khata-600" />
          </div>
        </Td>
      )}
    </tr>
  );
});

const ProductCard = memo(function ProductCard({ prod, isAdmin, curr, onAddStock, onEdit, onDelete }) {
  const { availableImeis, stock, isLowStock, purchasePriceNum, salePriceNum, profitMargin } = rowInfo(prod);
  return (
    <li className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <ProductTitle prod={prod} />
        <Badge tone="neutral" className="shrink-0">{prod.category}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-sunken p-2.5 text-xs">
        <div className="min-w-0">
          <div className="text-muted">Cost</div>
          <div className="font-semibold text-ink-soft truncate">{isAdmin ? money(curr, purchasePriceNum) : HIDDEN}</div>
        </div>
        <div className="min-w-0">
          <div className="text-muted">Sale price</div>
          <div className="font-semibold text-ink truncate">{money(curr, salePriceNum)}</div>
        </div>
        <div className="min-w-0">
          <div className="text-muted">Profit</div>
          <div className={`font-semibold truncate ${profitMargin < 0 ? "text-saffron-700" : "text-paid-600"}`}>
            {isAdmin ? money(curr, profitMargin) : HIDDEN}
          </div>
        </div>
      </div>

      <div>
        <StockBadge stock={stock} isLowStock={isLowStock} />
        {prod.imeis && prod.imeis.length > 0 && <ImeiList units={availableImeis} />}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={PlusCircle} onClick={() => onAddStock(prod)} className="flex-1">
            Add stock
          </Button>
          <Button variant="secondary" icon={Edit2} onClick={() => onEdit(prod)} className="flex-1">
            Edit
          </Button>
          <IconButton icon={Trash2} label="Delete product" variant="danger-soft" onClick={() => onDelete(prod)} />
        </div>
      )}
    </li>
  );
});

// Table on desktop / tablet, cards on phones. Memoised: typing in a form or modal does not re-render it.
const ProductList = memo(function ProductList({ products, isAdmin, curr, onAddStock, onEdit, onDelete }) {
  const rowProps = { isAdmin, curr, onAddStock, onEdit, onDelete };
  return (
    <>
      <div className="hidden md:block px-4 sm:px-5 py-3">
        <TableWrap>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Category</Th>
              <Th>Stock and IMEIs</Th>
              <Th className="text-right">Cost</Th>
              <Th className="text-right">Sale price</Th>
              <Th className="text-right">Profit</Th>
              {isAdmin && <Th className="text-right">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {products.map((prod) => (
              <ProductRow key={prod.id} prod={prod} {...rowProps} />
            ))}
          </tbody>
        </TableWrap>
      </div>

      <ul className="md:hidden divide-y divide-line">
        {products.map((prod) => (
          <ProductCard key={prod.id} prod={prod} {...rowProps} />
        ))}
      </ul>
    </>
  );
});

export default ProductList;
