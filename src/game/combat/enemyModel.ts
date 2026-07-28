import * as THREE from "three";

/**
 * A compact articulated operator rig. The root is a locomotion transform whose
 * origin is the ground plane between the boots. Animation must happen on these
 * pivots rather than pitching or sinking `root`.
 */
export type EnemyModelRig = {
  root: THREE.Group;
  centerOfMass: THREE.Group;
  pelvis: THREE.Group;
  chest: THREE.Group;
  head: THREE.Group;
  leftShoulder: THREE.Group;
  leftElbow: THREE.Group;
  leftHand: THREE.Group;
  rightShoulder: THREE.Group;
  rightElbow: THREE.Group;
  rightHand: THREE.Group;
  leftHip: THREE.Group;
  leftKnee: THREE.Group;
  leftFoot: THREE.Group;
  rightHip: THREE.Group;
  rightKnee: THREE.Group;
  rightFoot: THREE.Group;
  weapon: THREE.Group;
  muzzle: THREE.Group;
};

export type EnemyHitZone = "head" | "torso" | "pelvis" | "arm" | "leg";

export type EnemyModel = {
  /** Feet-anchored locomotion transform. Its neutral floor is exactly y=0. */
  root: THREE.Group;
  rig: EnemyModelRig;
  /** Alive-only raycast targets; decorative kit and the rifle are excluded. */
  bodyParts: THREE.Mesh[];
  headMesh: THREE.Mesh;
  /** One material pack per operator so hit-flash tinting remains isolated. */
  materials: THREE.MeshStandardMaterial[];
  teamHue: number;
  /** Idempotent; releases this model's materials and shared-geometry lease. */
  dispose: () => void;
};

export type EnemyPose = {
  /** Continuous gait phase in radians. */
  gaitPhase: number;
  /** 0 idle, 1 full locomotion. */
  locomotion: number;
  /** 0 relaxed low-ready, 1 shouldered firing stance. */
  aim?: number;
  /** Brief 0..1 weapon kick. */
  recoil?: number;
  /** Brief 0..1 directional body reaction. */
  flinch?: number;
  /** Hit direction around the operator in radians. */
  flinchYaw?: number;
};

const _poseBounds = new THREE.Box3();
const _armDown = new THREE.Vector3(0, -1, 0);
const _armDirection = new THREE.Vector3();
const _armBend = new THREE.Vector3();
const _armElbowPoint = new THREE.Vector3();
const _armSegment = new THREE.Vector3();
const _armTarget = new THREE.Vector3();
const _armWorldQuaternion = new THREE.Quaternion();
const _armInverseQuaternion = new THREE.Quaternion();
type GeometryKit = {
  torso: THREE.CapsuleGeometry;
  head: THREE.SphereGeometry;
  face: THREE.SphereGeometry;
  helmet: THREE.SphereGeometry;
  neck: THREE.CylinderGeometry;
  shoulder: THREE.SphereGeometry;
  upperArm: THREE.CylinderGeometry;
  forearm: THREE.CylinderGeometry;
  hand: THREE.SphereGeometry;
  pelvis: THREE.CapsuleGeometry;
  thigh: THREE.CylinderGeometry;
  calf: THREE.CylinderGeometry;
  knee: THREE.SphereGeometry;
  boot: THREE.BoxGeometry;
  armor: THREE.BoxGeometry;
  armorSide: THREE.BoxGeometry;
  belt: THREE.BoxGeometry;
  pouch: THREE.BoxGeometry;
  patch: THREE.BoxGeometry;
  pack: THREE.BoxGeometry;
  rifleReceiver: THREE.BoxGeometry;
  rifleStock: THREE.BoxGeometry;
  rifleMagazine: THREE.BoxGeometry;
  rifleRail: THREE.BoxGeometry;
  barrel: THREE.CylinderGeometry;
  muzzle: THREE.CylinderGeometry;
  optic: THREE.BoxGeometry;
};

type MaterialPack = {
  uniform: THREE.MeshStandardMaterial;
  uniformSecondary: THREE.MeshStandardMaterial;
  armor: THREE.MeshStandardMaterial;
  webbing: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
  balaclava: THREE.MeshStandardMaterial;
  helmet: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  gunPolymer: THREE.MeshStandardMaterial;
  opticGlass: THREE.MeshPhysicalMaterial;
  hostilePatch: THREE.MeshStandardMaterial;
};

const FLOOR_CLEARANCE = 0.012;
const neutralEuler = new THREE.Euler();
let sharedGeometry: GeometryKit | null = null;
let sharedGeometryUsers = 0;

function geometryKit(): GeometryKit {
  if (!sharedGeometry) {
    sharedGeometry = {
      torso: new THREE.CapsuleGeometry(0.26, 0.31, 4, 10),
      head: new THREE.SphereGeometry(0.13, 12, 9),
      face: new THREE.SphereGeometry(0.105, 10, 8),
      helmet: new THREE.SphereGeometry(0.151, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.64),
      neck: new THREE.CylinderGeometry(0.072, 0.082, 0.11, 10),
      shoulder: new THREE.SphereGeometry(0.09, 9, 7),
      upperArm: new THREE.CylinderGeometry(0.061, 0.079, 0.33, 9),
      forearm: new THREE.CylinderGeometry(0.052, 0.064, 0.3, 9),
      hand: new THREE.SphereGeometry(0.067, 9, 7),
      pelvis: new THREE.CapsuleGeometry(0.205, 0.15, 3, 10),
      thigh: new THREE.CylinderGeometry(0.078, 0.108, 0.425, 10),
      calf: new THREE.CylinderGeometry(0.062, 0.085, 0.4, 10),
      knee: new THREE.SphereGeometry(0.088, 9, 7),
      boot: new THREE.BoxGeometry(0.17, 0.115, 0.29),
      armor: new THREE.BoxGeometry(0.48, 0.47, 0.085),
      armorSide: new THREE.BoxGeometry(0.075, 0.36, 0.24),
      belt: new THREE.BoxGeometry(0.47, 0.095, 0.25),
      pouch: new THREE.BoxGeometry(0.105, 0.13, 0.07),
      patch: new THREE.BoxGeometry(0.09, 0.045, 0.012),
      pack: new THREE.BoxGeometry(0.37, 0.45, 0.14),
      rifleReceiver: new THREE.BoxGeometry(0.085, 0.115, 0.34),
      rifleStock: new THREE.BoxGeometry(0.075, 0.115, 0.25),
      rifleMagazine: new THREE.BoxGeometry(0.07, 0.22, 0.105),
      rifleRail: new THREE.BoxGeometry(0.055, 0.04, 0.34),
      barrel: new THREE.CylinderGeometry(0.018, 0.018, 0.34, 10),
      muzzle: new THREE.CylinderGeometry(0.027, 0.024, 0.08, 10),
      optic: new THREE.BoxGeometry(0.07, 0.075, 0.12),
    };
  }
  return sharedGeometry;
}

function material(
  name: string,
  color: number,
  roughness: number,
  metalness: number,
): THREE.MeshStandardMaterial {
  const result = new THREE.MeshStandardMaterial({
    name,
    color,
    roughness,
    metalness,
    envMapIntensity: metalness > 0.5 ? 0.75 : 0.38,
    dithering: true,
  });
  return result;
}

function createMaterials(variant: number): MaterialPack {
  const palette = [
    { uniform: 0x34382f, secondary: 0x292d27, armor: 0x252a25, webbing: 0x4a4434 },
    { uniform: 0x373932, secondary: 0x262a28, armor: 0x30332e, webbing: 0x514a39 },
    { uniform: 0x2e3432, secondary: 0x252b2c, armor: 0x282d2c, webbing: 0x45483d },
  ][variant % 3]!;
  const skinTones = [0x8b604a, 0x6d4938, 0xb17b5b, 0x56382f];

  const opticGlass = new THREE.MeshPhysicalMaterial({
    name: "operator_optic_glass",
    color: 0x151b19,
    roughness: 0.12,
    metalness: 0.3,
    clearcoat: 0.9,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1,
  });

  return {
    uniform: material("operator_uniform", palette.uniform, 0.94, 0.01),
    uniformSecondary: material("operator_uniform_secondary", palette.secondary, 0.9, 0.015),
    armor: material("operator_ceramic_armor", palette.armor, 0.73, 0.08),
    webbing: material("operator_webbing", palette.webbing, 0.88, 0.015),
    rubber: material("operator_boot_rubber", 0x171917, 0.86, 0.03),
    skin: material("operator_skin", skinTones[variant % skinTones.length]!, 0.8, 0),
    balaclava: material("operator_balaclava", 0x202321, 0.96, 0),
    helmet: material("operator_helmet", 0x252a26, 0.68, 0.09),
    metal: material("operator_weapon_metal", 0x202326, 0.3, 0.76),
    gunPolymer: material("operator_weapon_polymer", 0x171a1c, 0.58, 0.24),
    opticGlass,
    hostilePatch: material("operator_hostile_patch", 0x93281f, 0.64, 0.06),
  };
}

function setStaticTransform(
  object: THREE.Object3D,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
  scale: [number, number, number] = [1, 1, 1],
): void {
  object.position.set(...position);
  object.rotation.set(...rotation);
  object.scale.set(...scale);
  object.updateMatrix();
  object.matrixAutoUpdate = false;
}

function createPivot(
  name: string,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.set(x, y, z);
  parent.add(pivot);
  return pivot;
}

function markHitZone(mesh: THREE.Mesh, zone: EnemyHitZone, multiplier: number): void {
  mesh.userData.hitZone = zone;
  mesh.userData.damageMultiplier = multiplier;
  mesh.userData.isHead = zone === "head";
}

/**
 * Two-bone arm IK in chest-local space. The shoulder and elbow meshes are
 * built along local -Y, so both gloves stay physically attached to their
 * rifle contacts instead of merely approximating a two-hand hold.
 */
function solveArmIK(
  rig: EnemyModelRig,
  side: "left" | "right",
  target: THREE.Vector3,
): void {
  const shoulder = side === "left" ? rig.leftShoulder : rig.rightShoulder;
  const elbow = side === "left" ? rig.leftElbow : rig.rightElbow;
  const sideSign = side === "left" ? -1 : 1;
  const upperLength = 0.33;
  const lowerLength = 0.3;

  _armDirection.copy(target).sub(shoulder.position);
  const rawDistance = _armDirection.length();
  if (!Number.isFinite(rawDistance) || rawDistance < 1e-5) return;

  _armDirection.multiplyScalar(1 / rawDistance);
  const distance = THREE.MathUtils.clamp(
    rawDistance,
    Math.abs(upperLength - lowerLength) + 0.001,
    upperLength + lowerLength - 0.001,
  );
  const along =
    (upperLength * upperLength - lowerLength * lowerLength + distance * distance) /
    (2 * distance);
  const bendDistance = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));

  // Elbows bias out and slightly down, matching a compact shouldered stance.
  _armBend
    .set(sideSign, -0.28, -0.12)
    .addScaledVector(_armDirection, -_armBend.dot(_armDirection));
  if (_armBend.lengthSq() < 1e-5) _armBend.set(sideSign, 0, 0);
  _armBend.normalize();

  _armElbowPoint
    .copy(shoulder.position)
    .addScaledVector(_armDirection, along)
    .addScaledVector(_armBend, bendDistance);
  _armSegment.copy(_armElbowPoint).sub(shoulder.position).normalize();
  shoulder.quaternion.setFromUnitVectors(_armDown, _armSegment);

  _armSegment.copy(target).sub(_armElbowPoint).normalize();
  _armWorldQuaternion.setFromUnitVectors(_armDown, _armSegment);
  _armInverseQuaternion.copy(shoulder.quaternion).invert();
  elbow.quaternion.copy(_armInverseQuaternion).multiply(_armWorldQuaternion);
}

function solveWeaponGrip(rig: EnemyModelRig): void {
  rig.weapon.updateMatrix();

  _armTarget.set(0.02, 0, 0.38).applyMatrix4(rig.weapon.matrix);
  solveArmIK(rig, "left", _armTarget);

  _armTarget.set(0.04, -0.02, 0.1).applyMatrix4(rig.weapon.matrix);
  solveArmIK(rig, "right", _armTarget);
}

/**
 * Builds an efficiently instanced-by-geometry hostile operator.
 *
 * Integration:
 * - add `model.root` to the scene and place it at ground height;
 * - stamp an enemy id with `setEnemyModelOwner`;
 * - raycast against `model.bodyParts`;
 * - animate only `model.rig` (also available as `root.userData.rig`);
 * - call `model.dispose()` once when the operator is permanently removed.
 */
export function createEnemyModel(variant = 0): EnemyModel {
  const geometry = geometryKit();
  sharedGeometryUsers += 1;
  const mat = createMaterials(variant);
  const materials = Object.values(mat);
  const bodyParts: THREE.Mesh[] = [];

  const root = new THREE.Group();
  root.name = "enemy_operator_ground_root";
  root.userData.floorClearance = FLOOR_CLEARANCE;
  root.userData.feetAnchored = true;

  const add = (
    parent: THREE.Object3D,
    name: string,
    meshGeometry: THREE.BufferGeometry,
    meshMaterial: THREE.Material,
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] = [1, 1, 1],
    zone?: EnemyHitZone,
    multiplier = 1,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(meshGeometry, meshMaterial);
    mesh.name = name;
    setStaticTransform(mesh, position, rotation, scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (zone) {
      markHitZone(mesh, zone, multiplier);
      bodyParts.push(mesh);
    }
    parent.add(mesh);
    return mesh;
  };

  const centerOfMass = createPivot("rig_center_of_mass", root, 0, 0.915, 0);
  const pelvis = createPivot("rig_pelvis", centerOfMass, 0, 0, 0);
  add(
    pelvis,
    "pelvis_uniform",
    geometry.pelvis,
    mat.uniformSecondary,
    [0, 0.015, 0],
    [0, 0, 0],
    [1.12, 0.42, 0.72],
    "pelvis",
    0.95,
  );
  add(pelvis, "duty_belt", geometry.belt, mat.webbing, [0, 0.085, 0.005], [0, 0, 0], [1, 1, 1]);
  add(
    pelvis,
    "belt_pouch_left",
    geometry.pouch,
    mat.webbing,
    [-0.18, 0.075, 0.14],
    [0, 0, 0],
    [0.9, 0.9, 0.9],
  );
  add(
    pelvis,
    "belt_pouch_right",
    geometry.pouch,
    mat.webbing,
    [0.18, 0.075, 0.14],
    [0, 0, 0],
    [0.9, 0.9, 0.9],
  );

  const chest = createPivot("rig_chest", pelvis, 0, 0.125, -0.006);
  add(
    chest,
    "torso_uniform",
    geometry.torso,
    mat.uniform,
    [0, 0.26, 0],
    [0, 0, 0],
    [1.05, 0.69, 0.66],
    "torso",
    1,
  );
  add(
    chest,
    "front_plate",
    geometry.armor,
    mat.armor,
    [0, 0.27, 0.18],
    [0.025, 0, 0],
    [1, 1, 1],
    "torso",
    0.85,
  );
  add(
    chest,
    "back_plate",
    geometry.armor,
    mat.armor,
    [0, 0.27, -0.17],
    [-0.025, 0, 0],
    [0.94, 0.96, 0.92],
    "torso",
    0.9,
  );
  add(chest, "left_cummerbund", geometry.armorSide, mat.webbing, [-0.255, 0.25, 0], [0, 0, 0]);
  add(chest, "right_cummerbund", geometry.armorSide, mat.webbing, [0.255, 0.25, 0], [0, 0, 0]);
  add(
    chest,
    "radio_pack",
    geometry.pack,
    mat.webbing,
    [0, 0.285, -0.255],
    [0, 0, 0],
    [0.72, 0.9, 0.9],
  );
  add(
    chest,
    "magazine_pouch_left",
    geometry.pouch,
    mat.webbing,
    [-0.125, 0.16, 0.255],
    [0.04, 0, 0],
    [1, 1.18, 1],
  );
  add(
    chest,
    "magazine_pouch_center",
    geometry.pouch,
    mat.webbing,
    [0, 0.16, 0.26],
    [0.04, 0, 0],
    [1, 1.18, 1],
  );
  add(
    chest,
    "magazine_pouch_right",
    geometry.pouch,
    mat.webbing,
    [0.125, 0.16, 0.255],
    [0.04, 0, 0],
    [1, 1.18, 1],
  );

  const neck = add(
    chest,
    "neck",
    geometry.neck,
    mat.skin,
    [0, 0.555, 0],
    [0, 0, 0],
    [1, 1, 1],
    "head",
    1.3,
  );
  neck.castShadow = true;
  const head = createPivot("rig_head", chest, 0, 0.585, 0.012);
  const headMesh = add(
    head,
    "head",
    geometry.head,
    mat.balaclava,
    [0, 0.07, 0],
    [0, 0, 0],
    [0.88, 1.18, 0.92],
    "head",
    2,
  );
  add(
    head,
    "exposed_face",
    geometry.face,
    mat.skin,
    [0, 0.064, 0.055],
    [0, 0, 0],
    [0.72, 0.9, 0.64],
    "head",
    2,
  );
  add(
    head,
    "ballistic_helmet",
    geometry.helmet,
    mat.helmet,
    [0, 0.11, -0.006],
    [0, 0, 0],
    [1.06, 0.97, 1.08],
    "head",
    1.65,
  );
  add(
    head,
    "helmet_side_rail_left",
    geometry.patch,
    mat.metal,
    [-0.145, 0.096, 0],
    [0, Math.PI / 2, 0],
    [0.85, 1, 1.65],
    "head",
    1.65,
  );
  add(
    head,
    "helmet_side_rail_right",
    geometry.patch,
    mat.metal,
    [0.145, 0.096, 0],
    [0, Math.PI / 2, 0],
    [0.85, 1, 1.65],
    "head",
    1.65,
  );

  // Small matte team patches provide identification without a dominant glow.
  add(
    chest,
    "hostile_chest_patch",
    geometry.patch,
    mat.hostilePatch,
    [0.145, 0.395, 0.228],
    [0.03, 0, 0],
  );

  const leftHip = createPivot("rig_left_hip", centerOfMass, -0.125, -0.02, 0);
  add(
    leftHip,
    "left_thigh",
    geometry.thigh,
    mat.uniform,
    [0, -0.2125, 0],
    [0, 0, 0],
    [1, 1, 1],
    "leg",
    0.8,
  );
  const leftKnee = createPivot("rig_left_knee", leftHip, 0, -0.425, 0);
  add(
    leftKnee,
    "left_knee_pad",
    geometry.knee,
    mat.armor,
    [0, 0.006, 0.055],
    [0, 0, 0],
    [0.95, 0.8, 0.7],
    "leg",
    0.75,
  );
  add(
    leftKnee,
    "left_calf",
    geometry.calf,
    mat.uniformSecondary,
    [0, -0.2, 0],
    [0, 0, 0],
    [1, 1, 1],
    "leg",
    0.75,
  );
  const leftFoot = createPivot("rig_left_foot", leftKnee, 0, -0.4, 0);
  add(
    leftFoot,
    "left_boot",
    geometry.boot,
    mat.rubber,
    [0, 0, 0.07],
    [0, 0, 0],
    [1, 1, 1],
    "leg",
    0.7,
  );

  const rightHip = createPivot("rig_right_hip", centerOfMass, 0.125, -0.02, 0);
  add(
    rightHip,
    "right_thigh",
    geometry.thigh,
    mat.uniform,
    [0, -0.2125, 0],
    [0, 0, 0],
    [1, 1, 1],
    "leg",
    0.8,
  );
  const rightKnee = createPivot("rig_right_knee", rightHip, 0, -0.425, 0);
  add(
    rightKnee,
    "right_knee_pad",
    geometry.knee,
    mat.armor,
    [0, 0.006, 0.055],
    [0, 0, 0],
    [0.95, 0.8, 0.7],
    "leg",
    0.75,
  );
  add(
    rightKnee,
    "right_calf",
    geometry.calf,
    mat.uniformSecondary,
    [0, -0.2, 0],
    [0, 0, 0],
    [1, 1, 1],
    "leg",
    0.75,
  );
  const rightFoot = createPivot("rig_right_foot", rightKnee, 0, -0.4, 0);
  add(
    rightFoot,
    "right_boot",
    geometry.boot,
    mat.rubber,
    [0, 0, 0.07],
    [0, 0, 0],
    [1, 1, 1],
    "leg",
    0.7,
  );

  const leftShoulder = createPivot("rig_left_shoulder", chest, -0.302, 0.43, 0.01);
  add(
    leftShoulder,
    "left_shoulder",
    geometry.shoulder,
    mat.uniform,
    [0, 0, 0],
    [0, 0, 0],
    [1, 0.9, 1],
    "arm",
    0.72,
  );
  add(
    leftShoulder,
    "left_upper_arm",
    geometry.upperArm,
    mat.uniform,
    [0, -0.165, 0],
    [0, 0, 0],
    [1, 1, 1],
    "arm",
    0.72,
  );
  add(
    leftShoulder,
    "hostile_arm_patch",
    geometry.patch,
    mat.hostilePatch,
    [-0.068, -0.11, 0],
    [0, Math.PI / 2, 0],
    [0.8, 0.8, 1],
  );
  const leftElbow = createPivot("rig_left_elbow", leftShoulder, 0, -0.33, 0);
  add(
    leftElbow,
    "left_forearm",
    geometry.forearm,
    mat.uniformSecondary,
    [0, -0.15, 0],
    [0, 0, 0],
    [1, 1, 1],
    "arm",
    0.68,
  );
  const leftHand = createPivot("rig_left_hand", leftElbow, 0, -0.3, 0);
  add(
    leftHand,
    "left_glove",
    geometry.hand,
    mat.rubber,
    [0, 0, 0],
    [0, 0, 0],
    [0.78, 1.1, 0.78],
    "arm",
    0.65,
  );

  const rightShoulder = createPivot("rig_right_shoulder", chest, 0.302, 0.43, 0.01);
  add(
    rightShoulder,
    "right_shoulder",
    geometry.shoulder,
    mat.uniform,
    [0, 0, 0],
    [0, 0, 0],
    [1, 0.9, 1],
    "arm",
    0.72,
  );
  add(
    rightShoulder,
    "right_upper_arm",
    geometry.upperArm,
    mat.uniform,
    [0, -0.165, 0],
    [0, 0, 0],
    [1, 1, 1],
    "arm",
    0.72,
  );
  const rightElbow = createPivot("rig_right_elbow", rightShoulder, 0, -0.33, 0);
  add(
    rightElbow,
    "right_forearm",
    geometry.forearm,
    mat.uniformSecondary,
    [0, -0.15, 0],
    [0, 0, 0],
    [1, 1, 1],
    "arm",
    0.68,
  );
  const rightHand = createPivot("rig_right_hand", rightElbow, 0, -0.3, 0);
  add(
    rightHand,
    "right_glove",
    geometry.hand,
    mat.rubber,
    [0, 0, 0],
    [0, 0, 0],
    [0.78, 1.1, 0.78],
    "arm",
    0.65,
  );

  // Weapon axis is +Z. The stock terminates at the shoulder and the foregrip
  // crosses the left support hand, keeping all three contacts visually joined.
  const weapon = createPivot("rig_weapon", chest, 0, 0.27, 0.13);
  add(
    weapon,
    "rifle_stock",
    geometry.rifleStock,
    mat.gunPolymer,
    [0.07, -0.02, -0.115],
    [0.08, 0, 0],
  );
  add(weapon, "rifle_receiver", geometry.rifleReceiver, mat.metal, [0.04, 0, 0.16], [0.04, 0, 0]);
  add(
    weapon,
    "rifle_magazine",
    geometry.rifleMagazine,
    mat.gunPolymer,
    [0.035, -0.13, 0.14],
    [-0.2, 0, 0],
  );
  add(
    weapon,
    "rifle_handguard",
    geometry.rifleRail,
    mat.gunPolymer,
    [0.02, 0.005, 0.43],
    [0, 0, 0],
    [1.4, 1.55, 1.1],
  );
  add(weapon, "rifle_barrel", geometry.barrel, mat.metal, [0.02, 0.005, 0.68], [Math.PI / 2, 0, 0]);
  add(
    weapon,
    "rifle_muzzle_device",
    geometry.muzzle,
    mat.metal,
    [0.02, 0.005, 0.885],
    [Math.PI / 2, 0, 0],
  );
  add(weapon, "rifle_optic", geometry.optic, mat.gunPolymer, [0.035, 0.095, 0.16], [0, 0, 0]);
  add(
    weapon,
    "rifle_optic_lens",
    geometry.patch,
    mat.opticGlass,
    [0.035, 0.095, 0.225],
    [0, 0, 0],
    [0.58, 0.58, 0.5],
  );
  const muzzle = createPivot("rig_muzzle", weapon, 0.02, 0.005, 0.93);

  const rig: EnemyModelRig = {
    root,
    centerOfMass,
    pelvis,
    chest,
    head,
    leftShoulder,
    leftElbow,
    leftHand,
    rightShoulder,
    rightElbow,
    rightHand,
    leftHip,
    leftKnee,
    leftFoot,
    rightHip,
    rightKnee,
    rightFoot,
    weapon,
    muzzle,
  };

  root.userData.rig = rig;
  root.userData.muzzle = muzzle;

  resetEnemyModelPose(rig);

  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const value of materials) value.dispose();
    root.removeFromParent();
    root.clear();
    sharedGeometryUsers = Math.max(0, sharedGeometryUsers - 1);
    if (sharedGeometryUsers === 0 && sharedGeometry) {
      for (const value of Object.values(sharedGeometry)) value.dispose();
      sharedGeometry = null;
    }
  };

  return {
    root,
    rig,
    bodyParts,
    headMesh,
    materials,
    teamHue: mat.hostilePatch.color.getHex(),
    dispose,
  };
}

/**
 * Stamps the ownership id on every hittable mesh. This preserves the existing
 * ancestor lookup while also making direct raycast hits resolve immediately.
 */
export function setEnemyModelOwner(model: EnemyModel, enemyId: number): void {
  model.root.userData.enemyId = enemyId;
  for (const part of model.bodyParts) part.userData.enemyId = enemyId;
}

/**
 * Neutral combat-ready pose with a true two-hand rifle hold. It changes only
 * articulated pivots; the feet-anchored root is deliberately untouched.
 */
export function resetEnemyModelPose(rig: EnemyModelRig): void {
  rig.centerOfMass.position.set(0, 0.915, 0);
  rig.centerOfMass.rotation.copy(neutralEuler);
  rig.pelvis.rotation.set(0, 0, 0);
  rig.chest.rotation.set(-0.035, 0, 0);
  rig.head.rotation.set(0.015, 0, 0);

  rig.leftHip.rotation.set(0, 0, 0);
  rig.leftKnee.rotation.set(0, 0, 0);
  rig.leftFoot.rotation.set(0, 0, 0);
  rig.rightHip.rotation.set(0, 0, 0);
  rig.rightKnee.rotation.set(0, 0, 0);
  rig.rightFoot.rotation.set(0, 0, 0);

  rig.leftHand.rotation.set(0.08, 0.08, 0);
  rig.rightHand.rotation.set(0.06, -0.08, 0);
  rig.weapon.rotation.set(-0.035, 0, 0);
  solveWeaponGrip(rig);
}

/**
 * Restrained, weight-bearing locomotion and aim pose. Both leg chains begin as
 * straight hip-to-floor links: rotating them can lift a foot but cannot drive
 * the neutral boot below the ground plane.
 */
export function poseEnemyModel(rig: EnemyModelRig, pose: EnemyPose): void {
  const move = THREE.MathUtils.clamp(pose.locomotion, 0, 1);
  const aim = THREE.MathUtils.clamp(pose.aim ?? 1, 0, 1);
  const recoil = THREE.MathUtils.clamp(pose.recoil ?? 0, 0, 1);
  const flinch = THREE.MathUtils.clamp(pose.flinch ?? 0, 0, 1);
  const flinchYaw = pose.flinchYaw ?? 0;
  const stride = Math.sin(pose.gaitPhase) * 0.47 * move;
  const leftLift = Math.max(0, Math.sin(pose.gaitPhase)) * move;
  const rightLift = Math.max(0, -Math.sin(pose.gaitPhase)) * move;
  const weightShift = Math.sin(pose.gaitPhase) * 0.018 * move;

  rig.centerOfMass.position.set(
    weightShift,
    // Compensate the articulated leg arc so at least one boot remains planted
    // instead of both feet hovering at the middle of every stride.
    0.915 - Math.abs(Math.sin(pose.gaitPhase)) * 0.047 * move,
    0,
  );
  rig.centerOfMass.rotation.set(0, 0, -weightShift * 0.8);
  rig.pelvis.rotation.set(0, -stride * 0.08, -weightShift * 1.1);
  rig.chest.rotation.set(
    -0.035 - move * 0.035 + Math.cos(flinchYaw) * flinch * 0.13,
    stride * 0.055 + Math.sin(flinchYaw) * flinch * 0.18,
    -weightShift * 0.75 + Math.sin(flinchYaw) * flinch * 0.09,
  );
  rig.head.rotation.set(0.015 - flinch * 0.04, -stride * 0.025, 0);

  rig.leftHip.rotation.set(stride, 0, 0.015);
  rig.leftKnee.rotation.set(-leftLift * 0.43, 0, 0);
  rig.leftFoot.rotation.set(-stride + leftLift * 0.43, 0, -0.015);
  rig.rightHip.rotation.set(-stride, 0, -0.015);
  rig.rightKnee.rotation.set(-rightLift * 0.43, 0, 0);
  rig.rightFoot.rotation.set(stride + rightLift * 0.43, 0, 0.015);

  const relaxed = 1 - aim;
  rig.weapon.rotation.set(-0.035 - recoil * 0.055 + relaxed * 0.16, recoil * 0.012, 0);
  solveWeaponGrip(rig);
}

/**
 * Contact-corrected knees-first collapse. All motion stays inside the rig:
 * the locomotion root remains upright at y=0, and a final bounds correction
 * prevents any animated body part from crossing the floor plane.
 */
export function poseEnemyDeath(rig: EnemyModelRig, progress: number, fallSide: -1 | 1): void {
  const t = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(progress, 0, 1), 0, 1);
  resetEnemyModelPose(rig);
  const leftShoulderStart = rig.leftShoulder.rotation.clone();
  const leftElbowStart = rig.leftElbow.rotation.clone();
  const rightShoulderStart = rig.rightShoulder.rotation.clone();
  const rightElbowStart = rig.rightElbow.rotation.clone();

  rig.centerOfMass.position.set(fallSide * 0.055 * t, 0.915 - 0.31 * t, 0.035 * t);
  rig.centerOfMass.rotation.set(0.04 * t, 0, fallSide * 0.16 * t);
  rig.pelvis.rotation.set(0.18 * t, -fallSide * 0.12 * t, fallSide * 0.08 * t);
  rig.chest.rotation.set(0.28 * t, fallSide * 0.16 * t, fallSide * 0.52 * t);
  rig.head.rotation.set(-0.12 * t, -fallSide * 0.18 * t, -fallSide * 0.22 * t);

  rig.leftHip.rotation.set(0.62 * t, 0, 0.06 * t);
  rig.leftKnee.rotation.set(-1.08 * t, 0, 0);
  rig.leftFoot.rotation.set(0.46 * t, 0, -0.04 * t);
  rig.rightHip.rotation.set(0.78 * t, 0, -0.06 * t);
  rig.rightKnee.rotation.set(-1.26 * t, 0, 0);
  rig.rightFoot.rotation.set(0.48 * t, 0, 0.04 * t);

  rig.leftShoulder.rotation.set(
    THREE.MathUtils.lerp(leftShoulderStart.x, -0.52, t),
    THREE.MathUtils.lerp(leftShoulderStart.y, -0.15, t),
    THREE.MathUtils.lerp(leftShoulderStart.z, -0.38, t),
  );
  rig.leftElbow.rotation.set(
    THREE.MathUtils.lerp(leftElbowStart.x, -0.2, t),
    THREE.MathUtils.lerp(leftElbowStart.y, -0.08, t),
    THREE.MathUtils.lerp(leftElbowStart.z, 0.2, t),
  );
  rig.rightShoulder.rotation.set(
    THREE.MathUtils.lerp(rightShoulderStart.x, -0.4, t),
    THREE.MathUtils.lerp(rightShoulderStart.y, 0.1, t),
    THREE.MathUtils.lerp(rightShoulderStart.z, 0.44, t),
  );
  rig.rightElbow.rotation.set(
    THREE.MathUtils.lerp(rightElbowStart.x, -0.24, t),
    THREE.MathUtils.lerp(rightElbowStart.y, 0.12, t),
    THREE.MathUtils.lerp(rightElbowStart.z, -0.2, t),
  );
  rig.weapon.rotation.set(
    THREE.MathUtils.lerp(-0.035, 0.14, t),
    fallSide * 0.12 * t,
    fallSide * 0.2 * t,
  );

  rig.root.updateMatrixWorld(true);
  _poseBounds.setFromObject(rig.root);
  if (_poseBounds.min.y < FLOOR_CLEARANCE) {
    rig.centerOfMass.position.y += FLOOR_CLEARANCE - _poseBounds.min.y;
    rig.root.updateMatrixWorld(true);
  }
}
