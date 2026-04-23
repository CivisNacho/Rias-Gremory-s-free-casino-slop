import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, Play, CircleDollarSign, X, AlertCircle, Plus, Minus } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { RoulettePlayer } from '../lib/rouletteUtils';
import { HorseRacingEngine, Horse, RaceUpdatePayload } from './HorseRacingEngine';

const HORSE_IMAGE_URL = 'https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/gif/horse_gif_loop.gif';
const HORSES_COUNT = 10;
const HORSE_SWATCHES = [
  '#f8d568',
  '#b7e08c',
  '#9ac7ff',
  '#ffc9a6',
  '#cab6ff',
  '#8fe5cf',
  '#f6a5d5',
  '#a7f0ff',
  '#ffd98f',
  '#deb8ff'
];

const clamp = (min: number, max: number, value: number) => Math.max(min, Math.min(max, value));

interface HorseRacingGameProps {
  players: RoulettePlayer[];
  activePlayerId: string;
  setPlayers: React.Dispatch<React.SetStateAction<RoulettePlayer[]>>;
  onExit: () => void;
}

interface Bet {
  horseId: number;
  amount: number;
  decimalOdds: number;
}

type HorseTier = 'Favorite' | 'Contender' | 'Midfield' | 'Longshot';

interface HorseMarket {
  horseId: number;
  tier: HorseTier;
  strength: number;
  probability: number;
  decimalOdds: number;
}

export const HorseRacingGame = ({ players, activePlayerId, setPlayers, onExit }: HorseRacingGameProps) => {
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
  const [standings, setStandings] = useState<number[]>([]);
  const [positionDelta, setPositionDelta] = useState<Record<number, number>>({});
  const [horseMarket, setHorseMarket] = useState<HorseMarket[]>([]);

  const betsRef = useRef(bets);
  const activePlayerIdRef = useRef(activePlayerId);

  useEffect(() => {
    betsRef.current = bets;
  }, [bets]);

  useEffect(() => {
    activePlayerIdRef.current = activePlayerId;
  }, [activePlayerId]);

  const activePlayer = useMemo(() => players.find((p) => p.id === activePlayerId) || players[0], [players, activePlayerId]);

  useEffect(() => {
    const base = Array.from({ length: HORSES_COUNT }).map((_, i) => {
      if (i < 2) return 1.16 + Math.random() * 0.05;
      if (i < 5) return 1.03 + Math.random() * 0.08;
      if (i < 8) return 0.93 + Math.random() * 0.08;
      return 0.79 + Math.random() * 0.08;
    });

    const temp = 4.8;
    const exp = base.map((score) => Math.exp(score * temp));
    const totalExp = exp.reduce((sum, value) => sum + value, 0);
    const houseMargin = 1.09;

    const nextMarket: HorseMarket[] = base.map((strength, horseId) => {
      const probability = exp[horseId] / totalExp;
      const decimalOdds = clamp(1.35, 18, (1 / probability) * houseMargin);
      const tier: HorseTier =
        probability >= 0.17 ? 'Favorite' : probability >= 0.11 ? 'Contender' : probability >= 0.075 ? 'Midfield' : 'Longshot';

      return { horseId, tier, strength, probability, decimalOdds };
    });

    setHorseMarket(nextMarket);
  }, []);

  const marketByHorseId = useMemo(() => new Map(horseMarket.map((entry) => [entry.horseId, entry])), [horseMarket]);
  const horseStrengths = useMemo(() => horseMarket.map((entry) => entry.strength), [horseMarket]);

  const placeBet = () => {
    if (selectedHorseId === null || isRacing) return;
    if (activePlayer.balance < betAmount) return;
    const market = marketByHorseId.get(selectedHorseId);
    if (!market) return;

    setBets([{ horseId: selectedHorseId, amount: betAmount, decimalOdds: market.decimalOdds }]);

    setPlayers((prev) =>
      prev.map((p) =>
        p.id === activePlayerId
          ? {
              ...p,
              balance: p.balance - betAmount
            }
          : p
      )
    );
  };

  const handleRaceFinish = useCallback(
    (winnerId: number) => {
      setIsRacing(false);
      setLastWinner(winnerId);
      setHistory((prev) => [winnerId, ...prev].slice(0, 10));
      setShowResult(true);

      const currentBets = betsRef.current;
      const winningBet = currentBets.find((b) => b.horseId === winnerId);

      if (winningBet) {
        const payout = Math.round(winningBet.amount * winningBet.decimalOdds);
        setWinningPayout(payout);
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === activePlayerIdRef.current
              ? {
                  ...p,
                  balance: p.balance + payout
                }
              : p
          )
        );
      } else {
        setWinningPayout(0);
      }

      setBets([]);
    },
    [setPlayers]
  );

  const handleRaceUpdate = useCallback((payload: RaceUpdatePayload) => {
    setLiveHorses(payload.horses);
    setStandings(payload.standings);
  }, []);

  const startRace = () => {
    if (bets.length === 0) return;
    setLiveHorses([]);
    setWinningPayout(0);
    setStandings([]);
    setPositionDelta({});
    setIsRacing(true);
    setShowResult(false);
    setLastWinner(null);
  };

  const sortedHorses = useMemo(() => {
    if (standings.length === 0) {
      return [...liveHorses].sort((a, b) => b.position - a.position);
    }

    const byId = new Map(liveHorses.map((horse) => [horse.id, horse]));
    return standings.map((id) => byId.get(id)).filter(Boolean) as Horse[];
  }, [liveHorses, standings]);

  const previousStandingsRef = useRef<number[]>([]);
  useEffect(() => {
    if (standings.length === 0) {
      previousStandingsRef.current = [];
      return;
    }
    const prev = previousStandingsRef.current;
    const delta: Record<number, number> = {};
    standings.forEach((horseId, idx) => {
      const prevIdx = prev.indexOf(horseId);
      delta[horseId] = prevIdx === -1 ? 0 : prevIdx - idx;
    });
    setPositionDelta(delta);
    previousStandingsRef.current = standings;
  }, [standings]);

  const f1Standings = useMemo(
    () =>
      sortedHorses.slice(0, HORSES_COUNT).map((horse, idx) => ({ horse, idx, delta: positionDelta[horse.id] || 0 })),
    [sortedHorses, positionDelta]
  );

  const sortedByOdds = useMemo(() => [...horseMarket].sort((a, b) => a.decimalOdds - b.decimalOdds), [horseMarket]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gradient-to-b from-[#132619] via-[#0f1912] to-[#090d09] text-[#f2ebd7]">
      <div className="flex-none flex items-center justify-between px-4 py-3 sm:px-8 sm:py-4 bg-gradient-to-r from-[#431f1d] via-[#5b2a27] to-[#3b1817] border-b border-[#b68a39]/35 shadow-[0_14px_32px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-[#c59a46]/20 border border-[#d6b068]/55 overflow-hidden flex items-center justify-center shadow-inner shadow-black/40">
            <img
              src="https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/heads/main/images/horse_race_icon.jpg"
              alt="Royal Derby Icon"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h2 className="text-lg sm:text-2xl font-black tracking-[0.09em] uppercase text-[#f4e2b2]">Royal Horse Derby</h2>
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.28em] text-[#dec693]/75 font-bold">
              Luxury Grandstand Broadcast • Dynamic Tote Market
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="hidden sm:flex -space-x-2">
            {history.map((winnerId, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full border-2 bg-[#1b1f1a] flex items-center justify-center text-[10px] font-black text-[#f7eed9]"
                style={{ borderColor: HORSE_SWATCHES[winnerId % HORSE_SWATCHES.length] }}
              >
                {winnerId + 1}
              </div>
            ))}
          </div>

          <button
            onClick={onExit}
            className="p-2 rounded-full text-[#f2e6ca]/70 hover:text-[#ff9c86] hover:bg-black/20 transition-colors"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div className="flex-none lg:flex-1 relative flex items-center justify-center p-2 sm:p-4 lg:p-8 min-h-[300px] aspect-video lg:aspect-auto overflow-hidden bg-[radial-gradient(circle_at_top,#2c3e2c_0%,#121913_58%,#090d09_100%)]">
          <div className="relative w-full h-full max-w-6xl max-h-[720px] rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_30px_60px_rgba(0,0,0,0.55)] border border-[#d2af68]/35 bg-[#0a120b] flex items-center justify-center [&_canvas]:w-full [&_canvas]:h-full [&_canvas]:object-contain">
            <HorseRacingEngine
              width={1600}
              height={900}
              isRacing={isRacing}
              onRaceFinish={handleRaceFinish}
              onRaceUpdate={handleRaceUpdate}
              horseImageUrl={HORSE_IMAGE_URL}
              horsesCount={HORSES_COUNT}
              horseStrengths={horseStrengths}
            />

            <AnimatePresence>
              {!isRacing && !showResult && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-[linear-gradient(180deg,rgba(19,23,16,0.58)_0%,rgba(11,14,10,0.72)_100%)] backdrop-blur-[2px] flex flex-col items-center justify-center text-center p-8 sm:p-12 z-50"
                >
                  <Trophy size={74} className="text-[#cfa44c] mb-6 drop-shadow-[0_0_12px_rgba(207,164,76,0.4)]" />
                  <h1 className="text-4xl sm:text-6xl font-black text-[#f6e7c3] mb-4 uppercase tracking-[0.06em]">The Gates Are Open</h1>
                  <p className="text-[#e5d4ac]/80 max-w-xl mx-auto uppercase tracking-[0.24em] text-[10px] sm:text-xs font-bold leading-relaxed">
                    Stake your claim, choose your champion, and let the grandstand witness your fortune.
                  </p>
                </motion.div>
              )}

              {showResult && lastWinner !== null && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  className="absolute inset-x-0 bottom-6 sm:bottom-10 flex justify-center px-4 sm:px-10"
                >
                  <div className="bg-[linear-gradient(160deg,#322118_0%,#221710_100%)] border border-[#d0ab62]/50 p-5 sm:p-8 rounded-3xl shadow-[0_24px_44px_rgba(0,0,0,0.45)] flex flex-col sm:flex-row items-center gap-6 sm:gap-10 max-w-4xl w-full text-[#f1e8d3]">
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#c89b45] flex items-center justify-center text-[#1b140f] shadow-[0_10px_30px_rgba(200,155,69,0.35)]">
                        <Trophy size={44} />
                      </div>
                      <div>
                        <h2 className="text-2xl sm:text-4xl font-black uppercase tracking-[0.05em]">Winner: Horse #{lastWinner + 1}</h2>
                        <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#dcbf86]/80">Stewards Confirmed Final Order</p>
                      </div>
                    </div>

                    <div className="sm:flex-1 sm:border-l border-[#d0ab62]/25 sm:pl-8 text-center sm:text-left">
                      {winningPayout > 0 ? (
                        <div className="text-[#74f2a2]">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1">You Won</p>
                          <p className="text-3xl sm:text-4xl font-black">{formatCurrency(winningPayout)}</p>
                        </div>
                      ) : (
                        <div className="text-[#e9dfca]/45">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1">No Winnings</p>
                          <p className="text-3xl sm:text-4xl font-black">$0.00</p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setShowResult(false)}
                      className="px-6 py-3 sm:px-8 sm:py-4 bg-[#c89b45] text-[#24180f] rounded-2xl font-black uppercase tracking-[0.16em] hover:scale-105 active:scale-95 transition-all text-xs sm:text-sm"
                    >
                      Continue
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex-1 lg:flex-none w-full lg:w-[430px] bg-[linear-gradient(180deg,#1f2a1f_0%,#151d16_100%)] border-t lg:border-l border-[#b68a39]/25 p-5 sm:p-8 lg:p-9 flex flex-col gap-6 overflow-y-auto min-h-0">
          <div className="rounded-2xl border border-[#b68a39]/20 bg-black/20 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-[#dcbc7b] uppercase tracking-[0.28em]">Select Horse</h3>
              {selectedHorseId !== null && marketByHorseId.get(selectedHorseId) ? (
                <div className="px-3 py-1 bg-[#b68a39]/15 border border-[#b68a39]/30 rounded-full text-[9px] font-black text-[#e6cb95] tracking-widest leading-none">
                  {marketByHorseId.get(selectedHorseId)?.tier} • {marketByHorseId.get(selectedHorseId)?.decimalOdds.toFixed(2)}x
                </div>
              ) : (
                <div className="px-3 py-1 bg-[#b68a39]/10 border border-[#b68a39]/20 rounded-full text-[9px] font-black text-[#d9c79f]/80 tracking-widest leading-none">
                  Pick Runner
                </div>
              )}
            </div>

            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: HORSES_COUNT }).map((_, i) => (
                (() => {
                  const market = marketByHorseId.get(i);
                  const tierTone =
                    market?.tier === 'Favorite'
                      ? 'text-[#f6df8b]'
                      : market?.tier === 'Contender'
                        ? 'text-[#9ce3ff]'
                        : market?.tier === 'Midfield'
                          ? 'text-[#cfb8ff]'
                          : 'text-[#f2b0a6]';

                  return (
                <button
                  key={i}
                  onClick={() => !isRacing && setSelectedHorseId(i)}
                  className={cn(
                    'group relative flex flex-col items-center justify-center py-2 rounded-xl border transition-all duration-200',
                    selectedHorseId === i
                      ? 'bg-[#b68a39]/18 border-[#d9b66f] shadow-[0_0_0_1px_rgba(217,182,111,0.4)]'
                      : 'bg-[#111611]/60 border-[#9f7f41]/20 hover:border-[#cda65c]/50'
                  )}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black mb-1 text-[#10120e]"
                    style={{ backgroundColor: HORSE_SWATCHES[i % HORSE_SWATCHES.length] }}
                  >
                    {i + 1}
                  </div>
                  <span className="text-[9px] font-black text-[#f0e3c6]/75">H{i + 1}</span>
                  <span className={cn('text-[8px] font-black mt-0.5 leading-none', tierTone)}>{market?.decimalOdds.toFixed(2)}x</span>
                </button>
                  );
                })()
              ))}
            </div>
          </div>

          {sortedByOdds.length > 0 && (
            <div className="rounded-2xl border border-[#b68a39]/20 bg-black/20 p-4 space-y-3">
              <h3 className="text-[10px] font-black text-[#dcbc7b] uppercase tracking-[0.28em]">Market Board</h3>
              <div className="space-y-1.5">
                {sortedByOdds.map((entry) => (
                  <div key={entry.horseId} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-[#13151f]/90 border border-white/5">
                    <div className="flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full" style={{ backgroundColor: HORSE_SWATCHES[entry.horseId % HORSE_SWATCHES.length] }} />
                      <span className="text-[10px] font-black text-[#ecf1ff]">Horse {entry.horseId + 1}</span>
                      <span className="text-[9px] font-black text-[#adb7d8]/80">{entry.tier}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] font-black text-[#f8e8be]">{entry.decimalOdds.toFixed(2)}x</div>
                      <div className="text-[8px] font-black text-[#97a3c7]/80">{(entry.probability * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[#b68a39]/20 bg-black/20 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-[#dcbc7b] uppercase tracking-[0.28em]">Wager Amount</h3>
              <div className="text-[10px] font-black text-[#e4d2ac]/75">BAL: {formatCurrency(activePlayer.balance)}</div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[100, 500, 1000, 5000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => !isRacing && setSelectedChip(amt)}
                  className={cn(
                    'py-2.5 rounded-lg border font-black text-xs transition-all',
                    selectedChip === amt
                      ? 'bg-[#dbc084] text-[#25190f] border-[#f0d39a]'
                      : 'bg-[#111611]/60 border-[#8d7138]/25 hover:border-[#c8a460]/50 text-[#e8dbc0]/70'
                  )}
                >
                  <span className="opacity-60 text-[9px] mr-0.5">$</span>
                  {amt.toLocaleString()}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => !isRacing && setBetAmount((prev) => Math.max(0, prev - selectedChip))}
                disabled={isRacing || betAmount === 0}
                className="w-12 h-12 flex items-center justify-center rounded-xl bg-[#141914] border border-[#8f7440]/30 text-[#e3d1ae]/60 hover:text-[#ff9b8d] hover:border-[#cf7868]/60 transition-all disabled:opacity-30"
              >
                <Minus size={20} />
              </button>

              <div className="relative flex-1">
                <input
                  type="text"
                  value={formatCurrency(betAmount)}
                  readOnly
                  disabled={isRacing}
                  className="w-full h-12 bg-[#0f150f] border border-[#8f7440]/30 rounded-xl pl-3 pr-20 text-lg font-black text-[#f5e5bf] outline-none cursor-default"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                  <button
                    onClick={() => !isRacing && setBetAmount(activePlayer.balance)}
                    disabled={isRacing}
                    className="bg-[#b68a39]/20 hover:bg-[#b68a39]/30 text-[#e4c98e] border border-[#b68a39]/35 font-black tracking-widest text-[9px] px-2 py-1 rounded-md transition-colors"
                  >
                    MAX
                  </button>
                  <span className="text-[#bfa97c]/45 font-black text-xs hidden xs:inline">USD</span>
                </div>
              </div>

              <button
                onClick={() => !isRacing && setBetAmount((prev) => prev + selectedChip)}
                disabled={isRacing}
                className="w-12 h-12 flex items-center justify-center rounded-xl bg-[#141914] border border-[#8f7440]/30 text-[#e3d1ae]/60 hover:text-[#74f2a2] hover:border-[#6ec896]/60 transition-all disabled:opacity-30"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[#b68a39]/20 bg-black/20 p-4 space-y-4 mt-auto">
            {activePlayer.balance < betAmount && (
              <div className="flex items-center gap-3 p-3 bg-[#a53838]/18 border border-[#d36a6a]/35 rounded-xl text-[#ff9f9f]">
                <AlertCircle size={16} />
                <span className="text-[10px] font-black uppercase tracking-widest">Insufficient Credits</span>
              </div>
            )}

            <button
              onClick={placeBet}
              disabled={isRacing || selectedHorseId === null || activePlayer.balance < betAmount}
              className={cn(
                'w-full h-14 rounded-xl font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 border text-xs',
                bets.length > 0
                  ? 'bg-[#2a6c3f]/22 border-[#5ea97a]/55 text-[#9bffbe] cursor-default'
                  : selectedHorseId === null || activePlayer.balance < betAmount
                    ? 'bg-[#0f150f]/70 border-[#7f6536]/20 text-[#d7c9ab]/30 opacity-60'
                    : 'bg-[#d2ac62] text-[#26190f] border-[#f0ce89] hover:scale-[1.01] active:scale-95'
              )}
            >
              {bets.length > 0 ? (
                <>Wager @ {bets[0].decimalOdds.toFixed(2)}x</>
              ) : (
                <>
                  <CircleDollarSign size={16} />
                  Confirm Bet
                </>
              )}
            </button>

            <button
              onClick={startRace}
              disabled={isRacing || bets.length === 0}
              className={cn(
                'w-full h-14 rounded-xl font-black uppercase tracking-[0.28em] transition-all flex items-center justify-center gap-2 shadow-xl text-xs',
                isRacing || bets.length === 0
                  ? 'bg-[#101610] text-[#e0d2b7]/20 border border-[#8b7141]/20'
                  : 'bg-[#5e7a35] text-[#f4efdf] border border-[#99bf62] hover:scale-[1.01] active:scale-95'
              )}
            >
              <Play size={16} fill="currentColor" />
              {isRacing ? 'In Progress' : 'Start Derby'}
            </button>
          </div>

          <div className="rounded-2xl border border-[#b68a39]/20 bg-black/20 p-4">
            <h4 className="text-[10px] font-black uppercase tracking-[0.24em] text-[#dcbc7b] mb-3">Live Standings</h4>
            <div className="overflow-hidden rounded-xl border border-white/5">
              {f1Standings.length > 0 ? (
                f1Standings.map(({ horse, idx, delta }) => (
                  <motion.div
                    key={horse.id}
                    layout
                    transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                    className={cn(
                      'relative flex items-center h-9 px-3 bg-[#141626] border-b border-white/5 last:border-b-0',
                      idx % 2 === 0 ? 'bg-[#191b2b]' : 'bg-[#131525]'
                    )}
                  >
                    <span className="w-6 text-[16px] font-black tracking-tight text-[#d6dae6]/90">{idx + 1}</span>
                    <span className="w-1 h-5 rounded-full mx-2" style={{ backgroundColor: HORSE_SWATCHES[horse.id % HORSE_SWATCHES.length] }} />
                    <span className="text-[12px] leading-none font-black tracking-[0.02em] text-[#f3f5ff] truncate pr-2">{horse.name}</span>
                    <span className="ml-auto text-[10px] font-black tracking-wider text-[#9ea6bf]">#{horse.id + 1}</span>
                  </motion.div>
                ))
              ) : (
                <div className="h-24 grid place-items-center text-[10px] tracking-[0.18em] uppercase text-[#8f95aa] font-black bg-[#131525]">
                  Standings Awaiting Start
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
