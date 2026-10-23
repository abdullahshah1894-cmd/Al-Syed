import { useState, useCallback, useMemo, useDeferredValue, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useApp, getProductStock } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { Boxes, Plus, Search } from "lucide-react";
import { Page, PageHeader, Card, Button, Segmented, EmptyState, inputClass } from "../components/ui";
import { cx, CATEGORIES } from "../components/inventory/shared";
import ProductList from "../components/inventory/ProductList";
import AddProductModal from "../components/inventory/AddProductModal";
import EditProductModal from "../components/inventory/EditProductModal";
import AddStockModal from "../components/inventory/AddStockModal";

const CATEGORY_OPTIONS = ["All", ...CATEGORIES].map((c) => ({ value: c, label: c }));

const matchesProduct = (p, q) => {
  if (!q) return true;
  const qLower = q.toLowerCase();
  return (
    (p.name || "").toLowerCase().includes(qLower) ||
    (p.brand || "").toLowerCase().includes(qLower) ||
    (p.model || "").toLowerCase().includes(qLower) ||
    String(p.barcode || "").includes(q) ||
    (Array.isArray(p.imeis) &&
      p.imeis.some((i) => [i?.imei, i?.imei1, i?.imei2].some((k) => k && String(k).includes(q))))
  );
};

// The page holds only the search, the filter and which modal is open. Each form keeps its own
// state in its own component, so typing or scanning never re-renders the product list.
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
  // The list follows the search box a moment later, so the box itself never lags
  const deferredSearch = useDeferredValue(searchTerm);
  const [selectedCategory, setSelectedCategory] = useState("All");

  const [showAddModal, setShowAddModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [stockProduct, setStockProduct] = useState(null);

  // Stable handlers: the memoised list only re-renders when its products change
  const openAddModal = useCallback(() => setShowAddModal(true), []);
  const closeAddModal = useCallback(() => setShowAddModal(false), []);
  const closeEditModal = useCallback(() => setEditProduct(null), []);
  const closeStockModal = useCallback(() => setStockProduct(null), []);
  // deleteProduct is recreated on every context update: read the latest one through a ref
  const deleteRef = useRef(deleteProduct);
  useEffect(() => {
    deleteRef.current = deleteProduct;
  });
  const handleDelete = useCallback(
    async (prod) => {
      if (!isAdmin) return;
      if (!window.confirm(`Delete ${prod.name}? ${getProductStock(prod)} unit(s) in stock`)) return;
      await deleteRef.current(prod.id);
    },
    [isAdmin]
  );

  const filteredProducts = useMemo(() => {
    const q = deferredSearch.trim();
    return (products || []).filter(
      (p) => !p.isDeleted && (selectedCategory === "All" || p.category === selectedCategory) && matchesProduct(p, q)
    );
  }, [products, deferredSearch, selectedCategory]);

  const curr = shopSettings.currencySymbol;

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
            <Button icon={Plus} onClick={openAddModal}>
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
        <Segmented options={CATEGORY_OPTIONS} value={selectedCategory} onChange={setSelectedCategory} />
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
                <Button icon={Plus} onClick={openAddModal}>
                  Add product
                </Button>
              ) : null
            }
          />
        ) : (
          <ProductList
            products={filteredProducts}
            isAdmin={isAdmin}
            curr={curr}
            onAddStock={setStockProduct}
            onEdit={setEditProduct}
            onDelete={handleDelete}
          />
        )}
      </Card>

      {/* Forms are mounted only while open, so each one starts from clean defaults */}
      {isAdmin && showAddModal && <AddProductModal onClose={closeAddModal} products={products} addProduct={addProduct} />}
      {isAdmin && editProduct && (
        <EditProductModal key={editProduct.id} product={editProduct} onClose={closeEditModal} updateProduct={updateProduct} />
      )}
      {isAdmin && stockProduct && (
        <AddStockModal key={stockProduct.id} product={stockProduct} products={products} onClose={closeStockModal} addStock={addStock} />
      )}
    </Page>
  );
};

export default Inventory;
