import { useCallback, useEffect, useRef, useState } from "react";

interface TouchControlsProps {
  onMove: (x: number, y: number) => void;
  onLook: (dx: number, dy: number) => void;
  onFire: (down: boolean) => void;
  onAds: (down: boolean) => void;
  onSprint: (down: boolean) => void;
  onJump: () => void;
  onReload: () => void;
  onCrouch: () => void;
  onPause: () => void;
}

const STICK_RADIUS = 56;

function ActionButton({
  label,
  sub,
  onDown,
  onUp,
  className = "",
  active = false,
}: {
  label: string;
  sub?: string;
  onDown: () => void;
  onUp?: () => void;
  className?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={sub ?? label}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onDown();
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        onUp?.();
      }}
      onPointerCancel={() => onUp?.()}
      onContextMenu={(e) => e.preventDefault()}
      className={`pointer-events-auto grid place-items-center rounded-full border font-[Orbitron] font-black uppercase backdrop-blur-[2px] transition-colors ${
        active
          ? "border-primary bg-primary/35 text-primary"
          : "border-white/25 bg-black/35 text-white/75"
      } ${className}`}
      style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
    >
      {label}
    </button>
  );
}

export function TouchControls({
  onMove,
  onLook,
  onFire,
  onAds,
  onSprint,
  onJump,
  onReload,
  onCrouch,
  onPause,
}: TouchControlsProps) {
  const stickRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const lookPointer = useRef<number | null>(null);
  const lastLook = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [ads, setAds] = useState(false);
  const [sprint, setSprint] = useState(false);
  const [crouched, setCrouched] = useState(false);

  useEffect(() => {
    return () => {
      onMove(0, 0);
      onFire(false);
      onAds(false);
      onSprint(false);
    };
  }, [onMove, onFire, onAds, onSprint]);

  const updateStick = useCallback(
    (clientX: number, clientY: number) => {
      const el = stickRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > STICK_RADIUS) {
        dx = (dx / dist) * STICK_RADIUS;
        dy = (dy / dist) * STICK_RADIUS;
      }
      setKnob({ x: dx, y: dy });
      onMove(dx / STICK_RADIUS, dy / STICK_RADIUS);
    },
    [onMove],
  );

  const endStick = useCallback(() => {
    stickPointer.current = null;
    setKnob({ x: 0, y: 0 });
    onMove(0, 0);
  }, [onMove]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* Look area — right portion of the screen */}
      <div
        className="pointer-events-auto absolute inset-y-0 right-0 w-[58%]"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (lookPointer.current !== null) return;
          lookPointer.current = e.pointerId;
          lastLook.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (lookPointer.current !== e.pointerId) return;
          const dx = e.clientX - lastLook.current.x;
          const dy = e.clientY - lastLook.current.y;
          lastLook.current = { x: e.clientX, y: e.clientY };
          onLook(dx, dy);
        }}
        onPointerUp={(e) => {
          if (lookPointer.current === e.pointerId) lookPointer.current = null;
        }}
        onPointerCancel={() => {
          lookPointer.current = null;
        }}
      />

      {/* Movement stick */}
      <div
        ref={stickRef}
        className="pointer-events-auto absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[max(1.25rem,env(safe-area-inset-left))] h-32 w-32 rounded-full border border-white/20 bg-black/30 backdrop-blur-[2px]"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (stickPointer.current !== null) return;
          stickPointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          updateStick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (stickPointer.current !== e.pointerId) return;
          updateStick(e.clientX, e.clientY);
        }}
        onPointerUp={endStick}
        onPointerCancel={endStick}
        aria-label="Movement stick"
      >
        <span
          className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-primary/70 bg-primary/25 shadow-[0_0_18px_color-mix(in_oklab,var(--primary)_45%,transparent)]"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* Right-hand action cluster */}
      <div className="pointer-events-none absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] flex items-end gap-3">
        <div className="flex flex-col gap-3">
          <ActionButton
            label="R"
            sub="Reload"
            className="h-12 w-12 text-[11px]"
            onDown={onReload}
          />
          <ActionButton
            label="ADS"
            sub="Aim down sight"
            active={ads}
            className="h-14 w-14 text-[10px]"
            onDown={() => {
              setAds(true);
              onAds(true);
            }}
            onUp={() => {
              setAds(false);
              onAds(false);
            }}
          />
        </div>
        <div className="flex flex-col gap-3">
          <ActionButton
            label="JUMP"
            sub="Jump"
            className="h-12 w-12 text-[9px]"
            onDown={onJump}
          />
          <ActionButton
            label="FIRE"
            sub="Fire weapon"
            className="h-20 w-20 border-primary/70 bg-primary/25 text-xs text-primary"
            onDown={() => onFire(true)}
            onUp={() => onFire(false)}
          />
        </div>
      </div>

      {/* Left-hand secondary cluster */}
      <div className="pointer-events-none absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[calc(max(1.25rem,env(safe-area-inset-left))+9.5rem)] flex flex-col gap-3">
        <ActionButton
          label="RUN"
          sub="Sprint"
          active={sprint}
          className="h-12 w-12 text-[9px]"
          onDown={() => {
            setSprint(true);
            onSprint(true);
          }}
          onUp={() => {
            setSprint(false);
            onSprint(false);
          }}
        />
        <ActionButton
          label="CRCH"
          sub="Toggle crouch"
          active={crouched}
          className="h-12 w-12 text-[9px]"
          onDown={() => {
            setCrouched((c) => !c);
            onCrouch();
          }}
        />
      </div>

      {/* Pause */}
      <button
        type="button"
        onClick={onPause}
        className="pointer-events-auto absolute right-[max(1rem,env(safe-area-inset-right))] top-[max(4.5rem,calc(env(safe-area-inset-top)+4.5rem))] border border-white/25 bg-black/45 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.2em] text-white/70 backdrop-blur"
        style={{ touchAction: "none" }}
      >
        ❚❚ Pause
      </button>
    </div>
  );
}

export default TouchControls;
