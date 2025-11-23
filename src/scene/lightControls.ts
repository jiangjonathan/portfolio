import GUI from "lil-gui";
import { AmbientLight, DirectionalLight } from "three";

export interface LightControls {
  ambientLight: AmbientLight;
  keyLight: DirectionalLight;
  fillLight: DirectionalLight;
}

export function createLightControlPanel(lights: LightControls): GUI {
  const gui = new GUI({ title: "Light Controls" });
  gui.close(); // Start closed to not clutter the UI

  // Ambient Light
  const ambientFolder = gui.addFolder("Ambient Light");
  ambientFolder.add({ enabled: true }, "enabled").onChange((value: boolean) => {
    lights.ambientLight.visible = value;
  });
  ambientFolder
    .add(lights.ambientLight, "intensity", 0, 2, 0.01)
    .name("Intensity");
  ambientFolder
    .addColor({ color: lights.ambientLight.color.getHex() }, "color")
    .onChange((value: number) => {
      lights.ambientLight.color.setHex(value);
    });

  // Key Light (Main Directional)
  const keyFolder = gui.addFolder("Key Light");
  keyFolder.add({ enabled: true }, "enabled").onChange((value: boolean) => {
    lights.keyLight.visible = value;
  });
  keyFolder.add(lights.keyLight, "intensity", 0, 3, 0.01).name("Intensity");
  keyFolder
    .addColor({ color: lights.keyLight.color.getHex() }, "color")
    .onChange((value: number) => {
      lights.keyLight.color.setHex(value);
    });

  const keyPosFolder = keyFolder.addFolder("Position");
  keyPosFolder.add(lights.keyLight.position, "x", -100, 100, 0.1);
  keyPosFolder.add(lights.keyLight.position, "y", 0, 100, 0.1);
  keyPosFolder.add(lights.keyLight.position, "z", -100, 100, 0.1);

  const keyShadowFolder = keyFolder.addFolder("Shadows");
  keyShadowFolder.add(lights.keyLight, "castShadow").name("Cast Shadow");
  keyShadowFolder.add(lights.keyLight.shadow, "bias", -0.01, 0.01, 0.0001);
  keyShadowFolder.add(lights.keyLight.shadow, "normalBias", 0, 0.1, 0.001);
  keyShadowFolder
    .add(lights.keyLight.shadow.camera, "left", -100, 0, 1)
    .name("Frustum Left")
    .onChange(() => {
      lights.keyLight.shadow.camera.updateProjectionMatrix();
    });
  keyShadowFolder
    .add(lights.keyLight.shadow.camera, "right", 0, 100, 1)
    .name("Frustum Right")
    .onChange(() => {
      lights.keyLight.shadow.camera.updateProjectionMatrix();
    });
  keyShadowFolder
    .add(lights.keyLight.shadow.camera, "top", 0, 100, 1)
    .name("Frustum Top")
    .onChange(() => {
      lights.keyLight.shadow.camera.updateProjectionMatrix();
    });
  keyShadowFolder
    .add(lights.keyLight.shadow.camera, "bottom", -100, 0, 1)
    .name("Frustum Bottom")
    .onChange(() => {
      lights.keyLight.shadow.camera.updateProjectionMatrix();
    });

  // Fill Light
  const fillFolder = gui.addFolder("Fill Light");
  fillFolder.add({ enabled: true }, "enabled").onChange((value: boolean) => {
    lights.fillLight.visible = value;
  });
  fillFolder.add(lights.fillLight, "intensity", 0, 2, 0.01).name("Intensity");
  fillFolder
    .addColor({ color: lights.fillLight.color.getHex() }, "color")
    .onChange((value: number) => {
      lights.fillLight.color.setHex(value);
    });

  const fillPosFolder = fillFolder.addFolder("Position");
  fillPosFolder.add(lights.fillLight.position, "x", -20, 20, 0.1);
  fillPosFolder.add(lights.fillLight.position, "y", 0, 20, 0.1);
  fillPosFolder.add(lights.fillLight.position, "z", -20, 20, 0.1);
  fillFolder.add(lights.fillLight, "castShadow").name("Cast Shadow");

  // Export current settings button
  const exportSettings = {
    export: () => {
      const settings = {
        ambient: {
          intensity: lights.ambientLight.intensity,
          color: "#" + lights.ambientLight.color.getHexString(),
        },
        key: {
          intensity: lights.keyLight.intensity,
          color: "#" + lights.keyLight.color.getHexString(),
          position: lights.keyLight.position.toArray(),
          castShadow: lights.keyLight.castShadow,
          shadowBias: lights.keyLight.shadow.bias,
          shadowNormalBias: lights.keyLight.shadow.normalBias,
        },
        fill: {
          intensity: lights.fillLight.intensity,
          color: "#" + lights.fillLight.color.getHexString(),
          position: lights.fillLight.position.toArray(),
          castShadow: lights.fillLight.castShadow,
        },
      };
      console.log("Current Light Settings:", JSON.stringify(settings, null, 2));
      navigator.clipboard.writeText(JSON.stringify(settings, null, 2));
      alert("Light settings copied to clipboard!");
    },
  };
  gui.add(exportSettings, "export").name("📋 Export Settings");

  return gui;
}
