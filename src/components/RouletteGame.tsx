import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, RotateCcw, Undo, CircleDot, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import confetti from 'canvas-confetti';
import { BettingBoard } from './BettingBoard';
import { BetType, RouletteBet, RoulettePlayer, calculatePayouts, PLAYER_COLORS } from '../lib/rouletteUtils';

const WHEEL_NUMBERS = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 
  16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const CHIPS = [5, 10, 50, 100, 500];

const RECENT_NUMBERS = [
  { val: 32, type: 'red' }, { val: 15, type: 'black' }, { val: 19, type: 'red' },
  { val: 0, type: 'zero' }, { val: 2, type: 'black' }, { val: 25, type: 'red' },
];

const getNumberColor = (num: number) => {
  if (num === 0) return 'zero';
  const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  return redNumbers.includes(num) ? 'red' : 'black';
};

// --- Audio Engine (Web Audio API Synthesizer) ---

const useRouletteAudio = () => {
  const audioCtx = useRef<AudioContext | null>(null);

  const init = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.current.state === 'suspended') {
      audioCtx.current.resume();
    }
  };

  const playClick = (freq = 440, type: OscillatorType = 'sine', volume = 0.1, duration = 0.1) => {
    if (!audioCtx.current) return;
    const osc = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.current.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.current.currentTime + duration);
    
    gain.gain.setValueAtTime(volume, audioCtx.current.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.current.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.current.destination);
    
    osc.start();
    osc.stop(audioCtx.current.currentTime + duration);
  };

  const playLaunch = () => {
    init();
    if (!audioCtx.current) return;
    // Fast noise sweep for ball launch
    const bufferSize = audioCtx.current.sampleRate * 0.2;
    const buffer = audioCtx.current.createBuffer(1, bufferSize, audioCtx.current.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const source = audioCtx.current.createBufferSource();
    const filter = audioCtx.current.createBiquadFilter();
    const gain = audioCtx.current.createGain();

    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, audioCtx.current.currentTime);
    filter.frequency.exponentialRampToValueAtTime(400, audioCtx.current.currentTime + 0.2);

    gain.gain.setValueAtTime(0.3, audioCtx.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + 0.2);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.current.destination);
    source.start();
  };

  const playWallHit = (velocity: number) => {
    const vol = Math.min(0.2, velocity / 100);
    playClick(150 + Math.random() * 50, 'sine', vol, 0.05);
  };

  const playDeflectorClink = (velocity: number) => {
    const vol = Math.min(0.3, velocity / 50);
    // Higher metallic ping
    playClick(2000 + Math.random() * 500, 'triangle', vol, 0.04);
  };

  const playSettleTick = () => {
    playClick(800, 'square', 0.05, 0.02);
  };

  return { playLaunch, playWallHit, playDeflectorClink, playSettleTick, init };
};

// --- Custom 2D Canvas Physics Engine ---

const CanvasRoulette = ({ isSpinning, onResult, spinTrigger }: { isSpinning: boolean, onResult: (num: number) => void, spinTrigger: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const audio = useRouletteAudio();
  const lastPocketIdx = useRef(-1);
  const settleAnim = useRef(0); // For juicy settle movement
  
  // State refs for physics
  const state = useRef({
    wheelAngle: 0,
    wheelSpeed: 0,
    ball: { x: 0, y: 0, vx: 0, vy: 0, radius: 0, jitter: 0 },
    phase: 'IDLE' as 'IDLE' | 'SPINNING' | 'SETTLING' | 'SETTLED',
    settleIndex: -1,
    deflectors: [] as {angle: number, radius: number}[],
    reportedResult: false
  });

  // Init deflectors
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxRadius = Math.min(cx, cy) - 15;
    
    const defs = [];
    for(let i=0; i<8; i++) {
        defs.push({ angle: (i/8) * Math.PI * 2, radius: maxRadius * 0.90 });
    }
    state.current.deflectors = defs;
  }, []);

  // Trigger Spin
  useEffect(() => {
    if (spinTrigger > 0) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxRadius = (canvas.width / 2) - 15;

      audio.playLaunch();
      state.current.phase = 'SPINNING';
      state.current.wheelSpeed = 0.15 + Math.random() * 0.05; // Rad per frame
      
      // Launch ball exactly on outer rim
      const launchAngle = Math.random() * Math.PI * 2;
      const launchRadius = maxRadius - 12;
      const ballSpeed = 8 + Math.random() * 3; // pixels per frame
      
      state.current.ball = {
        x: Math.cos(launchAngle) * launchRadius,
        y: Math.sin(launchAngle) * launchRadius,
        vx: -Math.sin(launchAngle) * ballSpeed, // Tangent velocity
        vy: Math.cos(launchAngle) * ballSpeed,
        radius: launchRadius,
        jitter: 0
      };
      
      state.current.settleIndex = -1;
      state.current.reportedResult = false;
    }
  }, [spinTrigger]);

  // Main Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    const drawWheel = (cx: number, cy: number, radius: number, angle: number) => {
        ctx.save();
        ctx.translate(cx, cy);
        
        // 1. Static Outer Bowl - Wood Bezel
        // Outer wood ring
        const bezelGrad = ctx.createRadialGradient(0, 0, radius - 20, 0, 0, radius + 10);
        bezelGrad.addColorStop(0, '#2d1a10');
        bezelGrad.addColorStop(0.5, '#4a2c1d');
        bezelGrad.addColorStop(1, '#170c08');
        
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fillStyle = bezelGrad;
        ctx.fill();
        
        // Inner rim highlight (Gold)
        ctx.beginPath();
        ctx.arc(0, 0, radius - 5, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#d4af3788';
        ctx.stroke();

        // 2. Bowl Slope
        const slopeGrad = ctx.createRadialGradient(0, 0, radius * 0.8, 0, 0, radius - 10);
        slopeGrad.addColorStop(0, '#1a191f');
        slopeGrad.addColorStop(0.7, '#0f0e13');
        slopeGrad.addColorStop(1, '#050505');
        
        ctx.beginPath();
        ctx.arc(0, 0, radius - 10, 0, Math.PI * 2);
        ctx.fillStyle = slopeGrad;
        ctx.fill();

        // Slope shading (ambient occlusion)
        const aoGrad = ctx.createRadialGradient(0, 0, radius * 0.8, 0, 0, radius - 10);
        aoGrad.addColorStop(0, 'transparent');
        aoGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
        ctx.fillStyle = aoGrad;
        ctx.fill();

        // 3. Deflectors (Diamonds on the slope)
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 4;
        state.current.deflectors.forEach(def => {
            const dx = Math.cos(def.angle) * def.radius;
            const dy = Math.sin(def.angle) * def.radius;
            ctx.save();
            ctx.translate(dx, dy);
            ctx.rotate(def.angle + Math.PI/4);
            
            // Deflector body
            const defGrad = ctx.createLinearGradient(-4, -4, 4, 4);
            defGrad.addColorStop(0, '#fef9c3');
            defGrad.addColorStop(0.5, '#d4af37');
            defGrad.addColorStop(1, '#a16207');
            ctx.fillStyle = defGrad;
            ctx.beginPath();
            ctx.rect(-4, -4, 8, 8);
            ctx.fill();
            
            // Small peak highlight
            ctx.fillStyle = '#fff';
            ctx.globalAlpha = 0.3;
            ctx.fillRect(-1, -1, 2, 2);
            ctx.restore();
        });
        ctx.shadowBlur = 0;

        // --- Rotating Rotor ---
        ctx.save();
        ctx.rotate(angle);

        // 4. Rotor Base Rings
        const wheelR = radius * 0.85;
        const innerR = radius * 0.38;
        const arc = (Math.PI * 2) / 37;

        // Brass base of the pockets
        const brassGrad = ctx.createRadialGradient(0, 0, innerR, 0, 0, wheelR);
        brassGrad.addColorStop(0, '#e9c349');
        brassGrad.addColorStop(0.1, '#a16207');
        brassGrad.addColorStop(0.9, '#a16207');
        brassGrad.addColorStop(1, '#e9c349');

        ctx.beginPath();
        ctx.arc(0, 0, wheelR, 0, Math.PI * 2);
        ctx.fillStyle = brassGrad;
        ctx.fill();

        // 5. Drawing Pockets
        const pocketMaxR = radius * 0.82;
        const pocketMinR = radius * 0.40;

        for (let i = 0; i < 37; i++) {
            const num = WHEEL_NUMBERS[i];
            const colorType = getNumberColor(num);
            
            // Vertical gradient for depth inside the pocket
            const pX = Math.cos(i * arc + arc/2) * pocketMaxR;
            const pY = Math.sin(i * arc + arc/2) * pocketMaxR;
            const pX2 = Math.cos(i * arc + arc/2) * pocketMinR;
            const pY2 = Math.sin(i * arc + arc/2) * pocketMinR;
            
            const cellGrad = ctx.createLinearGradient(pX, pY, pX2, pY2);
            if (colorType === 'red') {
                cellGrad.addColorStop(0, '#5a0000');
                cellGrad.addColorStop(1, '#aa0000');
            } else if (colorType === 'black') {
                cellGrad.addColorStop(0, '#000000');
                cellGrad.addColorStop(1, '#1a191f');
            } else {
                cellGrad.addColorStop(0, '#713f12');
                cellGrad.addColorStop(1, '#e9c349');
            }

            ctx.beginPath();
            ctx.moveTo(Math.cos(i*arc)*pocketMinR, Math.sin(i*arc)*pocketMinR);
            ctx.arc(0, 0, pocketMaxR, i * arc, (i + 1) * arc);
            ctx.lineTo(Math.cos((i+1)*arc)*pocketMinR, Math.sin((i+1)*arc)*pocketMinR);
            ctx.closePath();
            ctx.fillStyle = cellGrad;
            ctx.fill();

            // Winning Glow Effect
            if (state.current.phase === 'SETTLED' && state.current.wheelSpeed === 0 && i === state.current.settleIndex) {
                ctx.save();
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 15 + Math.sin(Date.now() / 200) * 5;
                ctx.fill();
                ctx.restore();
            }
            
            // Brass dividers (separators)
            const divGrad = ctx.createLinearGradient(
                Math.cos(i*arc)*pocketMinR, Math.sin(i*arc)*pocketMinR,
                Math.cos(i*arc)*pocketMaxR, Math.sin(i*arc)*pocketMaxR
            );
            divGrad.addColorStop(0, '#fef9c3');
            divGrad.addColorStop(0.5, '#d4af37');
            divGrad.addColorStop(1, '#a16207');

            ctx.strokeStyle = divGrad;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(i*arc)*pocketMinR, Math.sin(i*arc)*pocketMinR);
            ctx.lineTo(Math.cos(i*arc)*pocketMaxR, Math.sin(i*arc)*pocketMaxR);
            ctx.stroke();

            // Text Rendering
            ctx.save();
            ctx.rotate(i * arc + arc / 2);
            ctx.translate(pocketMaxR - 28, 0);
            ctx.rotate(Math.PI / 2);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 24px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 4;
            ctx.fillText(num.toString(), 0, 0);
            ctx.restore();
        }

        // 6. Center Decorative Element
        // Metallic hub with concentric highlights
        const hubGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, innerR);
        hubGrad.addColorStop(0, '#1a191f');
        hubGrad.addColorStop(0.8, '#0a0a0c');
        hubGrad.addColorStop(1, '#d4af37');
        
        ctx.beginPath();
        ctx.arc(0, 0, innerR, 0, Math.PI * 2);
        ctx.fillStyle = hubGrad;
        ctx.fill();
        
        // Concentric detail rings
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.3)';
        ctx.lineWidth = 1;
        for(let r=10; r < innerR; r += 20) {
            ctx.beginPath();
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Central brass turret
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        const turretGrad = ctx.createRadialGradient(-5, -5, 0, 0, 0, 24);
        turretGrad.addColorStop(0, '#fef9c3');
        turretGrad.addColorStop(0.6, '#d4af37');
        turretGrad.addColorStop(1, '#713f12');
        ctx.fillStyle = turretGrad;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 15;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore(); // End Rotor rotation
        ctx.restore(); // End translation
    };

    const drawBall = (cx: number, cy: number, ballPos: {x: number, y: number, jitter: number}) => {
        ctx.save();
        // Visual jitter for rattling effect
        const jX = (Math.random() - 0.5) * ballPos.jitter;
        const jY = (Math.random() - 0.5) * ballPos.jitter;
        ctx.translate(cx + ballPos.x + jX, cy + ballPos.y + jY);
        
        // Dynamic shadow based on distance (subtle depth)
        const dist = Math.sqrt(ballPos.x**2 + ballPos.y**2);
        const shadowOffset = 2 + (dist / 100);
        
        // If rattling, elevate ball visually (Subtler bounce)
        const ballBaseRadius = 7; // Increased size
        const bounceScale = 1 + (ballPos.jitter / 25);
        
        ctx.beginPath();
        ctx.arc(shadowOffset * (1 + ballPos.jitter/4), shadowOffset * (1 + ballPos.jitter/4), ballBaseRadius * bounceScale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();

        // 3D Spherical Ball Shading
        const ballGrad = ctx.createRadialGradient(-2, -2, 0, 0, 0, ballBaseRadius * bounceScale);
        ballGrad.addColorStop(0, '#ffffff');
        ballGrad.addColorStop(0.8, '#e5e5e5');
        ballGrad.addColorStop(1, '#999999');

        ctx.beginPath();
        ctx.arc(0, 0, ballBaseRadius * bounceScale, 0, Math.PI * 2);
        ctx.fillStyle = ballGrad;
        ctx.fill();
        
        // Specular highlight
        ctx.beginPath();
        ctx.arc(-2.5 * bounceScale, -2.5 * bounceScale, 2 * bounceScale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();

        ctx.restore();
    };

    const loop = (time: number) => {
        if (!lastTime) lastTime = time;
        // Limit delta time to catch nasty lag spikes (max 0.1s step)
        const dtRaw = (time - lastTime) / (1000 / 60);
        const dt = Math.min(dtRaw, 6.0); 
        lastTime = time;

        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        // Keep a margin for the stroke
        const maxRadius = Math.min(cx, cy) - 15; 
        const st = state.current;

        // Skip rendering if visually settled and idle state to save power
        if (st.phase === 'SETTLED' && st.wheelSpeed === 0 && !st.ball.jitter) {
            // Draw one final crisp frame then stop requesting frames until triggered
            if (!st.reportedResult) {
               ctx.fillStyle = '#120f18';
               ctx.fillRect(0, 0, canvas.width, canvas.height);
               drawWheel(cx, cy, maxRadius, st.wheelAngle);
               drawBall(cx, cy, st.ball);
               st.reportedResult = true;
               onResult(WHEEL_NUMBERS[st.settleIndex]);
            }
            requestRef.current = requestAnimationFrame(loop);
            return;
        }

        // Use a nice dark background matching the UI
        ctx.fillStyle = '#120f18';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // --- Physics Update ---
        
        // Wheel deceleration
        if (st.phase !== 'IDLE') {
            st.wheelAngle -= st.wheelSpeed * dt;
            // Slow down faster if ball is settling/settled for a snappy finish
            const friction = (st.phase === 'SETTLING' || st.phase === 'SETTLED') ? 0.982 : 0.994;
            st.wheelSpeed *= friction; 
        }

        if (st.phase === 'SPINNING') {
            // Ball movement
            st.ball.x += st.ball.vx * dt;
            st.ball.y += st.ball.vy * dt;
            
            const dist = Math.sqrt(st.ball.x**2 + st.ball.y**2);
            st.ball.radius = dist;
            const speed = Math.sqrt(st.ball.vx**2 + st.ball.vy**2);

            // Ball Friction
            st.ball.vx *= 0.9975; 
            st.ball.vy *= 0.9975;

            // Gravity pull towards center (the bowl slope)
            if (dist > 0) {
                let pull = 0.28; // Stronger pull to get into boxes earlier
                st.ball.vx -= (st.ball.x / dist) * pull * dt;
                st.ball.vy -= (st.ball.y / dist) * pull * dt;
            }

            // Deflector Collision
            const defMin = maxRadius * 0.86;
            const defMax = maxRadius * 0.94;
            if (dist > defMin && dist < defMax) {
                st.deflectors.forEach(def => {
                    const dx = Math.cos(def.angle) * def.radius - st.ball.x;
                    const dy = Math.sin(def.angle) * def.radius - st.ball.y;
                    const dDist = Math.sqrt(dx**2 + dy**2);
                    
                    if (dDist < 12) {
                        // Bounce! Retain more energy and add more kick
                        const speed = Math.sqrt(st.ball.vx**2 + st.ball.vy**2);
                        audio.playDeflectorClink(speed);

                        st.ball.vx = -st.ball.vx * 0.8 + (Math.random() - 0.5) * 6;
                        st.ball.vy = -st.ball.vy * 0.8 + (Math.random() - 0.5) * 6;
                        // Push out to avoid getting stuck
                        st.ball.x -= dx * 0.3;
                        st.ball.y -= dy * 0.3;
                    }
                });
            }

            // Outer boundary collision (keep ball in track)
            if (dist > maxRadius - 10) {
                const nx = st.ball.x / dist;
                const ny = st.ball.y / dist;
                st.ball.x = nx * (maxRadius - 10);
                st.ball.y = ny * (maxRadius - 10);
                
                const dot = (st.ball.vx * nx + st.ball.vy * ny);
                audio.playWallHit(speed);
                st.ball.vx -= 1.9 * dot * nx; // Bouncier walls
                st.ball.vy -= 1.9 * dot * ny;
            }

            // Hub boundary collision (prevent passing through center)
            const hubR = maxRadius * 0.38;
            if (dist < hubR) {
                const nx = st.ball.x / dist;
                const ny = st.ball.y / dist;
                st.ball.x = nx * hubR;
                st.ball.y = ny * hubR;
                
                const dot = (st.ball.vx * nx + st.ball.vy * ny);
                audio.playWallHit(speed);
                st.ball.vx -= 1.8 * dot * nx; // Bounce off the center hub
                st.ball.vy -= 1.8 * dot * ny;
            }

            // Enter pockets area (settling mechanism)
            const pocketR_outer = maxRadius * 0.82;
            const pocketR_inner = maxRadius * 0.40;
            const pocketR_settle = maxRadius * 0.48; // "Bottom" of the box
            
            // Add Physical Divider Ticks
            if (dist < pocketR_outer && dist > pocketR_inner) {
                let ballAngle = Math.atan2(st.ball.y, st.ball.x);
                let relAngle = ballAngle - st.wheelAngle;
                relAngle = (relAngle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                const arc = (Math.PI * 2) / 37;
                
                // Which divider are we near?
                const nearestDividerAngle = Math.round(relAngle / arc) * arc;
                const angleDiff = relAngle - nearestDividerAngle;
                
                if (Math.abs(angleDiff) < 0.04) { // Collision with divider line
                    const currentPocketIdx = Math.floor(relAngle / arc);
                    if (currentPocketIdx !== lastPocketIdx.current) {
                        audio.playSettleTick();
                        lastPocketIdx.current = currentPocketIdx;
                        
                        // Subtle visual rattle
                        st.ball.jitter = 0.8; 
                    }
                    
                    // Very light damping to keep it fast
                    st.ball.vx *= 0.98;
                    st.ball.vy *= 0.98;

                    // Deflection
                    const deflect = 1.2;
                    st.ball.vx += (Math.random() - 0.5) * deflect;
                    st.ball.vy += (Math.random() - 0.5) * deflect;

                    // "Ejection" Physics: Bounce back OUTSIDE if hitting hard
                    const speed = Math.sqrt(st.ball.vx**2 + st.ball.vy**2);
                    if (speed > 4) {
                        // Add an outward radial impulse (Reduced strength)
                        const nx = st.ball.x / dist;
                        const ny = st.ball.y / dist;
                        st.ball.vx += nx * 0.8; 
                        st.ball.vy += ny * 0.8;
                    }

                    // Minimized positional push just to prevent sticking
                    const pushAngle = st.wheelAngle + nearestDividerAngle + (angleDiff > 0 ? 0.03 : -0.03);
                    st.ball.x = Math.cos(pushAngle) * dist;
                    st.ball.y = Math.sin(pushAngle) * dist;
                }
            }

            if (dist < pocketR_settle + 8 && speed < 0.8) { 
                let ballAngle = Math.atan2(st.ball.y, st.ball.x);
                let relAngle = ballAngle - st.wheelAngle;
                relAngle = (relAngle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                
                const arc = (Math.PI * 2) / 37;
                const pMid = (Math.floor(relAngle / arc) * arc) + (arc / 2);
                
                // Only settle if we are reasonably centered in the pocket arc
                // This prevents "teleporting" through dividers at the last millisecond
                if (Math.abs(relAngle - pMid) < arc * 0.4) {
                    st.settleIndex = Math.floor(relAngle / arc);
                    audio.playSettleTick();
                    
                    st.phase = 'SETTLING';
                    
                    // Capture final velocity to drive the "emotion" of the rattle
                    // We'll store it as a residual force for the spring logic
                    st.ball.vx *= 0.5;
                    st.ball.vy *= 0.5;
                    settleAnim.current = 1.0;
                }
            }
        }

        if (st.phase === 'SETTLING' || st.phase === 'SETTLED') {
            const arc = (Math.PI * 2) / 37;
            const targetAngle = st.wheelAngle + (st.settleIndex * arc) + (arc / 2);
            const r = maxRadius * 0.48;
            
            const targetX = Math.cos(targetAngle) * r;
            const targetY = Math.sin(targetAngle) * r;

            if (st.phase === 'SETTLING') {
                // Precision Settlement: Damped Spring System
                // Instead of simple linear move, we use physics-lite to find the center
                const dx = targetX - st.ball.x;
                const dy = targetY - st.ball.y;
                
                // Spring force
                const springK = 0.12;
                st.ball.vx += dx * springK * dt;
                st.ball.vy += dy * springK * dt;
                
                // Heavy damping inside the pocket
                st.ball.vx *= 0.85;
                st.ball.vy *= 0.85;
                
                st.ball.x += st.ball.vx * dt;
                st.ball.y += st.ball.vy * dt;
                
                // Rattling noise effect based on speed and settle progress
                settleAnim.current *= 0.94;
                st.ball.jitter = Math.sin(time * 0.3) * settleAnim.current * 4.5;

                const distToTarget = Math.sqrt(dx*dx + dy*dy);
                if (distToTarget < 0.5 && settleAnim.current < 0.05) {
                    st.phase = 'SETTLED';
                    st.ball.jitter = 0;
                    st.ball.vx = 0;
                    st.ball.vy = 0;
                }
            } else {
                st.ball.x = targetX;
                st.ball.y = targetY;
            }

            // When wheel almost stops completely, finish settling
            if (st.wheelSpeed < 0.002 && isSpinning && !st.reportedResult) {
                st.wheelSpeed = 0; // Stop completely, drawing block at top of loop will trigger onResult next frame.
            }
        }

        // --- Render Content ---
        drawWheel(cx, cy, maxRadius, st.wheelAngle);
        
        // BUG FIX: The ball should show if it's spinning OR settled.
        // If it settled, settleIndex will be >= 0.
        if (st.phase === 'SPINNING' || st.phase === 'SETTLED' || st.settleIndex >= 0) {
             drawBall(cx, cy, st.ball);
        }

        requestRef.current = requestAnimationFrame(loop);
    };

    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isSpinning, onResult]);

  return (
    <canvas 
        ref={canvasRef} 
        width={800} 
        height={800} 
        className="w-full h-full object-contain max-w-[800px] max-h-[800px] drop-shadow-[0_40px_80px_rgba(0,0,0,0.9)]"
    />
  );
};

// --- Main Game UI Component --- //

interface RouletteGameProps {
    players: RoulettePlayer[];
    activePlayerId: string;
    setPlayers: React.Dispatch<React.SetStateAction<RoulettePlayer[]>>;
    setActivePlayerId: (id: string) => void;
    onAddPlayer: () => void;
    onExit: () => void;
}

export function RouletteGame({
    players, activePlayerId, setPlayers, setActivePlayerId, onAddPlayer, onExit
}: RouletteGameProps) {
  const activePlayer = players.find(p => p.id === activePlayerId) || players[0];
  const [selectedChip, setSelectedChip] = useState(50);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [spinTrigger, setSpinTrigger] = useState(0);
  const [history, setHistory] = useState<{val: number, type: string}[]>([]);

  // --- Betting State (Local to game round) ---
  const [bets, setBets] = useState<RouletteBet[]>([]);
  const [previousBets, setPreviousBets] = useState<RouletteBet[]>([]);
  const [payoutsData, setPayoutsData] = useState<{playerId: string, winnings: number}[]>([]);

  const handlePlaceBet = (type: BetType, numbers: number[]) => {
    if (isSpinning) return;
    const player = players.find(p => p.id === activePlayerId);
    if (!player || (player.balance - selectedChip < -100000)) return;

    setPlayers(prev => prev.map(p => p.id === activePlayerId ? { ...p, balance: p.balance - selectedChip } : p));
    setBets(prev => [...prev, { id: Date.now().toString() + Math.random(), playerId: activePlayerId, type, numbers, amount: selectedChip }]);
  };

  const undoLastBet = () => {
    if (isSpinning || bets.length === 0) return;
    const lastBet = bets[bets.length - 1];
    setPlayers(prev => prev.map(p => p.id === lastBet.playerId ? { ...p, balance: p.balance + lastBet.amount } : p));
    setBets(prev => prev.slice(0, -1));
  };
  
  const clearBets = () => {
    if (isSpinning) return;
    setPlayers(prev => prev.map(p => {
        const playerBets = bets.filter(b => b.playerId === p.id);
        const totalBack = playerBets.reduce((sum, b) => sum + b.amount, 0);
        return { ...p, balance: p.balance + totalBack };
    }));
    setBets([]);
  };

  const handleRepeatBet = () => {
    if (isSpinning || previousBets.length === 0 || bets.length > 0) return;
    
    setPlayers(prev => {
        const next = [...prev];
        let possible = true;
        
        // Validation check
        previousBets.forEach(bet => {
            const pIndex = next.findIndex(p => p.id === bet.playerId);
            if (pIndex === -1 || next[pIndex].balance < bet.amount) {
                possible = false;
            }
        });

        if (!possible) return prev;

        // Apply
        previousBets.forEach(bet => {
            const pIndex = next.findIndex(p => p.id === bet.playerId);
            next[pIndex].balance -= bet.amount;
        });
        return next;
    });

    setBets(previousBets.map(b => ({ ...b, id: Date.now().toString() + Math.random() })));
  };

  const handleDoubleBet = () => {
    if (isSpinning || bets.length === 0) return;

    setPlayers(prev => {
        const next = [...prev];
        let possible = true;
        
        bets.forEach(bet => {
            const pIndex = next.findIndex(p => p.id === bet.playerId);
            if (pIndex === -1 || next[pIndex].balance < bet.amount) {
                possible = false;
            }
        });

        if (!possible) return prev;

        bets.forEach(bet => {
            const pIndex = next.findIndex(p => p.id === bet.playerId);
            next[pIndex].balance -= bet.amount;
        });
        return next;
    });

    setBets(prev => [...prev, ...prev.map(b => ({ ...b, id: Date.now().toString() + Math.random() }))]);
  };

  const startSpin = () => {
    if (isSpinning || bets.length === 0 || result !== null) return;
    setPreviousBets([...bets]);
    setIsSpinning(true);
    setResult(null);
    setPayoutsData([]);
    setSpinTrigger(Date.now());
  };

  const handleResult = useCallback((num: number) => {
    setIsSpinning(false);
    setResult(num);
    setHistory(prev => [{ val: num, type: getNumberColor(num) }, ...prev].slice(0, 10));
    confetti({
      particleCount: 200,
      spread: 90,
      origin: { x: 0.5, y: 0.5 },
      colors: ['#ff2a2a', '#e9c349', '#ffffff', '#000000']
    });

    const results = calculatePayouts(num, bets);
    setPayoutsData(results);
    
    setPlayers(prev => prev.map(p => {
        const gains = results.find(r => r.playerId === p.id);
        if (gains) {
            return { ...p, balance: p.balance + gains.winnings + gains.returned };
        }
        return p;
    }));
  }, [bets, players, setPlayers]);

  const dismissResult = () => {
      setResult(null);
      setBets([]);
      setPayoutsData([]);
  };

  return (
    <div className="flex-1 flex flex-col p-4 lg:p-8 gap-8 overflow-y-auto overflow-x-hidden bg-[#0a080d]">
      
      {/* --- HEADER BANNER: Rias Gremory (Compact Full View with Decor) --- */}
      <div className="w-full h-[250px] lg:h-[450px] shrink-0 rounded-[40px] border border-red-900/30 relative overflow-hidden group shadow-2xl bg-black flex items-center justify-center">
        {/* Ambient Blurred Background */}
        <img 
          src="https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/images/rias_roulette_ingame.jpg" 
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-20 scale-110 transition-transform duration-[5000ms] group-hover:scale-125" 
        />

        {/* --- DECORATIVE LAYERS --- */}
        {/* Faint Background Motif */}
        <div className="absolute inset-0 z-0 opacity-10 pointer-events-none select-none overflow-hidden">
           <div className="absolute top-10 left-10 text-[120px] font-black text-red-500/20 italic tracking-tighter mix-blend-overlay">RIAS</div>
           <div className="absolute bottom-10 right-10 text-[120px] font-black text-red-500/20 italic tracking-tighter mix-blend-overlay">GREMORY</div>
        </div>

        {/* Floating Decorative Elements */}
        <div className="absolute inset-0 z-5 pointer-events-none overflow-hidden">
           {/* Floating "Stars" / Sparkles */}
           {[...Array(6)].map((_, i) => (
             <motion.div
               key={`star-${i}`}
               initial={{ opacity: 0.1, scale: 0.5 }}
               animate={{ 
                 opacity: [0.1, 0.4, 0.1], 
                 scale: [0.5, 1.2, 0.5],
                 y: [0, -20, 0]
               }}
               transition={{ 
                 duration: 4 + i, 
                 repeat: Infinity, 
                 delay: i * 0.5,
                 ease: "easeInOut" 
               }}
               className="absolute"
               style={{ 
                 top: `${15 + (i * 15)}%`, 
                 left: i % 2 === 0 ? `${5 + (i * 2)}%` : `${85 + (i * 2)}%` 
               }}
             >
               <CircleDot className="text-[#facc15]/40" size={12 + i} />
             </motion.div>
           ))}

           {/* Luxury Floating Chips (Decorative) */}
           <motion.div 
             animate={{ y: [0, -15, 0], rotate: [0, 5, 0] }}
             transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
             className="absolute left-[8%] top-[20%] w-20 h-20 rounded-full border-4 border-dashed border-[#facc15]/10 flex items-center justify-center p-2 lg:block hidden"
           >
              <div className="w-full h-full rounded-full border border-[#facc15]/20 bg-gradient-to-br from-red-600/10 to-transparent flex items-center justify-center">
                 <span className="font-headline font-black text-[8px] text-[#facc15]/20 uppercase tracking-widest leading-none text-center">Premium<br/>Stakes</span>
              </div>
           </motion.div>

           <motion.div 
             animate={{ y: [0, 15, 0], rotate: [0, -5, 0] }}
             transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
             className="absolute right-[8%] bottom-[20%] w-24 h-24 rounded-full border-4 border-dashed border-red-500/10 flex items-center justify-center p-2 lg:block hidden"
           >
              <div className="w-full h-full rounded-full border border-red-500/20 bg-gradient-to-br from-[#facc15]/10 to-transparent flex items-center justify-center">
                 <span className="font-lobster font-black text-sm text-red-500/20 uppercase tracking-widest">VIP</span>
              </div>
           </motion.div>
        </div>
        
        {/* Full Character Image */}
        <img 
          src="https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/images/rias_roulette_ingame.jpg" 
          alt="Rias Gremory Full Art" 
          fetchPriority="high"
          decoding="sync"
          referrerPolicy="no-referrer"
          className="relative z-10 w-full h-full object-contain p-4 drop-shadow-[0_0_40px_rgba(255,0,0,0.4)] transition-transform duration-[3000ms] group-hover:scale-[1.01]" 
        />
        
        {/* Decorative Light Shading */}
        <div className="absolute inset-0 z-20 bg-gradient-to-t from-black/40 via-transparent to-black/10 pointer-events-none" />
        
        {/* Corner Branding (Faint) */}
        <div className="absolute bottom-6 right-10 z-20 hidden lg:block opacity-30">
           <div className="text-right flex flex-col items-end">
              <span className="text-[8px] font-black uppercase tracking-[0.5em] text-[#facc15] mb-1">Authenticated Guest</span>
              <div className="h-px w-20 bg-gradient-to-r from-transparent to-[#facc15]/40" />
           </div>
        </div>
      </div>

      {/* --- GAMEPLAY AREA --- */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Wheel & History */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-gradient-to-br from-[#1c0000] to-[#0a0000] rounded-[40px] w-full aspect-square shadow-[0_40px_100px_rgba(255,0,0,0.15)] overflow-hidden border border-red-900/40 relative flex items-center justify-center">
            <CanvasRoulette isSpinning={isSpinning} onResult={handleResult} spinTrigger={spinTrigger} />
          </div>

          {/* History Feed */}
          <div className="bg-[#0f0000] rounded-[32px] p-6 border border-red-900/30 shadow-xl overflow-hidden h-20 flex items-center gap-6">
             <span className="font-headline text-white/20 text-[9px] font-black uppercase tracking-[0.4em] pl-2 border-r border-red-900/20 pr-6 shrink-0">Recent</span>
             <div className="flex gap-3 overflow-x-auto no-scrollbar">
                {history.map((n, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, x: -20 }}
                    animate={{ scale: 1, x: 0 }}
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-headline font-black text-lg shrink-0 border-2 shadow-lg",
                      n.type === 'red' ? "bg-red-900/40 text-white border-red-500/50" : "",
                      n.type === 'black' ? "bg-black text-white border-white/10" : "",
                      n.type === 'zero' ? "bg-yellow-900/20 text-[#facc15] border-[#facc15]/30" : ""
                    )}
                  >
                    {n.val}
                  </motion.div>
                ))}
             </div>
          </div>
        </div>

        {/* Right Column: Betting Board & Actions */}
        <div className="lg:col-span-7 flex flex-col gap-6 lg:gap-8">
          
          {/* Betting Board Card */}
          <div className="bg-[#0f0000] w-full rounded-[40px] p-6 lg:p-8 border border-red-900/30 shadow-2xl relative overflow-hidden min-h-[450px]">
            <BettingBoard 
                bets={bets} 
                players={players}
                activePlayerId={activePlayerId} 
                chipValue={selectedChip} 
                onPlaceBet={handlePlaceBet}
                disabled={isSpinning || result !== null}
            />
            
            <AnimatePresence>
              {result !== null && (
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }} 
                  exit={{ scale: 0.8, opacity: 0 }}
                  className="absolute inset-4 bg-black/95 backdrop-blur-2xl border-4 border-secondary/20 rounded-[32px] p-8 text-center z-50 flex flex-col justify-center items-center shadow-2xl"
                >
                  <div className={cn("text-[120px] font-lobster font-black leading-none mb-4 drop-shadow-[0_0_30px_rgba(255,42,42,0.6)]", 
                    getNumberColor(result) === 'red' ? "text-red-500" : getNumberColor(result) === 'zero' ? "text-[#facc15]" : "text-white"
                  )}>{result}</div>
                  <div className="w-full max-w-sm space-y-2">
                      {players.map(p => {
                          const gains = payoutsData.find(r => r.playerId === p.id);
                          if (!gains || gains.winnings === 0) return null;
                          return (
                              <div key={p.id} className="flex justify-between items-center bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                                  <span className="font-bold text-white text-sm">{p.name} Won!</span>
                                  <span className="text-[#facc15] font-black text-xl">+${gains.winnings}</span>
                              </div>
                          )
                      })}
                  </div>
                  <button onClick={dismissResult} className="mt-8 text-white/30 text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors">Dismiss Table</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Controls Hook */}
          <div className="bg-[#120000] rounded-[40px] p-8 border border-red-900/30 shadow-xl">
             <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
                {/* Chip Selection */}
                <div className="flex items-center gap-3">
                  {CHIPS.map(c => (
                    <button 
                      key={c} 
                      onClick={() => setSelectedChip(c)} 
                      className={cn(
                        "w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center font-headline font-black transition-all text-xs lg:text-base border-2", 
                        selectedChip === c 
                          ? "bg-[#facc15] text-black border-[#facc15] shadow-[0_0_20px_rgba(250,204,21,0.5)] scale-110" 
                          : "bg-white/5 text-white/30 border-white/10 hover:bg-white/10"
                      )}
                    >
                      {c}
                    </button>
                  ))}
                  <button 
                    onClick={() => setSelectedChip(activePlayer.balance)} 
                    className={cn(
                      "w-12 h-12 lg:w-14 lg:h-14 rounded-full flex items-center justify-center font-headline font-black transition-all text-xs lg:text-base border-2", 
                      selectedChip === activePlayer.balance 
                        ? "bg-red-600 text-white border-red-500 shadow-[0_0_20px_rgba(255,0,0,0.5)] scale-110" 
                        : "bg-white/5 text-white/30 border-white/10 hover:bg-white/10"
                    )}
                  >
                    MAX
                  </button>
                </div>

                {/* Main Action Buttons */}
                <div className="flex items-center gap-4 w-full lg:w-auto">
                    <button 
                      onClick={clearBets} 
                      className="bg-white/5 hover:bg-white/10 text-white/40 p-5 rounded-2xl border border-white/10"
                      disabled={isSpinning || bets.length === 0}
                    >
                      <RotateCcw size={20} />
                    </button>
                    <button 
                      onClick={startSpin}
                      disabled={isSpinning || bets.length === 0 || result !== null}
                      className={cn(
                        "flex-1 lg:flex-none lg:w-56 h-16 rounded-2xl font-lobster text-2xl font-black text-white transition-all shadow-xl flex items-center justify-center gap-3 border-b-4",
                        (isSpinning || bets.length === 0 || result !== null) 
                          ? "bg-white/5 border-white/10 opacity-30 cursor-not-allowed" 
                          : "bg-gradient-to-r from-red-600 to-red-800 border-red-900 hover:scale-[1.02] active:scale-95 shadow-red-900/40"
                      )}
                    >
                      {isSpinning ? <RotateCcw size={24} className="animate-spin" /> : <Play size={24} fill="currentColor" />}
                      <span>{isSpinning ? 'SPINNING' : 'SPIN'}</span>
                    </button>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
