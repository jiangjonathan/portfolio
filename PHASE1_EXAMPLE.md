# Phase 1 Migration: Concrete Example

This file shows **exact** changes you can make to `main.ts` right now. These are **safe** - they just replace inline code with equivalent function calls.

## Step 1: Add Imports

At the top of `main.ts`, after the existing imports, add:

```typescript
// NEW MODULE IMPORTS - Add after existing imports
import {
  directionFromAngles,
  lerpAngleDegrees,
  cloneCameraSettings,
  applyPageCameraSettings,
  captureCameraState,
  findPageForObject,
} from "./pageNavigation";

import {
  createBusinessCardMesh,
  createPlaceholderMesh,
  prioritizePortfolioCoverRendering,
  BUSINESS_CARD_PAGE,
  PLACEHOLDER_SCENES,
  PORTFOLIO_CAMERA_TARGET_OFFSET,
} from "./sceneObjects";

import {
  getFocusVinylScale,
  applyFocusVinylScale,
  cloneLabelVisuals,
  resetVinylAnimationState,
  updateDragPlaneDepth,
  getSelectionCoverUrl,
} from "./vinylHelpers";
```

## Step 2: Replace Business Card Creation

**Find this code** (around line 500-650):

```typescript
const createBusinessCardTexture = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  // ... ~50 lines ...
  return texture;
};

const createBusinessCardScene = () => {
  const geometry = new BoxGeometry(
    BUSINESS_CARD_WIDTH,
    BUSINESS_CARD_HEIGHT,
    BUSINESS_CARD_THICKNESS,
  );
  // ... ~50 lines ...
  heroGroup.add(cardMesh);
  registerHomePageTarget(cardMesh, BUSINESS_CARD_PAGE);
  pageSceneRoots[BUSINESS_CARD_PAGE] = cardMesh;
  pageCameraSettings.business_card.target.copy(circlePos);
};
```

**Replace with:**

```typescript
const createBusinessCardScene = () => {
  const circlePos = getHeroCirclePosition(BUSINESS_CARD_PAGE);
  const cardMesh = createBusinessCardMesh(renderer, circlePos);
  heroGroup.add(cardMesh);
  registerHomePageTarget(cardMesh, BUSINESS_CARD_PAGE);
  pageSceneRoots[BUSINESS_CARD_PAGE] = cardMesh;
  pageCameraSettings.business_card.target.copy(circlePos);
};
```

**Delete** the `createBusinessCardTexture` function entirely (it's now in `sceneObjects.ts`)

## Step 3: Replace Placeholder Scene Creation

**Find this code** (around line 450-500):

```typescript
const createPlaceholderScenes = () => {
  PLACEHOLDER_SCENES.forEach((config) => {
    const geometry =
      config.geometry === "box"
        ? new BoxGeometry(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)
        : new SphereGeometry(PLACEHOLDER_SIZE / 2, 32, 16);
    const material = new MeshStandardMaterial({ color: config.color });
    const mesh = new Mesh(geometry, material);
    const circlePos = getHeroCirclePosition(config.id);
    mesh.position.copy(circlePos);
    mesh.name = config.id;
    heroGroup.add(mesh);
    placeholderMeshes[config.id] = mesh;
    registerHomePageTarget(mesh, config.id);
    pageSceneRoots[config.id] = mesh;
    pageCameraSettings[config.id].target.copy(circlePos);
  });
};
```

**Replace with:**

```typescript
const createPlaceholderScenes = () => {
  PLACEHOLDER_SCENES.forEach((config) => {
    const circlePos = getHeroCirclePosition(config.id);
    const mesh = createPlaceholderMesh(config, circlePos);
    heroGroup.add(mesh);
    placeholderMeshes[config.id] = mesh;
    registerHomePageTarget(mesh, config.id);
    pageSceneRoots[config.id] = mesh;
    pageCameraSettings[config.id].target.copy(circlePos);
  });
};
```

## Step 4: Simplify directionFromAngles Usage

**Find all instances** of this pattern (there are ~5):

```typescript
const yawRad = yawDeg * DEG2RAD;
const pitchRad = pitchDeg * DEG2RAD;
const cosPitch = Math.cos(pitchRad);
tempDirection.set(
  Math.sin(yawRad) * cosPitch,
  Math.sin(pitchRad),
  Math.cos(yawRad) * cosPitch,
);
tempDirection.normalize();
```

**Replace with:**

```typescript
directionFromAngles(yawDeg, pitchDeg, tempDirection);
```

**Specific locations to change:**

### Location 1: `applyCameraStyleInputs()` function
```typescript
// Before:
const yawRad = yawDeg * DEG2RAD;
const pitchRad = pitchDeg * DEG2RAD;
const cosPitch = Math.cos(pitchRad);
tempDirection.set(
  Math.sin(yawRad) * cosPitch,
  Math.sin(pitchRad),
  Math.cos(yawRad) * cosPitch,
);
tempDirection.normalize();
cameraRig.setViewDirection(tempDirection);

// After:
directionFromAngles(yawDeg, pitchDeg, tempDirection);
cameraRig.setViewDirection(tempDirection);
```

### Location 2: `applyPageCameraSettings()` function  
```typescript
// Before:
cameraRig.setViewDirection(
  directionFromAngles(settings.yaw, settings.pitch),
  false,
);

// After: (Already good! Just check it matches your version)
cameraRig.setViewDirection(
  directionFromAngles(settings.yaw, settings.pitch),
  false,
);
```

## Step 5: Replace cloneLabelVisuals

**Find:**
```typescript
const cloneLabelVisuals = (visuals: LabelVisualOptions): LabelVisualOptions =>
  JSON.parse(JSON.stringify(visuals));
```

**Delete it** (it's now imported from `vinylHelpers.ts`)

## Step 6: Replace getFocusVinylScale calls

**Find this function:**
```typescript
const getFocusVinylScale = () =>
  FOCUS_VINYL_BASE_SCALE / cameraRig.getZoomFactor();

const applyFocusVinylScale = () => {
  if (focusVinylState) {
    focusVinylState.model.scale.setScalar(getFocusVinylScale());
  }
};
```

**Delete both functions** (imported from `vinylHelpers.ts`)

**Find all calls** to `applyFocusVinylScale()` - they'll work the same

## Step 7: Replace portfolio rendering priority

**Find:**
```typescript
const prioritizePortfolioCoverRendering = (model: Object3D) => {
  model.traverse((child) => {
    // ... ~40 lines ...
  });
};
```

**Delete this function** (imported from `sceneObjects.ts`)

**The call to this function stays the same:**
```typescript
prioritizePortfolioCoverRendering(portfolioModel);
```

But now you can also pass a callback:
```typescript
prioritizePortfolioCoverRendering(portfolioModel, (mesh) => {
  portfolioCoverMesh = mesh;
  portfolioCoverOriginalRotation = mesh.rotation.z;
});
```

## Step 8: Replace getSelectionCoverUrl

**Find:**
```typescript
const getSelectionCoverUrl = (selection: VinylSelectionDetail) =>
  selection.imageUrl ||
  `https://img.youtube.com/vi/${selection.videoId}/maxresdefault.jpg`;
```

**Delete it** (imported from `vinylHelpers.ts`)

## Step 9: Test!

```bash
npm run dev
```

### What to test:
1. ✅ App loads without errors
2. ✅ Business card displays correctly
3. ✅ Placeholder scenes appear
4. ✅ Camera controls work (orbit, pan, zoom)
5. ✅ Vinyl loading and dragging works
6. ✅ Portfolio page loads correctly
7. ✅ Turntable works

## Verification Checklist

Before considering Phase 1 complete:

- [ ] Build succeeds: `npm run build`
- [ ] Dev server runs: `npm run dev`
- [ ] No console errors
- [ ] All pages accessible (home, turntable, portfolio, business card)
- [ ] Camera orbits smoothly
- [ ] Vinyl can be loaded and placed on turntable
- [ ] Visual appearance unchanged
- [ ] Performance unchanged (check FPS)

## Lines Saved

After Phase 1:
- **Business card**: ~50 lines removed
- **Placeholders**: ~10 lines simplified  
- **Camera math**: ~30 lines removed (5 instances × 6 lines)
- **Utilities**: ~20 lines removed
- **Total: ~110 lines cleaner!**

## Next Steps

Once Phase 1 is working:
1. Commit your changes: `git add . && git commit -m "Phase 1: Extract helpers to modules"`
2. Consider Phase 2: State managers (see `MIGRATION_GUIDE.md`)
3. Or stop here - you've already improved the codebase!

## Rollback if Needed

If something breaks:
```bash
cp src/main.ts.backup src/main.ts
```

Your original code is safe!
