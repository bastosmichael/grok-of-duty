interface LoadingScreenProps {
  progress: number;
  label?: string;
}

const CHECKLIST: { at: number; line: string; code: string }[] = [
  { at: 0.05, line: "Combat kernel", code: "SYS" },
  { at: 0.15, line: "GPU allocation", code: "GFX" },
  { at: 0.28, line: "Tactical geometry", code: "GEO" },
  { at: 0.42, line: "Shader pipelines", code: "SHD" },
  { at: 0.55, line: "Physics colliders", code: "PHY" },
  { at: 0.68, line: "Weapon systems", code: "WPN" },
  { at: 0.8, line: "Spatial audio", code: "AUD" },
  { at: 0.92, line: "Command uplink", code: "COM" },
  { at: 0.99, line: "Deployment auth", code: "AUTH" },
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
  const activeIndex = CHECKLIST.reduce(
    (lastMatch, item, index) => (p >= item.at ? index : lastMatch),
    0,
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-[#07090a] text-white"
      role="status"
      aria-live="polite"
      aria-label={`Loading game: ${pct}%`}
    >
      <style>{`
        @keyframes loading-scan { from { transform: translateY(-15vh) } to { transform: translateY(115vh) } }
        @keyframes loading-signal { 0%,100% { opacity: .28 } 50% { opacity: 1 } }
        @keyframes loading-drift { 0% { transform: translate3d(-1%,0,0) } 50% { transform: translate3d(1%,1%,0) } 100% { transform: translate3d(-1%,0,0) } }
        @media (prefers-reduced-motion: reduce) {
          .loading-motion { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div aria-hidden="true" className="absolute inset-0 grid-lines opacity-35" />
      <div
        aria-hidden="true"
        className="loading-motion absolute -inset-8 opacity-35"
        style={{
          animation: "loading-drift 12s ease-in-out infinite",
          background:
            "radial-gradient(circle at 22% 42%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 28%), radial-gradient(circle at 83% 75%, rgba(24,92,96,.13), transparent 32%)",
        }}
      />
      <div aria-hidden="true" className="absolute inset-0 scanline opacity-30" />
      <div
        aria-hidden="true"
        className="loading-motion absolute left-0 right-0 h-20 bg-gradient-to-b from-transparent via-primary/6 to-transparent"
        style={{ animation: "loading-scan 5s linear infinite" }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 24%, rgba(7,9,10,.42) 67%, rgba(7,9,10,.94) 112%)",
        }}
      />

      <div className="absolute left-5 top-4 font-mono text-[8px] uppercase tracking-[.24em] text-white/45">
        G.O.D. FIELD OS <span className="text-primary/60">//</span> BUILD 07.28
      </div>
      <div className="absolute right-5 top-4 flex items-center gap-2 font-mono text-[8px] uppercase tracking-[.24em] text-white/45 max-[359px]:hidden">
        <span
          className="loading-motion h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]"
          style={{ animation: "loading-signal 1.4s ease-in-out infinite" }}
        />
        Secure uplink
      </div>

      <main className="relative z-10 grid w-full max-w-5xl gap-10 px-6 sm:px-10 md:grid-cols-[1.25fr_.75fr] md:items-end">
        <section>
          <div className="mb-5 flex items-center gap-3">
            <span className="h-px w-10 bg-primary" />
            <span className="font-mono text-[9px] font-semibold uppercase tracking-[.36em] text-primary">
              Mission initialization
            </span>
          </div>
          <h1 className="font-[Orbitron] text-[clamp(2.8rem,7vw,6.2rem)] font-black uppercase leading-[.8] tracking-[-.04em] text-white">
            Grok <span className="text-white/22">of</span>
            <br />
            <span className="text-primary text-glow">Duty</span>
          </h1>
          <div className="mt-8 max-w-xl">
            <div className="mb-2 flex items-end justify-between gap-5 font-mono uppercase">
              <span className="truncate text-[9px] font-semibold tracking-[.18em] text-white/70">
                {label}
              </span>
              <span className="font-[Orbitron] text-xl font-black tabular-nums text-white">
                {pct.toString().padStart(3, "0")}
                <span className="ml-1 text-[9px] text-primary">%</span>
              </span>
            </div>
            <div
              className="relative h-2 overflow-hidden bg-white/8"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="absolute inset-y-0 left-0 bg-primary transition-[width] duration-300 ease-out"
                style={{
                  width: `${pct}%`,
                  boxShadow: "0 0 24px color-mix(in oklab, var(--primary) 65%, transparent)",
                }}
              />
              <div className="pointer-events-none absolute inset-0 flex">
                {Array.from({ length: 20 }, (_, i) => (
                  <span key={i} className="flex-1 border-r border-[#07090a]/70 last:border-0" />
                ))}
              </div>
            </div>
            <div className="mt-2 flex justify-between font-mono text-[7px] uppercase tracking-[.2em] text-white/35">
              <span>Cold boot</span>
              <span>Deployment ready</span>
            </div>
          </div>
        </section>

        <section
          className="hidden border-l border-white/10 pl-7 md:block"
          aria-label="System checks"
        >
          <div className="mb-4 flex items-center justify-between">
            <span className="font-[Orbitron] text-[9px] font-bold uppercase tracking-[.22em] text-white/60">
              Preflight
            </span>
            <span className="font-mono text-[8px] uppercase tracking-[.18em] text-primary/60">
              {Math.min(activeIndex + 1, CHECKLIST.length)}/{CHECKLIST.length}
            </span>
          </div>
          <div className="space-y-px">
            {CHECKLIST.map((item, index) => {
              const done = p >= item.at;
              const active = done && index === activeIndex && p < 1;

              return (
                <div
                  key={item.code}
                  className={`flex items-center gap-3 border-l py-1.5 pl-3 font-mono uppercase transition-colors duration-300 ${
                    active
                      ? "border-primary bg-primary/7 text-white"
                      : done
                        ? "border-primary/35 text-white/45"
                        : "border-white/8 text-white/18"
                  }`}
                >
                  <span className={`w-8 text-[7px] tracking-[.14em] ${done ? "text-primary" : ""}`}>
                    {item.code}
                  </span>
                  <span className="flex-1 text-[8px] tracking-[.16em]">{item.line}</span>
                  <span className="w-8 text-right text-[7px] tracking-[.1em]">
                    {active ? (
                      <span
                        className="loading-motion text-primary"
                        style={{ animation: "loading-signal .8s ease-in-out infinite" }}
                      >
                        SYNC
                      </span>
                    ) : done ? (
                      "OK"
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="absolute bottom-4 left-5 right-5 flex justify-between font-mono text-[7px] uppercase tracking-[.22em] text-white/30">
        <span>Codename: Nightfall</span>
        <span className="max-[359px]:hidden">Encrypted local simulation</span>
      </footer>
    </div>
  );
}

export default LoadingScreen;
