// innerHTML does not carry what was typed into inputs, so the copy shows their current values as text
const snapshotHtml = (element) => {
  const clone = element.cloneNode(true);
  const originals = element.querySelectorAll("input, textarea, select");
  clone.querySelectorAll("input, textarea, select").forEach((field, i) => {
    const source = originals[i];
    if (!source) return;
    if (source.type === "checkbox" || source.type === "radio" || source.type === "date") {
      field.remove();
      return;
    }
    const text = document.createElement("span");
    text.className = "print-field";
    text.textContent = source.tagName === "SELECT" ? source.options[source.selectedIndex]?.text || "" : source.value;
    field.replaceWith(text);
  });
  return clone.innerHTML;
};

const escapeHtml = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * Prints only the specified HTML element by opening an isolated, clean print window.
 * This completely prevents any blank leading or trailing pages caused by SPA DOM trees.
 *
 * @param {string} elementId - The ID of the container to print
 * @param {string} [title='Receipt'] - Optional title for the print document
 * @param {{ paper?: "receipt" | "a4" }} [options] - "a4" for wide pages such as the ledger statement
 */
export const printElement = (elementId, title = "Receipt", { paper = "receipt" } = {}) => {
  const element = document.getElementById(elementId);
  if (!element) {
    window.print();
    return;
  }

  const wide = paper === "a4";
  const printWindow = window.open("", "_blank", wide ? "width=900,height=700" : "width=400,height=600");
  if (!printWindow) {
    // If popup blocked, fallback to standard window.print
    window.print();
    return;
  }

  const htmlContent = snapshotHtml(element);
  const pageCss = wide
    ? `
          @page { size: A4; margin: 10mm; }
          html, body { width: auto; max-width: none; }
          .receipt-wrapper { width: 100%; padding: 0; }
          table { table-layout: auto !important; }
          th, td { padding: 2px 4px !important; }`
    : "";

  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          *, *::before, *::after {
            box-sizing: border-box !important;
            margin: 0;
            padding: 0;
          }
          html, body {
            width: 80mm;
            max-width: 80mm;
            margin: 0 auto;
            padding: 0;
            background: #ffffff;
            color: #000000;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, monospace;
            font-size: 11px;
            line-height: 1.35;
            overflow-wrap: anywhere;
          }
          .receipt-wrapper {
            width: 72mm;
            margin: 0 auto;
            padding: 2mm 1mm 5mm 1mm;
          }
          .flex {
            display: flex !important;
          }
          .justify-between {
            justify-content: space-between !important;
          }
          .grid {
            display: grid !important;
          }
          .grid-cols-12 {
            grid-template-columns: repeat(12, minmax(0, 1fr)) !important;
          }
          .col-span-1 { grid-column: span 1 / span 1 !important; }
          .col-span-2 { grid-column: span 2 / span 2 !important; }
          .col-span-3 { grid-column: span 3 / span 3 !important; }
          .col-span-4 { grid-column: span 4 / span 4 !important; }
          .col-span-5 { grid-column: span 5 / span 5 !important; }
          .col-span-6 { grid-column: span 6 / span 6 !important; }
          .col-span-8 { grid-column: span 8 / span 8 !important; }
          .items-center {
            align-items: center !important;
          }
          .items-start {
            align-items: flex-start !important;
          }
          .text-center {
            text-align: center !important;
          }
          .text-right {
            text-align: right !important;
          }
          .font-bold {
            font-weight: 700 !important;
          }
          .font-black, .font-extrabold {
            font-weight: 900 !important;
          }
          .font-semibold {
            font-weight: 600 !important;
          }
          .font-medium {
            font-weight: 500 !important;
          }
          .font-mono {
            font-family: monospace !important;
          }
          .uppercase {
            text-transform: uppercase !important;
          }
          .tracking-tight {
            letter-spacing: -0.025em !important;
          }
          .tracking-wider {
            letter-spacing: 0.05em !important;
          }
          .tracking-widest {
            letter-spacing: 0.1em !important;
          }
          .text-xs {
            font-size: 11px !important;
          }
          .text-sm {
            font-size: 12px !important;
          }
          .text-base {
            font-size: 13px !important;
          }
          .text-lg {
            font-size: 14px !important;
          }
          .text-xl {
            font-size: 16px !important;
          }
          .text-2xl {
            font-size: 18px !important;
          }
          .text-\\[10px\\], .text-\\[9px\\], .text-\\[9\\.5px\\], .text-\\[10\\.5px\\] {
            font-size: 10px !important;
          }
          .text-\\[12px\\] {
            font-size: 12px !important;
          }
          .my-3 {
            margin-top: 8px !important;
            margin-bottom: 8px !important;
          }
          .my-4 {
            margin-top: 12px !important;
            margin-bottom: 12px !important;
          }
          .mb-1 { margin-bottom: 3px !important; }
          .mb-2 { margin-bottom: 6px !important; }
          .mb-3 { margin-bottom: 8px !important; }
          .mb-4 { margin-bottom: 12px !important; }
          .mt-1 { margin-top: 3px !important; }
          .mt-2 { margin-top: 6px !important; }
          .mt-4 { margin-top: 12px !important; }
          .pt-1 { padding-top: 3px !important; }
          .pt-2 { padding-top: 6px !important; }
          .pt-3 { padding-top: 8px !important; }
          .pb-1 { padding-bottom: 3px !important; }
          .pb-2 { padding-bottom: 6px !important; }
          .border-t-2 {
            border-top: 2px dashed #000000 !important;
          }
          .border-t {
            border-top: 1px dashed #000000 !important;
          }
          .border-b-2 {
            border-bottom: 2px dashed #000000 !important;
          }
          .border-b {
            border-bottom: 1px dashed #000000 !important;
          }
          .border-dashed {
            border-style: dashed !important;
            border-color: #000000 !important;
          }
          .border {
            border: 1px solid #000000 !important;
          }
          .border-black {
            border-color: #000000 !important;
          }
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            font-size: 10.5px !important;
          }
          tr {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          th, td {
            padding: 3px 0 !important;
          }
          .space-y-0\\.5 > * + * { margin-top: 2px !important; }
          .space-y-1 > * + * { margin-top: 3px !important; }
          .space-y-1\\.5 > * + * { margin-top: 4px !important; }
          .space-y-2 > * + * { margin-top: 6px !important; }
          .space-y-4 > * + * { margin-top: 10px !important; }
          .mt-0\\.5 { margin-top: 2px !important; }
          .mt-1\\.5 { margin-top: 4px !important; }
          .my-0\\.5 { margin-top: 2px !important; margin-bottom: 2px !important; }
          .ml-1 { margin-left: 3px !important; }
          .ml-1\\.5 { margin-left: 4px !important; }
          .pr-2 { padding-right: 6px !important; }
          .p-1 { padding: 3px !important; }
          .gap-1 { gap: 3px !important; }
          .inline-block { display: inline-block !important; }
          .whitespace-nowrap { white-space: nowrap !important; }
          .shrink-0 { flex-shrink: 0 !important; }
          .line-through { text-decoration: line-through !important; }
          .italic { font-style: italic !important; }
          .print-field { font-weight: 700; }
          .print\\:hidden, button, aside, header, nav {
            display: none !important;
          }
          ${pageCss}
        </style>
      </head>
      <body>
        <div class="receipt-wrapper">
          ${htmlContent}
        </div>
        <script>
          // Close only after the print dialog is done (a fixed timer closed it mid-print on some browsers)
          window.onafterprint = function() { window.close(); };
          window.onload = function() {
            window.focus();
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};
