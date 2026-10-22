import { useState, useEffect } from "react";
import { X, Share2, Download, Copy, MessageCircle, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { elementToPng, formatWAPhone } from "../utils/shareImage";

// Preview + share an invoice / statement as a PNG.
// The image is made when the dialog opens, so the Share button can open the system share sheet
// straight away (browsers only allow sharing directly after a tap; making the image first took
// too long, which is why sharing used to fall back to text).
//
// Usage in a page (see src/components/useShareImage.jsx):
//   const [openShare, shareDialog] = useShareImage();
//   openShare({ element: document.getElementById("receipt-content"), fileName: "Invoice_X.png", phone, text, title });
//   ...render {shareDialog} somewhere in the page
const ShareImageDialog = ({ target, onClose }) => {
  const [png, setPng] = useState(null); // { blob, url, file }
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const { element, fileName = "invoice.png", phone = "", text = "", title = "Share Invoice" } = target;

  useEffect(() => {
    let cancelled = false;
    let url = null;
    elementToPng(element)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setPng({ blob, url, file: new File([blob], fileName, { type: "image/png" }) });
      })
      .catch((err) => !cancelled && setError(err.message || "Could not create the image"));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [element, fileName]);

  const canShareFiles = !!(png && navigator.canShare && navigator.canShare({ files: [png.file] }));
  const waPhone = formatWAPhone(phone);

  const shareSheet = async () => {
    try {
      await navigator.share({ files: [png.file], text });
      setStatus("Shared.");
    } catch (err) {
      if (err && err.name === "AbortError") return;
      setStatus(`Sharing failed: ${err.message}. Use Copy or Download instead.`);
    }
  };

  const copyImage = async () => {
    try {
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": png.blob })]);
      return true;
    } catch {
      return false;
    }
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = png.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus(`Saved as ${fileName}.`);
  };

  // WhatsApp: phones (and Windows with the WhatsApp app) get the share sheet with the image;
  // otherwise the image is copied, the customer's chat opens, and you paste it with Ctrl+V.
  const whatsapp = async () => {
    if (canShareFiles) return shareSheet();
    const copied = await copyImage();
    if (!copied) download();
    const url = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`
      : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener");
    setStatus(
      copied
        ? "Image copied. In the WhatsApp chat press Ctrl+V to paste it, then press Send."
        : `Image saved as ${fileName}. Attach it in the WhatsApp chat.`
    );
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 flex items-start justify-center bg-slate-950/50">
          {error ? (
            <div className="text-rose-300 text-xs flex items-center gap-2 py-10">
              <AlertCircle size={16} /> {error}
            </div>
          ) : png ? (
            <img src={png.url} alt="Invoice preview" className="max-w-full rounded-xl border border-slate-700 bg-white" />
          ) : (
            <div className="text-slate-400 text-xs flex items-center gap-2 py-10">
              <Loader2 size={16} className="animate-spin" /> Making the image…
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={whatsapp}
              disabled={!png}
              className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <MessageCircle size={15} /> WhatsApp
            </button>
            <button
              onClick={shareSheet}
              disabled={!canShareFiles}
              title={canShareFiles ? "Choose WhatsApp or any other app" : "This browser cannot share files; use WhatsApp, Copy or Download"}
              className="py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Share2 size={15} /> Share to…
            </button>
            <button
              onClick={async () => setStatus((await copyImage()) ? "Image copied — paste it anywhere with Ctrl+V." : "Copy is not allowed in this browser; use Download.")}
              disabled={!png}
              className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Copy size={15} /> Copy image
            </button>
            <button
              onClick={download}
              disabled={!png}
              className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Download size={15} /> Download
            </button>
          </div>
          {status && (
            <p className="text-[11px] text-emerald-300 flex items-start gap-1.5">
              <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> {status}
            </p>
          )}
          {waPhone ? (
            <p className="text-[10px] text-slate-500">WhatsApp chat: +{waPhone}</p>
          ) : (
            <p className="text-[10px] text-amber-400/80">No valid phone number — WhatsApp will ask you to pick the chat.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default ShareImageDialog;
