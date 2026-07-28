import { describe, expect, test } from "bun:test";
import {
  GOOGLE_ADSENSE_CLIENT,
  GOOGLE_ANALYTICS_ID,
  initializeGoogleServices,
  shouldLoadGoogleServices,
} from "../src/lib/google-services";

describe("production Google services", () => {
  test("uses the identifiers already configured on michaelbastos.com", () => {
    expect(GOOGLE_ANALYTICS_ID).toBe("G-QFWCR1XG0X");
    expect(GOOGLE_ADSENSE_CLIENT).toBe("ca-pub-4228490019228264");
  });

  test("loads only on the production custom domain", () => {
    expect(shouldLoadGoogleServices("michaelbastos.com")).toBe(true);
    expect(shouldLoadGoogleServices("www.michaelbastos.com")).toBe(true);
    expect(shouldLoadGoogleServices("MICHAELBASTOS.COM.")).toBe(true);
    expect(shouldLoadGoogleServices("localhost")).toBe(false);
    expect(shouldLoadGoogleServices("127.0.0.1")).toBe(false);
    expect(shouldLoadGoogleServices("bastosmichael.github.io")).toBe(false);
    expect(shouldLoadGoogleServices("michaelbastos.com.example.test")).toBe(false);
  });

  test("injects each production script once and configures the hosted path", () => {
    const elements = new Map<string, Record<string, unknown>>();
    const head = {
      appendChild: (element: Record<string, unknown>) => {
        elements.set(element.id as string, element);
      },
    };
    const documentRef = {
      getElementById: (id: string) => elements.get(id) ?? null,
      createElement: () => ({ id: "", async: false, src: "", crossOrigin: "" }),
      head,
    } as unknown as Document;
    const windowRef = {
      location: {
        hostname: "michaelbastos.com",
        pathname: "/grok-of-duty/",
      },
    } as unknown as Window;

    expect(initializeGoogleServices(windowRef, documentRef)).toBe(true);
    expect(initializeGoogleServices(windowRef, documentRef)).toBe(true);
    expect(elements.size).toBe(2);
    expect(elements.get("google-analytics-js")?.src).toContain(GOOGLE_ANALYTICS_ID);
    expect(elements.get("google-adsense-js")?.src).toContain(GOOGLE_ADSENSE_CLIENT);
    expect(windowRef.dataLayer).toHaveLength(2);
    expect(windowRef.dataLayer?.[0]).toEqual(["js", expect.any(Date), undefined]);
    expect(windowRef.dataLayer?.[1]).toEqual([
      "config",
      GOOGLE_ANALYTICS_ID,
      {
        page_path: "/grok-of-duty/",
        send_page_view: true,
      },
    ]);
  });
});
