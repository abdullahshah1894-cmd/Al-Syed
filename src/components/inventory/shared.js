// Plain helpers shared by the Inventory page and its forms (no components here)

export const cx = (...parts) => parts.filter(Boolean).join(" ");

export const CATEGORIES = ["Smartphones", "Tablets & iPads", "Accessories", "Spare Parts", "Wearables"];
// Categories whose units are tracked by IMEI (Smartphones must have at least one)
export const IMEI_CATEGORIES = ["Smartphones", "Tablets & iPads", "Wearables"];
export const WARRANTY_TYPES = ["Official Brand Warranty", "Shop Warranty", "No Warranty"];

export const isFullImei = (v) => /^\d{15}$/.test(String(v || ""));

// IMEI boxes turn green once all 15 digits are in
export const imeiInputClass = (valid) =>
  cx(
    "w-full h-10 rounded-xl border bg-surface pl-3 pr-14 font-mono text-sm text-ink placeholder:font-sans placeholder:text-muted/70",
    "focus:outline-none focus:ring-2",
    valid ? "border-paid-500 focus:ring-paid-100" : "border-line-strong focus:border-brand-500 focus:ring-brand-100"
  );

// Build one in-stock unit. A dual-SIM unit always carries `imei` (= imei1),
// because POS and the server match on imei / imei1 / imei2.
export const makeUnit = (first, second, ptaStatus) =>
  second
    ? { imei: first, imei1: first, imei2: second, status: "in_stock", ptaStatus }
    : { imei: first, status: "in_stock", ptaStatus };

// Products whose stock is counted from IMEI units rather than a plain quantity
export const isImeiProduct = (p) => (p.imeis && p.imeis.length > 0) || p.category === "Smartphones";

// IMEIs already in stock in any product -> product name
export const inStockImeiOwners = (products) => {
  const owners = new Map();
  (products || []).forEach((p) =>
    (p.imeis || []).forEach((i) => {
      if (i && i.status === "in_stock") [i.imei, i.imei1, i.imei2].filter(Boolean).forEach((k) => owners.set(String(k), p.name));
    })
  );
  return owners;
};

// IMEIs entered twice, or already in stock somewhere
export const findDuplicateImeis = (units, owners) => {
  const seen = new Set();
  const dups = [];
  units.forEach((u) =>
    [u.imei1 || u.imei, u.imei2].filter(Boolean).forEach((k) => {
      if (seen.has(k)) dups.push(`${k} (entered twice)`);
      else if (owners.has(k)) dups.push(`${k} (already in stock: ${owners.get(k)})`);
      seen.add(k);
    })
  );
  return dups;
};

// Prevent Enter in a text input from submitting the modal form (scanners send Enter)
export const preventEnterSubmit = (e) => {
  if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "submit") e.preventDefault();
};

// Lines of pasted text (a JSON array gives one line per element)
const pastedLines = (raw) => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      // not JSON, read it as plain text
    }
  }
  return raw.split(/\r?\n/);
};

// Pieces of a line that contain digits ("IMEI:" labels and brackets are ignored)
const lineTokens = (line) =>
  line
    .split(/[,;\s]+/)
    .map((t) => ({ raw: t.trim(), digits: t.replace(/\D/g, "") }))
    .filter((t) => t.digits.length > 0);

// Read pasted IMEIs. Dual mode: one phone per line ("imei1,imei2"); single mode: every number is an IMEI.
// `taken` = IMEIs already typed in the form or in stock (they count as duplicates).
// Returns { units: [{ imei1, imei2 }], duplicates: [imei], invalid: [text] }
export const analysePaste = (raw, dual, taken) => {
  const seen = new Set();
  const units = [];
  const duplicates = [];
  const invalid = [];
  const isTaken = (k) => seen.has(k) || taken.has(k);

  pastedLines(raw || "").forEach((line) => {
    const tokens = lineTokens(line);
    if (tokens.length === 0) return;
    if (dual) {
      const good = tokens.filter((t) => isFullImei(t.digits)).map((t) => t.digits);
      tokens.filter((t) => !isFullImei(t.digits)).forEach((t) => invalid.push(t.raw));
      if (good.length === 0) return;
      // More than two IMEIs on one line: the extra ones are not used
      good.slice(2).forEach((k) => invalid.push(`${k} (3rd IMEI on one line)`));
      const pair = good.slice(0, 2);
      if (pair[0] === pair[1]) pair.pop();
      const dup = pair.find(isTaken);
      if (dup) {
        duplicates.push(dup);
        return;
      }
      pair.forEach((k) => seen.add(k));
      units.push({ imei1: pair[0], imei2: pair[1] || "" });
    } else {
      tokens.forEach((t) => {
        if (!isFullImei(t.digits)) {
          invalid.push(t.raw);
          return;
        }
        if (isTaken(t.digits)) {
          duplicates.push(t.digits);
          return;
        }
        seen.add(t.digits);
        units.push({ imei1: t.digits, imei2: "" });
      });
    }
  });
  return { units, duplicates, invalid };
};
