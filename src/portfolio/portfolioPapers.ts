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

type PendingScrollState = {
  fullCanvas: HTMLCanvasElement;
  displayCanvas: HTMLCanvasElement;
  scrollOffset: number;
  maxScroll: number;
  links?: LinkRegion[];
};

type ScrollablePaperState = PendingScrollState & {
  texture: CanvasTexture;
  links?: LinkRegion[];
  linkOverlays?: HTMLAnchorElement[];
};

type LinkRegion = {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const PAPERS: PaperConfig[] = [
  {
    id: "resume-pdf",
    name: "Resume PDF",
    type: "pdf",
    url: "/JonathanJiangResume.pdf",
    description: "Resume PDF",
  },
  {
    id: "portfolio",
    name: "Portfolio Overview",
    type: "html",
    url: "/papers/portfolio.md",
    description: "Portfolio markdown rendered onto canvas",
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
  private readonly PAPER_STACK_HEIGHT_OFFSET = 0.04; // Height between stacked papers
  private readonly BASE_PAPER_HEIGHT = 0.05; // Base height above whitepaper
  private readonly LEFT_STACK_X_OFFSET = -23.5; // X offset for left stack
  private readonly MAX_RANDOM_ROTATION = (2.5 * Math.PI) / 180; // ±2.5 degrees in radians
  private leftStackPapers: string[] = []; // Papers that have been moved to left stack (in order moved)
  private scrollablePaperStates: Map<string, ScrollablePaperState> = new Map();
  private hoveredScrollablePaperId: string | null = null;
  private pendingRedraws: Set<string> = new Set(); // Batch scroll redraws
  private redrawAnimationFrameId: number | null = null;

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
    const BASE_LEFT_STACK_HEIGHT = 0.2; // Much higher base for left stack to avoid z-fighting
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

    if (paper.id === "portfolio") {
      const markdownContent = await this.fetchMarkdownContent(paper);
      const scrollState = this.buildScrollableMarkdownPaper(
        markdownContent,
        paper.url,
        paper.id,
      );
      if (scrollState) {
        this.createPaperMesh(paper.id, scrollState.displayCanvas, scrollState);
        return;
      }
    }

    // Fallback rendering for other HTML papers
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", {
      alpha: false,
      willReadFrequently: false,
    });
    if (!ctx) return;

    canvas.width = 2048;
    canvas.height = Math.floor(2048 * 1.294);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (paper.id === "placeholder-c") {
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
      ctx.fillStyle = "#000000";
      ctx.font = "40px Arial";
      ctx.fillText("HTML: " + paper.name, 100, 100);
    }

    this.createPaperMesh(paper.id, canvas);
  }

  private async fetchMarkdownContent(paper: PaperConfig): Promise<string> {
    if (!paper.url) {
      return "Content unavailable: markdown URL missing.";
    }

    try {
      const response = await fetch(paper.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch markdown: ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      console.error(
        "[PortfolioPapers] Failed to fetch markdown content:",
        error,
      );
      return "Content unavailable: unable to load markdown file.";
    }
  }

  private buildScrollableMarkdownPaper(
    markdown: string,
    baseUrl: string,
    paperId: string,
  ): PendingScrollState | null {
    const VIEW_WIDTH = 2048;
    const VIEW_HEIGHT = Math.floor(VIEW_WIDTH * 1.294);
    const displayCanvas = document.createElement("canvas");
    const fullCanvas = document.createElement("canvas");
    displayCanvas.width = VIEW_WIDTH;
    displayCanvas.height = VIEW_HEIGHT;
    fullCanvas.width = VIEW_WIDTH;

    const measuringCtx = displayCanvas.getContext("2d");
    if (!measuringCtx) return null;

    const marginX = Math.floor(VIEW_WIDTH * 0.08);
    const marginTop = Math.floor(VIEW_HEIGHT * 0.08);
    const marginBottom = Math.floor(VIEW_HEIGHT * 0.12);
    const usableWidth = VIEW_WIDTH - marginX * 2;
    const lines = markdown.split(/\r?\n/);

    type RenderSegment = {
      text: string;
      x: number;
      y: number;
      font: string;
      color: string;
      isBold?: boolean;
      isItalic?: boolean;
      isLink?: boolean;
      linkUrl?: string;
    };

    type RenderImage = {
      img: HTMLImageElement;
      x: number;
      y: number;
      width: number;
      height: number;
    };

    const segments: RenderSegment[] = [];
    const images: RenderImage[] = [];
    const rules: number[] = [];
    const links: LinkRegion[] = [];
    const fontFamily =
      '"Inter", "Helvetica Neue", "Segoe UI", Arial, sans-serif';
    const headingColor = "#0d0f12";
    const bodyColor = "#1f2328";

    // Process inline markdown formatting (bold, italic, links)
    const parseInlineMarkdown = (
      text: string,
    ): Array<{
      text: string;
      bold: boolean;
      italic: boolean;
      isLink?: boolean;
      linkUrl?: string;
    }> => {
      const parts: Array<{
        text: string;
        bold: boolean;
        italic: boolean;
        isLink?: boolean;
        linkUrl?: string;
      }> = [];

      // First pass: extract links [text](url)
      const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
      let lastIndex = 0;
      let match;

      while ((match = linkRegex.exec(text)) !== null) {
        const beforeLink = text.substring(lastIndex, match.index);
        if (beforeLink) {
          // Process the text before the link for bold/italic
          const beforeParts = parseFormattingOnly(beforeLink);
          parts.push(...beforeParts);
        }

        // Add the link
        const linkText = match[1];
        const linkUrl = match[2];
        const linkParts = parseFormattingOnly(linkText);
        linkParts.forEach((part) => {
          parts.push({ ...part, isLink: true, linkUrl });
        });

        lastIndex = match.index + match[0].length;
      }

      // Process remaining text after last link
      const remaining = text.substring(lastIndex);
      if (remaining) {
        const remainingParts = parseFormattingOnly(remaining);
        parts.push(...remainingParts);
      }

      return parts.length > 0 ? parts : [{ text, bold: false, italic: false }];
    };

    // Helper to parse only bold/italic formatting
    const parseFormattingOnly = (
      text: string,
    ): Array<{ text: string; bold: boolean; italic: boolean }> => {
      const parts: Array<{ text: string; bold: boolean; italic: boolean }> = [];

      // Match **bold**, *italic*, or plain text
      const regex = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|([^*]+)/g;
      let match;

      while ((match = regex.exec(text)) !== null) {
        if (match[2]) {
          // Bold text (**text**)
          parts.push({ text: match[2], bold: true, italic: false });
        } else if (match[4]) {
          // Italic text (*text*)
          parts.push({ text: match[4], bold: false, italic: true });
        } else if (match[5]) {
          // Plain text
          parts.push({ text: match[5], bold: false, italic: false });
        }
      }

      return parts.length > 0 ? parts : [{ text, bold: false, italic: false }];
    };

    // Reusable function to parse all markdown and populate segments/links/rules
    const parseMarkdown = () => {
      // Clear arrays
      segments.length = 0;
      links.length = 0;
      rules.length = 0;

      // Reset cursor
      let cursorY = marginTop;
      let imageIndex = 0; // Track which image we're at

      const processLine = (
        line: string,
        fontSize: number,
        baseFontWeight: string,
        indent: number,
        color: string,
        extraSpacing: number,
      ) => {
        const inlineParts = parseInlineMarkdown(line);
        let currentX = marginX + indent;
        const lineHeight = Math.round(fontSize * 1.28);

        // Process all parts and build a flat list of words with their formatting
        const words: Array<{
          text: string;
          font: string;
          bold: boolean;
          italic: boolean;
          isLink?: boolean;
          linkUrl?: string;
        }> = [];

        inlineParts.forEach((part) => {
          const fontWeight = part.bold ? "700" : baseFontWeight;
          const fontStyle = part.italic ? "italic " : "";
          const font = `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}`;

          // Split part into words but keep the formatting info
          const partWords = part.text.split(/(\s+)/); // Keep whitespace
          partWords.forEach((word) => {
            if (word) {
              words.push({
                text: word,
                font,
                bold: part.bold,
                italic: part.italic,
                isLink: part.isLink,
                linkUrl: part.linkUrl,
              });
            }
          });
        });

        // Now layout words with proper wrapping
        let lineWords: typeof words = [];
        let lineWidth = 0;

        const flushLine = () => {
          if (lineWords.length === 0) return;

          let x = currentX;
          lineWords.forEach((word) => {
            measuringCtx.font = word.font;
            const wordWidth = measuringCtx.measureText(word.text).width;

            const segment = {
              text: word.text,
              x,
              y: cursorY,
              font: word.font,
              color,
              isLink: word.isLink,
              linkUrl: word.linkUrl,
            };
            segments.push(segment);

            // If this is a link, track its bounding box
            if (word.isLink && word.linkUrl) {
              const linkRegion = {
                url: word.linkUrl,
                x: segment.x,
                y: segment.y - fontSize * 1,
                width: wordWidth,
                height: fontSize * 1.6, // Make taller for better spacing
              };
              links.push(linkRegion);
            }

            x += wordWidth;
          });

          cursorY += lineHeight;
          currentX = marginX + indent;
          lineWords = [];
          lineWidth = 0;
        };

        words.forEach((word) => {
          measuringCtx.font = word.font;
          const wordWidth = measuringCtx.measureText(word.text).width;

          // Check if adding this word would exceed the line width
          if (
            lineWidth + wordWidth > usableWidth - (currentX - marginX) &&
            lineWords.length > 0
          ) {
            // Remove trailing whitespace from current line
            while (
              lineWords.length > 0 &&
              /^\s+$/.test(lineWords[lineWords.length - 1].text)
            ) {
              const removed = lineWords.pop()!;
              measuringCtx.font = removed.font;
              lineWidth -= measuringCtx.measureText(removed.text).width;
            }
            flushLine();
          }

          lineWords.push(word);
          lineWidth += wordWidth;
        });

        // Flush remaining words
        flushLine();

        // Add extra spacing (but we already added one lineHeight in flushLine)
        cursorY += extraSpacing;
      };

      lines.forEach((rawLine) => {
        const line = rawLine.trimEnd();
        const trimmed = line.trim();

        if (trimmed === "") {
          cursorY += 20;
          return;
        }

        if (/^---+$/.test(trimmed)) {
          rules.push(cursorY);
          cursorY += 28;
          return;
        }

        // Check for image: ![alt text](url)
        const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imageMatch) {
          // Use imageIndex to get the correct image (they're in order)
          const imageEntry = images[imageIndex];
          if (imageEntry) {
            // Update image Y position
            imageEntry.y = cursorY;

            if (imageEntry.height > 0) {
              // Image has loaded, use actual dimensions
              cursorY += imageEntry.height + 30;
            } else {
              // Image not loaded yet, use estimated height
              const estimatedHeight = usableWidth * 0.8 * 0.75;
              cursorY += estimatedHeight + 30;
            }
            imageIndex++;
          }
          return;
        }

        if (/^#{3}\s+/.test(trimmed)) {
          const text = trimmed.replace(/^#{3}\s+/, "");
          processLine(text, 54, "600", 0, headingColor, 18);
          return;
        }

        if (/^#{2}\s+/.test(trimmed)) {
          const text = trimmed.replace(/^#{2}\s+/, "");
          processLine(text, 62, "600", 0, headingColor, 22);
          return;
        }

        if (/^#\s+/.test(trimmed)) {
          const text = trimmed.replace(/^#\s+/, "");
          processLine(text, 70, "700", 0, headingColor, 26);
          return;
        }

        if (/^[-*]\s+/.test(trimmed)) {
          const text = trimmed.replace(/^[-*]\s+/, "");
          processLine(
            "• " + text,
            44,
            "400",
            Math.floor(marginX * 0.25),
            bodyColor,
            12,
          );
          return;
        }

        if (/^####\s+/.test(trimmed)) {
          const text = trimmed.replace(/^####\s+/, "");
          processLine(text, 48, "600", 0, headingColor, 16);
          return;
        }

        processLine(trimmed, 44, "400", 0, bodyColor, 16);
      });

      return cursorY;
    };

    // Track image load promises
    const imageLoadPromises: Promise<void>[] = [];

    // Pre-scan for images and set up load handlers
    lines.forEach((rawLine) => {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      // Check for image: ![alt text](url)
      const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imageMatch) {
        const imagePath = imageMatch[2];
        const img = new Image();

        // Resolve relative URLs
        let imageUrl: string;
        if (imagePath.startsWith("./")) {
          const baseDir = baseUrl.substring(0, baseUrl.lastIndexOf("/") + 1);
          imageUrl = baseDir + imagePath.substring(2);
        } else if (imagePath.startsWith("/")) {
          imageUrl = imagePath;
        } else {
          imageUrl = imagePath;
        }

        // Create placeholder object
        const imageEntry: RenderImage = {
          img,
          x: marginX,
          y: 0, // Will be set during parseMarkdown
          width: 0,
          height: 0,
        };
        images.push(imageEntry);

        const imagePromise = new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn(`[PortfolioPapers] Image load timeout: ${imageUrl}`);
            resolve();
          }, 5000);

          img.onload = () => {
            clearTimeout(timeout);
            const maxWidth = usableWidth * 0.8;
            const scale = Math.min(1, maxWidth / img.width);
            const displayWidth = img.width * scale;
            const displayHeight = img.height * scale;

            imageEntry.width = displayWidth;
            imageEntry.height = displayHeight;
            resolve();
          };
          img.onerror = (err) => {
            clearTimeout(timeout);
            console.error(
              `[PortfolioPapers] Failed to load image: ${imageUrl}`,
              err,
            );
            resolve();
          };
        });

        img.src = imageUrl;
        imageLoadPromises.push(imagePromise);
      }
    });

    // Initial parse with estimated image sizes
    let cursorY = parseMarkdown();

    // Update image Y positions after initial parse
    let imageIndex = 0;
    let currentY = marginTop;
    lines.forEach((rawLine) => {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (trimmed === "") {
        currentY += 20;
        return;
      }

      if (/^---+$/.test(trimmed)) {
        currentY += 28;
        return;
      }

      const imageMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (imageMatch) {
        if (imageIndex < images.length) {
          images[imageIndex].y = currentY;
          const estimatedHeight = usableWidth * 0.8 * 0.75;
          currentY += estimatedHeight + 30;
          imageIndex++;
        }
        return;
      }

      // Skip over other content types
      if (/^#{1,4}\s+/.test(trimmed) || /^[-*]\s+/.test(trimmed)) {
        currentY += 100; // Rough estimate
      } else {
        currentY += 70; // Rough estimate
      }
    });

    const totalHeight = cursorY + marginBottom;
    fullCanvas.height = Math.max(VIEW_HEIGHT, Math.ceil(totalHeight));

    const fullCtx = fullCanvas.getContext("2d");
    const displayCtx = displayCanvas.getContext("2d");
    if (!fullCtx || !displayCtx) {
      return null;
    }

    // Function to render content
    const renderContent = () => {
      fullCtx.fillStyle = "#ffffff";
      fullCtx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
      fullCtx.fillStyle = "#111111";

      segments.forEach((segment) => {
        fullCtx.font = segment.font;
        fullCtx.fillStyle = segment.isLink ? "#0969da" : segment.color;
        fullCtx.fillText(segment.text, segment.x, segment.y);

        if (segment.isLink) {
          const textWidth = fullCtx.measureText(segment.text).width;
          fullCtx.strokeStyle = "#0969da";
          fullCtx.lineWidth = 1;
          fullCtx.beginPath();
          fullCtx.moveTo(segment.x, segment.y + 3);
          fullCtx.lineTo(segment.x + textWidth, segment.y + 3);
          fullCtx.stroke();
        }
      });

      images.forEach((image) => {
        if (image.width > 0 && image.height > 0) {
          fullCtx.drawImage(
            image.img,
            image.x,
            image.y,
            image.width,
            image.height,
          );
        }
      });

      rules.forEach((ruleY) => {
        fullCtx.strokeStyle = "#d0d7de";
        fullCtx.lineWidth = 2;
        fullCtx.beginPath();
        fullCtx.moveTo(marginX, ruleY);
        fullCtx.lineTo(fullCanvas.width - marginX, ruleY);
        fullCtx.stroke();
      });
    };

    // Render immediately without waiting for images
    renderContent();

    // Load images in background and re-render when ready
    if (imageLoadPromises.length > 0) {
      Promise.race([
        Promise.all(imageLoadPromises),
        new Promise<void>((resolve) => setTimeout(resolve, 6000)),
      ])
        .then(() => {
          // Re-parse markdown with actual image dimensions
          const newCursorY = parseMarkdown();
          const newTotalHeight = newCursorY + marginBottom;
          fullCanvas.height = Math.max(VIEW_HEIGHT, Math.ceil(newTotalHeight));

          renderContent();

          displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
          displayCtx.drawImage(
            fullCanvas,
            0,
            0,
            displayCanvas.width,
            displayCanvas.height,
            0,
            0,
            displayCanvas.width,
            displayCanvas.height,
          );

          const scrollableState = this.scrollablePaperStates.get(paperId);
          if (scrollableState?.texture) {
            scrollableState.texture.needsUpdate = true;
            scrollableState.links = links;
            scrollableState.maxScroll = Math.max(
              0,
              fullCanvas.height - displayCanvas.height,
            );
          }
        })
        .catch((error) => {
          console.error("[PortfolioPapers] Error loading images:", error);
        });
    }

    displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    displayCtx.drawImage(
      fullCanvas,
      0,
      0,
      displayCanvas.width,
      displayCanvas.height,
      0,
      0,
      displayCanvas.width,
      displayCanvas.height,
    );

    const maxScroll = Math.max(0, fullCanvas.height - displayCanvas.height);

    return {
      fullCanvas,
      displayCanvas,
      scrollOffset: 0,
      maxScroll,
      links,
    };
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

  private createPaperMesh(
    paperId: string,
    canvas: HTMLCanvasElement,
    scrollState?: PendingScrollState,
  ): void {
    if (!this.whitepaperMesh) {
      console.error("[PortfolioPapers] Whitepaper mesh not set");
      return;
    }

    // Generate random rotation for this paper if not already set
    if (!this.paperRotations.has(paperId)) {
      const randomRotation =
        (Math.random() - 0.5) * 2 * this.MAX_RANDOM_ROTATION;
      this.paperRotations.set(paperId, randomRotation);
    }

    // Remove existing paper mesh if any
    const existingMesh = this.paperMeshes.get(paperId);
    if (existingMesh && existingMesh.parent) {
      existingMesh.parent.remove(existingMesh);
    }

    const textureCanvas = scrollState?.displayCanvas ?? canvas;

    // Create texture from canvas with optimal settings for text
    const texture = new CanvasTexture(textureCanvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;

    // Set max anisotropy from renderer if available
    if (this.renderer) {
      const maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy();
      texture.anisotropy = maxAnisotropy;
    } else {
      texture.anisotropy = 16;
    }

    texture.needsUpdate = true;

    if (scrollState) {
      const stateWithTexture: ScrollablePaperState = {
        ...scrollState,
        texture,
      };
      this.scrollablePaperStates.set(paperId, stateWithTexture);
    } else {
      this.scrollablePaperStates.delete(paperId);
    }

    // Create material with PDF texture - use MeshStandardMaterial for better lighting and depth
    const material = new MeshStandardMaterial({
      map: texture,
      roughness: 0.7, // Paper-like roughness
      metalness: 0, // Not metallic
      side: 2, // DoubleSide
      polygonOffset: true,
      polygonOffsetFactor: -2, // Position between whitepaper (-1) and cover (-3)
      polygonOffsetUnits: -2,
    });

    // Use proper paper aspect ratio (8.5 x 11 inches = 1 x 1.294)
    const aspectRatio = canvas.height / canvas.width;
    const paperWidth = 21.6; // Base width in 3D units (increased for visibility)
    const paperHeight = paperWidth * aspectRatio; // Maintain PDF aspect ratio

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

    // Set render order so papers appear in front of whitepaper (100) but behind cover (300)
    // Render order: Portfolio (base) < Whitepaper (100) < Papers (200) < Cover (300) < Text (400)
    mesh.renderOrder = 200;

    // Add to scene
    if (this.whitepaperMesh.parent) {
      this.whitepaperMesh.parent.add(mesh);
    }

    this.paperMeshes.set(paperId, mesh);
  }

  scrollPaper(paperId: string, deltaY: number): boolean {
    const scrollable = this.scrollablePaperStates.get(paperId);
    if (!scrollable) {
      return false;
    }

    const scrollRange = Math.max(
      scrollable.maxScroll,
      scrollable.fullCanvas.height - scrollable.displayCanvas.height,
    );
    scrollable.maxScroll = scrollRange;
    if (scrollRange <= 0) {
      return false;
    }

    const SCROLL_SPEED = 1.1;
    const nextOffset = Math.max(
      0,
      Math.min(scrollRange, scrollable.scrollOffset + deltaY * SCROLL_SPEED),
    );

    if (nextOffset === scrollable.scrollOffset) {
      return false;
    }

    scrollable.scrollOffset = nextOffset;

    // Batch redraw instead of immediate redraw
    this.pendingRedraws.add(paperId);
    if (this.redrawAnimationFrameId === null) {
      this.redrawAnimationFrameId = requestAnimationFrame(() => {
        this.processPendingRedraws();
      });
    }
    return true;
  }

  private processPendingRedraws(): void {
    for (const paperId of this.pendingRedraws) {
      this.redrawScrollablePaper(paperId);
    }
    this.pendingRedraws.clear();
    this.redrawAnimationFrameId = null;
  }

  isPaperScrollable(paperId: string): boolean {
    return this.scrollablePaperStates.has(paperId);
  }

  isPaperInLeftStack(paperId: string): boolean {
    return this.leftStackPapers.includes(paperId);
  }

  setHoveredScrollablePaper(paperId: string | null): void {
    if (this.hoveredScrollablePaperId === paperId) {
      return;
    }
    const previous = this.hoveredScrollablePaperId;
    this.hoveredScrollablePaperId = paperId;
    if (previous && this.scrollablePaperStates.has(previous)) {
      this.redrawScrollablePaper(previous, false);
    }
    if (paperId && this.scrollablePaperStates.has(paperId)) {
      this.redrawScrollablePaper(paperId, true);
    }
  }

  private redrawScrollablePaper(
    paperId: string,
    forceShowScrollbar?: boolean,
  ): void {
    const scrollable = this.scrollablePaperStates.get(paperId);
    if (!scrollable) {
      return;
    }

    const { displayCanvas, fullCanvas, texture, scrollOffset } = scrollable;
    const displayCtx = displayCanvas.getContext("2d");
    if (!displayCtx) {
      return;
    }

    displayCtx.clearRect(0, 0, displayCanvas.width, displayCanvas.height);
    displayCtx.drawImage(
      fullCanvas,
      0,
      scrollOffset,
      displayCanvas.width,
      displayCanvas.height,
      0,
      0,
      displayCanvas.width,
      displayCanvas.height,
    );

    const shouldShowScrollbar =
      forceShowScrollbar !== undefined
        ? forceShowScrollbar
        : this.hoveredScrollablePaperId === paperId;
    if (shouldShowScrollbar && scrollable.maxScroll > 0) {
      this.drawScrollbar(displayCtx, scrollable);
    }

    texture.needsUpdate = true;
  }

  private drawScrollbar(
    ctx: CanvasRenderingContext2D,
    scrollable: ScrollablePaperState,
  ): void {
    const width = Math.max(Math.floor(ctx.canvas.width * 0.012), 12);
    const margin = Math.max(Math.floor(width * 1.2), 16);
    const trackX = ctx.canvas.width - width - margin;
    const trackY = Math.floor(ctx.canvas.height * 0.04);
    const trackHeight = ctx.canvas.height - trackY * 2;

    ctx.save();

    // Draw track (background) - rectangular, subtle grey
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = "#888888";
    ctx.fillRect(trackX, trackY, width, trackHeight);

    const scrollRatio =
      scrollable.maxScroll === 0
        ? 0
        : scrollable.scrollOffset / scrollable.maxScroll;
    const thumbHeight = Math.max(
      trackHeight * (ctx.canvas.height / scrollable.fullCanvas.height),
      Math.floor(ctx.canvas.height * 0.08),
    );
    const thumbY =
      trackY +
      (trackHeight - thumbHeight) * Math.min(Math.max(scrollRatio, 0), 1);

    // Draw thumb (scrollbar handle) - rectangular, medium grey
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = "#666666";
    ctx.fillRect(trackX, thumbY, width, thumbHeight);

    ctx.restore();
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

  showAllPapers(): void {
    this.paperMeshes.forEach((mesh) => {
      mesh.visible = true;
    });
  }

  hideLowerPapers(): void {
    const papersList = this.getPapers();
    const firstPaperId = papersList.length > 0 ? papersList[0].id : null;
    const lastPaperId =
      papersList.length > 0 ? papersList[papersList.length - 1].id : null;

    this.paperMeshes.forEach((mesh, paperId) => {
      // Show only first paper and currently open paper, hide all others
      if (paperId === firstPaperId || paperId === this.currentPaperId) {
        mesh.visible = true;
        // Move current paper down 0.3 units in Y (but not if it's the last paper)
        if (paperId === this.currentPaperId && paperId !== lastPaperId) {
          mesh.position.y -= 0.07;
        }
      } else {
        mesh.visible = false;
      }
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
      const peakHeight = startPosition.y + 1; // Rise up 1 units
      const stageDuration = duration / 3; // Split time into three stages

      // Stage 1: Rise in Y
      const stage1Start = performance.now();
      const stage1End = stage1Start + stageDuration;

      const animateStage1 = (currentTime: number) => {
        const elapsed = currentTime - stage1Start;
        const progress = Math.min(elapsed / stageDuration, 1);

        // Ease out cubic for smooth rise
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        mesh.position.y =
          startPosition.y + (peakHeight - startPosition.y) * easeProgress;

        if (currentTime < stage1End) {
          requestAnimationFrame(animateStage1);
        } else {
          // Stage 2: Move in X/Z while at peak height
          const stage2Start = performance.now();
          const stage2End = stage2Start + stageDuration;

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
            // Keep Y at peak height during X/Z movement
            mesh.position.y = peakHeight;
            // Rotate simultaneously with X movement
            mesh.rotation.z =
              startRotationZ +
              (targetRotationZ - startRotationZ) * easeProgress;

            if (currentTime < stage2End) {
              requestAnimationFrame(animateStage2);
            } else {
              // Stage 3: Fall down in Y to target position
              const stage3Start = performance.now();
              const stage3End = stage3Start + stageDuration;

              const animateStage3 = (currentTime: number) => {
                const elapsed = currentTime - stage3Start;
                const progress = Math.min(elapsed / stageDuration, 1);

                // Ease out cubic for smooth fall
                const easeProgress = 1 - Math.pow(1 - progress, 3);

                mesh.position.y =
                  peakHeight + (targetPosition.y - peakHeight) * easeProgress;

                if (currentTime < stage3End) {
                  requestAnimationFrame(animateStage3);
                } else {
                  mesh.position.copy(targetPosition);
                  mesh.rotation.z = targetRotationZ;
                  resolve();
                }
              };

              requestAnimationFrame(animateStage3);
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

    // Clear hover state to hide scrollbar during navigation
    this.setHoveredScrollablePaper(null);

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
        // Boost render priority during reset animation to ensure it renders above whitepaper and cover
        mesh.renderOrder = 250;

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

    // Restore normal render priority after animation completes
    for (const paperId of papersToReset) {
      const mesh = this.paperMeshes.get(paperId);
      if (mesh) {
        mesh.renderOrder = 200;
      }
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

    // Clear hover state to hide scrollbar during navigation
    this.setHoveredScrollablePaper(null);

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

  // Check if a UV coordinate on a paper hits a link
  checkLinkAtUV(paperId: string, u: number, v: number): string | null {
    const scrollableState = this.scrollablePaperStates.get(paperId);
    if (!scrollableState?.links || scrollableState.links.length === 0) {
      return null;
    }

    const { displayCanvas, scrollOffset, links } = scrollableState;

    // Convert UV coordinates to canvas pixel coordinates
    // UV coordinates are in display space (the visible portion)
    // IMPORTANT: V is flipped in texture space - V=0 is bottom, V=1 is top
    const clickX = u * displayCanvas.width;
    const clickY = (1 - v) * displayCanvas.height + scrollOffset; // Flip V and add scroll offset

    // Check each link region with expanded hit area for easier clicking
    const hitPadding = 10; // Extra pixels around the link for easier clicking
    for (const link of links) {
      if (
        clickX >= link.x - hitPadding &&
        clickX <= link.x + link.width + hitPadding &&
        clickY >= link.y - hitPadding &&
        clickY <= link.y + link.height + hitPadding
      ) {
        return link.url;
      }
    }

    return null;
  }
}
