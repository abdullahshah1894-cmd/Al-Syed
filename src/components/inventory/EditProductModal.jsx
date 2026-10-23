import { useState } from "react";
import { Button, Field, Input, Select, Modal } from "../ui";
import { CATEGORIES, WARRANTY_TYPES, preventEnterSubmit } from "./shared";

const formFrom = (prod) => ({
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

// Edit a product's details (stock changes go through Add stock). Own state, mounted only while open.
const EditProductModal = ({ product, onClose, updateProduct }) => {
  const [form, setForm] = useState(() => formFrom(product));
  const [saving, setSaving] = useState(false);
  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!form.name.trim() || !form.brand.trim()) {
      alert("Product Name and Brand are required.");
      return;
    }
    const supplierName = form.supplierName.trim();
    const supplierPhone = form.supplierPhone.trim();
    const fields = {
      name: form.name.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      category: form.category,
      purchasePrice: Math.max(0, Number(form.purchasePrice) || 0),
      salePrice: Math.max(0, Number(form.salePrice) || 0),
      minStockAlert: Math.max(0, Math.floor(Number(form.minStockAlert) || 0)),
      warrantyDuration: form.warrantyType === "No Warranty" ? 0 : Math.max(0, Math.floor(Number(form.warrantyDuration) || 0)),
      warrantyType: form.warrantyType,
      // Sent as `supplier` too, so the screen shows the new supplier even when the server echoes nothing back
      supplier: { name: supplierName, phone: supplierPhone },
      supplierName,
      supplierPhone,
    };
    setSaving(true);
    const ok = await updateProduct(product.id, fields);
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit product"
      description="Details only. Use Add stock to add new units."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="edit-product-form" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="edit-product-form" onSubmit={handleSubmit} onKeyDown={preventEnterSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Product name *" htmlFor="edit-name">
          <Input id="edit-name" type="text" required value={form.name} onChange={(e) => setField("name", e.target.value)} />
        </Field>
        <Field label="Brand *" htmlFor="edit-brand">
          <Input id="edit-brand" type="text" required value={form.brand} onChange={(e) => setField("brand", e.target.value)} />
        </Field>
        <Field label="Model or variant" htmlFor="edit-model">
          <Input id="edit-model" type="text" value={form.model} onChange={(e) => setField("model", e.target.value)} />
        </Field>
        <Field label="Category *" htmlFor="edit-category">
          <Select id="edit-category" value={form.category} onChange={(e) => setField("category", e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Purchase price (cost) *" htmlFor="edit-cost">
          <Input id="edit-cost" type="number" required min="0" inputMode="decimal" value={form.purchasePrice} onChange={(e) => setField("purchasePrice", e.target.value)} />
        </Field>
        <Field label="Sale price" htmlFor="edit-sale">
          <Input id="edit-sale" type="number" min="0" inputMode="decimal" value={form.salePrice} onChange={(e) => setField("salePrice", e.target.value)} />
        </Field>
        <Field label="Low-stock alert at" htmlFor="edit-min">
          <Input id="edit-min" type="number" min="0" inputMode="numeric" value={form.minStockAlert} onChange={(e) => setField("minStockAlert", e.target.value)} />
        </Field>
        <Field label="Warranty (months)" htmlFor="edit-warranty">
          <Input id="edit-warranty" type="number" min="0" inputMode="numeric" value={form.warrantyDuration} onChange={(e) => setField("warrantyDuration", e.target.value)} />
        </Field>
        <Field label="Warranty type" htmlFor="edit-warranty-type">
          <Select
            id="edit-warranty-type"
            value={form.warrantyType}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                warrantyType: e.target.value,
                ...(e.target.value === "No Warranty" ? { warrantyDuration: 0 } : {}),
              }))
            }
          >
            {WARRANTY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Supplier name" htmlFor="edit-supplier">
          <Input id="edit-supplier" type="text" value={form.supplierName} onChange={(e) => setField("supplierName", e.target.value)} />
        </Field>
        <Field label="Supplier phone" htmlFor="edit-supplier-phone">
          <Input id="edit-supplier-phone" type="tel" inputMode="tel" value={form.supplierPhone} onChange={(e) => setField("supplierPhone", e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
};

export default EditProductModal;
