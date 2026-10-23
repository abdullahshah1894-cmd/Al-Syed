import { useState, useCallback } from "react";
import { useApp } from "../context/AppContext";
import { useAuth } from "../context/AuthContext";
import { Wrench, Plus, Search, FileText, Info, Trash2 } from "lucide-react";
import {
  Page,
  PageHeader,
  Card,
  Badge,
  Button,
  IconButton,
  Field,
  Input,
  Textarea,
  Segmented,
  TableWrap,
  Th,
  Td,
  EmptyState,
  Modal,
} from "../components/ui";

const STATUSES = ["Pending", "Under Inspection", "Repaired", "Delivered", "Rejected"];

// Shown in sentence case; the saved values stay as they are
const STATUS_LABEL = { "Under Inspection": "Under inspection" };
const statusLabel = (s) => STATUS_LABEL[s] || s;

// Colour per status (badge tone + matching select colours)
const STATUS_TONE = { Pending: "saffron", "Under Inspection": "brand", Repaired: "paid", Delivered: "neutral", Rejected: "neutral" };
const SELECT_TONE = {
  saffron: "bg-saffron-50 text-saffron-700 border-saffron-200",
  brand: "bg-brand-50 text-brand-700 border-brand-200",
  paid: "bg-paid-50 text-paid-700 border-paid-200",
  neutral: "bg-sunken text-ink-soft border-line-strong",
};

// "12 Oct 2026" in local time; "—" when the date is missing or unreadable
const formatDay = (d) => {
  const date = d ? new Date(d) : null;
  return date && !isNaN(date.getTime())
    ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "—";
};

const FIELD_IDS = { customerName: "issue-customer", companyName: "issue-company", imei: "issue-imei", phoneIssue: "issue-problem" };

// Inside the Warranties page the repairs list is shown without its own page frame and title
const EmbeddedWrap = ({ children }) => <div className="space-y-4">{children}</div>;

const MobileIssues = ({ embedded = false }) => {
  const Wrap = embedded ? EmbeddedWrap : Page;
  const { issues, addIssue, updateIssueStatus, deleteIssue } = useApp();
  // Deleting a ticket is for the owner only (the server refuses it for cashiers)
  const { isAdmin } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // view filter only
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState(null); // ticket whose status change / delete is being saved

  // Form State
  const [customerName, setCustomerName] = useState("");
  const [imei, setImei] = useState("");
  const [phoneIssue, setPhoneIssue] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [errors, setErrors] = useState({}); // field -> message
  const clearError = (field) => setErrors((prev) => (prev[field] ? { ...prev, [field]: "" } : prev));
  const openAddModal = () => {
    setErrors({});
    setShowAddModal(true);
  };

  // Stable, so the modal does not grab focus back from the inputs on every keystroke
  const closeAddModal = useCallback(() => {
    if (isSaving) return;
    setShowAddModal(false);
  }, [isSaving]);

  const handleAddIssue = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    const name = customerName.trim();
    const issueText = phoneIssue.trim();
    const company = companyName.trim();
    // Spaces only pass the browser's "required" check, so say exactly which box needs filling
    const found = {};
    if (!name) found.customerName = "Enter the customer's name.";
    if (!company) found.companyName = "Enter the phone company, e.g. Samsung.";
    if (!imei) found.imei = "Enter the phone's 15-digit IMEI.";
    else if (!/^\d{15}$/.test(imei)) found.imei = `IMEI must be exactly 15 digits (${imei.length} typed).`;
    if (!issueText) found.phoneIssue = "Write what is wrong with the phone.";
    setErrors(found);
    const firstBad = ["customerName", "companyName", "imei", "phoneIssue"].find((k) => found[k]);
    if (firstBad) {
      document.getElementById(FIELD_IDS[firstBad])?.focus();
      return;
    }

    setIsSaving(true);
    try {
      // addIssue alerts the user itself on failure; the form keeps what was typed
      const newIssue = await addIssue({ customerName: name, imei, phoneIssue: issueText, companyName: company });
      if (newIssue) {
        setShowAddModal(false);
        setCustomerName("");
        setImei("");
        setPhoneIssue("");
        setCompanyName("");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // updateIssueStatus alerts on failure; the select then shows the saved status again
  const handleStatusChange = async (id, newStatus) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await updateIssueStatus(id, newStatus);
    } finally {
      setBusyId(null);
    }
  };

  // deleteIssue alerts the user itself if the database refuses
  const handleDelete = async (issue) => {
    if (!isAdmin || busyId) return;
    if (!window.confirm(`Delete repair ticket ${issue.ticketNumber || ""} for ${issue.customerName || "customer"}?`)) return;
    setBusyId(issue.id);
    try {
      await deleteIssue(issue.id);
    } finally {
      setBusyId(null);
    }
  };

  const searchedIssues = (issues || []).filter((issue) => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return true;
    return [issue.ticketNumber, issue.customerName, issue.imei, issue.companyName, issue.phoneIssue].some((v) =>
      String(v || "").toLowerCase().includes(s)
    );
  });
  const filteredIssues =
    statusFilter === "all" ? searchedIssues : searchedIssues.filter((i) => (i.status || "Pending") === statusFilter);

  const filterOptions = [
    { value: "all", label: `All (${searchedIssues.length})` },
    ...STATUSES.map((st) => ({
      value: st,
      label: `${statusLabel(st)} (${searchedIssues.filter((i) => (i.status || "Pending") === st).length})`,
    })),
  ];

  const statusSelect = (issue, className = "") => (
    <select
      aria-label={`Status of ticket ${issue.ticketNumber || ""}`}
      value={issue.status || "Pending"}
      disabled={!!busyId}
      onChange={(e) => handleStatusChange(issue.id, e.target.value)}
      className={`h-10 rounded-xl border px-2.5 pr-7 text-sm font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60 disabled:cursor-wait ${
        SELECT_TONE[STATUS_TONE[issue.status || "Pending"] || "neutral"]
      } ${className}`}
    >
      {STATUSES.map((st) => (
        <option key={st} value={st}>
          {statusLabel(st)}
        </option>
      ))}
      {issue.status && !STATUSES.includes(issue.status) && <option value={issue.status}>{issue.status}</option>}
    </select>
  );

  const deleteButton = (issue) =>
    isAdmin ? (
      <IconButton
        icon={Trash2}
        label="Delete ticket"
        variant="danger-soft"
        onClick={() => handleDelete(issue)}
        disabled={!!busyId}
      />
    ) : null;

  const emptyState = (
    <EmptyState
      icon={FileText}
      title={(issues || []).length === 0 ? "No repair tickets yet" : "No ticket matches"}
      description={
        (issues || []).length === 0
          ? "When a customer leaves a phone for repair, add a ticket with New repair ticket."
          : "Try another search or status."
      }
    />
  );

  return (
    <Wrap>
      {embedded ? (
        <div className="flex justify-end">
          <Button icon={Plus} onClick={openAddModal}>
            New repair ticket
          </Button>
        </div>
      ) : (
        <PageHeader
          title="Repair tickets"
          description="Phones customers left for repair. Change the status as the work moves on."
          actions={
            <Button icon={Plus} onClick={openAddModal}>
              New repair ticket
            </Button>
          }
        />
      )}

      <Card padded={false}>
        <div className="p-4 sm:p-5 space-y-3 border-b border-line">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              type="text"
              aria-label="Search tickets"
              placeholder="Search ticket, IMEI, customer, company…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Segmented options={filterOptions} value={statusFilter} onChange={setStatusFilter} size="sm" />
        </div>

        {filteredIssues.length === 0 ? (
          emptyState
        ) : (
          <>
            {/* Phones: one card per ticket */}
            <ul className="md:hidden divide-y divide-line">
              {filteredIssues.map((issue) => (
                <li key={issue.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-brand-700">{issue.ticketNumber}</span>
                        <Badge tone={STATUS_TONE[issue.status || "Pending"] || "neutral"}>{statusLabel(issue.status || "Pending")}</Badge>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-ink truncate">{issue.customerName}</p>
                      <p className="text-xs text-muted">
                        {issue.companyName} · <span className="font-mono">{issue.imei}</span>
                      </p>
                    </div>
                    <span className="text-xs text-muted shrink-0">{formatDay(issue.createdAt)}</span>
                  </div>
                  <p className="text-sm text-ink-soft break-words">{issue.phoneIssue}</p>
                  <div className="flex items-center gap-2">
                    {statusSelect(issue, "flex-1 min-w-0")}
                    {deleteButton(issue)}
                  </div>
                </li>
              ))}
            </ul>

            {/* Tablet and up: table */}
            <div className="hidden md:block p-4 sm:p-5 pt-2 sm:pt-3">
              <TableWrap>
                <thead>
                  <tr>
                    <Th>Ticket</Th>
                    <Th>Customer</Th>
                    <Th>Phone</Th>
                    <Th>Problem</Th>
                    <Th>Received</Th>
                    <Th>Status</Th>
                    {isAdmin && <Th className="text-right">Delete</Th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredIssues.map((issue) => (
                    <tr key={issue.id} className="hover:bg-sunken/60 transition-colors">
                      <Td>
                        <span className="font-mono text-xs font-semibold text-brand-700 whitespace-nowrap">{issue.ticketNumber}</span>
                      </Td>
                      <Td>
                        <div className="font-semibold text-ink">{issue.customerName}</div>
                      </Td>
                      <Td>
                        <div className="font-semibold text-ink">{issue.companyName}</div>
                        <div className="text-xs font-mono text-muted mt-0.5 whitespace-nowrap">IMEI {issue.imei}</div>
                      </Td>
                      <Td className="max-w-[260px]">
                        <div className="text-ink-soft truncate" title={issue.phoneIssue}>
                          {issue.phoneIssue}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-ink-soft">{formatDay(issue.createdAt)}</Td>
                      <Td>{statusSelect(issue)}</Td>
                      {isAdmin && <Td className="text-right">{deleteButton(issue)}</Td>}
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </div>
          </>
        )}
      </Card>

      {/* Add Issue Modal */}
      <Modal
        open={showAddModal}
        onClose={closeAddModal}
        title="New repair ticket"
        footer={
          <>
            <Button variant="secondary" onClick={closeAddModal} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="submit" form="add-issue-form" icon={Wrench} loading={isSaving}>
              {isSaving ? "Saving…" : "Save ticket"}
            </Button>
          </>
        }
      >
        <form id="add-issue-form" onSubmit={handleAddIssue} noValidate className="space-y-4">
          <Field label="Customer name *" htmlFor="issue-customer" error={errors.customerName}>
            <Input
              id="issue-customer"
              type="text"
              required
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                clearError("customerName");
              }}
              aria-invalid={!!errors.customerName}
              placeholder="Customer's name"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Phone company *" htmlFor="issue-company" error={errors.companyName}>
              <Input
                id="issue-company"
                type="text"
                required
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  clearError("companyName");
                }}
                aria-invalid={!!errors.companyName}
                placeholder="e.g. Samsung"
              />
            </Field>
            <Field label="IMEI *" htmlFor="issue-imei" hint={`${imei.length}/15 digits`} error={errors.imei}>
              <Input
                id="issue-imei"
                type="text"
                inputMode="numeric"
                required
                maxLength={15}
                minLength={15}
                pattern="\d{15}"
                value={imei}
                onChange={(e) => {
                  setImei(e.target.value.replace(/\D/g, "").slice(0, 15));
                  clearError("imei");
                }}
                aria-invalid={!!errors.imei}
                placeholder="15-digit IMEI"
                className="font-mono"
              />
            </Field>
          </div>

          <Field label="What is wrong with the phone? *" htmlFor="issue-problem" error={errors.phoneIssue}>
            <Textarea
              id="issue-problem"
              required
              value={phoneIssue}
              onChange={(e) => {
                setPhoneIssue(e.target.value);
                clearError("phoneIssue");
              }}
              aria-invalid={!!errors.phoneIssue}
              placeholder="e.g. Screen cracked, battery drains fast"
              rows={4}
            />
          </Field>

          <div className="flex items-start gap-2 p-3 bg-brand-50 rounded-xl">
            <Info size={16} className="text-brand-700 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-brand-700">Today's date and a unique ticket number are added automatically when you save.</p>
          </div>
        </form>
      </Modal>
    </Wrap>
  );
};

export default MobileIssues;
