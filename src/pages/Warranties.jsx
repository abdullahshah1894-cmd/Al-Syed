import { useState, useCallback, useMemo } from "react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { ShieldCheck, Search, Wrench, FileText, ListChecks } from "lucide-react";
import MobileIssues from "./MobileIssues";
import {
  Page,
  PageHeader,
  Card,
  Badge,
  Button,
  Field,
  Input,
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

// Warranty dates are stored as YYYY-MM-DD (or a timestamp): show the local day as dd/mm/yyyy, "—" when missing
const showDate = (d) => {
  if (!d) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d));
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const date = new Date(d);
  return isNaN(date.getTime()) ? String(d) : date.toLocaleDateString("en-GB");
};

// Claim workflow (same list the server accepts)
const CLAIM_STATUSES = ["Pending", "In Repair", "Sent to Company", "Resolved", "Rejected"];
const CLAIM_LABELS = { "In Repair": "In repair", "Sent to Company": "Sent to company" };
const claimLabel = (s) => CLAIM_LABELS[s] || s || "Pending";
const CLAIM_TONES = { Pending: "saffron", "In Repair": "brand", "Sent to Company": "brand", Resolved: "paid", Rejected: "neutral" };
const claimTone = (s) => CLAIM_TONES[s || "Pending"] || "neutral";
const isOpenClaim = (c) => !["Resolved", "Rejected"].includes(c.status);

// One claim: details for everyone, status / notes editing for the owner
const ClaimRow = ({ warranty, claim, canEdit, onSave }) => {
  const [status, setStatus] = useState(claim.status || "Pending");
  const [notes, setNotes] = useState(claim.notes || "");
  const [saving, setSaving] = useState(false);
  const changed = status !== (claim.status || "Pending") || notes.trim() !== (claim.notes || "").trim();
  const idBase = `claim-${claim.id}`;

  const save = async (e) => {
    e.preventDefault();
    if (!changed || saving) return;
    setSaving(true);
    try {
      // updateWarrantyClaim alerts the user itself if the database refuses
      await onSave(warranty.imei, claim.id, { status, notes: notes.trim() });
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-xl border border-line p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink break-words">{claim.issue || "No issue written"}</p>
          <p className="text-xs text-muted">
            Logged {showDate(claim.claimDate)}
            {claim.claimType ? ` · ${claim.claimType} claim` : ""}
            {claim.closedDate ? ` · Closed ${showDate(claim.closedDate)}` : ""}
          </p>
        </div>
        <Badge tone={claimTone(claim.status)}>{claimLabel(claim.status)}</Badge>
      </div>

      {canEdit && claim.id ? (
        <form onSubmit={save} className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          <Field label="Status" htmlFor={`${idBase}-status`}>
            <Select id={`${idBase}-status`} value={status} onChange={(e) => setStatus(e.target.value)} disabled={saving}>
              {CLAIM_STATUSES.map((st) => (
                <option key={st} value={st}>{claimLabel(st)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" htmlFor={`${idBase}-notes`} hint="Optional">
            <Input
              id={`${idBase}-notes`}
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              placeholder="e.g. Sent to service centre, job no. 1234"
            />
          </Field>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="submit" size="sm" disabled={!changed} loading={saving}>
              {saving ? "Saving…" : "Save claim"}
            </Button>
          </div>
        </form>
      ) : (
        claim.notes && <p className="text-xs text-ink-soft break-words">Notes: {claim.notes}</p>
      )}
    </li>
  );
};

// Status filter labels (the values stay the stored status names)
const STATUS_LABELS = {
  All: "All",
  Active: "Active",
  "Expiring Soon": "Expiring soon",
  Expired: "Expired",
  Void: "Void",
  "Pending Claims": "Open claims",
};

const statusTone = (status) =>
  status === "Active" ? "paid" : status === "Expiring Soon" ? "saffron" : "neutral";

const statusLabel = (status) => STATUS_LABELS[status] || status || "—";

const Warranties = () => {
  const { warranties, products, addWarrantyClaim, updateWarrantyClaim } = useApp();
  // Only the owner moves a claim along (the server refuses it for cashiers)
  const { isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("warranties"); // "warranties" | "repairs"
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("All");

  // Log Claim modal state
  const [claimWarranty, setClaimWarranty] = useState(null);
  const [claimIssue, setClaimIssue] = useState("");
  const [claimType, setClaimType] = useState("Brand");
  const [claimNotes, setClaimNotes] = useState("");
  const [claimError, setClaimError] = useState("");
  const [savingClaim, setSavingClaim] = useState(false);

  // Claims list modal (by warranty id, so it shows the live record after a save)
  const [claimsForId, setClaimsForId] = useState(null);
  const claimsWarranty = claimsForId ? (warranties || []).find((w) => w.id === claimsForId) || null : null;
  const closeClaimsModal = useCallback(() => setClaimsForId(null), []);

  // A dual-SIM phone's warranty is saved under one IMEI: map every unit IMEI to both of its IMEIs,
  // so searching the other IMEI still finds the warranty
  const pairedImeis = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p) =>
      (p.imeis || []).forEach((u) => {
        const keys = [...new Set([u?.imei, u?.imei1, u?.imei2].filter(Boolean).map(String))];
        if (keys.length > 1) keys.forEach((k) => map.set(k, keys));
      })
    );
    return map;
  }, [products]);

  const statusOptions = ["All", "Active", "Expiring Soon", "Expired", "Void", "Pending Claims"];

  // Open = not resolved or rejected yet
  const hasPendingClaim = (w) => (w.claims || []).some(isOpenClaim);

  const filteredWarranties = (warranties || []).filter((w) => {
    // Walk-in sales may have no phone / customer name, so guard every field
    const q = searchTerm.trim();
    const qLower = q.toLowerCase();
    const qDigits = q.replace(/[\s-]/g, "");
    const matchesSearch =
      !q ||
      (pairedImeis.get(String(w.imei || "")) || [String(w.imei || "")]).some((k) => k.includes(qDigits || q)) ||
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
    setClaimError("");
  };

  const handleClaimSubmit = async (e) => {
    e.preventDefault();
    if (!claimWarranty || savingClaim) return;
    // Spaces only pass the browser's "required" check: say what is missing
    if (!claimIssue.trim()) {
      setClaimError("Write what is wrong with the phone.");
      document.getElementById("claim-issue")?.focus();
      return;
    }
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
    const open = claims.filter(isOpenClaim).length;
    return (
      <button
        type="button"
        onClick={() => setClaimsForId(warr.id)}
        className="text-left rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-sunken"
        title={isAdmin ? "See the claims and change their status" : "See the claims"}
      >
        <span className="flex items-center gap-1.5 font-medium text-brand-700">
          <ListChecks size={14} aria-hidden="true" />
          {claims.length} {claims.length === 1 ? "claim" : "claims"}
          {open > 0 && <span className="text-xs font-normal text-muted">· {open} open</span>}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted" title={latestClaim.issue}>
          Latest <Badge tone={claimTone(latestClaim.status)}>{claimLabel(latestClaim.status)}</Badge>
          {latestClaim.closedDate && <span>closed {showDate(latestClaim.closedDate)}</span>}
        </span>
      </button>
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
            <Field label="Issue *" htmlFor="claim-issue" error={claimError}>
              <Textarea
                id="claim-issue"
                required
                rows={3}
                value={claimIssue}
                onChange={(e) => {
                  setClaimIssue(e.target.value);
                  if (claimError) setClaimError("");
                }}
                aria-invalid={!!claimError}
                className={claimError ? "border-khata-600" : undefined}
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

      {/* Claims of one warranty: status badges for everyone, status changes for the owner */}
      {claimsWarranty && (
        <Modal
          open
          onClose={closeClaimsModal}
          size="md"
          title="Warranty claims"
          description={
            <>
              {claimsWarranty.productName} · <span className="font-mono">{claimsWarranty.imei}</span>
              {claimsWarranty.customerName ? ` · ${claimsWarranty.customerName}` : ""}
            </>
          }
          footer={
            <Button variant="secondary" onClick={closeClaimsModal}>
              Close
            </Button>
          }
        >
          {(claimsWarranty.claims || []).length === 0 ? (
            <EmptyState icon={FileText} title="No claims" description="Log a claim from the warranty row." />
          ) : (
            <ul className="space-y-3">
              {[...claimsWarranty.claims].reverse().map((c, i) => (
                <ClaimRow
                  // A saved change gives the row a new key, so its form restarts from the saved values
                  key={`${c.id || i}|${c.status}|${c.notes || ""}`}
                  warranty={claimsWarranty}
                  claim={c}
                  canEdit={isAdmin}
                  onSave={updateWarrantyClaim}
                />
              ))}
            </ul>
          )}
          {!isAdmin && <p className="mt-3 text-xs text-muted">Only the owner can change a claim's status.</p>}
        </Modal>
      )}
    </Page>
  );
};

export default Warranties;
