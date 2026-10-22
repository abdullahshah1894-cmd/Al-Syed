import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, getProductStock } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import {
  Boxes,
  Plus,
  Search,
  AlertTriangle,
  Barcode,
  Smartphone,
  Edit2,
  Trash2,
  X,
  PlusCircle,
} from "lucide-react";
import {
  Page, PageHeader, Card, Badge, Button, IconButton, Field, Input, Select, Textarea, Segmented,
  TableWrap, Th, Td, EmptyState, Modal, inputClass,
} from "../components/ui";

const cx = (...parts) => parts.filter(Boolean).join(" ");

// IMEI boxes turn green once all 15 digits are in
const imeiInputClass = (valid) =>
  cx(
    "w-full h-10 rounded-xl border bg-surface pl-3 pr-14 font-mono text-sm text-ink placeholder:font-sans placeholder:text-muted/70",
    "focus:outline-none focus:ring-2",
    valid ? "border-paid-500 focus:ring-paid-100" : "border-line-strong focus:border-brand-500 focus:ring-brand-100"
  );

const DigitCount = ({ value }) => (
  <span
    className={cx(
      "absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold tabular-nums pointer-events-none",
      value.length === 15 ? "text-paid-600" : "text-muted"
    )}
  >
    {value.length}/15
  </span>
);

// Stock badge: green in stock, saffron at / below the alert level, red when none are left
const StockBadge = ({ stock, isLowStock }) =>
  stock <= 0 ? (
    <Badge tone="khata">Out of stock</Badge>
  ) : isLowStock ? (
    <Badge tone="saffron">
      <AlertTriangle size={11} aria-hidden="true" /> {stock} in stock · low
    </Badge>
  ) : (
    <Badge tone="paid">{stock} in stock</Badge>
  );

// Phones in the shop for one product
const ImeiList = ({ units }) => (
  <div className="mt-2 space-y-1">
    <div className="text-xs text-muted">
      {units.length} phone{units.length === 1 ? "" : "s"} in the shop
    </div>
    {units.length > 0 && (
      <ul className="max-h-28 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
        {units.map((iObj, idx) => (
          <li
            key={`${iObj.imei || iObj.imei1 || ""}-${idx}`}
            className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-lg bg-sunken px-2 py-1"
          >
            <span className="font-mono text-[11px] text-ink-soft break-all">
              {iObj.imei1 ? `SIM 1: ${iObj.imei1}` : `IMEI: ${iObj.imei}`}
              {iObj.imei2 ? ` | SIM 2: ${iObj.imei2}` : ""}
            </span>
            {iObj.ptaStatus && <span className="text-[10px] font-semibold text-muted">{iObj.ptaStatus}</span>}
          </li>
        ))}
      </ul>
    )}
  </div>
);

const PTA_OPTIONS = (
  <>
    <option value="Approved">PTA approved</option>
    <option value="Non-PTA">Non-PTA</option>
    <option value="CPID">CPID approved</option>
  </>
);

// Categories whose units are tracked by IMEI (Smartphones must have at least one)
const IMEI_CATEGORIES = ["Smartphones", "Tablets & iPads", "Wearables"];
const WARRANTY_TYPES = ["Official Brand Warranty", "Shop Warranty", "No Warranty"];

// Build one in-stock unit. A dual-SIM unit always carries `imei` (= imei1),
// because POS and the server match on imei / imei1 / imei2.
const makeUnit = (first, second, ptaStatus) =>
  second
    ? { imei: first, imei1: first, imei2: second, status: "in_stock", ptaStatus }
    : { imei: first, status: "in_stock", ptaStatus };

// Products whose stock is counted from IMEI units rather than a plain quantity
const isImeiProduct = (p) => (p.imeis && p.imeis.length > 0) || p.category === "Smartphones";

const Inventory = () => {
  const { products, addProduct, updateProduct, deleteProduct, addStock, shopSettings } = useApp();
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();

  // Search starts from ?search= (global header search) and follows it when the URL changes
  const urlSearch = searchParams.get("search") || "";
  const [searchTerm, setSearchTerm] = useState(urlSearch);
  const [lastUrlSearch, setLastUrlSearch] = useState(urlSearch);
  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch);
    setSearchTerm(urlSearch);
  }
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [savingAdd, setSavingAdd] = useState(false);

  // Form State for Add Product
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [category, setCategory] = useState("Smartphones");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [minStockAlert, setMinStockAlert] = useState(2);

  // IMEI Entry State
  const [imeiMode, setImeiMode] = useState("dual"); // "dual" (IMEI 1 & IMEI 2) or "single"
  const [dualImeiLines, setDualImeiLines] = useState([{ imei1: "", imei2: "" }]);
  const [imeiLines, setImeiLines] = useState([""]);
  const [nextFocusId, setNextFocusId] = useState(null);
  const [touchedImeis, setTouchedImeis] = useState(new Set());
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteRawInput, setPasteRawInput] = useState("");
  const [ptaStatus, setPtaStatus] = useState("Approved");
  const [supplierName, setSupplierName] = useState("");
  const [warrantyDuration, setWarrantyDuration] = useState(12);
  const [warrantyType, setWarrantyType] = useState("Official Brand Warranty");

  // Edit Product modal state
  const [editProduct, setEditProduct] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  // Add Stock modal state
  const [stockProduct, setStockProduct] = useState(null);
  const [stockImeiText, setStockImeiText] = useState("");
  const [stockQty, setStockQty] = useState(1);
  const [stockPta, setStockPta] = useState("Approved");
  const [savingStock, setSavingStock] = useState(false);

  // Stable close handlers: the shared Modal refocuses itself whenever onClose changes
  const closeAddModal = useCallback(() => setShowAddModal(false), []);
  const closeEditModal = useCallback(() => setEditProduct(null), []);
  const closeStockModal = useCallback(() => setStockProduct(null), []);

  const categories = ["All", "Smartphones", "Tablets & iPads", "Accessories", "Spare Parts", "Wearables"];
  const usesImeis = IMEI_CATEGORIES.includes(category);

  const filteredProducts = products.filter((p) => {
    if (p.isDeleted) return false;
    const q = searchTerm.trim();
    const qLower = q.toLowerCase();
    const matchesSearch =
      !q ||
      (p.name || "").toLowerCase().includes(qLower) ||
      (p.brand || "").toLowerCase().includes(qLower) ||
      (p.model || "").toLowerCase().includes(qLower) ||
      String(p.barcode || "").includes(q) ||
      (Array.isArray(p.imeis) &&
        p.imeis.some((i) => [i?.imei, i?.imei1, i?.imei2].some((k) => k && String(k).includes(q))));
    const matchesCategory = selectedCategory === "All" || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Focus next scheduled input element smoothly
  useEffect(() => {
    if (nextFocusId !== null) {
      const nextInput = document.getElementById(nextFocusId);
      if (nextInput) {
        nextInput.focus();
        const len = nextInput.value.length;
        nextInput.setSelectionRange(len, len);
      }
      setNextFocusId(null);
    }
  }, [imeiLines, dualImeiLines, nextFocusId]);

  // Dual IMEI Handlers (IMEI 1 & IMEI 2 per device)
  const handleDualImeiChange = (index, field, value) => {
    const digits = value.replace(/\D/g, "").slice(0, 15);
    const updated = [...dualImeiLines];
    updated[index] = { ...updated[index], [field]: digits };

    if (digits.length === 15) {
      if (field === "imei1") {
        setNextFocusId(`imei2-input-${index}`);
      } else if (field === "imei2") {
        if (index === updated.length - 1) {
          updated.push({ imei1: "", imei2: "" });
        }
        setNextFocusId(`imei1-input-${index + 1}`);
      }
    }
    setDualImeiLines(updated);
  };

  const handleDualImeiKeyDown = (e, index, field) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent form auto-submit
      // If input already reached 15 digits, onChange ALREADY performed the auto-advance for this scan.
      // Ignore trailing Enter key from scanner to avoid double-jumping!
      const val = field === "imei1" ? dualImeiLines[index]?.imei1 : dualImeiLines[index]?.imei2;
      if (val && val.length === 15) {
        return;
      }
      if (field === "imei1") {
        setNextFocusId(`imei2-input-${index}`);
      } else if (field === "imei2") {
        if (index === dualImeiLines.length - 1) {
          setDualImeiLines((prev) => [...prev, { imei1: "", imei2: "" }]);
        }
        setNextFocusId(`imei1-input-${index + 1}`);
      }
    } else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      if (field === "imei1") {
        setNextFocusId(`imei2-input-${index}`);
      } else if (field === "imei2") {
        if (index === dualImeiLines.length - 1) {
          setDualImeiLines((prev) => [...prev, { imei1: "", imei2: "" }]);
        }
        setNextFocusId(`imei1-input-${index + 1}`);
      }
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      if (field === "imei2") {
        setNextFocusId(`imei1-input-${index}`);
      } else if (field === "imei1" && index > 0) {
        setNextFocusId(`imei2-input-${index - 1}`);
      }
    }
  };

  const removeDualImeiLine = (index) => {
    if (dualImeiLines.length === 1) {
      setDualImeiLines([{ imei1: "", imei2: "" }]);
      return;
    }
    setDualImeiLines(dualImeiLines.filter((_, i) => i !== index));
  };

  // Single IMEI Handlers
  const handleSingleImeiChange = (index, value) => {
    const digits = value.replace(/\D/g, "").slice(0, 15);
    const updated = [...imeiLines];
    updated[index] = digits;

    if (digits.length === 15) {
      if (index === updated.length - 1) {
        updated.push("");
      }
      setNextFocusId(`imei-input-${index + 1}`);
      setTouchedImeis((prev) => new Set(prev).add(index));
    }
    setImeiLines(updated);
  };

  const handleSingleImeiKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // If input already reached 15 digits, onChange ALREADY performed the auto-advance.
      // Ignore trailing Enter key from scanner to avoid double-jumping!
      const val = imeiLines[index];
      if (val && val.length === 15) {
        return;
      }
      if (index === imeiLines.length - 1) {
        setImeiLines((prev) => [...prev, ""]);
      }
      setNextFocusId(`imei-input-${index + 1}`);
    } else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      if (index === imeiLines.length - 1) {
        setImeiLines((prev) => [...prev, ""]);
      }
      setNextFocusId(`imei-input-${index + 1}`);
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      if (index > 0) {
        e.preventDefault();
        setNextFocusId(`imei-input-${index - 1}`);
      }
    }
  };

  const removeSingleImeiLine = (index) => {
    if (imeiLines.length === 1) {
      setImeiLines([""]);
      setTouchedImeis(new Set());
      return;
    }
    setImeiLines(imeiLines.filter((_, i) => i !== index));
  };

  // Bulk Paste Helpers
  // Lines of the pasted text (a JSON array gives one line per element)
  const parseBulkLines = (raw) => {
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

  // Single-SIM: every number is its own IMEI
  const parseBulkImeis = (raw) =>
    parseBulkLines(raw)
      .flatMap((line) => line.split(/[,;\s]+/))
      .map((t) => t.replace(/\D/g, "").trim())
      .filter((t) => t.length > 0);

  // Dual-SIM: one phone per line, "imei1,imei2" (comma / tab / space separated); a single value is IMEI 1 only
  const parseDualPairs = (raw) =>
    parseBulkLines(raw)
      .map((line) => line.split(/[,;\s]+/).map((t) => t.replace(/\D/g, "")).filter((t) => /^\d{15}$/.test(t)))
      .filter((t) => t.length > 0)
      .map((t) => ({ imei1: t[0], imei2: t[1] || "" }));

  const pasteCount =
    imeiMode === "dual"
      ? parseDualPairs(pasteRawInput).length
      : parseBulkImeis(pasteRawInput).filter((im) => /^\d{15}$/.test(im)).length;

  // IMEIs already in stock in any product -> product name
  const inStockImeiOwners = () => {
    const owners = new Map();
    products.forEach((p) =>
      (p.imeis || []).forEach((i) => {
        if (i.status === "in_stock") [i.imei, i.imei1, i.imei2].filter(Boolean).forEach((k) => owners.set(k, p.name));
      })
    );
    return owners;
  };

  // IMEIs entered twice, or already in stock somewhere
  const findDuplicateImeis = (units) => {
    const owners = inStockImeiOwners();
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

  const applyPastedImeis = () => {
    if (imeiMode === "dual") {
      const newPairs = parseDualPairs(pasteRawInput);
      if (newPairs.length === 0) return;
      // Append after the rows already typed
      const existing = dualImeiLines.filter((p) => p.imei1 || p.imei2);
      setDualImeiLines([...existing, ...newPairs, { imei1: "", imei2: "" }]);
    } else {
      const parsed = parseBulkImeis(pasteRawInput);
      if (parsed.length === 0) return;
      const existing = imeiLines.filter((im) => /^\d{15}$/.test(im));
      const combined = [...new Set([...existing, ...parsed.filter((im) => /^\d{15}$/.test(im))])];
      setImeiLines([...combined, ""]);
    }
    setPasteMode(false);
    setPasteRawInput("");
  };

  // Prevent Enter key in text inputs from auto-submitting the modal form
  const handleFormKeyDown = (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "submit") {
      e.preventDefault();
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin || savingAdd) return;
    if (!name.trim() || !brand.trim() || purchasePrice === "" || !supplierName.trim()) {
      alert("Please fill in Product Name, Brand, Purchase Price and Supplier Name.");
      return;
    }

    let imeisArr = [];

    if (usesImeis) {
      if (imeiMode === "dual") {
        const hasIncomplete = dualImeiLines.some(
          (p) => (p.imei1.length > 0 && p.imei1.length < 15) || (p.imei2.length > 0 && p.imei2.length < 15)
        );
        if (hasIncomplete) {
          alert("Please make sure all entered IMEI numbers are exactly 15 digits (or leave blank).");
          return;
        }

        const validPairs = dualImeiLines.filter(
          (p) => /^\d{15}$/.test(p.imei1.trim()) || /^\d{15}$/.test(p.imei2.trim())
        );

        if (validPairs.length === 0 && category === "Smartphones") {
          alert("Please enter at least one valid 15-digit IMEI for the smartphone!");
          return;
        }

        // If only IMEI 2 was typed it becomes IMEI 1, so the unit always has imei = imei1
        imeisArr = validPairs.map((p) => {
          const first = p.imei1.trim() || p.imei2.trim();
          const second = p.imei1.trim() ? p.imei2.trim() : "";
          return makeUnit(first, second, ptaStatus);
        });
      } else {
        const hasIncomplete = imeiLines.some((im) => im.length > 0 && im.length < 15);
        if (hasIncomplete) {
          setTouchedImeis((prev) => {
            const next = new Set(prev);
            imeiLines.forEach((im, i) => { if (im.length > 0 && im.length < 15) next.add(i); });
            return next;
          });
          alert("Please make sure all entered IMEI numbers are exactly 15 digits (or leave blank).");
          return;
        }

        const validImeis = imeiLines.filter((im) => /^\d{15}$/.test(im.trim()));
        if (validImeis.length === 0 && category === "Smartphones") {
          alert("Please enter at least one valid 15-digit IMEI for the smartphone!");
          return;
        }

        imeisArr = validImeis.map((im) => makeUnit(im.trim(), "", ptaStatus));
      }

      // Stop on IMEIs typed twice or already in stock in another product
      const dups = findDuplicateImeis(imeisArr);
      if (dups.length > 0) {
        alert(`These IMEIs are duplicates, please remove them:\n${dups.join("\n")}`);
        return;
      }
    }

    setSavingAdd(true);
    const saved = await addProduct({
      name: name.trim(),
      brand: brand.trim(),
      model: model.trim(),
      category,
      purchasePrice: Math.max(0, Number(purchasePrice) || 0),
      salePrice: Math.max(0, Number(salePrice) || 0),
      // Smartphones are counted only by IMEI; other items by a whole, non-negative quantity
      quantity:
        imeisArr.length > 0 || category === "Smartphones" ? imeisArr.length : Math.max(0, Math.floor(Number(quantity) || 0)),
      minStockAlert: Math.max(0, Math.floor(Number(minStockAlert) || 0)),
      warrantyDuration: warrantyType === "No Warranty" ? 0 : Math.max(0, Math.floor(Number(warrantyDuration) || 0)),
      warrantyType,
      imeis: imeisArr,
      supplier: { name: supplierName.trim() },
    });
    setSavingAdd(false);
    // Keep the form filled if the database did not save it
    if (!saved) return;

    setShowAddModal(false);
    // Reset Form State
    setName("");
    setBrand("");
    setModel("");
    setPurchasePrice("");
    setSalePrice("");
    setQuantity(1);
    setImeiLines([""]);
    setDualImeiLines([{ imei1: "", imei2: "" }]);
    setTouchedImeis(new Set());
    setSupplierName("");
    setWarrantyDuration(12);
    setWarrantyType("Official Brand Warranty");
  };

  // ── Edit Product (details only; stock changes go through Add Stock) ──
  const openEditModal = (prod) => {
    setEditProduct(prod);
    setEditForm({
      name: prod.name || "",
      brand: prod.brand || "",
      model: prod.model || "",
      category: prod.category || "Smartphones",
      purchasePrice: prod.purchasePrice ?? "",
      salePrice: prod.salePrice ?? "",
      minStockAlert: prod.minStockAlert ?? 2,
      warrantyDuration: prod.warrantyDuration ?? 12,
      warrantyType: prod.warrantyType || "Official Brand Warranty",
      supplierName: prod.supplier?.name || "",
      supplierPhone: prod.supplier?.phone || "",
    });
  };

  const setEditField = (field, value) => setEditForm((prev) => ({ ...prev, [field]: value }));

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin || !editProduct || savingEdit) return;
    if (!editForm.name.trim() || !editForm.brand.trim()) {
      alert("Product Name and Brand are required.");
      return;
    }
    const supplierName = editForm.supplierName.trim();
    const supplierPhone = editForm.supplierPhone.trim();
    const fields = {
      name: editForm.name.trim(),
      brand: editForm.brand.trim(),
      model: editForm.model.trim(),
      category: editForm.category,
      purchasePrice: Math.max(0, Number(editForm.purchasePrice) || 0),
      salePrice: Math.max(0, Number(editForm.salePrice) || 0),
      minStockAlert: Math.max(0, Math.floor(Number(editForm.minStockAlert) || 0)),
      warrantyDuration:
        editForm.warrantyType === "No Warranty" ? 0 : Math.max(0, Math.floor(Number(editForm.warrantyDuration) || 0)),
      warrantyType: editForm.warrantyType,
      // Sent as `supplier` too, so the screen shows the new supplier even when the server echoes nothing back
      supplier: { name: supplierName, phone: supplierPhone },
      supplierName,
      supplierPhone,
    };

    setSavingEdit(true);
    const ok = await updateProduct(editProduct.id, fields);
    setSavingEdit(false);
    if (ok) setEditProduct(null);
  };

  // ── Add Stock (server appends the new units to the current stock) ──
  const openStockModal = (prod) => {
    setStockProduct(prod);
    setStockImeiText("");
    setStockQty(1);
    setStockPta("Approved");
  };

  const handleAddStockSubmit = async (e) => {
    e.preventDefault();
    if (!isAdmin || !stockProduct || savingStock) return;

    let payload;
    if (isImeiProduct(stockProduct)) {
      // One phone per line: "imei" or dual-SIM "imei1,imei2"
      const units = [];
      const invalid = [];
      stockImeiText.split(/\r?\n/).forEach((line) => {
        const tokens = line.split(/[,;\s]+/).filter(Boolean);
        if (tokens.length === 0) return;
        if (tokens.length > 2 || tokens.some((t) => !/^\d{15}$/.test(t))) {
          invalid.push(line.trim());
          return;
        }
        units.push(makeUnit(tokens[0], tokens[1] || "", stockPta));
      });
      if (invalid.length > 0) {
        alert(`These lines are not valid 15-digit IMEIs:\n${invalid.join("\n")}`);
        return;
      }
      if (units.length === 0) {
        alert("Please enter at least one IMEI.");
        return;
      }
      const dups = findDuplicateImeis(units);
      if (dups.length > 0) {
        alert(`These IMEIs are duplicates, please remove them:\n${dups.join("\n")}`);
        return;
      }
      // A phone counted only by quantity (no IMEIs yet): once IMEIs are added, stock is the IMEI count
      const plainQty = (stockProduct.imeis || []).length === 0 ? Number(stockProduct.quantity || 0) : 0;
      if (
        plainQty > 0 &&
        !window.confirm(
          `${stockProduct.name} has ${plainQty} unit(s) in stock without IMEIs. After adding IMEIs, stock will be counted ` +
            `from IMEIs only (${units.length} unit(s)). Include the IMEIs of the existing units too if they are still in the shop.\n\nContinue?`
        )
      )
        return;
      payload = { imeis: units };
    } else {
      const qty = Math.floor(Number(stockQty));
      if (!qty || qty < 1) {
        alert("Please enter a quantity of at least 1.");
        return;
      }
      payload = { quantity: qty };
    }

    setSavingStock(true);
    const saved = await addStock(stockProduct.id, payload);
    setSavingStock(false);
    if (saved) setStockProduct(null);
  };

  const handleDelete = async (prod) => {
    if (!isAdmin) return;
    if (!window.confirm(`Delete ${prod.name}? ${getProductStock(prod)} unit(s) in stock`)) return;
    await deleteProduct(prod.id);
  };

  const curr = shopSettings.currencySymbol;
  const money = (n) => `${curr} ${n.toLocaleString()}`;
  const categoryOptions = categories.map((c) => ({ value: c, label: c }));

  // Per-row numbers used by both the table (desktop) and the cards (phones)
  const rowInfo = (prod) => {
    const availableImeis = Array.isArray(prod.imeis) ? prod.imeis.filter((i) => i && i.status === "in_stock") : [];
    const stock = getProductStock(prod);
    const isLowStock = stock <= Number(prod.minStockAlert || 0);
    const purchasePriceNum = Number(prod.purchasePrice || 0);
    const salePriceNum = Number(prod.salePrice || 0);
    const profitMargin = salePriceNum - purchasePriceNum;
    return { availableImeis, stock, isLowStock, purchasePriceNum, salePriceNum, profitMargin };
  };

  const productTitle = (prod) => (
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

  return (
    <Page>
      <PageHeader
        title="Inventory"
        description={
          isAdmin
            ? "Products, stock, IMEIs and prices. Add stock, edit or delete a product from its row."
            : "Products, stock levels, IMEIs and sale prices."
        }
        actions={
          /* Only the owner creates / edits / deletes products */
          isAdmin && (
            <Button icon={Plus} onClick={() => setShowAddModal(true)}>
              Add product
            </Button>
          )
        }
      />

      {/* Search & category filter */}
      <Card className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:w-80 shrink-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search name, brand, barcode or IMEI"
            aria-label="Search products"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={cx(inputClass, "pl-9")}
          />
        </div>
        <Segmented options={categoryOptions} value={selectedCategory} onChange={setSelectedCategory} />
      </Card>

      {/* Products */}
      <Card padded={false} className="overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-line flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Products</h2>
          <span className="text-xs text-muted">{filteredProducts.length} shown</span>
        </div>

        {filteredProducts.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={products.length === 0 ? "No products yet" : "No product matches"}
            description={
              products.length === 0
                ? isAdmin
                  ? "Add your first product to start selling."
                  : "The owner has not added any products yet."
                : "Try another name, brand, barcode or IMEI, or pick a different category."
            }
            action={
              products.length === 0 && isAdmin ? (
                <Button icon={Plus} onClick={() => setShowAddModal(true)}>
                  Add product
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            {/* Desktop / tablet table */}
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
                  {filteredProducts.map((prod) => {
                    const { availableImeis, stock, isLowStock, purchasePriceNum, salePriceNum, profitMargin } = rowInfo(prod);
                    return (
                      <tr key={prod.id} className="hover:bg-sunken/60 transition-colors">
                        <Td className="align-top min-w-[12rem]">{productTitle(prod)}</Td>
                        <Td className="align-top">
                          <Badge tone="neutral">{prod.category}</Badge>
                        </Td>
                        <Td className="align-top min-w-[15rem]">
                          <StockBadge stock={stock} isLowStock={isLowStock} />
                          {prod.imeis && prod.imeis.length > 0 && <ImeiList units={availableImeis} />}
                        </Td>
                        <Td className="align-top text-right whitespace-nowrap text-ink-soft">
                          {isAdmin ? money(purchasePriceNum) : "••••••"}
                        </Td>
                        <Td className="align-top text-right whitespace-nowrap font-semibold text-ink">{money(salePriceNum)}</Td>
                        <Td className={`align-top text-right whitespace-nowrap font-semibold ${profitMargin < 0 ? "text-saffron-700" : "text-paid-600"}`}>
                          {isAdmin ? money(profitMargin) : "••••••"}
                        </Td>
                        {isAdmin && (
                          <Td className="align-top text-right">
                            <div className="flex items-center justify-end gap-1">
                              <IconButton icon={PlusCircle} label="Add stock" onClick={() => openStockModal(prod)} />
                              <IconButton icon={Edit2} label="Edit product" onClick={() => openEditModal(prod)} />
                              <IconButton
                                icon={Trash2}
                                label="Delete product"
                                onClick={() => handleDelete(prod)}
                                className="hover:text-khata-600"
                              />
                            </div>
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </TableWrap>
            </div>

            {/* Phone cards */}
            <ul className="md:hidden divide-y divide-line">
              {filteredProducts.map((prod) => {
                const { availableImeis, stock, isLowStock, purchasePriceNum, salePriceNum, profitMargin } = rowInfo(prod);
                return (
                  <li key={prod.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      {productTitle(prod)}
                      <Badge tone="neutral" className="shrink-0">{prod.category}</Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-xl bg-sunken p-2.5 text-xs">
                      <div className="min-w-0">
                        <div className="text-muted">Cost</div>
                        <div className="font-semibold text-ink-soft truncate">{isAdmin ? money(purchasePriceNum) : "••••••"}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-muted">Sale price</div>
                        <div className="font-semibold text-ink truncate">{money(salePriceNum)}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-muted">Profit</div>
                        <div className={`font-semibold truncate ${profitMargin < 0 ? "text-saffron-700" : "text-paid-600"}`}>{isAdmin ? money(profitMargin) : "••••••"}</div>
                      </div>
                    </div>

                    <div>
                      <StockBadge stock={stock} isLowStock={isLowStock} />
                      {prod.imeis && prod.imeis.length > 0 && <ImeiList units={availableImeis} />}
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <Button variant="secondary" icon={PlusCircle} onClick={() => openStockModal(prod)} className="flex-1">
                          Add stock
                        </Button>
                        <Button variant="secondary" icon={Edit2} onClick={() => openEditModal(prod)} className="flex-1">
                          Edit
                        </Button>
                        <IconButton icon={Trash2} label="Delete product" variant="danger-soft" onClick={() => handleDelete(prod)} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {/* Add Product Modal */}
      <Modal
        open={isAdmin && showAddModal}
        onClose={closeAddModal}
        title="Add product"
        description="Phones are added one unit per IMEI. Dual-SIM phones take IMEI 1 and IMEI 2."
        size="lg"
        closeOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={closeAddModal}>Cancel</Button>
            <Button type="submit" form="add-product-form" disabled={savingAdd}>
              {savingAdd ? "Saving…" : "Save product"}
            </Button>
          </>
        }
      >
        <form id="add-product-form" onSubmit={handleAddSubmit} onKeyDown={handleFormKeyDown} className="grid gap-4 sm:grid-cols-2">
          <Field label="Product name *" htmlFor="add-name">
            <Input id="add-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. iPhone 15 Pro Max" />
          </Field>
          <Field label="Brand *" htmlFor="add-brand">
            <Input id="add-brand" type="text" required value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Apple or Samsung" />
          </Field>
          <Field label="Model or variant" htmlFor="add-model">
            <Input id="add-model" type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. 256GB Black" />
          </Field>
          <Field label="Category *" htmlFor="add-category">
            <Select id="add-category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="Smartphones">Smartphones</option>
              <option value="Tablets & iPads">Tablets & iPads</option>
              <option value="Accessories">Accessories</option>
              <option value="Spare Parts">Spare Parts</option>
              <option value="Wearables">Wearables</option>
            </Select>
          </Field>
          <Field label="Purchase price (cost) *" htmlFor="add-cost">
            <Input id="add-cost" type="number" required min="0" inputMode="decimal" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="Rs. cost" />
          </Field>
          <Field label="Sale price" htmlFor="add-sale">
            <Input id="add-sale" type="number" min="0" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Rs. retail" />
          </Field>

          {usesImeis && (
            <div className="sm:col-span-2 space-y-3 rounded-2xl border border-line bg-sunken/60 p-3 sm:p-4">
              {/* Mode & Toolbar */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-line pb-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink flex items-center gap-1.5">
                    <Smartphone size={16} className="text-muted" aria-hidden="true" />
                    <span>IMEIs</span>
                  </p>
                  <p className="text-xs text-muted mt-0.5">Typing or scanning 15 digits jumps to the next box. Nothing saves until you press Save product.</p>
                </div>
                <Segmented
                  size="sm"
                  className="shrink-0"
                  value={pasteMode ? "paste" : imeiMode}
                  onChange={(v) => {
                    if (v === "paste") {
                      setPasteMode(!pasteMode);
                      setPasteRawInput("");
                    } else {
                      setImeiMode(v);
                      setPasteMode(false);
                    }
                  }}
                  options={[
                    { value: "dual", label: "Dual SIM" },
                    { value: "single", label: "Single SIM" },
                    { value: "paste", label: "Paste many" },
                  ]}
                />
              </div>

              {/* ── PASTE MODE ── */}
              {pasteMode ? (
                <div className="space-y-2">
                  <Textarea
                    rows={5}
                    value={pasteRawInput}
                    onChange={(e) => setPasteRawInput(e.target.value)}
                    aria-label="Pasted IMEIs"
                    className="font-mono text-xs"
                    placeholder={
                      imeiMode === "dual"
                        ? `One phone per line, IMEI 1 and IMEI 2:
358921098471201,358921098471219
358921098471227 (IMEI 1 only)`
                        : `Paste IMEIs in any format:
["358921098471201","358921098471202"]
or newline/comma separated...`
                    }
                  />
                  <Button variant="soft" onClick={applyPastedImeis} disabled={pasteCount === 0} className="w-full">
                    Add {pasteCount} {imeiMode === "dual" ? "phone(s)" : "IMEI(s)"}
                  </Button>
                </div>
              ) : imeiMode === "dual" ? (
                /* ── DUAL SIM ENTRY (IMEI 1 & IMEI 2) ── */
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                    <span className="font-semibold text-ink-soft">
                      {dualImeiLines.filter((p) => /^\d{15}$/.test(p.imei1) || /^\d{15}$/.test(p.imei2)).length} phone(s) ready
                    </span>
                    <span className="text-muted">1 phone = IMEI 1 + IMEI 2</span>
                  </div>

                  <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                    {dualImeiLines.map((pair, index) => {
                      const isV1 = /^\d{15}$/.test(pair.imei1);
                      const isV2 = /^\d{15}$/.test(pair.imei2);

                      return (
                        <div key={index} className="rounded-xl border border-line bg-surface p-2.5 space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold text-ink-soft min-h-8">
                            <span>Phone {index + 1}</span>
                            {dualImeiLines.length > 1 && (
                              <IconButton
                                icon={X}
                                size="sm"
                                label={`Remove phone ${index + 1}`}
                                onClick={() => removeDualImeiLine(index)}
                                className="hover:text-khata-600"
                              />
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {/* IMEI 1 */}
                            <div className="relative">
                              <input
                                id={`imei1-input-${index}`}
                                type="text"
                                inputMode="numeric"
                                maxLength={15}
                                value={pair.imei1}
                                onChange={(e) => handleDualImeiChange(index, "imei1", e.target.value)}
                                onKeyDown={(e) => handleDualImeiKeyDown(e, index, "imei1")}
                                placeholder="IMEI 1 (SIM 1)"
                                aria-label={`Phone ${index + 1} IMEI 1`}
                                className={imeiInputClass(isV1)}
                              />
                              <DigitCount value={pair.imei1} />
                            </div>

                            {/* IMEI 2 */}
                            <div className="relative">
                              <input
                                id={`imei2-input-${index}`}
                                type="text"
                                inputMode="numeric"
                                maxLength={15}
                                value={pair.imei2}
                                onChange={(e) => handleDualImeiChange(index, "imei2", e.target.value)}
                                onKeyDown={(e) => handleDualImeiKeyDown(e, index, "imei2")}
                                placeholder="IMEI 2 (SIM 2)"
                                aria-label={`Phone ${index + 1} IMEI 2`}
                                className={imeiInputClass(isV2)}
                              />
                              <DigitCount value={pair.imei2} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <Button
                    variant="soft"
                    icon={PlusCircle}
                    onClick={() => setDualImeiLines([...dualImeiLines, { imei1: "", imei2: "" }])}
                  >
                    Add another phone
                  </Button>
                </div>
              ) : (
                /* ── SINGLE SIM ENTRY ── */
                <div className="space-y-2">
                  <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                    {imeiLines.map((imei, index) => {
                      const isValid = /^\d{15}$/.test(imei);
                      return (
                        <div key={index} className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-muted w-6 text-right shrink-0 tabular-nums">{index + 1}</span>
                          <div className="relative flex-1 min-w-0">
                            <input
                              id={`imei-input-${index}`}
                              type="text"
                              inputMode="numeric"
                              maxLength={15}
                              value={imei}
                              onChange={(e) => handleSingleImeiChange(index, e.target.value)}
                              onKeyDown={(e) => handleSingleImeiKeyDown(e, index)}
                              placeholder="15-digit IMEI"
                              aria-label={`IMEI ${index + 1}`}
                              className={imeiInputClass(isValid)}
                            />
                            <DigitCount value={imei} />
                          </div>
                          {imeiLines.length > 1 && (
                            <IconButton
                              icon={X}
                              size="sm"
                              label={`Remove IMEI ${index + 1}`}
                              onClick={() => removeSingleImeiLine(index)}
                              className="shrink-0 hover:text-khata-600"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <Button variant="soft" icon={PlusCircle} onClick={() => setImeiLines([...imeiLines, ""])}>
                    Add another IMEI
                  </Button>
                </div>
              )}

              {/* PTA Status Selector */}
              <div className="pt-3 border-t border-line">
                <Field label="PTA status" htmlFor="add-pta" className="sm:max-w-xs">
                  <Select id="add-pta" value={ptaStatus} onChange={(e) => setPtaStatus(e.target.value)}>
                    {PTA_OPTIONS}
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {category !== "Smartphones" && (
            <Field label={usesImeis ? "Quantity in stock (if no IMEIs)" : "Quantity in stock"} htmlFor="add-qty">
              <Input id="add-qty" type="number" min="1" inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </Field>
          )}
          <Field label="Low-stock alert at" htmlFor="add-min" hint="Warn when stock falls to this number">
            <Input id="add-min" type="number" min="0" inputMode="numeric" value={minStockAlert} onChange={(e) => setMinStockAlert(e.target.value)} />
          </Field>
          <Field label="Warranty (months)" htmlFor="add-warranty">
            <Input id="add-warranty" type="number" min="0" inputMode="numeric" value={warrantyDuration} onChange={(e) => setWarrantyDuration(e.target.value)} />
          </Field>
          <Field label="Warranty type" htmlFor="add-warranty-type">
            <Select
              id="add-warranty-type"
              value={warrantyType}
              onChange={(e) => {
                setWarrantyType(e.target.value);
                if (e.target.value === "No Warranty") setWarrantyDuration(0);
              }}
            >
              {WARRANTY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Supplier name *" htmlFor="add-supplier" className="sm:col-span-2">
            <Input id="add-supplier" type="text" required value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="e.g. Apple Direct Pakistan" />
          </Field>
        </form>
      </Modal>

      {/* Edit Product Modal */}
      <Modal
        open={isAdmin && !!editProduct}
        onClose={closeEditModal}
        title="Edit product"
        description="Details only. Use Add stock to add new units."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeEditModal}>Cancel</Button>
            <Button type="submit" form="edit-product-form" disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      >
        {editProduct && (
          <form id="edit-product-form" onSubmit={handleEditSubmit} onKeyDown={handleFormKeyDown} className="grid gap-4 sm:grid-cols-2">
            <Field label="Product name *" htmlFor="edit-name">
              <Input id="edit-name" type="text" required value={editForm.name} onChange={(e) => setEditField("name", e.target.value)} />
            </Field>
            <Field label="Brand *" htmlFor="edit-brand">
              <Input id="edit-brand" type="text" required value={editForm.brand} onChange={(e) => setEditField("brand", e.target.value)} />
            </Field>
            <Field label="Model or variant" htmlFor="edit-model">
              <Input id="edit-model" type="text" value={editForm.model} onChange={(e) => setEditField("model", e.target.value)} />
            </Field>
            <Field label="Category *" htmlFor="edit-category">
              <Select id="edit-category" value={editForm.category} onChange={(e) => setEditField("category", e.target.value)}>
                {categories.filter((c) => c !== "All").map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </Field>
            {isAdmin && (
              <Field label="Purchase price (cost) *" htmlFor="edit-cost">
                <Input id="edit-cost" type="number" required min="0" inputMode="decimal" value={editForm.purchasePrice} onChange={(e) => setEditField("purchasePrice", e.target.value)} />
              </Field>
            )}
            <Field label="Sale price" htmlFor="edit-sale">
              <Input id="edit-sale" type="number" min="0" inputMode="decimal" value={editForm.salePrice} onChange={(e) => setEditField("salePrice", e.target.value)} />
            </Field>
            <Field label="Low-stock alert at" htmlFor="edit-min">
              <Input id="edit-min" type="number" min="0" inputMode="numeric" value={editForm.minStockAlert} onChange={(e) => setEditField("minStockAlert", e.target.value)} />
            </Field>
            <Field label="Warranty (months)" htmlFor="edit-warranty">
              <Input id="edit-warranty" type="number" min="0" inputMode="numeric" value={editForm.warrantyDuration} onChange={(e) => setEditField("warrantyDuration", e.target.value)} />
            </Field>
            <Field label="Warranty type" htmlFor="edit-warranty-type">
              <Select
                id="edit-warranty-type"
                value={editForm.warrantyType}
                onChange={(e) => {
                  setEditField("warrantyType", e.target.value);
                  if (e.target.value === "No Warranty") setEditField("warrantyDuration", 0);
                }}
              >
                {WARRANTY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Field label="Supplier name" htmlFor="edit-supplier">
              <Input id="edit-supplier" type="text" value={editForm.supplierName} onChange={(e) => setEditField("supplierName", e.target.value)} />
            </Field>
            <Field label="Supplier phone" htmlFor="edit-supplier-phone">
              <Input id="edit-supplier-phone" type="tel" inputMode="tel" value={editForm.supplierPhone} onChange={(e) => setEditField("supplierPhone", e.target.value)} />
            </Field>
          </form>
        )}
      </Modal>

      {/* Add Stock Modal */}
      <Modal
        open={isAdmin && !!stockProduct}
        onClose={closeStockModal}
        title="Add stock"
        description={stockProduct ? `${stockProduct.name} · ${getProductStock(stockProduct)} unit(s) in stock now` : undefined}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeStockModal}>Cancel</Button>
            <Button type="submit" form="add-stock-form" disabled={savingStock}>
              {savingStock ? "Saving…" : "Add stock"}
            </Button>
          </>
        }
      >
        {stockProduct && (
          <form id="add-stock-form" onSubmit={handleAddStockSubmit} className="space-y-4">
            {isImeiProduct(stockProduct) ? (
              <>
                <Field
                  label="New IMEIs, one phone per line"
                  htmlFor="stock-imeis"
                  hint={`${stockImeiText.split(/\r?\n/).filter((l) => l.trim()).length} phone(s) entered. Dual-SIM: imei1,imei2 on one line.`}
                >
                  <Textarea
                    id="stock-imeis"
                    rows={6}
                    value={stockImeiText}
                    onChange={(e) => setStockImeiText(e.target.value)}
                    className="font-mono text-xs"
                    placeholder={`358921098471201
Dual-SIM: imei1,imei2
358921098471219,358921098471227`}
                  />
                </Field>
                <Field label="PTA status" htmlFor="stock-pta">
                  <Select id="stock-pta" value={stockPta} onChange={(e) => setStockPta(e.target.value)}>
                    {PTA_OPTIONS}
                  </Select>
                </Field>
              </>
            ) : (
              <Field label="Quantity to add" htmlFor="stock-qty">
                <Input id="stock-qty" type="number" min="1" required inputMode="numeric" value={stockQty} onChange={(e) => setStockQty(e.target.value)} />
              </Field>
            )}
          </form>
        )}
      </Modal>
    </Page>
  );
};

export default Inventory;
