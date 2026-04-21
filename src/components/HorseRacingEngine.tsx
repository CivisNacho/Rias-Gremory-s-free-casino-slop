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

    // 5. Grandstands / Details
    g.rect(-L/3, -R - totalTrackWidth - 1000, 2*L/3, 800).fill({ color: 0x111111, alpha: 0.9 });
    
    // 6. Start Line
    g.moveTo(-L/2, R).lineTo(-L/2, R + totalTrackWidth).stroke({ width: 30, color: 0xffffff, alpha: 0.8 });

    // 7. Finish Line - Span all lanes correctly
    const finishTransIn = getTrackTransform(RACE_DISTANCE, 0);
    const finishTransOut = getTrackTransform(RACE_DISTANCE, lanes - 1);
    
    // The line should span from the inner edge of lane 1 to the outer edge of the last lane
    g.moveTo(finishTransIn.x, finishTransIn.y - LANE_WIDTH / 2)
     .lineTo(finishTransOut.x, finishTransOut.y + LANE_WIDTH / 2)
     .stroke({ width: 60, color: 0xffffff, alpha: 1.0 });
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

const RaceController = ({ update }: { update: (ticker: PIXI.Ticker) => void }) => {
  useTick(update);
  return null;
};

export const HorseRacingEngine = ({ onRaceFinish, isRacing, horsesCount = 6, width, height, horseImageUrl }: HorseRacingEngineProps) => {
  const [horses, setHorses] = useState<Horse[]>([]);
  
  // Pivot holds where the camera points IN WORLD SPACE
  // Rotation holds camera tracking angle
  const [cameraState, setCameraState] = useState({ pivotX: -L/2, pivotY: R + 100, rotation: 0 });
  const [isAssetsLoaded, setIsAssetsLoaded] = useState(false);
  const finishedRef = useRef(false);
  const onRaceFinishRef = useRef(onRaceFinish);

  useEffect(() => {
    onRaceFinishRef.current = onRaceFinish;
  }, [onRaceFinish]);

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
    
    // Position camera accurately at the start line
    const startTrans = getTrackTransform(0, (horsesCount - 1) / 2);
    setCameraState({ pivotX: startTrans.x, pivotY: startTrans.y, rotation: -startTrans.angle });
    
    finishedRef.current = false;
  }, [horsesCount]);

  useEffect(() => {
    if (!isRacing && finishedRef.current) {
        setHorses(prev => prev.map(h => ({ ...h, position: 0, speed: 0, finishTime: null })));
        const startTrans = getTrackTransform(0, (horsesCount - 1) / 2);
        setCameraState({ pivotX: startTrans.x, pivotY: startTrans.y, rotation: -startTrans.angle });
        finishedRef.current = false;
    }
  }, [isRacing, horsesCount]);

  const updateHorses = useCallback((ticker: PIXI.Ticker) => {
    if (!isRacing || finishedRef.current) return;
    const delta = ticker.deltaTime;
    const time = Date.now() * 0.001;

    setHorses(prev => {
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
            } else if (event < burstChance + breakdownChance) {
                newBurstCooldown = 150 + Math.random() * 150;
                targetSpeed -= 4.0; 
            }
        }

        let newSpeed = h.speed + (targetSpeed - h.speed) * (acceleration * 0.12);
        const newPos = h.position + newSpeed * delta;
        
        if (newPos > nextLeaderPos) nextLeaderPos = newPos;

        let finishTime = h.finishTime;
        if (newPos >= RACE_DISTANCE && !finishTime) {
            finishTime = Date.now();
        }

        return {
          ...h,
          position: newPos,
          speed: newSpeed,
          finishTime,
          burstCooldown: newBurstCooldown
        };
      });

      // Camera Tracking System
      const leaderTransform = getTrackTransform(nextLeaderPos, (horsesCount - 1) / 2);
      
      setCameraState(prev => {
          const amt = 0.08; 
          let rotDiff = -leaderTransform.angle - prev.rotation;
          while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
          while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
          
          return {
              pivotX: prev.pivotX + (leaderTransform.x - prev.pivotX) * amt,
              pivotY: prev.pivotY + (leaderTransform.y - prev.pivotY) * amt,
              rotation: prev.rotation + rotDiff * amt
          };
      });

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

      return next;
    });
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
