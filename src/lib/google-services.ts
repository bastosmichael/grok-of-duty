export const GOOGLE_ANALYTICS_ID = "G-QFWCR1XG0X";
export const GOOGLE_ADSENSE_CLIENT = "ca-pub-4228490019228264";

/**
 * The only two ad placements allowed on the landing page. Paste the ad unit IDs
 * from AdSense (Ads → By ad unit → the 10-digit `data-ad-slot` value). Empty
 * strings keep the placement unrendered, so the page stays clean until real
 * units exist. Auto Ads must be excluded for this URL in the AdSense dashboard.
 */
export const AD_SLOTS = {
  /** Between the Arsenal (features) grid and the Roadmap section. */
  midPage: "",
  /** Between the Ops CTA and the footer. */
  preFooter: "",
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
 * Loads MichaelBastos.com's existing Google services only on its production
 * hostnames. Local development and GitHub preview URLs never create analytics
 * traffic or ad requests.
 */
export function initializeGoogleServices(
  windowRef: Window = window,
  documentRef: Document = document,
): boolean {
  if (!shouldLoadGoogleServices(windowRef.location.hostname)) return false;

  windowRef.dataLayer ??= [];
  windowRef.gtag ??= (command, targetOrDate, parameters) => {
    windowRef.dataLayer?.push([command, targetOrDate, parameters]);
  };

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
