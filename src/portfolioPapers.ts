import type { WebGLRenderer } from "three";
import {
  Mesh,
  PlaneGeometry,
  MeshStandardMaterial,
  CanvasTexture,
  LinearFilter,
  Vector3,
  SRGBColorSpace,
  EdgesGeometry,
  LineSegments,
  LineBasicMaterial,
} from "three";
import * as pdfjsLib from "pdfjs-dist";

export type PaperType = "pdf" | "html" | "report";

export interface PaperConfig {
  id: string;
  name: string;
  type: PaperType;
  url: string;
  description?: string;
}

export const PAPERS: PaperConfig[] = [
  {
    id: "test-pdf",
    name: "Test PDF",
    type: "pdf",
    url: "/test.pdf",
    description: "Test PDF document",
  },
  {
    id: "hello-world",
    name: "Hello World",
    type: "html",
    url: "",
    description: "Simple hello world example",
  },
  {
    id: "placeholder-c",
    name: "Placeholder C",
    type: "html",
    url: "",
    description: "Placeholder C example",
  },
];

export class PortfolioPapersManager {
  private papers: Map<string, PaperConfig> = new Map();
  private currentPaperId: string | null = null;
  private paperMeshes: Map<string, Mesh> = new Map();
  private paperRotations: Map<string, number> = new Map(); // Random Z rotation per paper (in radians)
  private whitepaperMesh: Mesh | null = null;
  private renderer: WebGLRenderer | null = null;
  private isAnimating = false; // Prevent overlapping animations
  private readonly PAPER_STACK_HEIGHT_OFFSET = 0.02; // Height between stacked papers
  private readonly BASE_PAPER_HEIGHT = 0.05; // Base height above whitepaper
  private readonly LEFT_STACK_X_OFFSET = -23.5; // X offset for left stack
  private readonly MAX_RANDOM_ROTATION = (2.5 * Math.PI) / 180; // ±2.5 degrees in radians
  private leftStackPapers: string[] = []; // Papers that have been moved to left stack (in order moved)

  constructor(_container: HTMLElement, renderer?: WebGLRenderer) {
    this.renderer = renderer || null;

    // Configure PDF.js worker - use local worker file to avoid CORS issues
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    // Register all papers
    PAPERS.forEach((paper) => {
      this.papers.set(paper.id, paper);
    });
  }

  setWhitepaperMesh(mesh: Mesh): void {
    this.whitepaperMesh = mesh;
    console.log("[PortfolioPapers] Whitepaper mesh set:", mesh.name);
  }

  private getPaperStackIndex(paperId: string): number {
    // Returns the index in the paper order (0 = top of stack)
    // PAPERS array order defines the stack, first item is on top
    const index = PAPERS.findIndex((p) => p.id === paperId);
    return index >= 0 ? index : PAPERS.length;
  }

  private getStackHeightForPaper(paperId: string): number {
    const stackIndex = this.getPaperStackIndex(paperId);
    // Higher index = lower in stack = lower Y position
    // Top paper (index 0) gets highest Y
    const totalPapers = PAPERS.length;
    return (
      this.BASE_PAPER_HEIGHT +
      (totalPapers - 1 - stackIndex) * this.PAPER_STACK_HEIGHT_OFFSET
    );
  }

  private getLeftStackHeightForPaper(paperId: string): number {
    // Left stack grows upward as papers are added, significantly higher than right stack
    // to avoid z-fighting. Papers are added to the top, so earlier papers are lower.
    const BASE_LEFT_STACK_HEIGHT = 0.1; // Much higher base for left stack to avoid z-fighting
    const LEFT_STACK_HEIGHT_OFFSET = 0.04; // Larger spacing between papers on left stack

    const indexInLeftStack = this.leftStackPapers.indexOf(paperId);
    if (indexInLeftStack === -1) {
      // Not in left stack yet, will be added to top
      return (
        BASE_LEFT_STACK_HEIGHT +
        this.leftStackPapers.length * LEFT_STACK_HEIGHT_OFFSET
      );
    }
    // Height increases with position in left stack
    return BASE_LEFT_STACK_HEIGHT + indexInLeftStack * LEFT_STACK_HEIGHT_OFFSET;
  }

  async loadPaper(paperId: string): Promise<void> {
    const paper = this.papers.get(paperId);
    if (!paper) {
      console.error(`[PortfolioPapers] Paper not found: ${paperId}`);
      return;
    }

    console.log(`[PortfolioPapers] Loading paper: ${paper.name}`);
    this.currentPaperId = paperId;

    const existingMesh = this.paperMeshes.get(paperId);
    if (existingMesh) {
      console.log(
        `[PortfolioPapers] Reusing persisted mesh for: ${paper.name}`,
      );
      this.positionMeshOnWhitepaper(existingMesh, paperId);
      existingMesh.visible = true;
      return;
    }

    switch (paper.type) {
      case "pdf":
        await this.loadPDF(paper);
        break;
      case "html":
        await this.loadHTML(paper);
        break;
      case "report":
        await this.loadReport(paper);
        break;
    }
  }

  async loadAllPapers(): Promise<void> {
    console.log("[PortfolioPapers] Loading all papers");
    const papersList = this.getPapers();
    for (const paper of papersList) {
      await this.loadPaper(paper.id);
    }
    // Set the first paper as current
    if (papersList.length > 0) {
      this.currentPaperId = papersList[0].id;
    }
  }

  private async loadPDF(paper: PaperConfig): Promise<void> {
    console.log(`[PortfolioPapers] Loading PDF: ${paper.url}`);

    try {
      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument(paper.url);
      const pdf = await loadingTask.promise;

      console.log(`[PortfolioPapers] PDF loaded, ${pdf.numPages} pages`);

      // Get the first page
      const page = await pdf.getPage(1);

      // Set canvas size to match page dimensions with high scale for better quality
      const viewport = page.getViewport({ scale: 3.0 }); // Increased from 2.0 to 4.0
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", {
        alpha: false, // No transparency for better performance
        willReadFrequently: false,
      });

      if (!ctx) {
        console.error("[PortfolioPapers] Failed to get 2D context");
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Fill with white background first
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Render PDF page to canvas
      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      } as any;

      await page.render(renderContext).promise;
      console.log(
        `[PortfolioPapers] PDF rendered to canvas at ${canvas.width}x${canvas.height}`,
      );

      this.createPaperMesh(paper.id, canvas);
    } catch (error) {
      console.error(`[PortfolioPapers] Failed to load PDF:`, error);

      // Create error placeholder
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = 512;
      canvas.height = 512;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ff0000";
      ctx.font = "20px Arial";
      ctx.fillText("Failed to load PDF", 50, 50);
      ctx.fillText(paper.name, 50, 100);

      this.createPaperMesh(paper.id, canvas);
    }
  }

  private async loadHTML(paper: PaperConfig): Promise<void> {
    console.log(`[PortfolioPapers] Loading HTML: ${paper.url}`);

    // Create canvas for rendering HTML content
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    });
    if (!ctx) return;

    // High resolution canvas
    canvas.width = 2048;
    canvas.height = 2048 * 1.294; // Letter aspect ratio

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render hello world content
    if (paper.id === "hello-world") {
      ctx.fillStyle = "#000000";
      ctx.font = "bold 120px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Hello World!", canvas.width / 2, canvas.height / 2);
    } else if (paper.id === "placeholder-c") {
      ctx.fillStyle = "#000000";
      ctx.font = "bold 48px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        "placeholder under construction",
        canvas.width / 2,
        canvas.height / 2,
      );
    } else {
      // Generic HTML rendering
      ctx.fillStyle = "#000000";
      ctx.font = "40px Arial";
      ctx.fillText("HTML: " + paper.name, 100, 100);
    }

    this.createPaperMesh(paper.id, canvas);
  }

  private async loadReport(paper: PaperConfig): Promise<void> {
    console.log(`[PortfolioPapers] Loading Report: ${paper.url}`);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = 512;
    canvas.height = 512;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    ctx.font = "20px Arial";
    ctx.fillText("Report: " + paper.name, 50, 50);

    this.createPaperMesh(paper.id, canvas);
  }

  private createPaperMesh(paperId: string, canvas: HTMLCanvasElement): void {
    if (!this.whitepaperMesh) {
      console.error("[PortfolioPapers] Whitepaper mesh not set");
      return;
    }

    console.log(`[PortfolioPapers] Creating paper mesh for: ${paperId}`);
    console.log(
      `[PortfolioPapers] Canvas size: ${canvas.width}x${canvas.height}`,
    );
    console.log(
      `[PortfolioPapers] Whitepaper position:`,
      this.whitepaperMesh.position,
    );
    console.log(
      `[PortfolioPapers] Whitepaper rotation:`,
      this.whitepaperMesh.rotation,
    );
    console.log(
      `[PortfolioPapers] Whitepaper scale:`,
      this.whitepaperMesh.scale,
    );

    // Generate random rotation for this paper if not already set
    if (!this.paperRotations.has(paperId)) {
      const randomRotation =
        (Math.random() - 0.5) * 2 * this.MAX_RANDOM_ROTATION;
      this.paperRotations.set(paperId, randomRotation);
      console.log(
        `[PortfolioPapers] Generated random rotation for ${paperId}: ${(randomRotation * 180) / Math.PI}°`,
      );
    }

    // Remove existing paper mesh if any
    const existingMesh = this.paperMeshes.get(paperId);
    if (existingMesh && existingMesh.parent) {
      existingMesh.parent.remove(existingMesh);
    }

    // Create texture from canvas with optimal settings for text
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;

    // Set max anisotropy from renderer if available
    if (this.renderer) {
      const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
      texture.anisotropy = maxAnisotropy;
      console.log(`[PortfolioPapers] Using anisotropy: ${maxAnisotropy}`);
    } else {
      texture.anisotropy = 16;
    }

    texture.needsUpdate = true;

    // Create material with PDF texture - use MeshStandardMaterial for better lighting and depth
    const material = new MeshStandardMaterial({
      map: texture,
      roughness: 0.7, // Paper-like roughness
      metalness: 0, // Not metallic
      side: 2, // DoubleSide
    });

    // Use proper paper aspect ratio (8.5 x 11 inches = 1 x 1.294)
    const aspectRatio = canvas.height / canvas.width;
    const paperWidth = 21.6; // Base width in 3D units (increased for visibility)
    const paperHeight = paperWidth * aspectRatio; // Maintain PDF aspect ratio

    console.log(
      `[PortfolioPapers] Paper geometry size: ${paperWidth}x${paperHeight}, aspect ratio: ${aspectRatio}`,
    );

    const geometry = new PlaneGeometry(paperWidth, paperHeight);
    const mesh = new Mesh(geometry, material);

    // Add edge visualization for better paper distinction
    const edges = new EdgesGeometry(geometry);
    const line = new LineSegments(
      edges,
      new LineBasicMaterial({
        color: 0x888888, // Gray edge color
        linewidth: 1,
      }),
    );
    mesh.add(line);

    // Position above whitepaper with proper stack height
    this.positionMeshOnWhitepaper(mesh, paperId);

    mesh.name = `paper_${paperId}`;

    // Set render order so papers appear in front of whitepaper/backpaper but behind cover
    // whitepaper/backpaper = 200, our papers = 210, cover = 100 (but cover has higher z position)
    mesh.renderOrder = 210;

    // Add to scene
    if (this.whitepaperMesh.parent) {
      this.whitepaperMesh.parent.add(mesh);
      console.log(
        `[PortfolioPapers] Paper mesh added to parent:`,
        this.whitepaperMesh.parent,
      );
    }

    this.paperMeshes.set(paperId, mesh);
    console.log(
      `[PortfolioPapers] Paper mesh created and added to scene for: ${paperId}`,
    );
    console.log(`[PortfolioPapers] Final mesh position:`, mesh.position);
  }

  hidePaper(paperId: string): void {
    const mesh = this.paperMeshes.get(paperId);
    if (mesh) {
      mesh.visible = false;
    }
  }

  showPaper(paperId: string): void {
    const mesh = this.paperMeshes.get(paperId);
    if (mesh) {
      mesh.visible = true;
    }
  }

  hideAllPapers(): void {
    this.paperMeshes.forEach((mesh) => {
      mesh.visible = false;
    });
  }

  getCurrentPaperId(): string | null {
    return this.currentPaperId;
  }

  getPapers(): PaperConfig[] {
    return Array.from(this.papers.values());
  }

  getPaperMeshes(): Map<string, Mesh> {
    return this.paperMeshes;
  }

  private positionMeshOnWhitepaper(mesh: Mesh, paperId?: string): void {
    if (!this.whitepaperMesh) {
      return;
    }
    mesh.position.copy(this.whitepaperMesh.position);

    // Calculate stack height based on paper order
    if (paperId) {
      const stackHeight = this.getStackHeightForPaper(paperId);
      mesh.position.y += stackHeight;
      console.log(
        `[PortfolioPapers] Positioning ${paperId} at stack height: ${stackHeight}`,
      );
    } else {
      mesh.position.y += this.BASE_PAPER_HEIGHT;
    }

    // Apply rotation: -90 degrees on X-axis (to lay flat) + random Z rotation
    const randomRotation = paperId ? this.paperRotations.get(paperId) || 0 : 0;
    mesh.rotation.set(-Math.PI / 2, 0, randomRotation);
    mesh.scale.set(1, 1, 1);
  }

  private animatePaperTwoStage(
    mesh: Mesh,
    targetPosition: Vector3,
    duration: number = 500,
  ): Promise<void> {
    return new Promise((resolve) => {
      const startPosition = mesh.position.clone();
      const startRotationZ = mesh.rotation.z;
      const rotationLimit = this.MAX_RANDOM_ROTATION; // ±2 degrees hard limit
      // Random rotation within the limit
      const randomRotation = (Math.random() - 0.5) * 2 * rotationLimit;
      const targetRotationZ = randomRotation;
      const riseHeight = targetPosition.y; // Rise to target Y first
      const stageDuration = duration / 2; // Split time between stages

      // Stage 1: Rise in Y
      const stage1Start = performance.now();
      const stage1End = stage1Start + stageDuration;

      const animateStage1 = (currentTime: number) => {
        const elapsed = currentTime - stage1Start;
        const progress = Math.min(elapsed / stageDuration, 1);

        // Ease out cubic for smooth rise
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        mesh.position.y =
          startPosition.y + (riseHeight - startPosition.y) * easeProgress;

        if (currentTime < stage1End) {
          requestAnimationFrame(animateStage1);
        } else {
          // Stage 2: Move in X and rotate simultaneously
          const stage2Start = performance.now();
          const stage2End = stage2Start + stageDuration;
          const yAtPeak = mesh.position.y;

          const animateStage2 = (currentTime: number) => {
            const elapsed = currentTime - stage2Start;
            const progress = Math.min(elapsed / stageDuration, 1);

            // Ease out cubic for smooth horizontal movement
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            mesh.position.x =
              startPosition.x +
              (targetPosition.x - startPosition.x) * easeProgress;
            mesh.position.z =
              startPosition.z +
              (targetPosition.z - startPosition.z) * easeProgress;
            // Keep Y at peak height during X movement
            mesh.position.y = yAtPeak;
            // Rotate simultaneously with X movement
            mesh.rotation.z =
              startRotationZ +
              (targetRotationZ - startRotationZ) * easeProgress;

            if (currentTime < stage2End) {
              requestAnimationFrame(animateStage2);
            } else {
              mesh.position.copy(targetPosition);
              mesh.rotation.z = targetRotationZ;
              resolve();
            }
          };

          requestAnimationFrame(animateStage2);
        }
      };

      requestAnimationFrame(animateStage1);
    });
  }

  async nextPaper(): Promise<void> {
    // Prevent overlapping animations
    if (this.isAnimating) {
      console.log("[PortfolioPapers] Animation in progress, ignoring next");
      return;
    }

    const papersList = this.getPapers();
    if (papersList.length === 0) return;

    const currentIndex = papersList.findIndex(
      (p) => p.id === this.currentPaperId,
    );

    // Don't do anything if we're at the last paper
    if (currentIndex >= papersList.length - 1) {
      console.log("[PortfolioPapers] Already at last paper, next does nothing");
      return;
    }

    this.isAnimating = true;

    try {
      const nextIndex = currentIndex + 1;
      const nextPaper = papersList[nextIndex];

      // Animate current paper (top of right stack) to left stack top
      const currentMesh = this.currentPaperId
        ? this.paperMeshes.get(this.currentPaperId)
        : null;

      if (currentMesh && this.whitepaperMesh && this.currentPaperId) {
        // Calculate proper left stack height
        const leftStackHeight = this.getLeftStackHeightForPaper(
          this.currentPaperId,
        );
        const targetPosition = this.whitepaperMesh.position.clone();
        targetPosition.x += this.LEFT_STACK_X_OFFSET;
        targetPosition.y += leftStackHeight;
        targetPosition.z = this.whitepaperMesh.position.z;

        console.log(
          `[PortfolioPapers] Moving ${this.currentPaperId} to left stack at Y=${targetPosition.y.toFixed(2)}`,
        );

        // Add to left stack tracking
        this.leftStackPapers.push(this.currentPaperId);

        // Use two-stage animation: rise first, then move horizontally
        await this.animatePaperTwoStage(currentMesh, targetPosition);
      }

      // Update current paper
      this.currentPaperId = nextPaper.id;
    } finally {
      this.isAnimating = false;
    }
  }

  async resetPapersToOriginalStack(): Promise<void> {
    if (!this.whitepaperMesh || this.leftStackPapers.length === 0) {
      return;
    }

    console.log(
      "[PortfolioPapers] Resetting papers to original stack with cascade",
    );

    // Animate papers from left stack back to right stack in reverse order (top to bottom)
    // This creates a cascading effect
    const papersToReset = [...this.leftStackPapers].reverse();
    const CASCADE_DELAY = 150; // milliseconds between each paper animation
    const animationPromises: Promise<void>[] = [];

    for (let i = 0; i < papersToReset.length; i++) {
      const paperId = papersToReset[i];
      const mesh = this.paperMeshes.get(paperId);

      if (mesh) {
        // Calculate original position
        const targetPosition = this.whitepaperMesh.position.clone();
        const stackHeight = this.getStackHeightForPaper(paperId);
        targetPosition.y += stackHeight;
        targetPosition.x = this.whitepaperMesh.position.x;
        targetPosition.z = this.whitepaperMesh.position.z;

        console.log(
          `[PortfolioPapers] Cascading ${paperId} back to original position`,
        );

        // Start the two-stage animation and retain the promise so we can wait for completion after the cascade.
        animationPromises.push(
          this.animatePaperTwoStage(mesh, targetPosition, 400),
        );

        // Wait before starting next animation
        if (i < papersToReset.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, CASCADE_DELAY));
        }
      }
    }

    if (animationPromises.length > 0) {
      await Promise.all(animationPromises);
    }

    // Clear the left stack tracking
    this.leftStackPapers = [];

    // Reset to first paper
    const papersList = this.getPapers();
    if (papersList.length > 0) {
      this.currentPaperId = papersList[0].id;
    }
  }

  private animatePaperXThenY(
    mesh: Mesh,
    targetPosition: Vector3,
    duration: number = 500,
  ): Promise<void> {
    return new Promise((resolve) => {
      const startPosition = mesh.position.clone();
      const startRotationZ = mesh.rotation.z;
      const rotationLimit = this.MAX_RANDOM_ROTATION; // ±2 degrees hard limit
      // Random rotation within the limit
      const randomRotation = (Math.random() - 0.5) * 2 * rotationLimit;
      const targetRotationZ = randomRotation;
      const stageDuration = duration / 2; // Split time between stages

      // Stage 1: Move in X
      const stage1Start = performance.now();
      const stage1End = stage1Start + stageDuration;

      const animateStage1 = (currentTime: number) => {
        const elapsed = currentTime - stage1Start;
        const progress = Math.min(elapsed / stageDuration, 1);

        // Ease out cubic for smooth movement
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        mesh.position.x =
          startPosition.x + (targetPosition.x - startPosition.x) * easeProgress;
        mesh.position.z =
          startPosition.z + (targetPosition.z - startPosition.z) * easeProgress;
        // Rotate simultaneously with X movement
        mesh.rotation.z =
          startRotationZ + (targetRotationZ - startRotationZ) * easeProgress;

        if (currentTime < stage1End) {
          requestAnimationFrame(animateStage1);
        } else {
          // Stage 2: Move in Y (descend)
          const stage2Start = performance.now();
          const stage2End = stage2Start + stageDuration;
          const xAtEnd = mesh.position.x;
          const zAtEnd = mesh.position.z;
          const rotationAtEnd = mesh.rotation.z;

          const animateStage2 = (currentTime: number) => {
            const elapsed = currentTime - stage2Start;
            const progress = Math.min(elapsed / stageDuration, 1);

            // Ease out cubic for smooth descent
            const easeProgress = 1 - Math.pow(1 - progress, 3);

            // Keep X/Z steady during Y movement
            mesh.position.x = xAtEnd;
            mesh.position.z = zAtEnd;
            mesh.position.y =
              startPosition.y +
              (targetPosition.y - startPosition.y) * easeProgress;
            // Keep rotation steady during stage 2
            mesh.rotation.z = rotationAtEnd;

            if (currentTime < stage2End) {
              requestAnimationFrame(animateStage2);
            } else {
              mesh.position.copy(targetPosition);
              mesh.rotation.z = targetRotationZ;
              resolve();
            }
          };

          requestAnimationFrame(animateStage2);
        }
      };

      requestAnimationFrame(animateStage1);
    });
  }

  async previousPaper(): Promise<void> {
    // Prevent overlapping animations
    if (this.isAnimating) {
      console.log("[PortfolioPapers] Animation in progress, ignoring previous");
      return;
    }

    const papersList = this.getPapers();
    if (papersList.length === 0) return;

    const currentIndex = papersList.findIndex(
      (p) => p.id === this.currentPaperId,
    );

    // Don't do anything if we're at the first paper
    if (currentIndex <= 0) {
      console.log(
        "[PortfolioPapers] Already at first paper, previous does nothing",
      );
      return;
    }

    this.isAnimating = true;

    try {
      const prevIndex = currentIndex - 1;
      const prevPaper = papersList[prevIndex];

      // Animate previous paper (top of left stack) back to right stack top
      const prevMesh = this.paperMeshes.get(prevPaper.id);

      if (prevMesh && this.whitepaperMesh) {
        // Calculate where it should be on the right stack (back to its original position)
        const targetPosition = this.whitepaperMesh.position.clone();
        const stackHeight = this.getStackHeightForPaper(prevPaper.id);
        targetPosition.y += stackHeight;
        targetPosition.x = this.whitepaperMesh.position.x;
        targetPosition.z = this.whitepaperMesh.position.z;

        console.log(
          `[PortfolioPapers] Moving ${prevPaper.id} back to right stack at Y=${targetPosition.y.toFixed(2)}`,
        );

        // Remove from left stack tracking
        const leftStackIndex = this.leftStackPapers.indexOf(prevPaper.id);
        if (leftStackIndex !== -1) {
          this.leftStackPapers.splice(leftStackIndex, 1);
        }

        // Use two-stage animation: move X first, then Y
        await this.animatePaperXThenY(prevMesh, targetPosition);
      }

      // Update current paper
      this.currentPaperId = prevPaper.id;
    } finally {
      this.isAnimating = false;
    }
  }
}
