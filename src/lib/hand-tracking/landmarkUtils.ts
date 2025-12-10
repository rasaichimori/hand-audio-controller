/**
 * Landmark Utilities
 * 
 * Helper functions for calculating distances, angles, and other
 * geometric properties from hand landmarks.
 */

import type { Landmark, HandResult } from '../types/hand.js';
import { LandmarkIndex, FINGERTIP_INDICES } from '../types/hand.js';

/**
 * Calculate Euclidean distance between two 3D landmarks
 */
export const distance3D = (a: Landmark, b: Landmark): number => {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	const dz = a.z - b.z;
	return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

/**
 * Calculate 2D distance (ignoring Z)
 */
export const distance2D = (a: Landmark, b: Landmark): number => {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return Math.sqrt(dx * dx + dy * dy);
};

/**
 * Calculate pinch distance between thumb tip and another fingertip
 */
export const getPinchDistance = (
	landmarks: Landmark[],
	fingerTip: LandmarkIndex = LandmarkIndex.INDEX_TIP
): number => {
	const thumb = landmarks[LandmarkIndex.THUMB_TIP];
	const finger = landmarks[fingerTip];
	return distance2D(thumb, finger);
};

/**
 * Calculate hand openness as average distance of fingertips from palm center
 * Returns value typically between 0.1 (fist) and 0.5 (open hand)
 */
export const getHandOpenness = (landmarks: Landmark[]): number => {
	// Calculate palm center as average of base knuckles
	const palmLandmarks = [
		landmarks[LandmarkIndex.WRIST],
		landmarks[LandmarkIndex.INDEX_MCP],
		landmarks[LandmarkIndex.MIDDLE_MCP],
		landmarks[LandmarkIndex.RING_MCP],
		landmarks[LandmarkIndex.PINKY_MCP]
	];

	const palmCenter = {
		x: palmLandmarks.reduce((sum, l) => sum + l.x, 0) / palmLandmarks.length,
		y: palmLandmarks.reduce((sum, l) => sum + l.y, 0) / palmLandmarks.length,
		z: palmLandmarks.reduce((sum, l) => sum + l.z, 0) / palmLandmarks.length
	};

	// Calculate average distance of fingertips from palm center
	const fingertips = FINGERTIP_INDICES.map((i) => landmarks[i]);
	const totalDistance = fingertips.reduce((sum, tip) => sum + distance2D(tip, palmCenter), 0);

	return totalDistance / fingertips.length;
};

/**
 * Calculate finger curl amount (0 = extended, 1 = fully curled)
 */
export const getFingerCurl = (
	landmarks: Landmark[],
	finger: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'
): number => {
	// Map finger to landmark indices
	const fingerIndices: Record<string, [LandmarkIndex, LandmarkIndex, LandmarkIndex, LandmarkIndex]> = {
		thumb: [LandmarkIndex.THUMB_CMC, LandmarkIndex.THUMB_MCP, LandmarkIndex.THUMB_IP, LandmarkIndex.THUMB_TIP],
		index: [LandmarkIndex.INDEX_MCP, LandmarkIndex.INDEX_PIP, LandmarkIndex.INDEX_DIP, LandmarkIndex.INDEX_TIP],
		middle: [LandmarkIndex.MIDDLE_MCP, LandmarkIndex.MIDDLE_PIP, LandmarkIndex.MIDDLE_DIP, LandmarkIndex.MIDDLE_TIP],
		ring: [LandmarkIndex.RING_MCP, LandmarkIndex.RING_PIP, LandmarkIndex.RING_DIP, LandmarkIndex.RING_TIP],
		pinky: [LandmarkIndex.PINKY_MCP, LandmarkIndex.PINKY_PIP, LandmarkIndex.PINKY_DIP, LandmarkIndex.PINKY_TIP]
	};

	const indices = fingerIndices[finger];
	const [mcp, pip, dip, tip] = indices.map((i) => landmarks[i]);

	// Calculate vectors along the finger
	const v1 = { x: pip.x - mcp.x, y: pip.y - mcp.y };
	const v2 = { x: tip.x - pip.x, y: tip.y - pip.y };

	// Calculate angle between vectors
	const dot = v1.x * v2.x + v1.y * v2.y;
	const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
	const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

	if (mag1 === 0 || mag2 === 0) return 0;

	const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
	const angle = Math.acos(cos);

	// Normalize angle to 0-1 range (180° = 0 curl, 0° = 1 curl)
	return 1 - angle / Math.PI;
};

/**
 * Calculate hand rotation angle around Z axis
 * Returns angle in radians, 0 = palm facing camera
 */
export const getHandRotation = (landmarks: Landmark[]): number => {
	const wrist = landmarks[LandmarkIndex.WRIST];
	const middleMcp = landmarks[LandmarkIndex.MIDDLE_MCP];

	// Calculate angle of wrist-to-middle vector
	const dx = middleMcp.x - wrist.x;
	const dy = middleMcp.y - wrist.y;

	return Math.atan2(dy, dx);
};

/**
 * Calculate hand tilt angle (rotation around horizontal axis)
 * Returns normalized value 0-1 where:
 * - 0 = hand pointing down
 * - 0.5 = hand horizontal  
 * - 1 = hand pointing up
 */
export const getHandTilt = (landmarks: Landmark[]): number => {
	const wrist = landmarks[LandmarkIndex.WRIST];
	const middleTip = landmarks[LandmarkIndex.MIDDLE_TIP];

	// Calculate vertical angle from wrist to middle fingertip
	const dx = middleTip.x - wrist.x;
	const dy = middleTip.y - wrist.y;

	// Get angle in radians (-PI to PI)
	const angle = Math.atan2(dy, dx);

	// Normalize to 0-1 range
	// -PI/2 (pointing up) -> 1
	// 0 (pointing right/left) -> 0.5  
	// PI/2 (pointing down) -> 0
	const normalized = 0.5 - (angle / Math.PI);
	
	return Math.max(0, Math.min(1, normalized));
};

/**
 * Calculate hand rotation normalized to 0-1
 * - 0 = hand rotated fully left/counterclockwise
 * - 0.5 = hand neutral/vertical
 * - 1 = hand rotated fully right/clockwise
 */
export const getHandRotationNormalized = (landmarks: Landmark[]): number => {
	const angle = getHandRotation(landmarks);
	
	// Normalize from [-PI, PI] to [0, 1]
	// We shift so that vertical hand (pointing up, angle ~= -PI/2) maps to ~0.5
	const normalized = (angle + Math.PI) / (2 * Math.PI);
	
	return Math.max(0, Math.min(1, normalized));
};

/**
 * Calculate palm facing direction (0 = facing away, 1 = facing camera)
 * Based on Z-depth difference between palm and back of hand
 */
export const getPalmFacing = (landmarks: Landmark[]): number => {
	const wrist = landmarks[LandmarkIndex.WRIST];
	const middleMcp = landmarks[LandmarkIndex.MIDDLE_MCP];
	const indexMcp = landmarks[LandmarkIndex.INDEX_MCP];

	// Calculate palm normal using cross product
	const v1 = {
		x: middleMcp.x - wrist.x,
		y: middleMcp.y - wrist.y,
		z: middleMcp.z - wrist.z
	};
	const v2 = {
		x: indexMcp.x - wrist.x,
		y: indexMcp.y - wrist.y,
		z: indexMcp.z - wrist.z
	};

	// Cross product Z component (simplified since we only care about facing direction)
	const normalZ = v1.x * v2.y - v1.y * v2.x;

	// Normalize to 0-1 range
	return (Math.sign(normalZ) + 1) / 2;
};

/**
 * Calculate finger spread angle (average angle between adjacent fingers)
 */
export const getFingerSpread = (landmarks: Landmark[]): number => {
	const fingertips = [
		landmarks[LandmarkIndex.INDEX_TIP],
		landmarks[LandmarkIndex.MIDDLE_TIP],
		landmarks[LandmarkIndex.RING_TIP],
		landmarks[LandmarkIndex.PINKY_TIP]
	];

	const mcps = [
		landmarks[LandmarkIndex.INDEX_MCP],
		landmarks[LandmarkIndex.MIDDLE_MCP],
		landmarks[LandmarkIndex.RING_MCP],
		landmarks[LandmarkIndex.PINKY_MCP]
	];

	let totalAngle = 0;
	for (let i = 0; i < fingertips.length - 1; i++) {
		const v1 = {
			x: fingertips[i].x - mcps[i].x,
			y: fingertips[i].y - mcps[i].y
		};
		const v2 = {
			x: fingertips[i + 1].x - mcps[i + 1].x,
			y: fingertips[i + 1].y - mcps[i + 1].y
		};

		const dot = v1.x * v2.x + v1.y * v2.y;
		const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
		const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

		if (mag1 > 0 && mag2 > 0) {
			const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
			totalAngle += Math.acos(cos);
		}
	}

	// Return average angle in radians
	return totalAngle / (fingertips.length - 1);
};

/**
 * Get velocity of a landmark (requires previous frame data)
 */
export const getLandmarkVelocity = (
	current: Landmark,
	previous: Landmark,
	deltaTime: number
): { x: number; y: number; z: number; magnitude: number } => {
	if (deltaTime === 0) {
		return { x: 0, y: 0, z: 0, magnitude: 0 };
	}

	const vx = (current.x - previous.x) / deltaTime;
	const vy = (current.y - previous.y) / deltaTime;
	const vz = (current.z - previous.z) / deltaTime;
	const magnitude = Math.sqrt(vx * vx + vy * vy + vz * vz);

	return { x: vx, y: vy, z: vz, magnitude };
};

/**
 * Normalize landmark coordinates to canvas pixel coordinates
 */
export const landmarkToPixel = (
	landmark: Landmark,
	canvasWidth: number,
	canvasHeight: number,
	mirror: boolean = true
): { x: number; y: number } => ({
	x: mirror ? canvasWidth - landmark.x * canvasWidth : landmark.x * canvasWidth,
	y: landmark.y * canvasHeight
});

/**
 * Get the center point of all landmarks
 */
export const getHandCenter = (landmarks: Landmark[]): Landmark => ({
	x: landmarks.reduce((sum, l) => sum + l.x, 0) / landmarks.length,
	y: landmarks.reduce((sum, l) => sum + l.y, 0) / landmarks.length,
	z: landmarks.reduce((sum, l) => sum + l.z, 0) / landmarks.length
});

/**
 * Calculate bounding box of hand
 */
export const getHandBoundingBox = (
	landmarks: Landmark[]
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } => {
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;

	for (const l of landmarks) {
		if (l.x < minX) minX = l.x;
		if (l.y < minY) minY = l.y;
		if (l.x > maxX) maxX = l.x;
		if (l.y > maxY) maxY = l.y;
	}

	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY
	};
};

