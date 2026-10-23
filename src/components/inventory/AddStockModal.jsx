import { useState } from "react";
import { getProductStock } from "../../context/AppContext";
import { Button, Field, Input, Select, Textarea, Modal } from "../ui";
import { isFullImei, isImeiProduct, makeUnit, inStockImeiOwners, findDuplicateImeis } from "./shared";
import { PtaOptions } from "./parts";

// Add stock to one product (the server appends the new units). Own state, mounted only while open.
const AddStockModal = ({ product, products, onClose, addStock }) => {
  const [imeiText, setImeiText] = useState("");
  const [qty, setQty] = useState(1);
  const [pta, setPta] = useState("Approved");
  const [saving, setSaving] = useState(false);
  const imeiProduct = isImeiProduct(product);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    let payload;
    if (imeiProduct) {
      // One phone per line: "imei" or dual-SIM "imei1,imei2"
      const units = [];
      const invalid = [];
      imeiText.split(/\r?\n/).forEach((line) => {
        const tokens = line.split(/[,;\s]+/).filter(Boolean);
        if (tokens.length === 0) return;
        if (tokens.length > 2 || !tokens.every(isFullImei)) {
          invalid.push(line.trim());
          return;
        }
        units.push(makeUnit(tokens[0], tokens[1] || "", pta));
      });
      if (invalid.length > 0) {
        alert(`These lines are not valid 15-digit IMEIs:\n${invalid.join("\n")}`);
        return;
      }
      if (units.length === 0) {
        alert("Please enter at least one IMEI.");
        return;
      }
      const dups = findDuplicateImeis(units, inStockImeiOwners(products));
      if (dups.length > 0) {
        alert(`These IMEIs are duplicates, please remove them:\n${dups.join("\n")}`);
        return;
      }
      // A phone counted only by quantity (no IMEIs yet): once IMEIs are added, stock is the IMEI count
      const plainQty = (product.imeis || []).length === 0 ? Number(product.quantity || 0) : 0;
      if (
        plainQty > 0 &&
        !window.confirm(
          `${product.name} has ${plainQty} unit(s) in stock without IMEIs. After adding IMEIs, stock will be counted ` +
            `from IMEIs only (${units.length} unit(s)). Include the IMEIs of the existing units too if they are still in the shop.\n\nContinue?`
        )
      )
        return;
      payload = { imeis: units };
    } else {
      const n = Math.floor(Number(qty));
      if (!n || n < 1) {
        alert("Please enter a quantity of at least 1.");
        return;
      }
      payload = { quantity: n };
    }

    setSaving(true);
    const saved = await addStock(product.id, payload);
    setSaving(false);
    if (saved) onClose();
  };

  const linesEntered = imeiText.split(/\r?\n/).filter((l) => l.trim()).length;

  return (
    <Modal
      open
      onClose={onClose}
      title="Add stock"
      description={`${product.name} · ${getProductStock(product)} unit(s) in stock now`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="add-stock-form" disabled={saving}>
            {saving ? "Saving…" : "Add stock"}
          </Button>
        </>
      }
    >
      <form id="add-stock-form" onSubmit={handleSubmit} className="space-y-4">
        {imeiProduct ? (
          <>
            <Field
              label="New IMEIs, one phone per line"
              htmlFor="stock-imeis"
              hint={`${linesEntered} phone(s) entered. Dual-SIM: imei1,imei2 on one line.`}
            >
              <Textarea
                id="stock-imeis"
                rows={6}
                value={imeiText}
                onChange={(e) => setImeiText(e.target.value)}
                className="font-mono text-xs"
                placeholder={"358921098471201\nDual-SIM: imei1,imei2\n358921098471219,358921098471227"}
              />
            </Field>
            <Field label="PTA status" htmlFor="stock-pta">
              <Select id="stock-pta" value={pta} onChange={(e) => setPta(e.target.value)}>
                <PtaOptions />
              </Select>
            </Field>
          </>
        ) : (
          <Field label="Quantity to add" htmlFor="stock-qty">
            <Input id="stock-qty" type="number" min="1" required inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        )}
      </form>
    </Modal>
  );
};

export default AddStockModal;
