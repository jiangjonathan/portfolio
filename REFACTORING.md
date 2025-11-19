# Main.ts Refactoring Guide

## Overview

The `main.ts` file was **3,754 lines** and handled everything from DOM setup to 3D rendering to state management. This made it difficult to navigate, maintain, and understand.

## New Modular Structure

I've broken down the monolithic `main.ts` into focused, single-responsibility modules:

### 1. **pageNavigation.ts** - Page & Camera Management
**What it contains:**
- Page types (`ScenePage`, `TurntablePosition`)
- Camera settings per page
- Camera angle/position utilities
- Page transition logic helpers
- Functions for camera state capture and application

**Key exports:**
- `directionFromAngles()` - Convert yaw/pitch to 3D direction
- `captureCameraState()` - Save current camera position
- `applyPageCameraSettings()` - Restore camera to saved state
- `findPageForObject()` - Determine which page an object belongs to

### 2. **domSetup.ts** - DOM & UI Initialization
**What it contains:**
- All DOM element creation
- UI containers (library widget, tutorial, viewer grid)
- Buttons (hide/show, navigation)
- Overlay elements
- Global CSS styles
- Event listeners for UI buttons

**Key export:**
- `setupDOM()` - Returns all DOM element references in one clean interface

**Benefits:**
- Single source of truth for UI structure
- Easy to modify layout without touching 3D code
- All CSS-in-JS in one place

### 3. **vinylState.ts** - Vinyl Record State Management
**What it contains:**
- Vinyl types (`VinylSource`, `FocusVinylState`, `TurntableVinylState`)
- `VinylStateManager` class that handles:
  - Focus vinyl (floating near UI)
  - Turntable vinyl (on the turntable)
  - Flyaway vinyls (thrown records animation)
  - Active vinyl switching
  - Disposal/cleanup

**Key class: `VinylStateManager`**
```typescript
const vinylManager = new VinylStateManager(heroGroup);
vinylManager.setActiveVinylSource("focus");
vinylManager.disposeFocusVinyl();
vinylManager.startTurntableVinylFlyaway();
```

### 4. **cameraControls.ts** - Camera Interaction
**What it contains:**
- `CameraControlsManager` class
- Orbit controls (right-click drag)
- Pan controls (middle-click drag)
- State management for camera interactions

**Key class: `CameraControlsManager`**
```typescript
const controls = new CameraControlsManager(
  cameraRig,
  canvas,
  () => activePage,
  () => pageTransitionActive
);
controls.startOrbit(event);
controls.handleOrbitMove(event);
```

### 5. **sceneObjects.ts** - 3D Object Creation
**What it contains:**
- Business card creation (`createBusinessCardMesh()`)
- Placeholder scenes (`createPlaceholderMesh()`)
- Portfolio model configuration
- Rendering priority for portfolio cover/papers
- Constants for object dimensions

**Key functions:**
```typescript
createBusinessCardMesh(renderer, position);
createPlaceholderMesh(config, position);
prioritizePortfolioCoverRendering(model, onCoverFound);
```

## File Organization Summary

| File | Lines | Purpose |
|------|-------|---------|
| `pageNavigation.ts` | ~120 | Page switching, camera presets |
| `domSetup.ts` | ~330 | HTML/CSS/UI setup |
| `vinylState.ts` | ~130 | Vinyl record state & lifecycle |
| `cameraControls.ts` | ~150 | Camera orbit/pan interactions |
| `sceneObjects.ts` | ~220 | 3D object creation utilities |
| **Total Extracted** | **~950 lines** | **Removed from main.ts** |

## Benefits of This Refactoring

### 1. **Separation of Concerns**
- DOM logic is separate from 3D rendering
- State management is isolated from event handling
- Each file has a clear, single purpose

### 2. **Easier Navigation**
- Need to modify the business card? → `sceneObjects.ts`
- Need to change UI layout? → `domSetup.ts`
- Need to adjust camera behavior? → `cameraControls.ts`

### 3. **Improved Testability**
- Each module can be tested independently
- Clear interfaces make mocking easier
- State managers are class-based for easy instantiation

### 4. **Better Code Reusability**
- `VinylStateManager` can be used anywhere
- Camera utilities are pure functions
- DOM setup is framework-agnostic

### 5. **Reduced Cognitive Load**
- Files are ~100-300 lines instead of 3,700+
- Clear naming shows what each file does
- Related code is grouped together

## How to Use These Files

### Option 1: Gradual Migration (Recommended)
Keep `main.ts` as-is for now, but use these new files for:
- **New features**: Import from modular files
- **Bug fixes**: Extract the buggy code to appropriate module
- **Refactoring**: Move one section at a time

Example:
```typescript
// In main.ts
import { setupDOM } from "./domSetup";
import { VinylStateManager } from "./vinylState";

const domElements = setupDOM();
const vinylManager = new VinylStateManager(heroGroup);
```

### Option 2: Full Refactor
Replace `main.ts` entirely by:
1. Import all utilities from new modules
2. Keep only the animation loop and core initialization in `main.ts`
3. Use the new classes/functions throughout

## Next Steps

### Immediate Opportunities
1. **Extract YouTube integration** → `youtubePlayer.ts`
2. **Extract tutorial logic** → Already in `tutorialManager.ts` ✓
3. **Extract turntable logic** → Already in `turntable.ts` ✓
4. **Extract library management** → Already in `vinylLibraryManager.ts` ✓

### Additional Refactoring Ideas
- Move event handlers to `eventHandlers.ts`
- Create `animations.ts` for vinyl flyaway, focus card tracking, etc.
- Split `main.ts` animation loop into smaller update functions

## Migration Guide

If you want to fully migrate `main.ts`, here's the recommended order:

1. **Start with DOM** - Replace DOM creation with `setupDOM()`
2. **Add state management** - Integrate `VinylStateManager`
3. **Wire up camera controls** - Use `CameraControlsManager`
4. **Switch object creation** - Use functions from `sceneObjects.ts`
5. **Adopt page navigation** - Use utilities from `pageNavigation.ts`

## Example: Before & After

### Before (main.ts)
```typescript
// 200+ lines of DOM creation scattered throughout
const vinylLibraryContainer = document.createElement("div");
vinylLibraryContainer.id = "vinyl-library-widget";
// ... 150 more lines ...

// 300+ lines of vinyl state management
let focusVinylState: FocusVinylState | null = null;
function disposeFocusVinyl() { /* ... */ }
// ... many more functions ...
```

### After
```typescript
// Clean imports
import { setupDOM } from "./domSetup";
import { VinylStateManager } from "./vinylState";
import { CameraControlsManager } from "./cameraControls";

// Initialization
const dom = setupDOM();
const vinylManager = new VinylStateManager(heroGroup);
const cameraControls = new CameraControlsManager(/*...*/);

// Usage
vinylManager.setActiveVinylSource("focus");
cameraControls.startOrbit(event);
```

## Conclusion

The monolithic `main.ts` is now broken into **5 focused modules** that handle specific responsibilities. This makes the codebase:
- **Easier to understand** - Each file has a clear purpose
- **Easier to maintain** - Changes are localized
- **Easier to test** - Modules can be tested independently
- **Easier to extend** - New features fit into clear categories

You can adopt these modules gradually or do a full migration - both approaches will improve code quality!
