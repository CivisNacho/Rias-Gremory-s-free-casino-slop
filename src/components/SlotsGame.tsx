import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Play, 
  RotateCcw, 
  ArrowLeft, 
  Plus, 
  Minus,
  Users, 
  Zap, 
  Coins, 
  Gem, 
  Dices, 
  Flame, 
  Star, 
  Medal, 
  Settings, 
  Wallet,
  Trophy,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Download
} from 'lucide-react';
import { motion, AnimatePresence, useAnimation } from 'motion/react';
import { cn, formatCurrency } from '../lib/utils';
import confetti from 'canvas-confetti';
import { RoulettePlayer } from '../lib/rouletteUtils';

// --- Constants ---

const SYMBOLS = [
  { id: 'diamond', name: 'Diamond', icon: Gem, color: '#00daf3', value: 50 },
  { id: 'dice', name: 'Dice', icon: Dices, color: '#a855f7', value: 20 },
  { id: 'flame', name: 'Flame', icon: Flame, color: '#f97316', value: 15 },
  { id: 'star', name: 'Star', icon: Star, color: '#e9c349', value: 30 },
  { id: 'medal', name: 'Medal', icon: Medal, color: '#c0c0c0', value: 100 },
];

const BONUS_OBJECTS = [
  { id: 'fire', icon: '🔥', label: 'Fire' },
  { id: 'diamond', icon: '💎', label: 'Diamond' },
  { id: 'rocket', icon: '🚀', label: 'Rocket' },
  { id: 'skull', icon: '💀', label: 'Shadow' },
  { id: 'clover', icon: '🍀', label: 'Luck' },
];

const GRID_ROWS = 3;
const GRID_COLS = 5;

// --- Audio Engine ---
const useSlotsAudio = () => {
    const audioCtx = useRef<AudioContext | null>(null);

    const init = useCallback(() => {
        if (!audioCtx.current) {
            audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtx.current.state === 'suspended') {
            audioCtx.current.resume();
        }
    }, []);

    const playTone = useCallback((freq: number, type: OscillatorType, duration: number, vol: number) => {
        if (!audioCtx.current) return;
        const osc = audioCtx.current.createOscillator();
        const gain = audioCtx.current.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.current.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.current.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.current.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.current.destination);
        osc.start();
        osc.stop(audioCtx.current.currentTime + duration);
    }, []);

    const playTick = useCallback(() => {
        playTone(600, 'square', 0.05, 0.01);
    }, [playTone]);

    const playThud = useCallback(() => {
        if (!audioCtx.current) return;
        const ctx = audioCtx.current;
        
        // Sub-kick layer
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(150, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.2);
        gain1.gain.setValueAtTime(0.6, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        
        // Metallic "clack" layer
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(800, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.05);
        gain2.gain.setValueAtTime(0.1, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);

        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        
        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.2);
        osc2.stop(ctx.currentTime + 0.2);
    }, []);

    const playWinChime = useCallback(() => {
        if (!audioCtx.current) return;
        [440, 554, 659, 880, 1108].forEach((freq, i) => {
            setTimeout(() => {
                playTone(freq, 'sine', 0.6, i === 4 ? 0.3 : 0.1);
            }, i * 150);
        });
    }, [playTone]);

    return useMemo(() => ({ init, playTick, playThud, playWinChime }), [init, playTick, playThud, playWinChime]);
};

// --- 3D Reel Component ---
const Reel3D = ({ isSpinning, symbols, activeCombos, winningRows }: { isSpinning: boolean, symbols: any[], activeCombos: any[], winningRows: number[] }) => {
    const controls = useAnimation();
    const [faces, setFaces] = useState<any[]>(() => {
        const arr = Array(10).fill(null).map(()=> SYMBOLS[Math.floor(Math.random()*SYMBOLS.length)]);
        if (symbols && symbols.length === 3) {
            arr[9] = symbols[0];
            arr[0] = symbols[1];
            arr[1] = symbols[2];
        }
        return arr;
    });

    useEffect(() => {
        if (isSpinning) {
            controls.set({ filter: 'blur(8px)', opacity: 0.8 });
            controls.start({
                rotateX: [0, -360],
                transition: { repeat: Infinity, duration: 0.15, ease: 'linear' }
            });
        } else {
            setFaces(prev => {
                const next = [...prev];
                if (symbols && symbols.length === 3) {
                    next[9] = symbols[0]; // Top
                    next[0] = symbols[1]; // Mid
                    next[1] = symbols[2]; // Bot
                }
                return next;
            });
            
            // Critical: Remove blur immediately on stop for clarity
            controls.set({ filter: 'blur(0px)', opacity: 1 });
            controls.start({
                rotateX: [-36, 0], // Instantly lock, travel only 1 face for a "hard stop"
                transition: { 
                    type: 'spring', 
                    damping: 20, 
                    stiffness: 400, 
                    mass: 0.5,
                    restDelta: 0.001
                }
            });
        }
    }, [isSpinning, symbols, controls]);

    return (
        <div className="h-full w-full relative flex items-center justify-center pointer-events-none" style={{ perspective: '1200px' }}>
            <motion.div
                animate={controls}
                style={{ transformStyle: 'preserve-3d' }}
                className="absolute w-full h-[80px]"
            >
                {faces.map((sym, i) => {
                    // Row 0 is Top (face 9), Row 1 is Mid (face 0), Row 2 is Bot (face 1) based on rotation [-36, 0] ending on 0
                    const isWinningFace = activeCombos.length > 0 && ((i === 9 && winningRows.includes(0)) || (i === 0 && winningRows.includes(1)) || (i === 1 && winningRows.includes(2)));

                    return (
                        <div
                            key={i}
                            className="absolute left-0 right-0 h-[80px] flex items-center justify-center transition-all duration-700"
                            style={{ 
                                transform: `rotateX(${i * 36}deg) translateZ(${isWinningFace ? 145 : 123}px)`, 
                                backfaceVisibility: 'hidden',
                                zIndex: isWinningFace ? 40 : 10
                            }}
                        >
                            <div className={cn(
                                "w-[70px] h-[70px] lg:w-[80px] lg:h-[80px] rounded-full flex items-center justify-center relative backdrop-blur-md transition-all duration-500",
                                isWinningFace 
                                    ? "bg-gradient-to-br from-yellow-300/30 to-red-600/60 border-2 border-[#facc15] shadow-[0_0_40px_rgba(250,204,21,0.6),inset_0_0_20px_rgba(255,0,0,0.8)] scale-110" 
                                    : "bg-gradient-to-br from-white/10 to-transparent border border-white/15 shadow-[inset_0_4px_15px_rgba(255,255,255,0.15)] bg-black/60"
                            )}>
                                {/* Glowing Ring Indicator */}
                                {isWinningFace && (
                                    <div className="absolute inset-[-4px] rounded-full border-2 border-white/80 animate-ping opacity-60 pointer-events-none" />
                                )}
                                
                                <sym.icon 
                                    className={cn(
                                        "relative z-10 transition-all duration-500 w-8 h-8 lg:w-10 lg:h-10",
                                        isWinningFace ? "scale-125 drop-shadow-[0_0_25px_rgba(255,255,255,0.9)] animate-pulse" : "drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                                    )} 
                                    style={{ color: sym.color }} 
                                />
                            </div>
                        </div>
                    );
                })}
            </motion.div>
        </div>
    )
};

// --- Sub-Components ---

const PlayerCard = ({ 
    player, 
    isActive, 
    isChampion, 
    charm, 
    onSelectCharm, 
    occupiedCharms,
    lastIndividualWin,
    isRight = false 
}: { 
    player: RoulettePlayer; 
    isActive: boolean; 
    isChampion: boolean; 
    charm?: string;
    onSelectCharm: (id: string) => void;
    occupiedCharms: string[];
    lastIndividualWin: number;
    isRight?: boolean;
}) => {
  return (
    <div className={cn(
      "relative p-4 rounded-xl border transition-all duration-300",
      isActive 
        ? "bg-gradient-to-br from-secondary/20 to-secondary/5 border-secondary shadow-[0_0_20px_rgba(233,195,73,0.1)] scale-105 z-10" 
        : "bg-black/40 border-white/5 opacity-60 hover:opacity-100"
    )}>
      {isChampion && (
        <div className="absolute -top-3 -right-3 z-20 bg-secondary text-black p-1.5 rounded-lg rotate-12 shadow-xl">
            <Trophy size={14} fill="currentColor" />
        </div>
      )}

      <div className={cn("flex items-center gap-3 mb-4", isRight ? "flex-row-reverse" : "flex-row")}>
         <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center border border-white/10 overflow-hidden relative group">
            <div className="absolute inset-0 transition-transform group-hover:scale-110" style={{ backgroundColor: player.color }} />
            <Users size={20} className="relative z-10 text-white shadow-sm" />
         </div>
         <div className={cn("flex-1", isRight ? "text-right" : "text-left")}>
            <p className="text-[10px] font-black text-white/30 uppercase tracking-tighter">
                {isActive ? "Last Active" : "Group Entry"}
            </p>
            <h4 className="text-sm font-black text-white tracking-tight">{player.name}</h4>
         </div>
      </div>

      <div className="space-y-4">
        {/* Charm Selection */}
        <div className="flex gap-1 justify-center bg-black/40 p-1.5 rounded-lg border border-white/5">
            {BONUS_OBJECTS.map(obj => (
                <button
                    key={obj.id}
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelectCharm(obj.id);
                    }}
                    disabled={occupiedCharms.includes(obj.id) && charm !== obj.id}
                    className={cn(
                        "w-7 h-7 flex items-center justify-center rounded-md transition-all text-sm",
                        charm === obj.id 
                            ? "bg-secondary text-black scale-110 shadow-lg" 
                            : occupiedCharms.includes(obj.id) 
                                ? "opacity-10 grayscale cursor-not-allowed" 
                                : "hover:bg-white/10 grayscale hover:grayscale-0 opacity-40 hover:opacity-100"
                    )}
                >
                    {obj.icon}
                </button>
            ))}
        </div>

        <div>
           <p className="text-[10px] text-white/30 uppercase font-black mb-1">Balance</p>
           <p className="text-xl font-lobster font-black text-secondary">{formatCurrency(player.balance)}</p>
        </div>
        
        <div className="flex justify-between items-end gap-2">
          <div className="flex-1">
             <p className="text-[10px] text-white/30 uppercase font-black mb-1">Charm Power</p>
             <p className="text-sm font-black text-white">{charm ? BONUS_OBJECTS.find(o => o.id === charm)?.label : "None"}</p>
          </div>
          <div className="text-right">
             <p className="text-[10px] text-white/30 uppercase font-black mb-1">Current Win</p>
             <AnimatePresence mode="wait">
                 <motion.p 
                    key={lastIndividualWin}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={cn("text-sm font-black", lastIndividualWin > 0 ? "text-emerald-400" : "text-white/20")}
                 >
                    {lastIndividualWin > 0 ? `+${formatCurrency(lastIndividualWin)}` : "$0"}
                 </motion.p>
             </AnimatePresence>
          </div>
        </div>
      </div>

      {isActive && (
        <div className={cn("absolute top-1/2 -translate-y-1/2 w-1 h-32 bg-secondary rounded-full shadow-[0_0_15px_rgba(233,195,73,0.5)]", isRight ? "-right-0.5" : "-left-0.5")} />
      )}
    </div>
  );
};

let playersCount = 1;

export function SlotsGame({ players, activePlayerId, setPlayers, setActivePlayerId, onAddPlayer, onExit }: any) {
    playersCount = 1;
    const activePlayer = players.find((p: any) => p.id === activePlayerId) || players[0];
    const [selectedBet, setSelectedBet] = useState(250);
    const [isAllInMode, setIsAllInMode] = useState(false);
    const isMaxBet = isAllInMode || selectedBet >= 1000;
    const [progressiveJackpot, setProgressiveJackpot] = useState(4289150);
    const [reelStatus, setReelStatus] = useState<'idle' | 'spinning' | 'stopped'>('idle');
    const [luckLevel, setLuckLevel] = useState<'normal' | 'lucky' | 'luckiest'>('normal');
    const [luckDuration, setLuckDuration] = useState(0);
    const [grid, setGrid] = useState<any[][]>([]);
    const [lastWin, setLastWin] = useState(0);
    const [winMessage, setWinMessage] = useState("");
    const [sessionStats, setSessionStats] = useState({ totalBets: 3450, rounds: 142 });
    const [playerCharms, setPlayerCharms] = useState<Record<string, string>>({});
    const [playerWins, setPlayerWins] = useState<Record<string, number>>({});

    const [isAutoSpinning, setIsAutoSpinning] = useState(false);
    const [spinningReels, setSpinningReels] = useState<boolean[]>([false, false, false, false, false]);
    const [comboCues, setComboCues] = useState<{ id: string, name: string, count: number, multiplier: number, color: string }[]>([]);
    const [winningCoordinates, setWinningCoordinates] = useState<Set<string>>(new Set());
    const [charmEffect, setCharmEffect] = useState<{ active: boolean, playerName: string, charmLabel: string } | null>(null);
    
    const audio = useSlotsAudio();
    const spinIntervalRef = useRef<any>(null);

    const occupiedCharms = useMemo(() => Object.values(playerCharms), [playerCharms]);

    useEffect(() => {
        if (isAllInMode) {
            setSelectedBet(activePlayer.balance);
        }
    }, [isAllInMode, activePlayer.balance]);

    const changeBet = (delta: number) => {
        if (reelStatus === 'spinning' || isAutoSpinning) return;
        setIsAllInMode(false);
        setSelectedBet(prev => {
            const next = prev + delta;
            if (next < 10) return 10;
            if (next > activePlayer.balance) return activePlayer.balance;
            return next;
        });
        audio.init();
        // play small click sound? (I'll stick to logic for now)
    };

    const championId = useMemo(() => {
        return players.reduce((prev: any, current: any) => (prev.balance > current.balance) ? prev : current).id;
    }, [players]);

    const handleSelectCharm = (playerId: string, charmId: string) => {
        setPlayerCharms(prev => {
            const next = { ...prev };
            // Check if anyone else has it
            const existingOwner = Object.entries(next).find(([pid, cid]) => cid === charmId);
            if (existingOwner && existingOwner[0] !== playerId) return prev;
            
            next[playerId] = charmId;
            return next;
        });
    };

    // Initialize random grid
    useEffect(() => {
        const initialGrid = Array.from({ length: GRID_ROWS }, () => 
            Array.from({ length: GRID_COLS }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
        );
        setGrid(initialGrid);
    }, []);

    const startSpin = useCallback(() => {
        if (reelStatus === 'spinning') return;
        audio.init();
        
        const currentBetAmount = isAllInMode ? activePlayer.balance : selectedBet;
        
        // Simultaneous Bet: All players bet!
        const playersWhoCanBet = players.filter((p: any) => p.balance >= currentBetAmount);
        if (playersWhoCanBet.length === 0 || currentBetAmount <= 0) {
            setIsAutoSpinning(false);
            if (isAllInMode) setIsAllInMode(false);
            return;
        }

        // Luck State Logic: Persistence of 5 spins between changes
        let finalLuck = luckLevel;
        if (luckDuration > 0) {
            setLuckDuration(prev => prev - 1);
        } else {
            const luckRoll = Math.random();
            let nextLuck: 'normal' | 'lucky' | 'luckiest' = 'normal';
            if (luckRoll < 0.1) nextLuck = 'luckiest'; // 10% chance
            else if (luckRoll < 0.3) nextLuck = 'lucky'; // 20% chance

            if (nextLuck !== luckLevel) {
                finalLuck = nextLuck;
                setLuckLevel(nextLuck);
                setLuckDuration(4); // 4 additional spins (5 total) before next possible change
            }
        }

        setPlayers((prev: any) => prev.map((p: any) => playersWhoCanBet.some(active => active.id === p.id) 
            ? { ...p, balance: p.balance - currentBetAmount } 
            : p
        ));

        // Update selectedBet for display if in All-In mode
        if (isAllInMode) setSelectedBet(activePlayer.balance);

        setProgressiveJackpot(prev => prev + (currentBetAmount * playersWhoCanBet.length * 0.05));
        setSessionStats(prev => ({ 
            totalBets: prev.totalBets + (currentBetAmount * playersWhoCanBet.length), 
            rounds: prev.rounds + 1 
        }));

        setReelStatus('spinning');
        setSpinningReels([true, true, true, true, true]);
        setWinMessage("");
        setLastWin(0);
        setPlayerWins({});
        setComboCues([]);
        setWinningCoordinates(new Set());

        // Calculate NEW GRID immediately for logic
        const newGrid = Array.from({ length: GRID_ROWS }, () => 
            Array.from({ length: GRID_COLS }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
        );

        // Luck manipulation
        if (finalLuck === 'luckiest') {
            // 60% chance for instant Grand Jackpot (5 Medals)
            if (Math.random() < 0.6) {
                const medalSym = SYMBOLS.find(s => s.id === 'medal')!;
                const targetRow = Math.floor(Math.random() * GRID_ROWS);
                for(let col = 0; col < GRID_COLS; col++) {
                    newGrid[targetRow][col] = medalSym;
                }
            } else {
                // Otherwise, standard high-tier boost
                const winSym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                const targetRow = Math.floor(Math.random() * GRID_ROWS);
                newGrid[targetRow][0] = winSym;
                newGrid[Math.floor(Math.random() * GRID_ROWS)][1] = winSym;
                newGrid[Math.floor(Math.random() * GRID_ROWS)][2] = winSym;
                if (Math.random() < 0.7) newGrid[Math.floor(Math.random() * GRID_ROWS)][3] = winSym;
            }
        } else if (finalLuck === 'lucky') {
            if (Math.random() < 0.4) {
                const winSym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                const targetRow = Math.floor(Math.random() * GRID_ROWS);
                newGrid[targetRow][0] = winSym;
                newGrid[Math.floor(Math.random() * GRID_ROWS)][1] = winSym;
                newGrid[Math.floor(Math.random() * GRID_ROWS)][2] = winSym;
            }
        }

        setGrid(newGrid);

        // Spin audio
        if (spinIntervalRef.current) clearInterval(spinIntervalRef.current);
        spinIntervalRef.current = setInterval(() => audio.playTick(), 60);

        // Cascade Stop Logic: Deliberate one-by-one sequence
        setTimeout(() => {
            [0, 1, 2, 3, 4].forEach(colIndex => {
                setTimeout(() => {
                    setSpinningReels(prev => {
                        const next = [...prev];
                        next[colIndex] = false;
                        return next;
                    });
                    audio.playThud();
                    
                    if (colIndex === 4) {
                        clearInterval(spinIntervalRef.current);
                        setReelStatus('stopped');
                        calculateWin(newGrid, currentBetAmount);
                    }
                }, colIndex * 650); // Increased delay to 650ms for a very distinct one-by-one feel
            });
        }, 1200); // 1.2s spin duration before stopping sequence begins

    }, [reelStatus, players, selectedBet, luckLevel, luckDuration, playerCharms, audio]);

    // Auto Spin Effect
    useEffect(() => {
        if (isAutoSpinning && reelStatus === 'stopped') {
            const timer = setTimeout(() => {
                startSpin();
            }, 1000); // 1 second delay between spins
            return () => clearTimeout(timer);
        } else if (isAutoSpinning && reelStatus === 'idle') {
            startSpin();
        }
    }, [isAutoSpinning, reelStatus, startSpin]);

    const handleMaxBet = () => {
        if (reelStatus === 'spinning' || isAutoSpinning) return;
        if (isAllInMode) {
            setSelectedBet(250);
            setIsAllInMode(false);
        } else {
            setSelectedBet(activePlayer.balance);
            setIsAllInMode(true);
        }
    };

    const calculateWin = (newGrid: any[][], betAmount: number) => {
        // 243 ways logic BASE
        const symbolsInCol1 = newGrid.map(row => row[0].id);
        const uniqueInCol1 = Array.from(new Set(symbolsInCol1));

        let baseWinAmount = 0;
        const newComboCues: { id: string, name: string, count: number, multiplier: number, color: string }[] = [];
        const newWinningCoords = new Set<string>();
        let triggeredCharm = false;
        let charmPlayerName = "";
        let charmLabel = "";

        uniqueInCol1.forEach(symId => {
            let count = 1;
            for (let i = 1; i < GRID_COLS; i++) {
                if (newGrid.some(row => row[i].id === symId)) {
                    count++;
                } else {
                    break;
                }
            }

            if (count >= 3) {
                const sym = SYMBOLS.find(s => s.id === symId)!;
                const multiplier = count - 2;
                baseWinAmount += sym.value * multiplier * (betAmount / 50);
                newComboCues.push({ id: sym.id, name: sym.name, count, multiplier, color: sym.color });
                
                // Track exact coordinates that triggered this win
                for (let c = 0; c < count; c++) {
                    for (let r = 0; r < GRID_ROWS; r++) {
                        if (newGrid[r][c].id === sym.id) {
                            newWinningCoords.add(`${r},${c}`);
                        }
                    }
                }

                // Check for Charm Wins
                players.forEach((p: any) => {
                    const playerCharmId = playerCharms[p.id];
                    if (playerCharmId) {
                        const charmObj = BONUS_OBJECTS.find(o => o.id === playerCharmId);
                        // Simplified mapping: IDs matching or label-based match
                        if (playerCharmId === symId || (playerCharmId === 'fire' && symId === 'flame')) {
                            triggeredCharm = true;
                            charmPlayerName = p.name;
                            charmLabel = charmObj?.label || "Power";
                        }
                    }
                });
            }
        });

        // Calculate for ALL players simultaneously
        const newPlayerWins: Record<string, number> = {};
        let totalGroupWin = 0;
        let jackpotWon = false;

        // Check for Grand Jackpot: 5 Medals
        const medalWin = newComboCues.find(c => c.id === 'medal' && c.count === 5);
        if (medalWin && isMaxBet) {
            jackpotWon = true;
        }

        players.forEach((player: any) => {
            let individualWin = baseWinAmount;
            
            // Grand Jackpot Award for the player who triggered it (activePlayer)
            if (jackpotWon && player.id === activePlayer.id) {
                individualWin += progressiveJackpot;
            }

            // Apply unique Charm multiplier
            const charm = playerCharms[player.id];
            if (charm) {
                // Determine if this specific win involved the player's charm
                const isCharmWin = newComboCues.some(cue => 
                    cue.id === charm || (charm === 'fire' && cue.id === 'flame')
                );

                const multiplier = isCharmWin ? 2.5 : (0.8 + (Math.random() * 0.4)); 
                individualWin = Math.floor(individualWin * multiplier);
            }

            if (individualWin > 0) {
                newPlayerWins[player.id] = individualWin;
                totalGroupWin += individualWin;
            }
        });

        if (totalGroupWin > 0) {
            setLastWin(totalGroupWin);
            setWinMessage(jackpotWon ? "GRAND JACKPOT WON!!!" : (triggeredCharm ? "FULL CHARM POWER!" : "GROUP WIN!"));
            setPlayerWins(newPlayerWins);
            
            if (jackpotWon) {
                setProgressiveJackpot(10000); // Reset to base 10k
                confetti({
                    particleCount: 500,
                    spread: 160,
                    origin: { y: 0.6 },
                    colors: ['#facc15', '#ffffff', '#ffd700']
                });
            }

            if (triggeredCharm) {
                setCharmEffect({ active: true, playerName: charmPlayerName, charmLabel });
                setTimeout(() => setCharmEffect(null), 3000);
            }

            setPlayers((prev: any) => prev.map((p: any) => ({
                ...p,
                balance: p.balance + (newPlayerWins[p.id] || 0)
            })));
            
            audio.playWinChime();
            triggerConfetti();
        }

        setComboCues(newComboCues);
        setWinningCoordinates(newWinningCoords);
    };

    const triggerConfetti = () => {
        confetti({ particleCount: 150, spread: 80, origin: { x: 0.5, y: 0.6 }, colors: ['#ff2a2a', '#e9c349', '#ffffff', '#000000'] });
    };

    return (
        <div className="flex-1 flex flex-col bg-black h-full overflow-hidden font-sans text-white">
            {/* --- Main Content Area --- */}
            <main className="flex-1 overflow-y-auto no-scrollbar p-6 lg:p-8 space-y-8 relative">
                
                {/* --- Jackpot Header --- */}
                <div className="flex justify-center flex-col items-center">
                    <div className="bg-gradient-to-br from-[#1c0000] to-[#0a0000] p-8 px-16 rounded-[40px] border border-red-500/30 shadow-[0_30px_60px_rgba(255,0,0,0.15)] text-center relative group">
                        <div className="absolute inset-0 bg-red-500/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity" />
                        <p className="text-xs text-[#facc15] font-black tracking-[0.4em] uppercase mb-1 drop-shadow-sm">Grand Jackpot</p>
                        <h1 className="text-5xl lg:text-7xl font-lobster font-black text-white tracking-tighter drop-shadow-[0_0_20px_rgba(255,0,0,0.4)]">
                            <span className="text-red-500 opacity-80 mr-2">$</span>
                            {progressiveJackpot.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </h1>
                    </div>
                </div>

                <div className="grid grid-cols-12 gap-8 max-w-[1920px] mx-auto">
                    
                    {/* --- Left Column: VIP Host & Stats --- */}
                    <div className="col-span-12 lg:col-span-2 space-y-6 order-last lg:order-first">
                        {/* VIP Host Card */}
                        <div className="bg-[#0f0000] rounded-3xl p-6 border border-red-900/30 relative overflow-hidden group">
                           <div className="absolute inset-0 bg-gradient-to-t from-red-900/40 via-transparent to-transparent z-10" />
                           <div className="relative z-20">
                             <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-1 text-center">VIP Host</p>
                             <h3 className="text-2xl font-lobster font-black text-center mb-4 text-[#ff2a2a] drop-shadow-[0_0_10px_rgba(255,42,42,0.8)]">Rias Gremory</h3>
                             
                             <div className="aspect-[3/4] rounded-2xl overflow-hidden mb-6 border border-red-500/20 shadow-[0_0_30px_rgba(255,42,42,0.2)]">
                                <img 
                                   src={luckLevel === 'luckiest' ? "https://raw.githubusercontent.com/CivisNacho/Rias-Gremory-s-free-casino-slop/main/public/images/rias_best_luck.jpg" : luckLevel === 'lucky' ? "https://raw.githubusercontent.com/CivisNacho/Rias-Gremory-s-free-casino-slop/main/public/images/rias_lucky.jpg" : "https://raw.githubusercontent.com/CivisNacho/Rias-Gremory-s-free-casino-slop/main/public/images/rias_normal.webp"} 
                                   alt="Rias Gremory" 
                                   referrerPolicy="no-referrer"
                                   className="w-full h-full object-cover transition-all duration-700 group-hover:scale-110" 
                                />
                             </div>

                             <div className="bg-white/5 backdrop-blur px-4 py-3 rounded-xl border border-white/5 mb-6">
                                <p className="text-[10px] italic text-white/50 leading-relaxed font-medium">
                                   {luckLevel === 'luckiest' ? '"The stars have aligned. Tonight, our fortune is inevitable."' : 
                                    luckLevel === 'lucky' ? '"I feel a spark of fortune in the air. Let\'s see where it leads."' : 
                                    '"Ready to test your luck tonight? The stakes are higher, but the rewards are higher."'}
                                </p>
                             </div>

                             <div className="space-y-2">
                                <div className="flex justify-between items-center text-[10px] uppercase font-black">
                                   <span className="text-white/40">Luck Factor</span>
                                   <span className={cn(
                                       luckLevel === 'luckiest' ? "text-emerald-400" : luckLevel === 'lucky' ? "text-[#facc15]" : "text-white/60"
                                   )}>
                                       {luckLevel === 'luckiest' ? 'MAXIMAL' : luckLevel === 'lucky' ? 'FORTUNATE' : 'NORMAL'}
                                   </span>
                                </div>
                                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                                   <motion.div 
                                      className={cn(
                                          "h-full shadow-[0_0_10px_rgba(255,42,42,0.6)]",
                                          luckLevel === 'luckiest' ? "bg-emerald-400" : luckLevel === 'lucky' ? "bg-[#facc15]" : "bg-red-600"
                                      )}
                                      initial={{ width: "30%" }}
                                      animate={{ 
                                          width: luckLevel === 'luckiest' ? "100%" : luckLevel === 'lucky' ? "70%" : "30%" 
                                      }}
                                   />
                                </div>
                             </div>
                           </div>
                        </div>

                        {/* Table Stats */}
                        <div className="bg-[#0f0000] rounded-3xl p-5 border border-red-900/30">
                            <h4 className="text-[10px] uppercase font-black text-white/30 tracking-widest mb-4">Table Stats</h4>
                            <div className="space-y-4">
                               <div className="flex justify-between text-xs font-bold">
                                  <span className="text-white/50">Volatility</span>
                                  <span className="text-white">High</span>
                               </div>
                               <div className="flex justify-between text-xs font-bold">
                                  <span className="text-white/50">RTP</span>
                                  <span className="text-red-400">96.8%</span>
                               </div>
                            </div>
                        </div>
                    </div>

                    {/* --- Center Column: Slot Grid --- */}
                    <div className="col-span-12 lg:col-span-8 flex flex-col gap-8 order-first lg:order-none">
                        {/* The Game Grid Container */}
                        <div className={cn(
                            "flex-1 bg-gradient-to-b rounded-[48px] p-6 lg:p-12 border-4 transition-all duration-700 relative overflow-hidden",
                            isMaxBet 
                                ? "from-[#450a0a] to-black border-red-500 shadow-[0_0_100px_rgba(255,0,0,0.3)]" 
                                : "from-[#2a0505] to-[#000000] border-red-900/40 shadow-[0_0_50px_rgba(255,0,0,0.1)]"
                        )}>
                            {/* Inferno Animated Overlay for Max Bet */}
                            <AnimatePresence>
                                {isMaxBet && (
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="absolute inset-0 pointer-events-none z-0"
                                    >
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,0,0,0.2),transparent_70%)] animate-pulse" />
                                        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-red-600/10 to-transparent" />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Grid Frame with 3D Reels */}
                            <div className={cn(
                                "relative z-10 w-full h-[280px] lg:h-[320px] rounded-[24px] bg-black/60 border transition-all duration-700 flex overflow-x-auto overflow-y-hidden no-scrollbar",
                                isMaxBet 
                                    ? "border-red-500 shadow-[inset_0_0_80px_rgba(255,0,0,0.4),0_0_40px_rgba(255,0,0,0.2)]" 
                                    : "border-red-900/50 shadow-[inset_0_0_60px_rgba(255,0,0,0.15)]"
                            )}>
                                {/* Dark vignette top/bottom simulating curved depth */}
                                <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/90 to-transparent z-20 pointer-events-none" />
                                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/90 to-transparent z-20 pointer-events-none" />
                                
                                {/* --- Combo Cues Overlay --- */}
                                <AnimatePresence>
                                    {comboCues.length > 0 && reelStatus === 'stopped' && (
                                        <motion.div 
                                            initial={{ scale: 0.8, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.8, opacity: 0 }}
                                            className="absolute inset-0 z-30 flex flex-col items-center justify-center pointer-events-none bg-black/60 backdrop-blur-sm"
                                        >
                                            {comboCues.map((cue, idx) => (
                                                <motion.div 
                                                    key={idx}
                                                    initial={{ x: -50, opacity: 0 }}
                                                    animate={{ x: 0, opacity: 1 }}
                                                    transition={{ delay: idx * 0.15, type: 'spring' }}
                                                    className="flex items-center gap-4 mb-2 bg-gradient-to-r from-transparent via-black/80 to-transparent px-16 py-3"
                                                >
                                                    <span className="text-4xl lg:text-5xl font-black font-lobster drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]" style={{ color: cue.color }}>{cue.count}x {cue.name}</span>
                                                    <span className="text-xl lg:text-3xl font-black text-[#facc15] bg-red-600 px-3 py-1 rounded-xl border-2 border-[#facc15] shadow-[0_0_20px_rgba(250,204,21,0.5)] transform -rotate-3">
                                                        {cue.multiplier}X MULTI!
                                                    </span>
                                                </motion.div>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="relative z-10 grid grid-cols-5 gap-2 lg:gap-6 w-full h-full p-2 md:p-4 lg:p-6 items-center min-w-[500px] md:min-w-0">
                                    {[0, 1, 2, 3, 4].map(cIdx => {
                                         const wRows = [];
                                         if (winningCoordinates.has(`0,${cIdx}`)) wRows.push(0);
                                         if (winningCoordinates.has(`1,${cIdx}`)) wRows.push(1);
                                         if (winningCoordinates.has(`2,${cIdx}`)) wRows.push(2);

                                         return (
                                            <Reel3D
                                                key={cIdx}
                                                isSpinning={spinningReels[cIdx]}
                                                symbols={grid[0] ? [ grid[0][cIdx], grid[1][cIdx], grid[2][cIdx] ] : []}
                                                activeCombos={reelStatus === 'stopped' ? comboCues : []}
                                                winningRows={reelStatus === 'stopped' ? wRows : []}
                                            />
                                         );
                                    })}
                                </div>
                            </div>

                            {/* Floating Controls Overlay */}
                            <div className="mt-8 lg:mt-12 flex flex-wrap items-center justify-center gap-4 lg:gap-8">
                                <button 
                                    onClick={() => setIsAutoSpinning(prev => !prev)}
                                    className="flex flex-col items-center gap-1 group"
                                >
                                    <div className={cn(
                                        "w-16 h-10 rounded-xl border flex items-center justify-center transition-all",
                                        isAutoSpinning 
                                            ? "bg-red-600 border-red-400 shadow-[0_0_15px_rgba(255,0,0,0.6)]" 
                                            : "bg-white/5 border-white/10 group-hover:bg-white/10"
                                    )}>
                                        <RotateCcw size={18} className={isAutoSpinning ? "text-white animate-spin-slow" : "text-white/40 group-hover:text-white"} />
                                    </div>
                                    <span className={cn(
                                        "text-[10px] font-black uppercase tracking-widest transition-colors",
                                        isAutoSpinning ? "text-red-400 drop-shadow-sm" : "text-white/30 group-hover:text-white"
                                    )}>Auto Spin</span>
                                </button>

                                {/* Granular Bet Selector */}
                                <div className="flex flex-col items-center gap-1 group">
                                    <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden h-10">
                                        <button 
                                            onClick={() => changeBet(-10)}
                                            disabled={reelStatus === 'spinning' || isAutoSpinning || selectedBet <= 10}
                                            className="w-10 h-full flex items-center justify-center hover:bg-white/10 active:bg-white/20 transition-all border-r border-white/10 text-white/50 hover:text-white disabled:opacity-20"
                                        >
                                            <Minus size={16} />
                                        </button>
                                        <div className="px-4 font-black text-white text-sm min-w-[80px] text-center">
                                            ${Math.floor(selectedBet)}
                                        </div>
                                        <button 
                                            onClick={() => changeBet(10)}
                                            disabled={reelStatus === 'spinning' || isAutoSpinning || selectedBet >= activePlayer.balance}
                                            className="w-10 h-full flex items-center justify-center hover:bg-white/10 active:bg-white/20 transition-all border-l border-white/10 text-white/50 hover:text-white disabled:opacity-20"
                                        >
                                            <Plus size={16} />
                                        </button>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-white transition-colors">Select Bet</span>
                                </div>

                                <button 
                                    onClick={startSpin}
                                    disabled={reelStatus === 'spinning' || activePlayer.balance < selectedBet || isAutoSpinning}
                                    className={cn(
                                        "w-24 h-24 rounded-2xl bg-gradient-to-br from-red-500 to-red-800 text-white font-lobster font-black text-2xl flex items-center justify-center shadow-[0_15px_40px_rgba(255,42,42,0.4)] transition-all active:scale-95 disabled:opacity-50 disabled:scale-100 hover:from-red-400 hover:to-red-700 border-b-4 border-red-900 group",
                                        reelStatus === 'spinning' && "animate-pulse border-b-0 translate-y-1"
                                    )}
                                >
                                    {reelStatus === 'spinning' || isAutoSpinning ? <RotateCcw className="animate-spin" /> : "SPIN"}
                                </button>

                                <button 
                                    onClick={handleMaxBet}
                                    disabled={reelStatus === 'spinning' || isAutoSpinning}
                                    className="flex flex-col items-center gap-1 group relative"
                                >
                                    <div className={cn(
                                        "w-16 h-10 rounded-xl border flex items-center justify-center transition-all",
                                        isMaxBet 
                                            ? "bg-red-600 border-red-400 shadow-[0_0_20px_rgba(255,0,0,0.6)]" 
                                            : "bg-white/5 border-white/10 group-hover:bg-white/10"
                                    )}>
                                        <Zap size={18} className={cn("transition-colors", isMaxBet ? "text-white" : "text-white/40 group-hover:text-white")} />
                                    </div>
                                    <span className={cn(
                                        "text-[10px] font-black uppercase tracking-widest transition-colors",
                                        isMaxBet ? "text-red-400 font-bold" : "text-white/30 group-hover:text-white"
                                    )}>Max Bet</span>

                                    {isMaxBet && (
                                        <motion.div 
                                            layoutId="maxBetGlow"
                                            className="absolute inset-0 bg-red-500/20 blur-xl rounded-full z-[-1]"
                                        />
                                    )}
                                </button>
                            </div>

                            {/* Status Bottom Labels */}
                            <div className="mt-8 flex justify-center gap-12 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                                <span>Lines: 243 Ways</span>
                                <span>Multi: x12.5</span>
                                <span>Min Bet: $10.00</span>
                            </div>
                        </div>

                        {/* --- Win Message Area --- */}
                        <div className="h-16 flex flex-col items-center justify-center overflow-hidden">
                            <AnimatePresence mode="wait">
                                {winMessage && (
                                    <motion.div
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        exit={{ y: -20, opacity: 0 }}
                                        className="flex flex-col items-center"
                                    >
                                        <span className="text-3xl font-lobster font-black text-red-500 uppercase animate-pulse drop-shadow-[0_0_15px_rgba(255,42,42,0.6)]">{winMessage}</span>
                                        {lastWin > 0 && <span className="text-xl font-lobster italic font-black text-[#facc15] drop-shadow-md">Group Total: {formatCurrency(lastWin)}</span>}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* --- Right Column: Player Roster --- */}
                    <div className="col-span-12 lg:col-span-2 flex flex-col gap-6">
                        <h4 className="text-[10px] uppercase font-black text-white/30 tracking-widest px-2">Player Roster</h4>
                        <div className="space-y-4">
                           {players.map((p: any) => (
                               <PlayerCard 
                                  key={p.id} 
                                  player={p} 
                                  isActive={activePlayerId === p.id} 
                                  isChampion={p.id === championId} 
                                  charm={playerCharms[p.id]}
                                  onSelectCharm={(cid) => handleSelectCharm(p.id, cid)}
                                  occupiedCharms={occupiedCharms}
                                  lastIndividualWin={playerWins[p.id] || 0}
                                  isRight 
                                />
                           ))}
                           <button 
                             onClick={onAddPlayer}
                             className="w-full p-4 rounded-xl border border-dashed border-white/10 flex items-center justify-center gap-2 hover:bg-white/5 hover:border-white/30 text-white/40 transition-all group"
                           >
                             <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-secondary group-hover:text-black transition-all">
                                <Plus size={16} />
                             </div>
                             <span className="text-xs font-black uppercase tracking-tight">Add Player</span>
                           </button>
                        </div>
                    </div>
                </div>
            </main>

            {/* --- Special Charm Effect Overlay --- */}
            <AnimatePresence>
                {charmEffect && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden"
                    >
                        <motion.div 
                            initial={{ scale: 0.5, rotate: -10 }}
                            animate={{ scale: 1, rotate: 0 }}
                            className="text-center"
                        >
                            <motion.div 
                                className="absolute inset-0 bg-red-600/20 blur-[120px] rounded-full"
                                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0.8, 0.5] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            />
                            <h2 className="text-7xl lg:text-9xl font-lobster font-black text-[#facc15] drop-shadow-[0_0_30px_rgba(250,204,21,0.8)] relative z-10 mb-2">
                                FULL POWER
                            </h2>
                            <p className="text-2xl font-black text-white uppercase tracking-[0.5em] relative z-10">
                                {charmEffect.playerName}'s {charmEffect.charmLabel} Activated
                            </p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
