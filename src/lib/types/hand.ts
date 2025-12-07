/**
 * Hand Tracking Type Definitions
 *
 * These types represent the MediaPipe Hands landmark data structure
 * and provide type-safe access to hand tracking results.
 */

/**
 * A single 3D landmark point with normalized coordinates.
 * x, y are normalized to [0, 1] relative to image dimensions.
 * z represents depth relative to the wrist (negative = towards camera).
 */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/**
 * MediaPipe Hands defines 21 landmarks per hand.
 * These indices map to specific anatomical points.
 */
export enum LandmarkIndex {
  WRIST = 0,
  THUMB_CMC = 1,
  THUMB_MCP = 2,
  THUMB_IP = 3,
  THUMB_TIP = 4,
  INDEX_MCP = 5,
  INDEX_PIP = 6,
  INDEX_DIP = 7,
  INDEX_TIP = 8,
  MIDDLE_MCP = 9,
  MIDDLE_PIP = 10,
  MIDDLE_DIP = 11,
  MIDDLE_TIP = 12,
  RING_MCP = 13,
  RING_PIP = 14,
  RING_DIP = 15,
  RING_TIP = 16,
  PINKY_MCP = 17,
  PINKY_PIP = 18,
  PINKY_DIP = 19,
  PINKY_TIP = 20,
}

/**
 * Finger tip indices for quick access
 */
export const FINGERTIP_INDICES = [
  LandmarkIndex.THUMB_TIP,
  LandmarkIndex.INDEX_TIP,
  LandmarkIndex.MIDDLE_TIP,
  LandmarkIndex.RING_TIP,
  LandmarkIndex.PINKY_TIP,
] as const;

/**
 * Finger connections for drawing skeleton lines
 */
export const FINGER_CONNECTIONS: [LandmarkIndex, LandmarkIndex][] = [
  // Thumb
  [LandmarkIndex.WRIST, LandmarkIndex.THUMB_CMC],
  [LandmarkIndex.THUMB_CMC, LandmarkIndex.THUMB_MCP],
  [LandmarkIndex.THUMB_MCP, LandmarkIndex.THUMB_IP],
  [LandmarkIndex.THUMB_IP, LandmarkIndex.THUMB_TIP],
  // Index
  [LandmarkIndex.WRIST, LandmarkIndex.INDEX_MCP],
  [LandmarkIndex.INDEX_MCP, LandmarkIndex.INDEX_PIP],
  [LandmarkIndex.INDEX_PIP, LandmarkIndex.INDEX_DIP],
  [LandmarkIndex.INDEX_DIP, LandmarkIndex.INDEX_TIP],
  // Middle
  [LandmarkIndex.WRIST, LandmarkIndex.MIDDLE_MCP],
  [LandmarkIndex.MIDDLE_MCP, LandmarkIndex.MIDDLE_PIP],
  [LandmarkIndex.MIDDLE_PIP, LandmarkIndex.MIDDLE_DIP],
  [LandmarkIndex.MIDDLE_DIP, LandmarkIndex.MIDDLE_TIP],
  // Ring
  [LandmarkIndex.WRIST, LandmarkIndex.RING_MCP],
  [LandmarkIndex.RING_MCP, LandmarkIndex.RING_PIP],
  [LandmarkIndex.RING_PIP, LandmarkIndex.RING_DIP],
  [LandmarkIndex.RING_DIP, LandmarkIndex.RING_TIP],
  // Pinky
  [LandmarkIndex.WRIST, LandmarkIndex.PINKY_MCP],
  [LandmarkIndex.PINKY_MCP, LandmarkIndex.PINKY_PIP],
  [LandmarkIndex.PINKY_PIP, LandmarkIndex.PINKY_DIP],
  [LandmarkIndex.PINKY_DIP, LandmarkIndex.PINKY_TIP],
];

/**
 * Palm connections for drawing palm area
 */
export const PALM_CONNECTIONS: [LandmarkIndex, LandmarkIndex][] = [
  [LandmarkIndex.INDEX_MCP, LandmarkIndex.MIDDLE_MCP],
  [LandmarkIndex.MIDDLE_MCP, LandmarkIndex.RING_MCP],
  [LandmarkIndex.RING_MCP, LandmarkIndex.PINKY_MCP],
  [LandmarkIndex.PINKY_MCP, LandmarkIndex.WRIST],
  [LandmarkIndex.WRIST, LandmarkIndex.THUMB_CMC],
  [LandmarkIndex.THUMB_CMC, LandmarkIndex.INDEX_MCP],
];

/**
 * Handedness classification
 */
export type Handedness = "Left" | "Right";

/**
 * Complete hand detection result
 */
export interface HandResult {
  landmarks: Landmark[];
  worldLandmarks: Landmark[];
  handedness: Handedness;
  confidence: number;
}

/**
 * Frame result containing all detected hands
 */
export interface HandTrackingResult {
  hands: HandResult[];
  timestamp: number;
  frameWidth: number;
  frameHeight: number;
}

/**
 * Callback type for hand tracking updates
 */
export type HandTrackingCallback = (result: HandTrackingResult) => void;

/**
 * Hand tracker configuration options
 */
export interface HandTrackerConfig {
  maxHands: number;
  minDetectionConfidence: number;
  minTrackingConfidence: number;
  modelAssetPath?: string;
}

/**
 * Default configuration for hand tracker
 */
export const DEFAULT_HAND_TRACKER_CONFIG: HandTrackerConfig = {
  maxHands: 2,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
};
