/**
 * OverlayRenderer Module
 *
 * Renders animated graphics on top of the video feed using PixiJS.
 * Includes visual effects like:
 * - Landmark circles
 * - Skeleton lines connecting joints
 * - Reactive shapes based on hand state
 */

import { Application, Container, Graphics, Text, TextStyle } from "pixi.js";
import {
  getPinchDistance,
  landmarkToPixel,
} from "../hand-tracking/landmarkUtils.js";
import type {
  HandResult,
  HandTrackingResult,
  Landmark,
} from "../types/hand.js";
import { FINGER_CONNECTIONS, LandmarkIndex } from "../types/hand.js";

/**
 * Visual theme configuration
 */
export interface VisualTheme {
  // Colors (as hex numbers for PixiJS)
  primaryColor: number;
  secondaryColor: number;
  accentColor: number;

  // Sizes
  landmarkRadius: number;
  lineWidth: number;
}

/**
 * Default monochrome theme
 */
export const DEFAULT_THEME: VisualTheme = {
  primaryColor: 0x000000, // Black
  secondaryColor: 0xffffff, // White
  accentColor: 0xdddddd, // Gray
  landmarkRadius: 6,
  lineWidth: 2,
};

/**
 * Overlay Renderer Class using PixiJS
 */
export class OverlayRenderer {
  private app: Application;
  private theme: VisualTheme;
  private mirror: boolean;
  private initialized: boolean = false;

  // Graphics containers
  private handContainer: Container;
  private effectsContainer: Container;

  // Reusable graphics objects
  private skeletonGraphics: Graphics;
  private palmGraphics: Graphics;
  private landmarkGraphics: Graphics;
  private pinchGraphics: Graphics;
  private pinchDistanceGraphics: Graphics;

  // Per-hand text containers (for distance and angle display)
  private pinchInfoContainers: Container[];
  private distanceTexts: Text[];
  private angleTexts: Text[];
  private textBackgrounds: Graphics[];

  constructor(theme: Partial<VisualTheme> = {}, mirror: boolean = true) {
    this.app = new Application();
    this.theme = { ...DEFAULT_THEME, ...theme };
    this.mirror = mirror;

    // Create containers
    this.handContainer = new Container();
    this.effectsContainer = new Container();

    // Create reusable graphics objects
    this.skeletonGraphics = new Graphics();
    this.palmGraphics = new Graphics();
    this.landmarkGraphics = new Graphics();
    this.pinchGraphics = new Graphics();
    this.pinchDistanceGraphics = new Graphics();

    // Create text style for labels
    const textStyle = new TextStyle({
      fontFamily: "monospace",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xffffff,
    });

    // Create per-hand containers and text objects (support up to 2 hands)
    this.pinchInfoContainers = [];
    this.distanceTexts = [];
    this.angleTexts = [];
    this.textBackgrounds = [];

    for (let i = 0; i < 2; i++) {
      const container = new Container();

      const background = new Graphics();
      const distanceText = new Text({ text: "", style: textStyle });
      const angleText = new Text({ text: "", style: textStyle });

      distanceText.anchor.set(0.5, 0.5);
      angleText.anchor.set(0.5, 0.5);

      container.addChild(background);
      container.addChild(distanceText);
      container.addChild(angleText);

      this.pinchInfoContainers.push(container);
      this.distanceTexts.push(distanceText);
      this.angleTexts.push(angleText);
      this.textBackgrounds.push(background);
    }
  }

  /**
   * Initialize the PixiJS application
   * Must be called before rendering
   */
  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    await this.app.init({
      canvas,
      width: canvas.width,
      height: canvas.height,
      backgroundAlpha: 0,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Add containers to stage in order (back to front)
    this.handContainer.addChild(this.skeletonGraphics);
    this.handContainer.addChild(this.palmGraphics);
    this.handContainer.addChild(this.landmarkGraphics);

    this.effectsContainer.addChild(this.pinchGraphics);
    this.effectsContainer.addChild(this.pinchDistanceGraphics);

    // Add pinch info containers for each hand
    for (const container of this.pinchInfoContainers) {
      this.effectsContainer.addChild(container);
    }

    this.app.stage.addChild(this.handContainer);
    this.app.stage.addChild(this.effectsContainer);

    this.initialized = true;
  }

  /**
   * Check if renderer is initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Update theme at runtime
   */
  updateTheme(theme: Partial<VisualTheme>): void {
    this.theme = { ...this.theme, ...theme };
  }

  /**
   * Clear all graphics
   */
  clear(): void {
    this.skeletonGraphics.clear();
    this.palmGraphics.clear();
    this.landmarkGraphics.clear();
    this.pinchGraphics.clear();
    this.pinchDistanceGraphics.clear();

    // Clear per-hand text and backgrounds
    for (let i = 0; i < this.pinchInfoContainers.length; i++) {
      this.textBackgrounds[i].clear();
      this.distanceTexts[i].text = "";
      this.angleTexts[i].text = "";
      this.pinchInfoContainers[i].visible = false;
    }
  }

  /**
   * Main render function - call this every frame
   */
  render(result: HandTrackingResult): void {
    if (!this.initialized) return;

    this.clear();

    // Render each detected hand
    result.hands.forEach((hand, index) => {
      this.renderHand(hand, index);
    });

    // Render reactive effects
    this.renderReactiveEffects(result);
  }

  /**
   * Render a single hand with all effects
   */
  private renderHand(hand: HandResult, handIndex: number): void {
    const { landmarks, handedness } = hand;
    const isLeft = handedness === "Left";

    // Choose colors based on handedness
    const color = isLeft ? this.theme.primaryColor : this.theme.secondaryColor;

    // Render skeleton first (behind landmarks)
    this.renderSkeleton(landmarks, color);

    // Render palm area
    this.renderPalmArea(landmarks, color);

    // Render landmarks on top
    this.renderLandmarks(landmarks, color);
  }

  /**
   * Render skeleton lines connecting joints
   */
  private renderSkeleton(landmarks: Landmark[], color: number): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;

    this.skeletonGraphics.setStrokeStyle({
      width: this.theme.lineWidth,
      color,
      cap: "round",
      join: "round",
      alpha: 0.1,
    });

    // Draw finger connections
    for (const [start, end] of FINGER_CONNECTIONS) {
      const p1 = landmarkToPixel(landmarks[start], width, height, this.mirror);
      const p2 = landmarkToPixel(landmarks[end], width, height, this.mirror);

      this.skeletonGraphics.moveTo(p1.x, p1.y);
      this.skeletonGraphics.lineTo(p2.x, p2.y);
    }

    this.skeletonGraphics.stroke();
  }

  /**
   * Render palm area with gradient fill
   */
  private renderPalmArea(landmarks: Landmark[], color: number): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;

    const palmPoints = [
      landmarks[LandmarkIndex.WRIST],
      landmarks[LandmarkIndex.THUMB_CMC],
      landmarks[LandmarkIndex.INDEX_MCP],
      landmarks[LandmarkIndex.MIDDLE_MCP],
      landmarks[LandmarkIndex.RING_MCP],
      landmarks[LandmarkIndex.PINKY_MCP],
    ].map((l) => landmarkToPixel(l, width, height, this.mirror));

    // Create polygon path
    this.palmGraphics.moveTo(palmPoints[0].x, palmPoints[0].y);
    for (let i = 1; i < palmPoints.length; i++) {
      this.palmGraphics.lineTo(palmPoints[i].x, palmPoints[i].y);
    }
    this.palmGraphics.closePath();

    // Fill with semi-transparent color
    this.palmGraphics.fill({ color, alpha: 0.15 });
  }

  /**
   * Render landmark circles
   */
  private renderLandmarks(landmarks: Landmark[], color: number): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;

    for (let i = 0; i < landmarks.length; i++) {
      const pixel = landmarkToPixel(landmarks[i], width, height, this.mirror);
      const radius = this.theme.landmarkRadius;

      // Draw filled circle
      this.landmarkGraphics.circle(pixel.x, pixel.y, radius);

      // Set alpha to 1 for thumb tip and index tip, 0.1 for others
      const alpha =
        i === LandmarkIndex.THUMB_TIP || i === LandmarkIndex.INDEX_TIP
          ? 1
          : 0.1;
      this.landmarkGraphics.fill({ color, alpha });
    }
  }

  /**
   * Render reactive visual effects based on hand state
   */
  private renderReactiveEffects(result: HandTrackingResult): void {
    result.hands.forEach((hand, index) => {
      const pinchDistance = getPinchDistance(hand.landmarks);

      // Always show pinch distance line, label, and angle
      this.renderPinchDistanceLine(hand, pinchDistance, index);

      // Pinch indicator (circle effect when close)
      if (pinchDistance < 0.08) {
        this.renderPinchEffect(hand);
      }
    });
  }

  /**
   * Render line between thumb and index with distance and angle labels
   */
  private renderPinchDistanceLine(
    hand: HandResult,
    distance: number,
    handIndex: number
  ): void {
    if (handIndex >= this.pinchInfoContainers.length) return;

    const width = this.app.screen.width;
    const height = this.app.screen.height;

    // Get fingertip positions
    const thumbTip = landmarkToPixel(
      hand.landmarks[LandmarkIndex.THUMB_TIP],
      width,
      height,
      this.mirror
    );
    const indexTip = landmarkToPixel(
      hand.landmarks[LandmarkIndex.INDEX_TIP],
      width,
      height,
      this.mirror
    );

    // Get joint positions for angle calculation
    const thumbIP = landmarkToPixel(
      hand.landmarks[LandmarkIndex.THUMB_IP],
      width,
      height,
      this.mirror
    );
    const indexDIP = landmarkToPixel(
      hand.landmarks[LandmarkIndex.INDEX_DIP],
      width,
      height,
      this.mirror
    );

    // Draw line between thumb and index
    this.pinchDistanceGraphics.moveTo(thumbTip.x, thumbTip.y);
    this.pinchDistanceGraphics.lineTo(indexTip.x, indexTip.y);
    this.pinchDistanceGraphics.stroke({
      width: 2,
      color: this.theme.accentColor,
      alpha: 0.8,
    });

    // Calculate angle between thumb line and index line
    const thumbVec = { x: thumbTip.x - thumbIP.x, y: thumbTip.y - thumbIP.y };
    const indexVec = { x: indexTip.x - indexDIP.x, y: indexTip.y - indexDIP.y };

    const dot = thumbVec.x * indexVec.x + thumbVec.y * indexVec.y;
    const thumbMag = Math.sqrt(thumbVec.x ** 2 + thumbVec.y ** 2);
    const indexMag = Math.sqrt(indexVec.x ** 2 + indexVec.y ** 2);

    let angle = 0;
    if (thumbMag > 0 && indexMag > 0) {
      const cos = Math.max(-1, Math.min(1, dot / (thumbMag * indexMag)));
      angle = Math.acos(cos) * (180 / Math.PI);
    }

    // Calculate midpoint for distance text
    const midX = (thumbTip.x + indexTip.x) / 2;
    const midY = (thumbTip.y + indexTip.y) / 2;

    // Position angle text near thumb
    const angleOffsetX = thumbTip.x + (thumbTip.x > indexTip.x ? 25 : -25);
    const angleOffsetY = thumbTip.y - 20;

    // Get references for this hand
    const container = this.pinchInfoContainers[handIndex];
    const distanceText = this.distanceTexts[handIndex];
    const angleText = this.angleTexts[handIndex];
    const background = this.textBackgrounds[handIndex];

    // Set text content
    const distanceValue = (distance * 100).toFixed(1);
    distanceText.text = distanceValue;
    angleText.text = `${angle.toFixed(0)}°`;

    // Position text elements
    distanceText.position.set(midX, midY);
    angleText.position.set(angleOffsetX, angleOffsetY);

    // Flip text horizontally to counteract CSS mirror (make readable)
    // When mirror=false, CSS scaleX(-1) is used, so we flip text to make it readable
    if (!this.mirror) {
      distanceText.scale.x = -1;
      angleText.scale.x = -1;
    }

    // Draw black background boxes behind text
    background.clear();

    // Background for distance text
    const distPadding = 4;
    const distWidth = distanceText.width + distPadding * 2;
    const distHeight = distanceText.height + distPadding * 2;
    background.rect(
      midX - distWidth / 2,
      midY - distHeight / 2,
      distWidth,
      distHeight
    );

    // Background for angle text
    const anglePadding = 4;
    const angleWidth = angleText.width + anglePadding * 2;
    const angleHeight = angleText.height + anglePadding * 2;
    background.rect(
      angleOffsetX - angleWidth / 2,
      angleOffsetY - angleHeight / 2,
      angleWidth,
      angleHeight
    );

    background.fill({ color: 0x000000 });

    // Make container visible
    container.visible = true;
  }

  /**
   * Render pinch indicator effect
   */
  private renderPinchEffect(hand: HandResult): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;

    const thumb = landmarkToPixel(
      hand.landmarks[LandmarkIndex.THUMB_TIP],
      width,
      height,
      this.mirror
    );
    const index = landmarkToPixel(
      hand.landmarks[LandmarkIndex.INDEX_TIP],
      width,
      height,
      this.mirror
    );

    // Pinch point is midpoint between thumb and index
    const pinchX = (thumb.x + index.x) / 2;
    const pinchY = (thumb.y + index.y) / 2;

    // Outer ring
    this.pinchGraphics.circle(pinchX, pinchY, 20);
    this.pinchGraphics.stroke({
      width: 3,
      color: this.theme.accentColor,
    });

    // Inner dot
    this.pinchGraphics.circle(pinchX, pinchY, 5);
    this.pinchGraphics.fill({ color: this.theme.accentColor });
  }
  /**
   * Resize canvas to match video dimensions
   */
  resize(width: number, height: number): void {
    if (!this.initialized) return;
    this.app.renderer.resize(width, height);
  }

  /**
   * Clear all state
   */
  reset(): void {
    this.clear();
  }

  /**
   * Destroy the renderer and clean up resources
   */
  destroy(): void {
    if (this.initialized) {
      this.app.destroy(true, { children: true });
      this.initialized = false;
    }
  }
}
