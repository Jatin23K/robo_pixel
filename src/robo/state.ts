export type RoboContextCategory = 
  | "system_lifecycle" 
  | "direct_interaction" 
  | "activity" 
  | "funny_reaction" 
  | "autonomy";

export interface RoboContext {
  category: RoboContextCategory;
  name: string; // e.g., "coding_music", "coffee_break"
  confidence: number;
}

export type Theme = "light" | "dark";
export type BaseAction = "idle" | "sit" | "type" | "read" | "think" | "sleep" | "walk" | "happy" | "confused";
export type FaceExpression =
  | "neutral"
  | "focused"
  | "happy"
  | "confused"
  | "sleepy"
  | "glitch"
  | "angry"
  | "surprised"
  | "excited"
  | "thinking"
  | "relieved"
  | "sad";

export interface RoboVisualState {
  baseAction: BaseAction;
  expression: FaceExpression;
  accessories: string[];
  props: string[];
  isGlitching: boolean;
  isHovered?: boolean;
  isPetting?: boolean;
  isBlinking?: boolean;
  fidgetAction?: "none" | "tilt_left" | "tilt_right" | "thruster_hop" | "scan_glance" | "look_up" | "look_down" | "glitch_twitch" | "energy_recharge" | "sleep_settle" | "wake_up_snap" | "barrel_roll" | "figure_eight" | "yawn_stretch" | "scanline_sweep" | "double_glance" | "energy_low" | "tickle_wiggle" | "ceiling_bonk" | "dart_dash" | "victory_jump";
  fidgetProgress?: number;
  activityAnimFrame?: number;
  specialAnimAction?: string;
  specialAnimProgress?: number;
  prevExpression?: FaceExpression;
  expressionMorphAlpha?: number;
  eyeDilation?: number;
  scanlineY?: number;
  afterburnerActive?: boolean;
  dartDashOffset?: number;
  isTickled?: boolean;
  isNesting?: boolean;
  landBounce?: number;
  squashFactor?: number;
  gazeX?: number;
  gazeY?: number;
  velocityTilt?: number;
  flinchProgress?: number;
  bounceHopProgress?: number;
  dragVelocityX?: number;
  dragVelocityY?: number;
  isDesktopRight?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  modeStartedAt: number;
  dragDirection?: string;
  settings: { theme: "dark" | "light", lowDistractionMode: boolean, petVisible: boolean, alwaysOnTop: boolean, motionLevel: string, autostart: boolean, talkFrequency: string };
}

export function createInitialRoboState(): RoboVisualState {
  return {
    baseAction: "idle",
    expression: "neutral",
    accessories: [],
    props: [],
    isGlitching: false,
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    modeStartedAt: Date.now(),
    dragDirection: "front",
    settings: {
      theme: "dark",
      lowDistractionMode: false,
      petVisible: true,
      alwaysOnTop: false,
      motionLevel: "normal",
      autostart: false,
      talkFrequency: "normal"
    }
  };
}
