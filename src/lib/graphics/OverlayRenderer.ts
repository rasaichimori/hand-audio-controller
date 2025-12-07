/**
 * OverlayRenderer Module
 *
 * Renders animated graphics on top of the video feed.
 * Uses Canvas2D for simplicity and good performance.
 * Includes visual effects like:
 * - Landmark circles
 * - Skeleton lines connecting joints
 * - Reactive shapes based on hand state
 */

import {
  getHandOpenness,
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
  // Colors
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;

  // Sizes
  landmarkRadius: number;
  lineWidth: number;
}

/**
 * Default cyberpunk-inspired theme
 */
export const DEFAULT_THEME: VisualTheme = {
  primaryColor: "#000000", // Black
  secondaryColor: "#ffffff", // White
  accentColor: "#dddddd", // Gray
  backgroundColor: "rgba(0, 0, 0, 0.1)",
  landmarkRadius: 6,
  lineWidth: 2,
};

/**
 * Overlay renderer state
 */
interface RendererState {
  lastRenderTime: number;
}

/**
 * Overlay Renderer Class
 */
export class OverlayRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private theme: VisualTheme;
  private state: RendererState;
  private mirror: boolean;

  constructor(
    canvas: HTMLCanvasElement,
    theme: Partial<VisualTheme> = {},
    mirror: boolean = true
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to get 2D context from canvas");
    }
    this.ctx = ctx;
    this.theme = { ...DEFAULT_THEME, ...theme };
    this.mirror = mirror;
    this.state = {
      lastRenderTime: performance.now(),
    };
  }

  /**
   * Update theme at runtime
   */
  updateTheme(theme: Partial<VisualTheme>): void {
    this.theme = { ...this.theme, ...theme };
  }

  /**
   * Clear the canvas with optional fade effect
   */
  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Main render function - call this every frame
   */
  render(result: HandTrackingResult): void {
    const now = performance.now();
    const deltaTime = now - this.state.lastRenderTime;
    this.state.lastRenderTime = now;

    this.clear();

    // Render each detected hand
    result.hands.forEach((hand, index) => {
      this.renderHand(hand, index, now);
    });
    // Render reactive effects
    this.renderReactiveEffects(result);
  }

  /**
   * Render a single hand with all effects
   */
  private renderHand(
    hand: HandResult,
    handIndex: number,
    timestamp: number
  ): void {
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
  private renderSkeleton(landmarks: Landmark[], color: string): void {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = this.theme.lineWidth;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    // Draw finger connections
    for (const [start, end] of FINGER_CONNECTIONS) {
      const p1 = landmarkToPixel(
        landmarks[start],
        this.canvas.width,
        this.canvas.height,
        this.mirror
      );
      const p2 = landmarkToPixel(
        landmarks[end],
        this.canvas.width,
        this.canvas.height,
        this.mirror
      );

      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();
    }
  }

  /**
   * Render palm area with gradient fill
   */
  private renderPalmArea(landmarks: Landmark[], color: string): void {
    const palmPoints = [
      landmarks[LandmarkIndex.WRIST],
      landmarks[LandmarkIndex.THUMB_CMC],
      landmarks[LandmarkIndex.INDEX_MCP],
      landmarks[LandmarkIndex.MIDDLE_MCP],
      landmarks[LandmarkIndex.RING_MCP],
      landmarks[LandmarkIndex.PINKY_MCP],
    ].map((l) =>
      landmarkToPixel(l, this.canvas.width, this.canvas.height, this.mirror)
    );

    // Create gradient from center
    const centerX =
      palmPoints.reduce((sum, p) => sum + p.x, 0) / palmPoints.length;
    const centerY =
      palmPoints.reduce((sum, p) => sum + p.y, 0) / palmPoints.length;

    const gradient = this.ctx.createRadialGradient(
      centerX,
      centerY,
      0,
      centerX,
      centerY,
      100
    );
    gradient.addColorStop(0, this.hexToRgba(color, 0.3));
    gradient.addColorStop(1, this.hexToRgba(color, 0.0));

    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.moveTo(palmPoints[0].x, palmPoints[0].y);
    for (let i = 1; i < palmPoints.length; i++) {
      this.ctx.lineTo(palmPoints[i].x, palmPoints[i].y);
    }
    this.ctx.closePath();
    this.ctx.fill();
  }

  /**
   * Render landmark circles
   */
  private renderLandmarks(landmarks: Landmark[], color: string): void {
    for (let i = 0; i < landmarks.length; i++) {
      const pixel = landmarkToPixel(
        landmarks[i],
        this.canvas.width,
        this.canvas.height,
        this.mirror
      );

      const radius = this.theme.landmarkRadius * 1;

      // Solid center
      this.ctx.beginPath();
      this.ctx.arc(pixel.x, pixel.y, radius, 0, Math.PI * 2);
      this.ctx.fillStyle = color;
      this.ctx.fill();
    }
  }

  /**
   * Render reactive visual effects based on hand state
   */
  private renderReactiveEffects(result: HandTrackingResult): void {
    result.hands.forEach((hand, index) => {
      const openness = getHandOpenness(hand.landmarks);
      const pinchDistance = getPinchDistance(hand.landmarks);

      // Pinch indicator
      if (pinchDistance < 0.08) {
        this.renderPinchEffect(hand, index);
      }

      // Hand openness ring
      this.renderOpennessRing(hand, openness, index);
    });
  }

  /**
   * Render pinch indicator effect
   */
  private renderPinchEffect(hand: HandResult, handIndex: number): void {
    const thumb = landmarkToPixel(
      hand.landmarks[LandmarkIndex.THUMB_TIP],
      this.canvas.width,
      this.canvas.height,
      this.mirror
    );
    const index = landmarkToPixel(
      hand.landmarks[LandmarkIndex.INDEX_TIP],
      this.canvas.width,
      this.canvas.height,
      this.mirror
    );

    // Pinch point is midpoint between thumb and index
    const pinchX = (thumb.x + index.x) / 2;
    const pinchY = (thumb.y + index.y) / 2;

    this.ctx.beginPath();
    this.ctx.arc(pinchX, pinchY, 20, 0, Math.PI * 2);
    this.ctx.strokeStyle = this.theme.accentColor;
    this.ctx.lineWidth = 3;
    this.ctx.stroke();

    // Inner dot
    this.ctx.beginPath();
    this.ctx.arc(pinchX, pinchY, 5, 0, Math.PI * 2);
    this.ctx.fillStyle = this.theme.accentColor;
    this.ctx.fill();
  }

  /**
   * Render openness indicator ring around hand
   */
  private renderOpennessRing(
    hand: HandResult,
    openness: number,
    handIndex: number
  ): void {
    // Get wrist position as ring center
    const wrist = landmarkToPixel(
      hand.landmarks[LandmarkIndex.WRIST],
      this.canvas.width,
      this.canvas.height,
      this.mirror
    );

    // Ring radius based on openness
    const radius = 30 + openness * 150;
    const color =
      handIndex === 0 ? this.theme.primaryColor : this.theme.secondaryColor;

    // Draw arc based on openness (more open = fuller arc)
    const arcLength = Math.PI * 2 * Math.min(openness * 3, 1);
    const startAngle = -Math.PI / 2 - arcLength / 2;

    this.ctx.beginPath();
    this.ctx.arc(wrist.x, wrist.y, radius, startAngle, startAngle + arcLength);
    this.ctx.strokeStyle = this.hexToRgba(color, 0.4);
    this.ctx.lineWidth = 4;
    this.ctx.stroke();
  }

  /**
   * Convert hex color to rgba string
   */
  private hexToRgba(hex: string, alpha: number): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return `rgba(255, 255, 255, ${alpha})`;

    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Resize canvas to match video dimensions
   */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Clear all state
   */
  reset(): void {
    this.state = {
      lastRenderTime: performance.now(),
    };
    this.clear();
  }
}
