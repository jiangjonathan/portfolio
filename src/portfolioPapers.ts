import type { WebGLRenderer } from "three";
import {
  Mesh,
  PlaneGeometry,
  MeshBasicMaterial,
  CanvasTexture,
  LinearFilter,
  Vector3,
  SRGBColorSpace,
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
];

export class PortfolioPapersManager {
  private papers: Map<string, PaperConfig> = new Map();
  private currentPaperId: string | null = null;
  private paperMeshes: Map<string, Mesh> = new Map();
  private whitepaperMesh: Mesh | null = null;
  private renderer: WebGLRenderer | null = null;

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
      this.positionMeshOnWhitepaper(existingMesh);
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

    // Create material with PDF texture
    const material = new MeshBasicMaterial({
      map: texture,
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

    // Position above whitepaper
    this.positionMeshOnWhitepaper(mesh);

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

  private positionMeshOnWhitepaper(mesh: Mesh): void {
    if (!this.whitepaperMesh) {
      return;
    }
    mesh.position.copy(this.whitepaperMesh.position);
    mesh.position.y += 0.05;
    mesh.rotation.set(-Math.PI / 2, 0, 0);
    mesh.scale.set(1, 1, 1);
  }

  private animatePaperToPosition(
    mesh: Mesh,
    targetPosition: Vector3,
    duration: number = 500,
  ): Promise<void> {
    return new Promise((resolve) => {
      const startPosition = mesh.position.clone();
      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        mesh.position.lerpVectors(startPosition, targetPosition, easeProgress);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  async nextPaper(): Promise<void> {
    const papersList = this.getPapers();
    if (papersList.length === 0) return;

    const currentIndex = papersList.findIndex(
      (p) => p.id === this.currentPaperId,
    );
    const nextIndex = (currentIndex + 1) % papersList.length;
    const nextPaper = papersList[nextIndex];

    // Animate current paper to the left
    const currentMesh = this.currentPaperId
      ? this.paperMeshes.get(this.currentPaperId)
      : null;
    if (currentMesh) {
      const moveAmount = 23.5;
      const targetPosition = currentMesh.position.clone();
      targetPosition.x -= moveAmount;
      targetPosition.y = currentMesh.position.y + 0.4;
      targetPosition.z = currentMesh.position.z;
      console.log(
        `[PortfolioPapers] Animating paper left by ${moveAmount} units from (${currentMesh.position.x.toFixed(
          2,
        )}, ${currentMesh.position.y.toFixed(
          2,
        )}, ${currentMesh.position.z.toFixed(2)}) to (${targetPosition.x.toFixed(
          2,
        )}, ${targetPosition.y.toFixed(2)}, ${targetPosition.z.toFixed(2)})`,
      );
      await this.animatePaperToPosition(currentMesh, targetPosition);
    }

    this.loadPaper(nextPaper.id);
  }

  async previousPaper(): Promise<void> {
    const papersList = this.getPapers();
    if (papersList.length === 0) return;

    const currentIndex = papersList.findIndex(
      (p) => p.id === this.currentPaperId,
    );
    const prevIndex =
      currentIndex <= 0 ? papersList.length - 1 : currentIndex - 1;
    const prevPaper = papersList[prevIndex];

    // Animate current paper to the left
    const currentMesh = this.currentPaperId
      ? this.paperMeshes.get(this.currentPaperId)
      : null;
    if (currentMesh) {
      const moveAmount = 0;
      const targetPosition = currentMesh.position.clone();
      targetPosition.x -= moveAmount;
      targetPosition.y = currentMesh.position.y + 0.4;
      targetPosition.z = currentMesh.position.z;
      console.log(
        `[PortfolioPapers] Animating paper left by ${moveAmount} units from (${currentMesh.position.x.toFixed(
          2,
        )}, ${currentMesh.position.y.toFixed(
          2,
        )}, ${currentMesh.position.z.toFixed(2)}) to (${targetPosition.x.toFixed(
          2,
        )}, ${targetPosition.y.toFixed(2)}, ${targetPosition.z.toFixed(2)})`,
      );
      await this.animatePaperToPosition(currentMesh, targetPosition);
    }

    this.loadPaper(prevPaper.id);
  }
}
