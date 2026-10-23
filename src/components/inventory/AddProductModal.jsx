import { useState, useEffect, useRef, useMemo } from "react";
import { Smartphone, X, PlusCircle } from "lucide-react";
import { Button, IconButton, Field, Input, Select, Textarea, Segmented, Modal } from "../ui";
import {
  CATEGORIES, IMEI_CATEGORIES, WARRANTY_TYPES, isFullImei, imeiInputClass, makeUnit,
  inStockImeiOwners, findDuplicateImeis, preventEnterSubmit, analysePaste,
} from "./shared";
import { DigitCount, PtaOptions } from "./parts";

const EMPTY_PAIR = { imei1: "", imei2: "" };

// "5 valid · 2 duplicates removed · 1 invalid"
const pasteSummary = ({ units, duplicates, invalid }, dual) =>
  [
    `${units.length} valid ${dual ? "phone" : "IMEI"}${units.length === 1 ? "" : "s"}`,
    duplicates.length > 0 && `${duplicates.length} duplicate${duplicates.length === 1 ? "" : "s"} removed`,
    invalid.length > 0 && `${invalid.length} invalid`,
  ]
    .filter(Boolean)
    .join(" · ");

// The Add product form keeps its own state, so typing or scanning re-renders only this form
// (not the product list). It is mounted only while open, so every Add starts from the defaults.
const AddProductModal = ({ onClose, products, addProduct }) => {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [barcode, setBarcode] = useState("");
  const [category, setCategory] = useState("Smartphones");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [minStockAlert, setMinStockAlert] = useState(2);
  const [ptaStatus, setPtaStatus] = useState("Approved");
  const [supplierName, setSupplierName] = useState("");
  const [warrantyDuration, setWarrantyDuration] = useState(12);
  const [warrantyType, setWarrantyType] = useState("Official Brand Warranty");

  // IMEI entry
  const [imeiMode, setImeiMode] = useState("dual"); // "dual" (IMEI 1 & IMEI 2) or "single"
  const [dualImeiLines, setDualImeiLines] = useState([EMPTY_PAIR]);
  const [imeiLines, setImeiLines] = useState([""]);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteRawInput, setPasteRawInput] = useState("");
  const [pasteNote, setPasteNote] = useState(null); // result of the last paste

  const usesImeis = IMEI_CATEGORIES.includes(category);
  const owners = useMemo(() => inStockImeiOwners(products), [products]);

  // Move focus to another IMEI box. A box that does not exist yet (a new row) is focused after the next render.
  const pendingFocus = useRef(null);
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    const el = document.getElementById(id);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });
  const focusBox = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    } else pendingFocus.current = id;
  };

  // ── Dual SIM (IMEI 1 & IMEI 2 per phone) ──
  const handleDualImeiChange = (index, field, value) => {
    const digits = value.replace(/\D/g, "").slice(0, 15);
    const updated = [...dualImeiLines];
    updated[index] = { ...updated[index], [field]: digits };
    if (digits.length === 15) {
      if (field === "imei1") pendingFocus.current = `imei2-input-${index}`;
      else {
        if (index === updated.length - 1) updated.push(EMPTY_PAIR);
        pendingFocus.current = `imei1-input-${index + 1}`;
      }
    }
    setDualImeiLines(updated);
  };

  const dualNext = (index, field) => {
    if (field === "imei1") {
      focusBox(`imei2-input-${index}`);
      return;
    }
    if (index === dualImeiLines.length - 1) setDualImeiLines((prev) => [...prev, EMPTY_PAIR]);
    focusBox(`imei1-input-${index + 1}`);
  };

  const handleDualImeiKeyDown = (e, index, field) => {
    if (e.key === "Enter") {
      e.preventDefault();
      // At 15 digits onChange already moved on; ignore the scanner's trailing Enter
      if (isFullImei(dualImeiLines[index]?.[field])) return;
      dualNext(index, field);
    } else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      dualNext(index, field);
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      if (field === "imei2") focusBox(`imei1-input-${index}`);
      else if (index > 0) focusBox(`imei2-input-${index - 1}`);
    }
  };

  const removeDualImeiLine = (index) =>
    setDualImeiLines((prev) => (prev.length === 1 ? [EMPTY_PAIR] : prev.filter((_, i) => i !== index)));

  // ── Single SIM ──
  const handleSingleImeiChange = (index, value) => {
    const digits = value.replace(/\D/g, "").slice(0, 15);
    const updated = [...imeiLines];
    updated[index] = digits;
    if (digits.length === 15) {
      if (index === updated.length - 1) updated.push("");
      pendingFocus.current = `imei-input-${index + 1}`;
    }
    setImeiLines(updated);
  };

  const singleNext = (index) => {
    if (index === imeiLines.length - 1) setImeiLines((prev) => [...prev, ""]);
    focusBox(`imei-input-${index + 1}`);
  };

  const handleSingleImeiKeyDown = (e, index) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isFullImei(imeiLines[index])) return;
      singleNext(index);
    } else if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      singleNext(index);
    } else if ((e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) && index > 0) {
      e.preventDefault();
      focusBox(`imei-input-${index - 1}`);
    }
  };

  const removeSingleImeiLine = (index) =>
    setImeiLines((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== index)));

  // ── Paste many ──
  const dual = imeiMode === "dual";
  const typedImeis = useMemo(() => {
    const s = new Set();
    if (dual) dualImeiLines.forEach((p) => [p.imei1, p.imei2].filter(isFullImei).forEach((k) => s.add(k)));
    else imeiLines.filter(isFullImei).forEach((k) => s.add(k));
    return s;
  }, [dual, dualImeiLines, imeiLines]);
  const paste = useMemo(() => {
    if (!pasteMode || !pasteRawInput.trim()) return null;
    const taken = new Set([...typedImeis, ...owners.keys()]);
    return analysePaste(pasteRawInput, dual, taken);
  }, [pasteMode, pasteRawInput, dual, typedImeis, owners]);
  const pasteCount = paste ? paste.units.length : 0;

  const applyPastedImeis = () => {
    if (!paste || paste.units.length === 0) return;
    if (dual) {
      const existing = dualImeiLines.filter((p) => p.imei1 || p.imei2);
      setDualImeiLines([...existing, ...paste.units, EMPTY_PAIR]);
    } else {
      const existing = imeiLines.filter(isFullImei);
      setImeiLines([...existing, ...paste.units.map((u) => u.imei1), ""]);
    }
    setPasteNote({ text: `Added ${pasteSummary(paste, dual)}`, invalid: paste.invalid, duplicates: paste.duplicates });
    setPasteMode(false);
    setPasteRawInput("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!name.trim() || !brand.trim() || purchasePrice === "" || !supplierName.trim()) {
      alert("Please fill in Product Name, Brand, Purchase Price and Supplier Name.");
      return;
    }

    let imeisArr = [];
    if (usesImeis) {
      if (dual) {
        const hasIncomplete = dualImeiLines.some(
          (p) => (p.imei1.length > 0 && p.imei1.length < 15) || (p.imei2.length > 0 && p.imei2.length < 15)
        );
        if (hasIncomplete) {
          alert("Please make sure all entered IMEI numbers are exactly 15 digits (or leave blank).");
          return;
        }
        const validPairs = dualImeiLines.filter((p) => isFullImei(p.imei1) || isFullImei(p.imei2));
        if (validPairs.length === 0 && category === "Smartphones") {
          alert("Please enter at least one valid 15-digit IMEI for the smartphone!");
          return;
        }
        // If only IMEI 2 was typed it becomes IMEI 1, so the unit always has imei = imei1
        imeisArr = validPairs.map((p) => makeUnit(p.imei1 || p.imei2, p.imei1 ? p.imei2 : "", ptaStatus));
      } else {
        if (imeiLines.some((im) => im.length > 0 && im.length < 15)) {
          alert("Please make sure all entered IMEI numbers are exactly 15 digits (or leave blank).");
          return;
        }
        const validImeis = imeiLines.filter(isFullImei);
        if (validImeis.length === 0 && category === "Smartphones") {
          alert("Please enter at least one valid 15-digit IMEI for the smartphone!");
          return;
        }
        imeisArr = validImeis.map((im) => makeUnit(im, "", ptaStatus));
      }

      // Stop on IMEIs typed twice or already in stock in another product
      const dups = findDuplicateImeis(imeisArr, owners);
      if (dups.length > 0) {
        alert(`These IMEIs are duplicates, please remove them:\n${dups.join("\n")}`);
        return;
      }
    }

    setSaving(true);
    const saved = await addProduct({
      name: name.trim(),
      brand: brand.trim(),
      model: model.trim(),
      // Blank: the database gives the product the next free barcode
      barcode: barcode.trim(),
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
    setSaving(false);
    // Keep the form filled if the database did not save it; closing unmounts it, so the next Add starts clean
    if (saved) onClose();
  };

  const readyPhones = dualImeiLines.filter((p) => isFullImei(p.imei1) || isFullImei(p.imei2)).length;

  return (
    <Modal
      open
      onClose={onClose}
      title="Add product"
      description="Phones are added one unit per IMEI. Dual-SIM phones take IMEI 1 and IMEI 2."
      size="lg"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-product-form" disabled={saving}>
            {saving ? "Saving…" : "Save product"}
          </Button>
        </>
      }
    >
      <form id="add-product-form" onSubmit={handleSubmit} onKeyDown={preventEnterSubmit} className="grid gap-4 sm:grid-cols-2">
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
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Purchase price (cost) *" htmlFor="add-cost">
          <Input id="add-cost" type="number" required min="0" inputMode="decimal" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} placeholder="Rs. cost" />
        </Field>
        <Field label="Sale price" htmlFor="add-sale">
          <Input id="add-sale" type="number" min="0" inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Rs. retail" />
        </Field>
        <Field label="Barcode" htmlFor="add-barcode" hint="Leave blank and the shop gives it a new barcode." className="sm:col-span-2">
          <Input id="add-barcode" type="text" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Scan the box barcode (optional)" className="font-mono" />
        </Field>

        {usesImeis && (
          <div className="sm:col-span-2 space-y-3 rounded-2xl border border-line bg-sunken/60 p-3 sm:p-4">
            {/* Mode & toolbar */}
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
                  setPasteNote(null);
                }}
                options={[
                  { value: "dual", label: "Dual SIM" },
                  { value: "single", label: "Single SIM" },
                  { value: "paste", label: "Paste many" },
                ]}
              />
            </div>

            {pasteNote && !pasteMode && (
              <div role="status" className="rounded-xl bg-surface border border-line px-3 py-2 text-xs space-y-1">
                <p className="font-semibold text-ink-soft">{pasteNote.text}</p>
                {pasteNote.invalid.length > 0 && (
                  <p className="text-saffron-700">
                    Not added (not 15 digits): <span className="font-mono break-words">{pasteNote.invalid.join(", ")}</span>
                  </p>
                )}
                {pasteNote.duplicates.length > 0 && (
                  <p className="text-muted">
                    Duplicates removed: <span className="font-mono break-words">{pasteNote.duplicates.join(", ")}</span>
                  </p>
                )}
              </div>
            )}

            {pasteMode ? (
              /* ── PASTE MODE ── */
              <div className="space-y-2">
                <Textarea
                  rows={5}
                  value={pasteRawInput}
                  onChange={(e) => setPasteRawInput(e.target.value)}
                  aria-label="Pasted IMEIs"
                  className="font-mono text-xs"
                  placeholder={
                    dual
                      ? "One phone per line, IMEI 1 and IMEI 2:\n358921098471201,358921098471219\n358921098471227"
                      : 'Paste IMEIs in any format:\n["358921098471201","358921098471202"]\nor newline/comma separated...'
                  }
                />
                {paste && (
                  <div role="status" className="rounded-xl bg-surface border border-line px-3 py-2 text-xs space-y-1">
                    <p className="font-semibold text-ink-soft">{pasteSummary(paste, dual)}</p>
                    {paste.invalid.length > 0 && (
                      <p className="text-saffron-700">
                        Invalid (not 15 digits, will be skipped):{" "}
                        <span className="font-mono break-words">{paste.invalid.slice(0, 20).join(", ")}{paste.invalid.length > 20 ? " …" : ""}</span>
                      </p>
                    )}
                    {paste.duplicates.length > 0 && (
                      <p className="text-muted">
                        Duplicates (pasted twice, already typed or already in stock):{" "}
                        <span className="font-mono break-words">{paste.duplicates.slice(0, 20).join(", ")}{paste.duplicates.length > 20 ? " …" : ""}</span>
                      </p>
                    )}
                  </div>
                )}
                <Button variant="soft" onClick={applyPastedImeis} disabled={pasteCount === 0} className="w-full">
                  Add {pasteCount} {dual ? (pasteCount === 1 ? "phone" : "phones") : pasteCount === 1 ? "IMEI" : "IMEIs"}
                </Button>
              </div>
            ) : dual ? (
              /* ── DUAL SIM ENTRY (IMEI 1 & IMEI 2) ── */
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                  <span className="font-semibold text-ink-soft">{readyPhones} phone(s) ready</span>
                  <span className="text-muted">1 phone = IMEI 1 + IMEI 2</span>
                </div>

                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {dualImeiLines.map((pair, index) => (
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
                        {["imei1", "imei2"].map((field) => (
                          <div key={field} className="relative">
                            <input
                              id={`${field}-input-${index}`}
                              type="text"
                              inputMode="numeric"
                              autoComplete="off"
                              maxLength={15}
                              value={pair[field]}
                              onChange={(e) => handleDualImeiChange(index, field, e.target.value)}
                              onKeyDown={(e) => handleDualImeiKeyDown(e, index, field)}
                              placeholder={field === "imei1" ? "IMEI 1 (SIM 1)" : "IMEI 2 (SIM 2)"}
                              aria-label={`Phone ${index + 1} ${field === "imei1" ? "IMEI 1" : "IMEI 2"}`}
                              className={imeiInputClass(isFullImei(pair[field]))}
                            />
                            <DigitCount value={pair[field]} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <Button variant="soft" icon={PlusCircle} onClick={() => setDualImeiLines((prev) => [...prev, EMPTY_PAIR])}>
                  Add another phone
                </Button>
              </div>
            ) : (
              /* ── SINGLE SIM ENTRY ── */
              <div className="space-y-2">
                <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                  {imeiLines.map((imei, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted w-6 text-right shrink-0 tabular-nums">{index + 1}</span>
                      <div className="relative flex-1 min-w-0">
                        <input
                          id={`imei-input-${index}`}
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={15}
                          value={imei}
                          onChange={(e) => handleSingleImeiChange(index, e.target.value)}
                          onKeyDown={(e) => handleSingleImeiKeyDown(e, index)}
                          placeholder="15-digit IMEI"
                          aria-label={`IMEI ${index + 1}`}
                          className={imeiInputClass(isFullImei(imei))}
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
                  ))}
                </div>

                <Button variant="soft" icon={PlusCircle} onClick={() => setImeiLines((prev) => [...prev, ""])}>
                  Add another IMEI
                </Button>
              </div>
            )}

            {/* PTA status */}
            <div className="pt-3 border-t border-line">
              <Field label="PTA status" htmlFor="add-pta" className="sm:max-w-xs">
                <Select id="add-pta" value={ptaStatus} onChange={(e) => setPtaStatus(e.target.value)}>
                  <PtaOptions />
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
  );
};

export default AddProductModal;
