"use client";

import { useEffect } from "react";

/**
 * Auto-trigger the browser's print dialog when the print page mounts.
 * The user can then "Save as PDF" from the dialog. Cancel returns them to
 * the readable HTML view (still useful as a clean dashboard).
 */
export default function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        window.print();
      } catch {
        // Some browsers (Safari) require user gesture — silent fallback
      }
    }, 600);
    return () => clearTimeout(t);
  }, []);
  return null;
}
