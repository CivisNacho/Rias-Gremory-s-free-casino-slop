import React, { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Crown, Eye, Wallet } from 'lucide-react';
import { cn } from '../lib/utils';
import { Card, PokerPlayerState } from '../lib/pokerUtils';

const SUIT_SYMBOL: Record<Card['suit'], string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠'
};

const SUIT_COLOR: Record<Card['suit'], string> = {
  hearts: 'text-red-500',
  diamonds: 'text-red-400',
  clubs: 'text-slate-900',
  spades: 'text-slate-900'
};

export interface PokerBoardProps {
  pokerPlayers: PokerPlayerState[];
  mainHuman?: PokerPlayerState;
  communityCards: Card[];
  dealerIndex: number;
  currentTurnId?: string;
  currentBet: number;
  totalPot: number;
  streetLabel: string;
  phaseLabel: string;
  handMessage: string;
  revealAllCards: boolean;
  chipPulse?: {
    id: number;
    playerId: string;
    amount: number;
    direction: 'toPot' | 'fromPot';
    tone: 'good' | 'bad' | 'neutral';
  } | null;
}

type ChipPulse = NonNullable<PokerBoardProps['chipPulse']>;

function ChipFlight({
  chipPulse,
  seatRefs,
  humanSeatRef,
  potRef,
  boardRef,
  mainHumanId
}: {
  chipPulse?: ChipPulse | null;
  seatRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  humanSeatRef: React.RefObject<HTMLDivElement | null>;
  potRef: React.RefObject<HTMLDivElement | null>;
  boardRef: React.RefObject<HTMLDivElement | null>;
  mainHumanId?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [flight, setFlight] = useState<null | {
    id: number;
    amount: number;
    tone: ChipPulse['tone'];
    left: number;
    top: number;
    dx: number;
    dy: number;
  }>(null);
  const activeIdRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!chipPulse || reduceMotion) return;

    const board = boardRef.current;
    const source =
      chipPulse.direction === 'toPot'
        ? seatRefs.current[chipPulse.playerId] ?? (chipPulse.playerId === mainHumanId ? humanSeatRef.current : null)
        : potRef.current;
    const target =
      chipPulse.direction === 'toPot'
        ? potRef.current
        : seatRefs.current[chipPulse.playerId] ?? (chipPulse.playerId === mainHumanId ? humanSeatRef.current : null);

    if (!board || !source || !target) return;

    const boardRect = board.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();

    const left = sourceRect.left + sourceRect.width / 2 - boardRect.left;
    const top = sourceRect.top + sourceRect.height / 2 - boardRect.top;
    const targetLeft = targetRect.left + targetRect.width / 2 - boardRect.left;
    const targetTop = targetRect.top + targetRect.height / 2 - boardRect.top;

    activeIdRef.current = chipPulse.id;
    setFlight({
      id: chipPulse.id,
      amount: chipPulse.amount,
      tone: chipPulse.tone,
      left,
      top,
      dx: targetLeft - left,
      dy: targetTop - top
    });
  }, [boardRef, chipPulse, humanSeatRef, mainHumanId, potRef, reduceMotion, seatRefs]);

  if (!flight) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={flight.id}
        initial={{ opacity: 0, scale: 0.7, x: flight.left, y: flight.top }}
        animate={{
          opacity: [0, 1, 1, 0],
          scale: [0.7, 1.05, 0.98, 0.9],
          x: flight.left + flight.dx,
          y: flight.top + flight.dy,
          rotate: [0, -8, 4, 0]
        }}
        transition={{ duration: 1, times: [0, 0.15, 0.8, 1], ease: [0.22, 1, 0.36, 1] }}
        onAnimationComplete={() => {
          if (activeIdRef.current === flight.id) {
            setFlight(null);
          }
        }}
        className="absolute left-0 top-0 z-30 pointer-events-none"
      >
        <div
          className={cn(
            'flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-[10px] font-black uppercase tracking-[0.25em] shadow-[0_0_30px_rgba(0,0,0,0.35)]',
            flight.tone === 'good'
              ? 'border-yellow-300/35 bg-yellow-400 text-black'
              : flight.tone === 'bad'
                ? 'border-red-300/35 bg-red-500 text-white'
                : 'border-cyan-300/35 bg-cyan-400 text-black'
          )}
        >
          ${flight.amount.toLocaleString()}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function PlayingCard({
  card,
  faceUp = true,
  small = false,
  staticFace = false
}: {
  card?: Card;
  faceUp?: boolean;
  small?: boolean;
  staticFace?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  if (staticFace) {
    return (
      <motion.div
        className={cn(
          'relative rounded-2xl shadow-2xl',
          small ? 'w-8 h-12' : 'w-11 h-15 lg:w-14 lg:h-19'
        )}
        initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
      >
        {faceUp && card ? (
          <div
            className={cn(
              'absolute inset-0 rounded-2xl bg-white border border-black/10 p-0.5 lg:p-1 flex flex-col justify-between overflow-hidden',
              SUIT_COLOR[card.suit]
            )}
          >
            <div className="leading-none">
              <div className={cn('font-black tracking-tight leading-none', small ? 'text-[8px]' : 'text-[9px] lg:text-[10px]')}>
                {card.rank}
              </div>
              <div className={cn('leading-none', small ? 'text-[7px]' : 'text-[8px] lg:text-[9px]')}>{SUIT_SYMBOL[card.suit]}</div>
            </div>
            <div className={cn('text-center select-none leading-none', small ? 'text-sm' : 'text-lg lg:text-2xl')}>
              {SUIT_SYMBOL[card.suit]}
            </div>
            <div className="leading-none rotate-180">
              <div className={cn('font-black tracking-tight leading-none', small ? 'text-[8px]' : 'text-[9px] lg:text-[10px]')}>
                {card.rank}
              </div>
              <div className={cn('leading-none', small ? 'text-[7px]' : 'text-[8px] lg:text-[9px]')}>{SUIT_SYMBOL[card.suit]}</div>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0 rounded-2xl overflow-hidden border border-white/15 bg-[linear-gradient(135deg,#17111f,#322344)]">
            <div className="absolute inset-2 rounded-xl border border-white/10" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),transparent_45%),radial-gradient(circle_at_bottom,_rgba(250,204,21,0.12),transparent_40%)]" />
            <div className="absolute inset-0 flex items-center justify-center text-white/25 text-[10px] font-black uppercase tracking-[0.35em]">
              Nocturne
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 18, rotateY: faceUp ? 0 : 180, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, rotateY: faceUp ? 0 : 180, scale: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={cn(
        'relative rounded-2xl shadow-2xl [transform-style:preserve-3d]',
        small ? 'w-8 h-12' : 'w-11 h-15 lg:w-14 lg:h-19'
      )}
    >
      {faceUp && card ? (
        <div
          className={cn(
            'absolute inset-0 rounded-2xl bg-white border border-black/10 p-0.5 lg:p-1 flex flex-col justify-between overflow-hidden',
            SUIT_COLOR[card.suit]
          )}
        >
          <div className="leading-none">
            <div className={cn('font-black tracking-tight leading-none', small ? 'text-[8px]' : 'text-[9px] lg:text-[10px]')}>
              {card.rank}
            </div>
            <div className={cn('leading-none', small ? 'text-[7px]' : 'text-[8px] lg:text-[9px]')}>{SUIT_SYMBOL[card.suit]}</div>
          </div>
          <div className={cn('text-center select-none leading-none', small ? 'text-sm' : 'text-lg lg:text-2xl')}>
            {SUIT_SYMBOL[card.suit]}
          </div>
          <div className="leading-none rotate-180">
            <div className={cn('font-black tracking-tight leading-none', small ? 'text-[8px]' : 'text-[9px] lg:text-[10px]')}>
              {card.rank}
            </div>
            <div className={cn('leading-none', small ? 'text-[7px]' : 'text-[8px] lg:text-[9px]')}>{SUIT_SYMBOL[card.suit]}</div>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 rounded-2xl overflow-hidden border border-white/15 bg-[linear-gradient(135deg,#17111f,#322344)]">
          <div className="absolute inset-2 rounded-xl border border-white/10" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),transparent_45%),radial-gradient(circle_at_bottom,_rgba(250,204,21,0.12),transparent_40%)]" />
          <div className="absolute inset-0 flex items-center justify-center text-white/25 text-[10px] font-black uppercase tracking-[0.35em]">
            Nocturne
          </div>
        </div>
      )}
    </motion.div>
  );
}

function StaticHoleCard({
  card,
  small = false
}: {
  card?: Card;
  small?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={cn(
        'relative rounded-2xl shadow-2xl overflow-hidden',
        small ? 'w-8 h-12' : 'w-11 h-15 lg:w-14 lg:h-19'
      )}
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 14, scale: 0.94, rotateZ: -2 }}
      animate={{ opacity: 1, y: 0, scale: 1, rotateZ: 0 }}
      transition={{ duration: 0.32, ease: 'easeOut' }}
      style={{ backfaceVisibility: 'visible' }}
    >
      {card ? (
        <div className={cn('absolute inset-0 rounded-2xl bg-white border border-black/10 p-0.5 lg:p-1 flex flex-col justify-between', SUIT_COLOR[card.suit])}>
          <div className="leading-none">
            <div className={cn('font-black tracking-tight leading-none', small ? 'text-[8px]' : 'text-[9px] lg:text-[10px]')}>
              {card.rank}
            </div>
            <div className={cn('leading-none', small ? 'text-[7px]' : 'text-[8px] lg:text-[9px]')}>{SUIT_SYMBOL[card.suit]}</div>
          </div>
          <div className={cn('text-center select-none leading-none', small ? 'text-sm' : 'text-lg lg:text-2xl')}>
            {SUIT_SYMBOL[card.suit]}
          </div>
          <div className="leading-none rotate-180">
            <div className={cn('font-black tracking-tight leading-none', small ? 'text-[8px]' : 'text-[9px] lg:text-[10px]')}>
              {card.rank}
            </div>
            <div className={cn('leading-none', small ? 'text-[7px]' : 'text-[8px] lg:text-[9px]')}>{SUIT_SYMBOL[card.suit]}</div>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 rounded-2xl overflow-hidden border border-white/15 bg-[linear-gradient(135deg,#17111f,#322344)]" />
      )}
    </motion.div>
  );
}

function SeatCard({
  player,
  isDealer,
  isCurrentTurn,
  revealCards,
  compact = false,
  seatRef
}: {
  player: PokerPlayerState;
  isDealer: boolean;
  isCurrentTurn: boolean;
  revealCards: boolean;
  compact?: boolean;
  seatRef?: React.Ref<HTMLDivElement>;
}) {
  const reduceMotion = useReducedMotion();
  const accent =
    player.status === 'folded'
      ? 'border-white/10 bg-white/[0.03]'
      : player.status === 'all-in'
        ? 'border-yellow-500/35 bg-yellow-500/10'
        : isCurrentTurn
          ? 'border-cyan-400/45 bg-cyan-400/10'
          : 'border-white/10 bg-white/[0.04]';

  return (
    <motion.div
      ref={seatRef}
      layout
      initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.98 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: isCurrentTurn && !reduceMotion ? 1.015 : 1
      }}
      whileHover={reduceMotion ? undefined : { y: -4 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className={cn('rounded-3xl border px-2 py-1.5 backdrop-blur-md shadow-xl', accent, compact ? 'w-[110px]' : 'w-[140px]')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-black tracking-tight text-white truncate">{player.name}</span>
            {isDealer && (
              <span className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-yellow-400">
                <Crown size={9} />
                D
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[9px] uppercase tracking-[0.22em] text-white/40">
            <Wallet size={9} />
            ${player.stack.toLocaleString()}
          </div>
        </div>
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.16em]',
            player.status === 'folded'
              ? 'bg-white/10 text-white/45'
              : player.status === 'all-in'
                ? 'bg-yellow-500/15 text-yellow-400'
                : 'bg-emerald-500/15 text-emerald-300'
          )}
        >
          {player.status}
        </span>
      </div>

      <div className="mt-2.5 flex items-center gap-1.5">
        {player.cards.length > 0 ? (
          player.cards.map((card, index) => (
            <PlayingCard
              key={`${player.id}-${index}-${card.rank}${card.suit}`}
              card={card}
              faceUp={revealCards || !player.isBot}
              small={compact}
            />
          ))
        ) : (
          <>
            <PlayingCard faceUp={false} small={compact} />
            <PlayingCard faceUp={false} small={compact} />
          </>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[9px] uppercase tracking-[0.18em] text-white/45">
        <span>{player.lastAction ?? 'Waiting'}</span>
        <span>Bet ${player.currentBet}</span>
      </div>

      {player.handResult && revealCards && (
        <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 px-2.5 py-1.5 text-[9px] uppercase tracking-[0.16em] text-cyan-200">
          {player.handResult.description}
        </div>
      )}
    </motion.div>
  );
}

export function PokerBoard({
  pokerPlayers,
  mainHuman,
  communityCards,
  dealerIndex,
  currentTurnId,
  currentBet,
  totalPot,
  streetLabel,
  phaseLabel,
  handMessage,
  revealAllCards,
  chipPulse
}: PokerBoardProps) {
  const topSeats = pokerPlayers.filter((player) => player.id !== mainHuman?.id).slice(0, 4);
  const overflowSeats = pokerPlayers.filter((player) => player.id !== mainHuman?.id).slice(4);
  const reduceMotion = useReducedMotion();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const potRef = useRef<HTMLDivElement | null>(null);
  const humanSeatRef = useRef<HTMLDivElement | null>(null);
  const seatRefs = useRef<Record<string, HTMLDivElement | null>>({});

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="relative z-30 flex-1 min-h-0 overflow-hidden px-1 py-1 lg:px-2 lg:py-1"
    >
      <div className="pointer-events-none absolute inset-0 z-20">
        <ChipFlight
          chipPulse={chipPulse}
          seatRefs={seatRefs}
          humanSeatRef={humanSeatRef}
          potRef={potRef}
          boardRef={boardRef}
          mainHumanId={mainHuman?.id}
        />
      </div>
      <div className="absolute inset-2 rounded-[30px] border border-emerald-400/10 bg-[radial-gradient(circle_at_center,_rgba(21,128,61,0.45),rgba(7,28,18,0.96)_68%)] shadow-[inset_0_0_100px_rgba(0,0,0,0.55),0_40px_120px_rgba(0,0,0,0.45)]" />
      <div className="absolute inset-x-[12%] top-[10%] bottom-[14%] rounded-[999px] border border-yellow-500/10" />

      <div ref={boardRef} className="relative z-10 flex h-full flex-col">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[7px] font-black uppercase tracking-[0.3em] text-cyan-300/80">{phaseLabel}</div>
            <div className="mt-0.5 text-lg font-black tracking-tight text-white lg:text-xl">{streetLabel}</div>
            <p className="mt-0.5 max-w-lg text-[9px] text-white/55 lg:text-[10px]">{handMessage}</p>
          </div>

          <div className="grid grid-cols-2 gap-1 text-right">
            <div className="rounded-3xl border border-white/10 bg-black/15 px-2 py-1.5 backdrop-blur-md">
              <div className="text-[7px] font-black uppercase tracking-[0.22em] text-white/40">Pot</div>
              <div className="mt-0.5 text-base font-black tracking-tight text-yellow-400 lg:text-lg">${totalPot.toLocaleString()}</div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-black/15 px-2 py-1.5 backdrop-blur-md">
              <div className="text-[7px] font-black uppercase tracking-[0.22em] text-white/40">To Match</div>
              <div className="mt-0.5 text-base font-black tracking-tight text-cyan-300 lg:text-lg">${currentBet.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-2 lg:mt-2.5">
          {topSeats.slice(0, 2).map((player, index) => (
            <SeatCard
              key={player.id}
              seatRef={(node) => {
                seatRefs.current[player.id] = node;
              }}
              player={player}
              isDealer={pokerPlayers[dealerIndex]?.id === player.id}
              isCurrentTurn={currentTurnId === player.id}
              revealCards={revealAllCards}
              compact={index > 0}
            />
          ))}
        </div>

        <div className="relative mt-1 flex flex-1 items-center justify-center lg:mt-1.5">
          <div className="absolute left-1/2 top-1/2 w-full max-w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-[999px] border border-white/8 bg-black/10 px-2 py-1.5 backdrop-blur-sm">
            <div
              ref={potRef}
              className="pointer-events-none absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-yellow-300/25 bg-yellow-400/10 text-[7px] font-black uppercase tracking-[0.16em] text-yellow-200/70 shadow-[0_0_18px_rgba(250,204,21,0.14)]"
            >
              Pot
            </div>
            <div className="flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-red-400/25 bg-red-500/10 px-2 py-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-red-300">
                <Eye size={9} />
                Board
              </span>
            </div>
            <div className="mt-3 flex justify-center gap-1.5 lg:gap-2">
              {[0, 1, 2, 3, 4].map((slot) => {
                const card = communityCards[slot];
                const key = card ? `${slot}-${card.rank}${card.suit}` : `empty-${slot}`;

                return (
                  <PlayingCard
                    key={key}
                    card={card}
                    faceUp={Boolean(card)}
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-end justify-between gap-2 lg:mt-2.5">
          {topSeats.slice(2, 4).map((player) => (
            <SeatCard
              key={player.id}
              seatRef={(node) => {
                seatRefs.current[player.id] = node;
              }}
              player={player}
              isDealer={pokerPlayers[dealerIndex]?.id === player.id}
              isCurrentTurn={currentTurnId === player.id}
              revealCards={revealAllCards}
              compact
            />
          ))}
        </div>

        {overflowSeats.length > 0 && (
          <div className="mt-2 rounded-3xl border border-white/10 bg-black/15 px-2 py-1.5 backdrop-blur-md">
            <div className="text-[8px] font-black uppercase tracking-[0.26em] text-white/35">Extra Seats</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {overflowSeats.map((player) => (
                <SeatCard
                  key={player.id}
                  seatRef={(node) => {
                    seatRefs.current[player.id] = node;
                  }}
                  player={player}
                  isDealer={pokerPlayers[dealerIndex]?.id === player.id}
                  isCurrentTurn={currentTurnId === player.id}
                  revealCards={revealAllCards}
                  compact
                />
              ))}
            </div>
          </div>
        )}

        {mainHuman && (
          <div ref={humanSeatRef} className="relative z-40 mt-1 rounded-[22px] border border-cyan-400/15 bg-black/20 px-2 py-1 backdrop-blur-md lg:mt-1.5">
            <div className="flex flex-col gap-1.5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[7px] font-black uppercase tracking-[0.2em] text-cyan-300/75">Your Seat</div>
                <div className="mt-0.5 text-sm font-black tracking-tight text-white lg:text-base">{mainHuman.name}</div>
              </div>
              <div className="text-[7px] uppercase tracking-[0.16em] text-white/40">
                {mainHuman.handResult && revealAllCards ? mainHuman.handResult.description : mainHuman.lastAction ?? 'Ready'}
              </div>
            </div>

            <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-1.5">
                {mainHuman.cards.length > 0 ? (
                  mainHuman.cards.map((card, index) => (
                    <StaticHoleCard key={`${mainHuman.id}-${index}-${card.rank}${card.suit}`} card={card} />
                  ))
                ) : (
                  <>
                    <StaticHoleCard />
                    <StaticHoleCard />
                  </>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1.5 text-center">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
                  <div className="text-[8px] font-black uppercase tracking-[0.18em] text-white/35">Stack</div>
                  <div className="mt-0.5 text-[13px] font-black tracking-tight text-white lg:text-sm">${mainHuman.stack.toLocaleString()}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
                  <div className="text-[8px] font-black uppercase tracking-[0.18em] text-white/35">In Pot</div>
                  <div className="mt-0.5 text-[13px] font-black tracking-tight text-yellow-400 lg:text-sm">${mainHuman.totalContribution.toLocaleString()}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-1.5">
                  <div className="text-[8px] font-black uppercase tracking-[0.18em] text-white/35">Street Bet</div>
                  <div className="mt-0.5 text-[13px] font-black tracking-tight text-cyan-300 lg:text-sm">${mainHuman.currentBet.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
