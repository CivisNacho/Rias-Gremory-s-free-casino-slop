import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  RotateCcw, 
  Undo, 
  ArrowLeft, 
  ChevronRight, 
  User, 
  Cpu, 
  ShieldCheck,
  Trophy,
  History,
  DollarSign,
  Settings,
  HelpCircle,
  Clock,
  Star,
  LayoutGrid,
  Award,
  Gamepad2,
  MessageSquare,
  X,
  Flag,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { cn, formatCurrency } from '../lib/utils';
import { 
  createDeck, 
  Card, 
  HandResult, 
  HandRank, 
  getBest4CardHand, 
  compareHands, 
  getAcesUpPayout, 
  getAnteBonusPayout,
  dealerQualifies
} from '../lib/pokerUtils';
import { RoulettePlayer } from '../lib/rouletteUtils';

// --- Constants ---
const CHIPS = [50, 100, 500];
const CHIP_COLORS = {
  50: 'bg-[#210934] border-[#4b1d7d] text-purple-200',
  100: 'bg-[#3b2a09] border-[#8e6616] text-yellow-500',
  500: 'bg-[#093234] border-[#166063] text-cyan-400'
};

const BOT_NAMES = ['Issei', 'Koneko', 'Kiba', 'Xenovia', 'Gaspar'];

// --- Audio Engine (Subtle synthesized sounds) ---
const usePokerAudio = () => {
    const audioCtx = useRef<AudioContext | null>(null);

    const init = useCallback(() => {
        if (!audioCtx.current) {
            audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtx.current.state === 'suspended') {
            audioCtx.current.resume();
        }
    }, []);

    const playTone = useCallback((freq: number, type: OscillatorType = 'sine', vol = 0.1, duration = 0.1, decay = true) => {
        if (!audioCtx.current) return;
        const osc = audioCtx.current.createOscillator();
        const gain = audioCtx.current.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.current.currentTime);
        
        gain.gain.setValueAtTime(vol, audioCtx.current.currentTime);
        if (decay) {
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + duration);
        } else {
            gain.gain.linearRampToValueAtTime(0, audioCtx.current.currentTime + duration);
        }
        
        osc.connect(gain);
        gain.connect(audioCtx.current.destination);
        
        osc.start();
        osc.stop(audioCtx.current.currentTime + duration);
    }, []);

    const playNoise = useCallback((duration: number, filterFreq: number, vol: number) => {
        if (!audioCtx.current) return;
        const bufferSize = audioCtx.current.sampleRate * duration;
        const buffer = audioCtx.current.createBuffer(1, bufferSize, audioCtx.current.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1; // White noise
        }
        
        const noise = audioCtx.current.createBufferSource();
        noise.buffer = buffer;
        
        const filter = audioCtx.current.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = filterFreq;
        
        const gain = audioCtx.current.createGain();
        gain.gain.setValueAtTime(vol, audioCtx.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + duration);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.current.destination);
        
        noise.start();
    }, []);

    const cardFlick = useCallback(() => {
        init();
        playNoise(0.12, 3000, 0.08); // Longer 'fshh' sliding sound
        playTone(200, 'sine', 0.03, 0.04); // very soft initial impact
    }, [init, playNoise, playTone]);

    const cardReveal = useCallback(() => {
        init();
        playNoise(0.06, 1800, 0.08); // lighter snap for start of flip
        playTone(700, 'sine', 0.01, 0.04, true);
    }, [init, playNoise, playTone]);

    const cardThud = useCallback(() => {
        init();
        // Layer 1: The felt impact (low end)
        playTone(90, 'triangle', 0.15, 0.1, true); 
        // Layer 2: The card edge (mid-high texture)
        playNoise(0.04, 600, 0.06); 
        // Layer 3: Subtle slap
        playTone(250, 'sine', 0.05, 0.05, true);
    }, [init, playNoise, playTone]);

    const chipPlace = useCallback(() => {
        init();
        playTone(300, 'square', 0.03, 0.05); // slightly harder attack
        setTimeout(() => playTone(500, 'triangle', 0.02, 0.05), 15);
    }, [init, playTone]);

    const winSound = useCallback(() => {
        init();
        [440, 554.37, 659.25, 880].forEach((f, i) => { // Added octave
            setTimeout(() => playTone(f, 'sine', 0.06, 0.4), i * 120);
        });
    }, [init, playTone]);

    const foldSound = useCallback(() => {
        init();
        playTone(80, 'sine', 0.1, 0.2); // lower thud
        playNoise(0.2, 500, 0.05); // soft slide away
    }, [init, playNoise, playTone]);

    return { cardFlick, cardReveal, cardThud, chipPlace, winSound, foldSound, init };
};

interface PokerPlayerState {
    id: string;
    name: string;
    isBot: boolean;
    cards: Card[];
    ante: number;
    play: number;
    acesUp: number;
    folded: boolean;
    result?: string;
    payout?: number;
    handResult?: HandResult;
    sessionProfit: number;
}

interface PokerGameProps {
    players: RoulettePlayer[];
    activePlayerId: string;
    setPlayers: React.Dispatch<React.SetStateAction<RoulettePlayer[]>>;
    setActivePlayerId: (id: string) => void;
    onAddPlayer: () => void;
    onExit: () => void;
}

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

// --- Sub-components ---

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

const PlayingCard = ({ 
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
                small ? "w-10 h-14 lg:w-14 lg:h-20" : "w-20 h-28 lg:w-32 lg:h-44",
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
                        <span className={cn("font-black tracking-tighter", small ? "text-[10px]" : "text-sm lg:text-2xl")}>{card?.rank}</span>
                        <span className={cn(small ? "text-[8px]" : "text-[10px] lg:text-sm")}>{card && SUIT_SYMBOL[card.suit]}</span>
                    </div>
                    
                    {royalPick && !small && (
                      <div className="absolute top-1 right-1 bg-cyan-400 text-[6px] lg:text-[8px] font-black text-black px-1 py-0.5 rounded-sm uppercase tracking-tighter shadow-sm">
                        Royal
                      </div>
                    )}

                    <div className={cn("flex justify-center grow items-center select-none leading-none", small ? "text-sm" : "text-2xl lg:text-5xl")}>
                       {card && SUIT_SYMBOL[card.suit]}
                    </div>

                    <div className="flex flex-col items-start leading-[0.8] rotate-180 p-0.5">
                        <span className={cn("font-black tracking-tighter", small ? "text-[10px]" : "text-sm lg:text-2xl")}>{card?.rank}</span>
                        <span className={cn(small ? "text-[8px]" : "text-[10px] lg:text-sm")}>{card && SUIT_SYMBOL[card.suit]}</span>
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

export const PokerGame = ({ players, activePlayerId, setPlayers, onExit }: PokerGameProps) => {
    const [gameState, setGameState] = useState<'betting' | 'dealing' | 'decision' | 'showdown' | 'payout'>('betting');
    const audio = usePokerAudio();
    const [dealerCards, setDealerCards] = useState<Card[]>([]);
    const [pokerPlayers, setPokerPlayers] = useState<PokerPlayerState[]>([]);
    const [selectedChip, setSelectedChip] = useState(100);
    const [history, setHistory] = useState<{rank: string, amount: number, time: string, status: 'WIN' | 'LOSS' | 'FOLD'}[]>([
      { rank: 'Flush (K-High)', amount: 6000, time: '14:22', status: 'WIN' },
      { rank: 'Two Pair', amount: -1000, time: '14:21', status: 'LOSS' },
      { rank: 'No Pair', amount: -500, time: '14:18', status: 'FOLD' },
    ]);
    const [events, setEvents] = useState<{ time: string, label: string, amount?: string, context: string, color?: string, muted?: boolean }[]>([
        { time: '14:22', label: 'Player placed', amount: '$1,000', context: 'Ante', color: 'text-yellow-500' },
        { time: '14:21', label: 'Dealer reveals', context: 'A high - Qualified', muted: true },
        { time: '14:18', label: 'New Hand Dealt', context: '5-Card Draw', muted: true },
    ]);

    const addEvent = useCallback((label: string, context: string, amount?: string, color?: string, muted?: boolean) => {
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setEvents(prev => [{ time, label, amount, context, color, muted }, ...prev].slice(0, 10));
    }, []);

    const activePlayer = useMemo(() => players.find(p => p.id === activePlayerId) || players[0], [players, activePlayerId]);

    // Initial setup for 4 players (human + bots)
    useEffect(() => {
        // Only initialize once or when the active human player changes
        setPokerPlayers(prev => {
            if (prev.length > 0 && prev.some(p => p.id === activePlayerId)) return prev;

            let currentPokerPlayers: PokerPlayerState[] = players.slice(0, 4).map(p => ({
                id: p.id,
                name: p.name,
                isBot: false,
                cards: [],
                ante: 0,
                play: 0,
                acesUp: 0,
                folded: false,
                sessionProfit: 0
            }));

            const botsNeeded = 4 - currentPokerPlayers.length;
            for (let i = 0; i < botsNeeded; i++) {
                currentPokerPlayers.push({
                    id: `bot-${i}`,
                    name: BOT_NAMES[i % BOT_NAMES.length],
                    isBot: true,
                    cards: [],
                    ante: 0,
                    play: 0,
                    acesUp: 0,
                    folded: false,
                    sessionProfit: 0
                });
            }
            return currentPokerPlayers;
        });
    }, [activePlayerId]);

    const handleBet = (type: 'ante' | 'acesUp', playerId: string = activePlayerId) => {
        if (gameState !== 'betting') return;
        
        const player = players.find(p => p.id === playerId);
        const pokerPlayer = pokerPlayers.find(p => p.id === playerId);
        
        if (!pokerPlayer) return;

        if (!pokerPlayer.isBot) {
            if (!player || player.balance < selectedChip) return;
            audio.chipPlace();
            setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, balance: p.balance - selectedChip } : p));
            if (playerId === activePlayerId) {
                addEvent('Player placed', type.charAt(0).toUpperCase() + type.slice(1), `$${selectedChip}`, 'text-cyan-400');
            }
        }

        setPokerPlayers(prev => prev.map(p => p.id === playerId ? { ...p, [type]: p[type] + selectedChip } : p));
    };

    const clearBets = () => {
        if (gameState !== 'betting') return;
        const pp = pokerPlayers.find(pp => pp.id === activePlayerId);
        if (!pp) return;
        
        setPlayers(prev => prev.map(p => p.id === activePlayerId ? { ...p, balance: p.balance + pp.ante + pp.acesUp } : p));
        setPokerPlayers(prev => prev.map(p => p.id === activePlayerId ? { ...p, ante: 0, acesUp: 0 } : p));
        addEvent('Player cleared', 'Bets returned', undefined, 'text-white/40', true);
    };

    const startDeal = () => {
        if (gameState !== 'betting') return;
        const mainPlayer = pokerPlayers.find(p => p.id === activePlayerId);
        if (!mainPlayer || mainPlayer.ante === 0) return;

        audio.init();
        // Auto-bet for bots
        setPokerPlayers(prev => prev.map(p => {
          if (p.isBot) {
            const ante = 100;
            const acesUp = Math.random() > 0.5 ? 100 : 0;
            return { ...p, ante, acesUp };
          }
          return p;
        }));

        const newDeck = createDeck();
        let pointer = 0;
        
        const updatedPlayers = pokerPlayers.map(p => {
            if (p.ante === 0 && !p.isBot) return p;
            const cards = newDeck.slice(pointer, pointer + 5);
            pointer += 5;
            return { ...p, cards };
        });

        const dCards = newDeck.slice(pointer, pointer + 5);

        setDealerCards(dCards);
        setPokerPlayers(updatedPlayers);
        setGameState('dealing');
        addEvent('New Hand', 'Dealing 5 cards to each player...', undefined, 'text-white/20', true);
        
        // Log bot bets
        updatedPlayers.filter(p => p.isBot && p.ante > 0).forEach(bot => {
            addEvent(`${bot.name} placed`, 'Ante', `$${bot.ante}`, 'text-white/30', true);
        });

        setTimeout(() => setGameState('decision'), 800);
    };

    const handleDecision = (choice: 'fold' | 'play1x' | 'play3x', playerId: string = activePlayerId) => {
        if (gameState !== 'decision') return;
        
        const currentPlayer = pokerPlayers.find(p => p.id === playerId);
        if (!currentPlayer || currentPlayer.folded || currentPlayer.play > 0) return;

        let playAmount = 0;
        if (choice !== 'fold') {
            const multiplier = choice === 'play1x' ? 1 : 3;
            playAmount = currentPlayer.ante * multiplier;
            
            if (!currentPlayer.isBot) {
                const playerBalance = players.find(p => p.id === playerId)?.balance || 0;
                if (playerBalance < playAmount) return;
                setPlayers(pPrev => pPrev.map(p => p.id === playerId ? { ...p, balance: p.balance - playAmount } : p));
                audio.chipPlace();
                addEvent('Player decided', choice === 'play1x' ? 'Play (1x)' : 'Play (3x)', `$${playAmount}`, 'text-yellow-500');
            }
        } else {
            if (playerId === activePlayerId) {
                audio.foldSound();
                addEvent('Player folded', 'Hand Aborted', undefined, 'text-white/40', true);
                setHistory(h => [{ rank: 'Folded', amount: -currentPlayer.ante, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status: 'FOLD' as const }, ...h].slice(0, 5));
            }
        }

        setPokerPlayers(prev => {
            const next = [...prev];
            const pIdx = next.findIndex(p => p.id === playerId);
            if (pIdx === -1) return prev;

            if (choice === 'fold') {
                next[pIdx].folded = true;
            } else {
                next[pIdx].play = playAmount;
            }

            const allActed = next.every(p => p.ante === 0 || p.folded || p.play > 0);
            if (allActed) {
                setTimeout(() => setGameState('showdown'), 500);
            }
            return next;
        });
    };

    // Bot implementation (Synthesized logic)
    useEffect(() => {
        if (gameState === 'decision') {
            const botsToAct = pokerPlayers.filter(p => p.isBot && p.ante > 0 && !p.folded && p.play === 0);
            if (botsToAct.length > 0) {
                const timer = setTimeout(() => {
                    const bot = botsToAct[0];
                    const best = getBest4CardHand(bot.cards);
                    let choice: 'fold' | 'play1x' | 'play3x' = 'fold';
                    if (best.rank > HandRank.Pair) choice = 'play3x';
                    else if (best.rank === HandRank.Pair) {
                      const val = best.cards[0].rank === 'A' ? 14 : parseInt(best.cards[0].rank || '0');
                      if (val >= 12) choice = 'play3x';
                      else if (val >= 4) choice = 'play1x';
                    } else if (best.cards[0].rank === 'A' || best.cards[0].rank === 'K') {
                      choice = 'play1x';
                    }
                    handleDecision(choice, bot.id);
                }, 1000 + Math.random() * 1000);
                return () => clearTimeout(timer);
            }
        }
    }, [gameState, pokerPlayers]);

    // Showdown logic
    useEffect(() => {
        if (gameState === 'showdown') {
            const dealerBest = getBest4CardHand(dealerCards);
            const qualifies = dealerQualifies(dealerBest);
            
            addEvent('Dealer reveals', dealerBest.description, qualifies ? '- Qualified' : '- Not Qualify', 'text-white/40');
            
            const results = pokerPlayers.map(p => {
                if (p.ante === 0 || p.folded) return p;
                
                const pBest = getBest4CardHand(p.cards);
                const pWon = compareHands(pBest, dealerBest) >= 0;
                
                let winnings = 0;
                let resultText = "Lost";

                const acesUpMultiplier = getAcesUpPayout(pBest.rank, pBest.cards);
                if (acesUpMultiplier > 0) winnings += p.acesUp * (acesUpMultiplier + 1);

                if (!qualifies) {
                  winnings += p.ante * 2;
                  winnings += p.play;
                  resultText = "Dealer No Qualify";
                } else {
                  if (pWon) {
                    winnings += p.ante * 2;
                    winnings += p.play * 2;
                    resultText = "Won!";
                  }
                }
                
                const anteBonus = getAnteBonusPayout(pBest.rank);
                if (anteBonus > 0) winnings += p.ante * anteBonus;

                const roundCost = p.ante + (p.play || 0) + p.acesUp;
                const roundProfit = winnings - roundCost;

                if (!p.isBot) {
                    setPlayers(prev => prev.map(player => player.id === p.id ? { ...player, balance: player.balance + winnings } : player));
                    if (winnings > 0) {
                      audio.winSound();
                      confetti({
                        particleCount: 150,
                        spread: 80,
                        origin: { y: 0.7 },
                        colors: ['#facc15', '#22d3ee', '#ffffff', '#9333ea']
                      });
                      setHistory(h => [{ rank: pBest.description, amount: winnings, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status: 'WIN' as const }, ...h].slice(0, 5));
                      addEvent('Round Resolved', pBest.description, `+$${winnings}`, 'text-yellow-500');
                    } else {
                      setHistory(h => [{ rank: pBest.description, amount: -(p.ante + (p.play || 0)), time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), status: 'LOSS' as const }, ...h].slice(0, 5));
                      addEvent('Round Resolved', pBest.description, `-$${Math.abs(p.ante + (p.play || 0))}`, 'text-red-400');
                    }
                }

                return { ...p, payout: winnings, result: resultText, handResult: pBest, sessionProfit: p.sessionProfit + roundProfit };
            });

            setPokerPlayers(results);
            setTimeout(() => setGameState('payout'), 3000);
        }
    }, [gameState]);

    const resetGame = () => {
        setGameState('betting');
        setPokerPlayers(prev => prev.map(p => ({ ...p, cards: [], ante: 0, play: 0, acesUp: 0, folded: false, result: undefined, payout: undefined, handResult: undefined })));
        setDealerCards([]);
    };

    const mainHuman = pokerPlayers.find(p => p.id === activePlayerId);
    const totalAction = (mainHuman?.ante || 0) + (mainHuman?.play || 0) + (mainHuman?.acesUp || 0);

    const getLiveInsight = () => {
      if (!mainHuman || mainHuman.cards.length === 0) return "Place your bets to start the duel. The Dealer needs King high to qualify.";
      const best = getBest4CardHand(mainHuman.cards);
      if (best.rank >= HandRank.Pair) return `You have a ${best.description}. This is a solid hand to challenge the Dealer.`;
      if (best.cards[0].rank === 'A' || best.cards[0].rank === 'K') return "You have high cards. The Dealer might not qualify, consider playing!";
      return "Your hand is weak. But remember, the Dealer must at least have King high to dual you.";
    };

    return (
        <div className="flex-1 flex flex-col bg-[#0b0b14] h-screen overflow-hidden text-slate-100 font-sans selection:bg-cyan-400 selection:text-black">
            <div className="flex-1 flex overflow-hidden">
                {/* Main Table Area */}
                <main className="flex-1 relative flex flex-col min-w-0 bg-[#0d0912]">
                    {/* Felt Texture & Vignette */}
                    <div className="absolute inset-0 z-0">
                      <div className="absolute inset-0 bg-[#161320]" />
                      <div className="absolute inset-0 opacity-[0.03] bg-[url('https://www.transparenttextures.com/patterns/felt.png')]" />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/10 via-transparent to-transparent" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0912] via-transparent to-[#0d0912] opacity-80" />
                    </div>

                    <div className="relative z-10 flex-1 flex flex-col items-center justify-between py-2 lg:py-6 overflow-hidden">
                      
                      {/* Opponents Area - Absolute positioned for minimal impact on layout flow */}
                      <div className="absolute top-[10%] left-4 lg:left-8 flex flex-col gap-6 scale-[0.4] sm:scale-[0.5] lg:scale-[0.65] origin-left opacity-30 pointer-events-none">
                         {pokerPlayers.filter(p => p.isBot).slice(0, 2).map((bot, idx) => (
                           <div key={idx} className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-cyan-400/20 border border-cyan-400/40 flex items-center justify-center text-[10px] font-black text-cyan-400">
                                  {bot.name[0]}
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{bot.name}</span>
                              </div>
                              <div className="flex -space-x-8">
                                {bot.cards.map((c, ci) => (
                                  <PlayingCard key={ci} card={c} index={ci} faceUp={gameState === 'showdown' || gameState === 'payout'} small={true} />
                                ))}
                              </div>
                           </div>
                         ))}
                      </div>

                      <div className="absolute top-[10%] right-4 lg:right-8 flex flex-col gap-6 scale-[0.4] sm:scale-[0.5] lg:scale-[0.65] origin-right opacity-30 pointer-events-none">
                         {pokerPlayers.filter(p => p.isBot).slice(2, 4).map((bot, idx) => (
                           <div key={idx} className="flex flex-col gap-2 items-end">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/60">{bot.name}</span>
                                <div className="w-8 h-8 rounded-full bg-purple-400/20 border border-purple-400/40 flex items-center justify-center text-[10px] font-black text-purple-400">
                                  {bot.name[0]}
                                </div>
                              </div>
                              <div className="flex -space-x-8">
                                {bot.cards.map((c, ci) => (
                                  <PlayingCard key={ci} card={c} index={ci} faceUp={gameState === 'showdown' || gameState === 'payout'} small={true} />
                                ))}
                              </div>
                           </div>
                         ))}
                      </div>

                      {/* Dealer Area - Compacted */}
                      <div className="flex flex-col items-center gap-2 lg:gap-4 shrink-0">
                        <div className="flex -space-x-12 lg:-space-x-16 perspective-1000 scale-[0.6] sm:scale-[0.8] lg:scale-100">
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
                              {[...Array(5)].map((_, j) => <div key={j} className="w-20 h-28 lg:w-32 lg:h-44 bg-white/5 rounded-2xl border border-white/20" />)}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Active Betting Zones & Human Player - Distributed vertically */}
                      <div className="flex flex-col items-center w-full grow justify-center gap-4 lg:gap-12">
                        <div className="grid grid-cols-3 gap-6 lg:gap-12 items-end scale-[0.7] sm:scale-[0.85] lg:scale-100">
                          
                          {/* Aces Up Box */}
                          <div 
                            onClick={() => handleBet('acesUp')}
                            className="relative flex flex-col items-center w-[75px] h-[90px] lg:w-[110px] lg:h-[130px] rounded-2xl border-2 border-dashed border-cyan-500/40 justify-center group cursor-pointer transition-all hover:border-cyan-500/70 hover:bg-cyan-500/5"
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
                            className="relative flex flex-col items-center w-[90px] h-[110px] lg:w-[130px] lg:h-[150px] rounded-3xl border-[3px] border-yellow-500/80 justify-center group cursor-pointer transition-all hover:border-yellow-400 shadow-[0_0_50px_rgba(234,179,8,0.05)] bg-yellow-500/5 hover:bg-yellow-500/10"
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
                            "relative flex flex-col items-center w-[75px] h-[90px] lg:w-[110px] lg:h-[130px] rounded-2xl border-2 border-dashed justify-center transition-all",
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

                        {/* Player Hand Area - Compacted */}
                        <div className="flex flex-col items-center gap-4 relative shrink-0">
                          <div className="flex -space-x-12 sm:-space-x-14 lg:-space-x-16 perspective-1000 scale-[0.6] sm:scale-[0.85] lg:scale-100">
                            {mainHuman?.cards.length ? (
                              mainHuman.cards.map((c, i) => (
                                <div key={i} className="relative">
                                    <PlayingCard 
                                      card={c} 
                                      index={i}
                                      faceUp={true} // Player cards are always dealt face up, animating a flip during travel
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
                                {[...Array(5)].map((_, i) => <div key={i} className="w-20 h-28 lg:w-32 lg:h-44 bg-white/5 rounded-xl border border-white/20" />)}
                              </div>
                            )}
                          </div>
                          
                          <AnimatePresence>
                            {(gameState === 'decision' || gameState === 'showdown' || gameState === 'payout') && mainHuman?.cards.length && (
                              <motion.div 
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                className="flex items-center gap-4 mt-4"
                              >
                                 <span className="text-[10px] font-black uppercase text-white/40 tracking-wider">Your Hand:</span>
                                 <div className="px-4 py-1 lg:px-6 lg:py-2 rounded-xl bg-[#2e2618] border border-[#52442b] shadow-xl">
                                     <span className="text-[11px] lg:text-sm font-black uppercase tracking-[0.1em] text-yellow-500">
                                       {mainHuman.handResult ? mainHuman.handResult.description : getBest4CardHand(mainHuman.cards).description}
                                     </span>
                                 </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <footer className="h-28 lg:h-32 bg-[#121016]/98 backdrop-blur-2xl border-t border-white/10 flex items-center justify-between px-6 lg:px-12 z-50 relative shadow-[0_-20px_50px_rgba(0,0,0,0.8)]">
                        <div className="flex items-center gap-6 shrink-0 h-full">
                           <button 
                             onClick={onExit} 
                             className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center transition-all group border border-white/5 hover:border-red-500/30"
                           >
                              <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                           </button>

                           <div className="flex flex-col h-14 w-px bg-white/10 mx-2 hidden lg:block" />

                           <div className="flex flex-col justify-center">
                              <span className="text-[10px] text-white/30 uppercase font-black tracking-widest leading-none mb-1.5">Bankroll</span>
                              <div className="flex items-baseline gap-1">
                                <span className="text-xs font-black text-secondary/60">$</span>
                                <motion.span 
                                  key={activePlayer.balance}
                                  initial={{ y: 10, opacity: 0 }}
                                  animate={{ y: 0, opacity: 1 }}
                                  className="text-2xl lg:text-3xl font-black text-secondary tracking-tighter"
                                >
                                  {activePlayer.balance.toLocaleString()}
                                </motion.span>
                              </div>
                           </div>

                           <div className="flex flex-col justify-center">
                             <span className="text-[10px] text-white/30 uppercase font-black tracking-widest leading-none mb-1.5">Table Bet</span>
                             <div className="flex items-baseline gap-1">
                               <span className="text-xs font-black text-white/40">$</span>
                               <motion.span 
                                 key={totalAction}
                                 initial={{ y: 10, opacity: 0 }}
                                 animate={{ y: 0, opacity: 1 }}
                                 className="text-2xl lg:text-3xl font-black text-white tracking-tighter"
                               >
                                 {totalAction.toLocaleString()}
                               </motion.span>
                             </div>
                           </div>
                        </div>

                        <div className="flex items-center gap-3 lg:gap-4 absolute left-1/2 -translate-x-1/2 scale-[0.8] sm:scale-100 z-10 transition-transform">
                          <AnimatePresence mode="wait">
                            {gameState === 'betting' ? (
                              <motion.div 
                                initial={{ y: 40, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -40, opacity: 0 }}
                                className="flex items-center gap-3"
                              >
                                <motion.button 
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={startDeal}
                                  className="h-12 lg:h-14 px-12 lg:px-16 bg-cyan-400 text-black rounded-lg font-black uppercase tracking-widest text-xs transition-all shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                                >
                                  Deal Cards
                                </motion.button>
                              </motion.div>
                            ) : gameState === 'decision' ? (
                              <motion.div 
                                initial={{ y: 40, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -40, opacity: 0 }}
                                className="flex items-center gap-3"
                              >
                                {mainHuman && !mainHuman.folded && mainHuman.play === 0 && (
                                  <>
                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleDecision('fold')} className="px-8 lg:px-12 h-12 lg:h-14 bg-[#211d27] hover:bg-[#2b2533] text-white/70 rounded-lg font-black uppercase tracking-widest text-xs transition-colors">Fold</motion.button>
                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleDecision('play1x')} className="px-8 lg:px-12 h-12 lg:h-14 bg-cyan-400 hover:bg-cyan-300 text-black rounded-lg font-black uppercase tracking-widest text-xs shadow-md transition-colors">Play (1x)</motion.button>
                                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => handleDecision('play3x')} className="px-8 lg:px-12 h-12 lg:h-14 bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg font-black uppercase tracking-widest text-xs shadow-md transition-colors">Play (3x)</motion.button>
                                  </>
                                )}
                              </motion.div>
                            ) : gameState === 'payout' ? (
                               <motion.button 
                                 initial={{ scale: 0.5, opacity: 0 }}
                                 animate={{ scale: 1, opacity: 1 }}
                                 whileHover={{ scale: 1.05 }}
                                 whileTap={{ scale: 0.95 }}
                                 onClick={resetGame}
                                 className="h-12 lg:h-14 px-16 bg-yellow-500 text-black rounded-lg font-black uppercase tracking-widest text-xs transition-colors shadow-lg"
                               >
                                 Next Hand
                               </motion.button>
                            ) : null}
                          </AnimatePresence>
                        </div>

                        <div className="flex items-center gap-3">
                          <button onClick={clearBets} className="w-10 h-10 rounded-xl mr-2 text-white/30 hover:text-white/60 transition-colors flex items-center justify-center">
                              <RotateCcw size={16} />
                          </button>
                          {CHIPS.map(c => (
                            <motion.button 
                              key={c}
                              whileHover={{ scale: 1.1, y: -2 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => setSelectedChip(c)}
                              className={cn(
                                "w-12 h-12 lg:w-14 lg:h-14 rounded-2xl border flex items-center justify-center font-black transition-all transform",
                                CHIP_COLORS[c as keyof typeof CHIP_COLORS],
                                selectedChip === c ? "scale-110 ring-2 ring-white/10 z-10" : "opacity-60"
                              )}
                            >
                              <span className="text-xs font-bold drop-shadow-sm select-none">{c}</span>
                            </motion.button>
                          ))}
                        </div>
                    </footer>
                </main>

                {/* Right Host Sidebar */}
                <aside className="w-[340px] border-l border-[#1f1a27] bg-[#121016] flex flex-col hidden xl:flex relative z-50 overflow-hidden">
                    <div className="h-[380px] relative shrink-0">
                       <img 
                          src="https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/images/akeno_sidebar.jpg" 
                          onError={(e) => { e.currentTarget.src = "https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/images/akeno_poker_vip.jpg" }}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                       />
                       {/* Ethereal Gradient Overlay */}
                       <div className="absolute inset-0 bg-gradient-to-t from-[#121016] via-[#121016]/20 to-transparent" />
                       <div className="absolute inset-0 bg-gradient-to-r from-[#121016]/40 via-transparent to-transparent" />
                       
                       <div className="absolute bottom-6 left-6 right-6">
                         <div className="bg-[#4b1d7d] text-white w-fit px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest mb-2 shadow-lg border border-[#6d28d9]/30">Elite VIP Hostess</div>
                         <h3 className="text-4xl font-black tracking-tighter leading-[0.85] text-white drop-shadow-2xl">Akeno<br/><span className="text-[#a78bfa]">Himejima</span></h3>
                         <div className="flex items-center gap-2 mt-4 text-[9px] font-black uppercase tracking-widest text-[#22d3ee]">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)] animate-pulse" />
                            Currently Attending You
                         </div>
                       </div>
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar pb-6 px-6 relative">
                      {/* Game Track */}
                      <div className="mt-6 space-y-4">
                         <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#22d3ee]">Game Track</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-white/30">Session Live</span>
                         </div>
                         <div className="space-y-4 relative before:absolute before:inset-0 before:ml-12 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-white/5 before:to-transparent">
                            {events.map((evt, j) => (
                              <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                key={j} 
                                className="relative flex items-center justify-between group"
                              >
                                 <span className="text-[10px] font-mono text-white/30 w-10 shrink-0">{evt.time}</span>
                                 <div className={cn(
                                    "w-1.5 h-1.5 rounded-full shrink-0 z-10 mx-4 transition-all duration-300",
                                    j === 0 ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,1)]" : "bg-white/20"
                                 )} />
                                 <div className="flex-1 text-[11px] text-white/70">
                                     <span className={cn(evt.muted ? "opacity-60" : "font-medium")}>
                                        {evt.label} {evt.amount && <strong className={cn("font-black", evt.color)}>{evt.amount}</strong>} {evt.context}
                                     </span>
                                 </div>
                              </motion.div>
                            ))}
                         </div>
                      </div>

                      {/* Betting History */}
                      <div className="mt-10 space-y-4">
                         <div className="flex items-center justify-between border-b border-white/5 pb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Betting History</span>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-white/30 cursor-pointer hover:text-white transition-colors">View All</span>
                         </div>
                         
                         <div className="space-y-3">
                            {history.map((h, i) => (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    key={i} 
                                    className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center justify-between transition-colors hover:bg-white/[0.04]"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-lg",
                                            h.status === 'WIN' ? "border-yellow-500/30 bg-yellow-500/10" : 
                                            h.status === 'LOSS' ? "border-red-500/20 bg-red-500/5" : "border-white/10 bg-white/5"
                                        )}>
                                            {h.status === 'WIN' ? <Award size={18} className="text-yellow-500" /> : 
                                             h.status === 'LOSS' ? <X size={18} className="text-red-400" /> : 
                                             <Flag size={18} className="text-white/40" />}
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-sm font-black text-white/90 tracking-tight">{h.rank}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] text-white/30 font-black uppercase tracking-widest whitespace-nowrap">BET: ${Math.abs(h.amount)}</span>
                                                <span className={cn("text-[9px] font-black uppercase tracking-widest", h.status === 'WIN' ? "text-yellow-500" : (h.status === 'LOSS' ? "text-red-400" : "text-white/30"))}>{h.status}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className={cn("font-black text-base tracking-tighter", h.status === 'WIN' ? "text-yellow-500" : "text-white/60")}>
                                        {h.status === 'WIN' ? '+' : '-'}${Math.abs(h.amount).toLocaleString()}
                                    </span>
                                </motion.div>
                            ))}
                         </div>
                      </div>
                    </div>

                    <div className="p-6 border-t border-white/5 bg-[#0d0a10] flex items-center gap-4 shrink-0">
                       <div className="flex items-center gap-2">
                          <img 
                            src="https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/images/akeno_poker_vip.jpg" 
                            className="w-10 h-10 rounded-xl object-cover border border-[#4b1d7d]/50" 
                          />
                          <div className="w-8 h-8 rounded-lg bg-[#4b1d7d] flex items-center justify-center shadow-lg shadow-purple-900/20">
                             <Zap size={14} className="text-white fill-white" />
                          </div>
                       </div>
                       <p className="text-[10px] text-white/40 italic flex-1 leading-tight font-medium">"Every hand is a lesson in destiny. Play with precision."</p>
                    </div>
                </aside>
            </div>
        </div>
    );
};
