import type { KeyboardEvent } from "react";
import type { DamageIndicator, GameHudState } from "@/game/types";

interface GameHUDProps {
  state: GameHudState;
  onExit: () => void;
  onEngage: () => void;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function TacticalCorners({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute inset-0 ${className}`}>
      <span className="absolute left-0 top-0 h-2.5 w-2.5 border-l border-t border-primary/80" />
      <span className="absolute right-0 top-0 h-2.5 w-2.5 border-r border-t border-primary/80" />
      <span className="absolute bottom-0 left-0 h-2.5 w-2.5 border-b border-l border-primary/80" />
      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r border-primary/80" />
    </span>
  );
}

function Meter({
  value,
  max,
  segments,
  danger = false,
  armor = false,
}: {
  value: number;
  max: number;
  segments: number;
  danger?: boolean;
  armor?: boolean;
}) {
  const ratio = clamp01(max > 0 ? value / max : 0);

  return (
    <div
      className="flex h-1.5 min-w-28 gap-px"
      role="meter"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      {Array.from({ length: segments }, (_, i) => {
        const fill = clamp01(ratio * segments - i);
        return (
          <span
            key={i}
            className={`relative flex-1 overflow-hidden bg-white/8 ${
              armor ? "skew-x-[-16deg]" : ""
            }`}
          >
            <span
              className={`absolute inset-y-0 left-0 ${
                danger ? "bg-red-500" : armor ? "bg-cyan-300" : "bg-primary"
              }`}
              style={{
                width: `${fill * 100}%`,
                boxShadow:
                  fill > 0
                    ? danger
                      ? "0 0 8px rgba(239,68,68,.75)"
                      : armor
                        ? "0 0 7px rgba(103,232,249,.6)"
                        : "0 0 8px color-mix(in oklab, var(--primary) 70%, transparent)"
                    : undefined,
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

/** Threat chevrons sit on a responsive ring around the reticle. */
function DamageDirOverlay({ indicators }: { indicators: DamageIndicator[] }) {
  if (!indicators.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {indicators.map((indicator) => {
        const deg = (indicator.angle * 180) / Math.PI;
        const opacity = clamp01(indicator.t);

        return (
          <div
            key={indicator.id}
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) rotate(${deg}deg)`,
              opacity,
            }}
          >
            <div
              className="absolute left-1/2 h-[clamp(82px,15vh,148px)] w-8 -translate-x-1/2"
              style={{ bottom: 36 }}
            >
              <div
                className="absolute left-1/2 top-0 h-2.5 w-8 -translate-x-1/2 bg-red-500"
                style={{
                  clipPath: "polygon(50% 0, 100% 100%, 73% 100%, 50% 48%, 27% 100%, 0 100%)",
                  filter: "drop-shadow(0 0 7px rgba(255,35,35,.95))",
                }}
              />
              <div className="absolute left-1/2 top-2 h-14 w-px -translate-x-1/2 bg-gradient-to-b from-red-500/80 to-transparent" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Reticle({
  ads,
  hitMarker,
  kill,
  headshot,
}: {
  ads: boolean;
  hitMarker: number;
  kill: boolean;
  headshot: boolean;
}) {
  const spread = ads ? 3 : 11;
  const hitActive = hitMarker > 0;
  const color = kill ? "#ff4949" : headshot ? "#ffd76a" : "#ffffff";
  const size = kill ? 30 : headshot ? 26 : 22;

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="relative h-0 w-0">
        <span
          className="absolute left-1/2 block w-[2px] -translate-x-1/2 bg-white/95"
          style={{
            bottom: spread,
            height: 7,
            boxShadow: "0 0 3px rgba(0,0,0,.95), 0 0 5px rgba(255,255,255,.55)",
          }}
        />
        <span
          className="absolute left-1/2 block w-[2px] -translate-x-1/2 bg-white/95"
          style={{
            top: spread,
            height: 7,
            boxShadow: "0 0 3px rgba(0,0,0,.95), 0 0 5px rgba(255,255,255,.55)",
          }}
        />
        <span
          className="absolute top-1/2 block h-[2px] -translate-y-1/2 bg-white/95"
          style={{
            right: spread,
            width: 7,
            boxShadow: "0 0 3px rgba(0,0,0,.95), 0 0 5px rgba(255,255,255,.55)",
          }}
        />
        <span
          className="absolute top-1/2 block h-[2px] -translate-y-1/2 bg-white/95"
          style={{
            left: spread,
            width: 7,
            boxShadow: "0 0 3px rgba(0,0,0,.95), 0 0 5px rgba(255,255,255,.55)",
          }}
        />
        {!ads && (
          <span className="absolute left-1/2 top-1/2 h-0.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_3px_#000]" />
        )}
        {hitActive && (
          <span
            className="absolute left-1/2 top-1/2 block -translate-x-1/2 -translate-y-1/2"
            style={{ opacity: clamp01(hitMarker), width: size, height: size }}
          >
            {[45, -45].map((rotation) => (
              <span
                key={rotation}
                className="absolute left-1/2 top-1/2 h-0.5"
                style={{
                  width: size,
                  background: `linear-gradient(90deg, ${color} 0 30%, transparent 30% 70%, ${color} 70%)`,
                  filter: `drop-shadow(0 0 ${kill ? 5 : 3}px ${color})`,
                  transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                }}
              />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="min-w-9 border border-primary/35 bg-primary/8 px-2 py-1 text-center font-[Orbitron] text-[9px] font-bold tracking-wider text-primary shadow-[inset_0_0_12px_rgba(0,0,0,.4)]">
      {children}
    </kbd>
  );
}

export function GameHUD({ state, onExit, onEngage }: GameHUDProps) {
  const {
    health,
    maxHealth,
    armor,
    maxArmor,
    ammo,
    reserve,
    score,
    kills,
    streak,
    level,
    levelName,
    hostilesRemaining,
    hostilesTotal,
    levelState,
    weaponName,
    reloading,
    ads,
    sprinting,
    hitMarker,
    hitMarkerKill,
    hitMarkerHeadshot,
    damageFlash,
    damageIndicators,
    killFeed,
    locked,
    ready,
  } = state;

  const healthRatio = maxHealth > 0 ? health / maxHealth : 0;
  const lowHp = healthRatio <= 0.3;
  const criticalHp = healthRatio <= 0.15;
  const lowAmmo = ammo <= 5;
  const dmgAlpha = clamp01(damageFlash);
  const armorMax = maxArmor > 0 ? maxArmor : 50;
  const isResume = level > 1 || score > 0 || kills > 0 || health < maxHealth || ammo < 30;
  const centerMessage = hitMarkerKill ? "TARGET ELIMINATED" : hitMarkerHeadshot ? "HEADSHOT" : null;
  const handleBriefingKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onExit();
      return;
    }
    if (event.key !== "Tab") return;

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    );
    if (buttons.length < 2) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.shiftKey && current <= 0) {
      event.preventDefault();
      buttons.at(-1)?.focus();
    } else if (!event.shiftKey && current === buttons.length - 1) {
      event.preventDefault();
      buttons[0]?.focus();
    }
  };

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden text-white"
      aria-label="Combat heads-up display"
    >
      <style>{`
        @keyframes hud-enter { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes feedback-pop { 0% { opacity: 0; transform: translate(-50%, 5px) scale(.8) } 18% { opacity: 1; transform: translate(-50%, 0) scale(1.04) } 100% { opacity: 0; transform: translate(-50%, -10px) scale(1) } }
        @keyframes low-health { 0%,100% { opacity: .38 } 50% { opacity: .72 } }
        @keyframes briefing-in { from { opacity: 0; transform: translateY(14px) scale(.985) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) {
          .hud-motion { animation: none !important; transition: none !important; }
        }
      `}</style>

      {/* Edge treatment keeps damage readable without hiding the target. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 transition-opacity duration-75"
        style={{
          opacity: dmgAlpha,
          background:
            "radial-gradient(ellipse at center, transparent 38%, rgba(140,7,7,.24) 69%, rgba(190,8,8,.82) 118%)",
          boxShadow: "inset 0 0 90px rgba(120,0,0,.42)",
        }}
      />
      {lowHp && (
        <div
          aria-hidden="true"
          className="hud-motion absolute inset-0"
          style={{
            animation: "low-health 1.35s ease-in-out infinite",
            background:
              "radial-gradient(ellipse at center, transparent 48%, rgba(150,0,0,.18) 75%, rgba(225,16,16,.46) 120%)",
          }}
        />
      )}
      {ads && (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at center, transparent 0 38%, rgba(0,0,0,.1) 51%, rgba(0,0,0,.63) 110%)",
          }}
        />
      )}

      <DamageDirOverlay indicators={damageIndicators ?? []} />
      <Reticle ads={ads} hitMarker={hitMarker} kill={hitMarkerKill} headshot={hitMarkerHeadshot} />

      {centerMessage && (
        <div
          className={`hud-motion absolute left-1/2 top-[calc(50%+42px)] font-[Orbitron] text-[10px] font-black tracking-[0.28em] ${
            hitMarkerKill ? "text-red-400" : "text-amber-300"
          }`}
          style={{
            animation: "feedback-pop .8s ease-out both",
            textShadow: "0 1px 2px #000, 0 0 12px currentColor",
          }}
          role="status"
        >
          {centerMessage}
        </div>
      )}

      {levelState !== "active" && (
        <div
          className="hud-motion absolute left-1/2 top-[28%] -translate-x-1/2 border-y border-primary/45 bg-black/75 px-8 py-3 text-center font-mono uppercase shadow-[0_0_32px_rgba(0,0,0,.75)]"
          style={{ animation: "hud-enter .35s ease-out both" }}
          role="status"
          aria-live="polite"
        >
          <div className="text-[8px] tracking-[.34em] text-white/55">
            Level {level.toString().padStart(2, "0")} · {levelName}
          </div>
          <div className="mt-1 font-[Orbitron] text-sm font-black tracking-[.24em] text-primary text-glow">
            {levelState === "cleared" ? "Area secured" : "New hostiles incoming"}
          </div>
        </div>
      )}

      {/* Mission header */}
      <header
        className="hud-motion absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(.75rem,env(safe-area-inset-top))] max-w-[46vw] font-mono uppercase"
        style={{ animation: "hud-enter .45s ease-out both" }}
      >
        <div className="flex items-stretch">
          <span className="w-1 bg-primary shadow-[0_0_12px_var(--primary)]" />
          <div className="bg-gradient-to-r from-black/75 via-black/45 to-transparent py-1.5 pl-2.5 pr-8 max-[430px]:pr-3">
            <div className="flex items-center gap-2 text-[9px] font-semibold tracking-[.22em] text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_7px_var(--primary)]" />
              <span>
                LEVEL {level.toString().padStart(2, "0")}
                <span className="max-[430px]:hidden"> · {levelName}</span>
              </span>
            </div>
            <div className="mt-0.5 text-[8px] tracking-[.2em] text-white/65 max-[430px]:hidden">
              PROCEDURAL AO <span className="text-white/20">//</span>{" "}
              {hostilesTotal === 1 ? "SOLO CONTACT" : `${hostilesTotal} CONTACTS`}
            </div>
          </div>
        </div>
        {streak > 1 && (
          <div className="mt-1.5 flex w-fit items-center gap-2 bg-primary/90 px-2.5 py-1 text-[9px] font-black tracking-[.18em] text-black shadow-[0_0_18px_color-mix(in_oklab,var(--primary)_35%,transparent)]">
            <span className="text-[13px]">×{streak}</span>
            COMBAT STREAK
          </div>
        )}
      </header>

      {/* Match telemetry and kill feed */}
      <aside
        className="hud-motion absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(.75rem,env(safe-area-inset-top))] flex max-w-[54vw] flex-col items-end font-mono uppercase"
        style={{ animation: "hud-enter .45s .08s ease-out both" }}
      >
        <div className="relative min-w-40 bg-gradient-to-l from-black/75 via-black/48 to-transparent py-1.5 pl-8 pr-2.5 text-right max-[430px]:min-w-32 max-[430px]:pl-3">
          <span className="absolute inset-y-0 right-0 w-1 bg-primary shadow-[0_0_12px_var(--primary)]" />
          <div className="flex items-baseline justify-end gap-3">
            <span className="text-[8px] tracking-[.2em] text-white/45">SCORE</span>
            <span className="font-[Orbitron] text-base font-black leading-none tabular-nums text-primary text-glow">
              {score.toString().padStart(5, "0")}
            </span>
          </div>
          <div className="mt-1 flex justify-end gap-3 border-t border-white/8 pt-1 text-[8px] tracking-[.18em] text-white/60">
            <span className="max-[359px]:hidden">HOSTILES REMAINING</span>
            <span className="hidden max-[359px]:inline">LEFT</span>
            <span className="font-bold tabular-nums text-white">
              {hostilesRemaining.toString().padStart(2, "0")}
              <span className="text-white/30">/{hostilesTotal.toString().padStart(2, "0")}</span>
            </span>
          </div>
        </div>

        <div
          className="mt-2 flex max-w-[min(21rem,70vw)] flex-col items-end gap-1"
          aria-live="polite"
        >
          {killFeed.slice(0, 4).map((entry, index) => (
            <div
              key={entry.id}
              className="hud-motion relative overflow-hidden border-r-2 border-primary bg-gradient-to-l from-black/80 via-black/60 to-black/20 py-1 pl-5 pr-2.5 text-[9px] font-semibold tracking-[.12em] text-white/90 backdrop-blur-[2px]"
              style={{
                opacity: Math.max(0.35, 1 - index * 0.2),
                animation: index === 0 ? "hud-enter .22s ease-out both" : undefined,
              }}
            >
              <span className="mr-2 text-primary">◆</span>
              {entry.text}
            </div>
          ))}
        </div>
      </aside>

      <button
        type="button"
        onClick={onExit}
        className="pointer-events-auto absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-10 hidden -translate-x-1/2 border border-white/15 bg-black/45 px-3 py-1 font-mono text-[8px] uppercase tracking-[.2em] text-white/45 backdrop-blur transition hover:border-primary/70 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:block"
        aria-label="Exit combat"
      >
        ESC · RELEASE CURSOR
      </button>

      {/* Player vitals */}
      <section
        className="hud-motion absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] font-mono uppercase max-[430px]:bottom-[5.6rem]"
        style={{ animation: "hud-enter .5s .12s ease-out both" }}
        aria-label="Player status"
      >
        <div className="relative min-w-[clamp(12rem,23vw,18rem)] overflow-hidden border-l-2 border-white/70 bg-gradient-to-r from-black/78 via-black/52 to-transparent py-2 pl-3 pr-9 backdrop-blur-[2px] max-[430px]:min-w-44 max-[430px]:pr-4">
          <div className="flex items-end gap-3">
            <div
              className={`font-[Orbitron] text-[clamp(2.1rem,5vw,3.4rem)] font-black leading-[.78] tabular-nums ${
                lowHp ? "text-red-400" : "text-white"
              }`}
              style={{ textShadow: lowHp ? "0 0 16px rgba(239,68,68,.7)" : "0 2px 3px #000" }}
            >
              {Math.max(0, Math.round(health))}
            </div>
            <div className="mb-0.5 flex flex-1 flex-col gap-2">
              <div>
                <div className="mb-1 flex justify-between text-[8px] font-semibold tracking-[.18em]">
                  <span className={lowHp ? "text-red-400" : "text-white/60"}>
                    {criticalHp ? "CRITICAL" : "VITALS"}
                  </span>
                  <span className="tabular-nums text-white/35">
                    {Math.round(health)}/{maxHealth}
                  </span>
                </div>
                <Meter value={health} max={maxHealth} segments={10} danger={lowHp} />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[8px] font-semibold tracking-[.18em] text-cyan-200/60">
                  <span>PLATE</span>
                  <span className="tabular-nums">{Math.round(armor)}</span>
                </div>
                <Meter value={armor} max={armorMax} segments={5} armor />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Weapon telemetry */}
      <section
        className="hud-motion absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] text-right font-mono uppercase"
        style={{ animation: "hud-enter .5s .18s ease-out both" }}
        aria-label="Weapon status"
      >
        <div className="relative min-w-[clamp(11.5rem,22vw,17rem)] overflow-hidden border-r-2 border-white/70 bg-gradient-to-l from-black/78 via-black/52 to-transparent py-2 pl-9 pr-3 backdrop-blur-[2px]">
          <div className="flex items-end justify-end gap-2">
            <div className="mb-0.5 text-[8px] font-semibold tracking-[.18em] text-white/42">
              {sprinting ? "SPRINT" : ads ? "ADS" : "AUTO"}
            </div>
            <div
              className={`font-[Orbitron] text-[clamp(2.1rem,5vw,3.4rem)] font-black leading-[.78] tabular-nums ${
                lowAmmo && !reloading ? "text-red-400" : "text-white"
              }`}
              style={{ textShadow: lowAmmo ? "0 0 14px rgba(239,68,68,.55)" : "0 2px 3px #000" }}
            >
              {ammo.toString().padStart(2, "0")}
            </div>
            <div className="font-[Orbitron] text-sm font-bold tabular-nums text-white/35">
              /{reserve}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-2 border-t border-white/10 pt-1.5">
            <span className="text-[8px] tracking-[.16em] text-white/50">{weaponName}</span>
            <span className={`h-1.5 w-1.5 ${lowAmmo ? "bg-red-500" : "bg-primary"}`} />
          </div>
          <div
            className={`mt-1 min-h-3 text-[8px] font-bold tracking-[.2em] ${
              reloading
                ? "animate-pulse text-primary"
                : lowAmmo
                  ? "animate-pulse text-red-400"
                  : "text-white/30"
            }`}
            aria-live="polite"
          >
            {reloading ? "MAGAZINE CHANGE" : lowAmmo ? "LOW AMMUNITION · R" : "R · RELOAD"}
          </div>
        </div>
      </section>

      {/* Deployment / pointer-lock briefing */}
      {ready && !locked && (
        <div
          className="pointer-events-auto absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/55 px-3 py-4 backdrop-blur-[3px] md:items-center md:px-4 md:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="combat-briefing-title"
          onKeyDown={handleBriefingKeyDown}
        >
          <div
            className="hud-motion relative w-full max-w-3xl overflow-hidden border border-white/15 bg-[#0a0c0d]/96 shadow-[0_30px_100px_rgba(0,0,0,.85),0_0_50px_color-mix(in_oklab,var(--primary)_9%,transparent)]"
            style={{ animation: "briefing-in .38s ease-out both" }}
          >
            <TacticalCorners />
            <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent" />
            <div className="grid md:grid-cols-[1.05fr_.95fr]">
              <div className="relative overflow-hidden border-b border-white/10 p-6 md:border-b-0 md:border-r md:p-8">
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/8 blur-3xl" />
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[.34em] text-primary">
                  // {isResume ? "DEPLOYMENT INTERRUPTED" : "TACTICAL BRIEFING"}
                </div>
                <h2
                  id="combat-briefing-title"
                  className="mt-3 font-[Orbitron] text-3xl font-black uppercase leading-none text-white sm:text-4xl"
                >
                  {isResume ? "Return to fight" : "Weapons free"}
                </h2>
                <p className="mt-4 max-w-sm font-mono text-[11px] uppercase leading-relaxed tracking-[.11em] text-white/65">
                  Level one begins in a compact arena against one fighter. Every secured level
                  expands the AO, generates new cover, and adds another faster, more dangerous
                  operator.
                </p>

                <dl className="mt-7 grid grid-cols-3 gap-px bg-white/10">
                  {[
                    ["LEVEL", level.toString().padStart(2, "0")],
                    ["CONTACTS", hostilesTotal.toString().padStart(2, "0")],
                    ["STATUS", isResume ? "PAUSED" : "READY"],
                  ].map(([term, detail]) => (
                    <div key={term} className="bg-[#0a0c0d] px-2 py-3">
                      <dt className="font-mono text-[8px] uppercase tracking-[.18em] text-white/50">
                        {term}
                      </dt>
                      <dd className="mt-1 font-[Orbitron] text-[10px] font-bold uppercase text-primary">
                        {detail}
                      </dd>
                    </div>
                  ))}
                </dl>

                <button
                  type="button"
                  onClick={onEngage}
                  autoFocus
                  className="mt-7 flex w-full items-center justify-between border border-primary bg-primary px-5 py-3.5 font-[Orbitron] text-xs font-black uppercase tracking-[.2em] text-black shadow-[0_0_28px_color-mix(in_oklab,var(--primary)_25%,transparent)] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                >
                  <span>{isResume ? "Resume operation" : "Deploy now"}</span>
                  <span aria-hidden="true">▶</span>
                </button>
                <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[.12em] text-white/50">
                  Click to capture cursor · Headphones recommended
                </p>
              </div>

              <div className="p-6 md:p-8">
                <div className="flex items-center justify-between">
                  <h3 className="font-[Orbitron] text-xs font-bold uppercase tracking-[.2em] text-white">
                    Combat controls
                  </h3>
                  <span className="font-mono text-[8px] uppercase tracking-[.18em] text-primary">
                    M4A1 // AUTO
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3">
                  {[
                    ["WASD", "Move"],
                    ["MOUSE", "Aim"],
                    ["LMB", "Fire"],
                    ["RMB", "Aim down sight"],
                    ["SHIFT", "Sprint"],
                    ["CTRL", "Crouch"],
                    ["SPACE", "Jump"],
                    ["R", "Reload"],
                  ].map(([key, action]) => (
                    <div key={key} className="flex items-center gap-2.5">
                      <Key>{key}</Key>
                      <span className="font-mono text-[10px] uppercase tracking-[.08em] text-white/65">
                        {action}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 border-t border-white/10 pt-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-primary">◆</span>
                    <p className="font-mono text-[10px] uppercase leading-relaxed tracking-[.09em] text-white/55">
                      Each procedural level rolls a new codename, perimeter, cover plan, and enemy
                      callsigns. Difficulty rises through speed, accuracy, health, and squad size.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onExit}
                  className="mt-5 w-full border border-white/15 py-2.5 font-mono text-[9px] uppercase tracking-[.2em] text-white/45 transition hover:border-red-400/60 hover:bg-red-500/8 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-400"
                >
                  Abort to command
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameHUD;
