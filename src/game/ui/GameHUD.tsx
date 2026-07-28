import type { DamageIndicator, GameHudState } from "@/game/types";

interface GameHUDProps {
  state: GameHudState;
  onExit: () => void;
  onEngage: () => void;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function SegmentedBar({
  value,
  max,
  segments,
  fillClass,
  emptyClass,
  heightClass = "h-2.5",
}: {
  value: number;
  max: number;
  segments: number;
  fillClass: string;
  emptyClass: string;
  heightClass?: string;
}) {
  const ratio = max > 0 ? value / max : 0;
  const filled = Math.round(ratio * segments);
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: segments }, (_, i) => (
        <div
          key={i}
          className={`${heightClass} w-3 ${i < filled ? fillClass : emptyClass}`}
          style={{
            clipPath: "polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)",
          }}
        />
      ))}
    </div>
  );
}

/** COD-style damage direction chevrons around screen center. */
function DamageDirOverlay({ indicators }: { indicators: DamageIndicator[] }) {
  if (!indicators.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      {indicators.map((d) => {
        // angle: 0 front, +right, PI behind — rotate CSS so chevron points toward threat
        const deg = (d.angle * 180) / Math.PI;
        const opacity = clamp01(d.t) * 0.95;
        return (
          <div
            key={d.id}
            className="absolute left-1/2 top-1/2"
            style={{
              width: 0,
              height: 0,
              transform: `translate(-50%, -50%) rotate(${deg}deg)`,
              opacity,
            }}
          >
            {/* Chevron sits above center (forward in local space of this rotated frame) */}
            <div
              className="absolute left-1/2"
              style={{
                bottom: 88,
                transform: "translateX(-50%)",
              }}
            >
              <div
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "14px solid transparent",
                  borderRight: "14px solid transparent",
                  borderBottom: "22px solid rgba(255, 40, 40, 0.92)",
                  filter: "drop-shadow(0 0 6px rgba(255,30,30,0.9))",
                }}
              />
              <div
                className="absolute left-1/2 top-full"
                style={{
                  width: 4,
                  height: 28,
                  marginLeft: -2,
                  background:
                    "linear-gradient(to bottom, rgba(255,50,50,0.85), transparent)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
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
    weaponName,
    reloading,
    ads,
    hitMarker,
    hitMarkerKill,
    hitMarkerHeadshot,
    damageFlash,
    damageIndicators,
    killFeed,
    locked,
    ready,
  } = state;

  const lowHp = health < 30;
  const lowAmmo = ammo <= 5;
  const crosshairSpread = ads ? 3 : 11;
  const hitActive = hitMarker > 0;
  const dmgAlpha = clamp01(damageFlash);
  const armorMax = maxArmor > 0 ? maxArmor : 50;

  // Hitmarker color: kill = red, headshot non-kill = gold-ish white, normal = white
  const hmColor = hitMarkerKill
    ? "#ff2a2a"
    : hitMarkerHeadshot
      ? "#ffe566"
      : "#ffffff";
  const hmSize = hitMarkerKill ? 28 : hitMarkerHeadshot ? 24 : 20;
  const hmGlow = hitMarkerKill
    ? "0 0 10px #ff2222, 0 0 18px #ff0000"
    : hitMarkerHeadshot
      ? "0 0 8px #ffcc44"
      : "0 0 6px #fff";

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Damage vignette */}
      {dmgAlpha > 0 && (
        <div
          className="absolute inset-0 transition-opacity duration-75"
          style={{
            opacity: dmgAlpha * 0.9,
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(180,20,20,0.6) 100%)",
          }}
        />
      )}

      {/* Low HP pulse edges */}
      {lowHp && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 48%, rgba(200,30,30,0.45) 100%)",
          }}
        />
      )}

      {/* ADS edge dim */}
      {ads && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 42%, rgba(0,0,0,0.6) 100%)",
          }}
        />
      )}

      {/* Damage direction indicators */}
      <DamageDirOverlay indicators={damageIndicators ?? []} />

      {/* Crosshair — gap expands when not ADS */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-0 w-0">
          {/* Top */}
          <div
            className="absolute left-1/2 w-[2px] -translate-x-1/2 bg-primary shadow-[0_0_5px_var(--primary)]"
            style={{ bottom: crosshairSpread, height: 8 }}
          />
          {/* Bottom */}
          <div
            className="absolute left-1/2 w-[2px] -translate-x-1/2 bg-primary shadow-[0_0_5px_var(--primary)]"
            style={{ top: crosshairSpread, height: 8 }}
          />
          {/* Left */}
          <div
            className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-primary shadow-[0_0_5px_var(--primary)]"
            style={{ right: crosshairSpread, width: 8 }}
          />
          {/* Right */}
          <div
            className="absolute top-1/2 h-[2px] -translate-y-1/2 bg-primary shadow-[0_0_5px_var(--primary)]"
            style={{ left: crosshairSpread, width: 8 }}
          />
          {/* Center dot — hide slightly when ADS for optic feel */}
          {!ads && (
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/90" />
          )}

          {/* Hitmarker X — COD thick bars, color by kill/HS */}
          {hitActive && (
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{
                opacity: clamp01(hitMarker),
                width: hmSize,
                height: hmSize,
              }}
            >
              <div
                className="absolute left-1/2 top-1/2"
                style={{
                  width: hmSize * 0.85,
                  height: 2.5,
                  background: hmColor,
                  boxShadow: hmGlow,
                  transform: "translate(-50%, -50%) rotate(45deg)",
                }}
              />
              <div
                className="absolute left-1/2 top-1/2"
                style={{
                  width: hmSize * 0.85,
                  height: 2.5,
                  background: hmColor,
                  boxShadow: hmGlow,
                  transform: "translate(-50%, -50%) rotate(-45deg)",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Top-left: operation + streak */}
      <div className="absolute left-4 top-4 font-mono text-xs uppercase tracking-widest text-primary">
        <div className="border-l-2 border-primary pl-2">
          <div>// OPERATION · TRAINING RANGE</div>
          <div className="text-muted-foreground">SECTOR 07 · NIGHT OPS</div>
          {streak > 0 && (
            <div className="mt-1 text-primary text-glow">
              STREAK <span className="font-[Orbitron] font-bold">{streak}</span>
            </div>
          )}
        </div>
      </div>

      {/* Top-right: score + kills + kill feed */}
      <div className="absolute right-4 top-4 text-right font-mono text-xs uppercase tracking-widest text-primary">
        <div className="border-r-2 border-primary pr-2">
          <div>
            SCORE{" "}
            <span className="font-[Orbitron] font-bold">
              {score.toString().padStart(5, "0")}
            </span>
          </div>
          <div className="text-muted-foreground">
            KILLS <span className="text-primary">{kills}</span>
          </div>
        </div>

        {/* Kill feed */}
        {killFeed.length > 0 && (
          <div className="mt-3 flex flex-col items-end gap-1">
            {killFeed.slice(0, 5).map((entry, i) => {
              const ageFade = 1 - i * 0.15;
              return (
                <div
                  key={entry.id}
                  className="border border-primary/30 bg-background/60 px-2 py-0.5 text-[10px] text-foreground backdrop-blur-sm"
                  style={{ opacity: Math.max(0.35, ageFade) }}
                >
                  {entry.text}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quit */}
      <button
        type="button"
        onClick={onExit}
        className="pointer-events-auto absolute right-4 top-20 border border-primary/60 bg-background/70 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary backdrop-blur hover:bg-primary hover:text-primary-foreground transition-colors"
      >
        ✕ Quit
      </button>

      {/* Bottom-left: HP + armor — COD readable large numbers */}
      <div className="absolute bottom-5 left-5 font-mono text-xs uppercase tracking-widest text-primary">
        <div className="border-l-2 border-primary bg-background/40 pl-3 pr-4 py-2 backdrop-blur-sm">
          <div className="flex items-end gap-3">
            <div
              className={`font-[Orbitron] text-5xl font-black leading-none tabular-nums ${
                lowHp ? "text-destructive animate-pulse" : "text-primary"
              }`}
              style={
                lowHp
                  ? undefined
                  : { textShadow: "0 0 12px color-mix(in oklab, var(--primary) 50%, transparent)" }
              }
            >
              {Math.round(health)}
            </div>
            <div className="mb-1 flex flex-col gap-2">
              <div>
                <div className="mb-0.5 flex items-center gap-2 text-[9px] text-muted-foreground">
                  <span>HP</span>
                  <span className="text-primary/70">{Math.round(health)}/{maxHealth}</span>
                </div>
                <SegmentedBar
                  value={health}
                  max={maxHealth}
                  segments={10}
                  fillClass={lowHp ? "bg-destructive" : "bg-primary"}
                  emptyClass="bg-primary/15"
                />
              </div>
              <div>
                <div className="mb-0.5 flex items-center gap-2 text-[9px] text-muted-foreground">
                  <span>ARMOR</span>
                  <span className="text-sky-400/80">{Math.round(armor)}</span>
                </div>
                <SegmentedBar
                  value={armor}
                  max={armorMax}
                  segments={5}
                  fillClass="bg-sky-400"
                  emptyClass="bg-sky-400/15"
                  heightClass="h-2"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom-right: ammo + weapon */}
      <div className="absolute bottom-5 right-5 text-right font-mono text-xs uppercase tracking-widest text-primary">
        <div className="border-r-2 border-primary bg-background/40 pr-3 pl-4 py-2 backdrop-blur-sm">
          <div
            className={`font-[Orbitron] text-5xl font-black leading-none tabular-nums ${
              lowAmmo && !reloading ? "text-destructive" : ""
            }`}
          >
            {ammo}
            <span className="text-muted-foreground text-xl">/{reserve}</span>
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">{weaponName}</div>
          {reloading ? (
            <div className="mt-1 animate-pulse text-[11px] font-bold text-primary text-glow">
              ▸ RELOADING…
            </div>
          ) : lowAmmo ? (
            <div className="mt-1 animate-pulse text-[10px] text-destructive">
              ▸ LOW AMMO · [R]
            </div>
          ) : (
            <div className="mt-1 text-[10px] text-muted-foreground">[R] RELOAD</div>
          )}
        </div>
      </div>

      {/* Ready Up briefing modal */}
      {ready && !locked && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="pointer-events-auto max-w-md border border-primary/60 bg-card p-8 text-center">
            <div className="text-xs font-mono uppercase tracking-[0.3em] text-primary">
              // BRIEFING
            </div>
            <h3 className="mt-3 font-[Orbitron] text-3xl font-black uppercase">Ready Up</h3>
            <div className="mt-6 grid grid-cols-2 gap-3 text-left text-xs font-mono uppercase text-muted-foreground">
              <div>
                <span className="text-primary">WASD</span> Move
              </div>
              <div>
                <span className="text-primary">MOUSE</span> Aim
              </div>
              <div>
                <span className="text-primary">LMB</span> Fire
              </div>
              <div>
                <span className="text-primary">RMB</span> ADS
              </div>
              <div>
                <span className="text-primary">SHIFT</span> Sprint
              </div>
              <div>
                <span className="text-primary">CTRL</span> Crouch
              </div>
              <div>
                <span className="text-primary">SPACE</span> Jump
              </div>
              <div>
                <span className="text-primary">R</span> Reload
              </div>
              <div>
                <span className="text-primary">ESC</span> Release
              </div>
              <div>
                <span className="text-primary">EXFIL</span> Quit
              </div>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <button type="button" onClick={onEngage} className="btn-tactical w-full">
                ▶ Engage
              </button>
              <button type="button" onClick={onExit} className="btn-tactical-destructive w-full">
                ✕ Quit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GameHUD;
