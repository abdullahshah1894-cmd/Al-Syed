import { useState, useCallback } from "react";
import ShareImageDialog from "./ShareImageDialog";

// const [openShare, shareDialog] = useShareImage();
// openShare({ element, fileName, phone, text, title }) opens the preview with WhatsApp / Share to… /
// Copy / Download; render {shareDialog} anywhere in the page.
export const useShareImage = () => {
  const [target, setTarget] = useState(null);
  const openShare = useCallback((t) => {
    if (!t || !t.element) {
      alert("Nothing to share yet.");
      return;
    }
    setTarget(t);
  }, []);
  const dialog = target ? <ShareImageDialog target={target} onClose={() => setTarget(null)} /> : null;
  return [openShare, dialog];
};
