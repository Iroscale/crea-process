"use client";

import { useMemo, useState } from "react";
import type { LandingPageContent } from "@/lib/landing-page-schema";
import type { DesignDirectives } from "@/lib/landing-page-design-schema";
import { renderLandingPageHtml } from "./render-landing-page-html";
import { renderPremiumLandingPageHtml } from "./render-premium-html";

type ViewMode = "a" | "b" | "split";
type Quality = "standard" | "premium";

/**
 * Live preview of the two A/B variants. Renders each in an iframe with full
 * Tailwind via CDN so the user sees a real-looking LP.
 *
 * Modes :
 *   - View    : A | B | split (side by side)
 *   - Quality : standard (basic renderer) | premium (designer agent applied)
 */
export default function LandingPagePreview({
  contentA,
  contentB,
  directives,
}: {
  contentA: LandingPageContent;
  contentB: LandingPageContent;
  directives?: DesignDirectives | null;
}) {
  const [view, setView] = useState<ViewMode>("split");
  // Auto-switch to premium when directives become available — gives the user
  // immediate "wow" moment after the design pass.
  const [quality, setQuality] = useState<Quality>(
    directives ? "premium" : "standard"
  );

  const htmlA = useMemo(() => {
    if (quality === "premium" && directives) {
      return renderPremiumLandingPageHtml(contentA, directives, "A");
    }
    return renderLandingPageHtml(contentA, "A");
  }, [contentA, directives, quality]);

  const htmlB = useMemo(() => {
    if (quality === "premium" && directives) {
      return renderPremiumLandingPageHtml(contentB, directives, "B");
    }
    return renderLandingPageHtml(contentB, "B");
  }, [contentB, directives, quality]);

  return (
    <div className="mt-4">
      {/* View + quality toggles */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-0.5 text-xs">
          {(["a", "b", "split"] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                view === v
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              }`}
            >
              {v === "a"
                ? "🅰 Version A"
                : v === "b"
                ? "🅱 Version B"
                : "↔ Split A/B"}
            </button>
          ))}
        </div>
        {directives && (
          <div className="inline-flex rounded-lg border border-fuchsia-500/30 bg-[var(--color-background)] p-0.5 text-xs">
            {(["standard", "premium"] as Quality[]).map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuality(q)}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${
                  quality === q
                    ? q === "premium"
                      ? "bg-fuchsia-500 text-white"
                      : "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                }`}
              >
                {q === "premium" ? "🎨 Premium CRO" : "Standard"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Preview area */}
      {view === "split" ? (
        <div className="grid h-[80vh] gap-3 lg:grid-cols-2">
          <Frame label="🅰 Version A" srcDoc={htmlA} />
          <Frame label="🅱 Version B" srcDoc={htmlB} />
        </div>
      ) : (
        <Frame
          label={view === "a" ? "🅰 Version A" : "🅱 Version B"}
          srcDoc={view === "a" ? htmlA : htmlB}
          tall
        />
      )}
    </div>
  );
}

function Frame({
  label,
  srcDoc,
  tall = false,
}: {
  label: string;
  srcDoc: string;
  tall?: boolean;
}) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-white ${
        tall ? "h-[85vh]" : "h-full"
      }`}
    >
      <div className="flex items-center justify-between border-b border-black/10 bg-black/5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-black/70">
        <span>{label}</span>
        <span className="opacity-50">Tailwind preview</span>
      </div>
      <iframe
        title={label}
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        className="h-full w-full flex-1 bg-white"
      />
    </div>
  );
}
