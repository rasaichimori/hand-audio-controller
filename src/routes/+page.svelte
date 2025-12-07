<script lang="ts">
  import { onMount } from "svelte";
  import { HandTracker } from "$lib/hand-tracking/HandTracker.js";
  import { OverlayRenderer } from "$lib/graphics/OverlayRenderer.js";
  import { AudioController } from "$lib/audio/AudioController.js";
  import { GestureMapper } from "$lib/gestures/GestureMapper.js";
  import { getStarterPresets } from "$lib/gestures/presets.js";
  import { FPSCounter } from "$lib/utils/performance.js";
  import type { HandTrackingResult, MappingState } from "$lib/types/index.js";
  import { FINGERTIP_INDICES } from "$lib/types/hand.js";

  // State
  let videoElement: HTMLVideoElement;
  let canvasElement: HTMLCanvasElement;
  let containerElement: HTMLDivElement;

  // Modules (not reactive - internal references only)
  let handTracker: HandTracker | null = null;
  let overlayRenderer: OverlayRenderer | null = null;
  let fpsCounter: FPSCounter | null = null;

  // These need to be reactive for UI updates
  let audioController = $state<AudioController | null>(null);
  let gestureMapper = $state<GestureMapper | null>(null);

  // UI State
  let isInitialized = $state(false);
  let isLoading = $state(false);
  let errorMessage = $state("");
  let fps = $state(0);
  let showDebug = $state(false);
  let audioEnabled = $state(false);
  let handsDetected = $state(0);
  let mappingStates = $state<Map<string, MappingState>>(new Map());

  // Camera dimensions
  let videoWidth = $state(1280);
  let videoHeight = $state(720);

  // Container dimensions for scaling canvas (initialized in onMount for SSR safety)
  let containerWidth = $state(1280);
  let containerHeight = $state(720);

  /**
   * Initialize webcam access
   */
  const initCamera = async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      videoElement.srcObject = stream;
      await videoElement.play();

      // Get actual dimensions
      videoWidth = videoElement.videoWidth;
      videoHeight = videoElement.videoHeight;

      return true;
    } catch (error) {
      console.error("Camera access failed:", error);
      errorMessage = "Camera access denied. Please allow camera permissions.";
      return false;
    }
  };

  /**
   * Initialize all modules
   */
  const initialize = async () => {
    if (isInitialized || isLoading) return;

    isLoading = true;
    errorMessage = "";

    try {
      // Initialize camera first
      const cameraOk = await initCamera();
      if (!cameraOk) {
        isLoading = false;
        return;
      }

      // Initialize hand tracker
      handTracker = new HandTracker({
        maxHands: 2,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5,
      });
      await handTracker.initialize();

      // Initialize overlay renderer
      // Note: mirror=false because canvas CSS already handles mirroring
      canvasElement.width = videoWidth;
      canvasElement.height = videoHeight;
      overlayRenderer = new OverlayRenderer(canvasElement, {}, false);

      // Initialize gesture mapper with starter presets
      gestureMapper = new GestureMapper();
      for (const preset of getStarterPresets()) {
        gestureMapper.addMapping(preset);
      }

      // Initialize FPS counter
      fpsCounter = new FPSCounter(500);

      // Start hand tracking loop
      handTracker.start(videoElement, handleHandTracking);

      isInitialized = true;
      console.log("Hand Audio Controller initialized");
    } catch (error) {
      console.error("Initialization failed:", error);
      errorMessage = `Initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    } finally {
      isLoading = false;
    }
  };

  /**
   * Initialize audio (requires user interaction)
   */
  const initAudio = async () => {
    if (audioController?.initialized) return;

    try {
      audioController = new AudioController({
        bpm: 120,
        masterVolume: 0.8,
      });
      await audioController.initialize();

      // Connect gesture mapper to audio controller
      if (gestureMapper) {
        gestureMapper.setParameterCallback((deviceId, paramName, value) => {
          audioController?.setParameter(deviceId, paramName, value);
        });
      }

      audioEnabled = true;
      console.log("Audio initialized");
    } catch (error) {
      console.error("Audio initialization failed:", error);
      errorMessage = "Audio initialization failed. Some features may not work.";
    }
  };

  /**
   * Handle hand tracking results each frame
   */
  const handleHandTracking = (result: HandTrackingResult) => {
    if (!overlayRenderer || !gestureMapper) return;

    // Update FPS
    if (fpsCounter) {
      fps = fpsCounter.tick();
    }

    // Update hands detected count
    handsDetected = result.hands.length;

    // Process gesture mappings
    const states = gestureMapper.process(result);
    mappingStates = states;

    // Render overlay graphics
    overlayRenderer.render(result);
  };

  /**
   * Toggle audio playback
   */
  const toggleAudio = async () => {
    if (!audioController) {
      await initAudio();
    }
    await audioController?.togglePlayback();
  };

  /**
   * Handle window resize
   */
  const handleResize = () => {
    containerWidth = window.innerWidth;
    containerHeight = window.innerHeight;
  };

  /**
   * Calculate canvas scale to match video's cover behavior
   */
  const getCanvasScale = () => {
    if (!videoWidth || !videoHeight) return 1;
    const scaleX = containerWidth / videoWidth;
    const scaleY = containerHeight / videoHeight;
    // Use the larger scale to achieve "cover" behavior
    return Math.max(scaleX, scaleY);
  };

  /**
   * Cleanup on unmount
   */
  onMount(() => {
    // Add resize listener
    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      handTracker?.destroy();
      audioController?.destroy();
      overlayRenderer?.reset();

      // Stop camera
      if (videoElement?.srcObject) {
        const tracks = (videoElement.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  });
</script>

<svelte:head>
  <title>Hand Audio Controller</title>
  <meta
    name="description"
    content="Control audio with hand gestures using computer vision"
  />
</svelte:head>

<div class="container" bind:this={containerElement}>
  <!-- Video and Canvas Wrapper - maintains aspect ratio alignment -->
  <div class="media-wrapper">
    <!-- Video Background -->
    <video
      bind:this={videoElement}
      class="video-feed"
      autoplay
      playsinline
      muted
    ></video>

    <!-- Canvas Overlay - scaled to match video's cover behavior -->
    <canvas
      bind:this={canvasElement}
      class="canvas-overlay"
      style="transform: translate(-50%, -50%) scaleX(-1) scale({getCanvasScale()});"
    ></canvas>
  </div>

  <!-- Scan Line Effect -->
  <div class="scan-line"></div>

  <!-- UI Overlay -->
  <div class="ui-overlay">
    <!-- Header -->
    <header class="header">
      <h1 class="title">
        <span class="title-icon">◈</span>
        Hand Audio Controller
      </h1>
      <div class="status">
        {#if isInitialized}
          <span class="status-indicator active"></span>
          <span class="status-text">Active</span>
        {:else}
          <span class="status-indicator"></span>
          <span class="status-text">Inactive</span>
        {/if}
      </div>
    </header>

    <!-- Start Button (shown when not initialized) -->
    {#if !isInitialized}
      <div class="start-screen">
        <div class="start-content">
          <div class="logo-container">
            <div class="logo-ring"></div>
            <div class="logo-icon">✋</div>
          </div>
          <h2>Gesture-Controlled Audio</h2>
          <p>Use your hands to control sound in real-time</p>
          <button
            class="start-button primary"
            onclick={initialize}
            disabled={isLoading}
          >
            {isLoading ? "Initializing..." : "Start Experience"}
          </button>
          {#if errorMessage}
            <p class="error">{errorMessage}</p>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Controls Panel (shown when initialized) -->
    {#if isInitialized}
      <div class="controls-panel panel">
        <div class="controls-header">
          <h3>Controls</h3>
          <button class="icon-button" onclick={() => (showDebug = !showDebug)}>
            {showDebug ? "◉" : "○"}
          </button>
        </div>

        <div class="controls-content">
          <button
            class="control-button"
            class:active={audioEnabled}
            onclick={initAudio}
          >
            <span class="button-icon">{audioEnabled ? "🔊" : "🔇"}</span>
            <span class="button-label"
              >{audioEnabled ? "Audio On" : "Enable Audio"}</span
            >
          </button>

          <button
            class="control-button"
            onclick={toggleAudio}
            disabled={!audioEnabled}
          >
            <span class="button-icon"
              >{audioController?.playing ? "⏸" : "▶"}</span
            >
            <span class="button-label"
              >{audioController?.playing ? "Pause" : "Play"}</span
            >
          </button>
        </div>

        <!-- Gesture Info -->
        <div class="gesture-info">
          <h4>Active Gestures</h4>
          <ul class="gesture-list">
            <li>
              <span class="gesture-name">Pinch</span>
              <span class="gesture-desc">→ Filter Cutoff</span>
            </li>
            <li>
              <span class="gesture-name">Hand Height</span>
              <span class="gesture-desc">→ Volume</span>
            </li>
            <li>
              <span class="gesture-name">Hand Depth</span>
              <span class="gesture-desc">→ Delay</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- Stats Panel -->
      <div class="stats-panel panel">
        <div class="stat">
          <span class="stat-value">{fps}</span>
          <span class="stat-label">FPS</span>
        </div>
        <div class="stat">
          <span class="stat-value">{handsDetected}</span>
          <span class="stat-label">Hands</span>
        </div>
      </div>

      <!-- Debug Panel -->
      {#if showDebug}
        <div class="debug-panel panel">
          <h3>Debug Info</h3>
          <div class="debug-content">
            <p>Video: {videoWidth}×{videoHeight}</p>
            <p>Audio: {audioEnabled ? "Enabled" : "Disabled"}</p>
            <p>Mappings: {gestureMapper?.getMappings().length ?? 0}</p>
            <hr />
            <h4>Mapping States</h4>
            {#each Array.from(mappingStates.entries()) as [id, state]}
              <div class="mapping-state">
                <span class="mapping-id">{id}</span>
                <div class="mapping-bar">
                  <div
                    class="mapping-fill"
                    style="width: {Math.min(100, state.outputValue * 100)}%"
                  ></div>
                </div>
                <span class="mapping-value">{state.outputValue.toFixed(2)}</span
                >
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/if}

    <!-- Footer -->
    <footer class="footer">
      <p>Move your hands in front of the camera to control audio</p>
    </footer>
  </div>
</div>

<style>
  .container {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: var(--color-bg-primary);
  }

  /* Media Wrapper - contains both video and canvas with identical positioning */
  .media-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* Video Feed */
  .video-feed {
    position: absolute;
    top: 50%;
    left: 50%;
    min-width: 100%;
    min-height: 100%;
    width: auto;
    height: auto;
    transform: translate(-50%, -50%) scaleX(-1); /* Center and mirror */
    z-index: var(--z-video);
    filter: brightness(0.7) contrast(1.1);
  }

  /* Canvas Overlay - scaled and positioned to match video exactly */
  .canvas-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    /* Transform is set via inline style with calculated scale */
    z-index: var(--z-canvas);
    pointer-events: none;
  }

  /* Scan Line Effect */
  .scan-line {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: linear-gradient(
      to bottom,
      transparent,
      rgba(0, 255, 255, 0.1),
      transparent
    );
    z-index: var(--z-canvas);
    pointer-events: none;
    animation: scan-line 4s linear infinite;
    opacity: 0.3;
  }

  /* UI Overlay */
  .ui-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: var(--z-ui);
    pointer-events: none;
    display: flex;
    flex-direction: column;
  }

  .ui-overlay > * {
    pointer-events: auto;
  }

  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg);
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0.7), transparent);
  }

  .title {
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .title-icon {
    color: var(--color-cyan);
  }

  .status {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .status-indicator {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--color-red);
    transition: all var(--transition-normal);
  }

  .status-indicator.active {
    background: var(--color-green);
  }

  .status-text {
    font-family: var(--font-mono);
    font-size: 0.875rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  /* Start Screen */
  .start-screen {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .start-content {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
  }

  .logo-container {
    position: relative;
    width: 150px;
    height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .logo-ring {
    position: absolute;
    width: 100%;
    height: 100%;
    border: 2px solid var(--color-cyan);
    border-radius: 50%;
  }

  .logo-ring::before {
    content: "";
    position: absolute;
    top: -10px;
    left: -10px;
    right: -10px;
    bottom: -10px;
    border: 1px solid rgba(0, 255, 255, 0.3);
    border-radius: 50%;
  }

  .logo-icon {
    font-size: 4rem;
    animation: pulse 2s ease-in-out infinite;
  }

  .start-content h2 {
    color: var(--color-cyan);
  }

  .start-content p {
    color: var(--color-text-secondary);
    max-width: 300px;
  }

  .start-button {
    padding: var(--space-md) var(--space-xl);
    font-size: 1rem;
  }

  .error {
    color: var(--color-red);
    font-size: 0.875rem;
  }

  /* Controls Panel */
  .controls-panel {
    position: absolute;
    left: var(--space-lg);
    top: 50%;
    transform: translateY(-50%);
    width: 220px;
  }

  .controls-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .controls-header h3 {
    color: var(--color-cyan);
    font-size: 0.875rem;
  }

  .icon-button {
    width: 32px;
    height: 32px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    background: transparent;
    border: none;
  }

  .controls-content {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    margin-bottom: var(--space-lg);
  }

  .control-button {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    text-align: left;
    width: 100%;
  }

  .control-button.active {
    border-color: var(--color-green);
  }

  .button-icon {
    font-size: 1.25rem;
  }

  .button-label {
    flex: 1;
  }

  .gesture-info h4 {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    margin-bottom: var(--space-sm);
  }

  .gesture-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .gesture-list li {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    font-family: var(--font-mono);
  }

  .gesture-name {
    color: var(--color-magenta);
  }

  .gesture-desc {
    color: var(--color-text-secondary);
  }

  /* Stats Panel */
  .stats-panel {
    position: absolute;
    right: var(--space-lg);
    top: 100px;
    display: flex;
    gap: var(--space-lg);
    padding: var(--space-md) var(--space-lg);
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-value {
    font-family: var(--font-mono);
    font-size: 2rem;
    font-weight: 700;
    color: var(--color-cyan);
    line-height: 1;
  }

  .stat-label {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--color-text-secondary);
  }

  /* Debug Panel */
  .debug-panel {
    position: absolute;
    right: var(--space-lg);
    top: 200px;
    width: 280px;
    max-height: 400px;
    overflow-y: auto;
  }

  .debug-panel h3 {
    font-size: 0.875rem;
    color: var(--color-magenta);
    margin-bottom: var(--space-sm);
  }

  .debug-panel h4 {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    margin: var(--space-sm) 0;
  }

  .debug-content {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }

  .debug-content p {
    margin-bottom: var(--space-xs);
  }

  .debug-content hr {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: var(--space-sm) 0;
  }

  .mapping-state {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    margin-bottom: var(--space-xs);
  }

  .mapping-id {
    width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.625rem;
  }

  .mapping-bar {
    flex: 1;
    height: 8px;
    background: var(--color-bg-tertiary);
    border-radius: 4px;
    overflow: hidden;
  }

  .mapping-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-cyan), var(--color-magenta));
    transition: width 50ms linear;
  }

  .mapping-value {
    width: 40px;
    text-align: right;
    font-size: 0.625rem;
  }

  /* Footer */
  .footer {
    margin-top: auto;
    padding: var(--space-lg);
    text-align: center;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
    pointer-events: none;
  }

  .footer p {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .controls-panel {
      left: var(--space-md);
      width: 180px;
      padding: var(--space-md);
    }

    .stats-panel {
      right: var(--space-md);
      top: 80px;
    }

    .debug-panel {
      display: none;
    }

    .title {
      font-size: 1rem;
    }
  }
</style>
