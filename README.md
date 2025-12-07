# Air Mod

A browser-based application that uses real-time hand tracking to control audio parameters. Built with Svelte 5, MediaPipe Hands, and the Audiotool SDK.

## Features

- **Real-time Hand Tracking**: Uses MediaPipe Hands to detect 21 keypoints per hand at 60fps
- **Gesture-to-Audio Mapping**: Control audio parameters with intuitive hand gestures
- **Modular Architecture**: Easy to extend with custom gestures and parameter mappings
- **Smooth Control**: Built-in 1€ filter for jitter-free parameter control

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## How It Works

### Hand Tracking Pipeline

1. Webcam feed is captured via `getUserMedia`
2. MediaPipe Hands processes each frame to detect hand landmarks
3. Landmark positions are converted to gesture values (pinch distance, hand rotation, etc.)
4. Values are smoothed using the 1€ filter algorithm
5. Smoothed values are mapped to audio parameter ranges
6. Audio parameters are updated in real-time via the Audiotool SDK

### Default Gesture Mappings

| Gesture           | Audio Parameter | Description                           |
| ----------------- | --------------- | ------------------------------------- |
| Thumb-Index Pinch | Filter Cutoff   | Pinch = darker sound, open = brighter |
| Hand Height (Y)   | Master Volume   | Up = louder, down = quieter           |
| Hand Depth (Z)    | Delay Mix       | Forward = more delay, back = less     |

### Project Structure

```
src/
├── lib/
│   ├── types/              # TypeScript type definitions
│   │   ├── hand.ts         # Hand landmark types
│   │   ├── mapping.ts      # Gesture mapping types
│   │   └── audio.ts        # Audio parameter types
│   │
│   ├── hand-tracking/      # MediaPipe Hands integration
│   │   ├── HandTracker.ts  # Main hand tracking class
│   │   └── landmarkUtils.ts # Landmark calculation utilities
│   │
│   ├── graphics/           # Visual overlay rendering
│   │   ├── OverlayRenderer.ts # Canvas2D graphics
│   │   └── effects.ts      # Particle system and effects
│   │
│   ├── audio/              # Audiotool SDK integration
│   │   └── AudioController.ts # Audio device management
│   │
│   ├── gestures/           # Gesture detection and mapping
│   │   ├── GestureMapper.ts  # Gesture-to-parameter mapper
│   │   ├── filters.ts        # Smoothing filters (1€, low-pass)
│   │   └── presets.ts        # Pre-configured mappings
│   │
│   └── utils/              # Utility functions
│       ├── math.ts         # Math utilities
│       └── performance.ts  # FPS counter, profiler
│
└── routes/
    ├── +layout.svelte      # App layout
    └── +page.svelte        # Main application page
```

## Adding Custom Gesture Mappings

```typescript
import { createMapping } from "$lib/gestures/presets";
import { LandmarkIndex } from "$lib/types/hand";

const myMapping = createMapping(
  "my-custom-mapping",
  "Custom Gesture → Parameter",
  {
    type: "pinch_distance",
    hand: "Right",
    finger: LandmarkIndex.MIDDLE_TIP,
    inputRange: [0.02, 0.2],
    curve: "smooth-step",
  },
  {
    deviceId: "filter",
    parameterName: "resonance",
    outputRange: [0.0, 1.0],
  },
  {
    type: "one-euro",
    minCutoff: 1.0,
    beta: 0.01,
  }
);

gestureMapper.addMapping(myMapping);
```

## Smoothing Filters

### 1€ Filter (Recommended)

The 1€ filter provides adaptive smoothing that responds to signal velocity:

- **minCutoff**: Lower values = more smoothing when stationary (reduces jitter)
- **beta**: Higher values = faster response to movement (reduces lag)

```typescript
{
  type: 'one-euro',
  minCutoff: 1.0,  // Good starting point
  beta: 0.007,     // Adjust for responsiveness
  dCutoff: 1.0
}
```

### Low-Pass Filter

Simple exponential smoothing:

```typescript
{
  type: 'low-pass',
  factor: 0.5  // 0-1, higher = more smoothing
}
```

## Performance Optimization

### Best Practices

1. **Use GPU delegate**: MediaPipe automatically uses WebGL when available
2. **Limit hand count**: Set `maxHands: 1` if only one hand is needed
3. **Reduce video resolution**: 720p is usually sufficient
4. **Batch parameter updates**: Avoid updating audio on every frame if possible

### Monitoring

The built-in FPS counter and profiler help identify bottlenecks:

```typescript
import { FPSCounter, Profiler } from "$lib/utils/performance";

const fps = new FPSCounter();
const profiler = new Profiler();

// In your render loop
profiler.start("detection");
// ... detection code
profiler.end("detection");

profiler.log(); // Prints averages
```

## Browser Support

- Chrome 89+ (recommended)
- Edge 89+
- Firefox 90+
- Safari 15+ (limited WebGL performance)

Requires:

- WebGL 2.0
- getUserMedia API
- Web Audio API

## Tech Stack

- **Framework**: SvelteKit with Svelte 5
- **Computer Vision**: MediaPipe Hands (Tasks Vision)
- **Audio**: Audiotool SDK
- **Graphics**: Canvas2D
- **Build**: Vite + TypeScript

## License

MIT
