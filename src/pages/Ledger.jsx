import React, { useState, useMemo, useRef, useEffect } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { api } from "../services/api";
import html2canvas from "html2canvas";
import { formatWAPhone } from "./POS";
import {
  BookOpen,
  Plus,
  Printer,
  X,
  FileText,
  Trash2,
  ScanLine,
  CheckCircle2,
  AlertCircle,
  Search,
  Smartphone,
  CreditCard,
  Banknote,
  User
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n, decimals = 0) =>
  Number(n || 0).toLocaleString("en-PK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

const todayISO = () => new Date().toISOString().slice(0, 10);

const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    .replace(/ /g, "-");
};

const fmtTimestamp = () => {
  const d = new Date();
  return (
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-") +
    " " +
    d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }).toLowerCase()
  );
};

let _nextId = 1;
const uid = () => _nextId++;

// ── Component ────────────────────────────────────────────────────────────────
const Ledger = () => {
  const { products, shopSettings, customers, recordSale, addCustomer } = useApp();

  // ── State ─────────────────────────────────────────────────────────────────
  const [entries, setEntries] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [editingOB, setEditingOB] = useState(false);
  const [obInput, setObInput] = useState("0");
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [genTime] = useState(fmtTimestamp());

  // Scan / lookup state
  const [scanInput, setScanInput] = useState("");
  const [scanStatus, setScanStatus] = useState(null); // { type: "success"|"error", message }
  const scanRef = useRef(null);
  const receiptRef = useRef(null);
  const [isCapturingImage, setIsCapturingImage] = useState(false);

  // Invoice tracking — each scan session groups items under an auto-created invoice
  const [invoiceCounter, setInvoiceCounter] = useState(1);
  const [currentInvoiceId, setCurrentInvoiceId] = useState(null);

  // Manual add modal
  const [showManual, setShowManual] = useState(false);
  const EMPTY_MANUAL = { type: "item", date: todayISO(), description: "", qty: "1", rate: "", dis: "", deal: "", lp: "", debit: "", credit: "", openingBal: "" };
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL);

  // Checkout State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [selectedSeller, setSelectedSeller] = useState(SELLERS[0]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [completedSaleInvoice, setCompletedSaleInvoice] = useState(null);
  
  // Custom Customer Search Dropdown State
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef(null);
  
  // Quick Add Customer State
  const [showQuickAddCustomer, setShowQuickAddCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");

  const handleQuickAddCustomer = async () => {
    if (!newCustomerName) {
      alert("Customer name is required.");
      return;
    }
    const newCust = await addCustomer({
      name: newCustomerName,
      phone: newCustomerPhone,
      address: "",
      cnic: ""
    });
    setSelectedCustomer(newCust.id);
    setShowQuickAddCustomer(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
  };

  const selectCustomerByName = async (targetName) => {
    let found = customers.find(c => c.name && c.name.toLowerCase().trim() === targetName.toLowerCase().trim());
    if (found) {
      setSelectedCustomer(found.id);
    } else {
      const created = await addCustomer({
        name: targetName,
        phone: targetName === "Aziz" ? "0300-1111111" : "0300-2222222",
        address: "Shop Partner Account"
      });
      if (created) {
        setSelectedCustomer(created.id);
      }
    }
  };

  // Handle clicks outside customer dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Focus scan input on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (scanRef.current) scanRef.current.focus();
  }, []);

  // ── Auto-clear scan status after 4s ───────────────────────────────────────
  useEffect(() => {
    if (scanStatus) {
      const t = setTimeout(() => setScanStatus(null), 4000);
      return () => clearTimeout(t);
    }
  }, [scanStatus]);

  // ── Load ledger entries from Supabase on mount ────────────────────────────
  useEffect(() => {
    // The user requested NOT to load the massive default list of all past ledger entries 
    // when opening the tab, so we start with an empty session.
    /*
    const loadLedger = async () => {
      const data = await api.getLedger();
      if (data && Array.isArray(data) && data.length > 0) {
        ...
      }
    };
    loadLedger();
    */
  }, []);

  // ── Lookup product by IMEI or barcode (local first, then backend) ──────────
  const lookupProduct = async (query) => {
    const q = query.trim();
    if (!q) return null;

    // Local search first (instant)
    for (const prod of products) {
      if (prod.imeis && prod.imeis.length > 0) {
        const matchedImei = prod.imeis.find(
          (im) => im.imei === q && im.status === "in_stock"
        );
        if (matchedImei) return { product: prod, imei: matchedImei, matchType: "imei" };
      }
      if (prod.barcode && prod.barcode === q) {
        return { product: prod, imei: null, matchType: "barcode" };
      }
    }

    // Backend fallback — searches Supabase directly
    try {
      const result = await api.searchImei(q);
      if (result && result.product) {
        // Must check if the item is actually in stock in the backend
        if (result.matchedImei && result.matchedImei.status !== "in_stock") {
          return null; // Don't allow adding sold items!
        }

        const prod = result.product;
        const normalized = {
          ...prod,
          salePrice: Number(prod.sale_price ?? prod.salePrice ?? prod.purchase_price ?? prod.purchasePrice ?? 0),
          purchasePrice: Number(prod.purchase_price ?? prod.purchasePrice ?? 0),
        };
        return { product: normalized, imei: result.matchedImei, matchType: "backend" };
      }
    } catch (_) { }
    return null;
  };

  // ── Handle IMEI / barcode scan ────────────────────────────────────────────
  const handleScan = async (e) => {
    if (e.key !== "Enter") return;
    const rawQuery = scanInput.trim();
    if (!rawQuery) return;

    // Immediately clear input so fast barcode scanners don't get blocked
    setScanInput("");
    setScanStatus({ type: "success", message: "⟳ Processing scan(s)..." });

    // Split by commas, spaces, or newlines to allow bulk pasting
    const queries = rawQuery.split(/[\s,;]+/).filter((q) => q.trim().length > 0);

    let successCount = 0;
    let lastAdded = "";
    let localQtyTracker = {};
    let localImeiTracker = new Set();

    for (const query of queries) {
      const result = await lookupProduct(query);

      if (!result) {
        setScanStatus({ type: "error", message: `No in-stock product found for "${query}"` });
        continue;
      }

      const { product, imei, matchType } = result;

      // Ensure this exact IMEI hasn't already been added to the active invoice
      if (imei) {
        const actualImei = imei.imei1 || imei.imei;
        
        // Has it been added in a previous scan to this active invoice?
        const alreadyInEntries = entries.find(
          (e) => e.parentInvoiceId === currentInvoiceId && (e.imei === actualImei || (e.imeisArray && e.imeisArray.includes(actualImei)))
        );
        
        // Or has it been added in the CURRENT bulk scan loop?
        if (alreadyInEntries || localImeiTracker.has(actualImei)) {
          setScanStatus({ type: "error", message: `IMEI ${actualImei} is already in the current invoice!` });
          continue;
        }
        
        localImeiTracker.add(actualImei);
      }

      // Enforce stock limits for bulk (non-IMEI) items
      if (!imei) {
        // Calculate how many are currently in the active invoice
        const existingEntry = entries.find((e) => e.parentInvoiceId === currentInvoiceId && e.productId === product.id && !e.imei);
        const currentQty = existingEntry ? Number(existingEntry.qty || 0) : 0;
        // Calculate how many have been added in THIS specific scan loop
        const alreadyAddedInLoop = localQtyTracker ? (localQtyTracker[product.id] || 0) : 0;

        if (currentQty + alreadyAddedInLoop + 1 > product.quantity) {
          setScanStatus({ type: "error", message: `Cannot add more! Stock limit (${product.quantity}) reached for ${product.name}.` });
          continue;
        }

        if (!localQtyTracker) localQtyTracker = {};
        localQtyTracker[product.id] = alreadyAddedInLoop + 1;
      }

      // Ensure we have an active invoice
      let invId = currentInvoiceId;
      if (!invId) {
        const invNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(invoiceCounter).padStart(3, "0")}`;
        invId = uid();
        const invoiceEntry = {
          id: invId,
          type: "invoice",
          date: todayISO(),
          description: `Sales-${invNumber}-Ptc.;TPcs:0`,
          qty: "",
          rate: "",
          dis: "",
          deal: "",
          lp: "",
          debit: 0,
          credit: null,
        };
        setEntries((prev) => [...prev, invoiceEntry]);
        setCurrentInvoiceId(invId);
        setInvoiceCounter((c) => c + 1);
      }

      // Add or update item in local state
      setEntries((prev) => {
        const existingIdx = prev.findIndex(
          (e) => e.parentInvoiceId === invId && e.productId === product.id
        );

        let updated;
        if (existingIdx !== -1) {
          // Both bulk items and IMEI items will bump qty
          updated = prev.map((e, i) => {
            if (i === existingIdx) {
              const newQty = Number(e.qty || 0) + 1;
              const newImeiList = e.imeisArray ? [...e.imeisArray] : (e.imei ? [e.imei] : []);
              if (imei) {
                newImeiList.push(imei.imei || imei.imei1);
              }
              const itemRate = Number(product.salePrice ?? product.sale_price ?? product.purchasePrice ?? product.purchase_price ?? 0);
              
              return { 
                ...e, 
                qty: newQty,
                imeisArray: newImeiList,
                rate: e.rate || itemRate, 
                description: `${product.name}`
              };
            }
            return e;
          });
        } else {
          const itemRate = Number(
            product.salePrice ??
            product.sale_price ??
            product.purchasePrice ??
            product.purchase_price ??
            0
          );

          // New row (all IMEIs get new rows, or first time bulk item)
          const itemEntry = {
            id: uid(),
            type: "item",
            date: todayISO(),
            description: `${product.name}`,
            fullName: product.name,
            qty: 1,
            rate: itemRate,
            dis: "",
            deal: "",
            lp: "",
            debit: null,
            credit: null,
            parentInvoiceId: invId,
            imei: imei?.imei || imei?.imei1 || null,
            imeisArray: imei ? [imei.imei || imei.imei1] : [],
            productId: product.id,
          };
          updated = [...prev, itemEntry];
        }
        return updateInvoiceTotals(updated, invId);
      });

      const itemRate = Number(
        product.salePrice ??
        product.sale_price ??
        product.purchasePrice ??
        product.purchase_price ??
        0
      );

      // Persist item to Supabase backend
      api.addLedgerEntry({
        type: "item",
        date: todayISO(),
        description: `${product.name}${imei ? ` (${(imei.imei1 || imei.imei).slice(-6)})` : ""}`,
        qty: 1,
        rate: itemRate,
        discount: 0,
        amount: itemRate,
        debit: itemRate,
        credit: 0,
        parentInvoiceId: invId,
        productId: product.id,
      });

      successCount++;
      lastAdded = product.name;
    }

    if (successCount > 0) {
      setScanStatus({
        type: "success",
        message: queries.length > 1
          ? `✓ ${successCount} items added successfully!`
          : `✓ ${lastAdded} added successfully!`,
      });
    }

    if (scanRef.current) scanRef.current.focus();
  };

  // ── Recompute invoice header totals from its child items ──────────────────
  const updateInvoiceTotals = (allEntries, invId) => {
    const children = allEntries.filter((e) => e.parentInvoiceId === invId);
    const totalDebit = children.reduce((s, c) => s + Number(c.qty || 0) * Number(c.rate || 0), 0);
    const totalPcs = children.reduce((s, c) => s + Number(c.qty || 0), 0);

    return allEntries.map((e) => {
      if (e.id === invId) {
        const descParts = e.description.split("TPcs:");
        const newDesc = descParts[0] + "TPcs:" + totalPcs;
        return { ...e, debit: totalDebit, description: newDesc };
      }
      return e;
    });
  };

  // ── Delete an entry ───────────────────────────────────────────────────────
  const handleDelete = (id) => {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (!entry) return prev;

      // If deleting an invoice, remove all its children too
      if (entry.type === "invoice") {
        if (currentInvoiceId === id) setCurrentInvoiceId(null);
        return prev.filter((e) => e.id !== id && e.parentInvoiceId !== id);
      }

      // If deleting an item, recalc its parent invoice
      const filtered = prev.filter((e) => e.id !== id);
      if (entry.parentInvoiceId) {
        return updateInvoiceTotals(filtered, entry.parentInvoiceId);
      }
      return filtered;
    });
  };

  // ── New invoice (finalize current, start fresh) ───────────────────────────
  const handleNewInvoice = () => {
    const invNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(invoiceCounter).padStart(3, "0")}`;
    const invId = uid();
    const invoiceEntry = {
      id: invId,
      type: "invoice",
      date: todayISO(),
      description: `Sales-${invNumber}-Ptc.;TPcs:0`,
      qty: "",
      rate: "",
      dis: "",
      deal: "",
      lp: "",
      debit: 0,
      credit: null,
    };
    setEntries((prev) => [...prev, invoiceEntry]);
    setCurrentInvoiceId(invId);
    setInvoiceCounter((c) => c + 1);
    
    setScanInput("");
    scanRef.current?.focus();
  };

  // ── Checkout & Finalize Invoice ────────────────────────────────────────────
  const handleCheckoutClick = () => {
    if (!currentInvoiceId) {
      alert("Please start a New Invoice and scan items first.");
      return;
    }
    
    // Check if invoice has any items
    const invoiceItems = entries.filter(e => e.type === "item" && e.parentInvoiceId === currentInvoiceId);
    if (invoiceItems.length === 0) {
      alert("Please add items to the invoice before checking out.");
      return;
    }

    setShowCheckoutModal(true);
  };

  const finalizeCheckout = async () => {
    const invoiceHeader = entries.find(e => e.id === currentInvoiceId);
    const invoiceItems = entries.filter(e => e.type === "item" && e.parentInvoiceId === currentInvoiceId);
    
    if (!invoiceHeader || invoiceItems.length === 0) return;

    let customerObj = null;
    if (selectedCustomer) {
      customerObj = customers.find(c => c.id === selectedCustomer);
    }

    // Map ledger items to standard cart items format for backend
    const cartItems = invoiceItems.map(item => {
      const pid = item.productId || null;
      let isManual = !pid;
      return {
        id: pid || `manual_${item.id}`,
        productId: pid,
        product: pid,
        name: item.description,
        productName: item.description,
        quantity: Number(item.qty || 1),
        price: Number(item.rate || 0),
        unitSalePrice: Number(item.rate || 0),
        subtotal: Number(item.qty || 1) * Number(item.rate || 0),
        imeisArray: item.imeisArray && item.imeisArray.length > 0 ? item.imeisArray : (item.imei ? [item.imei] : []),
        isManual
      };
    });

    const currentSaleTotal = cartItems.reduce((sum, i) => sum + i.subtotal, 0);
    const effectivePaid = Number(paidAmountInput) || 0;
    const dueAmount = Math.max(0, currentSaleTotal - effectivePaid);

    const saleData = {
      items: cartItems,
      subtotalAmount: currentSaleTotal,
      discountAmount: 0,
      taxPercent: 0,
      taxAmount: 0,
      grandTotal: currentSaleTotal,
      paidAmount: paymentMethod === "Pending Bill" ? 0 : currentSaleTotal,
      dueAmount: paymentMethod === "Pending Bill" ? currentSaleTotal : 0,
      netProfit: 0,
      paymentMethod: paymentMethod === "Pending Bill" ? "Credit (Udhaar)" : paymentMethod,
      paymentStatus: paymentMethod === "Pending Bill" ? "pending" : "paid",
      cashierName: selectedSeller || "Admin",
      customer: selectedCustomer || null,
      customerName: customerObj ? customerObj.name : "Walk-in Customer",
      customerPhone: customerObj ? customerObj.phone : "",
      dueDate: paymentMethod === "Pending Bill" ? dueDate || null : null,
      notes: "Generated from Bill Ledger",
      billNumber: `INV-${Date.now().toString().slice(-6)}`,
    };

    // This records the sale (reducing stock in backend) and updates local states
    const recorded = await recordSale(saleData);

    setCompletedSaleInvoice(recorded);
    setShowCheckoutModal(false);
    
    // Clear out current invoice so Ledger can start fresh
    handleNewInvoice();
  };

  const generateTextReceipt = (inv, previousBalance, includeWhatsAppFormatting = false) => {
    const bold = includeWhatsAppFormatting ? "*" : "";
    let text = `${includeWhatsAppFormatting ? '🧾 ' : ''}${bold}${shopSettings.shopName || "MOBILE SHOP"}${bold}\n`;
    text += `==============================\n`;
    text += `📍 ${shopSettings.address || shopSettings.shopAddress || "Main Mobile Market"}\n`;
    text += `📞 Phone: ${shopSettings.phone || shopSettings.shopPhone || "+92 300 0000000"}\n`;
    text += `==============================\n`;
    text += `Invoice #: ${inv.billNumber || "INV"}\n`;
    text += `Date: ${new Date(inv.createdAt || Date.now()).toLocaleDateString()}\n`;
    text += `Customer: ${inv.customerName || "Walk-in Customer"}\n`;
    if (inv.customerPhone) text += `Contact: ${inv.customerPhone}\n`;
    text += `Payment: ${inv.paymentMethod || "Cash"}\n`;
    text += `Seller: ${inv.cashierName || "Shop Partner"}\n`;
    text += `------------------------------\n`;
    text += `${bold}ITEMS PURCHASED:${bold}\n`;
    (inv.items || []).forEach((item) => {
      text += `• ${bold}${item.description || item.productName || item.name || "Item"}${bold}\n`;
      const itemRate = item.rate || item.unitSalePrice || (item.quantity ? item.subtotal / item.quantity : 0);
      const itemSubtotal = item.subtotal || (item.quantity * itemRate);
      text += `  Qty: ${item.quantity || item.qty || 1} x Rs ${itemRate.toLocaleString()} = Rs ${itemSubtotal.toLocaleString()}\n`;
    });
    text += `------------------------------\n`;
    text += `Subtotal: Rs ${(inv.subtotalAmount || inv.grandTotal || 0).toLocaleString()}\n`;
    if (inv.discountAmount > 0) {
      text += `Discount: -Rs ${inv.discountAmount.toLocaleString()}\n`;
    }
    if (previousBalance > 0) {
      text += `Previous Balance: Rs ${previousBalance.toLocaleString()}\n`;
    }
    text += `${bold}NET TOTAL: Rs ${((inv.grandTotal || 0) + previousBalance).toLocaleString()}${bold}\n`;
    text += `Paid Amount: Rs ${(inv.paidAmount || 0).toLocaleString()}\n`;
    if ((inv.dueAmount || 0) > 0) {
      text += `⚠️ ${bold}DUE / UDHAAR: Rs ${inv.dueAmount.toLocaleString()}${bold}\n`;
    }
    text += `==============================\n`;
    text += `Thank you for your business!\n`;
    return text;
  };

  const handleWhatsAppShareModal = async () => {
    if (!completedSaleInvoice) return;
    const receiptElement = document.getElementById("invoice-print-area");
    const prevBal = selectedCustomer && Number(selectedCustomer.totalPending || 0) > 0 ? Number(selectedCustomer.totalPending || 0) : 0;
    const waText = generateTextReceipt(completedSaleInvoice, prevBal, true);
    const formattedPhone = formatWAPhone(completedSaleInvoice.customerPhone);
    const waUrl = formattedPhone
      ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(waText)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(waText)}`;

    setIsCapturingImage(true);

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // 1. Mobile native share attempt
    if (isMobile && receiptElement && navigator.canShare) {
      try {
        const canvas = await html2canvas(receiptElement, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: true,
          logging: false,
        });

        const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
        if (blob) {
          const file = new File([blob], `Receipt_${completedSaleInvoice.billNumber || "INV"}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Receipt — ${completedSaleInvoice.billNumber || "INV"}`,
              text: waText,
            });
            setIsCapturingImage(false);
            return;
          }
        }
      } catch (shareErr) {
        if (shareErr.name === "AbortError") {
          setIsCapturingImage(false);
          return;
        }
        console.warn("Native share fallback to WhatsApp link:", shareErr);
      }
    }

    // 2. Desktop Flow: copy image to clipboard & download image slip
    if (receiptElement) {
      try {
        const canvas = await html2canvas(receiptElement, {
          scale: 2,
          backgroundColor: "#ffffff",
          useCORS: true,
          allowTaint: true,
          logging: false,
        });

        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              if (navigator.clipboard && window.ClipboardItem) {
                await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
              }
            } catch (clipErr) {
              console.log("Clipboard copy not supported:", clipErr);
            }

            try {
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `Receipt_${completedSaleInvoice.billNumber || "INV"}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (dlErr) {
              console.log("Download fallback skipped:", dlErr);
            }
          }
        }, "image/png");
      } catch (canvasErr) {
        console.warn("Canvas capture warning:", canvasErr);
      }
    }

    // 3. Always open WhatsApp with pre-filled message
    setTimeout(() => {
      window.open(waUrl, "_blank");
      setIsCapturingImage(false);
    }, 300);
  };

  const handlePrintReceipt = () => {
    window.print();
  };



  // ── Helper to recalculate active invoice totals when rate or qty changes ──
  const recalculateInvoiceTotal = (entriesList, invId) => {
    if (!invId) return entriesList;
    const children = entriesList.filter((e) => e.parentInvoiceId === invId);
    const totalDebit = children.reduce((s, c) => s + Number(c.qty || 0) * Number(c.rate || 0), 0);
    const totalPcs = children.reduce((s, c) => s + Number(c.qty || 0), 0);

    return entriesList.map((e) => {
      if (e.id === invId) {
        const descParts = e.description.split("TPcs:");
        const newDesc = (descParts[0] || "") + "TPcs:" + totalPcs;
        return { ...e, debit: totalDebit, description: newDesc };
      }
      return e;
    });
  };

  // ── Rate Change Handler for Ledger Rows ──
  const handleRateChange = (targetRow, newRateStr) => {
    const newRate = Math.max(0, Number(newRateStr) || 0);
    setEntries((prev) => {
      const updated = prev.map((e) => {
        if (targetRow.groupIds ? targetRow.groupIds.includes(e.id) : e.id === targetRow.id) {
          return { ...e, rate: newRate };
        }
        return e;
      });
      return recalculateInvoiceTotal(updated, targetRow.parentInvoiceId);
    });
  };

  // ── Qty Change Handler for Ledger Rows ──
  const handleQtyChange = (targetRow, newQtyStr) => {
    const newQty = Math.max(1, Number(newQtyStr) || 1);
    setEntries((prev) => {
      const updated = prev.map((e) => {
        if (targetRow.groupIds ? targetRow.groupIds.includes(e.id) : e.id === targetRow.id) {
          return { ...e, qty: newQty };
        }
        return e;
      });
      return recalculateInvoiceTotal(updated, targetRow.parentInvoiceId);
    });
  };

  // ── Manual add ────────────────────────────────────────────────────────────
  const handleManualAdd = () => {
    if (!manualForm.description) return;

    if (manualForm.type === "item") {
      // Create invoice header if needed
      let invId = currentInvoiceId;
      if (!invId) {
        const invNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(invoiceCounter).padStart(3, "0")}`;
        invId = uid();
        const invoiceEntry = {
          id: invId, type: "invoice", date: todayISO(),
          description: `Sales-${invNumber}-Ptc.;TPcs:0`,
          qty: "", rate: "", dis: "", deal: "", lp: "", debit: 0, credit: null,
        };
        setEntries((prev) => [...prev, invoiceEntry]);
        setCurrentInvoiceId(invId);
        setInvoiceCounter((c) => c + 1);
      }

      const itemEntry = {
        id: uid(), type: "item", date: manualForm.date,
        description: manualForm.description,
        qty: Number(manualForm.qty) || 1, rate: Number(manualForm.rate) || 0,
        dis: manualForm.dis, deal: manualForm.deal, lp: manualForm.lp,
        debit: null, credit: null, parentInvoiceId: invId,
      };
      setEntries((prev) => updateInvoiceTotals([...prev, itemEntry], invId));
    } else if (manualForm.type === "payment") {
      setEntries((prev) => [...prev, {
        id: uid(), type: "payment", date: manualForm.date,
        description: manualForm.description,
        qty: "", rate: "", dis: "", deal: "", lp: "",
        debit: Number(manualForm.debit) || 0, credit: Number(manualForm.credit) || 0,
      }]);
    }

    setManualForm(EMPTY_MANUAL);
    setShowManual(false);
  };

  // ── Save opening balance ──────────────────────────────────────────────────
  const saveOB = () => {
    setOpeningBalance(Number(obInput) || 0);
    setEditingOB(false);
  };

  // ── Running balance computation ───────────────────────────────────────────
  const rows = useMemo(() => {
    const computedRows = [];
    let currentBalance = openingBalance;
    
    entries.forEach((e) => {
      const qty = Number(e.qty || 0);
      const rate = Number(e.rate || 0);
      const computedAmount = e.type === "item" ? qty * rate : null;
      const debit = Number(e.debit || 0);
      const credit = Number(e.credit || 0);

      if (e.type === "invoice") {
        currentBalance += debit;
      } else if (e.type === "payment") {
        currentBalance = currentBalance + debit - credit;
      }
      
      computedRows.push({ ...e, computedAmount, runningBalance: currentBalance });
    });
    
    return computedRows;
  }, [entries, openingBalance]);

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
  const finalBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance : openingBalance;

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => window.print();

  // ── Cell styles ───────────────────────────────────────────────────────────
  const cell = "border border-slate-700 px-1.5 py-[3px] text-[11px]";
  const cellR = cell + " text-right";
  const cellC = cell + " text-center";

  return (
    <>
    <div className={`p-4 space-y-4 bg-slate-950 min-h-screen ${completedSaleInvoice ? "print:hidden" : ""}`}>

      {/* ━━ Top Action Bar ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <BookOpen size={22} className="text-indigo-400" />
          <div>
            <h1 className="text-base font-bold text-slate-100">Billing Ledger</h1>
            <p className="text-[11px] text-slate-400">Scan IMEI / barcode to add products to the current bill</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={handleNewInvoice}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow active:scale-95">
            <FileText size={14} /> New Invoice
          </button>

          {currentInvoiceId && (
            <button onClick={handleCheckoutClick}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow shadow-emerald-600/30 active:scale-95 animate-pulse">
              <CheckCircle2 size={14} /> Checkout & Finalize
            </button>
          )}
          <button onClick={() => setShowManual(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow shadow-indigo-600/30 active:scale-95">
            <Plus size={14} /> Manual Entry
          </button>
          <button onClick={handlePrint}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-slate-700 transition-all">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* ━━ IMEI / Barcode Scanner Input ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <ScanLine size={18} className="text-cyan-400" />
          <span className="text-sm font-bold text-slate-100">Scan Product IMEI / Barcode</span>
          {currentInvoiceId && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 ml-auto">
              Invoice Active
            </span>
          )}
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            ref={scanRef}
            type="text"
            inputMode="numeric"
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyDown={handleScan}
            placeholder="Scan or paste barcodes/IMEIs (separate multiple with spaces/commas) and press Enter..."
            className="w-full pl-10 pr-4 py-3 bg-slate-950 border-2 border-cyan-600/40 rounded-xl text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition-all"
            autoComplete="off"
          />
          {scanInput && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">
              {scanInput.length} digit{scanInput.length !== 1 ? "s" : ""} — press Enter
            </span>
          )}
        </div>

        {/* Scan status feedback */}
        {scanStatus && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border ${scanStatus.type === "success"
              ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
              : "bg-rose-500/10 text-rose-300 border-rose-500/30"
            }`}>
            {scanStatus.type === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{scanStatus.message}</span>
          </div>
        )}
      </div>

      {/* ━━ Printable Statement ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div id="ledger-print-area" className={`bg-white text-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-xl ${completedSaleInvoice ? '' : 'print-target'}`}>

        {/* Company header */}
        <div className="border-b-2 border-slate-800 px-4 pt-3 pb-2">
          <div className="text-center mb-2">
            <div className="text-[15px] font-extrabold tracking-widest uppercase">
              {shopSettings?.shopName || "AL SAEED M/Z KOHAT"}
            </div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.2em]">KOHAT</div>
          </div>

          <div className="flex items-start justify-between text-[11px]">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold w-8 text-slate-700">From</span>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                  className="border border-slate-400 rounded px-1 py-0.5 text-[11px] text-slate-800 bg-slate-50 focus:outline-none focus:border-indigo-500" />
                <span className="text-slate-500">{fmtDate(dateFrom)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold w-8 text-slate-700">To</span>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                  className="border border-slate-400 rounded px-1 py-0.5 text-[11px] text-slate-800 bg-slate-50 focus:outline-none focus:border-indigo-500" />
                <span className="text-slate-500">{fmtDate(dateTo)}</span>
              </div>
            </div>
            <div className="text-right text-[11px] font-semibold text-slate-600">{genTime}</div>
          </div>
        </div>

        {/* ── Ledger Table ── */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ fontSize: "11px" }}>
            <colgroup>
              <col style={{ width: "82px" }} />
              <col style={{ width: "210px" }} />
              <col style={{ width: "36px" }} />
              <col style={{ width: "52px" }} />
              <col style={{ width: "34px" }} />
              <col style={{ width: "40px" }} />
              <col style={{ width: "26px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "84px" }} />
              <col style={{ width: "72px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "26px" }} />
            </colgroup>

            <thead>
              <tr className="bg-slate-200 border-y-2 border-slate-800">
                {["Date", "Description", "Qty", "Rate", "Dis", "Deal", "LP", "Amount", "Debit", "Credit", "Balance", ""].map((h, i) => (
                  <th key={i} className={`${i >= 2 ? cellC : cell} font-bold bg-slate-200 ${i === 11 ? "print:hidden" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Data Rows */}
              {(() => {
                const groupedRows = [];
                const invoiceGroups = {};

                rows.forEach((row) => {
                  if (row.type === "item" && row.parentInvoiceId && row.productId) {
                    const key = `${row.parentInvoiceId}_${row.productId}`;
                    if (!invoiceGroups[key]) {
                      const newRow = { ...row, imeisArray: row.imei ? [row.imei] : [], groupIds: [row.id] };
                      invoiceGroups[key] = newRow;
                      groupedRows.push(newRow);
                    } else {
                      const g = invoiceGroups[key];
                      g.qty = Number(g.qty) + Number(row.qty || 1);
                      g.computedAmount = (g.computedAmount || 0) + (row.computedAmount || 0);
                      if (row.imei) g.imeisArray.push(row.imei);
                      g.groupIds.push(row.id);
                    }
                  } else {
                    groupedRows.push({ ...row, groupIds: [row.id] });
                  }
                });

                return groupedRows.map((row, idx) => {
                  const isInvoice = row.type === "invoice";
                  const isPayment = row.type === "payment";
                  const isActive = row.id === currentInvoiceId || row.parentInvoiceId === currentInvoiceId;

                  let displayDesc = row.description;
                  if (row.type === "item") {
                    const baseName = row.fullName || (row.description ? row.description.split(" (")[0] : "");
                    if (row.imeisArray && row.imeisArray.length > 0) {
                      displayDesc = `${baseName} [IMEI: ${row.imeisArray.join(", ")}]`;
                    } else if (baseName) {
                      displayDesc = baseName;
                    }
                  }

                  const bg = isInvoice
                    ? isActive ? "bg-sky-100" : "bg-sky-50"
                    : isPayment
                      ? "bg-green-50"
                      : idx % 2 === 0 ? "bg-white" : "bg-slate-50";

                  return (
                    <tr key={row.id} className={`${bg} hover:bg-yellow-50 transition-colors`}>
                      <td className={cell}>
                        <span className="text-slate-700">{fmtDate(row.date)}</span>
                      </td>
                      <td className={`${cell} ${isInvoice ? "font-semibold text-sky-800" : isPayment ? "font-semibold text-emerald-800" : "text-slate-800"}`}>
                        {displayDesc}
                        {isActive && isInvoice && <span className="ml-1 text-[9px] text-sky-500 font-bold">● CURRENT</span>}
                      </td>
                      <td className={`${cellC} p-[1px]`}>
                        {!isInvoice && !isPayment && !row.imei ? (
                          <input
                            type="number"
                            min="1"
                            value={row.qty !== undefined && row.qty !== null ? row.qty : 1}
                            onChange={(e) => handleQtyChange(row, e.target.value)}
                            className="w-12 bg-slate-100 font-bold text-center text-slate-900 border border-slate-300 rounded px-1 py-0.5 focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors print:bg-transparent print:border-none print:w-auto"
                            title="Edit Quantity"
                          />
                        ) : !isInvoice && !isPayment ? (
                          row.qty || 1
                        ) : (
                          ""
                        )}
                      </td>
                      <td className={`${cellC} p-[1px]`}>
                        {!isInvoice && !isPayment ? (
                          <input
                            type="number"
                            min="0"
                            value={row.rate !== undefined && row.rate !== null ? row.rate : ""}
                            onChange={(e) => handleRateChange(row, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="w-24 bg-amber-50 font-extrabold text-center text-slate-900 border-2 border-amber-400 rounded-lg px-1.5 py-1 focus:bg-yellow-200 focus:outline-none focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/20 transition-all shadow-sm print:bg-transparent print:border-none print:w-auto"
                            placeholder="Rate"
                            title="Click to edit custom rate required"
                          />
                        ) : (
                          ""
                        )}
                      </td>
                      <td className={cellC}>{row.dis || ""}</td>
                      <td className={cellC}>{row.deal || ""}</td>
                      <td className={cellC}>{row.lp || ""}</td>
                      <td className={cellR}>
                        {!isInvoice && !isPayment && row.computedAmount ? fmt(row.computedAmount) : ""}
                      </td>
                      <td className={`${cellR} font-semibold text-blue-900`}>
                        {row.debit ? fmt(row.debit) : ""}
                      </td>
                      <td className={`${cellR} text-emerald-800`}>
                        {row.credit ? fmt(row.credit) : ""}
                      </td>
                      <td className={`${cellR} font-bold text-slate-900`}>
                        {fmt(row.runningBalance)}
                      </td>
                      <td className={`${cell} text-center print:hidden`}>
                        <button onClick={() => row.groupIds.forEach(id => handleDelete(id))}
                          className="text-rose-400 hover:text-rose-600 transition-colors p-0.5" title="Delete">
                          <Trash2 size={10} />
                        </button>
                      </td>
                    </tr>
                  );
                });
              })()}

              {/* Empty state */}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={12} className="border border-slate-700 text-center py-8 text-slate-400 text-sm">
                    <ScanLine size={24} className="mx-auto mb-2 opacity-40" />
                    Scan an IMEI above to start adding items to the bill
                  </td>
                </tr>
              )}
            </tbody>

            <tfoot>
              <tr className="bg-slate-200 border-t-2 border-slate-800">
                <td className={`${cell} font-bold text-center`} colSpan={7}>
                  <span className="text-slate-700 mr-6">
                    Total Dr= <span className="text-blue-800">{fmt(totalDebit, 2)}</span>
                  </span>
                  <span className="text-slate-700">
                    Total Cr= <span className="text-emerald-700">{fmt(totalCredit, 2)}</span>
                  </span>
                </td>
                <td className={cellR}></td>
                <td className={`${cellR} font-bold text-blue-800`}>{fmt(totalDebit, 2)}</td>
                <td className={`${cellR} font-bold text-emerald-700`}>{fmt(totalCredit, 2)}</td>
                <td className={`${cellR} font-extrabold text-slate-900 text-[12px]`}>
                  Balance= {fmt(finalBalance, 2)}
                </td>
                <td className={`${cell} print:hidden`}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ━━ Summary Cards ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Opening Balance</p>
          <p className="text-lg font-extrabold text-slate-300">Rs {fmt(openingBalance, 2)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Debit (Dr)</p>
          <p className="text-lg font-extrabold text-blue-400">Rs {fmt(totalDebit, 2)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Credit (Cr)</p>
          <p className="text-lg font-extrabold text-emerald-400">Rs {fmt(totalCredit, 2)}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Final Balance</p>
          <p className="text-lg font-extrabold text-amber-400">Rs {fmt(finalBalance, 2)}</p>
        </div>
      </div>

      {/* ━━ Edit Opening Balance Modal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {editingOB && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <h3 className="font-bold text-slate-100 text-sm">Edit Opening Balance</h3>
            <input type="number" value={obInput} onChange={(e) => setObInput(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 text-lg font-mono focus:outline-none focus:border-indigo-500" placeholder="0" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingOB(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl">Cancel</button>
              <button onClick={saveOB}
                className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-500 shadow">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ━━ Manual Entry Modal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {showManual && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={17} className="text-indigo-400" />
                <h3 className="font-bold text-slate-100 text-sm">Manual Ledger Entry</h3>
              </div>
              <button onClick={() => setShowManual(false)} className="text-slate-400 hover:text-white"><X size={17} /></button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-400">Entry Type</label>
                <select value={manualForm.type} onChange={(e) => setManualForm({ ...manualForm, type: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500">
                  <option value="item">Item Row (adds to current invoice)</option>
                  <option value="payment">Payment / Receipt (Credit)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-400">Date</label>
                <input type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500" />
              </div>

              <div>
                <label className="font-semibold text-slate-400">Description <span className="text-rose-400">*</span></label>
                <input type="text" value={manualForm.description} onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500"
                  placeholder={manualForm.type === "item" ? "Product name" : "Payment description"} />
              </div>

              {manualForm.type === "item" && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="font-semibold text-slate-400">Qty</label>
                      <input type="number" value={manualForm.qty} onChange={(e) => setManualForm({ ...manualForm, qty: e.target.value })}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500" placeholder="1" />
                    </div>
                    <div>
                      <label className="font-bold text-amber-400">Rate (Rs) *</label>
                      <input
                        type="number"
                        min="0"
                        value={manualForm.rate}
                        onChange={(e) => setManualForm({ ...manualForm, rate: e.target.value })}
                        onFocus={(e) => e.target.select()}
                        className="w-full mt-1 bg-slate-950 border-2 border-amber-500/50 rounded-xl p-2.5 font-bold text-slate-100 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20"
                        placeholder="Enter Rate..."
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-400">Dis %</label>
                      <input type="number" value={manualForm.dis} onChange={(e) => setManualForm({ ...manualForm, dis: e.target.value })}
                        className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500" placeholder="0" />
                    </div>
                  </div>
                  {manualForm.qty && manualForm.rate && (
                    <div className="p-2.5 bg-indigo-950/50 border border-indigo-800/40 rounded-xl text-indigo-300 font-semibold flex justify-between">
                      <span>Amount (Qty × Rate)</span>
                      <span>Rs {fmt(Number(manualForm.qty) * Number(manualForm.rate))}</span>
                    </div>
                  )}
                </>
              )}

              {manualForm.type === "payment" && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-semibold text-slate-400">Debit (Dr)</label>
                    <input type="number" value={manualForm.debit} onChange={(e) => setManualForm({ ...manualForm, debit: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500" placeholder="0" />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-400">Credit (Cr)</label>
                    <input type="number" value={manualForm.credit} onChange={(e) => setManualForm({ ...manualForm, credit: e.target.value })}
                      className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-slate-100 focus:outline-none focus:border-indigo-500" placeholder="0" />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1 border-t border-slate-800">
              <button onClick={() => setShowManual(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-700">Cancel</button>
              <button onClick={handleManualAdd} disabled={!manualForm.description}
                className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-500 disabled:opacity-40 shadow">
                Add Entry
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ━━ Checkout Modal ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-800">Finalize Ledger Invoice</h2>
              <button onClick={() => setShowCheckoutModal(false)} className="text-slate-400 hover:text-slate-700 bg-white p-2 rounded-full shadow-sm">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
              {/* Payment Method Selection */}
              <div>
                <label className="text-sm font-bold text-slate-700 mb-3 block">Payment Method</label>
                <div className="grid grid-cols-3 gap-3">
                  {["Cash", "Card", "Pending Bill"].map(method => (
                    <button
                      key={method}
                      onClick={() => setPaymentMethod(method)}
                      className={`py-3 rounded-2xl font-bold text-sm flex flex-col items-center gap-2 border-2 transition-all ${
                        paymentMethod === method 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md shadow-indigo-600/10' 
                          : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'
                      }`}
                    >
                      {method === "Cash" && <Banknote size={20} />}
                      {method === "Card" && <CreditCard size={20} />}
                      {method === "Pending Bill" && <BookOpen size={20} />}
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seller Selection */}
              <div>
                <label className="text-sm font-bold text-slate-700 mb-2.5 block">Select Seller</label>
                <div className="grid grid-cols-2 gap-3">
                  {SELLERS.map((sellerName) => {
                    const isSelected = selectedSeller === sellerName;
                    return (
                      <button
                        key={sellerName}
                        type="button"
                        onClick={() => setSelectedSeller(sellerName)}
                        className={`py-3 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 border-2 transition-all ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-50 text-indigo-700 shadow-md shadow-indigo-600/10"
                            : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                        }`}
                      >
                        <User size={18} />
                        <span>Seller: {sellerName}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Customer Selection (To whom you want to sell) */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-bold text-slate-700 block">
                    Select Customer {paymentMethod === "Pending Bill" && <span className="text-rose-500">*</span>}
                  </label>
                  <button 
                    onClick={() => setShowQuickAddCustomer(!showQuickAddCustomer)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded"
                  >
                    <Plus size={12} /> {showQuickAddCustomer ? "Cancel" : "New Customer"}
                  </button>
                </div>

                {showQuickAddCustomer ? (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-3 space-y-3">
                    <input 
                      type="text" 
                      placeholder="Customer Name *" 
                      value={newCustomerName}
                      onChange={(e) => setNewCustomerName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                    <input 
                      type="text" 
                      placeholder="Phone Number (Optional)" 
                      value={newCustomerPhone}
                      onChange={(e) => setNewCustomerPhone(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                    />
                    <button 
                      onClick={handleQuickAddCustomer}
                      className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl"
                    >
                      Save & Select
                    </button>
                  </div>
                ) : (
                  <div className="relative" ref={customerDropdownRef}>
                    <div 
                      onClick={() => setShowCustomerDropdown(true)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-slate-700 font-medium cursor-pointer flex justify-between items-center transition-all hover:border-indigo-300"
                    >
                      <span>
                        {selectedCustomer 
                          ? (() => {
                              const c = customers.find(c => c.id === selectedCustomer);
                              return c ? `${c.name} (${c.phone || 'No Phone'})` : "Unknown";
                            })()
                          : "-- Walk-in Customer --"
                        }
                      </span>
                      <span className="text-slate-400">▼</span>
                    </div>

                    {showCustomerDropdown && (
                      <div className="mt-2 bg-white border border-slate-200 rounded-2xl shadow-inner overflow-hidden">
                        <div className="p-3 border-b border-slate-100 bg-slate-50">
                          <input 
                            type="text" 
                            autoFocus
                            placeholder="Search by name or phone..." 
                            value={customerSearch}
                            onChange={(e) => setCustomerSearch(e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded-xl p-2.5 text-sm text-slate-700 focus:outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                          <div 
                            onClick={() => { setSelectedCustomer(""); setShowCustomerDropdown(false); }}
                            className="px-4 py-3 text-sm text-slate-500 hover:bg-slate-50 cursor-pointer"
                          >
                            -- Walk-in Customer --
                          </div>
                          {customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.phone && c.phone.includes(customerSearch))).map(c => (
                            <div 
                              key={c.id} 
                              onClick={() => { setSelectedCustomer(c.id); setShowCustomerDropdown(false); }}
                              className="px-4 py-3 text-sm text-slate-700 hover:bg-indigo-50 cursor-pointer border-t border-slate-100"
                            >
                              <div className="font-bold">{c.name}</div>
                              {c.phone && <div className="text-xs text-slate-400 mt-0.5">{c.phone}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {paymentMethod === "Pending Bill" && !selectedCustomer && (
                  <p className="text-rose-500 text-xs font-semibold mt-2 px-1 flex items-center gap-1">
                    <AlertCircle size={12}/> A registered customer is required for Udhaar.
                  </p>
                )}
              </div>

              {paymentMethod !== "Pending Bill" && (
                <div>
                  <label className="text-sm font-bold text-slate-700 mb-2 block">Amount Received (Cash/Card)</label>
                  <input
                    type="number"
                    value={paidAmountInput}
                    onChange={(e) => setPaidAmountInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-slate-900 font-bold text-lg focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                    placeholder="Enter amount..."
                  />
                </div>
              )}

              {paymentMethod === "Pending Bill" && (
                <div>
                  <label className="text-sm font-bold text-slate-700 mb-2 block">Due Date (Optional)</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-slate-700 font-medium focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  />
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4">
              <button
                onClick={finalizeCheckout}
                disabled={paymentMethod === "Pending Bill" && !selectedCustomer}
                className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-600/30 transition-all disabled:opacity-50 disabled:shadow-none"
              >
                <CheckCircle2 size={20} />
                CONFIRM & GENERATE INVOICE
              </button>
            </div>
          </div>
        </div>
      )}

    </div>

      {/* ━━ Invoice Print Modal (Micro POS Thermal Receipt Slip) ━━━━━━━━━ */}
      {completedSaleInvoice && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:static print:p-0 print:block print:bg-transparent">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl relative max-h-[95vh] overflow-y-auto print:shadow-none print:w-full print:max-w-none print:rounded-none">
            
            {/* MICRO POS THERMAL RECEIPT SLIP */}
            <div id="invoice-print-area" ref={receiptRef} className="p-5 max-h-[70vh] overflow-y-auto print:max-h-none print:p-0 bg-white text-black print-target">
              {/* Shop Header */}
              <div className="text-center mb-4">
                <h2 className="text-xl font-black uppercase tracking-tight">{shopSettings.shopName || "AL-SYED MOBILE SHOP"}</h2>
                <p className="text-xs mt-0.5">{shopSettings.address || shopSettings.shopAddress}</p>
                <p className="text-xs">{shopSettings.phone || shopSettings.shopPhone}</p>
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>

              {/* Bill Info */}
              <div className="flex justify-between items-start mb-1 text-xs">
                <div>
                  <div className="font-bold">RECEIPT</div>
                  <div>
                    {new Date(completedSaleInvoice.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })},{" "}
                    {new Date(completedSaleInvoice.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })}
                  </div>
                  {completedSaleInvoice.customerName && completedSaleInvoice.customerName !== "Walk-in Customer" && (
                    <div className="font-semibold mt-1">Cust: {completedSaleInvoice.customerName}</div>
                  )}
                  {completedSaleInvoice.cashierName && (
                    <div>Seller: {completedSaleInvoice.cashierName}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-black text-sm">{completedSaleInvoice.billNumber}</div>
                </div>
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>

              {/* Items */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold mb-2">
                  <span>ITEM / QTY</span>
                  <span>AMOUNT</span>
                </div>
                {(completedSaleInvoice.items || []).map((item, idx) => {
                  const rate = item.rate || item.unitSalePrice || (item.quantity ? item.subtotal / item.quantity : 0);
                  const sub = item.subtotal || (item.quantity * rate) || 0;
                  return (
                    <div key={idx} className="pb-1">
                      <div className="flex justify-between items-start text-sm">
                        <div className="pr-2">
                          <div className="font-semibold">{item.description || item.productName || item.name}</div>
                          <div className="text-xs">{item.quantity || item.qty || 1} × Rs. {Number(rate).toLocaleString()}</div>
                        </div>
                        <span className="font-semibold whitespace-nowrap">Rs. {Number(sub).toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>

              {/* Totals */}
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotal</span><span>Rs. {(completedSaleInvoice.subtotalAmount || completedSaleInvoice.grandTotal || 0).toLocaleString()}</span></div>
                {completedSaleInvoice.discountAmount > 0 && (
                  <div className="flex justify-between"><span>Discount</span><span>−Rs. {completedSaleInvoice.discountAmount.toLocaleString()}</span></div>
                )}
                
                <div className="flex justify-between text-lg font-black mt-2 pt-2 border-t border-black"><span>TOTAL</span><span>Rs. {completedSaleInvoice.grandTotal.toLocaleString()}</span></div>
                
                {completedSaleInvoice.dueAmount > 0 && (
                  <div className="mt-2 pt-2 border-t border-dashed border-black">
                    <div className="flex justify-between text-sm"><span>Paid</span><span>Rs. {(completedSaleInvoice.paidAmount || 0).toLocaleString()}</span></div>
                    <div className="flex justify-between text-sm font-bold mt-1"><span>BALANCE DUE</span><span>Rs. {completedSaleInvoice.dueAmount.toLocaleString()}</span></div>
                  </div>
                )}
                
                {selectedCustomer && Number(selectedCustomer.totalPending || 0) > 0 && (
                  <div className="mt-2 pt-2 border-t border-dashed border-black text-rose-600">
                     <div className="flex justify-between text-sm font-bold"><span>Total Udhaar</span><span>Rs. {Number(selectedCustomer.totalPending || 0).toLocaleString()}</span></div>
                  </div>
                )}
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>
              <div className="text-center text-xs font-bold mt-2">THANK YOU FOR YOUR BUSINESS</div>
              <div className="text-center text-[10px] mt-1 mb-2">Developed By Syed</div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 p-4 border-t border-slate-100 bg-slate-50 print:hidden">
              <button onClick={handlePrintReceipt} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow">
                <Printer size={14} /> Print
              </button>
              <button onClick={handleWhatsAppShareModal} disabled={isCapturingImage} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow disabled:opacity-60">
                {isCapturingImage ? (
                  <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg> Preparing...</>
                ) : (
                  <><Smartphone size={14} /> WhatsApp</>
                )}
              </button>
              <button onClick={() => setCompletedSaleInvoice(null)} className="py-2.5 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1">
                <CheckCircle2 size={14} /> Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Ledger;
