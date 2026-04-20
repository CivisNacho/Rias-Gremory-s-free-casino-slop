import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Star, Trophy } from 'lucide-react';
import { cn } from '../lib/utils';
import { Card, HandRank, getBest4CardHand, PokerPlayerState } from '../lib/pokerUtils';

const SUIT_SYMBOL = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
};

const CARD_SUIT_COLOR = {
    hearts: 'text-red-500',
    diamonds: 'text-red-400',
    clubs: 'text-slate-900',
    spades: 'text-slate-900'
};

const cardWrapperVariants: import('framer-motion').Variants = {
  initial: ({ isPlayerCard, isDealerCard, index }) => ({
    y: isPlayerCard ? -600 : (isDealerCard ? -50 : 80),
    x: isDealerCard ? 300 : (isPlayerCard ? (index - 2) * 50 : 0),
    opacity: 0,
    rotateZ: isDealerCard ? -45 : 0,
    scale: 0.5,
    zIndex: 0
  }),
  animate: ({ faceUp, winning, index, small }) => ({
    y: faceUp ? Math.abs(index - (small ? 2.5 : 2)) * 8 : Math.abs(index - (small ? 2.5 : 2)) * 4 + 5,
    x: 0,
    opacity: 1,
    scale: winning ? 1.05 : 1,
    rotateZ: faceUp ? (index - (small ? 2.5 : 2)) * (small ? -2 : 6) : (index - (small ? 2.5 : 2)) * 2,
    zIndex: faceUp ? 10 : 0
  }),
  hover: ({ index, small }) => ({
    y: -10,
    rotateZ: (index - (small ? 2.5 : 2)) * (small ? 0 : 3),
    scale: 1.02,
    zIndex: 30
  }),
  tap: {
    scale: 0.98,
    y: 0
  }
};

const cardFlipVariants: import('framer-motion').Variants = {
  initial: { rotateY: 180 },
  animate: ({ faceUp }) => ({
    rotateY: faceUp ? 0 : 180
  })
};

export const PlayingCard = ({ 
  card, 
  faceUp = true, 
  index = 0, 
  winning = false,
  royalPick = false,
  small = false,
  isPlayerCard = false,
  isDealerCard = false,
  onMount,
  onReveal,
  onThud
}: { 
  card?: Card, 
  faceUp?: boolean, 
  index?: number, 
  winning?: boolean,
  royalPick?: boolean,
  small?: boolean,
  isPlayerCard?: boolean,
  isDealerCard?: boolean,
  onMount?: () => void,
  onReveal?: () => void,
  onThud?: () => void
}) => {
    const prevFaceUp = useRef(faceUp);
    const hasThudded = useRef(false);

    useEffect(() => {
        if (onMount) onMount();
    }, [onMount]);

    useEffect(() => {
        if (!prevFaceUp.current && faceUp && onReveal) {
            setTimeout(onReveal, index * 40); 
            hasThudded.current = false;
        }
        prevFaceUp.current = faceUp;
    }, [faceUp, onReveal, index]);

    return (
        <motion.div
            custom={{ isPlayerCard, isDealerCard, index, faceUp, winning, small }}
            variants={cardWrapperVariants}
            initial="initial"
            animate="animate"
            whileHover="hover"
            whileTap="tap"
            onAnimationStart={(definition) => {
                if (typeof definition === 'string' && definition === 'animate' && isPlayerCard && onReveal) {
                    setTimeout(onReveal, (index * 200) + 400);
                }
            }}
            onAnimationComplete={(definition) => {
                if (definition === 'animate') {
                    if (onThud && !hasThudded.current) {
                       onThud();
                       hasThudded.current = true;
                    }
                }
            }}
            transition={{
                type: 'tween',
                ease: 'easeOut',
                duration: 0.55,
                delay: isPlayerCard ? index * 0.15 : index * 0.08
            }}
            className={cn(
                "relative transition-shadow duration-300 transform-gpu group cursor-pointer",
                small ? "w-8 h-12 lg:w-12 lg:h-16" : "w-16 h-22 lg:w-24 lg:h-34",
                winning ? "ring-4 ring-cyan-400 ring-offset-4 ring-offset-slate-950 z-20 rounded-xl" : "",
                royalPick ? "ring-2 ring-cyan-400 scale-105 z-20 shadow-[0_0_30px_rgba(34,211,238,0.4)] rounded-xl" : ""
            )}
            style={{ 
              willChange: 'transform, opacity',
              perspective: '1200px'
            }}
        >
            <motion.div
              custom={{ faceUp }}
              variants={cardFlipVariants}
              initial="initial"
              animate="animate"
              transition={{
                  type: 'tween',
                  ease: 'easeInOut',
                  duration: 0.5,
                  delay: isPlayerCard ? (index * 0.15) + 0.4 : index * 0.08
              }}
              className="w-full h-full rounded-xl shadow-2xl relative"
              style={{
                transformStyle: 'preserve-3d'
              }}
            >
                {/* Front */}
                <div className={cn(
                    "absolute inset-0 bg-white rounded-xl flex flex-col justify-between p-1 lg:p-2 shadow-inner",
                    card ? CARD_SUIT_COLOR[card.suit] : 'text-slate-900'
                )}
                style={{ 
                  transform: 'translateZ(1px)', 
                  backfaceVisibility: 'hidden', 
                  WebkitBackfaceVisibility: 'hidden'
                }}>
                    <div className="flex flex-col items-start leading-[0.8] p-0.5">
                        <span className={cn("font-black tracking-tighter", small ? "text-[9px]" : "text-xs lg:text-xl")}>{card?.rank}</span>
                        <span className={cn(small ? "text-[7px]" : "text-[9px] lg:text-xs")}>{card && SUIT_SYMBOL[card.suit]}</span>
                    </div>
                    
                    {royalPick && !small && (
                      <div className="absolute top-1 right-1 bg-cyan-400 text-[6px] lg:text-[8px] font-black text-black px-1 py-0.5 rounded-sm uppercase tracking-tighter shadow-sm">
                        Royal
                      </div>
                    )}

                    <div className={cn("flex justify-center grow items-center select-none leading-none", small ? "text-xs" : "text-xl lg:text-4xl")}>
                       {card && SUIT_SYMBOL[card.suit]}
                    </div>

                    <div className="flex flex-col items-start leading-[0.8] rotate-180 p-0.5">
                        <span className={cn("font-black tracking-tighter", small ? "text-[9px]" : "text-xs lg:text-xl")}>{card?.rank}</span>
                        <span className={cn(small ? "text-[7px]" : "text-[9px] lg:text-xs")}>{card && SUIT_SYMBOL[card.suit]}</span>
                    </div>
                </div>
                {/* Back */}
                <div 
                    className="absolute inset-0 bg-[#1a1625] rounded-xl overflow-hidden border border-white/20 shadow-inner"
                    style={{ 
                      transform: 'rotateY(180deg) translateZ(1px)', 
                      backfaceVisibility: 'hidden', 
                      WebkitBackfaceVisibility: 'hidden'
                    }}
                >
                    <img 
                        src="https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/images/issei_poker_back.jpg" 
                        onError={(e) => { e.currentTarget.src = "https://picsum.photos/seed/issei/400/600" }}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        alt="Card Back"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#121016] via-transparent to-transparent opacity-80" />
                    <div className={cn("absolute inset-0 flex items-center justify-center text-white/40 font-lobster rotate-45 select-none tracking-widest", small ? "text-[8px]" : "text-xs lg:text-xl")}>
                        NOCTURNE
                    </div>
                    <div className="absolute inset-2 border border-white/20 rounded-lg pointer-events-none" />
                </div>
            </motion.div>
        </motion.div>
    );
};

export interface PokerBoardProps {
  pokerPlayers: PokerPlayerState[];
  mainHuman: PokerPlayerState | undefined;
  dealerCards: Card[];
  gameState: string;
  audio: any;
  handleBet: (type: 'ante' | 'play' | 'acesUp') => void;
  getLiveInsight: () => string;
}

export function PokerBoard({
  pokerPlayers,
  mainHuman,
  dealerCards,
  gameState,
  audio,
  handleBet,
  getLiveInsight
}: PokerBoardProps) {
    return (
        <div className="relative z-10 flex-1 w-full flex justify-center p-2 lg:p-6 overflow-hidden min-h-0">
            {/* Table Layout Container */}
            <div className="w-full max-w-[1200px] h-full relative">
            
                {/* Bot 1 (Top Left) */}
                {pokerPlayers.filter(p => p.isBot)[0] && (
                    <div className="absolute top-[14%] left-[8%] lg:left-[12%] hidden lg:flex lg:flex-col gap-2 scale-[0.5] sm:scale-[0.6] lg:scale-[0.85] origin-top-left pointer-events-none opacity-90 z-20">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-[10px] font-black text-cyan-400">
                        {pokerPlayers.filter(p => p.isBot)[0].name[0]}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{pokerPlayers.filter(p => p.isBot)[0].name}</span>
                    </div>
                    <div className="flex -space-x-6">
                        {pokerPlayers.filter(p => p.isBot)[0].cards.map((c, ci) => (
                        <PlayingCard key={ci} card={c} index={ci} faceUp={gameState === 'showdown' || gameState === 'payout'} small={true} />
                        ))}
                    </div>
                    </div>
                )}

                {/* Dealer (Center) */}
                <div className="absolute top-[8%] lg:top-[12%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 lg:gap-4 z-10 pointer-events-none">
                    {/* Dealer Visual Glow / Clue */}
                    <div className="absolute -inset-10 bg-red-500/5 blur-[60px] rounded-full pointer-events-none" />
                    <div className="absolute -inset-4 border border-red-500/5 rounded-2xl pointer-events-none" />
                    
                    {/* Watermark Label Behind Cards */}
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap z-0 opacity-20 pointer-events-none select-none hidden lg:block">
                        <span className="text-3xl lg:text-7xl font-black uppercase tracking-[0.6em] text-white/40 drop-shadow-2xl">DEALER</span>
                    </div>

                    {/* Mobile-only: Dealer Insight Behind Cards */}
                    <div className="lg:hidden absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[280px] p-4 text-center z-0 opacity-30 select-none pointer-events-none">
                        <div className="flex flex-col items-center gap-1">
                            <div className="px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[6px] font-black uppercase tracking-widest text-red-400">Insight</div>
                            <p className="text-[10px] text-white/60 italic leading-tight">{getLiveInsight()}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 mb-1 relative z-10">
                        <div className="w-4 h-4 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        </div>
                        <span className="text-[10px] lg:text-[11px] font-black uppercase tracking-[0.4em] text-red-500/60 hidden lg:inline">The Dealer</span>
                        <span className="lg:hidden px-3 py-1 rounded-full bg-red-500/25 border border-red-500/40 text-[10px] font-black uppercase tracking-[0.2em] text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.3)]">⚔ Dealer</span>
                    </div>
                    
                    <div className="flex -space-x-12 lg:-space-x-16 perspective-1000 scale-[0.55] sm:scale-[0.65] lg:scale-[0.9] xl:scale-[1.1] transition-transform duration-500 relative z-10">
                        {dealerCards.length > 0 ? (
                        dealerCards.map((c, i) => (
                            <PlayingCard 
                            key={i} 
                            card={c} 
                            faceUp={gameState === 'showdown' || gameState === 'payout'} 
                            index={i}
                            isDealerCard={true}
                            onMount={audio.cardFlick}
                            onReveal={audio.cardReveal}
                            onThud={audio.cardThud}
                            winning={gameState === 'showdown' && getBest4CardHand(dealerCards).cards.some(bc => bc.rank === c.rank && bc.suit === c.suit)}
                            />
                        ))
                        ) : (
                        <div className="flex -space-x-8 lg:-space-x-12 opacity-10">
                            {[...Array(5)].map((_, j) => <div key={j} className="w-16 h-22 lg:w-24 lg:h-34 bg-white/5 rounded-2xl border border-white/20" />)}
                        </div>
                        )}
                    </div>
                </div>

                {/* Bot 2 (Top Right) */}
                {pokerPlayers.filter(p => p.isBot)[1] && (
                    <div className="absolute top-[14%] right-[8%] lg:right-[12%] hidden lg:flex lg:flex-col gap-2 items-end scale-[0.5] sm:scale-[0.6] lg:scale-[0.85] origin-top-right pointer-events-none opacity-90 z-20">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{pokerPlayers.filter(p => p.isBot)[1].name}</span>
                        <div className="w-8 h-8 rounded-full bg-purple-400/20 border border-purple-400/40 flex items-center justify-center text-[10px] font-black text-purple-400">
                        {pokerPlayers.filter(p => p.isBot)[1].name[0]}
                        </div>
                    </div>
                    <div className="flex -space-x-6">
                        {pokerPlayers.filter(p => p.isBot)[1].cards.map((c, ci) => (
                        <PlayingCard key={ci} card={c} index={ci} faceUp={gameState === 'showdown' || gameState === 'payout'} small={true} />
                        ))}
                    </div>
                    </div>
                )}

            {/* Middle Row - Bots & Insight */}
            <div className="pointer-events-none">
                {/* Bot 3 (Left Middle) */}
                {pokerPlayers.filter(p => p.isBot)[2] && (
                    <div className="absolute top-[42%] left-[4%] lg:left-[8%] hidden lg:flex lg:flex-col gap-2 scale-[0.5] sm:scale-[0.6] lg:scale-[0.85] origin-left pointer-events-none opacity-90 z-20">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-[10px] font-black text-cyan-400">
                        {pokerPlayers.filter(p => p.isBot)[2].name[0]}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{pokerPlayers.filter(p => p.isBot)[2].name}</span>
                    </div>
                    <div className="flex -space-x-6">
                        {pokerPlayers.filter(p => p.isBot)[2].cards.map((c, ci) => (
                        <PlayingCard key={ci} card={c} index={ci} faceUp={gameState === 'showdown' || gameState === 'payout'} small={true} />
                        ))}
                    </div>
                    </div>
                )}



                {/* Bot 4 (Right Middle) */}
                {pokerPlayers.filter(p => p.isBot)[3] && (
                    <div className="absolute top-[42%] right-[4%] lg:right-[8%] hidden lg:flex lg:flex-col gap-2 items-end scale-[0.5] sm:scale-[0.6] lg:scale-[0.85] origin-right pointer-events-none opacity-90 z-20">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{pokerPlayers.filter(p => p.isBot)[3].name}</span>
                        <div className="w-8 h-8 rounded-full bg-purple-400/20 border border-purple-400/40 flex items-center justify-center text-[10px] font-black text-purple-400">
                        {pokerPlayers.filter(p => p.isBot)[3].name[0]}
                        </div>
                    </div>
                    <div className="flex -space-x-6">
                        {pokerPlayers.filter(p => p.isBot)[3].cards.map((c, ci) => (
                        <PlayingCard key={ci} card={c} index={ci} faceUp={gameState === 'showdown' || gameState === 'payout'} small={true} />
                        ))}
                    </div>
                    </div>
                )}
            </div>

                {/* Mobile-only: Compact Bot Strip */}
                <div className="absolute top-[30%] left-0 right-0 flex lg:hidden justify-center gap-3 px-3 z-20 pointer-events-none">
                    {pokerPlayers.filter(p => p.isBot).map((bot, idx) => (
                        <div key={bot.id} className="flex flex-col items-center gap-1 opacity-80">
                            <div className="flex items-center gap-1">
                                <div className={cn(
                                    "w-5 h-5 rounded-full border flex items-center justify-center text-[7px] font-black",
                                    idx % 2 === 0
                                        ? "bg-cyan-400/20 border-cyan-400/40 text-cyan-400"
                                        : "bg-purple-400/20 border-purple-400/40 text-purple-400"
                                )}>
                                    {bot.name[0]}
                                </div>
                                <span className="text-[7px] font-black uppercase tracking-wider text-white/50">{bot.name}</span>
                            </div>
                            <div className="flex -space-x-4">
                                {bot.cards.map((c, ci) => (
                                    <PlayingCard key={ci} card={c} index={ci} faceUp={gameState === 'showdown' || gameState === 'payout'} small={true} />
                                ))}
                            </div>
                            {(gameState === 'showdown' || gameState === 'payout') && bot.cards.length > 0 && (
                                <span className="text-[6px] font-black uppercase tracking-wider text-yellow-500/70 whitespace-nowrap">
                                    {getBest4CardHand(bot.cards).description}
                                </span>
                            )}
                        </div>
                    ))}
                </div>

            {/* Bottom Controls & Player Area */}
            <div className="absolute bottom-1 lg:bottom-4 left-1/2 -translate-x-1/2 w-full max-w-[1400px] flex flex-col items-center gap-1 lg:flex-row lg:items-end lg:justify-center lg:gap-12 px-2 lg:px-4 z-30 pointer-events-none">
                
                {/* Left: Betting Area */}
                <div className="flex items-end gap-2 lg:gap-6 pointer-events-auto scale-[0.45] sm:scale-[0.7] lg:scale-[0.85] origin-bottom order-2 lg:order-1">
                    {/* Aces Up Box */}
                    <div 
                        onClick={() => handleBet('acesUp')}
                        className="relative flex flex-col items-center w-[75px] h-[90px] lg:w-[100px] lg:h-[120px] rounded-2xl border-2 border-dashed border-cyan-500/40 justify-center group cursor-pointer transition-all hover:border-cyan-500/70 hover:bg-cyan-500/5 bg-[#110f1a]/50"
                    >
                        <div className="absolute -top-3 bg-[#110f1a] px-2 font-black text-[6px] lg:text-[8px] uppercase tracking-widest text-cyan-400 group-hover:text-cyan-300">Aces Up</div>
                        {mainHuman?.acesUp ? (
                        <motion.div initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="flex flex-col items-center">
                            <div className="w-8 h-8 lg:w-12 lg:h-12 rounded-full bg-cyan-500 text-black flex items-center justify-center font-black text-[10px] lg:text-sm shadow-[0_0_20px_rgba(6,182,212,0.3)]">
                                {mainHuman.acesUp}
                            </div>
                        </motion.div>
                        ) : (
                            <Star size={18} className="text-cyan-500/10 group-hover:text-cyan-500/30 transition-colors" />
                        )}
                    </div>

                    {/* Ante Box */}
                    <div 
                        onClick={() => handleBet('ante')}
                        className="relative flex flex-col items-center w-[90px] h-[110px] lg:w-[120px] lg:h-[140px] rounded-3xl border-[3px] border-yellow-500/80 justify-center group cursor-pointer transition-all hover:border-yellow-400 shadow-[0_0_50px_rgba(234,179,8,0.05)] bg-yellow-500/5 hover:bg-yellow-500/10"
                    >
                        <div className="absolute -top-3.5 bg-[#110f1a] px-2 font-black text-[7px] lg:text-[9px] uppercase tracking-widest text-yellow-500">Main Ante</div>
                        {mainHuman?.ante ? (
                        <motion.div initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="bg-yellow-500 text-black rounded-full w-[45px] h-[45px] lg:w-[60px] lg:h-[60px] flex items-center justify-center font-black text-sm lg:text-xl shadow-[0_4px_25px_rgba(234,179,8,0.4)]">
                            {mainHuman.ante >= 1000 ? `$${(mainHuman.ante / 1000).toFixed(0)}k` : `$${mainHuman.ante}`}
                        </motion.div>
                        ) : (
                            <Trophy size={28} className="text-yellow-500/10 group-hover:text-yellow-500/30 transition-colors" />
                        )}
                    </div>

                    {/* Play Box */}
                    <div className={cn(
                        "relative flex flex-col items-center w-[75px] h-[90px] lg:w-[100px] lg:h-[120px] rounded-2xl border-2 border-dashed justify-center transition-all bg-[#110f1a]/50",
                        mainHuman?.play ? "border-white/50 bg-white/5" : "border-white/10"
                    )}>
                        <div className="absolute -top-3 bg-[#110f1a] px-2 font-black text-[6px] lg:text-[8px] uppercase tracking-widest text-white/30">Play</div>
                        {mainHuman?.play ? (
                        <motion.div initial={{ scale: 1.5 }} animate={{ scale: 1 }} className="flex flex-col items-center">
                            <div className="w-8 h-8 lg:w-12 lg:h-12 rounded-full bg-white text-black flex items-center justify-center font-black text-[10px] lg:text-sm shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                                {mainHuman.play}
                            </div>
                        </motion.div>
                        ) : (
                        <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-white/10 font-bold text-base">+</div>
                        )}
                    </div>
                </div>

                {/* Middle: Player Cards */}
                <div className="flex -space-x-10 sm:-space-x-12 lg:-space-x-14 perspective-1000 scale-[0.55] sm:scale-[0.8] lg:scale-[1] pointer-events-auto origin-bottom order-3 lg:order-2">
                    {mainHuman?.cards.length ? (
                        mainHuman.cards.map((c, i) => (
                        <div key={i} className="relative">
                            <PlayingCard 
                                card={c} 
                                index={i}
                                faceUp={true}
                                isPlayerCard={true}
                                onMount={audio.cardFlick}
                                onReveal={audio.cardReveal}
                                onThud={audio.cardThud}
                                winning={mainHuman.handResult?.cards.some(bc => bc.rank === c.rank && bc.suit === c.suit) && (gameState === 'showdown' || gameState === 'payout')}
                                royalPick={mainHuman.handResult && mainHuman.handResult.rank >= HandRank.Flush && i === 3}
                            />
                            {mainHuman.handResult && mainHuman.handResult.rank >= HandRank.Flush && i === 3 && (gameState === 'showdown' || gameState === 'payout') && (
                                <div className="absolute -top-4 -right-10 z-50 bg-cyan-400 text-black px-2.5 py-1 rounded-sm text-[9px] font-black uppercase tracking-[0.15em] rotate-12 shadow-[0_4px_15px_rgba(34,211,238,0.4)] border border-cyan-300">
                                    Royal Pick
                                </div>
                            )}
                        </div>
                        ))
                    ) : (
                        <div className="flex -space-x-4 lg:-space-x-8 opacity-5">
                            {[...Array(5)].map((_, i) => <div key={i} className="w-16 h-22 lg:w-24 lg:h-34 bg-white/5 rounded-xl border border-white/20" />)}
                        </div>
                    )}
                </div>

                {/* Right: Hand Info & Insight */}
                <div className="flex-shrink-0 mb-0 lg:mb-8 pointer-events-auto flex flex-col gap-1 lg:gap-2 min-w-0 lg:min-w-[100px] max-w-[250px] lg:max-w-[200px] order-1 lg:order-3 items-center lg:items-start">
                    <AnimatePresence>
                    {(gameState === 'decision' || gameState === 'showdown' || gameState === 'payout') && mainHuman?.cards.length && (
                        <motion.div 
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="flex flex-col items-start gap-1"
                        >
                            <span className="text-[8px] lg:text-[10px] font-black uppercase text-white/30 tracking-widest">Hand Strength</span>
                            <div className="px-3 py-1 lg:px-5 lg:py-2 rounded-lg bg-gradient-to-r from-[#2e2618] to-[#1a1625] border border-[#52442b]/50 shadow-xl">
                                <span className="text-[10px] lg:text-xs font-black uppercase tracking-[0.1em] text-yellow-500 whitespace-nowrap">
                                {mainHuman.handResult ? mainHuman.handResult.description : getBest4CardHand(mainHuman.cards).description}
                                </span>
                            </div>
                        </motion.div>
                    )}
                    </AnimatePresence>

                    {/* Live Insight Integrated - Hidden on mobile as it's now behind dealer cards */}
                    <div className="hidden lg:flex flex-col items-start gap-1 p-2 rounded-lg bg-white/5 border border-white/10">
                        <div className="px-2 py-0.5 rounded-full bg-white/5 text-[7px] lg:text-[8px] font-black uppercase text-white/20 tracking-tighter">Dealer Insight</div>
                        <p className="text-[9px] lg:text-[10px] text-white/40 italic leading-tight line-clamp-2">{getLiveInsight()}</p>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
}
