import { useState, useRef, useEffect, useCallback } from "react";
import { useApp, SELLERS } from "../context/AppContext";
import {
  ShoppingCart, Search, Plus, Minus, Trash2, UserPlus, Printer,
  CheckCircle2, Share2, X, AlertCircle, User, ChevronDown, PackageSearch,
} from "lucide-react";

import { printElement } from "../services/printReceipt";
import { useShareImage } from "../components/useShareImage";
import {
  Badge, Button, EmptyState, Field, IconButton, Input, Modal, Money, Segmented, Textarea, inputClass,
} from "../components/ui";

const cx = (...parts) => parts.filter(Boolean).join(" ");
// "Rs. 12,500" for the big totals (the number and the currency are styled separately)
const fmt = (n) => (Number(n) || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });

// Kept for older importers; the helper now lives in utils/shareImage
// eslint-disable-next-line react-refresh/only-export-components
export { formatWAPhone } from "../utils/shareImage";

// ─────────────────────────────────────────────────────────────────
// POS Component
// ─────────────────────────────────────────────────────────────────
const POS = () => {
  // All customers, not the header-filtered list: choosing a seller only sorts their customers first
  const { products, allCustomers: customers, recordSale, shopSettings, addCustomer, activeSeller, setActiveSeller } = useApp();

  const [cart, setCart] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  // The header filter can say "All Sellers" / "All", which is not a seller: the bill then goes to the first seller
  const selectedSeller = activeSeller && !/^all\b/i.test(activeSeller) ? activeSeller : SELLERS[0];
  const setSelectedSeller = setActiveSeller;
  const [pickedCustomer, setSelectedCustomer] = useState(null);
  // Always the latest copy of the chosen customer, so the previous Udhaar shown and printed is current
  const selectedCustomer = pickedCustomer ? customers.find((c) => c.id === pickedCustomer.id) || pickedCustomer : null;
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paidAmountInput, setPaidAmountInput] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submittingRef = useRef(false); // blocks a second click before the button re-renders as disabled
  const [notes, setNotes] = useState("");

  // Customer creation modal
  const [showAddCustomerModal, setShowAddCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustAddress, setNewCustAddress] = useState("");
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);

  // Add to cart modal
  const [productToAdd, setProductToAdd] = useState(null);
  const [multiAddQty, setMultiAddQty] = useState("1"); // kept as typed, so the box can be cleared and retyped
  const [multiAddImeis, setMultiAddImeis] = useState([]);

  // Receipt modal
  const [completedSaleInvoice, setCompletedSaleInvoice] = useState(null);
  const [openShare, shareDialog] = useShareImage();

  // Phones / tablets: the cart opens over the products from the bottom bar
  const [cartOpen, setCartOpen] = useState(false);
  // A finished sale closes the phone cart, so the receipt is what the seller sees next
  if (completedSaleInvoice && cartOpen) setCartOpen(false);

  // Stable close handlers: the shared Modal refocuses itself whenever onClose changes
  const closeAddCustomer = useCallback(() => setShowAddCustomerModal(false), []);
  const closeCheckout = useCallback(() => setShowCheckoutModal(false), []);

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
  // A product already in the cart keeps the price typed for it; otherwise its saved sale price
  const cartPriceFor = (productId, fallback) => {
    const typed = cart.find((i) => i.product === productId && Number(i.unitSalePrice) > 0);
    return typed ? Number(typed.unitSalePrice) : Number(fallback) || 0;
  };

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
        unitSalePrice: cartPriceFor(product.id, product.salePrice),
        subtotal: cartPriceFor(product.id, product.salePrice),
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
          unitSalePrice: cartPriceFor(product.id, product.salePrice),
          subtotal: cartPriceFor(product.id, product.salePrice),
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
      const qty = parseInt(multiAddQty, 10) || 0;
      if (qty <= 0 || qty > productToAdd.quantity) {
        alert(`Invalid quantity. Available: ${productToAdd.quantity}`);
        return;
      }
      const existing = cart.find((item) => item.product === productToAdd.id && !item.imei);
      if ((existing ? existing.quantity : 0) + qty > productToAdd.quantity) {
        alert(`Cannot exceed stock (${productToAdd.quantity})!`);
        return;
      }
      setCart((prev) => {
        const index = prev.findIndex((item) => item.product === productToAdd.id && !item.imei);
        if (index > -1) {
          const updated = [...prev];
          const newQty = updated[index].quantity + qty;
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
          quantity: qty,
          unitPurchasePrice: productToAdd.purchasePrice,
          unitSalePrice: cartPriceFor(productToAdd.id, productToAdd.salePrice),
          subtotal: cartPriceFor(productToAdd.id, productToAdd.salePrice) * qty,
        }];
      });
    }
    setProductToAdd(null);
    setMultiAddQty("1");
    setMultiAddImeis([]);
  };

  const updateCartQuantity = (cartId, delta) => {
    // Check stock before updating, so the alert shows once
    const current = cart.find((item) => item.cartId === cartId);
    if (!current || current.imei) return;
    const newQty = current.quantity + delta;
    const productRef = products.find((p) => p.id === current.product);
    if (newQty > 0 && productRef && newQty > productRef.quantity) {
      alert(`Only ${productRef.quantity} available for ${current.productName}.`);
      return;
    }
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cartId !== cartId) return item;
          if (newQty <= 0) return null;
          return { ...item, quantity: newQty, subtotal: newQty * item.unitSalePrice };
        })
        .filter(Boolean)
    );
  };

  const openAddToCart = (product) => {
    setMultiAddImeis([]);
    setMultiAddQty("1");
    setProductToAdd(product);
  };
  const closeAddToCart = useCallback(() => {
    setProductToAdd(null);
    setMultiAddImeis([]);
    setMultiAddQty("1");
  }, []);

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
  const toAmount = (v) => Math.max(0, Number(v) || 0);
  const subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const taxAmount = Math.round((subtotal * toAmount(taxPercent)) / 100);
  const discountAmount = Math.min(toAmount(discount), subtotal + taxAmount);
  const currentSaleTotal = subtotal + taxAmount - discountAmount;
  const previousBalance = selectedCustomer ? Number(selectedCustomer.totalPending || 0) : 0;
  const isUdhaarSale = paymentMethod === "Credit (Udhaar)";
  // Cash / Card / Easypaisa pay this bill in full. On a Pending Bill the "Paid Now" amount counts;
  // anything paid above this bill goes against the customer's old Udhaar (done by the backend).
  const effectivePaid = isUdhaarSale
    ? Math.min(toAmount(paidAmountInput), currentSaleTotal + previousBalance)
    : currentSaleTotal;
  const dueAmount = Math.max(0, currentSaleTotal - effectivePaid);
  const balanceAfterSale = Math.max(0, previousBalance + currentSaleTotal - effectivePaid);

  // Set the price of every unit of one product in the cart
  const setCartPrice = (productId, value) => {
    const price = value === "" ? "" : Math.max(0, Number(value) || 0);
    setCart((prev) =>
      prev.map((item) =>
        item.product === productId
          ? { ...item, unitSalePrice: price, subtotal: Number(item.quantity || 1) * (Number(price) || 0) }
          : item
      )
    );
  };
  // Lines without a price: a bill cannot go out with an item at Rs 0
  const unpricedNames = [...new Set(cart.filter((i) => !(Number(i.unitSalePrice) > 0)).map((i) => i.productName))];

  // ── Checkout ──────────────────────────────────────────────────
  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    if (unpricedNames.length > 0) {
      alert(`Enter a price for: ${unpricedNames.join(", ")}`);
      return;
    }
    if (paymentMethod === "Credit (Udhaar)" && !selectedCustomer) {
      alert("Please select a customer for Udhaar (Credit) sales.");
      return;
    }
    setShowCheckoutModal(true);
  };

  const finalizeCheckout = async () => {
    if (cart.length === 0 || isSubmitting || submittingRef.current) return;
    if (unpricedNames.length > 0) {
      alert(`Enter a price for: ${unpricedNames.join(", ")}`);
      return;
    }
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
      discountAmount,
      taxPercent: toAmount(taxPercent),
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

    submittingRef.current = true;
    setIsSubmitting(true);
    let recorded;
    try {
      recorded = await recordSale(saleData);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
    // Not saved: keep the cart and the checkout open so nothing is lost
    if (!recorded) return;
    setCompletedSaleInvoice({ ...recorded, sellerName: selectedSeller, previousBalance, balanceAfterSale });

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
    if (!newCustName.trim() || !newCustPhone.trim() || isSavingCustomer) return;
    setIsSavingCustomer(true);
    let created;
    try {
      created = await addCustomer({
        name: newCustName.trim(),
        phone: newCustPhone.trim(),
        address: newCustAddress,
        sellerName: selectedSeller,
      });
    } finally {
      setIsSavingCustomer(false);
    }
    // Not saved: the form stays open with what was typed
    if (!created) return;
    setSelectedCustomer(created);
    setCustomerSearch(created.name);
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
      text += `${index + 1}. *${item.productName || item.name}* (x${qty}) - ${currency} ${Number(sub || 0).toLocaleString()}\n`;
      const imeis = (item.imeisArray && item.imeisArray.length > 0 ? item.imeisArray : [item.imei]).filter(Boolean);
      if (imeis.length > 0) {
        text += `   IMEI: ${imeis.join(", ")}\n`;
      }
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Subtotal:* ${currency} ${Number(sale.subtotalAmount || sale.grandTotal || 0).toLocaleString()}\n`;
    if (sale.taxAmount > 0) {
      text += `*Tax (${sale.taxPercent}%):* +${currency} ${Number(sale.taxAmount).toLocaleString()}\n`;
    }
    if (sale.discountAmount > 0) {
      text += `*Discount:* -${currency} ${Number(sale.discountAmount).toLocaleString()}\n`;
    }
    text += `*GRAND TOTAL:* ${currency} ${Number(sale.grandTotal || 0).toLocaleString()}\n`;
    text += `*Paid Amount:* ${currency} ${Number(sale.paidAmount || 0).toLocaleString()}\n`;
    if (Number(sale.dueAmount || 0) > 0) {
      text += `*⚠️ DUE / UDHAAR:* ${currency} ${Number(sale.dueAmount || 0).toLocaleString()}\n`;
    }
    if (Number(sale.previousBalance || 0) > 0) {
      text += `*Previous Udhaar:* ${currency} ${Number(sale.previousBalance).toLocaleString()}\n`;
      text += `*TOTAL OUTSTANDING:* ${currency} ${Number(sale.balanceAfterSale || 0).toLocaleString()}\n`;
    }
    text += `*Payment:* ${sale.paymentMethod || "Cash"}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `Thank you for your business! 🙏`;
    return text;
  };

  // ── Share the receipt as a picture: preview, then WhatsApp / any app / copy / download ──
  const handleWhatsAppShare = () => {
    if (!completedSaleInvoice) return;
    openShare({
      element: document.getElementById("receipt-content"),
      fileName: `Invoice_${completedSaleInvoice.billNumber || "INV"}.png`,
      phone: completedSaleInvoice.customerPhone,
      text: getSaleWAText(completedSaleInvoice),
      title: "Share Invoice",
    });
  };

  // ── UI ─────────────────────────────────────────────────────────
  const cartCount = cart.reduce((n, item) => n + item.quantity, 0);
  const cartCountLabel = `${cartCount} item${cartCount === 1 ? "" : "s"}`;
  const sellerOptions = SELLERS.map((s) => ({ value: s, label: s }));
  const pickSeller = (seller) => {
    setSelectedSeller(seller);
    setSelectedCustomer(null);
    setCustomerSearch("");
  };

  return (
    <>
      <div className={`lg:flex lg:h-[calc(100dvh-4rem-1px)] lg:overflow-hidden ${completedSaleInvoice ? "print:hidden" : ""}`}>

      {/* ── Left: products ───────────────────────────────────── */}
      <section className="flex-1 min-w-0 flex flex-col lg:overflow-hidden" aria-label="Products">
        <div className="bg-surface border-b border-line px-4 sm:px-6 py-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="hidden lg:block text-2xl font-bold leading-tight">New sale</h1>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xs font-semibold text-ink-soft shrink-0">Seller</span>
              <Segmented options={sellerOptions} value={selectedSeller} onChange={pickSeller} />
            </div>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search by name, brand, barcode or IMEI"
              aria-label="Search products"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={cx(inputClass, "pl-9")}
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 lg:overflow-y-auto custom-scrollbar px-4 sm:px-6 pt-4 pb-28 lg:pb-6">
          {filteredProducts.length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title={products.length === 0 ? "No products yet" : "No products found"}
              description={
                products.length === 0
                  ? "Add products in Inventory, then sell them here."
                  : "Nothing matches your search. Try a name, brand, barcode or IMEI."
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {filteredProducts.map((product) => {
                const inStockImeis = (product.imeis || []).filter((i) => i.status === "in_stock").length;
                const available = product.imeis && product.imeis.length > 0 ? inStockImeis : product.quantity;
                const outOfStock = available <= 0;
                const lowStock = !outOfStock && available <= Number(product.minStockAlert || 0);
                return (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => !outOfStock && openAddToCart(product)}
                    disabled={outOfStock}
                    className={cx(
                      "text-left p-3 rounded-2xl border bg-surface flex flex-col gap-1 min-h-[7.5rem] transition-colors",
                      outOfStock
                        ? "border-line opacity-60 cursor-not-allowed"
                        : "border-line shadow-card hover:border-brand-300 hover:bg-brand-50/40 cursor-pointer"
                    )}
                  >
                    <span className="font-semibold text-ink text-sm leading-snug line-clamp-2">{product.name}</span>
                    <span className="text-xs text-muted truncate">{[product.brand, product.model].filter(Boolean).join(" ") || " "}</span>
                    <span className="mt-auto pt-2 flex flex-wrap items-center justify-between gap-1.5">
                      <Money amount={product.salePrice} className="text-sm font-semibold text-ink" />
                      <Badge tone={outOfStock ? "khata" : lowStock ? "saffron" : "paid"}>
                        {outOfStock ? "Out of stock" : `${available} left`}
                      </Badge>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── Right: cart and bill (a full-screen sheet on phones) ── */}
      <div
        aria-label="Cart"
        className={cx(
          cartOpen ? "flex" : "hidden",
          "lg:flex flex-col bg-surface fixed inset-0 z-40 overflow-y-auto",
          "lg:static lg:z-auto lg:w-[360px] xl:w-[400px] lg:shrink-0 lg:border-l lg:border-line lg:overflow-hidden"
        )}
      >
        {/* Phone sheet title */}
        <div className="lg:hidden flex items-center justify-between gap-3 px-4 h-14 border-b border-line shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight">Cart</h2>
            <p className="text-xs text-muted">{cartCountLabel} · Seller {selectedSeller}</p>
          </div>
          <IconButton icon={X} label="Close cart" onClick={() => setCartOpen(false)} />
        </div>

        {/* Customer */}
        <div className="p-4 border-b border-line space-y-2 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Customer</p>
              <p className="text-xs text-muted truncate">{selectedSeller}'s customers are listed first</p>
            </div>
            <Button variant="soft" size="md" icon={UserPlus} onClick={() => setShowAddCustomerModal(true)} className="shrink-0">
              New
            </Button>
          </div>

          <div className="relative" ref={customerDropdownRef}>
            <div
              className={cx(
                "flex items-center gap-2 h-10 rounded-xl border bg-surface pl-3 pr-1 cursor-text transition-colors",
                showCustomerDropdown ? "border-brand-500 ring-2 ring-brand-100" : "border-line-strong hover:border-muted"
              )}
              onClick={() => setShowCustomerDropdown(true)}
            >
              <User size={15} className="text-muted shrink-0" aria-hidden="true" />
              <input
                type="text"
                placeholder="Walk-in, or search a customer"
                aria-label="Customer"
                value={selectedCustomer ? selectedCustomer.name : customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setSelectedCustomer(null);
                  setShowCustomerDropdown(true);
                }}
                onClick={() => setShowCustomerDropdown(true)}
                className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted/80 focus:outline-none min-w-0"
              />
              {selectedCustomer ? (
                <button
                  type="button"
                  aria-label="Clear customer"
                  onClick={(e) => { e.stopPropagation(); setSelectedCustomer(null); setCustomerSearch(""); }}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
                >
                  <X size={15} />
                </button>
              ) : (
                <ChevronDown size={15} className="text-muted mr-2" aria-hidden="true" />
              )}
            </div>

            {showCustomerDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-line rounded-xl shadow-pop z-50 max-h-64 overflow-y-auto custom-scrollbar py-1">
                {sortedCustomers.length === 0 ? (
                  <div className="px-3 py-4 text-center text-muted text-sm">
                    No customer found. Use New to add one, or leave it for a walk-in sale.
                  </div>
                ) : (
                  sortedCustomers.map((cust) => {
                    const isThisSeller = (cust.sellerName || "").toLowerCase() === selectedSeller.toLowerCase();
                    return (
                      <button
                        type="button"
                        key={cust.id}
                        className="w-full text-left px-3 py-2.5 hover:bg-sunken flex items-start justify-between gap-2"
                        onClick={() => {
                          setSelectedCustomer(cust);
                          setCustomerSearch(cust.name);
                          setShowCustomerDropdown(false);
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-ink truncate">{cust.name}</span>
                          <span className="flex items-center gap-2 text-xs text-muted">
                            {cust.phone}
                            {cust.sellerName && <Badge tone={isThisSeller ? "brand" : "neutral"}>{cust.sellerName}</Badge>}
                          </span>
                        </span>
                        {cust.totalPending > 0 && (
                          <span className="text-xs text-muted shrink-0 text-right">
                            Udhaar
                            <Money amount={cust.totalPending} owed className="block" />
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {selectedCustomer && selectedCustomer.totalPending > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-khata-50 px-3 py-2 text-xs text-khata-700">
              <span className="font-medium">Old Udhaar</span>
              <Money amount={selectedCustomer.totalPending} owed />
            </div>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 min-h-[10rem] lg:min-h-0 lg:overflow-y-auto custom-scrollbar p-4 space-y-2">
          {cart.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Cart is empty"
              description="Tap a product to add it to this bill."
            />
          ) : (
            groupedCart.map((item) => (
              <div key={item.product} className="rounded-xl border border-line p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-ink text-sm leading-snug truncate">{item.productName}</div>
                    <div className="text-xs text-muted truncate">{item.brand} {item.model}</div>
                  </div>
                  <Money amount={item.subtotal} className="text-sm font-semibold text-ink shrink-0 pt-0.5" />
                  <IconButton
                    icon={Trash2}
                    label={`Remove ${item.productName}`}
                    size="sm"
                    onClick={() => item.cartIds.forEach((id) => removeFromCart(id))}
                    className="-mr-1 -mt-1 hover:text-khata-600"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-muted">
                  <span className="shrink-0">Price each</span>
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    aria-label={`Price of ${item.productName}`}
                    value={item.unitSalePrice === 0 ? "" : item.unitSalePrice}
                    placeholder="Enter price"
                    onChange={(e) => setCartPrice(item.product, e.target.value)}
                    className={`h-9 w-full rounded-lg border px-2.5 text-sm font-semibold text-ink tabular-nums focus:outline-none focus:ring-2 ${
                      Number(item.unitSalePrice) > 0
                        ? "border-line-strong focus:border-brand-500 focus:ring-brand-100"
                        : "border-saffron-400 bg-saffron-50 focus:border-saffron-500 focus:ring-saffron-100"
                    }`}
                  />
                </label>

                {item.imeisArray && item.imeisArray.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {item.imeisArray.map((imei) => (
                      <span key={imei} className="inline-flex items-center gap-0.5 rounded-lg bg-sunken pl-2 font-mono text-[11px] text-ink-soft">
                        {imei}
                        <button
                          type="button"
                          aria-label={`Remove IMEI ${imei}`}
                          onClick={() => removeFromCart(`${item.product}_${imei}`)}
                          className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-muted hover:text-khata-600"
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <IconButton
                      icon={Minus}
                      label="One less"
                      variant="secondary"
                      onClick={() => item.cartIds.forEach((id) => updateCartQuantity(id, -1))}
                    />
                    <span className="text-sm font-bold text-ink min-w-[2rem] text-center tabular-nums">{item.quantity}</span>
                    <IconButton
                      icon={Plus}
                      label="One more"
                      variant="secondary"
                      onClick={() => item.cartIds.forEach((id) => updateCartQuantity(id, 1))}
                    />

                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Bill */}
        <div className="p-4 border-t border-line space-y-3 bg-surface shrink-0">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount (Rs.)" htmlFor="pos-discount">
              <Input
                id="pos-discount"
                type="number" min="0" inputMode="decimal" value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </Field>
            <Field label="Tax (%)" htmlFor="pos-tax">
              <Input
                id="pos-tax"
                type="number" min="0" inputMode="decimal" value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
              />
            </Field>
          </div>

          {previousBalance > 0 && (
            <p className="text-xs text-ink-soft leading-relaxed">
              Old Udhaar <Money amount={previousBalance} owed /> is not in this total. Collect it on a pending bill or in
              Udhaar accounts.
            </p>
          )}

          {/* The one bold moment: what the customer pays now */}
          <div className="rounded-2xl bg-brand-600 p-4 text-white">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold text-brand-100">Total to pay</span>
              <span className="text-xs text-brand-100">{cartCountLabel}</span>
            </div>
            <div className="mt-1 font-display font-bold leading-none tabular-nums whitespace-nowrap">
              <span className="text-lg text-brand-100 mr-1.5">Rs.</span>
              <span className="text-4xl xl:text-[2.75rem]">{fmt(currentSaleTotal)}</span>
            </div>
            {(taxAmount > 0 || discountAmount > 0) && (
              <div className="mt-2 text-xs text-brand-100 flex flex-wrap gap-x-3 gap-y-0.5">
                <span>Items Rs. {fmt(subtotal)}</span>
                {taxAmount > 0 && <span>Tax + Rs. {fmt(taxAmount)}</span>}
                {discountAmount > 0 && <span>Discount − Rs. {fmt(discountAmount)}</span>}
              </div>
            )}
            <button
              type="button"
              onClick={handleCheckoutClick}
              disabled={cart.length === 0 || unpricedNames.length > 0}
              className="mt-4 w-full h-12 rounded-xl bg-white text-brand-700 text-base font-semibold hover:bg-brand-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Checkout and pay
            </button>
            {unpricedNames.length > 0 && (
              <p className="mt-2 text-xs text-white/90">Enter a price for {unpricedNames.join(", ")} to check out.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Phones / tablets: cart bar ───────────────────────── */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] print:hidden">
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="w-full h-12 rounded-xl bg-brand-600 text-white px-4 flex items-center justify-between gap-3 hover:bg-brand-700 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <ShoppingCart size={18} aria-hidden="true" />
            <span className="truncate">{cartCount === 0 ? "Cart is empty" : cartCountLabel}</span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            <span className="font-display text-lg font-bold tabular-nums">Rs. {fmt(currentSaleTotal)}</span>
            <span className="text-xs font-semibold text-brand-100">View cart</span>
          </span>
        </button>
      </div>
    </div>

      {/* ── Add customer ───────────────────────────────────────── */}
      <Modal
        open={showAddCustomerModal}
        onClose={closeAddCustomer}
        title="Add customer"
        description={`Linked to seller ${selectedSeller}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={closeAddCustomer}>Cancel</Button>
            <Button type="submit" form="pos-add-customer-form" disabled={isSavingCustomer}>
              {isSavingCustomer ? "Saving…" : "Save and select"}
            </Button>
          </>
        }
      >
        <form id="pos-add-customer-form" onSubmit={handleCreateCustomer} className="space-y-4">
          <Field label="Name" htmlFor="pos-cust-name">
            <Input id="pos-cust-name" type="text" required value={newCustName} onChange={(e) => setNewCustName(e.target.value)} placeholder="e.g. Imran Khan" />
          </Field>
          <Field label="Phone number" htmlFor="pos-cust-phone">
            <Input id="pos-cust-phone" type="tel" inputMode="tel" required value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="e.g. 03001234567" />
          </Field>
          <Field label="Address or city (optional)" htmlFor="pos-cust-address">
            <Input id="pos-cust-address" type="text" value={newCustAddress} onChange={(e) => setNewCustAddress(e.target.value)} placeholder="e.g. Main Market, Kohat" />
          </Field>
        </form>
      </Modal>

      {/* ── Checkout ───────────────────────────────────────────── */}
      <Modal
        open={showCheckoutModal}
        onClose={closeCheckout}
        title="Take payment"
        description={`Seller: ${selectedSeller}`}
        footer={
          <>
            <Button variant="secondary" onClick={closeCheckout}>Back to cart</Button>
            <Button
              size="lg"
              onClick={finalizeCheckout}
              disabled={isSubmitting || (paymentMethod === "Credit (Udhaar)" && !selectedCustomer)}
              className="flex-1 sm:flex-none"
            >
              {isSubmitting ? "Saving…" : "Confirm and save bill"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="rounded-2xl bg-sunken p-4 text-center">
            <p className="text-xs font-semibold text-muted">This bill</p>
            <p className="mt-1 font-display text-3xl font-bold text-ink tabular-nums">Rs. {fmt(currentSaleTotal)}</p>
            {previousBalance > 0 && (
              <p className="mt-2 text-xs text-ink-soft">
                Old Udhaar <Money amount={previousBalance} owed /> · Balance after this bill <Money amount={balanceAfterSale} owed />
              </p>
            )}
            {selectedCustomer && (
              <p className="mt-1 text-xs text-ink-soft">
                Billing to <span className="font-semibold text-ink">{selectedCustomer.name}</span>
              </p>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-ink-soft mb-1.5">Payment method</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {["Cash", "Card", "Easypaisa", "Credit (Udhaar)"].map((method) => {
                const isUdhaar = method === "Credit (Udhaar)";
                const isSelected = paymentMethod === method;
                return (
                  <button
                    type="button"
                    key={method}
                    aria-pressed={isSelected}
                    onClick={() => { setPaymentMethod(method); setPaidAmountInput(""); }}
                    className={cx(
                      "h-11 px-2 rounded-xl border text-sm font-semibold transition-colors",
                      isSelected
                        ? isUdhaar ? "bg-khata-600 border-khata-600 text-white" : "bg-brand-600 border-brand-600 text-white"
                        : "bg-surface border-line-strong text-ink hover:bg-sunken"
                    )}
                  >
                    {isUdhaar ? "Pending bill" : method}
                  </button>
                );
              })}
            </div>
          </div>

          {paymentMethod === "Credit (Udhaar)" && (
            <div className="p-4 bg-khata-50 border border-khata-100 rounded-2xl">
              {!selectedCustomer ? (
                <div className="text-khata-700 text-sm font-semibold flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
                  A pending bill needs a customer. Go back to the cart and choose one.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Paid now (optional)" htmlFor="pos-paid-now">
                    <Input
                      id="pos-paid-now"
                      type="number" min="0" inputMode="decimal" placeholder="0" value={paidAmountInput}
                      onChange={(e) => setPaidAmountInput(e.target.value)}
                      className="font-semibold"
                    />
                  </Field>
                  <Field label="Due date" htmlFor="pos-due-date">
                    <Input id="pos-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                  </Field>
                </div>
              )}
            </div>
          )}

          <Field label="Notes (optional)" htmlFor="pos-notes">
            <Textarea id="pos-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>
      </Modal>

      {/* ── Receipt (kept outside Modal so the browser print fallback can show it) ── */}
      {completedSaleInvoice && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] flex items-stretch sm:items-center justify-center sm:p-4 z-50 print:static print:bg-transparent print:p-0 print:block">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Receipt"
            className="bg-white w-full sm:max-w-sm h-full sm:h-auto sm:max-h-[92vh] flex flex-col sm:rounded-2xl shadow-pop overflow-hidden print:overflow-visible print:shadow-none print:w-full print:max-w-none print:h-auto print:max-h-none print:rounded-none print:block"
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line bg-surface print:hidden">
              <div className="flex items-center gap-2 min-w-0">
                <span className="h-8 w-8 rounded-full bg-paid-50 text-paid-600 inline-flex items-center justify-center shrink-0">
                  <CheckCircle2 size={18} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">Bill saved</p>
                  <p className="text-xs text-muted font-mono truncate">{completedSaleInvoice.billNumber}</p>
                </div>
              </div>
              <IconButton icon={X} label="Close receipt" size="sm" onClick={() => setCompletedSaleInvoice(null)} />
            </div>

            {/* Receipt Preview — the scroll box is the outer div, so the image / print gets the whole receipt */}
            <div className="flex-1 overflow-y-auto sm:max-h-[65vh] bg-sunken sm:bg-white print:max-h-none print:overflow-visible print:bg-white">
            <div id="receipt-content" className="p-5 print:p-0 bg-white text-black print-target">
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
                {completedSaleInvoice.taxAmount > 0 && (
                  <div className="flex justify-between"><span>Tax ({completedSaleInvoice.taxPercent}%)</span><span>+Rs. {completedSaleInvoice.taxAmount.toLocaleString()}</span></div>
                )}
                {completedSaleInvoice.discountAmount > 0 && (
                  <div className="flex justify-between"><span>Discount</span><span>−Rs. {completedSaleInvoice.discountAmount.toLocaleString()}</span></div>
                )}

                <div className="flex justify-between text-lg font-black mt-2 pt-2 border-t border-black"><span>TOTAL</span><span>Rs. {completedSaleInvoice.grandTotal.toLocaleString()}</span></div>

                {(completedSaleInvoice.dueAmount > 0 || completedSaleInvoice.previousBalance > 0) && (
                  <div className="mt-2 pt-2 border-t border-dashed border-black">
                    <div className="flex justify-between text-sm"><span>Paid</span><span>Rs. {(completedSaleInvoice.paidAmount || 0).toLocaleString()}</span></div>
                    {completedSaleInvoice.dueAmount > 0 && (
                      <div className="flex justify-between text-sm font-bold mt-1"><span>BALANCE DUE</span><span>Rs. {completedSaleInvoice.dueAmount.toLocaleString()}</span></div>
                    )}
                    {completedSaleInvoice.previousBalance > 0 && (
                      <>
                        <div className="flex justify-between text-sm mt-1"><span>Previous Udhaar</span><span>Rs. {completedSaleInvoice.previousBalance.toLocaleString()}</span></div>
                        <div className="flex justify-between text-sm font-bold mt-1"><span>TOTAL OUTSTANDING</span><span>Rs. {(completedSaleInvoice.balanceAfterSale || 0).toLocaleString()}</span></div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t-2 border-dashed border-black my-3"></div>
              <div className="text-center text-xs font-bold mt-2">THANK YOU FOR YOUR BUSINESS</div>
              <div className="text-center text-[10px] mt-1 mb-2">Developed By Syed</div>
            </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-3 gap-2 p-4 border-t border-line bg-surface pb-[max(1rem,env(safe-area-inset-bottom))] print:hidden">
              <Button icon={Printer} onClick={handlePrint}>Print</Button>
              <Button variant="secondary" icon={Share2} onClick={handleWhatsAppShare}>Share</Button>
              <Button variant="ghost" icon={CheckCircle2} onClick={() => setCompletedSaleInvoice(null)}>Done</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add to cart ────────────────────────────────────────── */}
      <Modal
        open={!!productToAdd}
        onClose={closeAddToCart}
        title="Add to cart"
        description={productToAdd ? [productToAdd.name, [productToAdd.brand, productToAdd.model].filter(Boolean).join(" ")].filter(Boolean).join(" · ") : undefined}
        size="sm"
        footer={
          productToAdd && (
            <Button onClick={handleConfirmMultiAdd} className="w-full" size="lg">
              Add {productToAdd.imeis && productToAdd.imeis.length > 0 ? multiAddImeis.length : parseInt(multiAddQty, 10) || 0} to cart
            </Button>
          )
        }
      >
        {productToAdd && (productToAdd.imeis && productToAdd.imeis.length > 0 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-ink-soft">Choose the phones being sold</p>
              <Badge tone={multiAddImeis.length > 0 ? "brand" : "neutral"}>{multiAddImeis.length} selected</Badge>
            </div>
            <div className="space-y-2">
              {/* Units already in the cart are left out, so picking them cannot fail */}
              {productToAdd.imeis.filter((i) => i.status === "in_stock" && !cart.some((c) => c.imei === i.imei)).map((imeiObj) => {
                const checked = multiAddImeis.includes(imeiObj.imei);
                return (
                  <label
                    key={imeiObj.imei}
                    className={cx(
                      "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                      checked ? "bg-brand-50 border-brand-300" : "bg-surface border-line hover:bg-sunken"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) setMultiAddImeis((p) => [...p, imeiObj.imei]);
                        else setMultiAddImeis((p) => p.filter((i) => i !== imeiObj.imei));
                      }}
                      className="h-4 w-4 shrink-0 accent-brand-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-sm text-ink break-all">
                        {imeiObj.imei1 ? `SIM 1: ${imeiObj.imei1}` : imeiObj.imei}
                        {imeiObj.imei2 ? ` | SIM 2: ${imeiObj.imei2}` : ""}
                      </div>
                    </div>
                    {imeiObj.ptaStatus && <Badge tone="neutral">{imeiObj.ptaStatus}</Badge>}
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          <Field label={`Quantity (${productToAdd.quantity} in stock)`} htmlFor="pos-add-qty">
            <Input
              id="pos-add-qty"
              type="number" min="1" max={productToAdd.quantity} inputMode="numeric" value={multiAddQty}
              onChange={(e) => setMultiAddQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleConfirmMultiAdd()}
            />
          </Field>
        ))}
      </Modal>

      {shareDialog}
    </>
  );
};

export default POS;
