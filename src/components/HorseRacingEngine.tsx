import { useState, useRef, useCallback, useEffect } from 'react';
import { Application, useTick, extend } from '@pixi/react';
import * as PIXI from 'pixi.js';
import '@pixi/gif';

// Setup @pixi/react extension for v8
extend({
  Container: PIXI.Container,
  Graphics: PIXI.Graphics,
  Text: PIXI.Text
});

export interface Horse {
  id: number;
  name: string;
  color: number;
  position: number;
  speed: number;
  acceleration: number;
  finishTime: number | null;
  laneIdx: number;
  variation: number;
  burstCooldown: number;
}

export interface HorseRacingEngineProps {
  onRaceFinish: (winnerId: number) => void;
  onRaceUpdate?: (horses: Horse[], progress: number) => void;
  isRacing: boolean;
  horsesCount?: number;
  width: number;
  height: number;
  horseImageUrl?: string;
}

// --- TRACK CONSTANTS & MATH ---
const L = 6000;
const R = 800;
const LANE_WIDTH = 55;
const ASSETS = {
  DIRT: "https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/horse_race/textures/dirt_diff_1k.jpg",
  HORSE: "https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/gif/horse_gif_loop.gif"
};

const TRACK_BASES = {
    STRAIGHT_1_END: L,
    CURVE_1_END: L + Math.PI * R,
    STRAIGHT_2_END: 2 * L + Math.PI * R,
    CURVE_2_END: 2 * L + 2 * Math.PI * R
};

// Finish line is strategically placed near the end of the top straight
const RACE_DISTANCE = TRACK_BASES.STRAIGHT_2_END - 1000;

function getTrackTransform(dist: number, laneIdx: number) {
    // Loop the track infinitely just in case they run past finish line
    const d = dist % TRACK_BASES.CURVE_2_END;
    const r = R + laneIdx * LANE_WIDTH + LANE_WIDTH / 2;
    let x = 0, y = 0, angle = 0;

    if (d < TRACK_BASES.STRAIGHT_1_END) {
        x = -L/2 + d;
        y = r;
        angle = 0; // facing right
    } else if (d < TRACK_BASES.CURVE_1_END) {
        const dc = d - TRACK_BASES.STRAIGHT_1_END;
        const fc = dc / (Math.PI * R);
        const theta = Math.PI/2 - Math.PI * fc;
        x = L/2 + r * Math.cos(theta);
        y = r * Math.sin(theta);
        angle = -Math.PI * fc; // curves downward/right
    } else if (d < TRACK_BASES.STRAIGHT_2_END) {
        const ds = d - TRACK_BASES.CURVE_1_END;
        x = L/2 - ds;
        y = -r;
        angle = -Math.PI; // facing left
    } else {
        const dc = d - TRACK_BASES.STRAIGHT_2_END;
        const fc = dc / (Math.PI * R);
        const theta = -Math.PI/2 - Math.PI * fc;
        x = -L/2 + r * Math.cos(theta);
        y = r * Math.sin(theta);
        angle = -Math.PI - Math.PI * fc; // curves upward/left
    }

    return { x, y, angle };
}

const RaceTrack = ({ lanes }: { lanes: number }) => {
  const drawTrack = useCallback((g: PIXI.Graphics) => {
    g.clear();
    
    const dirtTexture = PIXI.Assets.get(ASSETS.DIRT);
    const envW = 2 * L + 12000;
    const envH = 2 * R + 12000;
    
    // 1. Background (Greenery)
    g.rect(-L - 6000, -R - 6000, envW, envH).fill({ color: 0x1f3a15 });
    
    // 2. Inner Field (Center grass)
    g.roundRect(-L/2 - (R - 50), -R + 50, L + 2 * (R - 50), 2 * R - 100, R - 50).fill({ color: 0x2e4f22 });
    
    // 3. Track Surface (Using thick stroke for reliability with texture)
    const totalTrackWidth = lanes * LANE_WIDTH;
    const strokeR = R + totalTrackWidth / 2;
    const strokeW = totalTrackWidth + 40;

    const rectX = -L/2 - strokeR;
    const rectY = -strokeR;
    const rectW = L + 2 * strokeR;
    const rectH = 2 * strokeR;
    
    // Check if texture loaded and create styling
    if (dirtTexture) {
        g.roundRect(rectX, rectY, rectW, rectH, strokeR).stroke({ width: strokeW, texture: dirtTexture, color: 0x6d5b4f });
    } else {
        g.roundRect(rectX, rectY, rectW, rectH, strokeR).stroke({ width: strokeW, color: 0x3d2b1f });
    }

    // 4. Lane Dividers
    for (let i = 0; i <= lanes; i++) {
        const laneR = R + i * LANE_WIDTH;
        g.roundRect(-L/2 - laneR, -laneR, L + 2 * laneR, 2 * laneR, laneR).stroke({ width: 3, color: 0x776655, alpha: 0.4 });
    }

    // 5. Grandstands / Public Crowd
    // Base structure of the stadium complex
    g.roundRect(-L/2.5 - 200, -R - totalTrackWidth - 2800, L/1.25 + 400, 2400, 100).fill({ color: 0x222222 });
    
    for (let t = 0; t < 5; t++) {
        const tierWidth = L/1.25;
        const tierHeight = 250;
        const tierY = -R - totalTrackWidth - 2500 + t * tierHeight;
        g.rect(-L/2.5, tierY, tierWidth, tierHeight - 10).fill({ color: t % 2 === 0 ? 0x2a2a2a : 0x333333 });
        
        // Add random crowd members
        for (let j = 0; j < 300; j++) {
             const px = -L/2.5 + Math.random() * tierWidth;
             const py = tierY + Math.random() * (tierHeight - 20);
             const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff, 0xffffff];
             const color = colors[Math.floor(Math.random() * colors.length)];
             g.circle(px, py, 12).fill({ color });
        }
    }

    // Infield Screen / Advertising Board
    g.rect(-600, -R + 300, 1200, 150).fill({ color: 0x111111 });
    g.rect(-580, -R + 310, 1160, 130).fill({ color: 0x0a0c10 });
    // Text can't be easily drawn on pure graphics unless we use PIXI.Text, we'll draw "RIAS RESORT" using small rects as a placeholder or use PIXI.Text in the main component.
    g.rect(-580, -R + 310, 300, 130).fill({ color: 0xffaa00, alpha: 0.2 }); // Logo simulation
    
    // Coaches & Staff in the infield (Inner Fence)
    for (let c = 0; c < 30; c++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = R - 150 + Math.random() * 50;
        const isCurve1 = angle < Math.PI / 2 || angle > Math.PI * 1.5;
        let cx = 0, cy = 0;
        
        if (angle < Math.PI / 2) {
             cx = L/2 + Math.cos(angle) * dist;
             cy = Math.sin(angle) * dist;
        } else if (angle < Math.PI) {
             cx = Math.cos(angle) * dist;
             cy = Math.sin(angle) * dist;
        } else if (angle < Math.PI * 1.5) {
             cx = -L/2 + Math.cos(angle) * dist;
             cy = Math.sin(angle) * dist;
        } else {
             cx = Math.cos(angle) * dist;
             cy = Math.sin(angle) * dist;
        }
        
        const staffColor = Math.random() > 0.5 ? 0xffddaa : 0xaaddff;
        g.circle(cx, cy, 18).fill({ color: staffColor });
    }

    // 6. Start Line structure
    g.moveTo(-L/2, R - 50).lineTo(-L/2, R + totalTrackWidth + 50).stroke({ width: 40, color: 0xdddddd, alpha: 0.9 });
    
    // 7. Finish Line Checkered Pattern
    const finishX = -L/2 + 1000;
    const finishYStart = -(R + totalTrackWidth + 50);
    const finishYEnd = -R + 50;
    
    // Draw finish banner above the track
    g.rect(finishX - 80, finishYStart - 100, 160, Math.abs(finishYEnd - finishYStart) + 200).fill({ color: 0xffffff, alpha: 0.1 });
    g.circle(finishX, finishYStart - 50, 40).fill({ color: 0xff0000 }); // Finish pole
    g.circle(finishX, finishYEnd + 50, 40).fill({ color: 0xff0000 }); // Finish pole
    
    for (let c = 0; c < 2; c++) {
        const cx = finishX - 20 + c * 20;
        let toggle = c % 2;
        for (let cy = finishYStart; cy < finishYEnd; cy += 20) {
            if (cy > -R - totalTrackWidth && cy < -R) {
               g.rect(cx, cy, 20, 20).fill({ color: toggle ? 0x000000 : 0xffffff, alpha: 0.9 });
            }
            toggle = 1 - toggle;
        }
    }
  }, [lanes]);

  return <pixiGraphics draw={drawTrack} />;
};

const AnimatedHorse = ({ horse, horseImageUrl, cameraRotation }: { horse: Horse, horseImageUrl?: string, cameraRotation: number }) => {
  const containerRef = useRef<PIXI.Container>(null);

  useTick(() => {
    if (!containerRef.current) return;
    
    // To keep horse straight while track rotates, override total rotation
    // Camera rotation + Horse rotation = 0 -> Horse rotation = -cameraRotation
    containerRef.current.rotation = -cameraRotation;
  });

  const horseDraw = useCallback((g: PIXI.Graphics) => {
    g.clear();
    // Body
    g.ellipse(0, 0, 15, 9).fill({ color: horse.color });
    // Head
    g.ellipse(12, -8, 6, 5).fill({ color: horse.color });
    // Neck
    g.rect(8, -6, 4, 8).fill({ color: horse.color });
    // Legs
    g.moveTo(-8, 6).lineTo(-9, 15);
    g.moveTo(8, 6).lineTo(9, 15);
    g.stroke({ width: 1.5, color: 0x000000, alpha: 0.5 });
    // Saddle
    g.rect(-4, -4, 8, 8).fill({ color: 0xffffff });
  }, [horse.color]);

  const transform = getTrackTransform(horse.position, horse.laneIdx);

  return (
    <pixiContainer ref={containerRef} x={transform.x} y={transform.y}>
      {/* Background shadow */}
      <pixiGraphics 
        draw={(g) => {
            g.clear();
            g.ellipse(0, 10, 20, 8).fill({ color: 0x000000, alpha: 0.2 }); 
        }} 
      />

      {horseImageUrl && PIXI.Assets.cache.has(horseImageUrl) ? (
         <HorseGifInstance url={horseImageUrl} />
      ) : (
         <pixiGraphics draw={horseDraw} />
      )}
      
      {/* Number label */}
      <pixiText 
        {...({
            text: (horse.id + 1).toString(),
            style: new PIXI.TextStyle({ 
                fontSize: 14, 
                fill: 0xffffff, 
                fontWeight: 'bold',
                stroke: { color: 0x000000, width: 3 }
            }),
            anchor: 0.5,
            x: 0,
            y: -25
        } as any)}
      />
    </pixiContainer>
  );
};

const HorseGifInstance = ({ url }: { url: string }) => {
    const containerRef = useRef<PIXI.Container>(null);
    useEffect(() => {
        const container = containerRef.current;
        if (!container || !PIXI.Assets.cache.has(url)) return;

        const baseGif = PIXI.Assets.get(url);
        if (!baseGif || (baseGif.width === 0 && baseGif.height === 0)) return;

        const horseGif = baseGif.clone();
        
        horseGif.anchor.set(0.5);
        horseGif.scale.set(0.4);
        
        container.addChild(horseGif);
        horseGif.play();

        return () => {
            if (container) container.removeChild(horseGif);
            horseGif.destroy({ children: true, texture: false, baseTexture: false });
        };
    }, [url]);

    return <pixiContainer ref={containerRef} />;
};

const StartingGates = ({ lanes, isRacing }: { lanes: number, isRacing: boolean }) => {
    const drawGates = useCallback((g: PIXI.Graphics) => {
        g.clear();
        const startX = -L/2;
        const startY = R;
        const startYEnd = R + lanes * LANE_WIDTH;

        // Start Banner structure
        g.rect(startX - 60, startY - 80, 120, Math.abs(startYEnd - startY) + 160).fill({ color: 0x222222, alpha: 0.8 });
        
        // Draw individual gates
        for (let i = 0; i < lanes; i++) {
             const cy = startY + i * LANE_WIDTH;
             
             // Back wall of gate
             g.rect(startX - 40, cy, 30, LANE_WIDTH).fill({ color: 0x444444 });
             
             if (isRacing) {
                 // Open gates - doors swing to side
                 g.rect(startX + 20, cy + 5, 50, LANE_WIDTH - 10).fill({ color: 0xaaaaaa, alpha: 0.3 });
             } else {
                 // Closed front doors
                 g.rect(startX + 20, cy + 2, 8, LANE_WIDTH - 4).fill({ color: 0xc0c0c0 });
                 g.rect(startX + 28, cy + 2, 4, LANE_WIDTH - 4).fill({ color: 0xff4444 }); 
             }
        }
    }, [lanes, isRacing]);

    // Draw the banner text separately to ensure it is nicely rendered
    return (
        <pixiContainer>
            <pixiGraphics draw={drawGates} />
            <pixiText 
                {...({
                    text: "START",
                    x: -L/2,
                    y: R - 150,
                    anchor: 0.5,
                    rotation: -Math.PI / 2,
                    style: new PIXI.TextStyle({ 
                        fontSize: 80, 
                        fill: 0xffffff, 
                        fontWeight: 'bold',
                        letterSpacing: 20
                    })
                } as any)}
            />
        </pixiContainer>
    );
};

const RaceController = ({ update }: { update: (ticker: PIXI.Ticker) => void }) => {
  useTick(update);
  return null;
};

export const HorseRacingEngine = ({ onRaceFinish, onRaceUpdate, isRacing, horsesCount = 6, width, height, horseImageUrl }: HorseRacingEngineProps) => {
  const [horses, setHorses] = useState<Horse[]>([]);
  
  // Pivot holds where the camera points IN WORLD SPACE
  // Rotation holds camera tracking angle
  const [cameraState, setCameraState] = useState({ pivotX: -L/2, pivotY: R + 100, rotation: 0 });
  const [isAssetsLoaded, setIsAssetsLoaded] = useState(false);
  const finishedRef = useRef(false);
  const onRaceFinishRef = useRef(onRaceFinish);
  const onRaceUpdateRef = useRef(onRaceUpdate);
  const updateThrottleRef = useRef(0);
  
  // High-performance simulation refs to avoid React state update "in render" issues
  const horsesSimRef = useRef<Horse[]>([]);
  const cameraSimRef = useRef({ pivotX: -L/2, pivotY: R + 100, rotation: 0 });
  const shakeRef = useRef<number>(0);
  const dirtParticlesRef = useRef<{x: number, y: number, vx: number, vy: number, life: number, maxLife: number, size: number}[]>([]);
  const dirtGraphicsRef = useRef<PIXI.Graphics>(null);

  useEffect(() => {
    onRaceFinishRef.current = onRaceFinish;
    onRaceUpdateRef.current = onRaceUpdate;
  }, [onRaceFinish, onRaceUpdate]);

  useEffect(() => {
    const assetsToLoad = [ASSETS.DIRT, ASSETS.HORSE];
    
    PIXI.Assets.load(assetsToLoad).then(() => {
        setIsAssetsLoaded(true);
    }).catch(err => {
        console.error("Failed to load textures:", err);
        setIsAssetsLoaded(true); 
    });
  }, []);

  useEffect(() => {
    const initialHorses: Horse[] = Array.from({ length: horsesCount }).map((_, i) => ({
      id: i,
      name: `Horse ${i + 1}`,
      color: PIXI.Color.shared.setValue([
        0xff5555, 0x55ff55, 0x5555ff, 0xffff55, 0xff55ff, 0x55ffff, 0xffa500, 0x808080
      ][i % 8]).toNumber(),
      position: 0,
      speed: 0,
      acceleration: 0,
      finishTime: null,
      laneIdx: i,
      variation: Math.random() * Math.PI * 2,
      burstCooldown: Math.random() * 200
    }));
    setHorses(initialHorses);
    horsesSimRef.current = initialHorses;
    
    // Position camera accurately at the start line
    const startTrans = getTrackTransform(0, (horsesCount - 1) / 2);
    const initialCam = { pivotX: startTrans.x, pivotY: startTrans.y, rotation: -startTrans.angle };
    setCameraState(initialCam);
    cameraSimRef.current = initialCam;
    
    finishedRef.current = false;
  }, [horsesCount]);

  useEffect(() => {
    if (!isRacing && finishedRef.current) {
        const resetHorses = horsesSimRef.current.map(h => ({ ...h, position: 0, speed: 0, finishTime: null }));
        setHorses(resetHorses);
        horsesSimRef.current = resetHorses;
        
        const startTrans = getTrackTransform(0, (horsesCount - 1) / 2);
        const resetCam = { pivotX: startTrans.x, pivotY: startTrans.y, rotation: -startTrans.angle };
        setCameraState(resetCam);
        cameraSimRef.current = resetCam;
        
        finishedRef.current = false;
    }
  }, [isRacing, horsesCount]);

  const updateHorses = useCallback((ticker: PIXI.Ticker) => {
    if (!isRacing || finishedRef.current) return;
    const delta = ticker.deltaTime;
    const time = Date.now() * 0.001;

    // Use sim ref instead of state to avoid "update during render"
    const prev = horsesSimRef.current;
    if (prev.length === 0) return;

    const leaderPos = Math.max(...prev.map(h => h.position));
    let nextLeaderPos = 0;
    
    const next = prev.map(h => {
      if (h.finishTime) {
          if (h.position > nextLeaderPos) nextLeaderPos = h.position;
          return h;
      }

      const baseTargetSpeed = 16.0; 
      let variance = Math.sin(time * 0.8 + h.variation) * 3.0;
      const randomness = (Math.random() - 0.5) * 1.5;
      
      let acceleration = 0.1;
      if (h.position < RACE_DISTANCE * 0.3) {
          acceleration = 0.15;
      } else if (h.position > RACE_DISTANCE * 0.8) {
          acceleration = 0.2;
          variance += 2.0; 
      }

      // Rubber banding comeback logic
      const distanceToLeader = leaderPos - h.position;
      const rubberBandEffect = Math.min(2.5, distanceToLeader / 500); 

      let targetSpeed = baseTargetSpeed + variance + randomness + rubberBandEffect;
      let newBurstCooldown = h.burstCooldown;
      
      if (newBurstCooldown > 0) {
          newBurstCooldown -= delta;
      } else {
          const event = Math.random();
          const isBehind = distanceToLeader > 200;
          const isLeading = h.position >= leaderPos && leaderPos > 500;

          const burstChance = isBehind ? 0.15 : 0.08;
          const breakdownChance = isLeading ? 0.12 : 0.05;

          if (event < burstChance) {
              newBurstCooldown = 120 + Math.random() * 180;
              targetSpeed += 5.0; 
              shakeRef.current = 20; // Trigger camera shake
          } else if (event < burstChance + breakdownChance) {
              newBurstCooldown = 150 + Math.random() * 150;
              targetSpeed -= 4.0; 
          }
      }

      let newSpeed = h.speed + (targetSpeed - h.speed) * (acceleration * 0.12);
      const newPos = h.position + newSpeed * delta;
      
      // --- Emit Dirt Particles ---
      if (newSpeed > 5 && Math.random() > 0.4) {
           const transform = getTrackTransform(newPos - 40, h.laneIdx);
           const baseAngle = transform.angle + Math.PI; // point backwards
           dirtParticlesRef.current.push({
               x: transform.x,
               y: transform.y,
               vx: Math.cos(baseAngle) * (newSpeed * 0.15) + (Math.random()-0.5)*3,
               vy: Math.sin(baseAngle) * (newSpeed * 0.15) + (Math.random()-0.5)*3,
               life: 0,
               maxLife: 15 + Math.random() * 15,
               size: 5 + Math.random() * 8
           });
      }

      if (newPos > nextLeaderPos) nextLeaderPos = newPos;

      let finishTime = h.finishTime;
      if (newPos >= RACE_DISTANCE && !finishTime) {
          finishTime = Date.now();
          shakeRef.current = 15; // Shake when crossing finish
      }

      return {
        ...h,
        position: newPos,
        speed: newSpeed,
        finishTime,
        burstCooldown: newBurstCooldown
      };
    });

    // Update sim ref
    horsesSimRef.current = next;

    // Camera Tracking System with Shake
    const leaderTransform = getTrackTransform(nextLeaderPos, (horsesCount - 1) / 2);
    const prevCam = cameraSimRef.current;
    
    let curShakeX = 0;
    let curShakeY = 0;
    if (shakeRef.current > 0) {
        curShakeX = (Math.random() - 0.5) * shakeRef.current;
        curShakeY = (Math.random() - 0.5) * shakeRef.current;
        shakeRef.current -= delta * 0.8;
        if (shakeRef.current < 0) shakeRef.current = 0;
    }
    
    const amt = 0.08; 
    let rotDiff = -leaderTransform.angle - prevCam.rotation;
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    
    const nextCam = {
        pivotX: prevCam.pivotX + (leaderTransform.x - prevCam.pivotX) * amt + curShakeX,
        pivotY: prevCam.pivotY + (leaderTransform.y - prevCam.pivotY) * amt + curShakeY,
        rotation: prevCam.rotation + rotDiff * amt
    };
    cameraSimRef.current = nextCam;

    // Update States for rendering - separately and safely outside reducer
    setHorses(next);
    setCameraState(nextCam);

    // Update & Draw Dirt Particles
    const dg = dirtGraphicsRef.current;
    const particles = dirtParticlesRef.current;
    if (dg) {
        dg.clear();
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * delta;
            p.y += p.vy * delta;
            p.life += delta;
            
            if (p.life >= p.maxLife) {
                particles.splice(i, 1);
            } else {
                const alpha = 1 - (p.life / p.maxLife);
                dg.circle(p.x, p.y, p.size).fill({ color: 0x6d5b4f, alpha: alpha * 0.8 });
            }
        }
    }
    
    // Dispatch live data to parent React UI using a throttle
    updateThrottleRef.current += ticker.deltaMS;
    if (updateThrottleRef.current > 100) {
        updateThrottleRef.current = 0;
        if (onRaceUpdateRef.current) {
             const progressPercent = Math.min(100, Math.max(0, (nextLeaderPos / RACE_DISTANCE) * 100));
             onRaceUpdateRef.current([...next], progressPercent);
        }
    }

    const finishedHorses = next.filter(h => h.finishTime !== null);
    if (finishedHorses.length === next.length && !finishedRef.current) {
      finishedRef.current = true;
      const sorted = [...next].sort((a, b) => (a.finishTime || Infinity) - (b.finishTime || Infinity));
      const winnerId = sorted[0].id;
      
      // Use timeout to defer parent notification and avoid "update during render" warning
      setTimeout(() => {
          onRaceFinishRef.current(winnerId);
      }, 0);
    }
  }, [isRacing, onRaceFinish, horsesCount]);

  return (
    <Application 
        width={width} 
        height={height} 
        background={0x1f3a15}
        antialias={true}
        autoDensity={true}
        resolution={window.devicePixelRatio || 1}
    >
      <RaceController update={updateHorses} />
      <pixiContainer 
        x={width * 0.3} 
        y={height / 2}  
        pivot={{ x: cameraState.pivotX, y: cameraState.pivotY }} 
        rotation={cameraState.rotation}
      >
        <RaceTrack lanes={horsesCount} />
        <StartingGates lanes={horsesCount} isRacing={isRacing || finishedRef.current} />
        
        {/* Dirt Particles layer (below horses) */}
        <pixiGraphics ref={dirtGraphicsRef} draw={() => {}} />
        
        <pixiText 
            {...({
                text: "FINISH",
                x: -L/2 + 1000,
                y: -(R + (horsesCount * LANE_WIDTH) / 2),
                anchor: 0.5,
                rotation: Math.PI / 2,
                style: new PIXI.TextStyle({ 
                    fontSize: 100, 
                    fill: 0xffaaaa, 
                    fontWeight: '900',
                    letterSpacing: 25,
                    stroke: { color: 0x000000, width: 8 }
                })
            } as any)}
        />

        {isAssetsLoaded && horses.map((h, i) => (
          <AnimatedHorse 
            key={h.id} 
            horse={h} 
            horseImageUrl={ASSETS.HORSE} 
            cameraRotation={cameraState.rotation}
          />
        ))}
      </pixiContainer>
    </Application>
  );
};
