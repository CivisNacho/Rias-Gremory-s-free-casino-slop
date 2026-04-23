import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Application, useTick, extend } from '@pixi/react';
import * as PIXI from 'pixi.js';
import '@pixi/gif';
import derbySkyStandsUrl from '../assets/horse-racing/derby-sky-stands.png';

extend({
  Container: PIXI.Container,
  Graphics: PIXI.Graphics,
  Text: PIXI.Text,
  Sprite: PIXI.Sprite
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
  startDelayMs: number;
  paceFactor: number;
}

export interface RaceUpdatePayload {
  horses: Horse[];
  leaderProgress: number;
  elapsedMs: number;
  standings: number[];
}

export interface HorseRacingEngineProps {
  onRaceFinish: (winnerId: number) => void;
  onRaceUpdate?: (payload: RaceUpdatePayload) => void;
  isRacing: boolean;
  horsesCount?: number;
  width: number;
  height: number;
  horseImageUrl?: string;
  horseStrengths?: number[];
}

const ASSETS = {
  HORSE: 'https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/gif/horse_gif_loop.gif',
  STANDS: derbySkyStandsUrl
};

const HORSE_NAMES = [
  'Pirate Sandy',
  'Calm Tara',
  "Owen's Raging",
  'Sneezing Window',
  "Jen's Binging",
  'Snoozing Book',
  "Eli's Sunny Table",
  'Calm Glass',
  'Pirate Sue',
  'Seizing Lion',
  'Dancing Umbrella',
  'Intelligent Maniac'
];

const HORSE_COLORS = [
  0xf8d568,
  0xb7e08c,
  0x9ac7ff,
  0xffc9a6,
  0xcab6ff,
  0x8fe5cf,
  0xf6a5d5,
  0xa7f0ff,
  0xffd98f,
  0xdeb8ff,
  0xbfe6a7,
  0xffffff
];

const WORLD = {
  raceDistance: 5400,
  topAreaRatio: 0.38,
  sidePadding: 110,
  topHudHeight: 84,
  bottomHudHeight: 118,
  fieldBottomGap: 18
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const formatRaceClock = (ms: number) => {
  const totalCentiseconds = Math.floor(ms / 10);
  const seconds = Math.floor(totalCentiseconds / 100);
  const centis = totalCentiseconds % 100;
  return `${seconds.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
};

const getLayout = (width: number, height: number, lanes: number) => {
  const topAreaHeight = Math.floor(height * WORLD.topAreaRatio);
  const fieldTop = topAreaHeight;
  const fieldBottom = height - WORLD.bottomHudHeight - WORLD.fieldBottomGap;
  const fieldHeight = Math.max(220, fieldBottom - fieldTop);
  const laneHeight = fieldHeight / lanes;
  const startX = WORLD.sidePadding;
  const finishX = width - WORLD.sidePadding;
  const trackWidth = finishX - startX;

  return { topAreaHeight, fieldTop, fieldBottom, fieldHeight, laneHeight, startX, finishX, trackWidth };
};

const positionToTrackX = (position: number, trackStartX: number, trackWidth: number) => {
  const normalized = clamp(position / WORLD.raceDistance, 0, 1);
  return trackStartX + normalized * trackWidth;
};

const StadiumBackdrop = ({ width, topAreaHeight, isAssetsLoaded }: { width: number; topAreaHeight: number; isAssetsLoaded: boolean }) => {
  const texture = PIXI.Assets.get(ASSETS.STANDS);

  if (!isAssetsLoaded || !texture) {
    return (
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.rect(0, 0, width, topAreaHeight).fill({ color: 0x63b9ff });
          g.rect(0, topAreaHeight - 70, width, 70).fill({ color: 0x6a8b63, alpha: 0.7 });
        }}
      />
    );
  }

  return <pixiSprite texture={texture} x={0} y={0} width={width} height={topAreaHeight} />;
};

const TrackLayer = ({ width, height, lanes }: { width: number; height: number; lanes: number }) => {
  const drawTrack = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();

      const layout = getLayout(width, height, lanes);
      const { fieldTop, fieldBottom, laneHeight, startX, finishX, trackWidth } = layout;

      g.rect(0, fieldTop, width, fieldBottom - fieldTop).fill({ color: 0x46cd17 });

      for (let i = 0; i < lanes; i++) {
        const y = fieldTop + i * laneHeight;
        g.rect(0, y, width, laneHeight).fill({ color: i % 2 === 0 ? 0x4ad71b : 0x41c817 });
      }

      g.rect(0, fieldBottom, width, height - fieldBottom).fill({ color: 0x2f6d30 });

      // Start lane corridor (very high contrast)
      g.rect(startX - 32, fieldTop, 64, fieldBottom - fieldTop).fill({ color: 0xffffff, alpha: 0.22 });
      g.moveTo(startX - 28, fieldTop).lineTo(startX - 28, fieldBottom).stroke({ color: 0xff2d2d, width: 4, alpha: 0.92 });
      g.moveTo(startX + 28, fieldTop).lineTo(startX + 28, fieldBottom).stroke({ color: 0xff2d2d, width: 4, alpha: 0.92 });
      g.moveTo(startX, fieldTop).lineTo(startX, fieldBottom).stroke({ color: 0xffffff, width: 4, alpha: 0.98 });

      // Starting box structure and per-lane stall fronts
      const gateDepth = Math.max(34, laneHeight * 0.68);
      const gateBackX = startX - gateDepth - 16;
      g.roundRect(gateBackX - 10, fieldTop - 10, gateDepth + 40, fieldBottom - fieldTop + 20, 8).fill({ color: 0x293030, alpha: 0.9 });
      for (let i = 0; i < lanes; i++) {
        const laneY = fieldTop + i * laneHeight;
        const stallH = laneHeight - 4;
        g.rect(gateBackX, laneY + 2, gateDepth, stallH).fill({ color: i % 2 === 0 ? 0x6f7d78 : 0x5f6c68, alpha: 0.95 });
        g.rect(startX - 10, laneY + 3, 8, stallH - 2).fill({ color: 0xf6f6f6, alpha: 0.96 });
        g.rect(startX - 2, laneY + 3, 2, stallH - 2).fill({ color: 0x181818, alpha: 0.92 });
      }

      g.roundRect(gateBackX - 16, fieldTop - 40, gateDepth + 56, 30, 5).fill({ color: 0x2f3430, alpha: 0.96 });
      g.roundRect(gateBackX - 12, fieldTop - 36, gateDepth + 48, 22, 4).fill({ color: 0xe0b84a, alpha: 0.98 });

      const checkSize = Math.max(8, Math.floor((fieldBottom - fieldTop) / 26));

      // Finish lane corridor markings (very high contrast)
      g.rect(finishX - 34, fieldTop, 68, fieldBottom - fieldTop).fill({ color: 0xfff6df, alpha: 0.2 });
      g.moveTo(finishX - 30, fieldTop).lineTo(finishX - 30, fieldBottom).stroke({ color: 0x111111, width: 4, alpha: 0.9 });
      g.moveTo(finishX + 30, fieldTop).lineTo(finishX + 30, fieldBottom).stroke({ color: 0x111111, width: 4, alpha: 0.9 });
      for (let y = fieldTop; y < fieldBottom; y += checkSize) {
        const row = Math.floor((y - fieldTop) / checkSize);
        g.rect(finishX - 6, y, checkSize, checkSize).fill({ color: row % 2 === 0 ? 0xffffff : 0x111111 });
        g.rect(finishX + 6, y, checkSize, checkSize).fill({ color: row % 2 === 0 ? 0x111111 : 0xffffff });
      }

      // Judge tower + judge figure near finish
      const towerX = finishX + 46;
      const towerBaseY = fieldTop - 10;
      g.roundRect(towerX, towerBaseY - 56, 44, 56, 4).fill({ color: 0xf0ede2, alpha: 0.95 });
      g.rect(towerX + 4, towerBaseY - 48, 36, 8).fill({ color: 0x8b2b1f, alpha: 0.95 });
      g.rect(towerX + 8, towerBaseY - 35, 28, 20).fill({ color: 0xcfd6d1, alpha: 0.92 });
      g.rect(towerX + 18, towerBaseY - 15, 8, 14).fill({ color: 0x46534d, alpha: 0.9 });

      const judgeX = towerX + 22;
      const judgeY = towerBaseY - 40;
      g.circle(judgeX, judgeY, 4).fill({ color: 0xf2d0b0, alpha: 0.98 });
      g.rect(judgeX - 3, judgeY + 4, 6, 10).fill({ color: 0x283944, alpha: 0.95 });
      g.rect(judgeX + 3, judgeY + 5, 9, 2).fill({ color: 0xfff7c9, alpha: 0.95 });

      // In-field label plates (so they don't disappear into the top background)
      g.roundRect(startX - 48, fieldTop + 8, 96, 22, 5).fill({ color: 0x2f3430, alpha: 0.96 });
      g.roundRect(finishX - 54, fieldTop + 8, 108, 22, 5).fill({ color: 0x2f3430, alpha: 0.96 });

      for (let i = 0; i < 80; i++) {
        const x = startX + (i / 79) * trackWidth;
        const y = fieldTop + ((i * 37) % 1000) / 1000 * (fieldBottom - fieldTop);
        g.circle(x, y, 1 + (i % 3)).fill({ color: 0x2f6d2a, alpha: 0.25 });
      }
    },
    [width, height, lanes]
  );

  return <pixiGraphics draw={drawTrack} />;
};

const CourseLabels = ({ width, height, lanes }: { width: number; height: number; lanes: number }) => {
  const { fieldTop, startX, finishX } = getLayout(width, height, lanes);
  const labelStyle = new PIXI.TextStyle({
    fontFamily: 'Courier New',
    fontSize: 11,
    fontWeight: '900',
    fill: 0xf8e7b8,
    stroke: { color: 0x101010, width: 2 }
  });

  return (
    <pixiContainer>
      <pixiText {...({ text: 'START', x: startX, y: fieldTop + 19, anchor: 0.5, style: labelStyle } as any)} />
      <pixiText {...({ text: 'FINISH', x: finishX, y: fieldTop + 19, anchor: 0.5, style: labelStyle } as any)} />
    </pixiContainer>
  );
};

const HorseGifInstance = ({ url, tint }: { url: string; tint: number }) => {
  const containerRef = useRef<PIXI.Container>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !PIXI.Assets.cache.has(url)) return;

    const baseGif = PIXI.Assets.get(url);
    if (!baseGif || (baseGif.width === 0 && baseGif.height === 0)) return;

    const horseGif = baseGif.clone();
    horseGif.anchor.set(0.5);
    horseGif.scale.set(0.2);
    horseGif.tint = tint;
    horseGif.animationSpeed = 0.95;

    container.addChild(horseGif);
    horseGif.play();

    return () => {
      if (container) container.removeChild(horseGif);
      horseGif.destroy({ children: true, texture: false, baseTexture: false });
    };
  }, [url, tint]);

  return <pixiContainer ref={containerRef} />;
};

const FallbackHorse = ({ color }: { color: number }) => {
  const drawHorse = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      g.ellipse(0, 0, 14, 8).fill({ color });
      g.ellipse(12, -6, 5, 4).fill({ color });
      g.rect(8, -5, 3, 7).fill({ color });
      g.moveTo(-6, 6).lineTo(-7, 13);
      g.moveTo(6, 6).lineTo(7, 13);
      g.stroke({ width: 2, color: 0x141414, alpha: 0.55 });
    },
    [color]
  );

  return <pixiGraphics draw={drawHorse} />;
};

const AnimatedHorse = ({
  horse,
  elapsedMs,
  horseImageUrl,
  x,
  y
}: {
  horse: Horse;
  elapsedMs: number;
  horseImageUrl?: string;
  x: number;
  y: number;
}) => {
  const speedBob = Math.sin(elapsedMs * 0.02 + horse.variation) * 1.2;

  return (
    <pixiContainer x={x} y={y + speedBob}>
      <pixiGraphics
        draw={(g) => {
          g.clear();
          g.ellipse(0, 12, 14, 5).fill({ color: 0x000000, alpha: 0.2 });
        }}
      />

      {horseImageUrl && PIXI.Assets.cache.has(horseImageUrl) ? <HorseGifInstance url={horseImageUrl} tint={horse.color} /> : <FallbackHorse color={horse.color} />}

      <pixiText
        {...({
          text: horse.name,
          x: 20,
          y: -4,
          anchor: 0.5,
          style: new PIXI.TextStyle({
            fontFamily: 'Courier New',
            fontSize: 9,
            fontWeight: '800',
            fill: 0xffffff,
            stroke: { color: 0x111111, width: 2.2 }
          })
        } as any)}
      />

      <pixiContainer x={0} y={-9}>
        <pixiGraphics
          draw={(g) => {
            g.clear();
            g.roundRect(-7, -7, 14, 14, 3).fill({ color: 0x101010, alpha: 0.84 });
            g.roundRect(-6, -6, 12, 12, 3).stroke({ color: horse.color, width: 2 });
          }}
        />
        <pixiText
          {...({
            text: (horse.id + 1).toString(),
            x: 0,
            y: 0,
            anchor: 0.5,
            style: new PIXI.TextStyle({
              fontFamily: 'Courier New',
              fontSize: 8,
              fontWeight: '900',
              fill: 0xf8f8f8
            })
          } as any)}
        />
      </pixiContainer>
    </pixiContainer>
  );
};

const TopHud = ({ elapsedMs, width }: { elapsedMs: number; width: number }) => {
  const drawPanel = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      g.rect(width * 0.34, 8, width * 0.32, WORLD.topHudHeight - 18).fill({ color: 0x7a1b18, alpha: 0.96 });
      g.rect(width * 0.34, 8, width * 0.32, 7).fill({ color: 0x9f5f2a, alpha: 0.9 });
      g.roundRect(width - 328, 10, 314, 58, 5).fill({ color: 0xd2d4cc, alpha: 0.96 });
      g.roundRect(width - 324, 14, 306, 50, 5).stroke({ color: 0x39382f, width: 2, alpha: 0.55 });

      const buttonW = 52;
      const buttonGap = 14;
      const startX = width * 0.34 + 68;
      for (let i = 0; i < 3; i++) {
        const x = startX + i * (buttonW + buttonGap);
        g.roundRect(x, 20, buttonW, 40, 3).fill({ color: 0xe9c727 });
        g.roundRect(x, 20, buttonW, 40, 3).stroke({ color: 0x2b2c28, width: 2 });
      }

      g.poly([startX + 18, 28, startX + 18, 52, startX + 37, 40]).fill({ color: 0x1e2331 });
      const pauseX = startX + buttonW + buttonGap;
      g.rect(pauseX + 16, 29, 7, 22).fill({ color: 0x1e2331 });
      g.rect(pauseX + 30, 29, 7, 22).fill({ color: 0x1e2331 });
      const ffX = pauseX + buttonW + buttonGap;
      g.poly([ffX + 12, 28, ffX + 12, 52, ffX + 29, 40]).fill({ color: 0x1e2331 });
      g.poly([ffX + 25, 28, ffX + 25, 52, ffX + 42, 40]).fill({ color: 0x1e2331 });
    },
    [width]
  );

  return (
    <pixiContainer>
      <pixiGraphics draw={drawPanel} />
      <pixiText
        {...({
          text: `Off Time: ${formatRaceClock(elapsedMs)}`,
          x: width - 170,
          y: 40,
          anchor: 0.5,
          style: new PIXI.TextStyle({
            fontFamily: 'Courier New',
            fontSize: 28,
            fontWeight: '900',
            fill: 0x111111,
            stroke: { color: 0xf0f0f0, width: 2 }
          })
        } as any)}
      />
    </pixiContainer>
  );
};

const StandingsHud = ({
  horses,
  standings,
  width,
  height
}: {
  horses: Horse[];
  standings: number[];
  width: number;
  height: number;
}) => {
  const horseMap = useMemo(() => {
    const map = new Map<number, Horse>();
    horses.forEach((horse) => map.set(horse.id, horse));
    return map;
  }, [horses]);

  const drawStrip = useCallback(
    (g: PIXI.Graphics) => {
      g.clear();
      g.roundRect(20, height - WORLD.bottomHudHeight, width - 40, WORLD.bottomHudHeight - 14, 3).fill({
        color: 0x1f4a2c,
        alpha: 0.7
      });
    },
    [height, width]
  );

  return (
    <pixiContainer>
      <pixiGraphics draw={drawStrip} />
      {standings.slice(0, 10).map((horseId, index) => {
        const horse = horseMap.get(horseId);
        if (!horse) return null;
        const chipX = width - 54 - index * 44;
        const chipY = height - 60;

        return (
          <pixiContainer key={horseId} x={chipX} y={chipY}>
            <pixiGraphics
              draw={(g) => {
                g.clear();
                g.rect(-17, -17, 34, 34).fill({ color: horse.color, alpha: 0.98 });
                g.rect(-17, -17, 34, 34).stroke({ color: 0x151515, width: 3 });
              }}
            />
            <pixiText
              {...({
                text: (horse.id + 1).toString(),
                x: 0,
                y: 0,
                anchor: 0.5,
                style: new PIXI.TextStyle({
                  fontFamily: 'Courier New',
                  fontSize: 22,
                  fontWeight: '900',
                  fill: 0x0f1012,
                  stroke: { color: 0xf5f5f5, width: 2 }
                })
              } as any)}
            />
          </pixiContainer>
        );
      })}
    </pixiContainer>
  );
};

const RaceController = ({ update }: { update: (ticker: PIXI.Ticker) => void }) => {
  useTick(update);
  return null;
};

export const HorseRacingEngine = ({
  onRaceFinish,
  onRaceUpdate,
  isRacing,
  horsesCount = 10,
  width,
  height,
  horseImageUrl,
  horseStrengths
}: HorseRacingEngineProps) => {
  const [horses, setHorses] = useState<Horse[]>([]);
  const [isAssetsLoaded, setIsAssetsLoaded] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const finishedRef = useRef(false);
  const horsesSimRef = useRef<Horse[]>([]);
  const onRaceFinishRef = useRef(onRaceFinish);
  const onRaceUpdateRef = useRef(onRaceUpdate);
  const raceStartRef = useRef<number | null>(null);
  const elapsedRef = useRef(0);
  const updateThrottleRef = useRef(0);
  const dirtParticlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }[]>([]);
  const dirtGraphicsRef = useRef<PIXI.Graphics>(null);

  useEffect(() => {
    onRaceFinishRef.current = onRaceFinish;
    onRaceUpdateRef.current = onRaceUpdate;
  }, [onRaceFinish, onRaceUpdate]);

  useEffect(() => {
    const horseAsset = horseImageUrl || ASSETS.HORSE;
    PIXI.Assets.load([horseAsset, ASSETS.STANDS])
      .then(() => setIsAssetsLoaded(true))
      .catch((error) => {
        console.error('Failed to load textures:', error);
        setIsAssetsLoaded(true);
      });
  }, [horseImageUrl]);

  useEffect(() => {
    const startHorses: Horse[] = Array.from({ length: horsesCount }).map((_, i) => {
      const strength = horseStrengths?.[i] ?? 1;
      return {
        id: i,
        name: HORSE_NAMES[i] || `Derby ${i + 1}`,
        color: PIXI.Color.shared.setValue(HORSE_COLORS[i % HORSE_COLORS.length]).toNumber(),
        position: 0,
        speed: 0,
        acceleration: 0,
        finishTime: null,
        laneIdx: i,
        variation: Math.random() * Math.PI * 2,
        burstCooldown: 80 + Math.random() * 130,
        startDelayMs: Math.random() * 380,
        paceFactor: clamp(strength + (Math.random() - 0.5) * 0.05, 0.82, 1.22)
      };
    });

    setHorses(startHorses);
    horsesSimRef.current = startHorses;
    setElapsedMs(0);
    elapsedRef.current = 0;
    raceStartRef.current = null;
    updateThrottleRef.current = 0;
    dirtParticlesRef.current = [];
    finishedRef.current = false;
  }, [horsesCount, horseStrengths]);

  useEffect(() => {
    if (!isRacing && finishedRef.current) {
      const reset = horsesSimRef.current.map((horse, idx) => {
        const strength = horseStrengths?.[idx] ?? 1;
        return {
          ...horse,
          position: 0,
          speed: 0,
          finishTime: null,
          startDelayMs: Math.random() * 380,
          paceFactor: clamp(strength + (Math.random() - 0.5) * 0.05, 0.82, 1.22)
        };
      });
      horsesSimRef.current = reset;
      setHorses(reset);
      setElapsedMs(0);
      elapsedRef.current = 0;
      raceStartRef.current = null;
      updateThrottleRef.current = 0;
      dirtParticlesRef.current = [];
      finishedRef.current = false;
    }
  }, [isRacing, horseStrengths]);

  const updateRace = useCallback(
    (ticker: PIXI.Ticker) => {
      if (!isRacing || finishedRef.current) return;

      const delta = ticker.deltaTime;
      const now = Date.now();
      if (!raceStartRef.current) raceStartRef.current = now;

      const elapsed = now - raceStartRef.current;
      elapsedRef.current = elapsed;
      setElapsedMs(elapsed);

      const previous = horsesSimRef.current;
      if (previous.length === 0) return;

      const leaderPosition = Math.max(...previous.map((horse) => horse.position));
      let nextLeaderPosition = 0;

      const layout = getLayout(width, height, horsesCount);

      const next = previous.map((horse) => {
        if (horse.finishTime) {
          if (horse.position > nextLeaderPosition) nextLeaderPosition = horse.position;
          return horse;
        }

        const distanceToLeader = leaderPosition - horse.position;
        const fieldBoost = Math.min(0.7, distanceToLeader / 900);
        const phaseBias = horse.position > WORLD.raceDistance * 0.8 ? 1.8 : horse.position < WORLD.raceDistance * 0.2 ? 0.8 : 0;
        const waveVariance = Math.sin(elapsed * 0.005 + horse.variation) * 1.4;
        const randomVariance = (Math.random() - 0.5) * 0.7;

        let targetSpeed = (8.3 + waveVariance + randomVariance + fieldBoost + phaseBias) * horse.paceFactor;
        if (elapsed < horse.startDelayMs) targetSpeed = 0;

        let cooldown = horse.burstCooldown - delta;
        if (cooldown <= 0) {
          const event = Math.random();
          if (event < 0.1) {
            targetSpeed += 2.8;
            cooldown = 90 + Math.random() * 120;
          } else if (event < 0.16) {
            targetSpeed -= 2.2;
            cooldown = 90 + Math.random() * 80;
          } else {
            cooldown = 60 + Math.random() * 80;
          }
        }

        const speed = horse.speed + (targetSpeed - horse.speed) * 0.14;
        const position = horse.position + speed * delta;

        const laneCenterY = layout.fieldTop + (horse.laneIdx + 0.5) * layout.laneHeight;
        if (speed > 4 && Math.random() > 0.5) {
          dirtParticlesRef.current.push({
            x: positionToTrackX(position, layout.startX, layout.trackWidth) - 22,
            y: laneCenterY + 12,
            vx: -Math.max(1.5, speed * 0.24) + (Math.random() - 0.5),
            vy: (Math.random() - 0.5) * 1.1,
            life: 0,
            maxLife: 12 + Math.random() * 10,
            size: 1.5 + Math.random() * 2.2
          });
        }

        if (position > nextLeaderPosition) nextLeaderPosition = position;

        return {
          ...horse,
          position,
          speed,
          finishTime: position >= WORLD.raceDistance ? now : null,
          burstCooldown: cooldown
        };
      });

      horsesSimRef.current = next;
      setHorses(next);

      const dirtLayer = dirtGraphicsRef.current;
      const particles = dirtParticlesRef.current;
      if (dirtLayer) {
        dirtLayer.clear();
        for (let index = particles.length - 1; index >= 0; index--) {
          const particle = particles[index];
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
          particle.life += delta;

          if (particle.life >= particle.maxLife) {
            particles.splice(index, 1);
            continue;
          }

          const alpha = 1 - particle.life / particle.maxLife;
          dirtLayer.circle(particle.x, particle.y, particle.size).fill({ color: 0x5c4a2d, alpha: alpha * 0.72 });
        }
      }

      updateThrottleRef.current += ticker.deltaMS;
      if (updateThrottleRef.current > 90) {
        updateThrottleRef.current = 0;
        if (onRaceUpdateRef.current) {
          const standings = [...next].sort((a, b) => b.position - a.position).map((horse) => horse.id);
          onRaceUpdateRef.current({
            horses: [...next],
            leaderProgress: clamp((nextLeaderPosition / WORLD.raceDistance) * 100, 0, 100),
            elapsedMs: elapsedRef.current,
            standings
          });
        }
      }

      const finishedHorses = next.filter((horse) => horse.finishTime !== null);
      if (finishedHorses.length === next.length && !finishedRef.current) {
        finishedRef.current = true;
        const sortedByFinish = [...next].sort((a, b) => (a.finishTime || Infinity) - (b.finishTime || Infinity));
        const winnerId = sortedByFinish[0].id;
        setTimeout(() => {
          onRaceFinishRef.current(winnerId);
        }, 0);
      }
    },
    [isRacing, width, height, horsesCount]
  );

  const standings = useMemo(() => [...horses].sort((a, b) => b.position - a.position).map((horse) => horse.id), [horses]);
  const layout = useMemo(() => getLayout(width, height, horsesCount), [width, height, horsesCount]);

  return (
    <Application width={width} height={height} background={0x122015} antialias autoDensity resolution={window.devicePixelRatio || 1}>
      <RaceController update={updateRace} />

      <StadiumBackdrop width={width} topAreaHeight={layout.topAreaHeight} isAssetsLoaded={isAssetsLoaded} />
      <TrackLayer width={width} height={height} lanes={horsesCount} />
      <CourseLabels width={width} height={height} lanes={horsesCount} />
      <pixiGraphics ref={dirtGraphicsRef} draw={() => {}} />

      {horses.map((horse) => {
        const x = positionToTrackX(horse.position, layout.startX, layout.trackWidth);
        const y = layout.fieldTop + (horse.laneIdx + 0.5) * layout.laneHeight;
        return <AnimatedHorse key={horse.id} horse={horse} elapsedMs={elapsedMs} horseImageUrl={horseImageUrl || ASSETS.HORSE} x={x} y={y} />;
      })}

      <TopHud elapsedMs={elapsedMs} width={width} />
      <StandingsHud horses={horses} standings={standings} width={width} height={height} />
    </Application>
  );
};
