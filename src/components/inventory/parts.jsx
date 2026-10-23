import { AlertTriangle } from "lucide-react";
import { Badge } from "../ui";
import { cx } from "./shared";

// "12/15" counter inside an IMEI box
export const DigitCount = ({ value }) => (
  <span
    className={cx(
      "absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular-nums pointer-events-none",
      value.length === 15 ? "text-paid-600" : "text-muted"
    )}
  >
    {value.length}/15
  </span>
);

export const PtaOptions = () => (
  <>
    <option value="Approved">PTA approved</option>
    <option value="Non-PTA">Non-PTA</option>
    <option value="CPID">CPID approved</option>
  </>
);

// Stock badge: green in stock, saffron at / below the alert level, red when none are left
export const StockBadge = ({ stock, isLowStock }) =>
  stock <= 0 ? (
    <Badge tone="khata">Out of stock</Badge>
  ) : isLowStock ? (
    <Badge tone="saffron">
      <AlertTriangle size={11} aria-hidden="true" /> {stock} in stock · low
    </Badge>
  ) : (
    <Badge tone="paid">{stock} in stock</Badge>
  );

// Phones in the shop for one product. Each IMEI stays on one line; a dual-SIM pair wraps between SIM 1 and SIM 2.
export const ImeiList = ({ units }) => (
  <div className="mt-2 space-y-1">
    <div className="text-xs text-muted">
      {units.length} phone{units.length === 1 ? "" : "s"} in the shop
    </div>
    {units.length > 0 && (
      <ul className="max-h-28 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
        {units.map((iObj, idx) => (
          <li
            key={`${iObj.imei || iObj.imei1 || ""}-${idx}`}
            className="flex items-start justify-between gap-2 rounded-lg bg-sunken px-2 py-1"
          >
            <span className="min-w-0 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] text-ink-soft">
              <span className="whitespace-nowrap">{iObj.imei1 ? `SIM 1: ${iObj.imei1}` : `IMEI: ${iObj.imei}`}</span>
              {iObj.imei2 && <span className="whitespace-nowrap">SIM 2: {iObj.imei2}</span>}
            </span>
            {iObj.ptaStatus && <span className="shrink-0 text-[10px] font-semibold text-muted whitespace-nowrap">{iObj.ptaStatus}</span>}
          </li>
        ))}
      </ul>
    )}
  </div>
);
