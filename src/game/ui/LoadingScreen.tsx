interface LoadingScreenProps {
  progress: number;
  label?: string;
}

const CHECKLIST: { at: number; line: string }[] = [
  { at: 0.05, line: "▸ BOOT COMBAT KERNEL" },
  { at: 0.15, line: "▸ ALLOCATE GPU BUFFERS" },
  { at: 0.28, line: "▸ LOAD TACTICAL MESHES" },
  { at: 0.42, line: "▸ COMPILE SHADER PIPELINES" },
  { at: 0.55, line: "▸ INIT PHYSICS COLLIDERS" },
  { at: 0.68, line: "▸ SYNC WEAPON SYSTEMS" },
  { at: 0.8, line: "▸ CALIBRATE AUDIO BUS" },
  { at: 0.92, line: "▸ LINK NETCOM RELAY" },
  { at: 0.99, line: "▸ AUTHORIZE DEPLOYMENT" },
];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export function LoadingScreen({
  progress,
  label = "Initializing combat systems…",
}: LoadingScreenProps) {
  const p = clamp01(progress);
  const pct = Math.round(p * 100);
  const activeLines = CHECKLIST.filter((c) => p >= c.at);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background">
      {/* Grid + scanline aesthetic */}
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-60" />
      <div className="pointer-events-none absolute inset-0 scanline opacity-40" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, color-mix(in oklab, var(--background) 80%, transparent) 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-lg px-6">
        <div className="text-center">
          <div className="text-[10px] font-mono uppercase tracking-[0.4em] text-primary">
            // COMBAT SYSTEMS ONLINE
          </div>
          <h1 className="mt-3 font-[Orbitron] text-2xl font-black uppercase tracking-widest text-primary text-glow md:text-3xl">
            GROK OF DUTY // DEPLOYING
          </h1>
        </div>

        {/* Progress bar */}
        <div className="mt-10">
          <div className="mb-2 flex items-end justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>{label}</span>
            <span className="font-[Orbitron] text-sm text-primary">{pct}%</span>
          </div>
          <div className="relative h-2 w-full overflow-hidden border border-primary/40 bg-primary/10">
            <div
              className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-200 ease-out"
              style={{
                width: `${pct}%`,
                boxShadow: "0 0 16px color-mix(in oklab, var(--primary) 70%, transparent)",
              }}
            />
            {/* Segment ticks */}
            <div className="pointer-events-none absolute inset-0 flex">
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} className="flex-1 border-r border-background/40 last:border-r-0" />
              ))}
            </div>
          </div>
        </div>

        {/* Fake system checklist */}
        <div className="mt-8 space-y-1.5 font-mono text-[11px] uppercase tracking-wider">
          {CHECKLIST.map((item) => {
            const done = p >= item.at;
            const active = done && (activeLines[activeLines.length - 1]?.at === item.at || p >= 1);
            return (
              <div
                key={item.line}
                className={`flex items-center gap-2 transition-opacity duration-300 ${
                  done
                    ? active
                      ? "text-primary opacity-100"
                      : "text-primary/70 opacity-80"
                    : "text-muted-foreground/30 opacity-40"
                }`}
              >
                <span className={done ? "text-primary" : "text-muted-foreground/40"}>
                  {done ? "●" : "○"}
                </span>
                <span>{item.line}</span>
                {done && (
                  <span className="ml-auto text-[9px] text-primary/60">
                    {active && p < 1 ? "…" : "OK"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 text-center text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
          SECURE CHANNEL · DO NOT EXFIL
        </div>
      </div>
    </div>
  );
}

export default LoadingScreen;
