import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Trophy, 
  Play, 
  CircleDollarSign, 
  X,
  AlertCircle,
  Zap
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { RoulettePlayer } from '../lib/rouletteUtils';
import { HorseRacingEngine } from './HorseRacingEngine';

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
  const [lastWinner, setLastWinner] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  
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
      const payout = winningBet.amount * 5.5;
      setPlayers(prev => prev.map(p => 
        p.id === activePlayerIdRef.current 
          ? { ...p, balance: p.balance + payout } 
          : p
      ));
    }
    
    setBets([]);
  }, [setPlayers]);

  const startRace = () => {
    if (bets.length === 0) return;
    setIsRacing(true);
    setShowResult(false);
    setLastWinner(null);
  };

  return (
    <div className="flex flex-col h-full bg-surface-container overflow-y-auto lg:overflow-hidden">
      {/* Game Header */}
      <div className="flex items-center justify-between px-8 py-4 bg-surface/40 backdrop-blur-md border-b border-outline-variant/5">
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
            <p className="text-[10px] text-on-surface/40 font-black uppercase tracking-widest">High Stakes Racing • House Multiplier: 5.5x</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
            <div className="flex -space-x-2">
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

      <div className="flex-1 flex overflow-hidden lg:flex-row flex-col">
        {/* Left: Game Canvas Area */}
        <div className="flex-1 relative bg-black/20 flex items-center justify-center p-4 lg:p-8 overflow-hidden">
          <div className="relative w-full h-full max-w-6xl max-h-[720px] rounded-3xl overflow-hidden shadow-2xl border border-white/5 bg-[#0a0a0a] flex items-center justify-center [&_canvas]:w-full [&_canvas]:h-full [&_canvas]:object-contain">
            <HorseRacingEngine 
                width={1600} 
                height={900} 
                isRacing={isRacing} 
                onRaceFinish={handleRaceFinish} 
                horseImageUrl={HORSE_IMAGE_URL}
            />
            
            {/* Race Stats Overlay - Only during race */}
            {isRacing && (
                <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none">
                    <div className="px-6 py-3 bg-black/60 backdrop-blur-md rounded-2xl border border-white/5 flex items-center gap-3">
                        <Zap size={16} className="text-secondary" />
                        <span className="text-on-surface font-black tracking-widest text-sm italic uppercase">Live Feed</span>
                    </div>
                </div>
            )}
            
            {/* Overlay UI */}
            <AnimatePresence>
                {!isRacing && !showResult && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center text-center p-12"
                    >
                        <Trophy size={80} className="text-secondary mb-6" />
                        <h1 className="text-6xl font-black text-on-surface mb-4 uppercase tracking-tighter italic">PLACE YOUR BETS</h1>
                        <p className="text-on-surface/60 max-w-md mx-auto uppercase tracking-[0.2em] text-xs font-bold leading-relaxed">
                            Pick your champion. The higher the risk, the greater the glory. 
                        </p>
                    </motion.div>
                )}

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
                                {bets.some(b => b.horseId === lastWinner) ? (
                                    <div className="text-green-500">
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1">YOU WON</p>
                                        <p className="text-4xl font-black italic">{formatCurrency(bets.find(b => b.horseId === lastWinner)!.amount * 5.5)}</p>
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
        <div className="w-full lg:w-[420px] bg-surface/30 backdrop-blur-xl border-l border-outline-variant/10 p-10 flex flex-col gap-10 overflow-y-auto min-h-0">
            {/* Bet Selection */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-on-surface/40 uppercase tracking-[0.3em]">SELECT HORSE</h3>
                    <div className="px-3 py-1 bg-secondary/10 border border-secondary/20 rounded-full text-[9px] font-black text-secondary tracking-widest leading-none">
                        PRO ODDS: 1/6
                    </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <button
                            key={i}
                            onClick={() => !isRacing && setSelectedHorseId(i)}
                            className={cn(
                                "group relative flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all duration-300",
                                selectedHorseId === i 
                                  ? "bg-secondary/10 border-secondary shadow-lg shadow-secondary/5" 
                                  : "bg-surface/50 border-outline-variant/10 hover:border-secondary/30"
                            )}
                        >
                            <div 
                                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black mb-2 transition-transform group-hover:scale-110"
                                style={{ backgroundColor: selectedHorseId === i ? '#f00' : '#222', color: '#fff' }}
                            >
                                {i + 1}
                            </div>
                            <span className="text-[10px] font-black text-on-surface/60 uppercase tracking-widest">Horse {i+1}</span>
                            {selectedHorseId === i && (
                                <motion.div layoutId="selection-ring" className="absolute -inset-1 rounded-[20px] border border-secondary shadow-[0_0_15px_rgba(var(--secondary-rgb),0.2)]" />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Bet Amount */}
            <div className="space-y-6">
                 <div className="flex items-center justify-between">
                    <h3 className="text-[10px] font-black text-on-surface/40 uppercase tracking-[0.3em]">WAGER AMOUNT</h3>
                    <div className="text-[10px] font-black text-on-surface/60">BALANCE: {formatCurrency(activePlayer.balance)}</div>
                </div>
                
                <div className="flex items-center gap-3">
                    {[100, 500, 1000, 5000].map((amt) => (
                        <button
                            key={amt}
                            onClick={() => !isRacing && setBetAmount(amt)}
                            className={cn(
                                "flex-1 py-3 rounded-xl border font-black text-xs transition-all",
                                betAmount === amt 
                                    ? "bg-on-surface text-surface border-on-surface" 
                                    : "bg-surface/50 border-outline-variant/10 hover:border-on-surface/30 text-on-surface/60"
                            )}
                        >
                            <span className="opacity-50 text-[10px] mr-0.5">$</span>{amt.toLocaleString()}
                        </button>
                    ))}
                </div>
                
                <div className="relative group">
                    <input 
                        type="number"
                        value={betAmount}
                        onChange={(e) => setBetAmount(Math.max(1, parseInt(e.target.value) || 0))}
                        disabled={isRacing}
                        className="w-full h-16 bg-surface-container-highest/50 border-2 border-outline-variant/5 rounded-2xl px-6 text-2xl font-black text-on-surface outline-none focus:border-secondary transition-all"
                    />
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-on-surface/20 font-black italic tracking-tighter text-xl group-focus-within:text-secondary transition-colors">
                        USD
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-4 mt-auto">
                {activePlayer.balance < betAmount && (
                    <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 mb-2">
                        <AlertCircle size={18} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Insufficient Credits</span>
                    </div>
                )}
                
                <div className="flex gap-4">
                    <button
                        onClick={placeBet}
                        disabled={isRacing || selectedHorseId === null || activePlayer.balance < betAmount}
                        className={cn(
                            "flex-1 h-20 rounded-2xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 border-2 shadow-xl",
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
                                <CircleDollarSign size={20} />
                                CONFIRM BET
                            </>
                        )}
                    </button>
                </div>
                
                <button
                    onClick={startRace}
                    disabled={isRacing || bets.length === 0}
                    className={cn(
                        "w-full h-20 rounded-2xl font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-2xl",
                        isRacing || bets.length === 0
                            ? "bg-surface/50 text-on-surface/10 border border-white/5"
                            : "bg-secondary text-surface hover:scale-[1.02] active:scale-95 animate-pulse"
                    )}
                >
                    <Play size={20} fill="currentColor" />
                    {isRacing ? "RACE IN PROGRESS" : "START DERBY"}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};
