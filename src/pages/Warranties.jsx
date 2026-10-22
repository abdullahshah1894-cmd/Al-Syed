import { useState, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { ShieldCheck, Search, Wrench, FileText } from "lucide-react";
import MobileIssues from "./MobileIssues";
import {
  Page,
  PageHeader,
  Card,
  Badge,
  Button,
  Field,
  Select,
  Textarea,
  Segmented,
  TableWrap,
  Th,
  Td,
  EmptyState,
  Modal,
  inputClass,
} from "../components/ui";

// Warranty dates are stored as YYYY-MM-DD (or a timestamp): show the local day, "—" when missing
const showDate = (d) => {
  if (!d) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return String(d);
  const date = new Date(d);
  return isNaN(date.getTime()) ? String(d) : date.toLocaleDateString("en-CA");
};

// Status filter labels (the values stay the stored status names)
const STATUS_LABELS = {
  All: "All",
  Active: "Active",
  "Expiring Soon": "Expiring soon",
  Expired: "Expired",
  Void: "Void",
  "Pending Claims": "Pending claims",
};

const statusTone = (status) =>
  status === "Active" ? "paid" : status === "Expiring Soon" ? "saffron" : "neutral";

const statusLabel = (status) => STATUS_LABELS[status] || status || "—";

const Warranties = () => {
  const { warranties, addWarrantyClaim } = useApp();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("warranties"); // "warranties" | "repairs"
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("All");

  // Log Claim modal state
  const [claimWarranty, setClaimWarranty] = useState(null);
  const [claimIssue, setClaimIssue] = useState("");
  const [claimType, setClaimType] = useState("Brand");
  const [claimNotes, setClaimNotes] = useState("");
  const [savingClaim, setSavingClaim] = useState(false);

  const statusOptions = ["All", "Active", "Expiring Soon", "Expired", "Void", "Pending Claims"];

  const hasPendingClaim = (w) => (w.claims || []).some((c) => c.status === "Pending");

  const filteredWarranties = (warranties || []).filter((w) => {
    // Walk-in sales may have no phone / customer name, so guard every field
    const q = searchTerm.trim();
    const qLower = q.toLowerCase();
    const qDigits = q.replace(/[\s-]/g, "");
    const matchesSearch =
      !q ||
      String(w.imei || "").includes(qDigits || q) ||
      [w.productName, w.brand, w.model, w.customerName].some((v) => String(v || "").toLowerCase().includes(qLower)) ||
      (!!qDigits && String(w.customerPhone || "").replace(/[\s-]/g, "").includes(qDigits));
    const matchesStatus =
      selectedStatusFilter === "All" ||
      (selectedStatusFilter === "Pending Claims" ? hasPendingClaim(w) : w.status === selectedStatusFilter);
    return matchesSearch && matchesStatus;
  });

  const openClaimModal = (w) => {
    setClaimWarranty(w);
    setClaimIssue("");
    setClaimType(w.warrantyType === "Shop Warranty" ? "Shop" : "Brand");
    setClaimNotes("");
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    if (!claimWarranty || !claimIssue.trim() || savingClaim) return;
    setSavingClaim(true);
    try {
      // addWarrantyClaim alerts the user itself if the database refuses; the modal keeps the input
      const saved = await addWarrantyClaim(claimWarranty.imei, {
        issue: claimIssue.trim(),
        claimType,
        status: "Pending",
        notes: claimNotes.trim(),
      });
      if (saved) setClaimWarranty(null);
    } finally {
      setSavingClaim(false);
    }
  };

  // Stable between keystrokes, so the modal does not take focus back from the form fields
  const closeClaimModal = useCallback(() => {
    if (savingClaim) return;
    setClaimWarranty(null);
  }, [savingClaim]);

  // Claims summary shared by the table and the phone cards
  const claimSummary = (warr) => {
    const claims = warr.claims || [];
    const latestClaim = claims.length > 0 ? claims[claims.length - 1] : null;
    if (!latestClaim) return <span className="text-xs text-muted">No claims</span>;
    return (
      <div>
        <div className="font-medium text-ink">
          {claims.length} {claims.length === 1 ? "claim" : "claims"}
        </div>
        <div
          className={`text-xs font-semibold ${latestClaim.status === "Pending" ? "text-saffron-700" : "text-muted"}`}
          title={latestClaim.issue}
        >
          Latest: {latestClaim.status || "Pending"}
          {latestClaim.claimType ? ` (${latestClaim.claimType})` : ""}
        </div>
      </div>
    );
  };

  // A void warranty belongs to a returned phone; the server would put the claim on
  // the IMEI's latest warranty instead, so no claim is logged here
  const claimAction = (warr, className) =>
    warr.status === "Void" ? (
      <span className="text-xs text-muted whitespace-nowrap">Returned, warranty void</span>
    ) : (
      <Button variant="secondary" icon={FileText} onClick={() => openClaimModal(warr)} className={className} title="Log warranty claim">
        Log claim
      </Button>
    );

  const emptyState = (
    <EmptyState
      icon={ShieldCheck}
      title="No warranties found"
      description={
        searchTerm.trim() || selectedStatusFilter !== "All"
          ? "Nothing matches this search or filter. Clear the search or pick All."
          : "Warranties appear here when a phone with an IMEI is sold."
      }
    />
  );

  return (
    <Page>
      <PageHeader
        title="Warranty and repairs"
        description="Track phone warranties, log claims and manage repair tickets."
        actions={
          <Segmented
            value={activeTab}
            onChange={setActiveTab}
            options={[
              {
                value: "warranties",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck size={15} aria-hidden="true" /> Warranties
                  </span>
                ),
              },
              {
                value: "repairs",
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Wrench size={15} aria-hidden="true" /> Repair tickets
                  </span>
                ),
              },
            ]}
          />
        }
      />

      {activeTab === "repairs" ? (
        <MobileIssues embedded />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Segmented
              size="sm"
              value={selectedStatusFilter}
              onChange={setSelectedStatusFilter}
              options={statusOptions.map((st) => ({ value: st, label: STATUS_LABELS[st] }))}
            />

            <div className="relative w-full lg:w-80 shrink-0">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="text"
                placeholder="Search IMEI, phone, customer…"
                aria-label="Search warranties"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>

          {/* Phones and tablets: one card per warranty */}
          <div className="space-y-3 lg:hidden">
            {filteredWarranties.length === 0 ? (
              <Card padded={false}>{emptyState}</Card>
            ) : (
              filteredWarranties.map((warr) => (
                <Card key={warr.id} className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink">{warr.productName}</div>
                      <div className="text-xs text-muted">
                        {warr.brand} {warr.model}
                      </div>
                      <div className="mt-1 font-mono text-xs text-ink-soft break-all">{warr.imei}</div>
                    </div>
                    <Badge tone={statusTone(warr.status)}>{statusLabel(warr.status)}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="text-xs text-muted">Customer</div>
                      <div className="font-medium text-ink truncate">{warr.customerName || "Walk-in customer"}</div>
                      <div className="text-xs text-muted">{warr.customerPhone || "No phone"}</div>
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs text-muted">{warr.warrantyType || "Warranty"}</div>
                      <div className="text-ink-soft">From {showDate(warr.warrantyStartDate || warr.purchaseDate)}</div>
                      <div className="font-semibold text-ink">Until {showDate(warr.warrantyExpiryDate)}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    {claimSummary(warr)}
                    {claimAction(warr)}
                  </div>
                </Card>
              ))
            )}
          </div>

          {/* Desktop: table */}
          <Card className="hidden lg:block">
            {filteredWarranties.length === 0 ? (
              emptyState
            ) : (
              <TableWrap>
                <thead>
                  <tr>
                    <Th>IMEI</Th>
                    <Th>Phone</Th>
                    <Th>Customer</Th>
                    <Th>Warranty period</Th>
                    <Th>Type</Th>
                    <Th>Claims</Th>
                    <Th className="text-right">Status</Th>
                    <Th className="text-right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWarranties.map((warr) => (
                    <tr key={warr.id} className="hover:bg-sunken/60 transition-colors">
                      <Td className="font-mono text-xs text-ink-soft whitespace-nowrap">{warr.imei}</Td>

                      <Td>
                        <div className="font-semibold text-ink">{warr.productName}</div>
                        <div className="text-xs text-muted">
                          {warr.brand} {warr.model}
                        </div>
                      </Td>

                      <Td>
                        <div className="font-medium text-ink">{warr.customerName || "Walk-in customer"}</div>
                        <div className="text-xs text-muted">{warr.customerPhone || "No phone"}</div>
                      </Td>

                      <Td className="whitespace-nowrap">
                        <div className="text-ink-soft">From {showDate(warr.warrantyStartDate || warr.purchaseDate)}</div>
                        <div className="font-semibold text-ink">Until {showDate(warr.warrantyExpiryDate)}</div>
                      </Td>

                      <Td>
                        <Badge tone="brand">{warr.warrantyType || "—"}</Badge>
                      </Td>

                      <Td>{claimSummary(warr)}</Td>

                      <Td className="text-right">
                        <Badge tone={statusTone(warr.status)}>{statusLabel(warr.status)}</Badge>
                      </Td>

                      <Td className="text-right">{claimAction(warr)}</Td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </div>
      )}

      {/* Log Claim Modal */}
      {claimWarranty && (
        <Modal
          open
          onClose={closeClaimModal}
          size="sm"
          title="Log warranty claim"
          description={
            <>
              {claimWarranty.productName} · <span className="font-mono">{claimWarranty.imei}</span>
            </>
          }
          footer={
            <>
              <Button variant="secondary" onClick={closeClaimModal} disabled={savingClaim}>
                Cancel
              </Button>
              <Button type="submit" form="warranty-claim-form" loading={savingClaim}>
                {savingClaim ? "Saving…" : "Save claim"}
              </Button>
            </>
          }
        >
          <form id="warranty-claim-form" onSubmit={handleClaimSubmit} className="space-y-4">
            <Field label="Issue" htmlFor="claim-issue">
              <Textarea
                id="claim-issue"
                required
                rows={3}
                value={claimIssue}
                onChange={(e) => setClaimIssue(e.target.value)}
                placeholder="What is wrong with the phone?"
              />
            </Field>

            <Field label="Claim type" htmlFor="claim-type">
              <Select id="claim-type" value={claimType} onChange={(e) => setClaimType(e.target.value)}>
                <option value="Brand">Brand (official service centre)</option>
                <option value="Shop">Shop</option>
              </Select>
            </Field>

            <Field label="Notes" htmlFor="claim-notes" hint="Optional">
              <Textarea
                id="claim-notes"
                rows={2}
                value={claimNotes}
                onChange={(e) => setClaimNotes(e.target.value)}
                placeholder="Anything the shop should remember"
              />
            </Field>
          </form>
        </Modal>
      )}
    </Page>
  );
};

export default Warranties;
