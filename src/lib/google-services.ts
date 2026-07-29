export const GOOGLE_ANALYTICS_ID = "G-QFWCR1XG0X";
export const GOOGLE_ADSENSE_CLIENT = "ca-pub-4228490019228264";

/**
 * Manual ad placements only (no top-of-page unit — keeps the hero flush under
 * the fixed nav). Slot IDs match the inventory used on michaelbastos.com
 * (see bastosmichael.github.io BlogModal). Replace with dedicated unit IDs
 * from AdSense when available. Disable Auto Ads for this URL in the dashboard.
 */
export const AD_SLOTS = {
  /** Between Arsenal (features) and Roadmap — never above the hero. */
  midPage: "1234567890",
  /** Between Ops CTA and footer. */
  preFooter: "1234567890",
  /** In-game briefing only (Ready Up overlay). */
  inGameBriefing: "1234567890",
} as const;

const GOOGLE_SERVICE_HOSTS = new Set(["michaelbastos.com", "www.michaelbastos.com"]);

type GoogleEventParameters = Record<string, boolean | number | string>;
type GoogleTag = (
  command: "config" | "event" | "js",
  targetOrDate: Date | string,
  parameters?: GoogleEventParameters,
) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GoogleTag;
  }
}

export function shouldLoadGoogleServices(hostname: string): boolean {
  return GOOGLE_SERVICE_HOSTS.has(hostname.trim().toLowerCase().replace(/\.$/, ""));
}

function ensureScript(documentRef: Document, id: string, src: string): void {
  if (documentRef.getElementById(id)) return;
  const script = documentRef.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  script.crossOrigin = "anonymous";
  documentRef.head.appendChild(script);
}

/**
 * Same IDs as https://github.com/bastosmichael/bastosmichael.github.io
 * (gtag G-QFWCR1XG0X + AdSense ca-pub-4228490019228264). Production hosts only.
 */
export function initializeGoogleServices(
  windowRef: Window = window,
  documentRef: Document = document,
): boolean {
  if (!shouldLoadGoogleServices(windowRef.location.hostname)) return false;

  windowRef.dataLayer ??= [];
  // Always push a 3-tuple so queue entries match gtag's (command, target, params) shape.
  windowRef.gtag ??= (command, targetOrDate, parameters) => {
    windowRef.dataLayer?.push([command, targetOrDate, parameters]);
  };

  // Configure once before injecting the remote script (gtag queues until it loads).
  if (!documentRef.getElementById("google-analytics-js")) {
    windowRef.gtag("js", new Date());
    windowRef.gtag("config", GOOGLE_ANALYTICS_ID, {
      page_path: windowRef.location.pathname,
      send_page_view: true,
    });
  }

  ensureScript(
    documentRef,
    "google-analytics-js",
    `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_ID}`,
  );
  ensureScript(
    documentRef,
    "google-adsense-js",
    `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${GOOGLE_ADSENSE_CLIENT}`,
  );
  return true;
}

export function trackGoogleEvent(eventName: string, parameters: GoogleEventParameters = {}): void {
  if (typeof window === "undefined" || !shouldLoadGoogleServices(window.location.hostname)) return;
  window.gtag?.("event", eventName, parameters);
}
