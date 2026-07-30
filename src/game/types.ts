import type * as THREE from "three";

export type LevelState = "incoming" | "active" | "cleared";

export type DamageIndicator = {
  id: number;
  /** World yaw of attacker relative to player forward, radians (-PI..PI). */
  angle: number;
  /** 0..1 fade strength. */
  t: number;
};

export type GameHudState = {
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  ammo: number;
  reserve: number;
  score: number;
  kills: number;
  streak: number;
  level: number;
  levelName: string;
  hostilesRemaining: number;
  hostilesTotal: number;
  /** One-based streamed city depth band. */
  district: number;
  levelState: LevelState;
  weaponName: string;
  reloading: boolean;
  ads: boolean;
  sprinting: boolean;
  /** 0..1 hitmarker intensity. */
  hitMarker: number;
  /** True when last hitmarker was a kill. */
  hitMarkerKill: boolean;
  /** True when last hitmarker was a headshot. */
  hitMarkerHeadshot: boolean;
  damageFlash: number;
  damageIndicators: DamageIndicator[];
  killFeed: KillFeedEntry[];
  loading: boolean;
  loadProgress: number;
  loadLabel: string;
  locked: boolean;
  ready: boolean;
  /** Terminal session state after player health reaches zero. */
  gameOver: boolean;
  /** Contextual action available at the center reticle. */
  interactionPrompt: string | null;
};

export type KillFeedEntry = {
  id: number;
  text: string;
  at: number;
};

export type Collider = {
  min: THREE.Vector3;
  max: THREE.Vector3;
};

export type Enemy = {
  mesh: THREE.Group;
  hp: number;
  maxHp: number;
  speed: number;
  alive: boolean;
  hitFlash: number;
  attackCooldown: number;
  id: number;
};

export type ImpactRequest = {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  kind: "flesh" | "concrete" | "metal";
};

export type GameEvents = {
  onHud: (partial: Partial<GameHudState>) => void;
  onKill: (name: string) => void;
  onDamage: (amount: number) => void;
};

export const DEFAULT_HUD: GameHudState = {
  health: 100,
  maxHealth: 100,
  armor: 50,
  maxArmor: 50,
  ammo: 30,
  reserve: 120,
  score: 0,
  kills: 0,
  streak: 0,
  level: 1,
  levelName: "INITIALIZING",
  hostilesRemaining: 1,
  hostilesTotal: 1,
  district: 1,
  levelState: "incoming",
  weaponName: "M4A1 · TACTICAL",
  reloading: false,
  ads: false,
  sprinting: false,
  hitMarker: 0,
  hitMarkerKill: false,
  hitMarkerHeadshot: false,
  damageFlash: 0,
  damageIndicators: [],
  killFeed: [],
  loading: true,
  loadProgress: 0,
  loadLabel: "Initializing combat systems…",
  locked: false,
  ready: false,
  gameOver: false,
  interactionPrompt: null,
};
