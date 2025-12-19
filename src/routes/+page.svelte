<script lang="ts">
  import { onMount } from "svelte";
  import { HandTracker } from "$lib/hand-tracking/HandTracker.js";
  import { OverlayRenderer } from "$lib/graphics/OverlayRenderer.js";
  import { AudiotoolController } from "$lib/audio/AudiotoolController.svelte.ts";
  import { FPSCounter } from "$lib/utils/performance.js";
  import {
    getHandTilt,
    getPinchAngle,
    getNormalizedPinchDistance,
    getPinchDistance,
    getHandOpenness,
    getFingerCurl,
    getHandRotation,
    getFingerSpread,
    getPalmFacing,
  } from "$lib/hand-tracking/landmarkUtils.js";
  import { LandmarkIndex } from "$lib/types/hand.js";
  import type { HandTrackingResult, HandResult } from "$lib/types/index.js";

  /**
   * Control source identifiers
   */
  type ControlSourceId =
    | "leftPinchDistance"
    | "rightPinchDistance"
    | "leftThumbX"
    | "leftThumbY"
    | "rightThumbX"
    | "rightThumbY"
    | "leftPinchAngle"
    | "rightPinchAngle";

  /**
   * Control source configuration
   */
  interface ControlSource {
    id: ControlSourceId;
    label: string;
    deviceId: string | null;
    parameterName: string | null;
    value: number;
    enabled: boolean;
  }

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
  let leftHandDetected = $state(false);
  let rightHandDetected = $state(false);
  let currentHandAngle = $state(0.5);
  let showConnectionPanel = $state(true);
  let showControlPanel = $state(true);

  // Gesture values state (for display - only values that are mapped)
  let gestureValues = $state({
    left: {
      pinchDistance: 0,
      thumbX: 0,
      thumbY: 0,
      pinchAngle: 0,
    },
    right: {
      pinchDistance: 0,
      thumbX: 0,
      thumbY: 0,
      pinchAngle: 0,
    },
  });

  let projectUrlInput = $state(import.meta.env.VITE_AUDIOTOOL_PROJECT_URL);

  // Control sources state
  let controlSources = $state<ControlSource[]>([
    {
      id: "leftPinchDistance",
      label: "Left Pinch Distance",
      deviceId: null,
      parameterName: null,
      value: 0,
      enabled: true,
    },
    {
      id: "rightPinchDistance",
      label: "Right Pinch Distance",
      deviceId: null,
      parameterName: null,
      value: 0,
      enabled: true,
    },
    {
      id: "leftThumbX",
      label: "Left Thumb X",
      deviceId: null,
      parameterName: null,
      value: 0,
      enabled: true,
    },
    {
      id: "leftThumbY",
      label: "Left Thumb Y",
      deviceId: null,
      parameterName: null,
      value: 0,
      enabled: true,
    },
    {
      id: "rightThumbX",
      label: "Right Thumb X",
      deviceId: null,
      parameterName: null,
      value: 0,
      enabled: true,
    },
    {
      id: "rightThumbY",
      label: "Right Thumb Y",
      deviceId: null,
      parameterName: null,
      value: 0,
      enabled: true,
    },
    {
      id: "leftPinchAngle",
      label: "Left Pinch Angle",
      deviceId: null,
      parameterName: null,
      value: 0,
      enabled: true,
    },
    {
      id: "rightPinchAngle",
      label: "Right Pinch Angle",
      deviceId: null,
      parameterName: null,
      value: 0,
      enabled: true,
    },
  ]);

  // Camera dimensions
  let videoWidth = $state(1280);
  let videoHeight = $state(720);

  // Container dimensions for scaling canvas
  let containerWidth = $state(1280);
  let containerHeight = $state(720);

  // Local storage key prefix
  const STORAGE_KEY_PREFIX = "air-mod-mappings-";

  /**
   * Stored mapping structure for localStorage
   */
  interface StoredMapping {
    deviceId: string;
    parameterName: string;
    enabled: boolean;
  }

  type StoredMappings = Record<ControlSourceId, StoredMapping | null>;

  /**
   * Get storage key for a project URL
   */
  const getStorageKey = (projectUrl: string): string => {
    // Create a simple hash from the project URL for cleaner keys
    const sanitized = projectUrl.replace(/[^a-zA-Z0-9]/g, "_").slice(0, 100);
    return `${STORAGE_KEY_PREFIX}${sanitized}`;
  };

  /**
   * Save current mappings to localStorage
   */
  const saveMappingsToStorage = (projectUrl: string) => {
    if (!projectUrl) return;

    const mappings: StoredMappings = {} as StoredMappings;
    for (const source of controlSources) {
      if (source.deviceId && source.parameterName) {
        mappings[source.id] = {
          deviceId: source.deviceId,
          parameterName: source.parameterName,
          enabled: source.enabled,
        };
      } else {
        mappings[source.id] = null;
      }
    }

    try {
      localStorage.setItem(getStorageKey(projectUrl), JSON.stringify(mappings));
      console.log("[Storage] Saved mappings for project:", projectUrl);
    } catch (error) {
      console.error("[Storage] Failed to save mappings:", error);
    }
  };

  /**
   * Load mappings from localStorage and validate against current devices
   * Returns the number of mappings that were cleared due to invalid references
   */
  const loadAndValidateMappings = (
    projectUrl: string,
    devices: { id: string; parameters: Map<string, unknown> }[]
  ): number => {
    if (!projectUrl) return 0;

    const storageKey = getStorageKey(projectUrl);
    const stored = localStorage.getItem(storageKey);

    if (!stored) {
      console.log("[Storage] No saved mappings found for project:", projectUrl);
      return 0;
    }

    let mappings: StoredMappings;
    try {
      mappings = JSON.parse(stored);
    } catch (error) {
      console.error("[Storage] Failed to parse stored mappings:", error);
      localStorage.removeItem(storageKey);
      return 0;
    }

    let clearedCount = 0;
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    for (const source of controlSources) {
      const storedMapping = mappings[source.id];

      if (!storedMapping) {
        // No saved mapping for this source
        source.deviceId = null;
        source.parameterName = null;
        continue;
      }

      const { deviceId, parameterName } = storedMapping;

      // Validate device exists
      const device = deviceMap.get(deviceId);
      if (!device) {
        console.log(
          `[Storage] Clearing mapping for ${source.id}: device ${deviceId} not found`
        );
        source.deviceId = null;
        source.parameterName = null;
        clearedCount++;
        continue;
      }

      // Validate parameter exists on the device
      if (!device.parameters.has(parameterName)) {
        console.log(
          `[Storage] Clearing mapping for ${source.id}: parameter ${parameterName} not found on device ${deviceId}`
        );
        source.deviceId = null;
        source.parameterName = null;
        clearedCount++;
        continue;
      }

      // Mapping is valid, restore it
      source.deviceId = deviceId;
      source.parameterName = parameterName;
      source.enabled = storedMapping.enabled ?? true;
      console.log(
        `[Storage] Restored mapping for ${source.id}: ${deviceId} -> ${parameterName} (enabled: ${source.enabled})`
      );
    }

    // If any mappings were cleared, save the updated state
    if (clearedCount > 0) {
      saveMappingsToStorage(projectUrl);
      console.log(
        `[Storage] Cleared ${clearedCount} invalid mapping(s) and saved updated state`
      );
    }

    return clearedCount;
  };

  /**
   * Get parameters for a specific device
   */
  const getDeviceParameters = (deviceId: string | null): string[] => {
    if (!deviceId || !audiotoolController) return [];
    const device = audiotoolController.devices.find((d) => d.id === deviceId);
    if (!device) return [];
    return Array.from(device.parameters.keys());
  };

  /**
   * Extract control values from a hand result
   */
  const extractHandValues = (
    hand: HandResult,
    handedness: "Left" | "Right"
  ) => {
    const landmarks = hand.landmarks;
    const thumbTip = landmarks[LandmarkIndex.THUMB_TIP];

    return {
      pinchDistance: getNormalizedPinchDistance(landmarks),
      thumbX: thumbTip.x,
      thumbY: thumbTip.y,
      pinchAngle: getPinchAngle(landmarks),
    };
  };

  /**
   * Check if a gesture type has any mapped control sources
   */
  const hasMappedGesture = (gestureType: string): boolean => {
    return controlSources.some(
      (source) =>
        source.deviceId &&
        source.parameterName &&
        source.id.toLowerCase().includes(gestureType.toLowerCase())
    );
  };

  /**
   * Check if a gesture type has mapped control sources for a specific hand
   */
  const hasMappedGestureForHand = (
    gestureType: string,
    hand: "left" | "right"
  ): boolean => {
    return controlSources.some(
      (source) =>
        source.deviceId &&
        source.parameterName &&
        source.id.toLowerCase().includes(hand.toLowerCase()) &&
        source.id.toLowerCase().includes(gestureType.toLowerCase())
    );
  };

  /**
   * Update a control source's device mapping
   */
  const updateControlSourceDevice = (
    sourceId: ControlSourceId,
    deviceId: string
  ) => {
    const source = controlSources.find((s) => s.id === sourceId);
    if (source) {
      source.deviceId = deviceId || null;
      source.parameterName = null; // Reset parameter when device changes
      // Save to localStorage
      if (audiotoolController?.projectUrl) {
        saveMappingsToStorage(audiotoolController.projectUrl);
      }
    }
  };

  /**
   * Update a control source's parameter mapping
   */
  const updateControlSourceParameter = (
    sourceId: ControlSourceId,
    paramName: string
  ) => {
    const source = controlSources.find((s) => s.id === sourceId);
    if (source) {
      source.parameterName = paramName || null;
      // Save to localStorage
      if (audiotoolController?.projectUrl) {
        saveMappingsToStorage(audiotoolController.projectUrl);
      }
    }
  };

  /**
   * Toggle a control source's enabled state
   */
  const toggleControlSourceEnabled = (sourceId: ControlSourceId) => {
    const source = controlSources.find((s) => s.id === sourceId);
    if (source) {
      source.enabled = !source.enabled;
      // Save to localStorage
      if (audiotoolController?.projectUrl) {
        saveMappingsToStorage(audiotoolController.projectUrl);
      }
    }
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

    audiotoolController.setProjectUrl(projectUrlInput);
    await audiotoolController.connect();

    if (audiotoolController.connected) {
      // Load and validate saved mappings
      const clearedCount = loadAndValidateMappings(
        projectUrlInput,
        audiotoolController.devices
      );

      if (clearedCount > 0) {
        console.log(
          `[Connection] ${clearedCount} saved mapping(s) were cleared due to missing devices/parameters`
        );
      }

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

    // Find left and right hands
    const leftHand = result.hands.find((h) => h.handedness === "Left");
    const rightHand = result.hands.find((h) => h.handedness === "Right");

    // Update which hands are detected
    leftHandDetected = !!leftHand;
    rightHandDetected = !!rightHand;

    // Extract values from left hand
    if (leftHand) {
      const values = extractHandValues(leftHand, "Left");
      const leftPinchSource = controlSources.find(
        (s) => s.id === "leftPinchDistance"
      );
      const leftThumbXSource = controlSources.find(
        (s) => s.id === "leftThumbX"
      );
      const leftThumbYSource = controlSources.find(
        (s) => s.id === "leftThumbY"
      );
      const leftAngleSource = controlSources.find(
        (s) => s.id === "leftPinchAngle"
      );

      if (leftPinchSource) leftPinchSource.value = values.pinchDistance;
      if (leftThumbXSource) leftThumbXSource.value = values.thumbX;
      if (leftThumbYSource) leftThumbYSource.value = values.thumbY;
      if (leftAngleSource) leftAngleSource.value = values.pinchAngle;
    }

    // Extract values from right hand
    if (rightHand) {
      const values = extractHandValues(rightHand, "Right");
      const rightPinchSource = controlSources.find(
        (s) => s.id === "rightPinchDistance"
      );
      const rightThumbXSource = controlSources.find(
        (s) => s.id === "rightThumbX"
      );
      const rightThumbYSource = controlSources.find(
        (s) => s.id === "rightThumbY"
      );
      const rightAngleSource = controlSources.find(
        (s) => s.id === "rightPinchAngle"
      );

      if (rightPinchSource) rightPinchSource.value = values.pinchDistance;
      if (rightThumbXSource) rightThumbXSource.value = values.thumbX;
      if (rightThumbYSource) rightThumbYSource.value = values.thumbY;
      if (rightAngleSource) rightAngleSource.value = values.pinchAngle;
    }

    // Update legacy currentHandAngle for backward compatibility
    if (result.hands.length > 0) {
      currentHandAngle = getHandTilt(result.hands[0].landmarks);

      // Calculate and update gesture values from both hands
      const leftHand = result.hands.find((h) => h.handedness === "Left");
      const rightHand = result.hands.find((h) => h.handedness === "Right");

      if (leftHand) {
        const values = extractHandValues(leftHand, "Left");
        gestureValues.left = {
          pinchDistance: values.pinchDistance,
          thumbX: values.thumbX,
          thumbY: values.thumbY,
          pinchAngle: values.pinchAngle,
        };
      }

      if (rightHand) {
        const values = extractHandValues(rightHand, "Right");
        gestureValues.right = {
          pinchDistance: values.pinchDistance,
          thumbX: values.thumbX,
          thumbY: values.thumbY,
          pinchAngle: values.pinchAngle,
        };
      }
    }

    // Send values to Audiotool for all mapped and enabled control sources
    if (audiotoolController?.connected) {
      for (const source of controlSources) {
        if (source.deviceId && source.parameterName && source.enabled) {
          await audiotoolController.setParameter(
            source.deviceId,
            source.parameterName,
            source.value
          );
        }
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
        {#if audiotoolController?.connectionState === "connected"}
          <span class="status-indicator connected"></span>
          <span class="status-text">Connected</span>
        {:else if audiotoolController?.connectionState === "connecting"}
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
          <label for="project-url">Project URL</label>
          <input
            id="project-url"
            type="text"
            bind:value={projectUrlInput}
            placeholder="https://beta.audiotool.com/studio?project=..."
            class="text-input"
          />
        </div>

        {#if audiotoolController?.error}
          <p class="error">{audiotoolController.error}</p>
        {/if}

        {#if audiotoolController?.connectionState === "needs_login"}
          <p class="info">You need to log in to Audiotool to continue.</p>
          <button class="connect-button login" onclick={triggerLogin}>
            Log in to Audiotool
          </button>
        {:else}
          <button
            class="connect-button"
            onclick={connectToAudiotool}
            disabled={audiotoolController?.connectionState === "connecting" ||
              !projectUrlInput}
          >
            {audiotoolController?.connectionState === "connecting"
              ? "Connecting..."
              : "Connect"}
          </button>
        {/if}
      </div>
    {/if}

    <!-- Control Sources Panel (shown when connected) -->
    {#if isInitialized && audiotoolController?.connectionState === "connected"}
      {#if showControlPanel}
        <div class="control-panel panel">
          <div class="panel-header">
            <h3>Control Mappings</h3>
            <div class="panel-header-actions">
              <button
                class="icon-button minimize"
                onclick={() => (showControlPanel = false)}
                aria-label="Hide control mappings"
              >
                −
              </button>
              <button
                class="icon-button disconnect"
                onclick={disconnectFromAudiotool}
                aria-label="Disconnect"
              >
                ✕
              </button>
            </div>
          </div>

          <div class="control-sources-list">
            {#each controlSources as source (source.id)}
              <div class="control-source-item" class:disabled={!source.enabled}>
                <div class="control-source-header">
                  <span class="control-source-label">{source.label}</span>
                  <div class="control-source-header-right">
                    <span class="control-source-value"
                      >{(source.value * 100).toFixed(0)}%</span
                    >
                    <button
                      class="toggle-button"
                      class:active={source.enabled}
                      onclick={() => toggleControlSourceEnabled(source.id)}
                      aria-label={source.enabled
                        ? "Disable mapping"
                        : "Enable mapping"}
                    >
                      {source.enabled ? "ON" : "OFF"}
                    </button>
                  </div>
                </div>

                <div class="control-source-bar">
                  <div
                    class="control-source-fill"
                    style="width: {source.value * 100}%"
                  ></div>
                </div>

                <div class="control-source-mapping">
                  <select
                    class="select-input compact"
                    value={source.deviceId ?? ""}
                    onchange={(e) =>
                      updateControlSourceDevice(
                        source.id,
                        (e.target as HTMLSelectElement).value
                      )}
                  >
                    <option value="">No device</option>
                    {#each audiotoolController.devices as device}
                      <option value={device.id}>{device.name}</option>
                    {/each}
                  </select>

                  {#if source.deviceId}
                    <select
                      class="select-input compact"
                      value={source.parameterName ?? ""}
                      onchange={(e) =>
                        updateControlSourceParameter(
                          source.id,
                          (e.target as HTMLSelectElement).value
                        )}
                    >
                      <option value="">No param</option>
                      {#each getDeviceParameters(source.deviceId) as param}
                        <option value={param}>{param}</option>
                      {/each}
                    </select>
                  {/if}
                </div>
              </div>
            {/each}
          </div>

          <div class="gesture-hint">
            <p>Use both hands to control multiple parameters</p>
          </div>
        </div>
      {:else}
        <button
          class="control-panel-toggle"
          onclick={() => (showControlPanel = true)}
          aria-label="Show control mappings"
        >
          Control Mappings
        </button>
      {/if}
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

    <!-- Gesture Values Panel -->
    {#if isInitialized && handsDetected > 0}
      <div class="gesture-values-panel">
        {#if hasMappedGesture("pinchdistance")}
          {#if hasMappedGestureForHand("pinchdistance", "left") && leftHandDetected}
            <div class="gesture-value-item">
              <span class="gesture-label">Left Pinch Distance:</span>
              <span class="gesture-value"
                >{gestureValues.left.pinchDistance.toFixed(3)}</span
              >
              <span class="gesture-percentage"
                >({(gestureValues.left.pinchDistance * 100).toFixed(0)}%)</span
              >
            </div>
          {/if}
          {#if hasMappedGestureForHand("pinchdistance", "right") && rightHandDetected}
            <div class="gesture-value-item">
              <span class="gesture-label">Right Pinch Distance:</span>
              <span class="gesture-value"
                >{gestureValues.right.pinchDistance.toFixed(3)}</span
              >
              <span class="gesture-percentage"
                >({(gestureValues.right.pinchDistance * 100).toFixed(0)}%)</span
              >
            </div>
          {/if}
        {/if}
        {#if hasMappedGesture("thumbx")}
          {#if hasMappedGestureForHand("thumbx", "left") && leftHandDetected}
            <div class="gesture-value-item">
              <span class="gesture-label">Left Thumb X:</span>
              <span class="gesture-value"
                >{gestureValues.left.thumbX.toFixed(3)}</span
              >
              <span class="gesture-percentage"
                >({(gestureValues.left.thumbX * 100).toFixed(0)}%)</span
              >
            </div>
          {/if}
          {#if hasMappedGestureForHand("thumbx", "right") && rightHandDetected}
            <div class="gesture-value-item">
              <span class="gesture-label">Right Thumb X:</span>
              <span class="gesture-value"
                >{gestureValues.right.thumbX.toFixed(3)}</span
              >
              <span class="gesture-percentage"
                >({(gestureValues.right.thumbX * 100).toFixed(0)}%)</span
              >
            </div>
          {/if}
        {/if}
        {#if hasMappedGesture("thumby")}
          {#if hasMappedGestureForHand("thumby", "left") && leftHandDetected}
            <div class="gesture-value-item">
              <span class="gesture-label">Left Thumb Y:</span>
              <span class="gesture-value"
                >{gestureValues.left.thumbY.toFixed(3)}</span
              >
              <span class="gesture-percentage"
                >({(gestureValues.left.thumbY * 100).toFixed(0)}%)</span
              >
            </div>
          {/if}
          {#if hasMappedGestureForHand("thumby", "right") && rightHandDetected}
            <div class="gesture-value-item">
              <span class="gesture-label">Right Thumb Y:</span>
              <span class="gesture-value"
                >{gestureValues.right.thumbY.toFixed(3)}</span
              >
              <span class="gesture-percentage"
                >({(gestureValues.right.thumbY * 100).toFixed(0)}%)</span
              >
            </div>
          {/if}
        {/if}
        {#if hasMappedGesture("pinchangle")}
          {#if hasMappedGestureForHand("pinchangle", "left") && leftHandDetected}
            <div class="gesture-value-item">
              <span class="gesture-label">Left Pinch Angle:</span>
              <span class="gesture-value"
                >{gestureValues.left.pinchAngle.toFixed(3)}</span
              >
              <span class="gesture-percentage"
                >({(gestureValues.left.pinchAngle * 100).toFixed(0)}%)</span
              >
            </div>
          {/if}
          {#if hasMappedGestureForHand("pinchangle", "right") && rightHandDetected}
            <div class="gesture-value-item">
              <span class="gesture-label">Right Pinch Angle:</span>
              <span class="gesture-value"
                >{gestureValues.right.pinchAngle.toFixed(3)}</span
              >
              <span class="gesture-percentage"
                >({(gestureValues.right.pinchAngle * 100).toFixed(0)}%)</span
              >
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Debug Panel -->
    {#if isInitialized && showDebug}
      <div class="debug-panel panel">
        <h3>Debug Info</h3>
        <div class="debug-content">
          <p>Video: {videoWidth}×{videoHeight}</p>
          <p>Connection: {audiotoolController?.connectionState ?? "none"}</p>
          <p>Devices: {audiotoolController?.devices.length ?? 0}</p>
          <p>Selected: {audiotoolController?.selectedDeviceId ?? "none"}</p>
          <p>
            Parameter: {audiotoolController?.selectedParameterName ?? "none"}
          </p>
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
    width: 320px;
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

  .panel-header-actions {
    display: flex;
    gap: var(--space-xs);
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

  .icon-button.minimize:hover {
    border-color: var(--color-cyan);
    color: var(--color-cyan);
  }

  .control-panel-toggle {
    position: absolute;
    left: var(--space-lg);
    bottom: 100px;
    transform: translateY(-50%);
    padding: var(--space-sm) var(--space-md);
    font-size: 0.875rem;
    font-family: var(--font-mono);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--color-bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .control-panel-toggle:hover {
    border-color: var(--color-cyan);
    color: var(--color-cyan);
  }

  .gesture-hint {
    margin-top: var(--space-lg);
    text-align: center;
  }

  .gesture-hint p {
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }

  /* Control Sources List */
  .control-sources-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    max-height: 60vh;
    overflow-y: auto;
    padding-right: var(--space-xs);
  }

  .control-sources-list::-webkit-scrollbar {
    width: 4px;
  }

  .control-sources-list::-webkit-scrollbar-track {
    background: var(--color-bg-tertiary);
    border-radius: 2px;
  }

  .control-sources-list::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 2px;
  }

  .control-source-item {
    background: var(--color-bg-tertiary);
    border-radius: var(--radius-md);
    padding: var(--space-sm);
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .control-source-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .control-source-header-right {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .control-source-label {
    font-size: 0.75rem;
    font-family: var(--font-mono);
    color: var(--color-magenta);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .control-source-value {
    font-size: 0.75rem;
    font-family: var(--font-mono);
    font-weight: 700;
    color: var(--color-cyan);
  }

  .toggle-button {
    padding: 2px 6px;
    font-size: 0.6rem;
    font-family: var(--font-mono);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--color-bg);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .toggle-button:hover {
    border-color: var(--color-text-secondary);
  }

  .toggle-button.active {
    background: var(--color-green);
    border-color: var(--color-green);
    color: var(--color-bg);
  }

  .toggle-button.active:hover {
    background: transparent;
    color: var(--color-green);
  }

  .control-source-item.disabled {
    opacity: 0.5;
  }

  .control-source-item.disabled .control-source-fill {
    background: var(--color-text-tertiary);
  }

  .control-source-bar {
    height: 4px;
    background: var(--color-bg);
    border-radius: 2px;
    overflow: hidden;
  }

  .control-source-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--color-cyan), var(--color-magenta));
    transition: width 0.05s ease-out;
  }

  .control-source-mapping {
    display: flex;
    gap: var(--space-xs);
  }

  .select-input.compact {
    padding: var(--space-xs) var(--space-sm);
    font-size: 0.7rem;
    flex: 1;
    min-width: 0;
  }

  /* Stats Panel*/
  .stats-panel {
    position: absolute;
    right: var(--space-lg);
    top: 100px;
    text-transform: uppercase;
    font-family: var(--font-mono);
    letter-spacing: 0.1em;
    font-size: 0.625rem;
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

  /* Gesture Values Panel */
  .gesture-values-panel {
    position: absolute;
    right: var(--space-lg);
    top: 400px;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    font-family: var(--font-mono);
    font-size: 0.75rem;
    background: black;
    padding: var(--space-sm);
  }

  .gesture-value-item {
    display: flex;
    gap: var(--space-sm);
  }
  .gesture-value {
    font-weight: 700;
  }

  .gesture-percentage {
    font-size: 0.7rem;
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
      width: calc(100vw - var(--space-md) * 2);
      max-width: 300px;
      padding: var(--space-md);
    }

    .control-sources-list {
      max-height: 40vh;
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
