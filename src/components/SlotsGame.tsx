import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Play, 
  RotateCcw, 
  ArrowLeft, 
  Plus, 
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
import { motion, AnimatePresence } from 'motion/react';
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

    const occupiedCharms = useMemo(() => Object.values(playerCharms), [playerCharms]);

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
        
        // Simultaneous Bet: All players bet!
        const playersWhoCanBet = players.filter((p: any) => p.balance >= selectedBet);
        if (playersWhoCanBet.length === 0) {
            setIsAutoSpinning(false);
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
            ? { ...p, balance: p.balance - selectedBet } 
            : p
        ));

        setProgressiveJackpot(prev => prev + (selectedBet * playersWhoCanBet.length * 0.05));
        setSessionStats(prev => ({ 
            totalBets: prev.totalBets + (selectedBet * playersWhoCanBet.length), 
            rounds: prev.rounds + 1 
        }));

        setReelStatus('spinning');
        setWinMessage("");
        setLastWin(0);
        setPlayerWins({});

        // Spin logic simulation
        setTimeout(() => {
            const newGrid = Array.from({ length: GRID_ROWS }, () => 
                Array.from({ length: GRID_COLS }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)])
            );

            // Luck manipulation
            if (finalLuck === 'lucky' || finalLuck === 'luckiest') {
                const boostChance = finalLuck === 'luckiest' ? 0.7 : 0.4;
                if (Math.random() < boostChance) {
                    const winSym = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
                    const targetRow = Math.floor(Math.random() * GRID_ROWS);
                    newGrid[targetRow][0] = winSym;
                    newGrid[Math.floor(Math.random() * GRID_ROWS)][1] = winSym;
                    newGrid[Math.floor(Math.random() * GRID_ROWS)][2] = winSym;
                    
                    if (finalLuck === 'luckiest' && Math.random() < 0.5) {
                        newGrid[Math.floor(Math.random() * GRID_ROWS)][3] = winSym;
                    }
                }
            }

            setGrid(newGrid);
            setReelStatus('stopped');
            calculateWin(newGrid);
        }, 1500);
    }, [reelStatus, players, selectedBet, luckLevel, luckDuration, playerCharms]);

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

    const calculateWin = (newGrid: any[][]) => {
        // 243 ways logic BASE
        const symbolsInCol1 = newGrid.map(row => row[0].id);
        const uniqueInCol1 = Array.from(new Set(symbolsInCol1));

        let baseWinAmount = 0;

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
                // Reduced multiplier for balance (similar to roulette's conservative payouts)
                baseWinAmount += sym.value * (count - 2) * (selectedBet / 50);
            }
        });

        // Calculate for ALL players simultaneously
        const newPlayerWins: Record<string, number> = {};
        let totalGroupWin = 0;

        players.forEach((player: any) => {
            let individualWin = baseWinAmount;
            
            // Apply unique Charm multiplier
            const charm = playerCharms[player.id];
            if (charm) {
                const icon = BONUS_OBJECTS.find(o => o.id === charm)?.icon;
                // Mild luck multiplier boost
                const multiplier = 0.8 + (Math.random() * 0.4); 
                individualWin = Math.floor(individualWin * multiplier);
            }

            if (individualWin > 0) {
                newPlayerWins[player.id] = individualWin;
                totalGroupWin += individualWin;
            }
        });

        if (totalGroupWin > 0) {
            setLastWin(totalGroupWin);
            setWinMessage("GROUP WIN!");
            setPlayerWins(newPlayerWins);
            
            setPlayers((prev: any) => prev.map((p: any) => ({
                ...p,
                balance: p.balance + (newPlayerWins[p.id] || 0)
            })));
            
            triggerConfetti();
        }
    };

    const triggerConfetti = () => {
        confetti({ particleCount: 150, spread: 80, origin: { x: 0.5, y: 0.6 }, colors: ['#ff2a2a', '#e9c349', '#ffffff', '#000000'] });
    };

    return (
        <div className="flex-1 flex flex-col bg-black h-full overflow-hidden font-sans text-white">
            {/* --- Global Header --- */}
            <header className="h-16 shrink-0 flex items-center justify-between px-8 border-b border-red-900/40 bg-black/80 backdrop-blur-md z-50 shadow-[0_4px_30px_rgba(255,0,0,0.1)]">
                <div className="flex items-center gap-8">
                    <button onClick={onExit} className="font-lobster text-2xl font-black italic tracking-tighter text-red-500 hover:text-red-400 transition-colors uppercase drop-shadow-[0_0_10px_rgba(255,0,0,0.5)]">
                        Rias Gremori's <span className="text-white">Free Casino</span>
                    </button>
                    
                    <nav className="hidden md:flex items-center gap-6">
                        {['Lobby', 'Multiplayer', 'Leaderboard', 'VIP Club'].map(item => (
                            <button key={item} className={cn(
                                "text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
                                item === 'Lobby' ? "text-secondary underline underline-offset-8" : "text-white/40 hover:text-white"
                            )}>
                                {item}
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={() => { setIsAutoSpinning(false); onExit(); }} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                        <Wallet size={18} className="text-red-400" />
                    </button>
                    <button className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors">
                        <Settings size={18} className="text-white/60" />
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-red-900/20 border border-red-500/30 overflow-hidden shadow-[0_0_15px_rgba(255,42,42,0.4)]">
                        <img 
                           src={luckLevel === 'luckiest' ? "/images/rias_best_luck.jpg" : luckLevel === 'lucky' ? "/images/rias_lucky.jpg" : "/images/rias_normal.webp"} 
                           alt="Avatar" 
                           referrerPolicy="no-referrer"
                           className="w-full h-full object-cover" 
                        />
                    </div>
                </div>
            </header>

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
                    <div className="col-span-12 lg:col-span-2 space-y-6">
                        {/* VIP Host Card */}
                        <div className="bg-[#0f0000] rounded-3xl p-6 border border-red-900/30 relative overflow-hidden group">
                           <div className="absolute inset-0 bg-gradient-to-t from-red-900/40 via-transparent to-transparent z-10" />
                           <div className="relative z-20">
                             <p className="text-[10px] text-white/40 uppercase font-black tracking-widest mb-1 text-center">VIP Host</p>
                             <h3 className="text-2xl font-lobster font-black text-center mb-4 text-[#ff2a2a] drop-shadow-[0_0_10px_rgba(255,42,42,0.8)]">Rias Gremory</h3>
                             
                             <div className="aspect-[3/4] rounded-2xl overflow-hidden mb-6 border border-red-500/20 shadow-[0_0_30px_rgba(255,42,42,0.2)]">
                                <img 
                                   src={luckLevel === 'luckiest' ? "/images/rias_best_luck.jpg" : luckLevel === 'lucky' ? "/images/rias_lucky.jpg" : "/images/rias_normal.webp"} 
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
                    <div className="col-span-12 lg:col-span-8 flex flex-col gap-8">
                        {/* The Game Grid Container */}
                        <div className="flex-1 bg-gradient-to-b from-[#2a0505] to-[#000000] rounded-[48px] p-6 lg:p-12 border-4 border-red-900/40 shadow-[0_0_50px_rgba(255,0,0,0.1)] relative overflow-hidden">
                            {/* Grid Frame */}
                            <div className="relative z-10 grid grid-cols-5 gap-4 lg:gap-6">
                                {grid.map((row, rIdx) => (
                                    row.map((sym, cIdx) => (
                                        <motion.div
                                            key={`${rIdx}-${cIdx}`}
                                            animate={reelStatus === 'spinning' ? {
                                                y: [0, -20, 20, 0],
                                                scale: [1, 0.9, 1.1, 1],
                                            } : {}}
                                            transition={{ repeat: reelStatus === 'spinning' ? Infinity : 0, duration: 0.15, delay: cIdx * 0.05 }}
                                            className="aspect-square bg-gradient-to-br from-white/5 to-transparent border border-white/10 rounded-full flex items-center justify-center p-4 relative group"
                                        >
                                            <div className="absolute inset-0 bg-white/5 rounded-full scale-75 group-hover:scale-100 transition-transform duration-500 opacity-20 group-hover:opacity-40" />
                                            <sym.icon 
                                                size={32} 
                                                className="relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]" 
                                                style={{ color: sym.color }} 
                                            />
                                        </motion.div>
                                    ))
                                ))}
                            </div>

                            {/* Floating Controls Overlay */}
                            <div className="mt-12 flex items-center justify-center gap-8">
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

                                <button className="flex flex-col items-center gap-1 group">
                                    <div className="w-16 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:bg-white/10 transition-all">
                                        <Zap size={18} className="text-white/40 group-hover:text-white" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-white transition-colors">Max Bet</span>
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
        </div>
    );
}
