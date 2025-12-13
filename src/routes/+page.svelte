<script lang="ts">
  import { onMount } from "svelte";
  import { HandTracker } from "$lib/hand-tracking/HandTracker.js";
  import { OverlayRenderer } from "$lib/graphics/OverlayRenderer.js";
  import {
    AudiotoolController,
    type AudiotoolDevice,
  } from "$lib/audio/AudiotoolController.js";
  import { FPSCounter } from "$lib/utils/performance.js";
  import { getHandTilt } from "$lib/hand-tracking/landmarkUtils.js";
  import type { HandTrackingResult } from "$lib/types/index.js";

  // Props from server load function
  let { data } = $props();

  // State
  let videoElement: HTMLVideoElement;
  let canvasElement: HTMLCanvasElement;
  let containerElement: HTMLDivElement;

  // Modules (not reactive - internal references only)
  let handTracker: HandTracker | null = null;
  let overlayRenderer: OverlayRenderer | null = null;
  let fpsCounter: FPSCounter | null = null;

  // Audiotool controller (reactive for UI updates)
  let audiotoolController = $state<AudiotoolController | null>(null);

  // UI State
  let isInitialized = $state(false);
  let isLoading = $state(false);
  let errorMessage = $state("");
  let fps = $state(0);
  let showDebug = $state(false);
  let handsDetected = $state(0);
  let currentHandAngle = $state(0.5);
  let showConnectionPanel = $state(true);

  // Audiotool connection state - pre-fill from server-loaded env vars
  let clientIdInput = $state(data.clientId);
  let projectUrlInput = $state(data.projectUrl);
  let connectionState = $state<
    "disconnected" | "connecting" | "connected" | "error" | "needs_login"
  >("disconnected");
  let connectionError = $state("");

  // Device selection
  let devices = $state<AudiotoolDevice[]>([]);
  let selectedDeviceId = $state<string | null>(null);
  let selectedParameterName = $state<string | null>(null);

  // Camera dimensions
  let videoWidth = $state(1280);
  let videoHeight = $state(720);

  // Container dimensions for scaling canvas
  let containerWidth = $state(1280);
  let containerHeight = $state(720);

  /**
   * Get parameters for selected device
   */
  const getSelectedDeviceParameters = (): string[] => {
    if (!selectedDeviceId) return [];
    const device = devices.find((d) => d.id === selectedDeviceId);
    if (!device) return [];
    return Array.from(device.parameters.keys());
  };

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

      // Initialize overlay renderer with PixiJS
      canvasElement.width = videoWidth;
      canvasElement.height = videoHeight;
      overlayRenderer = new OverlayRenderer({}, false);
      await overlayRenderer.initialize(canvasElement);

      // Initialize Audiotool controller
      audiotoolController = new AudiotoolController();
      audiotoolController.setStateChangeCallback(() => {
        // Update reactive state from controller
        connectionState =
          audiotoolController?.connectionState ?? "disconnected";
        connectionError = audiotoolController?.error ?? "";
        devices = audiotoolController?.devices ?? [];
        selectedDeviceId = audiotoolController?.selectedDeviceId ?? null;
        selectedParameterName =
          audiotoolController?.selectedParameterName ?? null;
      });

      // Initialize FPS counter
      fpsCounter = new FPSCounter(500);

      // Start hand tracking loop
      handTracker.start(videoElement, handleHandTracking);

      isInitialized = true;
    } catch (error) {
      console.error("Initialization failed:", error);
      errorMessage = `Initialization failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    } finally {
      isLoading = false;
    }
  };

  /**
   * Connect to Audiotool project
   */
  const connectToAudiotool = async () => {
    if (!audiotoolController) return;

    audiotoolController.setClientId(clientIdInput);
    audiotoolController.setProjectUrl(projectUrlInput);
    await audiotoolController.connect();

    if (audiotoolController.connected) {
      showConnectionPanel = false;
    }
  };

  /**
   * Trigger Audiotool login
   */
  const triggerLogin = () => {
    if (audiotoolController) {
      audiotoolController.triggerLogin();
    }
  };

  /**
   * Disconnect from Audiotool
   */
  const disconnectFromAudiotool = async () => {
    if (!audiotoolController) return;
    await audiotoolController.disconnect();
    showConnectionPanel = true;
  };

  /**
   * Handle device selection
   */
  const handleDeviceSelect = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const deviceId = target.value;
    if (deviceId && audiotoolController) {
      audiotoolController.selectDevice(deviceId);
      selectedDeviceId = deviceId;
      selectedParameterName = null;
    }
  };

  /**
   * Handle parameter selection
   */
  const handleParameterSelect = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    const paramName = target.value;
    if (paramName && audiotoolController) {
      audiotoolController.selectParameter(paramName);
      selectedParameterName = paramName;
    }
  };

  /**
   * Handle hand tracking results each frame
   */
  const handleHandTracking = async (result: HandTrackingResult) => {
    if (!overlayRenderer) return;

    // Update FPS
    if (fpsCounter) {
      fps = fpsCounter.tick();
    }

    // Update hands detected count
    handsDetected = result.hands.length;

    // Process hand angle and send to Audiotool
    if (result.hands.length > 0) {
      const hand = result.hands[0];
      const tilt = getHandTilt(hand.landmarks);
      currentHandAngle = tilt;

      // Send to Audiotool if connected and parameter selected
      if (
        audiotoolController?.connected &&
        selectedDeviceId &&
        selectedParameterName
      ) {
        await audiotoolController.setSelectedParameter(tilt);
      }
    }

    // Render overlay graphics
    overlayRenderer.render(result);
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
    return Math.max(scaleX, scaleY);
  };

  /**
   * Cleanup on unmount
   */
  onMount(() => {
    window.addEventListener("resize", handleResize);
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
      handTracker?.destroy();
      audiotoolController?.destroy();
      overlayRenderer?.destroy();

      if (videoElement?.srcObject) {
        const tracks = (videoElement.srcObject as MediaStream).getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  });
</script>

<svelte:head>
  <title>Air Mod – Audiotool Gesture Control</title>
</svelte:head>

<div class="container" bind:this={containerElement}>
  <!-- Video and Canvas Wrapper -->
  <div class="media-wrapper">
    <video
      bind:this={videoElement}
      class="video-feed"
      autoplay
      playsinline
      muted
    ></video>

    <canvas
      bind:this={canvasElement}
      class="canvas-overlay"
      style="transform: translate(-50%, -50%) scaleX(-1) scale({getCanvasScale()});"
    ></canvas>
  </div>

  <!-- UI Overlay -->
  <div class="ui-overlay">
    <!-- Header -->
    <header class="header">
      <h1 class="title">
        <span class="title-icon">◈</span>
        Air Mod
      </h1>
      <div class="status">
        {#if connectionState === "connected"}
          <span class="status-indicator connected"></span>
          <span class="status-text">Connected</span>
        {:else if connectionState === "connecting"}
          <span class="status-indicator connecting"></span>
          <span class="status-text">Connecting...</span>
        {:else}
          <span class="status-indicator"></span>
          <span class="status-text">Disconnected</span>
        {/if}
      </div>
    </header>

    <!-- Start Button (shown when not initialized) -->
    {#if !isInitialized}
      <div class="start-screen">
        <div class="start-content">
          <h2>Gesture-Controlled Audio</h2>
          <p>Control Audiotool devices with your hands</p>
          <button
            class="start-button"
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

    <!-- Connection Panel -->
    {#if isInitialized && showConnectionPanel}
      <div class="connection-panel panel">
        <h3>Connect to Audiotool</h3>

        <div class="form-group">
          <label for="client-id">Client ID</label>
          <input
            id="client-id"
            type="text"
            bind:value={clientIdInput}
            placeholder="your-app-client-id"
            class="text-input"
          />
          <a
            href="https://developer.audiotool.com/applications"
            target="_blank"
            rel="noopener"
            class="help-link"
          >
            Create an app →
          </a>
        </div>

        <div class="form-group">
          <label for="project-url">Project URL</label>
          <input
            id="project-url"
            type="text"
            bind:value={projectUrlInput}
            placeholder="https://beta.audiotool.com/studio?project=..."
            class="text-input"
          />
        </div>

        {#if connectionError}
          <p class="error">{connectionError}</p>
        {/if}

        {#if connectionState === "needs_login"}
          <p class="info">You need to log in to Audiotool to continue.</p>
          <button class="connect-button login" onclick={triggerLogin}>
            Log in to Audiotool
          </button>
        {:else}
          <button
            class="connect-button"
            onclick={connectToAudiotool}
            disabled={connectionState === "connecting" ||
              !clientIdInput ||
              !projectUrlInput}
          >
            {connectionState === "connecting" ? "Connecting..." : "Connect"}
          </button>
        {/if}
      </div>
    {/if}

    <!-- Device Control Panel (shown when connected) -->
    {#if isInitialized && connectionState === "connected"}
      <div class="control-panel panel">
        <div class="panel-header">
          <h3>Device Control</h3>
          <button
            class="icon-button disconnect"
            onclick={disconnectFromAudiotool}
          >
            ✕
          </button>
        </div>

        <div class="form-group">
          <label for="device-select">Device</label>
          <select
            id="device-select"
            class="select-input"
            onchange={handleDeviceSelect}
            value={selectedDeviceId ?? ""}
          >
            <option value="" disabled>Select a device...</option>
            {#each devices as device}
              <option value={device.id}>{device.name}</option>
            {/each}
          </select>
        </div>

        {#if selectedDeviceId}
          <div class="form-group">
            <label for="param-select">Parameter</label>
            <select
              id="param-select"
              class="select-input"
              onchange={handleParameterSelect}
              value={selectedParameterName ?? ""}
            >
              <option value="" disabled>Select a parameter...</option>
              {#each getSelectedDeviceParameters() as param}
                <option value={param}>{param}</option>
              {/each}
            </select>
          </div>
        {/if}

        {#if selectedParameterName}
          <div class="control-active">
            <div class="control-info">
              <span class="control-label"
                >Hand Tilt → {selectedParameterName}</span
              >
              <span class="control-value"
                >{(currentHandAngle * 100).toFixed(0)}%</span
              >
            </div>
            <div class="control-bar">
              <div
                class="control-fill"
                style="width: {currentHandAngle * 100}%"
              ></div>
              <div
                class="control-indicator"
                style="left: {currentHandAngle * 100}%"
              ></div>
            </div>
          </div>
        {/if}

        <div class="gesture-hint">
          <p>Tilt your hand up/down to control the parameter</p>
        </div>
      </div>
    {/if}

    <!-- Stats Panel -->
    {#if isInitialized}
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
    {/if}

    <!-- Debug Panel -->
    {#if isInitialized && showDebug}
      <div class="debug-panel panel">
        <h3>Debug Info</h3>
        <div class="debug-content">
          <p>Video: {videoWidth}×{videoHeight}</p>
          <p>Connection: {connectionState}</p>
          <p>Devices: {devices.length}</p>
          <p>Selected: {selectedDeviceId ?? "none"}</p>
          <p>Parameter: {selectedParameterName ?? "none"}</p>
          <p>Hand Angle: {currentHandAngle.toFixed(3)}</p>
        </div>
      </div>
    {/if}

    <!-- Debug Toggle -->
    {#if isInitialized}
      <button
        class="debug-toggle"
        onclick={() => (showDebug = !showDebug)}
        aria-label="Toggle debug panel"
      >
        {showDebug ? "◉" : "○"}
      </button>
    {/if}

    <!-- Footer -->
    <footer class="footer">
      <p>Tilt your hand to control Audiotool parameters</p>
    </footer>
  </div>
</div>

<style>
  .container {
    position: relative;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .media-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .video-feed {
    position: absolute;
    top: 50%;
    left: 50%;
    min-width: 100%;
    min-height: 100%;
    width: auto;
    height: auto;
    transform: translate(-50%, -50%) scaleX(-1);
    z-index: var(--z-video);
    filter: brightness(0.7) contrast(1.1);
  }

  .canvas-overlay {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: var(--z-canvas);
    pointer-events: none;
  }

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

  .status-indicator.connected {
    background: var(--color-green);
    box-shadow: 0 0 8px var(--color-green);
  }

  .status-indicator.connecting {
    background: var(--color-yellow);
    animation: pulse 1s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
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
    color: white;
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

  .info {
    color: var(--color-yellow);
    font-size: 0.875rem;
    margin-bottom: var(--space-sm);
  }

  .connect-button.login {
    background: var(--color-cyan);
    border-color: var(--color-cyan);
  }

  .connect-button.login:hover {
    background: transparent;
    color: var(--color-cyan);
  }

  /* Panels */
  .panel {
    background: var(--color-bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--space-lg);
    backdrop-filter: blur(12px);
  }

  .panel h3 {
    font-size: 0.875rem;
    margin-bottom: var(--space-md);
    color: var(--color-cyan);
  }

  /* Connection Panel */
  .connection-panel {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 360px;
    max-width: 90vw;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-bottom: var(--space-md);
  }

  .form-group label {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .text-input,
  .select-input {
    background: var(--color-bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: var(--space-sm) var(--space-md);
    font-size: 0.875rem;
    color: var(--color-text);
    font-family: var(--font-mono);
    transition: border-color var(--transition-fast);
  }

  .text-input:focus,
  .select-input:focus {
    outline: none;
    border-color: var(--color-cyan);
  }

  .text-input::placeholder {
    color: var(--color-text-tertiary);
  }

  .help-link {
    font-size: 0.75rem;
    color: var(--color-cyan);
    text-decoration: none;
  }

  .help-link:hover {
    text-decoration: underline;
  }

  .connect-button {
    width: 100%;
    padding: var(--space-md);
    font-size: 1rem;
    margin-top: var(--space-sm);
  }

  /* Control Panel */
  .control-panel {
    position: absolute;
    left: var(--space-lg);
    top: 50%;
    transform: translateY(-50%);
    width: 280px;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-md);
  }

  .panel-header h3 {
    margin-bottom: 0;
  }

  .icon-button {
    width: 28px;
    height: 28px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
    background: transparent;
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .icon-button:hover {
    border-color: var(--color-red);
    color: var(--color-red);
  }

  .control-active {
    margin-top: var(--space-lg);
    padding: var(--space-md);
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
  }

  .control-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-sm);
  }

  .control-label {
    font-size: 0.75rem;
    color: var(--color-magenta);
    font-family: var(--font-mono);
  }

  .control-value {
    font-size: 0.875rem;
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--color-cyan);
  }

  .control-bar {
    position: relative;
    height: 8px;
    background: var(--color-bg);
    border-radius: 4px;
    overflow: visible;
  }

  .control-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-cyan), var(--color-magenta));
    border-radius: 4px;
    transition: width 0.05s ease-out;
  }

  .control-indicator {
    position: absolute;
    top: 50%;
    width: 16px;
    height: 16px;
    background: white;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
    transition: left 0.05s ease-out;
  }

  .gesture-hint {
    margin-top: var(--space-lg);
    text-align: center;
  }

  .gesture-hint p {
    font-size: 0.75rem;
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
    width: 240px;
  }

  .debug-panel h3 {
    color: var(--color-magenta);
    margin-bottom: var(--space-sm);
  }

  .debug-content {
    font-family: var(--font-mono);
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }

  .debug-content p {
    margin-bottom: var(--space-xs);
  }

  .debug-toggle {
    position: absolute;
    right: var(--space-lg);
    bottom: 80px;
    width: 40px;
    height: 40px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    background: var(--color-bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 50%;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .debug-toggle:hover {
    border-color: var(--color-cyan);
    color: var(--color-cyan);
  }

  /* Footer */
  .footer {
    margin-top: auto;
    padding: var(--space-lg);
    text-align: center;
    pointer-events: none;
  }

  .footer p {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .connection-panel {
      width: 90vw;
      padding: var(--space-md);
    }

    .control-panel {
      left: var(--space-md);
      width: 240px;
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
