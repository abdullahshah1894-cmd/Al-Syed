# Al-Syed POS — design guide

Light "khata" theme: white paper, ledger-ink blue for actions, khata red only for money owed.
Tokens live in `src/index.css` (`@theme`), shared components in `src/components/ui.jsx`.

## Colour tokens (use these class names, not Tailwind's slate / indigo / rose …)

| Role | Classes |
|---|---|
| App background | `bg-paper` |
| Cards, panels, modals, inputs | `bg-surface` |
| Table heads, hover rows, soft fills, read-only inputs | `bg-sunken` |
| Borders / dividers | `border-line` (normal), `border-line-strong` (inputs, emphasis) |
| Text | `text-ink` (main), `text-ink-soft` (secondary), `text-muted` (hints, captions) |
| Actions, links, selected state | `brand-*` (`bg-brand-600` buttons, `text-brand-700` links, `bg-brand-50` selected) |
| Money owed (Udhaar), destructive actions | `khata-*` (`text-khata-600`, `bg-khata-50`, `bg-khata-600` delete) |
| Paid, in stock, success | `paid-*` (`text-paid-600`, `bg-paid-50`) |
| Warnings, low stock, pending | `saffron-*` (`text-saffron-700`, `bg-saffron-50`) |

Rules
- Red (`khata`) means money owed or a destructive action. Never use it for decoration.
- Text on tinted fills uses the 700 shade (`bg-paid-50 text-paid-700`); text on solid 600 fills is `text-white`.
- No gradients, glows, coloured shadows or `animate-pulse` / `animate-ping` decoration.
- Receipts / slips that print or become WhatsApp images stay black on white (`bg-white text-black`) — do not theme them.

## Type
- `font-display` (Bricolage Grotesque): page titles (`h1`, via `PageHeader`), big money totals, stat values.
- Default `font-sans` (Geist) for everything else; digits are tabular app-wide.
- `font-mono` (Geist Mono) only for real codes: IMEIs, bill numbers, barcodes.
- Sentence case everywhere ("Add product", not "ADD PRODUCT" / "Add Product"). No `uppercase` + `tracking-wider` labels.
- Sizes: page title `text-2xl`, card title `text-base font-semibold`, body `text-sm`, captions `text-xs text-muted`.

## Components (`src/components/ui.jsx`)
`Page`, `PageHeader`, `Card`, `CardHeader`, `Stat`, `Badge` (tone: neutral/brand/khata/paid/saffron), `Money` (`owed` makes it red when > 0),
`Button` (variant: primary/secondary/ghost/danger/danger-soft/success/soft; size: sm/md/lg; `icon`, `loading`), `IconButton` (needs `label`),
`Field` + `Input` / `Select` / `Textarea` (or `inputClass` for custom inputs), `Segmented` (tabs / filters),
`TableWrap` + `Th` + `Td` (tables scroll sideways on phones), `EmptyState`, `Modal` (full screen on phones, Esc / backdrop close; `footer` for actions).

## Layout
- Every page: `<Page>` → `<PageHeader title description actions />` → content. Left aligned.
- Grids collapse: `grid gap-4 sm:grid-cols-2 xl:grid-cols-4` for stats; two-pane pages stack below `lg`.
- Tables: wrap in `TableWrap`; on phones prefer cards for long rows when a table would need many columns.
- Touch targets ≥ 40px (`h-10`); forms are one column on phones.
- Modals: use `Modal`; stacked modals pass a higher `z` (`z-[60]`); the share preview is `z-[80]`.

## Words
- Name things the way the shop does: "Udhaar", "Pending bill", "Bill", "Return", "Supplier", "Stock".
- Buttons say what happens: "Save bill", "Record payment", "Return items", "Delete bill".
- Empty states tell the next step ("No bills today. Start a sale from New sale.").
- Errors say what went wrong and how to fix it.
