import React, { useState, useEffect } from "react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import {
  Boxes,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  Barcode,
  Smartphone,
  Edit2,
  Trash2,
  X,
  PlusCircle,
  SmartphoneNfc,
} from "lucide-react";

const Inventory = () => {
  const { products, addProduct, updateProduct, deleteProduct, shopSettings } = useApp();
  const { isAdmin } = useAuth();

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);

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

  const categories = ["All", "Smartphones", "Tablets & iPads", "Accessories", "Spare Parts", "Wearables"];

  const filteredProducts = products.filter((p) => {
    const qLower = searchTerm.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(qLower) ||
      p.brand.toLowerCase().includes(qLower) ||
      (p.barcode && p.barcode.includes(searchTerm)) ||
      (p.imeis &&
        p.imeis.some(
          (i) =>
            (i.imei && i.imei.includes(searchTerm)) ||
            (i.imei1 && i.imei1.includes(searchTerm)) ||
            (i.imei2 && i.imei2.includes(searchTerm))
        ));
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

  // Bulk Paste Helper
  const parseBulkImeis = (raw) => {
    let tokens = [];
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          tokens = parsed.map(String);
        }
      } catch (_) {}
    }
    if (tokens.length === 0) {
      tokens = raw.split(/[,\n;\s]+/);
    }
    return tokens
      .map((t) => t.replace(/\D/g, "").trim())
      .filter((t) => t.length > 0);
  };

  const applyPastedImeis = () => {
    const parsed = parseBulkImeis(pasteRawInput);
    if (parsed.length === 0) return;

    if (imeiMode === "dual") {
      const validDigits = parsed.filter((im) => /^\d{15}$/.test(im));
      const newPairs = [];
      for (let i = 0; i < validDigits.length; i += 2) {
        newPairs.push({
          imei1: validDigits[i] || "",
          imei2: validDigits[i + 1] || "",
        });
      }
      setDualImeiLines([...newPairs, { imei1: "", imei2: "" }]);
    } else {
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
    if (!name || !brand || !purchasePrice || !supplierName) return;

    let imeisArr = [];

    if (category === "Smartphones") {
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

        if (validPairs.length === 0) {
          alert("Please enter at least one valid 15-digit IMEI for the smartphone!");
          return;
        }

        imeisArr = validPairs.map((p) => {
          const main = p.imei1.trim() || p.imei2.trim();
          return {
            imei: main,
            imei1: p.imei1.trim(),
            imei2: p.imei2.trim(),
            status: "in_stock",
            ptaStatus: ptaStatus,
          };
        });
      } else {
        const hasIncomplete = imeiLines.some((im) => im.length > 0 && im.length < 15);
        if (hasIncomplete) {
          setTouchedImeis((prev) => {
            const next = new Set(prev);
            imeiLines.forEach((im, i) => { if (im.length > 0 && im.length < 15) next.add(i); });
            return next;
          });
          return;
        }

        const validImeis = imeiLines.filter((im) => /^\d{15}$/.test(im.trim()));
        if (validImeis.length === 0) {
          alert("Please enter at least one valid 15-digit IMEI for the smartphone!");
          return;
        }

        imeisArr = validImeis.map((im) => ({
          imei: im.trim(),
          status: "in_stock",
          ptaStatus: ptaStatus,
        }));
      }
    }

    const saved = await addProduct({
      name,
      brand,
      model,
      category,
      purchasePrice: Number(purchasePrice),
      salePrice: Number(salePrice),
      quantity: imeisArr.length > 0 ? imeisArr.length : Number(quantity),
      minStockAlert: Number(minStockAlert),
      imeis: imeisArr,
      supplier: { name: supplierName },
    });
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
            Add/edit products, manage Dual/Single IMEIs, PTA status, pricing, and stock alert limits
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
        >
          <Plus size={18} />
          <span>Add New Product</span>
        </button>
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
                <th className="p-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredProducts.map((prod) => {
                const availableImeis = prod.imeis && prod.imeis.length > 0 ? prod.imeis.filter((i) => i.status === "in_stock") : [];
                const stock = prod.imeis && prod.imeis.length > 0 ? availableImeis.length : Number(prod.quantity || 0);
                const isLowStock = stock <= prod.minStockAlert;
                const profitMargin = prod.salePrice - prod.purchasePrice;

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
                              <div key={idx} className="font-mono text-[10px] bg-slate-950/70 p-1 rounded border border-slate-800 flex items-center justify-between gap-1">
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
                      {isAdmin ? `${shopSettings.currencySymbol} ${prod.purchasePrice.toLocaleString()}` : "••••••"}
                    </td>

                    <td className="p-3.5 font-bold text-indigo-400">
                      {shopSettings.currencySymbol} {prod.salePrice.toLocaleString()}
                    </td>

                    <td className="p-3.5 font-bold text-emerald-400">
                      {isAdmin ? `${shopSettings.currencySymbol} ${profitMargin.toLocaleString()}` : "••••••"}
                    </td>

                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => deleteProduct(prod.id)}
                          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                          title="Delete Product"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
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

              {category === "Smartphones" ? (
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
                        placeholder={`Paste IMEIs in any format:
["358921098471201","358921098471202"]
or newline/comma separated...`}
                      />
                      <button
                        type="button"
                        onClick={applyPastedImeis}
                        disabled={parseBulkImeis(pasteRawInput).filter((im) => /^\d{15}$/.test(im)).length === 0}
                        className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow"
                      >
                        Import {parseBulkImeis(pasteRawInput).filter((im) => /^\d{15}$/.test(im)).length} IMEI(s)
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
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-400">Quantity Stock</label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-slate-400">Min Stock Alert Level</label>
                    <input
                      type="number"
                      min="1"
                      value={minStockAlert}
                      onChange={(e) => setMinStockAlert(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-100 mt-1"
                    />
                  </div>
                </div>
              )}

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
                  className="px-5 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 shadow"
                >
                  Save Product
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
