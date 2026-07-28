/**
 * Generic runtime error reporting (no third-party editor telemetry).
 */
export function reportRuntimeError(error: unknown, context: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;

  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);

  console.error("[Grok Of Duty]", message, {
    route: window.location.pathname,
    stack: error instanceof Error ? error.stack : undefined,
    ...context,
  });
}
