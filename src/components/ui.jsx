// Shared UI building blocks for the light "khata" theme (tokens in src/index.css).
// Pages compose these instead of repeating long class strings, so the app stays consistent.
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

const cx = (...parts) => parts.filter(Boolean).join(" ");

// ── Buttons ─────────────────────────────────────────────────────────────────
const BUTTON_VARIANTS = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-sunken",
  ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
  danger: "bg-khata-600 text-white hover:bg-khata-700 shadow-sm",
  "danger-soft": "bg-khata-50 text-khata-700 border border-khata-200 hover:bg-khata-100",
  success: "bg-paid-600 text-white hover:bg-paid-700 shadow-sm",
  soft: "bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100",
};
const BUTTON_SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-5 text-base gap-2 rounded-xl",
};

export const Button = ({ variant = "primary", size = "md", icon: Icon, loading = false, className, children, disabled, type = "button", ...rest }) => (
  <button
    type={type}
    disabled={disabled || loading}
    className={cx(
      "inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
      BUTTON_VARIANTS[variant],
      BUTTON_SIZES[size],
      className
    )}
    {...rest}
  >
    {Icon && <Icon size={size === "sm" ? 14 : 16} aria-hidden="true" />}
    {children}
  </button>
);

export const IconButton = ({ icon: Icon, label, variant = "ghost", size = "md", className, ...rest }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={cx(
      "inline-flex items-center justify-center rounded-lg transition-colors disabled:opacity-50",
      size === "sm" ? "h-8 w-8" : "h-10 w-10",
      BUTTON_VARIANTS[variant],
      className
    )}
    {...rest}
  >
    <Icon size={size === "sm" ? 15 : 18} aria-hidden="true" />
  </button>
);

// ── Layout pieces ───────────────────────────────────────────────────────────
export const Page = ({ className, children }) => (
  <div className={cx("mx-auto w-full max-w-[1400px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7 space-y-6", className)}>{children}</div>
);

export const PageHeader = ({ title, description, actions }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold sm:text-[1.75rem] leading-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted max-w-2xl">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const Card = ({ className, padded = true, children, ...rest }) => (
  <div className={cx("bg-surface border border-line rounded-2xl shadow-card", padded && "p-4 sm:p-5", className)} {...rest}>
    {children}
  </div>
);

export const CardHeader = ({ title, description, actions, className }) => (
  <div className={cx("flex flex-wrap items-start justify-between gap-3 mb-4", className)}>
    <div className="min-w-0">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

// ── Data display ────────────────────────────────────────────────────────────
const TONES = {
  neutral: "bg-sunken text-ink-soft",
  brand: "bg-brand-50 text-brand-700",
  khata: "bg-khata-50 text-khata-700",
  paid: "bg-paid-50 text-paid-700",
  saffron: "bg-saffron-50 text-saffron-700",
};

export const Badge = ({ tone = "neutral", className, children }) => (
  <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", TONES[tone], className)}>
    {children}
  </span>
);

const STAT_VALUE_TONES = { neutral: "text-ink", brand: "text-brand-700", khata: "text-khata-600", paid: "text-paid-600", saffron: "text-saffron-700" };

export const Stat = ({ label, value, hint, tone = "neutral", icon: Icon, onClick, className }) => {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cx(
        "text-left bg-surface border border-line rounded-2xl p-4 shadow-card w-full",
        onClick && "hover:border-brand-200 transition-colors",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {Icon && <Icon size={16} className="text-muted" aria-hidden="true" />}
      </div>
      <div className={cx("mt-1.5 font-display text-2xl font-bold leading-tight", STAT_VALUE_TONES[tone])}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Tag>
  );
};

// Rs 12,500 — red only when it is money owed to the shop (Udhaar)
export const Money = ({ amount, currency = "Rs.", owed = false, className }) => {
  const n = Number(amount) || 0;
  return (
    <span className={cx("tabular-nums whitespace-nowrap", owed && n > 0 && "text-khata-600 font-semibold", className)}>
      {currency} {n.toLocaleString("en-PK", { maximumFractionDigits: 2 })}
    </span>
  );
};

export const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-12 px-4">
    {Icon && (
      <div className="w-12 h-12 rounded-2xl bg-sunken text-muted flex items-center justify-center mb-3">
        <Icon size={22} aria-hidden="true" />
      </div>
    )}
    <p className="font-semibold text-ink">{title}</p>
    {description && <p className="text-sm text-muted mt-1 max-w-sm">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

// Horizontal scroll on small screens instead of squashing columns
export const TableWrap = ({ className, children }) => (
  <div className={cx("overflow-x-auto -mx-4 sm:mx-0 custom-scrollbar", className)}>
    <table className="min-w-full text-sm">{children}</table>
  </div>
);
export const Th = ({ className, children, ...rest }) => (
  <th className={cx("px-3 py-2.5 text-left text-xs font-semibold text-muted bg-sunken first:rounded-l-lg last:rounded-r-lg whitespace-nowrap", className)} {...rest}>
    {children}
  </th>
);
export const Td = ({ className, children, ...rest }) => (
  <td className={cx("px-3 py-3 border-b border-line align-middle", className)} {...rest}>
    {children}
  </td>
);

// Segmented choice: [{ value, label }]
export const Segmented = ({ options, value, onChange, className, size = "md" }) => (
  <div role="tablist" className={cx("inline-flex flex-wrap gap-1 rounded-xl bg-sunken p-1", className)}>
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="tab"
        aria-selected={value === o.value}
        onClick={() => onChange(o.value)}
        className={cx(
          "rounded-lg font-semibold transition-colors",
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
          value === o.value ? "bg-surface text-brand-700 shadow-sm" : "text-ink-soft hover:text-ink"
        )}
      >
        {o.label}
      </button>
    ))}
  </div>
);

// ── Forms ───────────────────────────────────────────────────────────────────
export const inputClass =
  "w-full h-10 rounded-xl border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/70 " +
  "focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:bg-sunken disabled:text-muted";

export const Field = ({ label, hint, error, htmlFor, className, children }) => (
  <div className={cx("space-y-1.5", className)}>
    {label && (
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink-soft">
        {label}
      </label>
    )}
    {children}
    {error ? <p className="text-xs text-khata-600">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
  </div>
);

export const Input = ({ className, ...rest }) => <input className={cx(inputClass, className)} {...rest} />;
export const Select = ({ className, children, ...rest }) => (
  <select className={cx(inputClass, "pr-8", className)} {...rest}>
    {children}
  </select>
);
export const Textarea = ({ className, ...rest }) => (
  <textarea className={cx(inputClass, "h-auto min-h-[84px] py-2.5 resize-y", className)} {...rest} />
);

// ── Modal ───────────────────────────────────────────────────────────────────
// Full screen on phones, centered card from sm up. Esc and the backdrop close it.
const MODAL_SIZES = { sm: "sm:max-w-md", md: "sm:max-w-lg", lg: "sm:max-w-2xl", xl: "sm:max-w-4xl" };

export const Modal = ({ open, onClose, title, description, size = "md", footer, children, z = "z-50", closeOnBackdrop = true }) => {
  const panelRef = useRef(null);
  // Latest onClose without re-running the open effect: pages often pass a new function each render,
  // and re-running would steal focus from the input being typed in
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // Only the top-most dialog closes (stacked modals)
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs.length && dialogs[dialogs.length - 1] !== panelRef.current) return;
      onCloseRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the panel once when it opens (not on every render)
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className={cx("fixed inset-0 flex items-stretch sm:items-center justify-center bg-ink/40 backdrop-blur-[2px] sm:p-4 print:hidden", z)}
      onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && onCloseRef.current?.()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={cx(
          "bg-surface w-full flex flex-col shadow-pop outline-none",
          "h-full sm:h-auto sm:max-h-[90vh] sm:rounded-2xl",
          MODAL_SIZES[size]
        )}
      >
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-line">
            <div className="min-w-0">
              {title && <h2 className="text-lg font-bold leading-snug">{title}</h2>}
              {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
            </div>
            {onClose && <IconButton icon={X} label="Close" size="sm" onClick={onClose} />}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-line flex flex-wrap justify-end gap-2 bg-surface sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
};
