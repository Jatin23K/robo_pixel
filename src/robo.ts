import "./style.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { createInitialRoboState, type RoboVisualState } from "./robo/state";
import { RoboRenderer } from "./robo/renderer";
import quotesData from "./quotes.json";

const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
const appWindow = isTauri ? getCurrentWindow() : null;

const canvas = document.querySelector<HTMLCanvasElement>("#pet-canvas");
if (!canvas) throw new Error("Canvas not found");

const renderer = new RoboRenderer(canvas);
let state = createInitialRoboState();
if (!appWindow) {
  try {
    const saved = localStorage.getItem("robo_canvas_pos");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed.x === "number" && typeof parsed.y === "number") {
        state.x = parsed.x;
        state.y = parsed.y;
      }
    }
  } catch (_) {}
} else {
  state.x = 128;
  state.y = 104;
}
let lastTick = performance.now();

let osContext = { active_window_title: "", active_process_name: "", idle_time_ms: 0 };

const handlePayload = (p: any) => {
  if (!p) return;
  const newTitle = p.active_window_title || p.window_title || "";
  const newProc = p.active_process_name || p.active_process || "";
  const idle = p.idle_time_ms ?? (p.idle_seconds ? p.idle_seconds * 1000 : 0);

  if (newProc && newProc !== "unknown" && newProc !== "robo.exe" && newProc !== "pixel-pet.exe") {
    osContext.active_process_name = newProc;
  }
  if (newTitle && newTitle !== "ROBO") {
    osContext.active_window_title = newTitle;
  }
  osContext.idle_time_ms = idle;
};

if (isTauri) {
  listen<any>("os-context", (e) => handlePayload(e.payload)).catch((error) => {
    console.error("ROBO: failed to subscribe to OS context", error);
  });
  listen<any>("robo-context", (e) => handlePayload(e.payload)).catch((error) => {
    console.error("ROBO: failed to subscribe to legacy context events", error);
  });
} else {
  // Web browser fallback: poll Python tracker
  setInterval(async () => {
    try {
      const res = await fetch("http://127.0.0.1:8080/");
      if (res.ok) {
        handlePayload(await res.json());
      }
    } catch (err) {
      // Tracker offline
    }
  }, 1000);
}

let isManualExpressionMode = false;

const ACTIVITY_MAP: Record<string, { baseAction: RoboVisualState["baseAction"]; expression: RoboVisualState["expression"]; props: string[]; accessories: string[] }> = {
  idle:      { baseAction: "idle", expression: "neutral",   props: [],            accessories: [] },
  coding:    { baseAction: "idle", expression: "focused",   props: ["coding"],    accessories: [] },
  ai_sync:   { baseAction: "idle", expression: "focused",   props: ["ai_sync"],   accessories: [] },
  reading:   { baseAction: "idle", expression: "relieved",  props: ["reading"],   accessories: [] },
  writing:   { baseAction: "idle", expression: "thinking",  props: ["writing"],   accessories: [] }, 
  design:    { baseAction: "idle", expression: "thinking",  props: ["design"],    accessories: [] },
  gaming:    { baseAction: "idle", expression: "excited",   props: ["gaming"],    accessories: [] },
  music:     { baseAction: "idle", expression: "happy",     props: ["music"],     accessories: ["headphones"] },
  watching:  { baseAction: "idle", expression: "excited",   props: ["watching"],  accessories: [] },
  browsing:  { baseAction: "idle", expression: "confused",  props: ["browsing"],  accessories: [] },
  chat:      { baseAction: "idle", expression: "happy",     props: ["chat"],      accessories: [] },
  call:      { baseAction: "idle", expression: "surprised", props: ["call"],      accessories: [] },
  coffee:    { baseAction: "idle", expression: "relieved",  props: ["coffee"],    accessories: [] },
  sleeping:  { baseAction: "idle", expression: "sleepy",    props: ["sleeping"],  accessories: [] },
  stress:    { baseAction: "idle", expression: "angry",     props: ["stress"],    accessories: [] },
};

function updateContext() {
  if (isManualExpressionMode) return;

  const pName = osContext.active_process_name.toLowerCase();
  const title = osContext.active_window_title.toLowerCase();

  const isMatch = (str: string, keywords: string[]) => keywords.some(k => str.includes(k));
  
  const setActivity = (key: string) => {
    const mapping = ACTIVITY_MAP[key];
    if (mapping) {
      state.baseAction = mapping.baseAction;
      state.expression = mapping.expression;
      state.props = mapping.props;
      state.accessories = mapping.accessories;
    }
  };
  
  // 1. Inactivity Timeout (> 5 mins) -> Sleep Mode
  if (osContext.idle_time_ms > 300000) { 
     if (!state.props.includes("sleeping")) {
       state.fidgetAction = "sleep_settle";
       fidgetDuration = 1500;
       fidgetEndTime = performance.now() + fidgetDuration;
     }
     return setActivity("sleeping");
  } else if (state.props.includes("sleeping")) {
     // Waking up from sleep!
     state.fidgetAction = "wake_up_snap";
     fidgetDuration = 700;
     fidgetEndTime = performance.now() + fidgetDuration;
  }

  // 2. Video Calls / Meetings
  if (isMatch(pName, ["zoom", "webex"]) || isMatch(title, ["meet.google", "teams", "zoom meeting"])) {
     return setActivity("call");
  }

  // 3. AI Tools & AI IDE (Antigravity, Cursor, ChatGPT, Claude, Gemini)
  if (
    isMatch(pName, ["ollama", "antigravity", "gemini"]) || 
    isMatch(title, ["chatgpt", "claude", "gemini", "perplexity", "deepseek", "copilot", "antigravity", "review robo"])
  ) {
     return setActivity("ai_sync");
  }

  // 4. Creative / Design Tools
  if (isMatch(pName, ["figma", "photoshop", "blender", "illustrator", "canva", "premiere", "afterfx", "gimp"])) {
     return setActivity("design");
  }

  // 5. Gaming
  if (isMatch(pName, ["steam", "epicgames", "riot", "valorant", "csgo", "cs2", "league", "minecraft", "roblox", "overwatch", "genshin", "dota"])) {
     return setActivity("gaming");
  }
  
  // 6. Music / Audio
  if (
    isMatch(pName, ["spotify", "itunes", "music", "foobar", "winamp", "tidal", "soundcloud", "musicbee", "aimp", "youtubemusic"]) || 
    isMatch(title, ["music.youtube", "youtube music", "spotify", "soundcloud"])
  ) {
     return setActivity("music");
  }

  // 7. Video Streaming / Media
  if (
    isMatch(title, ["youtube", "twitch", "netflix", "prime video", "hulu", "disney", "vimeo", "crunchyroll"]) ||
    isMatch(pName, ["vlc", "mpv", "netflix", "twitch"])
  ) {
     return setActivity("watching");
  }

  // 8. Coding / Development / Terminal
  if (
    isMatch(pName, ["code", "cursor", "idea", "pycharm", "webstorm", "phpstorm", "rider", "devenv", "sublime", "nvim", "vim", "wezterm", "alacritty", "terminal", "powershell", "cmd", "pwsh", "windowsterminal"]) ||
    isMatch(title, ["visual studio", "vscode", "terminal", "powershell", "cargo", "github", "gitlab", "stackoverflow"])
  ) {
     return setActivity("coding");
  }

  // 9. Chat / Social
  if (isMatch(pName, ["discord", "slack", "telegram", "whatsapp", "signal"])) {
     return setActivity("chat");
  }

  // 10. Document Writing / Notes
  if (isMatch(pName, ["word", "notion", "obsidian", "scrivener", "typora"]) || isMatch(title, ["docs.google", "word", "notes"])) {
     return setActivity("writing");
  }

  // 11. Reading & Research
  if (isMatch(pName, ["acrobat", "kindle", "foxit", "sumatrapdf"]) || isMatch(title, [".pdf", ".epub", "arxiv", "paper", "medium", "substack", "wikipedia"])) {
     return setActivity("reading");
  }

  // 12. Browsers (General)
  if (isMatch(pName, ["chrome", "msedge", "brave", "firefox", "opera", "arc", "vivaldi", "safari"])) {
     return setActivity("browsing");
  } 

  // Default Fallback: Clean Standby
  setActivity("idle");
}

function getBlinkProfile(expression: RoboVisualState["expression"], isSleeping: boolean): { minInterval: number; maxInterval: number; duration: number } {
  if (isSleeping || expression === "sleepy") {
    return { minInterval: 999999, maxInterval: 999999, duration: 0 };
  }

  switch (expression) {
    case "focused":
      // Steady coding focus: calm, never hangs
      return { minInterval: 4500, maxInterval: 6200, duration: 100 };
    case "surprised":
    case "confused":
      // Alert shock / rapid processing: brisk, inquisitive
      return { minInterval: 1400, maxInterval: 2400, duration: 120 };
    case "excited":
      // High energy / gaming: frequent quick blinks
      return { minInterval: 1800, maxInterval: 3000, duration: 110 };
    case "angry":
      // Stress / irritation: fast, tense micro-blinks
      return { minInterval: 2000, maxInterval: 3400, duration: 100 };
    case "happy":
      // Upbeat, cheerful rhythm
      return { minInterval: 2800, maxInterval: 4500, duration: 130 };
    case "thinking":
      // Contemplative / design: thoughtful rhythm
      return { minInterval: 3000, maxInterval: 4800, duration: 150 };
    case "relieved":
      // Relaxing / coffee: gentle, soft descent
      return { minInterval: 3500, maxInterval: 5200, duration: 220 };
    case "sad":
      // Gloomy / weary: heavy, slow blink
      return { minInterval: 3800, maxInterval: 5500, duration: 220 };
    case "neutral":
    default:
      // Organic natural companion rhythm
      return { minInterval: 3000, maxInterval: 4800, duration: 130 };
  }
}

let nextBlinkTime = performance.now() + 2000 + Math.random() * 1500;
let blinkEndTime = 0;

let nextFidgetTime = performance.now() + 18000 + Math.random() * 15000;
let fidgetEndTime = 0;
let fidgetDuration = 1200;

let targetGazeX = 0;
let targetGazeY = 0;
let currentVelX = 0;
let targetVelTilt = 0;
let lastDragX = 0;

let lastClickTime = 0;
let clickCount = 0;
let flinchEndTime = 0;
let flinchDuration = 220;
let hopEndTime = 0;
let hopDuration = 600;

let landStartTime = 0;
const landDuration = 550;

function triggerLandingPhysics() {
  landStartTime = performance.now();
  state.landBounce = 1.0;
}

function handleRobotClick(isDoubleClick = false) {
  const now = performance.now();
  if (isDoubleClick) {
    // Double-click: celebration hop + show daily quote
    hopDuration = 700;
    hopEndTime = now + hopDuration;
    state.bounceHopProgress = 0.01;
    state.fidgetAction = "victory_jump";
    fidgetDuration = 1000;
    fidgetEndTime = now + fidgetDuration;
    const prevExpr = state.expression;
    state.expression = "happy";
    setTimeout(() => {
      if (state.expression === "happy") state.expression = prevExpr;
    }, 1000);
    // Show the daily quote on double-click
    showQuote();
  } else {
    // Single click flinch and playful reaction
    flinchDuration = 300;
    flinchEndTime = now + flinchDuration;
    state.flinchProgress = 0.01;
    const reactions: Array<"thruster_hop" | "tilt_right" | "tilt_left" | "tickle_wiggle" | "scan_glance"> = [
      "thruster_hop", "tilt_right", "tilt_left", "tickle_wiggle", "scan_glance"
    ];
    state.fidgetAction = reactions[Math.floor(Math.random() * reactions.length)];
    fidgetDuration = 750;
    fidgetEndTime = now + fidgetDuration;
  }
}

function updateProceduralLife(now: number) {
  const isSleeping = state.baseAction === "sleep" || state.props.includes("sleeping");
  const profile = getBlinkProfile(state.expression, isSleeping);

  // 1. Context-Aware Blinking System
  if (profile.duration > 0) {
    if (now >= nextBlinkTime && blinkEndTime === 0) {
      state.isBlinking = true;
      blinkEndTime = now + profile.duration;
      nextBlinkTime = now + profile.minInterval + Math.random() * (profile.maxInterval - profile.minInterval);
    } else if (blinkEndTime > 0 && now >= blinkEndTime) {
      state.isBlinking = false;
      blinkEndTime = 0;
    }
  } else {
    state.isBlinking = false;
    blinkEndTime = 0;
  }

  // 2. Behavioral Micro-Fidgets (Comprehensive Autonomous Behaviors)
  if (now >= nextFidgetTime && fidgetEndTime === 0 && !isDragging && !isSleeping) {
    const actions: Array<"tilt_left" | "tilt_right" | "thruster_hop" | "scan_glance" | "look_up" | "look_down" | "glitch_twitch" | "energy_recharge"> = [
      "tilt_right", "tilt_left", "thruster_hop", "scan_glance", "look_up", "look_down", "glitch_twitch", "energy_recharge"
    ];
    state.fidgetAction = actions[Math.floor(Math.random() * actions.length)];
    switch (state.fidgetAction) {
      case "thruster_hop":
        fidgetDuration = 700;
        break;
      case "glitch_twitch":
        fidgetDuration = 350;
        break;
      case "energy_recharge":
        fidgetDuration = 600;
        break;
      case "scan_glance":
        fidgetDuration = 1000;
        break;
      case "look_up":
      case "look_down":
        fidgetDuration = 1100;
        break;
      default:
        fidgetDuration = 1200;
        break;
    }
    fidgetEndTime = now + fidgetDuration;
    nextFidgetTime = now + 16000 + Math.random() * 18000; // 16 - 34s interval
  }

  if (fidgetEndTime > 0) {
    if (now < fidgetEndTime) {
      const elapsed = fidgetDuration - (fidgetEndTime - now);
      state.fidgetProgress = Math.max(0, Math.min(1, elapsed / fidgetDuration));
    } else {
      state.fidgetAction = "none";
      state.fidgetProgress = 0;
      fidgetEndTime = 0;
    }
  }

  // 3. Smooth Gaze Tracking Interpolation
  state.gazeX = (state.gazeX ?? 0) + (targetGazeX - (state.gazeX ?? 0)) * 0.12;
  state.gazeY = (state.gazeY ?? 0) + (targetGazeY - (state.gazeY ?? 0)) * 0.12;

  // 4. Velocity Tilt Decay
  targetVelTilt *= 0.88;
  state.velocityTilt = (state.velocityTilt ?? 0) + (targetVelTilt - (state.velocityTilt ?? 0)) * 0.18;

  // 5. Click Flinch Progress
  if (flinchEndTime > 0) {
    if (now < flinchEndTime) {
      const elapsed = flinchDuration - (flinchEndTime - now);
      state.flinchProgress = Math.max(0, Math.min(1, elapsed / flinchDuration));
    } else {
      state.flinchProgress = 0;
      flinchEndTime = 0;
    }
  }

  // 6. Multi-Click Hop Bounce Progress
  if (hopEndTime > 0) {
    if (now < hopEndTime) {
      const elapsed = hopDuration - (hopEndTime - now);
      state.bounceHopProgress = Math.max(0, Math.min(1, elapsed / hopDuration));
    } else {
      state.bounceHopProgress = 0;
      hopEndTime = 0;
    }
  }

  // 7. Ground Landing Squash Compression & Rebound Spring
  if (landStartTime > 0) {
    const elapsed = now - landStartTime;
    if (elapsed < landDuration) {
      const tNorm = elapsed / landDuration;
      const spring = Math.cos(tNorm * Math.PI * 3.5) * Math.exp(-tNorm * 4.2);
      state.squashFactor = 1.0 - 0.25 * spring;
    } else {
      state.squashFactor = 1.0;
      landStartTime = 0;
    }
  }
}

function tick(now: number) {
  const dt = Math.min(5, (now - lastTick) / 1000);
  lastTick = now;
  updateContext();
  updateProceduralLife(now);
  renderer.draw(state, now);
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);

let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let dragStartX = 0;
let dragStartY = 0;
let wasDragging = false;

const speechBubble = document.querySelector<HTMLDivElement>("#speech");
let quoteTimeout: number | null = null;
let quoteOffset = 0;
let isDesktopRight = true;

async function checkDesktopOrientation() {
  if (isDragging) return; // Freeze orientation during active drag to eliminate any midpoint jumping
  if (appWindow) {
    try {
      const info = await invoke<{ is_right_half: boolean; x: number; y: number; scale: number }>("get_window_screen_info", { currentIsRight: isDesktopRight });
      if (info && typeof info.is_right_half === "boolean") {
        const newRight = info.is_right_half;
        if (state.isDesktopRight === undefined) {
          isDesktopRight = newRight;
          state.isDesktopRight = isDesktopRight;
          updateQuotePosition();
          if (contextMenu && !contextMenu.hidden && !hasUserMovedMenu) {
            contextMenu.style.left = isDesktopRight ? "100px" : "165px";
          }
          updateInteractiveHitZones();
        } else if (newRight !== isDesktopRight) {
          // Compensate physical window coordinates so ROBO stays 100% stationary on screen during orientation flip
          const scale = info.scale || 1.0;
          const deltaX = Math.round(205 * scale);
          const currentPos = await invoke<[number, number]>("get_window_pos");
          let newWinX = currentPos[0];
          let newWinY = currentPos[1];
          if (newRight) {
            newWinX -= deltaX;
          } else {
            newWinX += deltaX;
          }
          await invoke("set_window_pos", { x: newWinX, y: newWinY });

          isDesktopRight = newRight;
          state.isDesktopRight = isDesktopRight;
          updateQuotePosition();
          if (contextMenu && !contextMenu.hidden && !hasUserMovedMenu) {
            contextMenu.style.left = isDesktopRight ? "100px" : "165px";
          }
          updateInteractiveHitZones();
        }
      }
    } catch (_) {}
  }
}
checkDesktopOrientation();
setInterval(checkDesktopOrientation, 150);

function updateQuotePosition() {
  if (!speechBubble || !canvas) return;

  if (isDesktopRight) {
    // ROBO on RIGHT half (body ~285..365). Bubble goes LEFT of ROBO, tail points right.
    speechBubble.className = speechBubble.classList.contains("visible") ? "visible facing-left" : "facing-left";
    speechBubble.style.top = "18px";
    speechBubble.style.bottom = "auto";
    speechBubble.style.right = "165px";
    speechBubble.style.left = "auto";
    speechBubble.style.maxWidth = "260px";
  } else {
    // ROBO on LEFT half (body ~75..155). Bubble goes RIGHT of ROBO, tail points left.
    speechBubble.className = speechBubble.classList.contains("visible") ? "visible facing-right" : "facing-right";
    speechBubble.style.top = "18px";
    speechBubble.style.bottom = "auto";
    speechBubble.style.left = "165px";
    speechBubble.style.right = "auto";
    speechBubble.style.maxWidth = "260px";
  }

  speechBubble.style.pointerEvents = "auto";
  speechBubble.style.cursor = "pointer";
}

if (speechBubble) {
  speechBubble.addEventListener("click", (e) => {
    e.stopPropagation();
    // Re-show same day's quote (reset 5s timer). Only Skip Daily Quote button advances to next.
    showQuote();
  });
}

let initialWinX = 0;
let initialWinY = 0;
let isMovingWindow = false;

window.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return; // Primary mouse button only
  const target = e.target as HTMLElement;
  if (contextMenu && !contextMenu.hidden && contextMenu.contains(target)) return;
  if (speechBubble && speechBubble.classList.contains("visible") && speechBubble.contains(target)) return;

  // PHYSICAL ROBO BODY BOUNDS CHECK:
  // When ROBO is on Desktop Right (baseCanvasX = 291), ROBO hull is X: 250..395, Y: 10..230
  // When ROBO is on Desktop Left (baseCanvasX = 85), ROBO hull is X: 50..195, Y: 10..230
  const roboBox = isDesktopRight 
    ? { minX: 250, maxX: 395, minY: 10, maxY: 230 }
    : { minX: 50,  maxX: 195, minY: 10, maxY: 230 };

  const isOnRobo = e.clientX >= roboBox.minX && e.clientX <= roboBox.maxX && e.clientY >= roboBox.minY && e.clientY <= roboBox.maxY;
  if (!isOnRobo) return;

  isDragging = true;
  wasDragging = false;
  dragStartX = e.screenX;
  dragStartY = e.screenY;
  lastDragX = e.screenX;
  
  canvas.style.cursor = "grabbing";

  if (appWindow) {
    invoke("start_mouse_drag").catch((error) => {
      console.error("ROBO: native drag failed", error);
    });
  } else {
    const roboScreenX = (state.x) * 2; 
    const roboScreenY = (state.y) * 2; 
    dragOffsetX = e.clientX - roboScreenX;
    dragOffsetY = e.clientY - roboScreenY;
  }
});

window.addEventListener("mousemove", (e) => {
  if (isDragging) {
    const instantVx = e.screenX - lastDragX;
    lastDragX = e.screenX;
    currentVelX = currentVelX * 0.7 + instantVx * 0.3;
    targetVelTilt = Math.max(-0.18, Math.min(0.18, currentVelX * 0.012));
    targetGazeX = 0;
    targetGazeY = 0;

    const dx = e.screenX - dragStartX;
    const dy = e.screenY - dragStartY;
    if (Math.hypot(dx, dy) >= 6) {
      wasDragging = true;
    }

    if (!appWindow) {
      const scale = 2;
      const newX = (e.clientX - dragOffsetX) / scale;
      const newY = (e.clientY - dragOffsetY) / scale;
      
      if (newX > state.x + 1) state.dragDirection = "right";
      else if (newX < state.x - 1) state.dragDirection = "left";
      
      state.x = Math.max(10, Math.min(canvas.width / 2 - 40, newX));
      state.y = Math.max(10, Math.min(canvas.height / 2 - 40, newY));
      updateQuotePosition();
    }
    return;
  }

  // Cursor Proximity Gaze Tracking
  const isDesktopRight = (window.screenX ?? window.screenLeft ?? 0) + 190 > window.screen.width / 2;
  const petCanvasX = isDesktopRight ? 324 : 119;
  const petCanvasY = 104;
  const dx = e.clientX - petCanvasX;
  const dy = e.clientY - petCanvasY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 450) {
    targetGazeX = Math.max(-1, Math.min(1, dx / 140));
    targetGazeY = Math.max(-1, Math.min(1, dy / 140));
  } else {
    targetGazeX = 0;
    targetGazeY = 0;
  }
});

window.addEventListener("mouseup", (e) => {
  if (isDragging) {
    const dx = e.screenX - dragStartX;
    const dy = e.screenY - dragStartY;
    if (Math.hypot(dx, dy) >= 6) {
      wasDragging = true;
    }
    triggerLandingPhysics();
  }
  isDragging = false;
  state.dragDirection = "front";
  canvas.style.cursor = "default";
  setTimeout(checkDesktopOrientation, 50);
});

canvas.addEventListener("mouseenter", () => {
  state.isHovered = true;
  if (!isDragging && fidgetEndTime === 0) {
    state.fidgetAction = Math.random() > 0.5 ? "tilt_right" : "thruster_hop";
    fidgetDuration = 900;
    fidgetEndTime = performance.now() + fidgetDuration;
  }
});

canvas.addEventListener("mouseleave", () => {
  state.isHovered = false;
  state.isPetting = false;
});

let lastRobotClickTime = 0;
let singleClickTimer: number | null = null;

canvas.addEventListener("click", (e) => {
  if (wasDragging) {
    wasDragging = false;
    return;
  }
  const roboBox = isDesktopRight 
    ? { minX: 250, maxX: 395, minY: 10, maxY: 230 }
    : { minX: 50,  maxX: 195, minY: 10, maxY: 230 };
  const isOnRobo = e.clientX >= roboBox.minX && e.clientX <= roboBox.maxX && e.clientY >= roboBox.minY && e.clientY <= roboBox.maxY;
  if (!isOnRobo) return;

  const now = performance.now();
  if (now - lastRobotClickTime < 380) {
    // Fast double click detected!
    if (singleClickTimer) {
      clearTimeout(singleClickTimer);
      singleClickTimer = null;
    }
    lastRobotClickTime = 0;
    handleRobotClick(true);
  } else {
    lastRobotClickTime = now;
    if (singleClickTimer) clearTimeout(singleClickTimer);
    singleClickTimer = window.setTimeout(() => {
      handleRobotClick(false);
      singleClickTimer = null;
    }, 200);
  }
});

canvas.addEventListener("dblclick", (e) => {
  if (singleClickTimer) {
    clearTimeout(singleClickTimer);
    singleClickTimer = null;
  }
  const roboBox = isDesktopRight 
    ? { minX: 250, maxX: 395, minY: 10, maxY: 230 }
    : { minX: 50,  maxX: 195, minY: 10, maxY: 230 };
  const isOnRobo = e.clientX >= roboBox.minX && e.clientX <= roboBox.maxX && e.clientY >= roboBox.minY && e.clientY <= roboBox.maxY;
  if (isOnRobo) {
    handleRobotClick(true);
  }
});

const contextMenu = document.querySelector<HTMLDivElement>("#context-menu");

function updateContextMenuActiveState() {
  if (!contextMenu) return;
  const items = contextMenu.querySelectorAll<HTMLButtonElement>(".context-menu-item");
  items.forEach((item) => {
    if (item.dataset.theme && item.dataset.theme === state.settings.theme) {
      item.classList.add("active");
    } else if (item.dataset.expression && item.dataset.expression === state.expression) {
      item.classList.add("active");
    } else if (item.dataset.activity && ACTIVITY_MAP[item.dataset.activity]?.expression === state.expression && JSON.stringify(ACTIVITY_MAP[item.dataset.activity]?.props) === JSON.stringify(state.props)) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
}

let isDraggingMenu = false;
let menuDragStartX = 0;
let menuDragStartY = 0;
let menuInitialLeft = 0;
let menuInitialTop = 0;
let hasUserMovedMenu = false;

const menuDragHandle = document.querySelector<HTMLDivElement>("#context-menu-drag-handle");
const menuCloseBtn = document.querySelector<HTMLButtonElement>("#context-menu-close");

if (menuCloseBtn && contextMenu) {
  menuCloseBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    contextMenu.hidden = true;
    updateInteractiveHitZones();
  });
}

if (menuDragHandle && contextMenu) {
  menuDragHandle.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).id === "context-menu-close") return;
    e.preventDefault();
    e.stopPropagation();
    isDraggingMenu = true;
    hasUserMovedMenu = true;
    menuDragStartX = e.clientX;
    menuDragStartY = e.clientY;
    menuInitialLeft = contextMenu.offsetLeft;
    menuInitialTop = contextMenu.offsetTop;
  });
}

window.addEventListener("mousemove", (e) => {
  if (!isDraggingMenu || !contextMenu) return;
  e.preventDefault();
  const dx = e.clientX - menuDragStartX;
  const dy = e.clientY - menuDragStartY;

  const winWidth = canvas.width || 380;
  const winHeight = canvas.height || 240;
  const menuWidth = contextMenu.offsetWidth || 175;
  const menuHeight = contextMenu.offsetHeight || 220;

  const minLeft = 4;
  const maxLeft = winWidth - menuWidth - 4;
  const minTop = 4;
  const maxTop = winHeight - menuHeight - 4;

  const newLeft = Math.max(minLeft, Math.min(maxLeft, menuInitialLeft + dx));
  const newTop = Math.max(minTop, Math.min(maxTop, menuInitialTop + dy));

  contextMenu.style.left = `${newLeft}px`;
  contextMenu.style.top = `${newTop}px`;
});

window.addEventListener("mouseup", () => {
  if (isDraggingMenu) {
    isDraggingMenu = false;
  }
});

canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  if (!contextMenu) return;
  updateContextMenuActiveState();
  contextMenu.hidden = false;

  const winWidth = canvas.width || 440;
  const winHeight = canvas.height || 240;
  const menuWidth = 175;
  const menuHeight = Math.min(220, contextMenu.scrollHeight || 200);

  // Auto-separate on the front-facing side of ROBO (clean separated deck)
  if (!hasUserMovedMenu) {
    if (isDesktopRight) {
      // ROBO left edge ~285. Menu 175px wide. left:100 → right edge 275 → 10px gap to ROBO
      contextMenu.style.left = `100px`;
    } else {
      // ROBO right edge ~155. left:165 → 10px gap
      contextMenu.style.left = `165px`;
    }
    contextMenu.style.top = `10px`;
  } else {
    // Keep user's chosen position, clamped safely within window boundaries
    const curLeft = parseInt(contextMenu.style.left || "15", 10);
    const curTop = parseInt(contextMenu.style.top || "10", 10);
    const clampedLeft = Math.max(4, Math.min(winWidth - menuWidth - 4, curLeft));
    const clampedTop = Math.max(4, Math.min(winHeight - menuHeight - 4, curTop));
    contextMenu.style.left = `${clampedLeft}px`;
    contextMenu.style.top = `${clampedTop}px`;
  }
  updateInteractiveHitZones();
});

window.addEventListener("mousedown", (e) => {
  if (!contextMenu || contextMenu.hidden || isDraggingMenu) return;
  const target = e.target as Node;
  if (!contextMenu.contains(target)) {
    contextMenu.hidden = true;
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && contextMenu) {
    contextMenu.hidden = true;
    updateInteractiveHitZones();
  }
});

function getDailyQuoteIndex(validQuotes: any[]): number {
  if (validQuotes.length === 0) return 0;
  const todayStr = new Date().toISOString().slice(0, 10);
  let savedDay = localStorage.getItem("robo_daily_quote_date");
  let savedOffset = parseInt(localStorage.getItem("robo_quote_offset") || "0", 10);
  if (savedDay !== todayStr) {
    savedOffset = 0;
    localStorage.setItem("robo_daily_quote_date", todayStr);
    localStorage.setItem("robo_quote_offset", "0");
  }
  const daysSinceEpoch = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return (daysSinceEpoch + savedOffset) % validQuotes.length;
}

function advanceDailyQuote() {
  const validQuotes = quotesData.quotes.filter((q: any) => 
    q.author && 
    q.author.toLowerCase() !== "unknown" && 
    q.author.trim() !== "" &&
    q.quote.length <= 100
  );
  let savedOffset = parseInt(localStorage.getItem("robo_quote_offset") || "0", 10);
  savedOffset++;
  localStorage.setItem("robo_quote_offset", savedOffset.toString());
  showQuote();
}

function showQuote() {
  if (!speechBubble || !canvas) return;
  
  const validQuotes = quotesData.quotes.filter((q: any) => 
    q.author && 
    q.author.toLowerCase() !== "unknown" && 
    q.author.trim() !== "" &&
    q.quote.length <= 100
  );
  
  const quoteIndex = getDailyQuoteIndex(validQuotes);
  const dailyQuote = validQuotes[quoteIndex] || { quote: "Standby for incoming cyber transmission...", author: "ROBO" };
  const cleanQuote = (dailyQuote.quote || "")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .trim();
  const fullQuote = '"' + cleanQuote + '"';

  // Stop any running animation
  if (quoteTimeout) clearTimeout(quoteTimeout);
  if ((window as any).quoteTypeInterval) clearInterval((window as any).quoteTypeInterval);

  speechBubble.innerHTML = "";
  
  const quoteEl = document.createElement("span");
  quoteEl.textContent = "";  // start empty, typewriter fills it
  
  const authorEl = document.createElement("span");
  authorEl.className = "quote-author";
  authorEl.textContent = "- " + dailyQuote.author;
  authorEl.style.opacity = "0";
  authorEl.style.transition = "opacity 0.4s ease";
  
  speechBubble.appendChild(quoteEl);
  speechBubble.appendChild(document.createElement("br"));
  speechBubble.appendChild(authorEl);

  // Clear any conflicting inline overrides so CSS class controls opacity/visibility
  speechBubble.style.removeProperty("opacity");
  speechBubble.style.removeProperty("visibility");
  speechBubble.style.removeProperty("display");
  speechBubble.style.removeProperty("width");
  speechBubble.style.zIndex = "9999";
  speechBubble.style.pointerEvents = "auto";
  speechBubble.style.cursor = "pointer";

  // Position BEFORE making visible so it appears in the right place
  updateQuotePosition();

  // Make visible via class - CSS handles opacity+visibility transitions
  speechBubble.classList.add("visible");
  updateInteractiveHitZones();
  
  let charIdx = 0;
  (window as any).quoteTypeInterval = window.setInterval(() => {
    if (charIdx < fullQuote.length) {
      quoteEl.textContent += fullQuote[charIdx];
      charIdx++;
    } else {
      clearInterval((window as any).quoteTypeInterval);
      authorEl.style.opacity = "1"; 
      quoteTimeout = window.setTimeout(() => {
        speechBubble.classList.remove("visible");
        setTimeout(() => {
          updateInteractiveHitZones();
        }, 300); 
      }, 5000); 
    }
  }, 25); 
}

if (contextMenu) {
  contextMenu.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".context-menu-item");
    if (!btn) return;

    if (btn.dataset.theme) {
      const selectedTheme = btn.dataset.theme as "dark" | "light";
      state.settings.theme = selectedTheme;
    } else if (btn.dataset.system) {
      const action = btn.dataset.system;
      if (action === "skip-quote") {
        advanceDailyQuote();
      } else if (action === "resume-auto") {
        isManualExpressionMode = false;
        updateContext();
      }
    } else if (btn.dataset.expression) {
      const expr = btn.dataset.expression as RoboVisualState["expression"];
      isManualExpressionMode = true;
      state.expression = expr;
    } else if (btn.dataset.fidget) {
      const f = btn.dataset.fidget as any;
      if (f === "blink") {
        state.isBlinking = true;
        blinkEndTime = performance.now() + 300;
      } else {
        state.fidgetAction = f;
        let dur = 1200;
        if (f === "thruster_hop") dur = 750;
        else if (f === "barrel_roll") dur = 850;
        else if (f === "figure_eight") dur = 1400;
        else if (f === "ceiling_bonk") dur = 600;
        else if (f === "tickle_wiggle") dur = 1000;
        else if (f === "dart_dash") dur = 700;
        else if (f === "scanline_sweep") dur = 900;
        else if (f === "glitch_twitch") dur = 400;
        else if (f === "energy_recharge") dur = 600;
        else if (f === "yawn_stretch") dur = 1500;
        else if (f === "energy_low") dur = 2000;
        else if (f === "victory_jump") dur = 800;
        else if (f === "sleep_settle") dur = 1500;
        else if (f === "wake_up_snap") dur = 700;
        else if (f === "scan_glance") dur = 1000;
        else if (f === "look_up" || f === "look_down") dur = 1100;
        fidgetDuration = dur;
        fidgetEndTime = performance.now() + fidgetDuration;
      }
    } else if (btn.dataset.test) {
      const t = btn.dataset.test;
      if (t === "squash") {
        triggerLandingPhysics();
      } else if (t === "flinch") {
        flinchDuration = 220;
        flinchEndTime = performance.now() + flinchDuration;
        state.flinchProgress = 0.01;
      } else if (t === "happy_hop") {
        hopDuration = 600;
        hopEndTime = performance.now() + hopDuration;
        state.bounceHopProgress = 0.01;
        const prev = state.expression;
        state.expression = "happy";
        setTimeout(() => { if (state.expression === "happy") state.expression = prev; }, 900);
      } else if (t === "code_error") {
        state.specialAnimAction = "code_error";
        setTimeout(() => { state.specialAnimAction = undefined; }, 1200);
      } else if (t === "typewriter") {
        showQuote();
      } else if (t === "walk") {
        const prevAction = state.baseAction;
        state.baseAction = "walk";
        setTimeout(() => {
          if (state.baseAction === "walk") state.baseAction = prevAction;
        }, 4000);
      }
    } else if (btn.dataset.activity) {
      const activity = btn.dataset.activity;
      const mapping = ACTIVITY_MAP[activity];
      if (mapping) {
        isManualExpressionMode = true;
        state.baseAction = mapping.baseAction;
        state.expression = mapping.expression;
        state.props = mapping.props;
        state.accessories = mapping.accessories;
      }
    }

    updateContextMenuActiveState();
  });
}

// Show initial quote after 2s (so orientation detection has settled)
setTimeout(() => {
  showQuote();
}, 2000);

setInterval(() => {
  showQuote();
}, 60 * 60 * 1000);

// =========================================================================
// =========================================================================
// DYNAMIC CLICK-THROUGH HIT-ZONE SYNCHRONIZATION
// =========================================================
function updateInteractiveHitZones() {
  if (!appWindow) return;
  const zones: Array<{ x: number; y: number; width: number; height: number }> = [];

  // 1. ROBO Body, Visor, Limbs & Cyber Glow Hull (anchored to ROBO's physical baseCanvasX)
  if (isDesktopRight) {
    zones.push({
      x: 250,
      y: 10,
      width: 145,
      height: 220,
    });
  } else {
    zones.push({
      x: 50,
      y: 10,
      width: 145,
      height: 220,
    });
  }

  // 2. When Animation Deck is open, measure DOM bounding box with generous padding
  if (contextMenu && !contextMenu.hidden) {
    const r = contextMenu.getBoundingClientRect();
    zones.push({
      x: Math.max(0, Math.round(r.left - 6)),
      y: Math.max(0, Math.round(r.top - 6)),
      width: Math.round(r.width + 12),
      height: Math.round(r.height + 12),
    });
  }

  // 3. Active Speech Bubble (Quotes) measured directly from DOM
  if (speechBubble && speechBubble.classList.contains("visible") && speechBubble.style.visibility !== "hidden" && speechBubble.style.display !== "none") {
    const r = speechBubble.getBoundingClientRect();
    zones.push({
      x: Math.max(0, Math.round(r.left - 6)),
      y: Math.max(0, Math.round(r.top - 6)),
      width: Math.round(r.width + 12),
      height: Math.round(r.height + 12),
    });
  }

  invoke("update_hit_zones", { zones }).catch((error) => {
    console.error("ROBO: failed to update hit zones", error);
  });
}

// Check and update interactive zones at 50ms interval and on UI events
setInterval(updateInteractiveHitZones, 50);
if (contextMenu) {
  const obs = new MutationObserver(updateInteractiveHitZones);
  obs.observe(contextMenu, { attributes: true, attributeFilter: ["hidden", "style", "class"] });
}
if (speechBubble) {
  const obs = new MutationObserver(updateInteractiveHitZones);
  obs.observe(speechBubble, { attributes: true, attributeFilter: ["style", "class"] });
}
