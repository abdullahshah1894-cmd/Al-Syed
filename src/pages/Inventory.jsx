import React, { useState, useEffect } from "react";
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

  return (
    <div className="p-6 space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Boxes size={24} className="text-indigo-400" />
            <h1 className="text-xl font-bold text-slate-100">Product & Inventory Management</h1>
          </div>
          <p className="text-xs text-slate-400">
            {isAdmin
              ? "Add/edit products, manage Dual/Single IMEIs, PTA status, pricing, and stock alert limits"
              : "View products, stock levels, IMEIs and sale prices"}
          </p>
        </div>

        {/* Only the owner creates / edits / deletes products */}
        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
          >
            <Plus size={18} />
            <span>Add New Product</span>
          </button>
        )}
      </div>

      {/* Search & Category Filter bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-3">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, brand, IMEI..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto custom-scrollbar pb-1 sm:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 uppercase bg-slate-950/60 rounded-xl">
              <tr>
                <th className="p-3.5 font-semibold">Product Name</th>
                <th className="p-3.5 font-semibold">Category</th>
                <th className="p-3.5 font-semibold">Stock / IMEIs</th>
                <th className="p-3.5 font-semibold">Purchase Price</th>
                <th className="p-3.5 font-semibold">Sale Price</th>
                <th className="p-3.5 font-semibold">Profit Margin</th>
                {isAdmin && <th className="p-3.5 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 7 : 6} className="p-8 text-center text-slate-500">
                    {products.length === 0 ? "No products yet." : "No product matches your search / category."}
                  </td>
                </tr>
              )}
              {filteredProducts.map((prod) => {
                const availableImeis = Array.isArray(prod.imeis) ? prod.imeis.filter((i) => i && i.status === "in_stock") : [];
                const stock = getProductStock(prod);
                const isLowStock = stock <= Number(prod.minStockAlert || 0);
                const purchasePriceNum = Number(prod.purchasePrice || 0);
                const salePriceNum = Number(prod.salePrice || 0);
                const profitMargin = salePriceNum - purchasePriceNum;

                return (
                  <tr key={prod.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3.5">
                      <div className="font-bold text-slate-100">{prod.name}</div>
                      <div className="text-[11px] text-slate-400">{prod.brand} {prod.model}</div>
                      {prod.barcode && (
                        <div className="flex items-center gap-1 font-mono text-[10px] text-indigo-400 mt-0.5">
                          <Barcode size={12} />
                          <span>{prod.barcode}</span>
                        </div>
                      )}
                    </td>

                    <td className="p-3.5">
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-950 text-indigo-300 border border-slate-800">
                        {prod.category}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold px-2.5 py-1 rounded-full text-xs ${
                            isLowStock
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          }`}
                        >
                          {stock} in stock
                        </span>
                        {isLowStock && <AlertTriangle size={14} className="text-amber-400 animate-pulse" />}
                      </div>
                      {prod.imeis && prod.imeis.length > 0 && (
                        <div className="text-[10px] text-slate-400 mt-1.5 space-y-1">
                          <div className="text-slate-500 font-semibold">{availableImeis.length} Available Phone Unit(s):</div>
                          <div className="max-h-20 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                            {availableImeis.map((iObj, idx) => (
                              <div key={`${iObj.imei || iObj.imei1 || ""}-${idx}`} className="font-mono text-[10px] bg-slate-950/70 p-1 rounded border border-slate-800 flex items-center justify-between gap-1">
                                <span className="text-cyan-300">
                                  {iObj.imei1 ? `SIM 1: ${iObj.imei1}` : `IMEI: ${iObj.imei}`}
                                  {iObj.imei2 ? ` | SIM 2: ${iObj.imei2}` : ""}
                                </span>
                                {iObj.ptaStatus && (
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/40">
                                    {iObj.ptaStatus}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>

                    <td className="p-3.5 font-semibold text-slate-300">
                      {isAdmin ? `${shopSettings.currencySymbol} ${purchasePriceNum.toLocaleString()}` : "••••••"}
                    </td>

                    <td className="p-3.5 font-bold text-indigo-400">
                      {shopSettings.currencySymbol} {salePriceNum.toLocaleString()}
                    </td>

                    <td className="p-3.5 font-bold text-emerald-400">
                      {isAdmin ? `${shopSettings.currencySymbol} ${profitMargin.toLocaleString()}` : "••••••"}
                    </td>

                    {isAdmin && (
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openStockModal(prod)}
                          className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Add Stock"
                        >
                          <PlusCircle size={16} />
                        </button>
                        <button
                          onClick={() => openEditModal(prod)}
                          className="p-2 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Edit Product"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(prod)}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Delete Product"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {isAdmin && showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Add New Product / Smartphone</h3>
                <p className="text-[11px] text-slate-400">Add multiple units or Dual-SIM (IMEI 1 & IMEI 2) per phone</p>
              </div>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} onKeyDown={handleFormKeyDown} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-400">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. iPhone 15 Pro Max"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-400">Brand *</label>
                  <input
                    type="text"
                    required
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Apple / Samsung"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-400">Model / Variant</label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. 256GB Black"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-400">Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Smartphones">Smartphones</option>
                    <option value="Tablets & iPads">Tablets & iPads</option>
                    <option value="Accessories">Accessories</option>
                    <option value="Spare Parts">Spare Parts</option>
                    <option value="Wearables">Wearables</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-400">Purchase Price (Cost) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={purchasePrice}
                    onChange={(e) => setPurchasePrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                    placeholder="Rs. Cost"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-400">Sale Price</label>
                  <input
                    type="number"
                    min="0"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                    placeholder="Rs. Retail"
                  />
                </div>
              </div>

              {usesImeis && (
                <div className="space-y-3 p-3.5 bg-indigo-950/30 border border-indigo-900/40 rounded-2xl">
                  {/* Mode & Toolbar */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-indigo-900/40 pb-2.5">
                    <div>
                      <label className="font-bold text-indigo-300 flex items-center gap-1.5">
                        <Smartphone size={16} />
                        <span>IMEI Entry Mode</span>
                      </label>
                      <p className="text-[10px] text-slate-400">Pressing Enter or typing 15 digits auto-jumps to next IMEI without auto-saving</p>
                    </div>

                    <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() => { setImeiMode("dual"); setPasteMode(false); }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          imeiMode === "dual" && !pasteMode
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Dual-SIM (IMEI 1 & 2)
                      </button>
                      <button
                        type="button"
                        onClick={() => { setImeiMode("single"); setPasteMode(false); }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          imeiMode === "single" && !pasteMode
                            ? "bg-indigo-600 text-white shadow"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        Single-SIM
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPasteMode(!pasteMode); setPasteRawInput(""); }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                          pasteMode
                            ? "bg-cyan-600 text-white shadow"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        ⊞ Bulk Paste
                      </button>
                    </div>
                  </div>

                  {/* ── PASTE MODE ── */}
                  {pasteMode ? (
                    <div className="space-y-2">
                      <textarea
                        rows={5}
                        value={pasteRawInput}
                        onChange={(e) => setPasteRawInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
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
                      <button
                        type="button"
                        onClick={applyPastedImeis}
                        disabled={pasteCount === 0}
                        className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow"
                      >
                        Import {pasteCount} {imeiMode === "dual" ? "Phone(s)" : "IMEI(s)"}
                      </button>
                    </div>
                  ) : imeiMode === "dual" ? (
                    /* ── DUAL SIM ENTRY (IMEI 1 & IMEI 2) ── */
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-300">Dual SIM Phones ({dualImeiLines.filter(p => /^\d{15}$/.test(p.imei1) || /^\d{15}$/.test(p.imei2)).length} Device(s))</span>
                        <span className="text-[10px] text-indigo-400">1 Device = IMEI 1 + IMEI 2</span>
                      </div>

                      <div className="space-y-2 max-h-52 overflow-y-auto custom-scrollbar pr-1">
                        {dualImeiLines.map((pair, index) => {
                          const isV1 = /^\d{15}$/.test(pair.imei1);
                          const isV2 = /^\d{15}$/.test(pair.imei2);

                          return (
                            <div key={index} className="p-2 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                                <span>Device #{index + 1}</span>
                                {dualImeiLines.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeDualImeiLine(index)}
                                    className="text-slate-500 hover:text-red-400 transition-colors"
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                              </div>

                              <div className="grid grid-cols-2 gap-2">
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
                                    placeholder="IMEI 1 (SIM 1)..."
                                    className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none transition-all ${
                                      isV1 ? "border-emerald-500/60 focus:border-emerald-400" : "border-slate-800 focus:border-indigo-500"
                                    }`}
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-500">
                                    {pair.imei1.length}/15
                                  </span>
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
                                    placeholder="IMEI 2 (SIM 2)..."
                                    className={`w-full bg-slate-900 border rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100 focus:outline-none transition-all ${
                                      isV2 ? "border-emerald-500/60 focus:border-emerald-400" : "border-slate-800 focus:border-indigo-500"
                                    }`}
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-500">
                                    {pair.imei2.length}/15
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => setDualImeiLines([...dualImeiLines, { imei1: "", imei2: "" }])}
                        className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors pt-1"
                      >
                        <PlusCircle size={13} />
                        <span>Add another Dual-SIM Phone Device</span>
                      </button>
                    </div>
                  ) : (
                    /* ── SINGLE SIM ENTRY ── */
                    <div className="space-y-2">
                      <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                        {imeiLines.map((imei, index) => {
                          const isValid = /^\d{15}$/.test(imei);
                          return (
                            <div key={index} className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-500 w-5 text-right shrink-0">#{index + 1}</span>
                              <div className="relative flex-1">
                                <input
                                  id={`imei-input-${index}`}
                                  type="text"
                                  inputMode="numeric"
                                  maxLength={15}
                                  value={imei}
                                  onChange={(e) => handleSingleImeiChange(index, e.target.value)}
                                  onKeyDown={(e) => handleSingleImeiKeyDown(e, index)}
                                  placeholder="Enter 15-digit IMEI..."
                                  className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none transition-all ${
                                    isValid ? "border-emerald-500/60 focus:border-emerald-400" : "border-slate-800 focus:border-indigo-500"
                                  }`}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">
                                  {imei.length}/15
                                </span>
                              </div>
                              {imeiLines.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeSingleImeiLine(index)}
                                  className="p-1 text-slate-500 hover:text-red-400 transition-colors shrink-0"
                                >
                                  <X size={13} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => setImeiLines([...imeiLines, ""])}
                        className="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                      >
                        <PlusCircle size={13} />
                        <span>Add another Single-SIM IMEI row</span>
                      </button>
                    </div>
                  )}

                  {/* PTA Status Selector */}
                  <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-indigo-900/40">
                    <span className="text-slate-400">PTA Approval Status:</span>
                    <select
                      value={ptaStatus}
                      onChange={(e) => setPtaStatus(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg p-1 text-cyan-400 font-bold"
                    >
                      <option value="Approved">PTA Approved</option>
                      <option value="Non-PTA">Non-PTA</option>
                      <option value="CPID">CPID Approved</option>
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                {category !== "Smartphones" && (
                  <div>
                    <label className="font-semibold text-slate-400">
                      {usesImeis ? "Quantity Stock (if no IMEIs)" : "Quantity Stock"}
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1"
                    />
                  </div>
                )}

                <div>
                  <label className="font-semibold text-slate-400">Min Stock Alert Level</label>
                  <input
                    type="number"
                    min="0"
                    value={minStockAlert}
                    onChange={(e) => setMinStockAlert(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-400">Warranty Duration (Months)</label>
                  <input
                    type="number"
                    min="0"
                    value={warrantyDuration}
                    onChange={(e) => setWarrantyDuration(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-400">Warranty Type</label>
                  <select
                    value={warrantyType}
                    onChange={(e) => {
                      setWarrantyType(e.target.value);
                      if (e.target.value === "No Warranty") setWarrantyDuration(0);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  >
                    {WARRANTY_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-400">
                  Supplier Name
                  <span className="ml-1 text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Apple Direct Pakistan"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingAdd}
                  className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 disabled:opacity-50 shadow"
                >
                  {savingAdd ? "Saving..." : "Save Product"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {isAdmin && editProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Edit Product</h3>
                <p className="text-[11px] text-slate-400">Details only. Use Add Stock to add new units.</p>
              </div>
              <button onClick={() => setEditProduct(null)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} onKeyDown={handleFormKeyDown} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-400">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditField("name", e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-400">Brand *</label>
                  <input
                    type="text"
                    required
                    value={editForm.brand}
                    onChange={(e) => setEditField("brand", e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-400">Model / Variant</label>
                  <input
                    type="text"
                    value={editForm.model}
                    onChange={(e) => setEditField("model", e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-400">Category *</label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditField("category", e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  >
                    {categories.filter((c) => c !== "All").map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {isAdmin && (
                  <div>
                    <label className="font-semibold text-slate-400">Purchase Price (Cost) *</label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={editForm.purchasePrice}
                      onChange={(e) => setEditField("purchasePrice", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}

                <div>
                  <label className="font-semibold text-slate-400">Sale Price</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.salePrice}
                    onChange={(e) => setEditField("salePrice", e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-400">Min Stock Alert Level</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.minStockAlert}
                    onChange={(e) => setEditField("minStockAlert", e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-400">Warranty Duration (Months)</label>
                  <input
                    type="number"
                    min="0"
                    value={editForm.warrantyDuration}
                    onChange={(e) => setEditField("warrantyDuration", e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-400">Warranty Type</label>
                  <select
                    value={editForm.warrantyType}
                    onChange={(e) => {
                      setEditField("warrantyType", e.target.value);
                      if (e.target.value === "No Warranty") setEditField("warrantyDuration", 0);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  >
                    {WARRANTY_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-400">Supplier Name</label>
                  <input
                    type="text"
                    value={editForm.supplierName}
                    onChange={(e) => setEditField("supplierName", e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-400">Supplier Phone</label>
                  <input
                    type="text"
                    value={editForm.supplierPhone}
                    onChange={(e) => setEditField("supplierPhone", e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditProduct(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 disabled:opacity-50 shadow"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Stock Modal */}
      {isAdmin && stockProduct && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-base">Add Stock</h3>
                <p className="text-[11px] text-slate-400">
                  {stockProduct.name} • {getProductStock(stockProduct)} unit(s) in stock now
                </p>
              </div>
              <button onClick={() => setStockProduct(null)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddStockSubmit} className="space-y-3 text-xs">
              {isImeiProduct(stockProduct) ? (
                <>
                  <div>
                    <label className="font-semibold text-slate-400 flex items-center gap-1.5">
                      <Smartphone size={14} />
                      <span>New IMEIs (one phone per line)</span>
                    </label>
                    <textarea
                      rows={6}
                      value={stockImeiText}
                      onChange={(e) => setStockImeiText(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-100 placeholder-slate-600 mt-1 focus:outline-none focus:border-indigo-500 resize-none"
                      placeholder={`358921098471201
Dual-SIM: imei1,imei2
358921098471219,358921098471227`}
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      {stockImeiText.split(/\r?\n/).filter((l) => l.trim()).length} phone(s) entered
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">PTA Approval Status:</span>
                    <select
                      value={stockPta}
                      onChange={(e) => setStockPta(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-lg p-1 text-cyan-400 font-bold"
                    >
                      <option value="Approved">PTA Approved</option>
                      <option value="Non-PTA">Non-PTA</option>
                      <option value="CPID">CPID Approved</option>
                    </select>
                  </div>
                </>
              ) : (
                <div>
                  <label className="font-semibold text-slate-400">Quantity to Add</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStockProduct(null)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingStock}
                  className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 disabled:opacity-50 shadow"
                >
                  {savingStock ? "Saving..." : "Add Stock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
