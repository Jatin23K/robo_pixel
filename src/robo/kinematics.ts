import type { RoboVisualState } from "./state";

export interface KinematicPose {
  // Torso Root
  torsoY: number;
  torsoAngle: number;
  torsoScaleX: number;
  torsoScaleY: number;

  // Head
  headPitchY: number;
  headAngle: number;
  headScanX: number;

  // Left Arm (Shoulder)
  armLAngle: number;
  armLOffY: number;

  // Right Arm (Shoulder)
  armRAngle: number;
  armROffY: number;

  // Left Leg (Hip)
  legLAngle: number;
  legLOffY: number;

  // Right Leg (Hip)
  legRAngle: number;
  legROffY: number;

  // Active Thruster Flames
  flameLHeight: number;
  flameRHeight: number;
  flareActive: boolean;
}

export function computeKinematicPose(
  state: RoboVisualState,
  now: number,
  lowDistraction: boolean
): KinematicPose {
  const isSleeping = state.baseAction === "sleep" || state.props.includes("sleeping");
  const isExcited = state.expression === "excited" || state.fidgetAction === "victory_jump";
  const isStressed = state.expression === "angry" || state.props.includes("stress");

  // =========================================================================
  // 1. ORGANIC RESPIRATION & LIVING BREATHING CYCLE
  // =========================================================================
  // Slower when sleeping, faster when excited or stressed
  const breathSpeed = isSleeping ? 0.0012 : isExcited ? 0.004 : isStressed ? 0.005 : 0.0022;
  const breath = Math.sin(now * breathSpeed);

  // Volume-preserving breathing heave
  let torsoY = breath * (isSleeping ? 0.8 : 1.2);
  let torsoScaleY = 1.0 + breath * 0.025;
  let torsoScaleX = 1.0 - breath * 0.015;

  // Natural desynced arm sway in idle
  let armLAngle = Math.sin(now * 0.0022) * 0.12;
  let armRAngle = -Math.sin(now * 0.0022 + 0.5) * 0.12;
  let armLOffY = 0;
  let armROffY = 0;

  // Leg micro-balance oscillations
  let legLAngle = Math.sin(now * 0.0018) * 0.07;
  let legRAngle = -Math.sin(now * 0.0018 + 0.6) * 0.07;
  let legLOffY = 0;
  let legROffY = 0;

  // Head base
  let headPitchY = 0;
  let headAngle = 0;
  let headScanX = 0;

  // =========================================================================
  // 2. VELOCITY TILT & DRAG INERTIA (Follow-Through Physics)
  // =========================================================================
  const velTilt = state.velocityTilt ?? 0;
  let torsoAngle = velTilt * 0.45;

  // Limbs lag behind velocity tilt
  armLAngle += -velTilt * 0.85;
  armRAngle += -velTilt * 0.85;
  legLAngle += -velTilt * 1.2;
  legRAngle += -velTilt * 1.2;

  // =========================================================================
  // 3. SQUASH & STRETCH (Landing Spring, Flinch Recoil, Hop Bounce)
  // =========================================================================
  if (state.squashFactor && state.squashFactor !== 1.0) {
    torsoScaleY *= state.squashFactor;
    torsoScaleX *= (1.0 / Math.sqrt(Math.max(0.5, state.squashFactor)));
    // Legs compress upward on squash
    const compression = (1.0 - state.squashFactor) * 4.0;
    legLOffY -= compression;
    legROffY -= compression;
  }

  // Click flinch recoil
  if (state.flinchProgress && state.flinchProgress > 0) {
    const flinch = Math.sin(state.flinchProgress * Math.PI);
    torsoY += flinch * 3.5;
    torsoAngle += -flinch * 0.15;
    armLAngle += -flinch * 0.35;
    armRAngle += flinch * 0.35;
    headPitchY += flinch * 2.0;
  }

  // Multi-click happy hop bounce
  if (state.bounceHopProgress && state.bounceHopProgress > 0) {
    const hop = Math.sin(state.bounceHopProgress * Math.PI);
    torsoY -= hop * 6.0;
    armLAngle -= hop * 0.45;
    armRAngle += hop * 0.45;
    legLAngle += hop * 0.25;
    legRAngle -= hop * 0.25;
  }

  // =========================================================================
  // 4. BIPEDAL LOCOMOTION GAIT (Walking / Stepping Cycle)
  // =========================================================================
  const isWalking = state.baseAction === "walk" || (state as any).isWalking;
  if (isWalking) {
    const walkFreq = now * 0.008;
    const stride = Math.sin(walkFreq);
    
    // Alternating leg strides (±24 degrees)
    legLAngle += stride * 0.42;
    legRAngle += -stride * 0.42;
    
    // Foot lift when swinging forward
    legLOffY += Math.max(0, -Math.cos(walkFreq)) * 2.5;
    legROffY += Math.max(0, Math.cos(walkFreq)) * 2.5;
    
    // Vertical bobbing of torso at double frequency
    torsoY += Math.abs(stride) * 1.5;
    
    // Natural counter-swinging arms
    armLAngle += -stride * 0.35;
    armRAngle += stride * 0.35;
  }

  // =========================================================================
  // 5. ACTIVITY MOTION PROFILES (The 7 Design Sheet Batches)
  // =========================================================================
  const props = state.props || [];
  const isCoding = props.includes("coding");
  const isCoffee = props.includes("coffee");
  const isReading = props.includes("reading");
  const isWriting = props.includes("writing");
  const isDesign = props.includes("design");
  const isGaming = props.includes("gaming");
  const isMusic = props.includes("music");
  const isCall = props.includes("call");
  const isAi = props.includes("ai_sync");
  const isBrowsing = props.includes("browsing");
  const isWatching = props.includes("watching");

  if (isCoding) {
    // Forward hunch toward laptop (Batch 1)
    torsoAngle += 0.07;
    torsoY += 0.8;
    headPitchY += 2.0; // looking down at screen
    // Rapid alternating typing flutter on keys (8-10 Hz)
    armLAngle += 0.22 + Math.sin(now * 0.024) * 0.16;
    armRAngle += -0.22 - Math.sin(now * 0.024 + Math.PI) * 0.16;
    armLOffY += Math.sin(now * 0.024) * 1.2;
    armROffY += -Math.sin(now * 0.024) * 1.2;
    legLAngle += 0.05;
    legRAngle += 0.05;
  } else if (isGaming) {
    // Intense gaming button mashing & body jitter (Batch 2)
    torsoAngle += Math.sin(now * 0.03) * 0.06;
    headPitchY += 1.2;
    armLAngle += 0.20 + Math.sin(now * 0.038) * 0.15;
    armRAngle += -0.20 - Math.cos(now * 0.038) * 0.15;
    armLOffY += Math.sin(now * 0.038) * 1.0;
    armROffY += Math.cos(now * 0.038) * 1.0;
    legLOffY += Math.sin(now * 0.015) * 0.8;
    legROffY += Math.cos(now * 0.015) * 0.8;
  } else if (isCoffee) {
    // 6-second periodic coffee sipping cycle (Batch 1)
    const sipCycle = ((now * 0.001) % 6.0);
    const isSipping = sipCycle < 2.5;
    const sipLift = isSipping ? Math.sin((sipCycle / 2.5) * Math.PI) : 0;
    armRAngle += -0.15 - sipLift * 0.40; // Mug lifts to visor
    armROffY += -sipLift * 3.5;
    headPitchY += -sipLift * 0.8; // Head tilts back to sip
    armLAngle += 0.10; // Left arm rests on hip/torso
  } else if (isReading) {
    // Book reading: left arm holds book, right arm turns pages (Batch 1)
    headPitchY += 1.8;
    headScanX += Math.sin(now * 0.0018) * 2.5; // Left-to-right text reading sweep
    headAngle += Math.sin(now * 0.0018) * 0.08;
    armLAngle += 0.24; // Left arm holds book
    const pageFlick = (now % 4000) < 350 ? Math.sin(((now % 4000) / 350) * Math.PI) : 0;
    armRAngle += -0.10 - pageFlick * 0.35;
    armROffY += -pageFlick * 2.2;
  } else if (isWriting || isDesign) {
    // Stylus sketching loops (Batch 1)
    torsoAngle += 0.06;
    headPitchY += 1.8;
    armLAngle += 0.15;
    armRAngle += -0.12 + Math.sin(now * 0.016) * 0.14;
    armROffY += Math.cos(now * 0.016) * 1.4;
  } else if (isMusic) {
    // Rhythmic head nodding & body groove to headphone beat (Batch 2)
    const beat = Math.abs(Math.sin(now * 0.008));
    headPitchY += beat * 3.0;
    torsoY += beat * 1.0;
    armLAngle += Math.sin(now * 0.004) * 0.22;
    armRAngle += -Math.sin(now * 0.004 + 0.6) * 0.22;
    legLAngle += Math.sin(now * 0.004) * 0.12;
    legRAngle += -Math.sin(now * 0.004) * 0.12;
  } else if (isCall) {
    // Communicator to ear (Batch 2)
    armRAngle += -0.45; // Right arm raised to side of head
    armROffY += -3.2;
    headAngle += 0.08; // Curious listening tilt
    armLAngle += Math.sin(now * 0.003) * 0.18; // Left arm conversational gestures
  } else if (isAi) {
    // Both arms raised forward interacting with neural orb (Batch 1)
    armLAngle += 0.25 + Math.sin(now * 0.006) * 0.08;
    armRAngle += -0.25 - Math.sin(now * 0.006) * 0.08;
    torsoY += Math.sin(now * 0.003) * 0.8;
  } else if (isBrowsing || isWatching) {
    // Attentive observation with active gaze scanning
    headScanX += Math.sin(now * 0.0012) * 2.0;
    headPitchY += 0.5 + Math.sin(now * 0.0008) * 0.5;
    armLAngle += 0.08;
    armRAngle += -0.08;
  } else if (isStressed) {
    // Jittery nervous tremors across all limbs (Batch 4)
    const jitter = () => (Math.random() - 0.5);
    torsoAngle += jitter() * 0.06;
    armLAngle += 0.15 + jitter() * 0.25;
    armRAngle += -0.15 + jitter() * 0.25;
    legLAngle += jitter() * 0.18;
    legRAngle += jitter() * 0.18;
  } else if (isSleeping) {
    // Heavy slouch & limp dangling limbs (Batch 4)
    torsoY += 1.8;
    headPitchY += 3.4; // Chin dropped forward onto chest
    armLAngle += 0.12;
    armRAngle += -0.12;
    legLAngle += 0.06;
    legRAngle += -0.06;
  }

  // =========================================================================
  // 6. FIDGET ACTIONS & PROCEDURAL KEYFRAMES
  // =========================================================================
  if (state.fidgetAction && state.fidgetProgress !== undefined && state.fidgetProgress > 0) {
    const p = state.fidgetProgress;
    const factor = Math.sin(p * Math.PI);

    switch (state.fidgetAction) {
      case "tilt_right":
        headAngle += factor * 0.24; // Inquisitive puppy tilt
        torsoAngle += factor * 0.06;
        armLAngle += factor * 0.16;
        armRAngle += factor * 0.16;
        legLAngle += factor * 0.10;
        legRAngle += -factor * 0.08;
        break;
      case "tilt_left":
        headAngle += -factor * 0.24;
        torsoAngle += -factor * 0.06;
        armLAngle += -factor * 0.16;
        armRAngle += -factor * 0.16;
        legLAngle += -factor * 0.08;
        legRAngle += factor * 0.10;
        break;
      case "thruster_hop": {
        const hopCycle = Math.sin(p * Math.PI * 2);
        torsoY += -hopCycle * 5.5;
        armLAngle += hopCycle * 0.35;
        armRAngle += -hopCycle * 0.35;
        legLAngle += -hopCycle * 0.22;
        legRAngle += hopCycle * 0.22;
        break;
      }
      case "scan_glance":
      case "double_glance":
        headScanX += Math.sin(p * Math.PI * 2) * 3.5;
        headAngle += Math.sin(p * Math.PI * 2) * 0.15;
        break;
      case "look_up":
        headPitchY += -factor * 1.5;
        torsoAngle += -factor * 0.10;
        armLAngle += factor * 0.22;
        armRAngle += -factor * 0.22;
        legLAngle += factor * 0.18;
        legRAngle += factor * 0.18;
        break;
      case "look_down":
        headPitchY += factor * 2.8;
        torsoAngle += factor * 0.10;
        armLAngle += -factor * 0.18;
        armRAngle += factor * 0.18;
        legLAngle += -factor * 0.14;
        legRAngle += -factor * 0.14;
        break;
      case "glitch_twitch": {
        const rnd = () => (Math.random() - 0.5);
        headAngle += rnd() * 0.25;
        headPitchY += rnd() * 2.0;
        armLAngle += rnd() * 0.40;
        armRAngle += rnd() * 0.40;
        legLAngle += rnd() * 0.30;
        legRAngle += rnd() * 0.30;
        break;
      }
      case "energy_recharge": {
        // Body straightens upright, arms lift slowly to absorb pulse (Batch 5)
        torsoY += -factor * 2.5;
        armLAngle += -factor * 0.42;
        armRAngle += factor * 0.42;
        legLAngle += factor * 0.15;
        legRAngle += -factor * 0.15;
        break;
      }
      case "yawn_stretch": {
        // Deep arch back, arms raised high
        torsoAngle += -factor * 0.18;
        headPitchY += -factor * 1.2;
        armLAngle += -factor * 0.65;
        armRAngle += factor * 0.65;
        armLOffY += -factor * 3.0;
        armROffY += -factor * 3.0;
        legLAngle += factor * 0.20;
        legRAngle += factor * 0.20;
        break;
      }
      case "dart_dash": {
        // High-speed aerodynamic flight: body forward, limbs swept back (Batch 3)
        torsoAngle += 0.25;
        armLAngle += 0.45;
        armRAngle += -0.45;
        legLAngle += -0.38;
        legRAngle += -0.35;
        break;
      }
      case "victory_jump": {
        // Double-arm V-cheer celebration (Batch 4)
        const vWave = Math.sin(now * 0.015) * 0.12;
        armLAngle += -0.55 + vWave; // Wide V-raise (~35° outward)
        armRAngle += 0.55 - vWave;
        torsoAngle += -0.10;
        torsoY += -factor * 4.0;
        legLAngle += -0.22;
        legRAngle += 0.22;
        break;
      }
      case "tickle_wiggle": {
        // Rapid laughter wiggle
        const wiggle = Math.sin(p * Math.PI * 8);
        headAngle += wiggle * 0.18;
        torsoAngle += wiggle * 0.12;
        armLAngle += wiggle * 0.35;
        armRAngle += -wiggle * 0.35;
        legLAngle += wiggle * 0.25;
        legRAngle += -wiggle * 0.25;
        break;
      }
      case "ceiling_bonk": {
        // Sudden upward bonk and squash rebound
        const bonkPhase = p < 0.3 ? p / 0.3 : (p - 0.3) / 0.7;
        if (p < 0.3) {
          torsoY += -bonkPhase * 6.0;
          headPitchY += -bonkPhase * 2.0;
        } else {
          torsoY += (1 - bonkPhase) * 4.0;
          headPitchY += bonkPhase * 2.5;
        }
        break;
      }
    }
  }

  // =========================================================================
  // 7. THRUSTER FLAME DYNAMICS
  // =========================================================================
  const flareActive = Boolean(
    state.afterburnerActive ||
    state.fidgetAction === "thruster_hop" ||
    state.fidgetAction === "dart_dash" ||
    state.fidgetAction === "victory_jump" ||
    isWalking ||
    Math.abs(velTilt) > 0.08
  );

  let flameLHeight = 0;
  let flameRHeight = 0;
  if (flareActive && !lowDistraction) {
    const baseFlame = 4 + Math.floor(Math.sin(now * 0.04) * 2.5);
    flameLHeight = Math.max(2, baseFlame + Math.sin(now * 0.035) * 1.5);
    flameRHeight = Math.max(2, baseFlame + Math.cos(now * 0.035) * 1.5);
  }

  return {
    torsoY,
    torsoAngle,
    torsoScaleX,
    torsoScaleY,
    headPitchY: Math.max(-1.0, Math.min(3.4, headPitchY)),
    headAngle,
    headScanX,
    armLAngle,
    armLOffY,
    armRAngle,
    armROffY,
    legLAngle,
    legLOffY,
    legRAngle,
    legROffY,
    flameLHeight,
    flameRHeight,
    flareActive
  };
}
