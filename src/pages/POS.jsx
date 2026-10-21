import React, { useState, useRef, useEffect, useCallback } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, UserPlus, Printer,
  CheckCircle2, CreditCard, Banknote, Clock, Smartphone, ScanLine,
  X, AlertCircle, User, ChevronDown, Image as ImageIcon,
} from "lucide-react";

import html2canvas from "html2canvas";
import { printElement } from "../services/printReceipt";

// ─────────────────────────────────────────────────────────────────
// Exported helper to format phone numbers for WA
// ─────────────────────────────────────────────────────────────────
export const formatWAPhone = (phone) => {
  let formattedPhone = (phone || "").replace(/\D/g, "");
  if (formattedPhone.startsWith("0")) formattedPhone = "92" + formattedPhone.substring(1);
  return formattedPhone;
};

// ─────────────────────────────────────────────────────────────────
// POS Component
// ─────────────────────────────────────────────────────────────────
const POS = () => {
  const { products, customers, recordSale, shopSettings, addCustomer, activeSeller, setActiveSeller } = useApp();
  const { user } = useAuth();

  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const selectedSeller = activeSeller === "All Sellers" ? SELLERS[0] : activeSeller;
  const setSelectedSeller = setActiveSeller;
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [notes, setNotes] = useState("");

  // Customer creation modal
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");

  // Add to cart modal
  const [productToAdd, setProductToAdd] = useState(null);
  const [multiAddQty, setMultiAddQty] = useState(1);
  const [multiAddImeis, setMultiAddImeis] = useState([]);

  // Receipt modal
  const [completedSaleInvoice, setCompletedSaleInvoice] = useState(null);
  const [isCapturingImage, setIsCapturingImage] = useState(false);

  const customerDropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter customers: show customers belonging to selected seller first, then others
  const filteredCustomers = customers.filter((c) => {
    if (!customerSearch.trim()) return true;
    const q = customerSearch.toLowerCase();
    return (c.name || "").toLowerCase().includes(q) || (c.phone || "").includes(q);
  });

  // Sort: seller's customers first
  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    const aMatch = (a.sellerName || "").toLowerCase() === selectedSeller.toLowerCase();
    const bMatch = (b.sellerName || "").toLowerCase() === selectedSeller.toLowerCase();
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    return 0;
  });

  // Filter products by search
  const filteredProducts = products.filter((p) => {
    const query = searchTerm.toLowerCase().trim();
    if (!query) return true;
    return (
      (p.name || "").toLowerCase().includes(query) ||
      (p.brand || "").toLowerCase().includes(query) ||
      (p.barcode || "").includes(query) ||
      (p.imeis || []).some((i) =>
        (i.imei && i.imei.includes(query)) ||
        (i.imei1 && i.imei1.includes(query)) ||
        (i.imei2 && i.imei2.includes(query))
      )
    );
  });

  // Add product to cart
  const addToCart = (product, selectedImeiObj = null) => {
    let imeiToAssign = null;
    if (product.imeis && product.imeis.length > 0) {
      if (selectedImeiObj) {
        imeiToAssign = selectedImeiObj.imei;
      } else {
        const availableImei = product.imeis.find((i) => i.status === "in_stock");
        if (!availableImei) {
          alert(`No available in-stock IMEI for ${product.name}!`);
          return;
        }
        imeiToAssign = availableImei.imei;
      }
      if (cart.some((item) => item.imei === imeiToAssign)) {
        alert(`IMEI ${imeiToAssign} is already in the cart!`);
        return;
      }
    } else {
      const existingInCart = cart.find((item) => item.product === product.id && !item.imei);
      const cartQty = existingInCart ? existingInCart.quantity : 0;
      if (cartQty >= product.quantity) {
        alert(`Cannot add more than available stock (${product.quantity}) for ${product.name}!`);
        return;
      }
    }

    if (imeiToAssign) {
      setCart((prev) => [...prev, {
        cartId: `${product.id}_${imeiToAssign}`,
        product: product.id,
        productId: product.id,
        productName: product.name,
        brand: product.brand,
        model: product.model,
        category: product.category,
        imei: imeiToAssign,
        quantity: 1,
        unitPurchasePrice: product.purchasePrice,
        unitSalePrice: product.salePrice,
        subtotal: product.salePrice,
      }]);
    } else {
      setCart((prev) => {
        const index = prev.findIndex((item) => item.product === product.id && !item.imei);
        if (index > -1) {
          const updated = [...prev];
          const newQty = updated[index].quantity + 1;
          updated[index] = { ...updated[index], quantity: newQty, subtotal: newQty * updated[index].unitSalePrice };
          return updated;
        }
        return [...prev, {
          cartId: `${product.id}_bulk`,
          product: product.id,
          productId: product.id,
          productName: product.name,
          brand: product.brand,
          model: product.model,
          category: product.category,
          imei: null,
          quantity: 1,
          unitPurchasePrice: product.purchasePrice,
          unitSalePrice: product.salePrice,
          subtotal: product.salePrice,
        }];
      });
    }
  };

  // Handle multi-add submit
  const handleConfirmMultiAdd = () => {
    if (!productToAdd) return;
    if (productToAdd.imeis && productToAdd.imeis.length > 0) {
      if (multiAddImeis.length === 0) { alert("Please select at least one IMEI."); return; }
      multiAddImeis.forEach((imei) => addToCart(productToAdd, { imei }));
    } else {
      if (multiAddQty <= 0 || multiAddQty > productToAdd.quantity) {
        alert(`Invalid quantity. Available: ${productToAdd.quantity}`);
        return;
      }
      const existing = cart.find((item) => item.product === productToAdd.id && !item.imei);
      if ((existing ? existing.quantity : 0) + multiAddQty > productToAdd.quantity) {
        alert(`Cannot exceed stock (${productToAdd.quantity})!`);
        return;
      }
      setCart((prev) => {
        const index = prev.findIndex((item) => item.product === productToAdd.id && !item.imei);
        if (index > -1) {
          const updated = [...prev];
          const newQty = updated[index].quantity + multiAddQty;
          updated[index] = { ...updated[index], quantity: newQty, subtotal: newQty * updated[index].unitSalePrice };
          return updated;
        }
        return [...prev, {
          cartId: `${productToAdd.id}_bulk`,
          product: productToAdd.id,
          productId: productToAdd.id,
          productName: productToAdd.name,
          brand: productToAdd.brand,
          model: productToAdd.model,
          category: productToAdd.category,
          imei: null,
          quantity: multiAddQty,
          unitPurchasePrice: productToAdd.purchasePrice,
          unitSalePrice: productToAdd.salePrice,
          subtotal: productToAdd.salePrice * multiAddQty,
        }];
      });
    }
    setProductToAdd(null);
    setMultiAddQty(1);
    setMultiAddImeis([]);
  };

  const updateCartQuantity = (cartId, delta) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.cartId !== cartId) return item;
        if (item.imei) return item;
        const newQty = item.quantity + delta;
        if (newQty <= 0) return null;
        const productRef = products.find((p) => p.id === item.product);
        if (productRef && newQty > productRef.quantity) {
          alert(`Only ${productRef.quantity} available for ${item.productName}.`);
          return item;
        }
        return { ...item, quantity: newQty, subtotal: newQty * item.unitSalePrice };
      }).filter(Boolean)
    );
  };

  const removeFromCart = (cartId) => setCart((prev) => prev.filter((i) => i.cartId !== cartId));

  // Group cart items by product for display
  const getGroupedItems = (items) => {
    const groups = {};
    items.forEach((item) => {
      const key = item.product || item.productName;
      if (!groups[key]) {
        groups[key] = {
          ...item,
          imeisArray: item.imei ? [item.imei] : [],
          cartIds: item.cartId ? [item.cartId] : [],
        };
      } else {
        groups[key].quantity += item.quantity;
        groups[key].subtotal += item.subtotal || (item.quantity * item.unitSalePrice);
        if (item.cartId) groups[key].cartIds.push(item.cartId);
        if (item.imei) groups[key].imeisArray.push(item.imei);
      }
    });
    return Object.values(groups);
  };

  const groupedCart = getGroupedItems(cart);
  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const taxAmount = Math.round((subtotal * taxPercent) / 100);
  const currentSaleTotal = Math.max(0, subtotal + taxAmount - Number(discount));
  const previousBalance = selectedCustomer ? Number(selectedCustomer.totalPending || 0) : 0;
  const netTotalToPay = currentSaleTotal + previousBalance;
  const effectivePaid = paidAmountInput !== "" ? Number(paidAmountInput) : (paymentMethod === "Cash" ? currentSaleTotal : 0);
  const dueAmount = Math.max(0, currentSaleTotal - effectivePaid);

  // ── Checkout ──────────────────────────────────────────────────
  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    if (paymentMethod === "Credit (Udhaar)" && !selectedCustomer) {
      alert("Please select a customer for Udhaar (Credit) sales.");
      return;
    }
    setShowCheckoutModal(true);
  };

  const finalizeCheckout = async () => {
    if (cart.length === 0) return;
    if (paymentMethod === "Credit (Udhaar)" && !selectedCustomer) {
      alert("Please select a customer for Udhaar (Credit) sales.");
      return;
    }

    const saleData = {
      customer: selectedCustomer ? selectedCustomer.id : null,
      customerName: selectedCustomer ? selectedCustomer.name : (customerSearch.trim() || "Walk-in Customer"),
      customerPhone: selectedCustomer ? selectedCustomer.phone : "",
      sellerName: selectedSeller,
      items: cart.map((item) => ({
        ...item,
        productId: item.product,
        imeisArray: item.imei ? [item.imei] : (item.imeisArray || []),
      })),
      subtotalAmount: subtotal,
      discountAmount: Number(discount),
      taxPercent: Number(taxPercent),
      taxAmount,
      grandTotal: currentSaleTotal,
      paidAmount: effectivePaid,
      dueAmount,
      paymentMethod,
      paymentStatus: dueAmount === 0 ? "paid" : effectivePaid > 0 ? "partial" : "unpaid",
      dueDate: dueDate || null,
      cashierName: selectedSeller,
      notes,
    };

    const recorded = await recordSale(saleData);
    setCompletedSaleInvoice({ ...recorded, sellerName: selectedSeller });

    setCart([]);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setDiscount(0);
    setTaxPercent(0);
    setPaymentMethod("Cash");
    setPaidAmountInput("");
    setDueDate("");
    setNotes("");
    setShowCheckoutModal(false);
  };

  // ── Handle Quick Add Customer ─────────────────────────────────
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustName || !newCustPhone) return;
    const created = await addCustomer({
      name: newCustName,
      phone: newCustPhone,
      address: newCustAddress,
      sellerName: selectedSeller,
    });
    setSelectedCustomer(created);
    setCustomerSearch(newCustName);
    setNewCustName("");
    setNewCustPhone("");
    setNewCustAddress("");
    setShowAddCustomerModal(false);
  };

  // ── Print Receipt ─────────────────────────────────────────────
  const handlePrint = () => {
    printElement("receipt-content", "Sales Receipt");
  };

  const getSaleWAText = (sale) => {
    const shopName = shopSettings.shopName || "MOBILE SHOP";
    const shopPhone = shopSettings.phone || shopSettings.shopPhone || "";
    const currency = shopSettings.currencySymbol || "Rs.";
    const dateStr = new Date(sale.createdAt || Date.now()).toLocaleDateString("en-GB");
    const timeStr = new Date(sale.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    let text = `🧾 *${shopName}*\n`;
    if (shopPhone) text += `📞 Phone: ${shopPhone}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*SALES INVOICE: ${sale.billNumber || "INV"}*\n`;
    text += `*Date:* ${dateStr} at ${timeStr}\n`;
    text += `*Customer:* ${sale.customerName || "Walk-in Customer"}\n`;
    if (sale.customerPhone) text += `*Phone:* ${sale.customerPhone}\n`;
    if (sale.sellerName) text += `*Seller:* ${sale.sellerName}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*ITEMS PURCHASED:*\n`;

    (sale.items || []).forEach((item, index) => {
      const qty = item.quantity || item.qty || 1;
      const price = item.unitPrice || item.unitSalePrice || item.price || 0;
      const sub = item.subtotal || qty * price;
      text += `${index + 1}. *${item.productName || item.name}* (x${qty}) - ${currency} ${sub.toLocaleString()}\n`;
      if (item.imei) {
        text += `   IMEI: ${item.imei}\n`;
      }
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Subtotal:* ${currency} ${Number(sale.subtotalAmount || sale.grandTotal || 0).toLocaleString()}\n`;
    if (sale.discountAmount > 0) {
      text += `*Discount:* -${currency} ${Number(sale.discountAmount).toLocaleString()}\n`;
    }
    text += `*GRAND TOTAL:* ${currency} ${Number(sale.grandTotal || 0).toLocaleString()}\n`;
    text += `*Paid Amount:* ${currency} ${Number(sale.paidAmount || 0).toLocaleString()}\n`;
    if (Number(sale.dueAmount || 0) > 0) {
      text += `*⚠️ DUE / UDHAAR:* ${currency} ${Number(sale.dueAmount || 0).toLocaleString()}\n`;
    }
    text += `*Payment:* ${sale.paymentMethod || "Cash"}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Thank you for your business! 🙏`;
    return text;
  };

  // ── WhatsApp: Generate image from receipt HTML ────────────────
  const handleWhatsAppShare = async () => {
    if (!completedSaleInvoice) return;
    const receiptElement = document.getElementById("receipt-content");
    const waText = getSaleWAText(completedSaleInvoice);
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
          const file = new File([blob], `Invoice_${completedSaleInvoice.billNumber || "INV"}.png`, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Invoice ${completedSaleInvoice.billNumber}`,
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

    // 2. Desktop Flow: copy image to clipboard & download image
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
              a.download = `Invoice_${completedSaleInvoice.billNumber || "INV"}.png`;
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

  // ── UI ─────────────────────────────────────────────────────────
  return (
    <>
      <div className={`flex h-full overflow-hidden ${completedSaleInvoice ? "print:hidden" : ""}`}>

      {/* ── Left: Product Catalog ─────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden border-r border-slate-800">

        {/* Seller Selection Bar */}
        <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
          <User size={16} className="text-indigo-400 shrink-0" />
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">Seller:</span>
          <div className="flex gap-2">
            {SELLERS.map((seller) => (
              <button
                key={seller}
                onClick={() => {
                  setSelectedSeller(seller);
                  setSelectedCustomer(null);
                  setCustomerSearch("");
                }}
                className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-all ${
                  selectedSeller === seller
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {seller}
              </button>
            ))}
          </div>
          <div className="ml-auto text-xs text-slate-500">
            Active Seller: <span className="text-indigo-400 font-bold">{selectedSeller}</span>
          </div>
        </div>

        {/* Product Search */}
        <div className="bg-slate-900/60 px-4 py-3 border-b border-slate-800">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search products by name, brand, barcode, IMEI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Products Grid */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-20 text-slate-500">
              <ShoppingCart size={48} className="mx-auto mb-3 opacity-30" />
              <p>No products found</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredProducts.map((product) => {
                const inStockImeis = (product.imeis || []).filter((i) => i.status === "in_stock").length;
                const available = product.imeis && product.imeis.length > 0 ? inStockImeis : product.quantity;
                const outOfStock = available <= 0;
                return (
                  <button
                    key={product.id}
                    onClick={() => !outOfStock && setProductToAdd(product)}
                    disabled={outOfStock}
                    className={`text-left p-3 rounded-2xl border transition-all group ${
                      outOfStock
                        ? "bg-slate-900/30 border-slate-800/50 opacity-50 cursor-not-allowed"
                        : "bg-slate-900 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800 active:scale-[0.98] cursor-pointer"
                    }`}
                  >
                    <div className="font-semibold text-slate-100 text-sm leading-snug line-clamp-2">{product.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{product.brand} {product.model}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-indigo-400 font-extrabold text-sm">
                        Rs. {product.salePrice.toLocaleString()}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        outOfStock ? "bg-rose-900/40 text-rose-400" : "bg-emerald-900/30 text-emerald-400"
                      }`}>
                        {outOfStock ? "Out" : `${available} left`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Cart & Billing ─────────────────────────────── */}
      <div className="w-80 xl:w-96 flex flex-col bg-slate-950 border-l border-slate-800">

        {/* Customer Selection */}
        <div className="p-3 border-b border-slate-800 bg-slate-900">
          <div className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider mb-2 flex items-center justify-between">
            <span>Customer ({selectedSeller}'s Customers First)</span>
            <button
              onClick={() => setShowAddCustomerModal(true)}
              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              title="Add new customer"
            >
              <UserPlus size={12} /> New
            </button>
          </div>

          <div className="relative" ref={customerDropdownRef}>
            <div
              className={`flex items-center gap-2 bg-slate-950 border rounded-xl px-3 py-2 cursor-pointer transition-all ${
                showCustomerDropdown ? "border-indigo-500" : "border-slate-800 hover:border-slate-700"
              }`}
              onClick={() => setShowCustomerDropdown(true)}
            >
              <User size={14} className="text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search & select customer..."
                value={selectedCustomer ? selectedCustomer.name : customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setSelectedCustomer(null);
                  setShowCustomerDropdown(true);
                }}
                onClick={() => setShowCustomerDropdown(true)}
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none min-w-0"
              />
              {selectedCustomer ? (
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectedCustomer(null); setCustomerSearch(""); }}
                  className="text-slate-500 hover:text-red-400"
                >
                  <X size={14} />
                </button>
              ) : (
                <ChevronDown size={14} className="text-slate-400" />
              )}
            </div>

            {showCustomerDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 max-h-56 overflow-y-auto custom-scrollbar">
                {sortedCustomers.length === 0 ? (
                  <div className="p-3 text-center text-slate-500 text-xs">No customers found</div>
                ) : (
                  sortedCustomers.map((cust) => {
                    const isThisSeller = (cust.sellerName || "").toLowerCase() === selectedSeller.toLowerCase();
                    return (
                      <div
                        key={cust.id}
                        className="px-3 py-2.5 hover:bg-slate-800 cursor-pointer flex items-start justify-between gap-2"
                        onClick={() => {
                          setSelectedCustomer(cust);
                          setCustomerSearch(cust.name);
                          setShowCustomerDropdown(false);
                        }}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-100 truncate">{cust.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {cust.phone}
                            {cust.sellerName && (
                              <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isThisSeller
                                  ? "bg-indigo-900/50 text-indigo-300"
                                  : "bg-slate-800 text-slate-400"
                              }`}>
                                {cust.sellerName}
                              </span>
                            )}
                          </div>
                        </div>
                        {cust.totalPending > 0 && (
                          <span className="text-[10px] font-bold text-rose-400 shrink-0">
                            Udhaar: Rs.{cust.totalPending.toLocaleString()}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {selectedCustomer && selectedCustomer.totalPending > 0 && (
            <div className="mt-2 px-3 py-1.5 bg-rose-950/30 border border-rose-900/50 rounded-lg text-[11px] text-rose-400 font-semibold">
              ⚠ Previous Udhaar: Rs. {selectedCustomer.totalPending.toLocaleString()}
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 custom-scrollbar">
          {cart.length === 0 ? (
            <div className="text-center py-16 text-slate-600">
              <ShoppingCart size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Cart is empty</p>
              <p className="text-xs mt-1 text-slate-700">Select products from the left</p>
            </div>
          ) : (
            groupedCart.map((item) => (
              <div key={item.product} className="bg-slate-900 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-100 text-sm leading-snug truncate">{item.productName}</div>
                    <div className="text-[11px] text-slate-400">{item.brand} {item.model}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-indigo-400">Rs. {item.subtotal.toLocaleString()}</div>
                  </div>
                  <button
                    onClick={() => item.cartIds.forEach((id) => removeFromCart(id))}
                    className="p-1 text-slate-600 hover:text-red-400"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {item.imeisArray && item.imeisArray.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {item.imeisArray.map((imei) => (
                      <span key={imei} className="font-mono text-cyan-400 text-[10px] bg-slate-950/60 px-1.5 py-0.5 rounded border border-slate-800 flex items-center gap-1">
                        {imei}
                        <button onClick={() => removeFromCart(`${item.product}_${imei}`)} className="text-slate-500 hover:text-red-400">
                          <X size={9} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => item.cartIds.forEach((id) => updateCartQuantity(id, -1))}
                      className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="text-sm font-bold text-slate-100 min-w-[20px] text-center">{item.quantity}</span>
                    <button
                      onClick={() => item.cartIds.forEach((id) => updateCartQuantity(id, 1))}
                      className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300"
                    >
                      <Plus size={11} />
                    </button>
                    <span className="text-[11px] text-slate-500 ml-1">@ Rs.{item.unitSalePrice.toLocaleString()}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Billing Summary */}
        <div className="p-3 border-t border-slate-800 space-y-2 bg-slate-900">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Discount (Rs.)</label>
              <input
                type="number" min="0" value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 mt-0.5"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-slate-400 uppercase">Tax (%)</label>
              <input
                type="number" min="0" value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 mt-0.5"
              />
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1">
            {previousBalance > 0 && (
              <div className="flex justify-between text-[11px] text-rose-400 font-semibold">
                <span>Previous Udhaar</span>
                <span>+ Rs. {previousBalance.toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400 uppercase font-semibold">Total to Pay</span>
              <span className="text-lg font-extrabold text-indigo-400">Rs. {netTotalToPay.toLocaleString()}</span>
            </div>
          </div>

          <button
            onClick={handleCheckoutClick}
            disabled={cart.length === 0}
            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-cyan-600 hover:from-indigo-500 hover:to-cyan-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Checkout & Pay
          </button>
        </div>
      </div>
    </div>

      {/* ── Add Customer Modal ─────────────────────────────────── */}
      {showAddCustomerModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 text-base">Add New Customer</h3>
              <button onClick={() => setShowAddCustomerModal(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="text-xs bg-indigo-950/40 border border-indigo-900/40 text-indigo-300 px-3 py-2 rounded-xl font-medium">
              This customer will be associated with seller: <strong>{selectedSeller}</strong>
            </div>
            <form onSubmit={handleCreateCustomer} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-200">Full Name *</label>
                <input type="text" required value={newCustName} onChange={(e) => setNewCustName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-indigo-500" placeholder="e.g. Imran Khan" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-200">Phone Number *</label>
                <input type="text" required value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-indigo-500" placeholder="e.g. 03001234567" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-200">Address / City</label>
                <input type="text" value={newCustAddress} onChange={(e) => setNewCustAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-slate-100 mt-1 focus:outline-none focus:border-indigo-500" placeholder="e.g. Main Market, Kohat" />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddCustomerModal(false)} className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-500">Save & Select</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Checkout Modal ─────────────────────────────────────── */}
      {showCheckoutModal && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-3xl p-8 shadow-2xl relative">
            <button onClick={() => setShowCheckoutModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20} /></button>
            <h2 className="text-xl font-bold text-white mb-2 text-center">Complete Payment</h2>
            <p className="text-center text-xs text-slate-400 mb-6">Seller: <span className="text-indigo-400 font-bold">{selectedSeller}</span></p>

            <div className="bg-slate-950 rounded-2xl p-4 mb-6 text-center border border-slate-800">
              <p className="text-sm text-slate-400 uppercase tracking-wider font-semibold mb-1">Net Total</p>
              <p className="text-3xl font-black text-indigo-400">Rs. {netTotalToPay.toLocaleString()}</p>
              {selectedCustomer && <p className="text-xs text-indigo-300 font-semibold mt-2">Billing to: {selectedCustomer.name}</p>}
            </div>

            <div className="space-y-4">
              <label className="text-xs font-semibold text-slate-400 uppercase ml-1">Payment Method</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {["Cash", "Card", "Easypaisa", "Credit (Udhaar)"].map((method) => {
                  const isUdhaar = method === "Credit (Udhaar)";
                  const isSelected = paymentMethod === method;
                  return (
                    <button key={method} onClick={() => setPaymentMethod(method)}
                      className={`p-3 rounded-xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                        isSelected
                          ? isUdhaar ? "bg-rose-600 border-rose-500 text-white" : "bg-indigo-600 border-indigo-500 text-white"
                          : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                      }`}
                    >
                      {isUdhaar ? "Pending Bill" : method}
                    </button>
                  );
                })}
              </div>

              {paymentMethod === "Credit (Udhaar)" && (
                <div className="mt-4 p-4 bg-rose-950/20 border border-rose-900/30 rounded-2xl space-y-4">
                  {!selectedCustomer ? (
                    <div className="text-rose-400 text-sm font-semibold flex items-center gap-2">
                      <AlertCircle size={16} /> Please select a customer first.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-rose-300 uppercase ml-1">Paid Now (Optional)</label>
                        <input type="number" min="0" placeholder="0" value={paidAmountInput}
                          onChange={(e) => setPaidAmountInput(e.target.value)}
                          className="w-full mt-1 bg-slate-950 border border-rose-900/50 rounded-xl p-2.5 text-sm font-bold text-white focus:outline-none focus:border-rose-500" />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-rose-300 uppercase ml-1">Due Date</label>
                        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                          className="w-full mt-1 bg-slate-950 border border-rose-900/50 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-rose-500" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase ml-1">Notes (Optional)</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full mt-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500 resize-none" />
              </div>
            </div>

            <button
              onClick={finalizeCheckout}
              disabled={paymentMethod === "Credit (Udhaar)" && !selectedCustomer}
              className="w-full mt-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm & Generate Invoice
            </button>
          </div>
        </div>
      )}

      {/* ── Receipt Modal ──────────────────────────────────────── */}
      {completedSaleInvoice && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto print:static print:bg-transparent print:p-0 print:block">
          <div className="bg-white text-slate-900 w-full max-w-sm rounded-2xl shadow-2xl relative overflow-hidden print:shadow-none print:w-full print:max-w-none print:rounded-none">
            <button
              onClick={() => setCompletedSaleInvoice(null)}
              className="absolute top-3 right-3 text-slate-400 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100 z-10 print:hidden"
            >
              <X size={18} />
            </button>

            {/* Receipt Preview */}
            <div id="receipt-content" className="p-5 max-h-[70vh] overflow-y-auto print:max-h-none print:p-0 bg-white text-black print-target">
              {/* Shop Header */}
              <div className="text-center mb-4">
                <h2 className="text-xl font-black uppercase tracking-tight">{shopSettings.shopName || "AL-SYED MOBILE SHOP"}</h2>
                <p className="text-xs mt-0.5">{shopSettings.address}</p>
                <p className="text-xs">{shopSettings.phone}</p>
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
                    <div className="font-semibold mt-1">
                      Cust: {completedSaleInvoice.customerName}
                      {completedSaleInvoice.customerPhone && <div className="font-normal text-xs">{completedSaleInvoice.customerPhone}</div>}
                    </div>
                  )}
                  {completedSaleInvoice.sellerName && (
                    <div>Seller: {completedSaleInvoice.sellerName}</div>
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
                {getGroupedItems(completedSaleInvoice.items || []).map((item, idx) => {
                  const rate = item.unitSalePrice || item.price || 0;
                  const sub = item.subtotal || (item.quantity * rate);
                  return (
                    <div key={idx} className="pb-1">
                      <div className="flex justify-between items-start text-sm">
                        <div className="pr-2">
                          <div className="font-semibold">{item.productName || item.name}</div>
                          <div className="text-xs">{item.quantity} × Rs. {Number(rate).toLocaleString()}</div>
                          {item.imeisArray && item.imeisArray.length > 0 && (
                            <div className="font-mono text-[10px]">IMEI: {item.imeisArray.join(", ")}</div>
                          )}
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
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>
              <div className="text-center text-xs font-bold mt-2">THANK YOU FOR YOUR BUSINESS</div>
              <div className="text-center text-[10px] mt-1 mb-2">Developed By Syed</div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 p-4 border-t border-slate-100 bg-slate-50 print:hidden">
              <button onClick={handlePrint} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow">
                <Printer size={14} /> Print
              </button>
              <button
                onClick={handleWhatsAppShare}
                disabled={isCapturingImage}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow disabled:opacity-60"
              >
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

      {/* ── Product Add Modal ──────────────────────────────────── */}
      {productToAdd && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-sm shadow-2xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-slate-100">Add to Cart</h2>
              <button onClick={() => setProductToAdd(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-0.5">{productToAdd.name}</h3>
            <p className="text-xs text-slate-400 mb-4">{productToAdd.brand} {productToAdd.model}</p>

            {productToAdd.imeis && productToAdd.imeis.length > 0 ? (
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase">Select IMEIs</label>
                <div className="max-h-48 overflow-y-auto space-y-2 custom-scrollbar pr-2">
                  {productToAdd.imeis.filter((i) => i.status === "in_stock").map((imeiObj) => (
                    <label key={imeiObj.imei} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${multiAddImeis.includes(imeiObj.imei) ? "bg-indigo-600/20 border-indigo-500" : "bg-slate-950 border-slate-800 hover:border-slate-700"}`}>
                      <input type="checkbox" checked={multiAddImeis.includes(imeiObj.imei)}
                        onChange={(e) => {
                          if (e.target.checked) setMultiAddImeis((p) => [...p, imeiObj.imei]);
                          else setMultiAddImeis((p) => p.filter((i) => i !== imeiObj.imei));
                        }}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <div>
                        <div className="font-mono text-sm text-slate-200">
                          {imeiObj.imei1 ? `SIM 1: ${imeiObj.imei1}` : imeiObj.imei}
                          {imeiObj.imei2 ? ` | SIM 2: ${imeiObj.imei2}` : ""}
                        </div>
                        {imeiObj.ptaStatus && <div className="text-[10px] text-cyan-400">{imeiObj.ptaStatus}</div>}
                      </div>
                    </label>
                  ))}
                </div>
                <div className="text-xs text-indigo-400 font-medium">{multiAddImeis.length} selected</div>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-400 uppercase">Quantity (Max: {productToAdd.quantity})</label>
                <input type="number" min="1" max={productToAdd.quantity} value={multiAddQty}
                  onChange={(e) => setMultiAddQty(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-indigo-500" />
              </div>
            )}

            <button onClick={handleConfirmMultiAdd} className="w-full mt-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all">
              Add {productToAdd.imeis && productToAdd.imeis.length > 0 ? multiAddImeis.length : multiAddQty} to Cart
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default POS;
