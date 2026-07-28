import { useEffect, useRef } from "react";
import { GOOGLE_ADSENSE_CLIENT, shouldLoadGoogleServices } from "@/lib/google-services";

type AdSlotProps = {
  /** AdSense ad unit ID (data-ad-slot). Empty string renders nothing. */
  slot: string;
  label?: string;
  /** Reserved height so the layout never shifts when the ad fills. */
  minHeight?: number;
  className?: string;
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * A single, deliberately placed AdSense unit framed to match the tactical HUD.
 * Height is reserved up-front to avoid layout shift, and the unit only mounts
 * on the production hostname so dev/preview stay ad-free.
 */
export default function AdSlot({
  slot,
  label = "// SPONSORED",
  minHeight = 280,
  className = "",
}: AdSlotProps) {
  const pushed = useRef(false);

  const active =
    slot.length > 0 &&
    typeof window !== "undefined" &&
    shouldLoadGoogleServices(window.location.hostname);

  useEffect(() => {
    if (!active || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle ?? []).push({});
    } catch {
      // AdSense not available (blocked or offline) — the reserved frame stays empty.
    }
  }, [active]);

  if (!active) return null;

  return (
    <aside
      aria-label="Advertisement"
      className={`relative mx-auto w-full max-w-5xl border border-border/70 bg-card/40 p-3 ${className}`}
    >
      <div className="mb-2 text-[10px] font-mono uppercase tracking-[0.4em] text-muted-foreground">
        {label}
      </div>
      <div style={{ minHeight }} className="overflow-hidden">
        <ins
          className="adsbygoogle"
          style={{ display: "block", minHeight }}
          data-ad-client={GOOGLE_ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
      <div className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-primary/60" />
      <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-primary/60" />
    </aside>
  );
}
