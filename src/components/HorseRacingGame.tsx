import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Play, 
  CircleDollarSign, 
  X,
  AlertCircle,
  Zap,
  Plus,
  Minus
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { RoulettePlayer } from '../lib/rouletteUtils';
import { HorseRacingEngine, Horse } from './HorseRacingEngine';

const HORSE_IMAGE_URL = "https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/gif/horse_gif_loop.gif";
const DIRT_TEXTURE_URL = "https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/horse_race/textures/dirt_diff_1k.jpg";

interface HorseRacingGameProps {
  players: RoulettePlayer[];
  activePlayerId: string;
  setPlayers: React.Dispatch<React.SetStateAction<RoulettePlayer[]>>;
  onExit: () => void;
}

interface Bet {
  horseId: number;
  amount: number;
}

export const HorseRacingGame = ({ 
  players, 
  activePlayerId, 
  setPlayers, 
  onExit 
}: HorseRacingGameProps) => {
  const [isRacing, setIsRacing] = useState(false);
  const [bets, setBets] = useState<Bet[]>([]);
  const [selectedHorseId, setSelectedHorseId] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState<number>(100);
  const [selectedChip, setSelectedChip] = useState<number>(100);
  const [lastWinner, setLastWinner] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [winningPayout, setWinningPayout] = useState<number>(0);
  
  const [liveHorses, setLiveHorses] = useState<Horse[]>([]);
  const [raceProgress, setRaceProgress] = useState(0);
  
  // Use refs for values needed in callbacks that are passed to the engine
  // to avoid stale closures and unnecessary re-renders of the engine
  const betsRef = useRef(bets);
  const activePlayerIdRef = useRef(activePlayerId);

  useEffect(() => {
    betsRef.current = bets;
  }, [bets]);

  useEffect(() => {
    activePlayerIdRef.current = activePlayerId;
  }, [activePlayerId]);

  const activePlayer = useMemo(() => 
    players.find(p => p.id === activePlayerId) || players[0],
    [players, activePlayerId]
  );

  const placeBet = () => {
    if (selectedHorseId === null || isRacing) return;
    if (activePlayer.balance < betAmount) return;

    setBets([{ horseId: selectedHorseId, amount: betAmount }]);
    
    // Deduct balance immediately
    setPlayers(prev => prev.map(p => 
      p.id === activePlayerId 
        ? { ...p, balance: p.balance - betAmount } 
        : p
    ));
  };

  const handleRaceFinish = useCallback((winnerId: number) => {
    setIsRacing(false);
    setLastWinner(winnerId);
    setHistory(prev => [winnerId, ...prev].slice(0, 10));
    setShowResult(true);

    // Calculate winnings using ref to avoid stale closure
    const currentBets = betsRef.current;
    const winningBet = currentBets.find(b => b.horseId === winnerId);
    
    if (winningBet) {
      const payout = winningBet.amount * 6; // 6x multiplier for 6 horses
      setWinningPayout(payout);
      setPlayers(prev => prev.map(p => 
        p.id === activePlayerIdRef.current 
          ? { ...p, balance: p.balance + payout } 
          : p
      ));
    } else {
      setWinningPayout(0);
    }
    
    setBets([]);
  }, [setPlayers]);

  const handleRaceUpdate = useCallback((horses: Horse[], progress: number) => {
    setLiveHorses(horses);
    setRaceProgress(progress);
  }, []);

  const startRace = () => {
    if (bets.length === 0) return;
    setLiveHorses([]);
    setRaceProgress(0);
    setWinningPayout(0);
    setIsRacing(true);
    setShowResult(false);
    setLastWinner(null);
  };

  // Derive sorted horses for the live standings
  const sortedHorses = [...liveHorses].sort((a, b) => b.position - a.position);

  return (
    <div className="flex flex-col h-full bg-surface-container overflow-hidden">
      {/* Game Header */}
      <div className="flex-none flex items-center justify-between px-8 py-4 bg-surface/40 backdrop-blur-md border-b border-outline-variant/5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 border border-secondary/20 overflow-hidden flex items-center justify-center">
            <img 
              src="https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/heads/main/images/horse_race_icon.jpg" 
              alt="VIP Horse Derby Icon"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h2 className="text-xl font-black text-on-surface uppercase tracking-tight">VIP HORSE DERBY</h2>
            <p className="text-[10px] text-on-surface/40 font-black uppercase tracking-widest">High Stakes Racing • House Multiplier: 6x</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
            <div className="hidden sm:flex -space-x-2">
                {history.map((winnerId, i) => (
                    <div 
                        key={i} 
                        className="w-8 h-8 rounded-full border-2 border-surface bg-surface-container-highest flex items-center justify-center text-[10px] font-bold text-on-surface"
                        style={{ borderColor: winnerId === 0 ? '#ff5555' : winnerId === 1 ? '#55ff55' : '#5555ff' }}
                    >
                        {winnerId + 1}
                    </div>
                ))}
            </div>
            <button 
                onClick={onExit}
                className="p-2 hover:bg-white/5 rounded-full text-on-surface/40 hover:text-red-500 transition-colors"
            >
                <X size={24} />
            </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left: Game Canvas Area */}
        <div className="flex-none lg:flex-1 relative bg-black/20 flex items-center justify-center p-2 sm:p-4 lg:p-8 min-h-[280px] aspect-video lg:aspect-auto overflow-hidden">
          <div className="relative w-full h-full max-w-6xl max-h-[720px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/5 bg-[#0a0a0a] flex items-center justify-center [&_canvas]:w-full [&_canvas]:h-full [&_canvas]:object-contain">
            <HorseRacingEngine 
                width={1600} 
                height={900} 
                isRacing={isRacing} 
                onRaceFinish={handleRaceFinish} 
                onRaceUpdate={handleRaceUpdate}
                horseImageUrl={HORSE_IMAGE_URL}
            />
            
            {/* Overlay UI - Always rendered but conditionally visible */}
            <AnimatePresence>
                {/* Pre-Race Bet Splash */}
                {!isRacing && !showResult && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-center p-12 z-50"
                    >
                        <Trophy size={80} className="text-secondary mb-6" />
                        <h1 className="text-6xl font-black text-on-surface mb-4 uppercase tracking-tighter italic">PLACE YOUR BETS</h1>
                        <p className="text-on-surface/60 max-w-md mx-auto uppercase tracking-[0.2em] text-xs font-bold leading-relaxed">
                            Pick your champion. The higher the risk, the greater the glory. 
                        </p>
                    </motion.div>
                )}

                {/* Live Race GTA Override UI */}
                {isRacing && !showResult && (
                    <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute top-4 inset-x-8 flex items-start justify-between pointer-events-none z-40"
                    >
                        {/* Fake Left Casino Branding */}
                        <div className="bg-[#2A2B31] text-white px-8 py-3 rounded-xl shadow-2xl flex items-center justify-center border border-white/5 h-20 min-w-[240px]">
                            <div className="flex flex-col items-center">
                                <span className="font-serif italic text-2xl tracking-tighter font-medium text-white">Rias Gremory</span>
                                <span className="text-[8px] uppercase tracking-[0.4em] text-white/50 font-black">Casino & Resort</span>
                            </div>
                        </div>

                        {/* Center HUD Standings Panel */}
                        <div className="bg-[#2A2B31] border border-[#3A3B41] rounded-xl shadow-2xl flex flex-col overflow-hidden mx-4 pb-3 flex-1 max-w-[600px] h-[100px] relative">
                             {/* Top Leader Label Component */}
                             <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#ff5500] text-white px-6 py-1 rounded-sm shadow-md z-10 transition-all">
                                 <span className="text-[10px] font-black uppercase tracking-wider">LIVE STANDINGS</span>
                             </div>

                             {/* Portraits Row (Sorted by position) */}
                             <div className="flex-1 flex items-center justify-between px-6 pt-3">
                                  {sortedHorses.length > 0 ? sortedHorses.map((horse, idx) => {
                                      const isPlayerChoice = bets.some(b => b.horseId === horse.id);
                                      const rowColors = ['#ff5555', '#55ff55', '#5555ff', '#ffff55', '#ff55ff', '#55ffff', '#ffa500'];
                                      return (
                                          <motion.div 
                                            key={horse.id} 
                                            layout
                                            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                                            className="flex flex-col items-center gap-1 relative"
                                          >
                                                {isPlayerChoice && (
                                                    <motion.div 
                                                        initial={{ scale: 0 }}
                                                        animate={{ scale: 1 }}
                                                        className="absolute -top-2 -right-2 text-yellow-400 z-20" 
                                                        style={{ textShadow: '0 0 4px black'}}
                                                    >
                                                        ★
                                                    </motion.div>
                                                )}
                                                <div 
                                                    className="w-10 h-10 rounded-full border-[3px] flex items-center justify-center bg-black shadow-inner overflow-hidden relative"
                                                    style={{ borderColor: rowColors[horse.id] }}
                                                >
                                                    <div className="absolute inset-0 bg-white/10"></div>
                                                    <div className="text-white font-black text-xs z-10">{horse.id + 1}</div>
                                                </div>
                                                <div className="text-[9px] font-bold text-white/60">
                                                   {idx + 1}/{sortedHorses.length}
                                                </div>
                                          </motion.div>
                                      );
                                  }) : Array.from({length: 6}).map((_, i) => (
                                      <div key={i} className="flex flex-col items-center gap-1 opacity-50">
                                            <div className="w-10 h-10 rounded-full border-[3px] border-gray-600 bg-black"></div>
                                      </div>
                                  ))}
                             </div>
                             
                             {/* Pseudo Progress bar track at bottom */}
                             <div className="h-1 mt-auto mx-4 rounded-full bg-black relative overflow-hidden">
                                 <div 
                                     className="absolute top-0 left-0 bottom-0 bg-[#ff5500] rounded-full transition-all duration-100 ease-linear shadow-[0_0_10px_#ff5500]"
                                     style={{ width: `${raceProgress}%` }}
                                 ></div>
                             </div>
                        </div>

                        {/* Right Event Branding & Balance */}
                        <div className="flex flex-col items-end gap-2">
                            <div className="bg-[#2A2B31] px-6 py-3 rounded-xl shadow-2xl border border-white/5 h-20 min-w-[200px] flex items-center justify-center">
                                <div className="flex flex-col items-center">
                                    <span className="font-black italic text-[#ffff00] text-xl tracking-tighter" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.5)'}}>INSIDE TRACK</span>
                                    <span className="text-[7px] uppercase tracking-widest text-[#ffaa00] font-black">Computerized Betting</span>
                                </div>
                            </div>
                            <div className="px-4 py-1 bg-black/60 backdrop-blur-md rounded-md border border-white/10">
                                <span className="text-white font-black font-mono">
                                    <span className="opacity-50 mr-1">$</span>{activePlayer.balance.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )}
                
                {/* Result Screen */}
                {showResult && lastWinner !== null && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="absolute inset-x-0 bottom-12 flex justify-center px-12"
                    >
                        <div className="bg-surface/90 backdrop-blur-xl border-2 border-secondary/30 p-8 rounded-[32px] shadow-2xl flex items-center gap-12 max-w-3xl w-full">
                            <div className="flex items-center gap-6">
                                <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center text-surface shadow-lg shadow-secondary/20">
                                    <Trophy size={48} />
                                </div>
                                <div>
                                    <h2 className="text-4xl font-black text-on-surface uppercase tracking-tight">WINNER: HORSE #{lastWinner + 1}</h2>
                                    <p className="text-secondary font-black uppercase tracking-widest text-[10px]">Photo Finish recorded</p>
                                </div>
                            </div>
                            <div className="flex-1 border-l border-outline-variant/10 pl-12">
                                {winningPayout > 0 ? (
                                    <div className="text-green-500">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1">YOU WON</p>
                                        <p className="text-4xl font-black italic">{formatCurrency(winningPayout)}</p>
                                    </div>
                                ) : (
                                    <div className="text-on-surface/40">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1">NO WINNINGS</p>
                                        <p className="text-4xl font-black italic">$0.00</p>
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => setShowResult(false)}
                                className="px-8 py-4 bg-secondary text-surface rounded-2xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all text-sm"
                            >
                                CONTINUE
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right: Controls Panel */}
        <div className="flex-1 lg:flex-none w-full lg:w-[420px] bg-surface/30 backdrop-blur-xl border-t lg:border-l border-outline-variant/10 p-6 sm:p-10 flex flex-col gap-8 lg:gap-10 overflow-y-auto min-h-0">
            {/* Bet Selection */}
            <div className="space-y-4 sm:space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-[9px] sm:text-[10px] font-black text-on-surface/40 uppercase tracking-[0.3em]">SELECT HORSE</h3>
                    <div className="px-3 py-1 bg-secondary/10 border border-secondary/20 rounded-full text-[8px] sm:text-[9px] font-black text-secondary tracking-widest leading-none">
                        PRO ODDS: 1/6
                    </div>
                </div>
                
                <div className="grid grid-cols-3 gap-3 sm:gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <button
                            key={i}
                            onClick={() => !isRacing && setSelectedHorseId(i)}
                            className={cn(
                                "group relative flex flex-col items-center justify-center p-3 sm:p-4 rounded-xl sm:rounded-2xl border-2 transition-all duration-300",
                                selectedHorseId === i 
                                  ? "bg-secondary/10 border-secondary shadow-lg shadow-secondary/5" 
                                  : "bg-surface/50 border-outline-variant/10 hover:border-secondary/30"
                            )}
                        >
                            <div 
                                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-black mb-2 transition-transform group-hover:scale-110"
                                style={{ backgroundColor: selectedHorseId === i ? '#f00' : '#222', color: '#fff' }}
                            >
                                {i + 1}
                            </div>
                            <span className="text-[9px] sm:text-[10px] font-black text-on-surface/60 uppercase tracking-widest">Horse {i+1}</span>
                            {selectedHorseId === i && (
                                <motion.div layoutId="selection-ring" className="absolute -inset-1 rounded-[16px] sm:rounded-[20px] border border-secondary shadow-[0_0_15px_rgba(var(--secondary-rgb),0.2)]" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bet Amount */}
            <div className="space-y-4 sm:space-y-6">
                 <div className="flex items-center justify-between">
                    <h3 className="text-[9px] sm:text-[10px] font-black text-on-surface/40 uppercase tracking-[0.3em]">WAGER AMOUNT</h3>
                    <div className="text-[9px] sm:text-[10px] font-black text-on-surface/60">BAL: {formatCurrency(activePlayer.balance)}</div>
                </div>
                
                <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-3">
                    {[100, 500, 1000, 5000].map((amt) => (
                        <button
                            key={amt}
                            onClick={() => !isRacing && setSelectedChip(amt)}
                            className={cn(
                                "flex-1 py-3 rounded-lg sm:rounded-xl border font-black text-xs transition-all",
                                selectedChip === amt 
                                    ? "bg-on-surface text-surface border-on-surface" 
                                    : "bg-surface/50 border-outline-variant/10 hover:border-on-surface/30 text-on-surface/60"
                            )}
                        >
                            <span className="opacity-50 text-[9px] sm:text-[10px] mr-0.5">$</span>{amt.toLocaleString()}
                        </button>
                    ))}
                </div>
                
                <div className="flex items-center gap-2 sm:gap-4">
                    <button
                        onClick={() => !isRacing && setBetAmount(prev => Math.max(0, prev - selectedChip))}
                        disabled={isRacing || betAmount === 0}
                        className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl bg-surface/50 border-2 border-outline-variant/10 text-on-surface/40 hover:text-red-500 hover:border-red-500/30 transition-all disabled:opacity-30"
                    >
                        <Minus size={24} />
                    </button>

                    <div className="relative group flex-1">
                        <input 
                            type="text"
                            value={formatCurrency(betAmount)}
                            readOnly
                            disabled={isRacing}
                            className="w-full h-14 sm:h-16 bg-surface-container-highest/50 border-2 border-outline-variant/5 rounded-xl sm:rounded-2xl pl-4 pr-24 sm:pr-28 text-lg sm:text-xl font-black text-on-surface outline-none cursor-default"
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 sm:gap-3">
                            <button 
                                onClick={() => !isRacing && setBetAmount(activePlayer.balance)}
                                disabled={isRacing}
                                className="bg-secondary/10 hover:bg-secondary/20 text-secondary border border-secondary/20 font-black tracking-widest text-[9px] sm:text-[10px] px-2 sm:px-3 py-1 sm:py-1.5 rounded-md sm:rounded-lg transition-colors"
                            >
                                MAX
                            </button>
                            <span className="text-on-surface/20 font-black italic tracking-tighter text-sm sm:text-base hidden xs:inline transition-colors">
                                USD
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => !isRacing && setBetAmount(prev => prev + selectedChip)}
                        disabled={isRacing}
                        className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center rounded-xl bg-surface/50 border-2 border-outline-variant/10 text-on-surface/40 hover:text-green-500 hover:border-green-500/30 transition-all disabled:opacity-30"
                    >
                        <Plus size={24} />
                    </button>
                </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-4 mt-auto">
                {activePlayer.balance < betAmount && (
                    <div className="flex items-center gap-3 p-3 sm:p-4 bg-red-500/10 border border-red-500/20 rounded-xl sm:rounded-2xl text-red-500 mb-2">
                        <AlertCircle size={16} />
                        <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest">Insufficient Credits</span>
                    </div>
                )}
                
                <div className="flex gap-4">
                    <button
                        onClick={placeBet}
                        disabled={isRacing || selectedHorseId === null || activePlayer.balance < betAmount}
                        className={cn(
                            "flex-1 h-16 sm:h-20 rounded-xl sm:rounded-2xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 border-2 shadow-xl text-xs sm:text-sm",
                            bets.length > 0 
                                ? "bg-green-500/10 border-green-500/50 text-green-500 cursor-default"
                                : selectedHorseId === null || activePlayer.balance < betAmount 
                                    ? "bg-surface/50 border-outline-variant/10 text-on-surface/20 opacity-50"
                                    : "bg-on-surface text-surface border-on-surface hover:scale-[1.02] active:scale-95"
                        )}
                    >
                        {bets.length > 0 ? (
                            <>WAGER PLACED</>
                        ) : (
                            <>
                                <CircleDollarSign size={16} className="sm:w-5 sm:h-5" />
                                CONFIRM BET
                            </>
                        )}
                    </button>
                </div>
                
                <button
                    onClick={startRace}
                    disabled={isRacing || bets.length === 0}
                    className={cn(
                        "w-full h-16 sm:h-20 rounded-xl sm:rounded-2xl font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-2xl text-xs sm:text-sm",
                        isRacing || bets.length === 0
                            ? "bg-surface/50 text-on-surface/10 border border-white/5"
                            : "bg-secondary text-surface hover:scale-[1.02] active:scale-95 animate-pulse"
                    )}
                >
                    <Play size={16} fill="currentColor" className="sm:w-5 sm:h-5" />
                    {isRacing ? "IN PROGRESS" : "START DERBY"}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
