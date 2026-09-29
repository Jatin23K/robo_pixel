import type { RoboVisualState } from "./state";
import { computeKinematicPose } from "./kinematics";

class ImageLoader {
  private cache: Record<string, HTMLImageElement> = {};

  constructor() {
    this.preloadAll();
  }

  private preloadAll() {
    const themes = ["dark", "light"];
    const faces = [
      "neutral", "focused", "happy", "sleepy", "confused", "angry", "surprised", "glitch",
      "excited", "thinking", "relieved", "frustrated", "sad",
      "blink", "focused_blink"
    ];
    const bodies = ["idle", "idle_1", "idle_2", "type", "read", "sleep", "confused", "happy", "back", "left", "right"];
    const accessories = ["headphones", "thinking_dots"];
    const props = [
      "ai_sync", "browsing", "call", "chat", "coding", "coffee", "design", "gaming", "music", "reading", "sleeping", "stress", "thinking", "watching", "writing"
    ];

    const parts = ["head", "torso", "thrusters", "leg_l", "leg_r", "arm_l", "arm_r"];

    for (const theme of themes) {
      for (const face of faces) {
        this.preload(`/sprites/${theme}_face_${face}.png`);
      }
      for (const body of bodies) {
        this.preload(`/sprites/${theme}_body_${body}.png`);
      }
      for (const acc of accessories) {
        this.preload(`/sprites/${theme}_acc_${acc}.png`);
      }
      for (const prop of props) {
        this.preload(`/sprites/${theme}_prop_${prop}_fg.png`);
      }
      for (const part of parts) {
        this.preload(`/sprites/${theme}_part_${part}.png`);
      }
    }
  }

  private preload(path: string) {
    if (this.cache[path]) return;
    const img = new Image();
    img.src = path;
    this.cache[path] = img;
  }

  getImage(path: string): HTMLImageElement | null {
    let img = this.cache[path];
    if (!img) {
      img = new Image();
      img.src = path;
      this.cache[path] = img;
    }
    if (img.complete && img.naturalWidth > 0) {
      return img;
    }
    return null;
  }
}

export class RoboRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fallbackScale = 2;
  private images = new ImageLoader();

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas is not available.");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = true;
  }

  draw(state: RoboVisualState, now: number) {
    const ctx = this.ctx;
    const lowDistraction = state.settings.lowDistractionMode;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (!state.settings.petVisible) return;

    const t = now / 1000;
    const isMusic = state.props.includes("music");
    const isSleeping = state.baseAction === "sleep" || state.props.includes("sleeping");
    const glitch = !lowDistraction && state.isGlitching && Math.floor(t * 18) % 2 === 0;
    
    // Smooth landing spring decay
    let bounceOffset = 0;
    if (state.landBounce && state.landBounce > 0.05) {
      bounceOffset = Math.sin(now * 0.02) * state.landBounce * 6;
      state.landBounce *= 0.92; // decay
    }

    // 1. Multi-axis harmonic hovering (Lissajous float physics)
    const floatSpeedY = isMusic ? 7.5 : (lowDistraction ? 2.0 : 3.2);
    const floatAmpY = isMusic ? 2.6 : (lowDistraction ? 0.6 : 1.4);
    const floatY = isSleeping ? 0 : Math.sin(t * floatSpeedY) * floatAmpY;

    const floatSpeedX = isMusic ? 3.8 : (lowDistraction ? 1.0 : 1.6);
    const floatAmpX = isMusic ? 0.9 : (lowDistraction ? 0.3 : 0.6);
    const floatX = isSleeping ? 0 : Math.cos(t * floatSpeedX) * floatAmpX;

    // 2. Natural hovering rotational sway & comprehensive 10-fidget system
    const hoverTilt = isSleeping ? 0 : Math.sin(t * 1.8) * 0.015;
    let fidgetY = 0;
    let fidgetX = 0;
    let fidgetTilt = 0;
    let fidgetGazeX = 0;
    let fidgetGazeY = 0;
    let fidgetHeadTilt = 0;
    let fidgetHeadPitch = 0;
    let fidgetArmLAngle = 0;
    let fidgetArmRAngle = 0;
    let fidgetArmLOffY = 0;
    let fidgetArmROffY = 0;
    let fidgetThrusterAngle = 0;

    if (state.fidgetAction && state.fidgetProgress !== undefined && state.fidgetProgress > 0) {
      const p = state.fidgetProgress;
      const factor = Math.sin(p * Math.PI);

      switch (state.fidgetAction) {
        case "tilt_right":
          fidgetTilt = factor * 0.04;
          fidgetHeadTilt = factor * 0.22; // Inquisitive Puppy Tilt from Batch 4
          fidgetArmLAngle = factor * 0.08;
          fidgetArmRAngle = factor * 0.08;
          break;
        case "tilt_left":
          fidgetTilt = -factor * 0.04;
          fidgetHeadTilt = -factor * 0.22; // Inquisitive Puppy Tilt from Batch 4
          fidgetArmLAngle = -factor * 0.08;
          fidgetArmRAngle = -factor * 0.08;
          break;
        case "thruster_hop":
          fidgetY = -Math.sin(p * Math.PI * 2) * 4.5;
          fidgetArmLAngle = Math.sin(p * Math.PI * 2) * 0.22;
          fidgetArmRAngle = -Math.sin(p * Math.PI * 2) * 0.22;
          fidgetThrusterAngle = -Math.sin(p * Math.PI * 2) * 0.12;
          break;
        case "scan_glance":
          fidgetGazeX = Math.sin(p * Math.PI * 2) * 3.0;
          fidgetHeadTilt = Math.sin(p * Math.PI * 2) * 0.14;
          fidgetThrusterAngle = -Math.sin(p * Math.PI * 2) * 0.08;
          break;
        case "look_up":
          fidgetGazeY = -factor * 3.8;
          fidgetHeadPitch = 0;
          fidgetArmLAngle = factor * 0.14;
          fidgetArmRAngle = -factor * 0.14;
          fidgetThrusterAngle = factor * 0.10;
          break;
        case "look_down":
          fidgetGazeY = factor * 3.5;
          fidgetHeadPitch = factor * 1.5;
          fidgetArmLAngle = -factor * 0.12;
          fidgetArmRAngle = factor * 0.12;
          fidgetThrusterAngle = -factor * 0.10;
          break;
        case "glitch_twitch":
          fidgetX = (Math.random() - 0.5) * 3.5;
          fidgetY = (Math.random() - 0.5) * 2.0;
          fidgetTilt = (Math.random() - 0.5) * 0.08;
          fidgetHeadTilt = (Math.random() - 0.5) * 0.20;
          fidgetArmLAngle = (Math.random() - 0.5) * 0.30;
          fidgetArmRAngle = (Math.random() - 0.5) * 0.30;
          fidgetArmLOffY = (Math.random() - 0.5) * 2.0;
          fidgetArmROffY = (Math.random() - 0.5) * 2.0;
          break;
        case "energy_recharge":
          fidgetX = Math.sin(p * Math.PI * 24) * 1.6;
          fidgetArmLAngle = Math.sin(p * Math.PI * 24) * 0.14;
          fidgetArmRAngle = -Math.sin(p * Math.PI * 24) * 0.14;
          fidgetHeadPitch = 0;
          break;
        case "sleep_settle":
          fidgetY = p * 3.2;
          fidgetHeadPitch = p * 3.5;
          fidgetArmLAngle = p * 0.12;
          fidgetArmRAngle = -p * 0.12;
          break;
        case "wake_up_snap":
          fidgetY = -Math.sin(p * Math.PI) * 4.5;
          fidgetHeadPitch = 0;
          fidgetArmLAngle = -factor * 0.25;
          fidgetArmRAngle = factor * 0.25;
          break;
        case "barrel_roll":
          fidgetY = -Math.sin(p * Math.PI) * 4.5;
          fidgetTilt = Math.sin(p * Math.PI * 2) * 0.05;
          break;
        case "victory_jump":
          fidgetY = -Math.abs(Math.sin(p * Math.PI * 2)) * 7.5;
          fidgetTilt = Math.sin(p * Math.PI * 4) * 0.06;
          fidgetHeadPitch = 0;
          fidgetArmLAngle = -0.55 * factor; // High celebration V-arms from Batch 4
          fidgetArmRAngle = 0.55 * factor;
          fidgetThrusterAngle = factor * 0.12;
          break;
        case "energy_low":
          fidgetY = factor * 3.0;
          fidgetHeadPitch = factor * 3.5;
          fidgetArmLAngle = factor * 0.18;
          fidgetArmRAngle = -factor * 0.18;
          break;
        case "double_glance":
          fidgetGazeX = Math.sin(p * Math.PI * 4) * 3.0;
          fidgetHeadTilt = Math.sin(p * Math.PI * 4) * 0.12;
          break;
        case "dart_dash":
          fidgetArmLAngle = 0.40; // Aerodynamic swept back arms from Batch 3
          fidgetArmRAngle = -0.40;
          fidgetHeadPitch = 2.0;
          fidgetThrusterAngle = -0.25;
          break;
        case "yawn_stretch":
          fidgetGazeY = -factor * 2.5;
          fidgetHeadPitch = 0;
          fidgetArmLAngle = -factor * 0.35;
          fidgetArmRAngle = factor * 0.35;
          break;
      }
    }

    let flinchY = 0;
    let flinchTilt = 0;
    if (state.flinchProgress && state.flinchProgress > 0) {
      const flp = state.flinchProgress;
      flinchY = -Math.sin(flp * Math.PI) * 4.5;
      flinchTilt = Math.sin(flp * Math.PI) * 0.05;
      fidgetArmLAngle -= 0.30 * Math.sin(flp * Math.PI); // Defensive tuck from Batch 4
      fidgetArmRAngle += 0.30 * Math.sin(flp * Math.PI);
      fidgetHeadPitch += 1.5 * Math.sin(flp * Math.PI);
    }

    let hopY = 0;
    if (state.bounceHopProgress && state.bounceHopProgress > 0) {
      hopY = -Math.sin(state.bounceHopProgress * Math.PI * 2) * 5.0;
    }

    // Figure-8 Head Roll (Amplified 2D Lissajous Orbit + Independent Neck & Thrusters Kinematics)
    if (state.fidgetAction === "figure_eight" && state.fidgetProgress !== undefined) {
      const p = state.fidgetProgress;
      fidgetX += Math.sin(p * Math.PI * 2) * 5.5;
      fidgetY += -Math.cos(p * Math.PI * 4) * 3.5;
      fidgetTilt += Math.sin(p * Math.PI * 2) * 0.05;
      fidgetHeadTilt += Math.sin(p * Math.PI * 2) * 0.12;
      fidgetArmLAngle += Math.cos(p * Math.PI * 2) * 0.10;
      fidgetArmRAngle -= Math.cos(p * Math.PI * 2) * 0.10;
      fidgetThrusterAngle -= Math.sin(p * Math.PI * 2) * 0.15;
    }

    // Cursor Tickle / Head-Pet Wiggle (Delight Flutter from Batch 4)
    if (state.isTickled || state.fidgetAction === "tickle_wiggle") {
      fidgetTilt += Math.sin(now * 0.04) * 0.06;
      fidgetHeadTilt += Math.sin(now * 0.06) * 0.16;
      fidgetArmLAngle += Math.sin(now * 0.05) * 0.25;
      fidgetArmRAngle -= Math.sin(now * 0.05) * 0.25;
      fidgetX += Math.cos(now * 0.04) * 1.5;
    }

    // Thinking Orbital Eye Path
    if (state.expression === "thinking" && !isSleeping) {
      fidgetGazeX += Math.cos(now * 0.004) * 0.8;
      fidgetGazeY += Math.sin(now * 0.004) * 0.6;
    }

    const velTilt = state.velocityTilt ?? 0;
    const totalTilt = hoverTilt + fidgetTilt + flinchTilt + velTilt;
    
    const isFacingRight = state.isDesktopRight === false;
    const shouldFlip = state.isDesktopRight !== false;
    const scale = this.fallbackScale;
    const baseCanvasX = isFacingRight ? 85 : 291;
    const x = Math.round((baseCanvasX + floatX + fidgetX) / scale);
    const y = Math.round((state.y + floatY + fidgetY + flinchY + hopY - bounceOffset) / scale);
    const isDragging = state.dragDirection === "left" || state.dragDirection === "right";

    this.withPixelScale(scale, () => {
      this.ctx.save();
      
      // Dynamic Squash & Stretch physics on ground impact/landing (anchored to thruster plate)
      let squashY = state.squashFactor ?? 1.0;
      let squashX = 1.0 + (1.0 - squashY) * 0.5;

      // Yawn & Stretch elongation
      if (state.fidgetAction === "yawn_stretch" && state.fidgetProgress !== undefined) {
        const stretchFactor = Math.sin(state.fidgetProgress * Math.PI);
        squashY = 1.0 + stretchFactor * 0.12;
        squashX = 1.0 - stretchFactor * 0.06;
      }

      if (Math.abs(squashY - 1.0) > 0.01) {
        this.ctx.translate(x + 16, y + 20);
        this.ctx.scale(squashX, squashY);
        this.ctx.translate(-(x + 16), -(y + 20));
      }

      // Ceiling Bonk Head Compression (anchored to exact top of head dome y - 38)
      if (state.fidgetAction === "ceiling_bonk" && state.fidgetProgress !== undefined) {
        const bonkFactor = Math.sin(state.fidgetProgress * Math.PI);
        this.ctx.translate(x + 16, y - 38);
        this.ctx.scale(1.0 + bonkFactor * 0.18, 1.0 - bonkFactor * 0.22);
        this.ctx.translate(-(x + 16), -(y - 38));
      }

      if (isDragging) {
         // --- DRAGGING MODE (Uses baked side profiles with dynamic dangle sway) ---
         const dragTilt = (state.dragDirection === "left" ? -0.06 : (state.dragDirection === "right" ? 0.06 : 0)) + Math.sin(t * 14) * 0.03;
         this.ctx.translate(x + 16, y - 10);
         this.ctx.rotate(dragTilt);
         this.ctx.translate(-(x + 16), -(y - 10));
         this.drawLayer(x, y, [`/sprites/${state.settings.theme}_body_${state.dragDirection}.png`]);
      } else {
         // Determine animation frame (Music mode has faster rhythm)
         const frameSpeed = isMusic ? 250 : 500;
         const animFrame = Math.floor(now / frameSpeed) % 2 + 1; 
         let bodyPath = `/sprites/${state.settings.theme}_body_${state.baseAction}.png`;
         if (state.baseAction === "idle") {
            bodyPath = `/sprites/${state.settings.theme}_body_${state.baseAction}_${animFrame}.png`;
         }

         // 360° Aerodynamic 4-Way 3D Spin (Yaw in place using baked cardinal profiles)
         let spinScaleX = 1.0;
         let showFace = true;
         let isShowingBack = false;

         if (state.fidgetAction === "barrel_roll" && state.fidgetProgress !== undefined) {
           const spinAngle = state.fidgetProgress * Math.PI * 2;
           const theme = state.settings.theme;

           if (spinAngle >= Math.PI * 0.25 && spinAngle < Math.PI * 0.75) {
             // Sector 1: Right Profile (45° to 135°)
             bodyPath = `/sprites/${theme}_body_right.png`;
             spinScaleX = Math.cos(spinAngle - Math.PI * 0.5);
             showFace = false;
           } else if (spinAngle >= Math.PI * 0.75 && spinAngle < Math.PI * 1.25) {
             // Sector 2: Back View (135° to 225°)
             bodyPath = `/sprites/${theme}_body_back.png`;
             spinScaleX = Math.cos(spinAngle - Math.PI);
             showFace = false;
             isShowingBack = true;
           } else if (spinAngle >= Math.PI * 1.25 && spinAngle < Math.PI * 1.75) {
             // Sector 3: Left Profile (225° to 315°)
             bodyPath = `/sprites/${theme}_body_left.png`;
             spinScaleX = Math.cos(spinAngle - Math.PI * 1.5);
             showFace = false;
           } else {
             // Sector 0: Front View (315° to 45°)
             const rel = spinAngle < Math.PI ? spinAngle : (spinAngle - Math.PI * 2);
             spinScaleX = Math.cos(rel);
             showFace = true;
           }
           spinScaleX = Math.max(0.68, Math.abs(spinScaleX));
         }

          const gazeOffX = (state.gazeX ?? 0) * 1.5 + fidgetGazeX;
          const gazeOffY = (state.gazeY ?? 0) * 1.0 + fidgetGazeY;

          // High-Speed Dart Dash Motion Trail (Includes full body + face silhouette)
          if (state.fidgetAction === "dart_dash" && state.fidgetProgress !== undefined) {
            const p = state.fidgetProgress;
            const ghostOffset = (p < 0.5 ? -1 : 1) * (1.0 - p) * 6;
            this.ctx.save();
            this.ctx.globalAlpha = 0.32;
            if (shouldFlip) {
              this.ctx.translate(x + 16, 0);
              this.ctx.scale(-1, 1);
              this.ctx.translate(-(x + 16), 0);
            }
            this.drawLayer(x + ghostOffset, y, [bodyPath], state.baseAction);
            let ghostFace = `/sprites/${state.settings.theme}_face_${state.expression}.png`;
            this.drawLayer(x + ghostOffset, y, [ghostFace], state.baseAction, gazeOffX, gazeOffY);
            this.ctx.restore();
          }

          // --- IDLE/INTERACTIVE MODE (Uses Paper Doll layered engine) ---
          if (shouldFlip) {
            this.ctx.translate(x + 16, 0);
            this.ctx.scale(-1, 1);
            this.ctx.translate(-(x + 16), 0);
          }
          
          // Dynamic Prop Floating & Action Loops
          const isAi = state.props.includes("ai_sync");
          const isReading = state.props.includes("reading");
          const isCoding = state.props.includes("coding");
          const isGaming = state.props.includes("gaming");
          const isCoffee = state.props.includes("coffee");
          const isWriting = state.props.includes("writing");
          const isDesign = state.props.includes("design");
          const isStress = state.props.includes("stress");
          const isCall = state.props.includes("call");
          const isBrowsing = state.props.includes("browsing");
          const isChat = state.props.includes("chat");
          const isWatching = state.props.includes("watching");

          let propOffX = 0;
          let propOffY = 0;

          if (isReading) {
            propOffY = Math.sin(now * 0.003) * 0.8;
          } else if (isAi) {
            propOffY = Math.sin(now * 0.005) * 1.0;
          } else if (isCoding) {
            propOffY = Math.sin(now * 0.02) * 0.4; // micro typing vibration
          } else if (isGaming) {
            propOffX = Math.sin(now * 0.025) * 0.4;
            propOffY = Math.cos(now * 0.025) * 0.4; // button mashing vibration
          } else if (isCoffee) {
            const sipCycle = ((now * 0.001) % 6.0);
            const sipLift = sipCycle < 2.5 ? Math.sin((sipCycle / 2.5) * Math.PI) : 0;
            propOffY = -sipLift * 2.2; // mug lifts to mouth with right arm
          } else if (isWriting) {
            propOffX = Math.sin(now * 0.015) * 0.8; // stylus scribble motion
            propOffY = Math.cos(now * 0.015) * 0.8;
          } else if (isDesign) {
            propOffX = Math.sin(now * 0.004) * 0.8; // digital brush stroke
            propOffY = Math.cos(now * 0.004) * 0.4;
          } else if (isCall) {
            propOffX = 1.0;
            propOffY = -1.5; // phone held to ear
          } else if (isStress) {
            propOffX = (Math.random() - 0.5) * 0.8; // stress tremor
            propOffY = (Math.random() - 0.5) * 0.8;
          }

          const theme = state.settings.theme;
          const headImg = this.images.getImage(`/sprites/${theme}_part_head.png`);
          const torsoImg = this.images.getImage(`/sprites/${theme}_part_torso.png`);
          const legLImg = this.images.getImage(`/sprites/${theme}_part_leg_l.png`);
          const legRImg = this.images.getImage(`/sprites/${theme}_part_leg_r.png`);
          const thrustersImg = this.images.getImage(`/sprites/${theme}_part_thrusters.png`);
          const armLImg = this.images.getImage(`/sprites/${theme}_part_arm_l.png`);
          const armRImg = this.images.getImage(`/sprites/${theme}_part_arm_r.png`);
          const isCardinalSpin = state.fidgetAction === "barrel_roll" && spinScaleX < 0.99;
          const canUseRig = !!(headImg && torsoImg && (legLImg || thrustersImg) && armLImg && armRImg && !isShowingBack && showFace && !isCardinalSpin);
          let flareDrawn = false;

          if (!canUseRig) {
            // Apply procedural rotational micro-tilt and 3D spin (Monolithic / Cardinal Fallback)
            if (Math.abs(totalTilt) > 0.001 || Math.abs(spinScaleX - 1.0) > 0.001) {
              this.ctx.translate(x + 16, y - 10);
              this.ctx.scale(spinScaleX, 1.0);
              this.ctx.rotate(totalTilt);
              this.ctx.translate(-(x + 16), -(y - 10));
            }

            if (isShowingBack) {
              // Rear view: foreground props (held forward) are occluded behind the back chassis
              this.drawLayer(x, y, state.props.map(p => `/sprites/${theme}_prop_${p}_fg.png`), state.baseAction, propOffX, propOffY);
              this.drawLayer(x, y, [bodyPath], state.baseAction);
              this.drawLayer(x, y, state.accessories.filter(a => a !== "thinking_dots").map(a => `/sprites/${theme}_acc_${a}.png`), state.baseAction);
            } else {
              // Front & Profile views
              this.drawLayer(x, y, [bodyPath], state.baseAction);
              if (showFace) {
                let facePath = `/sprites/${theme}_face_${state.expression}.png`;
                if (state.isBlinking && !isSleeping) {
                  const blinkPath = state.expression === "focused" 
                    ? `/sprites/${theme}_face_focused_blink.png` 
                    : `/sprites/${theme}_face_blink.png`;
                  if (this.images.getImage(blinkPath)) {
                    facePath = blinkPath;
                  }
                }
                this.drawLayer(x, y, [facePath], state.baseAction, gazeOffX, gazeOffY);
              }
              this.drawLayer(x, y, state.accessories.map(a => `/sprites/${theme}_acc_${a}.png`), state.baseAction);

              if (isAi || isMusic) {
                const pulseAlpha = 0.82 + 0.18 * Math.sin(now * 0.006);
                this.ctx.save();
                this.ctx.globalAlpha = pulseAlpha;
                this.drawLayer(x, y, state.props.map(p => `/sprites/${theme}_prop_${p}_fg.png`), state.baseAction, propOffX, propOffY);
                this.ctx.restore();
              } else {
                this.drawLayer(x, y, state.props.map(p => `/sprites/${theme}_prop_${p}_fg.png`), state.baseAction, propOffX, propOffY);
              }
            }
          } else {
            // ========================================================
            // 2.5D ARTICULATED LIVING SKELETAL RIG PIPELINE
            // ========================================================
            const pose = computeKinematicPose(state, now, lowDistraction);
            flareDrawn = pose.flareActive;

            // --------------------------------------------------------
            // 1. LEGS & THRUSTERS (Independent Left & Right Articulation)
            // --------------------------------------------------------
            // Joint 1A: Left Leg / Thruster (Hip pivot at x+8.5, y+13.5)
            const leftLegImg = legLImg || thrustersImg;
            if (leftLegImg) {
              const hipLX = x + 8.5;
              const hipLY = y + 13.5 + pose.torsoY + pose.legLOffY;
              this.ctx.save();
              this.ctx.translate(hipLX, hipLY);
              this.ctx.rotate(pose.torsoAngle * 0.4 + pose.legLAngle);
              this.ctx.translate(-hipLX, -hipLY);
              this.ctx.drawImage(leftLegImg, x - 16, y - 42 + pose.torsoY + pose.legLOffY, 64, 64);

              // Left Thruster Nozzle Flame (orienting with nozzle rotation)
              if (pose.flareActive && !lowDistraction && pose.flameLHeight > 0) {
                const nozzleLX = x + 10;
                const nozzleLY = y + 20 + pose.torsoY + pose.legLOffY;
                this.px(nozzleLX, nozzleLY, 3, pose.flameLHeight, "#5cffea");
                this.px(nozzleLX + 1, nozzleLY, 1, pose.flameLHeight + 2, "#ffffff");
              }
              this.ctx.restore();
            }

            // Joint 1B: Right Leg / Thruster (Hip pivot at x+23.5, y+13.5)
            const rightLegImg = legRImg || thrustersImg;
            if (rightLegImg) {
              const hipRX = x + 23.5;
              const hipRY = y + 13.5 + pose.torsoY + pose.legROffY;
              this.ctx.save();
              this.ctx.translate(hipRX, hipRY);
              this.ctx.rotate(pose.torsoAngle * 0.4 + pose.legRAngle);
              this.ctx.translate(-hipRX, -hipRY);
              this.ctx.drawImage(rightLegImg, x - 16, y - 42 + pose.torsoY + pose.legROffY, 64, 64);

              // Right Thruster Nozzle Flame (orienting with nozzle rotation)
              if (pose.flareActive && !lowDistraction && pose.flameRHeight > 0) {
                const nozzleRX = x + 20;
                const nozzleRY = y + 20 + pose.torsoY + pose.legROffY;
                this.px(nozzleRX, nozzleRY, 3, pose.flameRHeight, "#5cffea");
                this.px(nozzleRX + 1, nozzleRY, 1, pose.flameRHeight + 2, "#ffffff");
              }
              this.ctx.restore();
            }

            // --------------------------------------------------------
            // 2. TORSO CHASSIS ROOT (Breathing, Volume Squash & Stretch)
            // --------------------------------------------------------
            const torsoPivotX = x + 16;
            const torsoPivotY = y + 5 + pose.torsoY;
            this.ctx.save();
            this.ctx.translate(torsoPivotX, torsoPivotY);
            this.ctx.rotate(pose.torsoAngle);
            this.ctx.scale(pose.torsoScaleX, pose.torsoScaleY);
            this.ctx.translate(-torsoPivotX, -torsoPivotY);
            this.ctx.drawImage(torsoImg, x - 16, y - 42 + pose.torsoY, 64, 64);
            this.ctx.restore();

            // --------------------------------------------------------
            // 3. ARTICULATED ARMS (Left & Right Independent Shoulder Joints)
            // --------------------------------------------------------
            // Left Arm (Shoulder Pivot at x+5, y-3)
            if (armLImg) {
              const shoulderLX = x + 5;
              const shoulderLY = y - 3 + pose.torsoY + pose.armLOffY;
              this.ctx.save();
              this.ctx.translate(shoulderLX, shoulderLY);
              this.ctx.rotate(pose.torsoAngle * 0.5 + pose.armLAngle);
              this.ctx.translate(-shoulderLX, -shoulderLY);
              this.ctx.drawImage(armLImg, x - 16, y - 42 + pose.torsoY + pose.armLOffY, 64, 64);
              this.ctx.restore();
            }

            // Right Arm (Shoulder Pivot at x+26, y-3)
            if (armRImg) {
              const shoulderRX = x + 26;
              const shoulderRY = y - 3 + pose.torsoY + pose.armROffY;
              this.ctx.save();
              this.ctx.translate(shoulderRX, shoulderRY);
              this.ctx.rotate(pose.torsoAngle * 0.5 + pose.armRAngle);
              this.ctx.translate(-shoulderRX, -shoulderRY);
              this.ctx.drawImage(armRImg, x - 16, y - 42 + pose.torsoY + pose.armROffY, 64, 64);
              this.ctx.restore();
            }

            // --------------------------------------------------------
            // 4. HEAD DOME & CURVED VISOR (Neck Pivot at x+16, y-4)
            // --------------------------------------------------------
            const neckX = x + 16;
            const neckY = y - 4 + pose.torsoY;
            const finalHeadAngle = pose.torsoAngle * 0.75 + pose.headAngle + (gazeOffX / 2.8) * 0.04;
            
            this.ctx.save();
            this.ctx.translate(neckX, neckY);
            this.ctx.rotate(finalHeadAngle);
            this.ctx.translate(-neckX, -neckY);

            // Layer 4A: Head Dome
            this.ctx.drawImage(headImg, x - 16 + pose.headScanX, y - 42 + pose.torsoY + pose.headPitchY, 64, 64);

            // Layer 4B: Visor Screen & Face (Embedded curved glass parallax: 1.15x drift)
            let facePath = `/sprites/${theme}_face_${state.expression}.png`;
            if (state.isBlinking && !isSleeping) {
              const blinkPath = state.expression === "focused" 
                ? `/sprites/${theme}_face_focused_blink.png` 
                : `/sprites/${theme}_face_blink.png`;
              if (this.images.getImage(blinkPath)) {
                facePath = blinkPath;
              }
            }
            const faceImg = this.images.getImage(facePath);
            if (faceImg) {
              this.ctx.drawImage(
                faceImg, 
                x - 16 + pose.headScanX + gazeOffX * 1.15, 
                y - 42 + pose.torsoY + pose.headPitchY + gazeOffY * 1.15, 
                64, 
                64
              );
            }

            // Layer 4C: Head Accessories (e.g. Headphones)
            for (const acc of state.accessories) {
              const accImg = this.images.getImage(`/sprites/${theme}_acc_${acc}.png`);
              if (accImg) {
                this.ctx.drawImage(accImg, x - 16 + pose.headScanX, y - 42 + pose.torsoY + pose.headPitchY, 64, 64);
              }
            }
            this.ctx.restore(); // End head joint matrix

            // --------------------------------------------------------
            // 5. FOREGROUND PROPS (Attached to Torso Reference Plane)
            // --------------------------------------------------------
            const propX = propOffX * 1.25;
            const propY = propOffY * 1.25;
            if (isAi || isMusic) {
              const pulseAlpha = 0.82 + 0.18 * Math.sin(now * 0.006);
              this.ctx.save();
              this.ctx.globalAlpha = pulseAlpha;
              this.drawLayer(x, y + pose.torsoY, state.props.map(p => `/sprites/${theme}_prop_${p}_fg.png`), state.baseAction, propX, propY);
              this.ctx.restore();
            } else {
              this.drawLayer(x, y + pose.torsoY, state.props.map(p => `/sprites/${theme}_prop_${p}_fg.png`), state.baseAction, propX, propY);
            }
          }

          // 6. Dynamic Emote & Particle Depth Layer (Animated '?', 'Zzz', Sparks, Steam, Stress)
          this.drawDynamicEmotes(x, y, state, now, flareDrawn);
      }
      
      this.ctx.restore();
    });
  }

  private drawDynamicEmotes(x: number, y: number, state: RoboVisualState, now: number, flareDrawn = false) {
    if (state.settings.lowDistractionMode) return;
    const ctx = this.ctx;
    const t = now / 1000;

    // Thruster Afterburner Flame Flare (Hopping, Dashing, Fast Movement, or Barrel Roll) - only if not already drawn in rigged thruster joint
    if (!flareDrawn && (state.afterburnerActive || state.fidgetAction === "thruster_hop" || state.fidgetAction === "dart_dash" || state.fidgetAction === "barrel_roll" || Math.abs(state.velocityTilt ?? 0) > 0.08)) {
      const flareH = 4 + Math.floor(Math.sin(now * 0.04) * 2.5);
      this.px(x + 10, y + 20, 3, flareH, "#5cffea");
      this.px(x + 20, y + 20, 3, flareH, "#5cffea");
      this.px(x + 11, y + 20, 1, flareH + 2, "#ffffff");
      this.px(x + 21, y + 20, 1, flareH + 2, "#ffffff");
    }

    // Holographic Visor Scanline Sweep (Exact screen width 24px: X=380..770 in 1024 space)
    if (state.fidgetAction === "scanline_sweep" || (state.scanlineY !== undefined && state.scanlineY > 0)) {
      const sY = Math.round(y - 33 + ((now * 0.035) % 24));
      this.px(x + 8, sY, 24, 1, "rgba(92, 255, 234, 0.45)");
    }

    // Call Audio Waveform Ripple
    if (state.props.includes("call")) {
      const waveCycle = ((now * 0.0015) % 1.0);
      const alpha = (1.0 - waveCycle) * 0.7;
      ctx.save();
      ctx.strokeStyle = `rgba(255, 80, 80, ${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x + 24, y - 2, 3 + waveCycle * 8, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();
      ctx.restore();
    }

    // Reading Page Advance Flash
    if (state.props.includes("reading") && Math.floor(now / 4000) % 2 === 0 && (now % 4000) < 250) {
      const flashAlpha = 0.45 * (1.0 - (now % 4000) / 250);
      ctx.save();
      ctx.globalAlpha = flashAlpha;
      this.px(x + 18, y - 9, 16, 18, "#5cffea");
      ctx.restore();
    }

    // Coding Screen Code Flicker & Micro Error Flash (Aligned inside laptop monitor display)
    if (state.specialAnimAction === "code_error") {
      ctx.save();
      ctx.globalAlpha = 0.9;
      this.px(x + 20, y - 1, 8, 1, "#ff3355");
      this.px(x + 20, y + 1, 6, 1, "#ff3355");
      this.px(x + 20, y + 3, 7, 1, "#ffaa00");
      ctx.restore();
    } else if (state.props.includes("coding")) {
      const codeGlow = 0.5 + 0.3 * Math.sin(now * 0.012);
      ctx.save();
      ctx.globalAlpha = codeGlow;
      this.px(x + 20, y - 1, 8, 1, "#5cffea");
      this.px(x + 20, y + 1, 6, 1, "#5cffea");
      this.px(x + 20, y + 3, 7, 1, "#5cffea");
      ctx.restore();
    }

    // 1. SLEEPY / SLEEPING: Drifting floating Zzz particles in top-right
    if (state.expression === "sleepy" || state.baseAction === "sleep" || state.props.includes("sleeping")) {
      const zColor = "#79d7ff";
      for (let i = 0; i < 3; i++) {
        const cycle = ((now * 0.0007) + i * 0.33) % 1.0;
        const alpha = Math.sin(cycle * Math.PI);
        if (alpha > 0.02) {
          ctx.save();
          ctx.globalAlpha = alpha * 0.95;
          const zx = Math.round(x + 27 + i * 2.2 + Math.sin(cycle * 3.5) * 1.5);
          const zy = Math.round(y - 27 - cycle * 16);
          const size = 3 + i;
          this.drawPixelZ(zx, zy, size, zColor);
          ctx.restore();
        }
      }
      return;
    }

    // 2. THINKING / CONFUSED: Floating glowing '?' in top-right of screen
    if (state.expression === "thinking" || state.expression === "confused") {
      const floatBob = Math.sin(t * 3.8) * 1.2;
      const ex = Math.round(x + 28);
      const ey = Math.round(y - 30 + floatBob);
      
      this.drawPixelQuestionMark(ex + 1, ey + 1, "rgba(7, 10, 20, 0.6)");
      this.drawPixelQuestionMark(ex, ey, "#5cffea");
      return;
    }

    // 3. FRUSTRATED / ANGRY / STRESS: Pulsing anger mark in top-right of screen
    if (state.expression === "angry" || state.props.includes("stress")) {
      const pulse = Math.floor((now / 200) % 2);
      const ex = Math.round(x + 29);
      const ey = Math.round(y - 29);
      this.drawPixelAngerMark(ex, ey, pulse === 0 ? "#ff4455" : "#ff8866");
      return;
    }

    // 4. EXCITED: Twinkling cyber sparkle in top-right of screen
    if (state.expression === "excited") {
      const sparkleFrame = Math.floor((now / 150) % 3);
      const ex = Math.round(x + 29);
      const ey = Math.round(y - 30 + Math.sin(t * 5) * 1.0);
      this.drawPixelSparkle(ex, ey, sparkleFrame, "#5cffea");
      return;
    }

    // 5. COFFEE: Rising gentle pixel steam curls from mug (swaying with velocity)
    if (state.props.includes("coffee")) {
      const steamColor = state.settings.theme === "dark" ? "rgba(220, 240, 255, 0.7)" : "rgba(100, 120, 150, 0.6)";
      const windDrift = (state.velocityTilt ?? 0) * 12.0;
      for (let i = 0; i < 2; i++) {
        const cycle = ((now * 0.001) + i * 0.5) % 1.0;
        const alpha = Math.sin(cycle * Math.PI);
        if (alpha > 0.05) {
          ctx.save();
          ctx.globalAlpha = alpha * 0.75;
          const sx = Math.round(x + 22 + Math.sin(cycle * 6.28 + i) * 1.5 + windDrift * cycle);
          const sy = Math.round(y - 6 - cycle * 10);
          this.px(sx, sy, 1, 2, steamColor);
          ctx.restore();
        }
      }
    }

    // 6. AI SYNC: Micro neural spark particles radiating from center orb
    if (state.props.includes("ai_sync")) {
      for (let i = 0; i < 3; i++) {
        const cycle = ((now * 0.0009) + i * 0.33) % 1.0;
        const alpha = Math.sin(cycle * Math.PI);
        if (alpha > 0.05) {
          ctx.save();
          ctx.globalAlpha = alpha * 0.85;
          const angle = i * (Math.PI * 2 / 3) + t * 1.5;
          const dist = 3 + cycle * 7;
          const sx = Math.round(x + 24 + Math.cos(angle) * dist);
          const sy = Math.round(y + 1 + Math.sin(angle) * dist);
          const pColor = i % 2 === 0 ? "#5cffea" : "#ff55f7";
          this.px(sx, sy, 1, 1, pColor);
          ctx.restore();
        }
      }
    }
  }

  private drawPixelQuestionMark(x: number, y: number, color: string) {
    this.px(x, y, 3, 1, color);
    this.px(x + 2, y + 1, 1, 2, color);
    this.px(x + 1, y + 3, 1, 1, color);
    this.px(x + 1, y + 5, 1, 1, color);
  }

  private drawPixelZ(x: number, y: number, size: number, color: string) {
    if (size <= 3) {
      this.px(x, y, 3, 1, color);
      this.px(x + 1, y + 1, 1, 1, color);
      this.px(x, y + 2, 3, 1, color);
    } else if (size === 4) {
      this.px(x, y, 4, 1, color);
      this.px(x + 2, y + 1, 1, 1, color);
      this.px(x + 1, y + 2, 1, 1, color);
      this.px(x, y + 3, 4, 1, color);
    } else {
      this.px(x, y, 5, 1, color);
      this.px(x + 3, y + 1, 1, 1, color);
      this.px(x + 2, y + 2, 1, 1, color);
      this.px(x + 1, y + 3, 1, 1, color);
      this.px(x, y + 4, 5, 1, color);
    }
  }

  private drawPixelAngerMark(x: number, y: number, color: string) {
    this.px(x + 1, y, 1, 4, color);
    this.px(x + 3, y, 1, 4, color);
    this.px(x, y + 1, 4, 1, color);
    this.px(x, y + 3, 4, 1, color);
  }

  private drawPixelSparkle(x: number, y: number, frame: number, color: string) {
    if (frame === 0) {
      this.px(x + 2, y, 1, 5, color);
      this.px(x, y + 2, 5, 1, color);
    } else if (frame === 1) {
      this.px(x + 1, y + 1, 3, 3, color);
    } else {
      this.px(x + 1, y + 2, 3, 1, color);
      this.px(x + 2, y + 1, 1, 3, color);
    }
  }

  // Returns true if ALL requested images were drawn successfully
  private drawLayer(x: number, y: number, paths: string[], baseAction?: string, offX = 0, offY = 0): boolean {
    if (paths.length === 0) return true;
    let allDrawn = true;
    for (const path of paths) {
      const img = this.images.getImage(path);
      if (img && img.complete && img.naturalWidth > 0) {
        this.ctx.drawImage(img, x - 16 + offX, y - 42 + offY, 64, 64);
      } else {
        allDrawn = false;
      }
    }
    return allDrawn;
  }

  private withPixelScale(scale: number, draw: () => void) {
    this.ctx.save();
    this.ctx.scale(scale, scale);
    draw();
    this.ctx.restore();
  }

  private px(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }

  // ==========================================
  // FALLBACK PROGRAMMER ART (Used if PNGs are missing)
  // ==========================================
  
  private drawFallbackBase(x: number, y: number, action: RoboVisualState["baseAction"], glitch: boolean) {
    const body = "#dcdcdc";
    const shadow = "#9a9a9a";
    const line = "#070a14";

    if (glitch) {
      this.px(x - 3, y + 6, 24, 15, "#ff55f7");
      this.px(x + 5, y + 1, 23, 17, "#5cffea");
    }

    this.px(x + 6, y + 15, 18, 12, line);
    this.px(x + 7, y + 16, 16, 10, body);
    this.px(x + 4, y + 2, 22, 16, line);
    this.px(x + 5, y + 3, 20, 14, body);
    this.px(x + 7, y + 5, 16, 10, line); 

    if (action === "type") {
      this.px(x + 5, y + 18, 6, 4, shadow);
      this.px(x + 19, y + 18, 6, 4, shadow);
    } else {
      this.px(x + 5, y + 18, 4, 6, shadow);
      this.px(x + 21, y + 18, 4, 6, shadow);
    }
  }

  private drawFallbackFace(x: number, y: number, expression: RoboVisualState["expression"], now: number) {
    const cyan = "#5cffea";
    const blink = Math.floor(now / 3000) % 8 === 0;

    if (blink && expression !== "sleepy") return;

    switch (expression) {
      case "neutral":
        this.px(x + 9, y + 8, 3, 3, cyan);
        this.px(x + 18, y + 8, 3, 3, cyan);
        break;
      case "focused":
        this.px(x + 9, y + 8, 4, 2, cyan);
        this.px(x + 17, y + 8, 4, 2, cyan);
        break;
      case "happy":
        this.px(x + 9, y + 7, 3, 2, cyan);
        this.px(x + 8, y + 9, 1, 1, cyan);
        this.px(x + 12, y + 9, 1, 1, cyan);
        this.px(x + 18, y + 7, 3, 2, cyan);
        this.px(x + 17, y + 9, 1, 1, cyan);
        this.px(x + 21, y + 9, 1, 1, cyan);
        break;
      case "sleepy":
        this.px(x + 9, y + 10, 4, 1, cyan);
        this.px(x + 17, y + 10, 4, 1, cyan);
        break;
      case "confused":
        this.px(x + 9, y + 7, 3, 3, cyan);
        this.px(x + 18, y + 9, 3, 1, cyan);
        break;
      default:
        this.px(x + 9, y + 8, 3, 3, cyan);
        this.px(x + 18, y + 8, 3, 3, cyan);
        break;
    }
  }

  private drawFallbackAccessories(x: number, y: number, accessories: string[]) {
    if (accessories.includes("headphones")) {
      const hpColor = "#ff55f7";
      this.px(x + 3, y + 1, 24, 2, hpColor);
      this.px(x + 2, y + 3, 3, 8, hpColor);
      this.px(x + 25, y + 3, 3, 8, hpColor);
    }
  }

  private drawFallbackProps(x: number, y: number, props: string[]) {
    if (props.includes("coffee_cup")) {
      this.px(x - 4, y + 20, 6, 7, "#ffffff"); 
      this.px(x - 5, y + 21, 2, 4, "#ffffff"); 
      this.px(x - 3, y + 20, 4, 1, "#6f4e37"); 
    }
  }
}
