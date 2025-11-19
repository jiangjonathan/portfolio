import { Object3D, Quaternion, Vector3 } from "three";
import { directionFromAngles } from "./pageNavigation";
import type { ScenePage } from "./pageNavigation";
import {
  BUSINESS_CARD_PAGE,
  BUSINESS_CARD_CAMERA_PITCH,
  BUSINESS_CARD_CAMERA_YAW,
  BUSINESS_CARD_FOCUS_TARGET,
} from "./sceneObjects";

const RAD2DEG = 180 / Math.PI;
const DEG2RAD = Math.PI / 180;

type MeshGetter = () => Object3D | null;

type NumberControlOptions = {
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
};

type NumberControl = {
  control: HTMLDivElement;
  input: HTMLInputElement;
};

export type BusinessCardAnimationOptions = {
  root: HTMLElement;
  getBusinessCardMesh: MeshGetter;
};

export type BusinessCardAnimationController = {
  handlePageSelection: (page: ScenePage) => void;
  resetToHome: () => void;
};

const createNumberInputControl = (
  labelText: string,
  options: NumberControlOptions,
  registerEditingInput: (input: HTMLInputElement) => void,
): NumberControl => {
  const { min, max, step, suffix } = options;
  const control = document.createElement("div");
  Object.assign(control.style, {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    width: "100%",
  });

  const label = document.createElement("span");
  label.textContent = labelText;
  Object.assign(label.style, {
    fontSize: "0.75rem",
    fontWeight: "600",
    minWidth: "46px",
  });

  const input = document.createElement("input");
  input.type = "number";
  if (min !== undefined) input.min = min.toString();
  if (max !== undefined) input.max = max.toString();
  if (step !== undefined) input.step = step.toString();
  input.autocomplete = "off";
  Object.assign(input.style, {
    flexGrow: "1",
    cursor: "text",
    padding: "0.2rem 0.35rem",
    fontSize: "0.8rem",
    background: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255, 255, 255, 0.35)",
    borderRadius: "4px",
    color: "#fff",
  });
  registerEditingInput(input);

  const unit = document.createElement("span");
  unit.textContent = suffix ?? "";
  Object.assign(unit.style, {
    fontSize: "0.75rem",
    minWidth: "24px",
    textAlign: "right",
  });

  control.append(label, input, unit);
  return { control, input };
};

export const createBusinessCardAnimation = ({
  root,
  getBusinessCardMesh,
}: BusinessCardAnimationOptions): BusinessCardAnimationController => {
  const editingInputs = new Set<HTMLInputElement>();
  const registerEditingInput = (input: HTMLInputElement) => {
    input.addEventListener("focus", () => {
      editingInputs.add(input);
    });
    input.addEventListener("blur", () => {
      editingInputs.delete(input);
    });
  };

  const panel = document.createElement("div");
  panel.id = "business-card-debug-panel";
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "1rem",
    left: "1rem",
    width: "260px",
    padding: "0.6rem 0.85rem",
    borderRadius: "0.75rem",
    background: "rgba(0, 0, 0, 0.75)",
    border: "1px solid rgba(255, 255, 255, 0.4)",
    color: "#fff",
    fontSize: "0.75rem",
    fontFamily: "monospace",
    zIndex: "1000",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    pointerEvents: "auto",
  });

  const header = document.createElement("div");
  header.textContent = "Business Card Debug";
  Object.assign(header.style, {
    fontWeight: "600",
    textTransform: "uppercase",
    fontSize: "0.7rem",
    letterSpacing: "0.35em",
    opacity: "0.9",
  });
  panel.append(header);

  const sectionLabel = (text: string) => {
    const label = document.createElement("div");
    label.textContent = text;
    Object.assign(label.style, {
      fontSize: "0.7rem",
      fontWeight: "700",
      letterSpacing: "0.25em",
      textTransform: "uppercase",
      opacity: "0.75",
    });
    return label;
  };

  const posX = createNumberInputControl(
    "Pos X",
    { step: 0.1 },
    registerEditingInput,
  );
  const posY = createNumberInputControl(
    "Pos Y",
    { step: 0.1 },
    registerEditingInput,
  );
  const posZ = createNumberInputControl(
    "Pos Z",
    { step: 0.1 },
    registerEditingInput,
  );

  const rotX = createNumberInputControl(
    "Rot X",
    { step: 1, suffix: "°" },
    registerEditingInput,
  );
  const rotY = createNumberInputControl(
    "Rot Y",
    { step: 1, suffix: "°" },
    registerEditingInput,
  );
  const rotZ = createNumberInputControl(
    "Rot Z",
    { step: 1, suffix: "°" },
    registerEditingInput,
  );

  panel.append(
    sectionLabel("Position"),
    posX.control,
    posY.control,
    posZ.control,
    sectionLabel("Rotation"),
    rotX.control,
    rotY.control,
    rotZ.control,
  );

  root.appendChild(panel);

  const parseInput = (value: string, fallback: number) => {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const updateMeshFromInputs = () => {
    const mesh = getBusinessCardMesh();
    if (!mesh) {
      return;
    }
    const x = parseInput(posX.input.value, mesh.position.x);
    const y = parseInput(posY.input.value, mesh.position.y);
    const z = parseInput(posZ.input.value, mesh.position.z);
    mesh.position.set(x, y, z);

    const rotXDeg = parseInput(rotX.input.value, mesh.rotation.x * RAD2DEG);
    const rotYDeg = parseInput(rotY.input.value, mesh.rotation.y * RAD2DEG);
    const rotZDeg = parseInput(rotZ.input.value, mesh.rotation.z * RAD2DEG);
    mesh.rotation.set(rotXDeg * DEG2RAD, rotYDeg * DEG2RAD, rotZDeg * DEG2RAD);
  };

  const syncInputsFromMesh = () => {
    const mesh = getBusinessCardMesh();
    if (!mesh) {
      return;
    }
    if (!editingInputs.has(posX.input)) {
      posX.input.value = mesh.position.x.toFixed(2);
    }
    if (!editingInputs.has(posY.input)) {
      posY.input.value = mesh.position.y.toFixed(2);
    }
    if (!editingInputs.has(posZ.input)) {
      posZ.input.value = mesh.position.z.toFixed(2);
    }
    if (!editingInputs.has(rotX.input)) {
      rotX.input.value = (mesh.rotation.x * RAD2DEG).toFixed(1);
    }
    if (!editingInputs.has(rotY.input)) {
      rotY.input.value = (mesh.rotation.y * RAD2DEG).toFixed(1);
    }
    if (!editingInputs.has(rotZ.input)) {
      rotZ.input.value = (mesh.rotation.z * RAD2DEG).toFixed(1);
    }
  };

  const syncLoop = () => {
    syncInputsFromMesh();
    requestAnimationFrame(syncLoop);
  };
  requestAnimationFrame(syncLoop);

  [posX, posY, posZ, rotX, rotY, rotZ].forEach(({ input }) => {
    input.addEventListener("input", updateMeshFromInputs);
  });

  const FOCUS_ANIMATION_DURATION = 720;
  const RESET_ANIMATION_DURATION = 520;
  const UP_VECTOR = new Vector3(0, 1, 0);
  const focusDirection = directionFromAngles(
    BUSINESS_CARD_CAMERA_YAW,
    BUSINESS_CARD_CAMERA_PITCH,
  ).clone();
  const focusQuaternion = new Quaternion().setFromUnitVectors(
    UP_VECTOR,
    focusDirection,
  );
  let animationFrame: number | null = null;
  let homePosition: Vector3 | null = null;
  let homeQuaternion: Quaternion | null = null;

  const captureHomeTransform = (mesh: Object3D) => {
    homePosition = mesh.position.clone();
    homeQuaternion = mesh.quaternion.clone();
  };

  const animateMeshTransform = (
    mesh: Object3D,
    targetPosition: Vector3,
    targetQuaternion: Quaternion,
    duration: number,
    onComplete?: () => void,
  ) => {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }
    const startPosition = mesh.position.clone();
    const startQuaternion = mesh.quaternion.clone();
    const startTime = performance.now();

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      mesh.position.lerpVectors(startPosition, targetPosition, easedProgress);
      mesh.quaternion.slerpQuaternions(
        startQuaternion,
        targetQuaternion,
        easedProgress,
      );
      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      } else {
        animationFrame = null;
        if (onComplete) {
          onComplete();
        }
      }
    };

    animationFrame = requestAnimationFrame(step);
  };

  const animateToFocus = (mesh: Object3D) => {
    captureHomeTransform(mesh);
    const focusPosition = BUSINESS_CARD_FOCUS_TARGET.clone();
    animateMeshTransform(
      mesh,
      focusPosition,
      focusQuaternion.clone(),
      FOCUS_ANIMATION_DURATION,
    );
  };

  const animateToHome = (mesh: Object3D) => {
    const targetPosition = homePosition
      ? homePosition.clone()
      : mesh.position.clone();
    const targetQuaternion = homeQuaternion
      ? homeQuaternion.clone()
      : mesh.quaternion.clone();
    animateMeshTransform(
      mesh,
      targetPosition,
      targetQuaternion,
      RESET_ANIMATION_DURATION,
      () => captureHomeTransform(mesh),
    );
  };

  const handlePageSelection = (page: ScenePage) => {
    if (page !== BUSINESS_CARD_PAGE) {
      return;
    }
    const mesh = getBusinessCardMesh();
    if (!mesh) {
      return;
    }
    animateToFocus(mesh);
  };

  const resetToHome = () => {
    const mesh = getBusinessCardMesh();
    if (!mesh) {
      return;
    }
    animateToHome(mesh);
  };

  return {
    handlePageSelection,
    resetToHome,
  };
};
