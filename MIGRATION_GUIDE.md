# Gradual Migration Guide

## ⚠️ Important: Why Not Full Migration Now?

The original `main.ts` is **3,754 lines** with deeply interconnected state. A full rewrite in one step would be:
- **High risk** - Easy to break existing functionality
- **Hard to test** - All features need retesting at once
- **Time-consuming** - Would take days to get right

Instead, I recommend **gradual migration** - adopt new modules one piece at a time.

## ✅ What's Already Done

I've created 5 clean, reusable modules:

1. **`pageNavigation.ts`** - Page switching & camera utilities
2. **`domSetup.ts`** - DOM/UI creation
3. **`vinylState.ts`** - Vinyl state management  
4. **`cameraControls.ts`** - Camera orbit/pan controls
5. **`sceneObjects.ts`** - 3D object creation
6. **`vinylHelpers.ts`** - Vinyl utility functions

**Your original `main.ts` is backed up** at `src/main.ts.backup`

## 🎯 Migration Strategy: 3 Phases

### Phase 1: Use Helpers (Safest - Start Here!)

Import utility functions without changing structure:

```typescript
// At the top of main.ts, add:
import {
  directionFromAngles,
  lerpAngleDegrees,
  cloneCameraSettings,
} from "./pageNavigation";

import {
  createBusinessCardMesh,
  createPlaceholderMesh,
  prioritizePortfolioCoverRendering,
} from "./sceneObjects";

import {
  getFocusVinylScale,
  applyFocusVinylScale,
  cloneLabelVisuals,
} from "./vinylHelpers";

// Then replace inline implementations with function calls:
// Before:
const yawRad = yawDeg * DEG2RAD;
const pitchRad = pitchDeg * DEG2RAD;
// ...

// After:
const direction = directionFromAngles(yawDeg, pitchDeg);
```

**Benefits:**
- Zero risk - just using functions
- Reduces code duplication
- Tests existing behavior

**Test:** Run `npm run dev` - everything should work exactly as before

### Phase 2: Adopt State Managers (Medium Risk)

Replace state management with classes:

#### Example: Camera Controls

```typescript
// Add to imports:
import { CameraControlsManager } from "./cameraControls";

// Replace camera orbit/pan state with:
const cameraControls = new CameraControlsManager(
  cameraRig,
  canvas,
  () => activePage,
  () => pageTransitionState.active,
);

// Replace event handlers:
// Before:
canvas.addEventListener("pointerdown", (event) => {
  if (event.button === 2) {
    // ...150 lines of orbit logic
  }
});

// After:
canvas.addEventListener("pointerdown", (event) => {
  if (event.button === 2) {
    cameraControls.startOrbit(event);
    return;
  }
  // ...rest of pointerdown logic
});

canvas.addEventListener("pointermove", (event) => {
  if (cameraControls.handleOrbitMove(event)) {
    return; // Handled by camera controls
  }
  // ...rest of pointermove logic
});

canvas.addEventListener("pointerup", (event) => {
  cameraControls.endOrbit(event);
  // ...rest of pointerup logic
});
```

#### Example: Vinyl State

```typescript
// Add to imports:
import { VinylStateManager } from "./vinylState";

// After heroGroup is created:
const vinylStateManager = new VinylStateManager(heroGroup);

// Replace vinyl state variables:
// Before:
let focusVinylState: FocusVinylState | null = null;
let turntableVinylState: TurntableVinylState | null = null;
let activeVinylSource: VinylSource | null = null;
const flyawayVinyls: FlyawayVinyl[] = [];

// After:
// Just use vinylStateManager.focusVinylState, etc.

// Replace functions:
// Before:
function disposeFocusVinyl() {
  if (!focusVinylState) return;
  heroGroup.remove(focusVinylState.model);
  focusVinylState = null;
  // ...
}

// After:
vinylStateManager.disposeFocusVinyl();

// Update flyaway animation in animate() loop:
// Before:
for (let i = flyawayVinyls.length - 1; i >= 0; i--) {
  // ...50 lines
}

// After:
vinylStateManager.updateFlyawayVinyls(delta);
```

**Test after each replacement:**
1. Replace camera controls → test camera interactions
2. Replace vinyl state → test vinyl dragging/placement
3. Verify no regressions

### Phase 3: Refactor Structure (High Impact)

Create new initialization modules:

#### `src/initialization.ts`

```typescript
import { setupDOM } from "./domSetup";
import { VinylStateManager } from "./vinylState";
import { CameraControlsManager } from "./cameraControls";
// ... other imports

export function initializeApp() {
  // DOM setup
  const dom = setupDOM();
  
  // Scene setup
  const renderer = createRenderer(dom.canvas);
  const scene = createScene();
  const cameraRig = createCameraRig();
  const heroGroup = new Group();
  scene.add(heroGroup);
  
  // State managers
  const vinylStateManager = new VinylStateManager(heroGroup);
  const cameraControls = new CameraControlsManager(
    cameraRig,
    dom.canvas,
    () => activePage,
    () => pageTransitionState.active,
  );
  
  return {
    dom,
    renderer,
    scene,
    cameraRig,
    heroGroup,
    vinylStateManager,
    cameraControls,
  };
}
```

#### New `main.ts` structure:

```typescript
import "./style.css";
import { initializeApp } from "./initialization";
import { initializeYouTubePlayer } from "./youtube";
// ... other imports

const {
  dom,
  renderer,
  scene,
  cameraRig,
  heroGroup,
  vinylStateManager,
  cameraControls,
} = initializeApp();

// YouTube player
const youtubePlayer = initializeYouTubePlayer(dom.root);

// Load 3D models
loadTurntableModel().then(setupTurntable);
loadPortfolioModel().then(setupPortfolio);

// Event handlers
setupEventHandlers(dom.canvas, vinylStateManager, cameraControls);

// Animation loop
function animate(time: number) {
  requestAnimationFrame(animate);
  const delta = (time - lastTime) / 1000;
  lastTime = time;
  
  // Update managers
  cameraRig.updateAnimation(delta);
  vinylStateManager.updateFlyawayVinyls(delta);
  turntableController?.update(delta);
  
  // Render
  renderer.render(scene, cameraRig.camera);
}
requestAnimationFrame(animate);
```

**Test thoroughly** - this changes the structure significantly

## 📝 Migration Checklist

Use this checklist as you migrate:

### Phase 1: Helpers
- [ ] Import utility functions from `pageNavigation.ts`
- [ ] Import creation functions from `sceneObjects.ts`  
- [ ] Import helpers from `vinylHelpers.ts`
- [ ] Replace inline implementations with function calls
- [ ] Test: `npm run dev` - verify no changes in behavior

### Phase 2: State Managers
- [ ] Import `CameraControlsManager`
- [ ] Replace camera orbit state with manager
- [ ] Replace camera pan state with manager
- [ ] Test camera interactions
- [ ] Import `VinylStateManager`
- [ ] Replace vinyl state variables
- [ ] Replace vinyl disposal functions
- [ ] Test vinyl dragging and placement
- [ ] Verify no regressions

### Phase 3: Refactoring
- [ ] Create `initialization.ts`
- [ ] Move setup logic to initialization
- [ ] Create `eventHandlers.ts` (optional)
- [ ] Simplify `main.ts` to just coordination
- [ ] Test all features end-to-end
- [ ] Performance test

## 🧪 Testing Strategy

After each phase:

### Functional Tests
1. **Page Navigation**
   - Click home button → verify view changes
   - Click portfolio → verify camera moves correctly
   - Click turntable → verify turntable visible

2. **Camera Controls**
   - Right-click drag → orbit works
   - Middle-click drag → pan works
   - Scroll → zoom works
   - Camera returns to preset after orbit

3. **Vinyl Interactions**
   - Load a vinyl from library
   - Drag vinyl around
   - Drop on turntable → plays video
   - Drag off turntable → returns to focus card
   - Throw vinyl → flyaway animation

4. **Turntable**
   - Spacebar → starts/stops playback
   - Drag tonearm → scrubs video
   - Vinyl spins during playback

### Visual Tests
- No layout shifts
- UI elements in correct positions
- Smooth animations
- No flickering

### Performance Tests
- FPS stays above 30 (preferably 60)
- No memory leaks (check DevTools)
- Smooth interactions

## 🚨 Common Pitfalls

### 1. Shared State
**Problem:** New modules expect certain state that main.ts manages

**Solution:** Pass state via constructor or callbacks
```typescript
// Bad - assumes global state
class Manager {
  doSomething() {
    if (activePage === "turntable") { /* ... */ }
  }
}

// Good - accepts state provider
class Manager {
  constructor(private getActivePage: () => ScenePage) {}
  doSomething() {
    if (this.getActivePage() === "turntable") { /* ... */ }
  }
}
```

### 2. Circular Dependencies
**Problem:** Module A imports B, B imports A → crash

**Solution:** Extract shared types to separate file
```typescript
// types.ts
export type ScenePage = "home" | "turntable" | ...;

// pageNavigation.ts
import type { ScenePage } from "./types";

// main.ts
import type { ScenePage } from "./types";
```

### 3. Event Handler Order
**Problem:** Camera controls consume events before vinyl handlers

**Solution:** Check return values
```typescript
canvas.addEventListener("pointermove", (event) => {
  if (cameraControls.handleOrbitMove(event)) {
    return; // Don't process further
  }
  if (vinylDragActive) {
    handleVinylDrag(event);
  }
});
```

## 🎓 Example: Complete Phase 1 Migration

Here's a concrete example of Phase 1 changes:

```typescript
// main.ts - Top of file

// ADD THESE IMPORTS:
import {
  directionFromAngles,
  lerpAngleDegrees,
  cloneCameraSettings,
  applyPageCameraSettings,
  captureCameraState,
} from "./pageNavigation";

import {
  createBusinessCardMesh,
  createPlaceholderMesh,
  prioritizePortfolioCoverRendering,
  BUSINESS_CARD_PAGE,
  PLACEHOLDER_SCENES,
} from "./sceneObjects";

import {
  getFocusVinylScale,
  applyFocusVinylScale,
  cloneLabelVisuals,
  resetVinylAnimationState,
} from "./vinylHelpers";

// FIND AND REPLACE:

// 1. Business card creation (around line 500)
// Before:
const geometry = new BoxGeometry(/* ... */);
const frontTexture = createBusinessCardTexture();
// ...100 lines...
heroGroup.add(cardMesh);

// After:
const circlePos = getHeroCirclePosition(BUSINESS_CARD_PAGE);
const cardMesh = createBusinessCardMesh(renderer, circlePos);
heroGroup.add(cardMesh);

// 2. Placeholder creation (around line 600)
// Before:
PLACEHOLDER_SCENES.forEach((config) => {
  const geometry = config.geometry === "box" ? /* ... */ : /* ... */;
  // ...20 lines...
});

// After:
PLACEHOLDER_SCENES.forEach((config) => {
  const circlePos = getHeroCirclePosition(config.id);
  const mesh = createPlaceholderMesh(config, circlePos);
  heroGroup.add(mesh);
  registerHomePageTarget(mesh, config.id);
  pageSceneRoots[config.id] = mesh;
  pageCameraSettings[config.id].target.copy(circlePos);
});

// 3. Camera direction (multiple places)
// Before:
const yawRad = yawDeg * DEG2RAD;
const pitchRad = pitchDeg * DEG2RAD;
const cosPitch = Math.cos(pitchRad);
direction.set(/* ... */).normalize();

// After:
const direction = directionFromAngles(yawDeg, pitchDeg);

// 4. Focus vinyl scale (multiple places)
// Before:
const vinylScaleFactor = FOCUS_VINYL_BASE_SCALE / cameraRig.getZoomFactor();
vinylModel.scale.setScalar(vinylScaleFactor);

// After:
applyFocusVinylScale(vinylModel, cameraRig);
```

**Test:** Build and run - should work identically

## 📊 Progress Tracking

Track your migration:

```
[ ] Phase 1 Complete - Helper functions integrated
[ ] Phase 2.1 Complete - Camera controls migrated
[ ] Phase 2.2 Complete - Vinyl state migrated  
[ ] Phase 3 Complete - Full refactor done
```

## 🆘 If Something Breaks

1. **Check the backup:** `src/main.ts.backup` has the original
2. **Revert incrementally:** Undo last change and test
3. **Compare carefully:** Use diff tools to see what changed
4. **Ask for help:** The modules are documented

## 🎉 Benefits After Migration

Once you complete the migration:

- **Easier debugging** - Know where to look
- **Faster development** - Reusable components
- **Better testing** - Test modules independently
- **Less cognitive load** - Smaller files to understand
- **Team friendly** - Multiple people can work on different modules

## Next Steps

1. **Start with Phase 1** - It's safe and gives immediate benefits
2. **Test thoroughly** after each change
3. **Move to Phase 2** when comfortable
4. **Consider Phase 3** only if you have time for full refactor

Good luck! The modular files are ready whenever you want to adopt them.
