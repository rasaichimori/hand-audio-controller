import { w as head, x as attr } from "../../chunks/index.js";
import "@mediapipe/tasks-vision";
import { e as escape_html } from "../../chunks/context.js";
var LandmarkIndex = /* @__PURE__ */ ((LandmarkIndex2) => {
  LandmarkIndex2[LandmarkIndex2["WRIST"] = 0] = "WRIST";
  LandmarkIndex2[LandmarkIndex2["THUMB_CMC"] = 1] = "THUMB_CMC";
  LandmarkIndex2[LandmarkIndex2["THUMB_MCP"] = 2] = "THUMB_MCP";
  LandmarkIndex2[LandmarkIndex2["THUMB_IP"] = 3] = "THUMB_IP";
  LandmarkIndex2[LandmarkIndex2["THUMB_TIP"] = 4] = "THUMB_TIP";
  LandmarkIndex2[LandmarkIndex2["INDEX_MCP"] = 5] = "INDEX_MCP";
  LandmarkIndex2[LandmarkIndex2["INDEX_PIP"] = 6] = "INDEX_PIP";
  LandmarkIndex2[LandmarkIndex2["INDEX_DIP"] = 7] = "INDEX_DIP";
  LandmarkIndex2[LandmarkIndex2["INDEX_TIP"] = 8] = "INDEX_TIP";
  LandmarkIndex2[LandmarkIndex2["MIDDLE_MCP"] = 9] = "MIDDLE_MCP";
  LandmarkIndex2[LandmarkIndex2["MIDDLE_PIP"] = 10] = "MIDDLE_PIP";
  LandmarkIndex2[LandmarkIndex2["MIDDLE_DIP"] = 11] = "MIDDLE_DIP";
  LandmarkIndex2[LandmarkIndex2["MIDDLE_TIP"] = 12] = "MIDDLE_TIP";
  LandmarkIndex2[LandmarkIndex2["RING_MCP"] = 13] = "RING_MCP";
  LandmarkIndex2[LandmarkIndex2["RING_PIP"] = 14] = "RING_PIP";
  LandmarkIndex2[LandmarkIndex2["RING_DIP"] = 15] = "RING_DIP";
  LandmarkIndex2[LandmarkIndex2["RING_TIP"] = 16] = "RING_TIP";
  LandmarkIndex2[LandmarkIndex2["PINKY_MCP"] = 17] = "PINKY_MCP";
  LandmarkIndex2[LandmarkIndex2["PINKY_PIP"] = 18] = "PINKY_PIP";
  LandmarkIndex2[LandmarkIndex2["PINKY_DIP"] = 19] = "PINKY_DIP";
  LandmarkIndex2[LandmarkIndex2["PINKY_TIP"] = 20] = "PINKY_TIP";
  return LandmarkIndex2;
})(LandmarkIndex || {});
const DEFAULT_SMOOTHING = {
  type: "one-euro",
  minCutoff: 1,
  beta: 7e-3,
  dCutoff: 1
};
const createMapping = (id, name, input, output, smoothing = {}) => ({
  id,
  name,
  enabled: true,
  input: {
    hand: "any",
    inputRange: [0, 1],
    curve: "linear",
    ...input
  },
  output,
  smoothing: { ...DEFAULT_SMOOTHING, ...smoothing }
});
createMapping(
  "pinch-filter-cutoff",
  "Pinch → Filter Cutoff",
  {
    type: "pinch_distance",
    hand: "Right",
    finger: LandmarkIndex.INDEX_TIP,
    inputRange: [0.02, 0.15],
    // Pinch distance range (normalized)
    curve: "smooth-step"
  },
  {
    deviceId: "filter",
    parameterName: "cutoff",
    outputRange: [0.1, 1]
  },
  {
    type: "one-euro",
    minCutoff: 1.5,
    beta: 0.01
  }
);
createMapping(
  "wrist-y-volume",
  "Hand Height → Volume",
  {
    type: "wrist_position_y",
    hand: "any",
    inputRange: [0.2, 0.8],
    // Screen position range
    curve: "linear"
  },
  {
    deviceId: "master",
    parameterName: "gain",
    outputRange: [0, 1],
    invert: true
    // Higher position = lower y value
  },
  {
    type: "one-euro",
    minCutoff: 0.5,
    beta: 5e-3
  }
);
createMapping(
  "depth-delay-mix",
  "Hand Depth → Delay Mix",
  {
    type: "wrist_depth",
    hand: "Right",
    inputRange: [-0.1, 0.1],
    // Z-depth range
    curve: "smooth-step"
  },
  {
    deviceId: "delay",
    parameterName: "mix",
    outputRange: [0, 0.8]
  },
  {
    type: "one-euro",
    minCutoff: 1,
    beta: 8e-3
  }
);
createMapping(
  "rotation-pan",
  "Hand Rotation → Pan",
  {
    type: "hand_rotation",
    hand: "Right",
    inputRange: [-Math.PI / 3, Math.PI / 3],
    // ±60 degrees
    curve: "linear"
  },
  {
    deviceId: "synth",
    parameterName: "pan",
    outputRange: [0, 1]
  },
  {
    type: "one-euro",
    minCutoff: 2,
    beta: 0.015
  }
);
createMapping(
  "openness-resonance",
  "Hand Open → Resonance",
  {
    type: "hand_openness",
    hand: "Left",
    inputRange: [0.1, 0.4],
    // Openness range
    curve: "exponential"
  },
  {
    deviceId: "filter",
    parameterName: "resonance",
    outputRange: [0, 0.9]
  },
  {
    type: "one-euro",
    minCutoff: 1,
    beta: 0.01
  }
);
createMapping(
  "curl-attack",
  "Index Curl → Attack",
  {
    type: "finger_curl",
    hand: "Left",
    finger: LandmarkIndex.INDEX_TIP,
    inputRange: [0.2, 0.8],
    curve: "smooth-step"
  },
  {
    deviceId: "synth",
    parameterName: "attack",
    outputRange: [0.01, 0.5]
  },
  {
    type: "one-euro",
    minCutoff: 0.8,
    beta: 5e-3
  }
);
createMapping(
  "wrist-x-detune",
  "Hand X → Detune",
  {
    type: "wrist_position_x",
    hand: "Right",
    inputRange: [0.2, 0.8],
    curve: "linear"
  },
  {
    deviceId: "synth",
    parameterName: "detune",
    outputRange: [-50, 50]
  },
  {
    type: "one-euro",
    minCutoff: 2,
    beta: 0.02
  }
);
createMapping(
  "pinky-pinch-feedback",
  "Thumb-Pinky → Delay Feedback",
  {
    type: "pinch_distance",
    hand: "Left",
    finger: LandmarkIndex.PINKY_TIP,
    inputRange: [0.03, 0.2],
    curve: "smooth-step"
  },
  {
    deviceId: "delay",
    parameterName: "feedback",
    outputRange: [0.1, 0.85]
  },
  {
    type: "one-euro",
    minCutoff: 1,
    beta: 8e-3
  }
);
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let isLoading = false;
    head("1uha8ag", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Hand Audio Controller</title>`);
      });
      $$renderer3.push(`<meta name="description" content="Control audio with hand gestures using computer vision"/>`);
    });
    $$renderer2.push(`<div class="container svelte-1uha8ag"><video class="video-feed svelte-1uha8ag" autoplay playsinline muted></video> <canvas class="canvas-overlay svelte-1uha8ag"></canvas> <div class="scan-line svelte-1uha8ag"></div> <div class="ui-overlay svelte-1uha8ag"><header class="header svelte-1uha8ag"><h1 class="title svelte-1uha8ag"><span class="title-icon svelte-1uha8ag">◈</span> Hand Audio Controller</h1> <div class="status svelte-1uha8ag">`);
    {
      $$renderer2.push("<!--[!-->");
      $$renderer2.push(`<span class="status-indicator svelte-1uha8ag"></span> <span class="status-text svelte-1uha8ag">Inactive</span>`);
    }
    $$renderer2.push(`<!--]--></div></header> `);
    {
      $$renderer2.push("<!--[-->");
      $$renderer2.push(`<div class="start-screen svelte-1uha8ag"><div class="start-content svelte-1uha8ag"><div class="logo-container svelte-1uha8ag"><div class="logo-ring svelte-1uha8ag"></div> <div class="logo-icon svelte-1uha8ag">✋</div></div> <h2 class="svelte-1uha8ag">Gesture-Controlled Audio</h2> <p class="svelte-1uha8ag">Use your hands to control sound in real-time</p> <button class="start-button primary svelte-1uha8ag"${attr("disabled", isLoading, true)}>${escape_html("Start Experience")}</button> `);
      {
        $$renderer2.push("<!--[!-->");
      }
      $$renderer2.push(`<!--]--></div></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[!-->");
    }
    $$renderer2.push(`<!--]--> <footer class="footer svelte-1uha8ag"><p class="svelte-1uha8ag">Move your hands in front of the camera to control audio</p></footer></div></div>`);
  });
}
export {
  _page as default
};
