import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import heroImg from "@/assets/hero.jpg";

const WebGLCube = lazy(() => import("@/components/WebGLCube"));
const GameScene = lazy(() => import("@/components/GameScene"));

export const Route = createFileRoute("/")({
  component: Index,
});


const roadmap = [
  {
    phase: "PHASE 01",
    quarter: "Q1 · SHIPPED",
    title: "Recon Build",
    status: "live",
    items: [
      "Browser-native 3D engine bootstrap",
      "Single-player training range",
      "Core weapon feel + hit detection",
      "Landing site + operator profiles",
    ],
  },
  {
    phase: "PHASE 02",
    quarter: "Q2 · IN DEVELOPMENT",
    title: "Multiplayer Alpha",
    status: "active",
    items: [
      "6v6 Team Deathmatch",
      "Real-time netcode + matchmaking",
      "Voice comms with squad channels",
      "Anti-cheat foundations",
    ],
  },
  {
    phase: "PHASE 03",
    quarter: "Q3 · PLANNED",
    title: "Warzone Expansion",
    status: "planned",
    items: [
      "64-player Battle Royale map",
      "Vehicles + destructible cover",
      "Loadout customization + attachments",
      "Ranked competitive playlist",
    ],
  },
  {
    phase: "PHASE 04",
    quarter: "Q4 · PLANNED",
    title: "Operator Command",
    status: "planned",
    items: [
      "Clan system + private lobbies",
      "In-game events + seasonal ops",
      "Cross-device mobile controls",
      "Community map editor",
    ],
  },
];

const features = [
  {
    tag: "// ENGINE",
    title: "Zero-Install 3D",
    body: "Runs directly in your browser via WebGL. Click play, drop in — no launcher, no patch nights.",
  },
  {
    tag: "// COMBAT",
    title: "Weighted Gunplay",
    body: "Recoil patterns, sway, and hit-reg tuned to feel like the shooters you already love.",
  },
  {
    tag: "// SOCIAL",
    title: "Squad Up Fast",
    body: "Share a link, spin up a lobby. Cross-platform friendly, region-aware matchmaking.",
  },
];

function Index() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const launch = () => setGameOpen(true);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <ClientOnly fallback={null}>
        <Suspense fallback={null}>
          <WebGLCube />
        </Suspense>
      </ClientOnly>
      {/* NAV */}
      <header className="fixed top-0 z-50 w-full border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <a
            href="#top"
            className="flex items-center gap-2 font-[Orbitron] text-lg font-black tracking-widest"
          >
            <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse-glow" />
            GROK<span className="text-primary">·</span>OF<span className="text-primary">·</span>DUTY
          </a>
          <nav className="hidden gap-8 text-sm font-semibold uppercase tracking-widest text-muted-foreground md:flex">
            <a href="#features" className="hover:text-primary transition-colors">
              Arsenal
            </a>
            <a href="#roadmap" className="hover:text-primary transition-colors">
              Roadmap
            </a>
            <a href="#ops" className="hover:text-primary transition-colors">
              Ops
            </a>
          </nav>
          <button
            onClick={launch}
            className="hidden md:inline-flex items-center gap-2 border border-primary/60 px-4 py-2 text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground transition-colors clip-tactical"
          >
            Deploy ▸
          </button>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative min-h-screen overflow-hidden pt-16">
        <div className="absolute inset-x-0 bottom-0 top-16">
          <img
            src={heroImg}
            alt="Grok Of Duty warzone"
            width={1920}
            height={1088}
            className="h-full w-full object-cover object-[center_30%] opacity-70"
          />
          <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
          <div className="absolute inset-0 grid-lines opacity-40" />
          <div className="absolute inset-0 scanline opacity-30 pointer-events-none" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col justify-end px-6 pb-20 pt-32">
          {/* Corner HUD */}
          <div className="absolute left-6 top-24 hidden md:block">
            <div className="border-l-2 border-primary pl-3 text-xs font-mono uppercase tracking-widest text-primary">
              <div>// LAT 34.0522° N</div>
              <div>// LON 118.2437° W</div>
              <div className="mt-1 text-muted-foreground">SIGNAL · SECURE</div>
            </div>
          </div>
          <div className="absolute right-6 top-24 hidden md:block text-right">
            <div className="border-r-2 border-primary pr-3 text-xs font-mono uppercase tracking-widest text-primary">
              <div>// BUILD 0.4.1-ALPHA</div>
              <div>// SESSION READY</div>
              <div className="mt-1 text-muted-foreground animate-pulse">▲ ARMORY ONLINE</div>
            </div>
          </div>

          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.3em] text-primary">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              Operation Live · Browser Deployable
            </div>
            <h1 className="font-[Orbitron] text-6xl font-black uppercase leading-[0.9] tracking-tight text-foreground md:text-8xl">
              Grok Of
              <br />
              <span className="text-primary text-glow">Duty</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl">
              A browser-native 3D tactical shooter. No downloads. No launcher. Just drop in, gear
              up, and dominate the battlefield from any device.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <button onClick={launch} className="btn-tactical animate-pulse-glow text-base">
                ▶ Play Now
              </button>
              <a
                href="#roadmap"
                className="inline-flex items-center gap-3 border border-border px-6 py-4 text-xs font-bold uppercase tracking-widest text-foreground hover:border-primary hover:text-primary transition-colors clip-tactical"
              >
                View Roadmap
              </a>
            </div>

            {/* Stats bar */}
            <div className="mt-16 grid max-w-2xl grid-cols-2 gap-px overflow-hidden border border-border bg-border md:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className="bg-card/80 p-4 backdrop-blur">
                  <div className="font-[Orbitron] text-2xl font-black text-primary">{s.value}</div>
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative border-t border-border bg-background py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mb-16 flex items-end justify-between">
            <div>
              <div className="mb-3 text-xs font-mono uppercase tracking-[0.4em] text-primary">
                // 001 · Loadout
              </div>
              <h2 className="font-[Orbitron] text-4xl font-black uppercase md:text-6xl">
                Built For
                <br />
                The Web.
              </h2>
            </div>
            <div className="hidden max-w-sm text-right text-sm text-muted-foreground md:block">
              Engineered from the ground up to deliver console-grade FPS action inside a browser
              tab.
            </div>
          </div>

          <div className="grid gap-px bg-border md:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group relative bg-card p-8 transition-colors hover:bg-card/70"
              >
                <div className="text-xs font-mono uppercase tracking-widest text-primary">
                  {f.tag}
                </div>
                <h3 className="mt-4 font-[Orbitron] text-2xl font-bold uppercase">{f.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
                <div className="absolute right-4 top-4 h-3 w-3 border-r-2 border-t-2 border-primary opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="absolute bottom-4 left-4 h-3 w-3 border-b-2 border-l-2 border-primary opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROADMAP */}
      <section id="roadmap" className="relative border-t border-border bg-card/30 py-24">
        <div className="absolute inset-0 grid-lines opacity-20 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="mb-16">
            <div className="mb-3 text-xs font-mono uppercase tracking-[0.4em] text-primary">
              // 002 · Mission Timeline
            </div>
            <h2 className="font-[Orbitron] text-4xl font-black uppercase md:text-6xl">
              Deployment
              <br />
              Roadmap
            </h2>
            <p className="mt-4 max-w-xl text-muted-foreground">
              Four phases from single-player training to full-scale warzone. Track our progress from
              Recon to Command.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {roadmap.map((r) => (
              <div
                key={r.phase}
                className="relative border border-border bg-background/60 p-6 backdrop-blur transition-colors hover:border-primary/50"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary">
                      {r.phase}
                    </div>
                    <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {r.quarter}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                <h3 className="mt-6 font-[Orbitron] text-2xl font-bold uppercase">{r.title}</h3>
                <ul className="mt-4 space-y-2">
                  {r.items.map((i) => (
                    <li key={i} className="flex gap-3 text-sm text-muted-foreground">
                      <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 bg-primary" />
                      {i}
                    </li>
                  ))}
                </ul>
                {/* corner marks */}
                <div className="absolute left-0 top-0 h-3 w-3 border-l-2 border-t-2 border-primary" />
                <div className="absolute bottom-0 right-0 h-3 w-3 border-b-2 border-r-2 border-primary" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="ops" className="relative overflow-hidden border-t border-border py-24">
        <div className="absolute inset-0 scanline opacity-30 pointer-events-none" />
        <div className="relative mx-auto max-w-4xl px-6 text-center">
          <div className="mb-3 text-xs font-mono uppercase tracking-[0.4em] text-primary">
            // STANDBY
          </div>
          <h2 className="font-[Orbitron] text-4xl font-black uppercase md:text-6xl">
            The battlefield
            <br />
            is <span className="text-primary text-glow">one click</span> away.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
            Grok Of Duty is entering closed alpha. Deploy now to secure your callsign and receive
            first access when servers go live.
          </p>
          <div className="mt-10">
            <button onClick={launch} className="btn-tactical text-base">
              ▶ Enlist &amp; Play
            </button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-xs uppercase tracking-widest text-muted-foreground md:flex-row">
          <div className="font-[Orbitron] font-bold text-foreground">
            GROK·OF·DUTY <span className="text-primary">// 0.4.1-ALPHA</span>
          </div>
          <div>© 2026 Grok Of Duty. All operators reserved.</div>
        </div>
      </footer>

      {/* Play Dialog */}
      {dialogOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 backdrop-blur-sm p-4"
          onClick={() => setDialogOpen(false)}
        >
          <div
            className="relative max-w-md border border-primary/50 bg-card p-8 shadow-[var(--shadow-elegant)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary">
              // TRANSMISSION
            </div>
            <h3 className="mt-3 font-[Orbitron] text-2xl font-black uppercase">
              Servers Warming Up
            </h3>
            <p className="mt-4 text-sm text-muted-foreground">
              Multiplayer servers are in closed alpha. Check the{" "}
              <a
                href="#roadmap"
                onClick={() => setDialogOpen(false)}
                className="text-primary underline underline-offset-4"
              >
                roadmap
              </a>{" "}
              for launch windows.
            </p>
            <button
              onClick={() => setDialogOpen(false)}
              className="mt-6 w-full border border-primary py-3 text-xs font-bold uppercase tracking-widest text-primary hover:bg-primary hover:text-primary-foreground transition-colors clip-tactical"
            >
              Acknowledged
            </button>
          </div>
        </div>
      )}

      {/* 3D Game Scene — only loads when user clicks a play button */}
      {gameOpen && (
        <ClientOnly fallback={<GameLoading />}>
          <Suspense fallback={<GameLoading />}>
            <GameScene onExit={() => setGameOpen(false)} />
          </Suspense>
        </ClientOnly>
      )}
    </div>
  );
}

function GameLoading() {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="font-[Orbitron] text-2xl font-black uppercase tracking-widest text-primary animate-pulse">
          Deploying Engine
        </div>
        <div className="mt-3 text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
          // Loading WebGL runtime
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    live: { label: "● LIVE", className: "bg-primary/20 text-primary border-primary/60" },
    active: {
      label: "◐ IN DEV",
      className: "bg-primary/10 text-primary border-primary/40 animate-pulse",
    },
    planned: { label: "○ PLANNED", className: "bg-muted text-muted-foreground border-border" },
  };
  const s = map[status] ?? map.planned;
  return (
    <div
      className={`border px-2 py-1 text-[10px] font-mono font-bold uppercase tracking-widest ${s.className}`}
    >
      {s.label}
    </div>
  );
}
