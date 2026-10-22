// Send a receipt / statement to WhatsApp as a PNG image.
//
// html2canvas cannot read Tailwind v4's oklch() colours and throws, which is why the old code
// often sent only text. html-to-image renders the element through the browser itself, so the
// picture looks exactly like the screen.
import { toBlob } from "html-to-image";

// "0300-1234567" / "+92 300 1234567" -> "923001234567" (wa.me format); "" when unusable
export const formatWAPhone = (phone) => {
  let digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = "92" + digits.slice(1);
  if (digits.length === 10 && digits.startsWith("3")) digits = "92" + digits;
  return digits.length >= 11 ? digits : "";
};

// PNG blob of a DOM element (white background, 2x for sharp text)
export const elementToPng = async (element) => {
  if (!element) throw new Error("Nothing to capture");
  // iPhones refuse canvases above ~16.7 million pixels; long statements get a lower ratio instead of a blank image
  const area = Math.max(1, element.scrollWidth * element.scrollHeight);
  const pixelRatio = Math.max(1, Math.min(2, Math.sqrt(16e6 / area)));
  const blob = await toBlob(element, {
    pixelRatio,
    backgroundColor: "#ffffff",
    cacheBust: true,
    // Some browsers need the element's own size when it sits inside a scrolling modal
    width: element.scrollWidth,
    height: element.scrollHeight,
    style: { margin: "0", maxHeight: "none", overflow: "visible" },
  });
  if (!blob) throw new Error("Could not create the image");
  return blob;
};

const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

/**
 * Share an element as an image on WhatsApp.
 * - Phone / tablet: opens the share sheet with the PNG attached (pick WhatsApp -> the image is sent).
 * - Computer: copies the PNG to the clipboard, downloads it too, and opens the customer's WhatsApp
 *   chat with the text; press Ctrl+V in the chat to paste the image.
 * Returns { method: "shared" | "clipboard" | "download" | "cancelled", message }.
 */
export const shareImageToWhatsApp = async ({ element, phone, text = "", fileName = "invoice.png" }) => {
  const blob = await elementToPng(element);
  const file = new File([blob], fileName, { type: "image/png" });

  // 1. Native share sheet with the file (mobile, and some desktop browsers)
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return { method: "shared", message: "Invoice image shared." };
    } catch (err) {
      if (err && err.name === "AbortError") return { method: "cancelled", message: "Sharing cancelled." };
      // fall through to the desktop flow
    }
  }

  // 2. Desktop: clipboard + download, then open the chat
  let copied = false;
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
      copied = true;
    }
  } catch {
    copied = false;
  }
  downloadBlob(blob, fileName);

  const wa = formatWAPhone(phone);
  const url = wa
    ? `https://wa.me/${wa}?text=${encodeURIComponent(text)}`
    : `https://web.whatsapp.com/send?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener");

  return copied
    ? { method: "clipboard", message: "Invoice image copied. In the WhatsApp chat press Ctrl+V to paste it, then send." }
    : { method: "download", message: `Invoice image saved as ${fileName}. Attach it in the WhatsApp chat.` };
};
