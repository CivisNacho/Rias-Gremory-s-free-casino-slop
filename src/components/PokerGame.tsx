import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Crown,
  Flag,
  RotateCcw,
  ShieldCheck,
  Target,
  Trophy,
  Wallet,
  Zap,
  Info,
  X
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import confetti from 'canvas-confetti';
import { cn } from '../lib/utils';
import {
  BIG_BLIND,
  SMALL_BLIND,
  Card,
  HandRank,
  PokerPlayerState,
  buildSidePots,
  compareHands,
  countPlayersAbleToAct,
  countPlayersInHand,
  createDeck,
  describeStreet,
  getBestHand,
  getHoleCardStrength,
  getNextEligibleIndex
} from '../lib/pokerUtils';
import { RoulettePlayer } from '../lib/rouletteUtils';
import { PokerBoard } from './PokerBoard';

const BOT_NAMES = ['Issei', 'Koneko', 'Kiba', 'Xenovia'];
const TABLE_SIZE = 5;

type TablePhase = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'payout';
type PlayerAction = 'fold' | 'check' | 'call' | 'raise' | 'all-in';
type ChipPulse = {
  id: number;
  playerId: string;
  amount: number;
  direction: 'toPot' | 'fromPot';
  tone: 'good' | 'bad' | 'neutral';
};

const usePokerAudio = () => {
  const audioCtx = useRef<AudioContext | null>(null);

  const init = useCallback(() => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)!();
    }
    if (audioCtx.current.state === 'suspended') {
      void audioCtx.current.resume();
    }
  }, []);

  const playTone = useCallback((freq: number, type: OscillatorType, volume: number, duration: number) => {
    if (!audioCtx.current) return;
    const oscillator = audioCtx.current.createOscillator();
    const gain = audioCtx.current.createGain();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.current.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.current.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioCtx.current.destination);
    oscillator.start();
    oscillator.stop(audioCtx.current.currentTime + duration);
  }, []);

  return {
    init,
    chipPlace: () => {
      init();
      playTone(300, 'square', 0.04, 0.08);
      setTimeout(() => playTone(520, 'triangle', 0.02, 0.08), 24);
    },
    cardReveal: () => {
      init();
      playTone(640, 'sine', 0.02, 0.08);
    },
    foldSound: () => {
      init();
      playTone(120, 'sawtooth', 0.03, 0.15);
    },
    winSound: () => {
      init();
      [440, 554, 659, 880].forEach((tone, index) => {
        setTimeout(() => playTone(tone, 'sine', 0.04, 0.25), index * 90);
      });
    }
  };
};

export interface PokerGameProps {
  players: RoulettePlayer[];
  activePlayerId: string;
  setPlayers: React.Dispatch<React.SetStateAction<RoulettePlayer[]>>;
  setActivePlayerId: (id: string) => void;
  onAddPlayer: () => void;
  onExit: () => void;
}

export const PokerGame = ({ players, activePlayerId, setPlayers, onExit }: PokerGameProps) => {
  const audio = usePokerAudio();
  const showdownTimerRef = useRef<number | null>(null);
  const chipPulseIdRef = useRef(0);

  const [phase, setPhase] = useState<TablePhase>('idle');
  const [pokerPlayers, setPokerPlayers] = useState<PokerPlayerState[]>([]);
  const [dealerIndex, setDealerIndex] = useState(-1);
  const [currentTurnIndex, setCurrentTurnIndex] = useState(-1);
  const [communityCards, setCommunityCards] = useState<Card[]>([]);
  const [boardRunout, setBoardRunout] = useState<Card[]>([]);
  const [currentBet, setCurrentBet] = useState(0);
  const [lastRaiseSize, setLastRaiseSize] = useState(BIG_BLIND);
  const [raiseAmount, setRaiseAmount] = useState(BIG_BLIND);
  const [handMessage, setHandMessage] = useState('Blinds are 25/50. Start a new Texas Hold’em hand when you are ready.');
  const [events, setEvents] = useState<{ time: string; label: string; detail: string; tone?: 'good' | 'bad' | 'neutral' }[]>([]);
  const [history, setHistory] = useState<{ result: string; amount: number; time: string; tone: 'good' | 'bad' | 'neutral' }[]>([]);
  const [chipPulse, setChipPulse] = useState<ChipPulse | null>(null);
  const [showAdviceModal, setShowAdviceModal] = useState(false);

  const activeProfile = useMemo(
    () => players.find((player) => player.id === activePlayerId) ?? players[0],
    [players, activePlayerId]
  );

  const mainHuman = useMemo(
    () => pokerPlayers.find((player) => player.id === activePlayerId),
    [pokerPlayers, activePlayerId]
  );

  const totalPot = useMemo(
    () => pokerPlayers.reduce((sum, player) => sum + player.totalContribution, 0),
    [pokerPlayers]
  );

  const currentTurnPlayer = currentTurnIndex >= 0 ? pokerPlayers[currentTurnIndex] : undefined;
  const revealAllCards = phase === 'showdown' || phase === 'payout';
  const streetLabel = describeStreet(communityCards);
  const phaseLabel = phase === 'idle' ? 'Table Ready' : phase === 'showdown' ? 'Cards Up' : phase === 'payout' ? 'Payout' : 'Betting Round';

  const addEvent = useCallback((label: string, detail: string, tone: 'good' | 'bad' | 'neutral' = 'neutral') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setEvents((previous) => [{ time, label, detail, tone }, ...previous].slice(0, 10));
  }, []);

  const addHistory = useCallback((result: string, amount: number, tone: 'good' | 'bad' | 'neutral') => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setHistory((previous) => [{ result, amount, time, tone }, ...previous].slice(0, 6));
  }, []);

  const syncExternalBalance = useCallback(
    (playerId: string, delta: number) => {
      setPlayers((previous) =>
        previous.map((player) => (player.id === playerId ? { ...player, balance: player.balance + delta } : player))
      );
    },
    [setPlayers]
  );

  const queueChipPulse = useCallback((playerId: string, amount: number, direction: ChipPulse['direction'], tone: ChipPulse['tone'] = 'neutral') => {
    if (amount <= 0) return;
    const id = ++chipPulseIdRef.current;
    setChipPulse({ id, playerId, amount, direction, tone });
    window.setTimeout(() => {
      setChipPulse((current) => (current?.id === id ? null : current));
    }, 1100);
  }, []);

  useEffect(() => {
    return () => {
      if (showdownTimerRef.current) {
        window.clearTimeout(showdownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!activeProfile) return;

    setPokerPlayers((previous) => {
      const existingBots = previous.filter((player) => player.isBot);
      const bots =
        existingBots.length > 0
          ? existingBots
          : BOT_NAMES.map((name, index) => ({
              id: `bot-${index}`,
              name,
              isBot: true,
              stack: 5000,
              cards: [],
              currentBet: 0,
              totalContribution: 0,
              status: 'active' as const,
              actedThisStreet: false,
              sessionProfit: 0
            }));

      const humanSeat: PokerPlayerState = {
        id: activeProfile.id,
        name: activeProfile.name,
        isBot: false,
        stack: activeProfile.balance,
        cards: [],
        currentBet: 0,
        totalContribution: 0,
        status: activeProfile.balance > 0 ? 'active' : 'out',
        actedThisStreet: false,
        sessionProfit: previous.find((player) => player.id === activeProfile.id)?.sessionProfit ?? 0
      };

      return [humanSeat, ...bots].slice(0, TABLE_SIZE).map((player): PokerPlayerState => {
        if (player.id === activeProfile.id) {
          return humanSeat;
        }
        return player.stack > 0
          ? { ...player, status: player.cards.length > 0 && player.status === 'all-in' ? 'all-in' : 'active' }
          : { ...player, status: 'out' };
      });
    });
  }, [activePlayerId]);

  const getSeatRole = useCallback(
    (seatIndex: number, roster: PokerPlayerState[]) => {
      if (dealerIndex < 0 || roster.length === 0) return '';
      const dealer = dealerIndex;
      const smallBlind = getNextEligibleIndex(roster, dealer, true);
      const bigBlind = smallBlind >= 0 ? getNextEligibleIndex(roster, smallBlind, true) : -1;
      if (seatIndex === dealer) return 'Dealer';
      if (seatIndex === smallBlind) return 'Small Blind';
      if (seatIndex === bigBlind) return 'Big Blind';
      return 'Seat';
    },
    [dealerIndex]
  );

  const getLiveInsight = useCallback(() => {
    if (!mainHuman) {
      return 'The table is waiting for a valid bankroll.';
    }
    if (phase === 'idle') {
      return 'A new hand will post the blinds automatically and start from the player left of the big blind.';
    }
    if (communityCards.length < 3) {
      const strength = getHoleCardStrength(mainHuman.cards);
      if (strength >= 30) return 'Premium hole cards. Pressure the table when the action comes to you.';
      if (strength >= 20) return 'Playable pre-flop hand. Calling or raising can both make sense here.';
      return 'Marginal pre-flop holding. Be disciplined if the action gets expensive.';
    }
    if (mainHuman.cards.length === 2 && communityCards.length >= 3) {
      const best = getBestHand([...mainHuman.cards, ...communityCards]);
      if (best.rank >= HandRank.Flush) return `You are sitting on a strong made hand: ${best.description}.`;
      if (best.rank >= HandRank.Pair) return `You have ${best.description}. Watch the bet sizing and side-pot pressure.`;
      return 'You have not connected strongly yet. Fold to heavy action unless the price is great.';
    }
    return 'Stay aware of stack depth, current bet, and who is already all-in.';
  }, [communityCards, mainHuman, phase]);

  const shouldCompleteStreet = useCallback(
    (roster: PokerPlayerState[], streetBet: number) => {
      const activePlayers = roster.filter((player) => player.status === 'active');
      if (activePlayers.length === 0) return true;
      return activePlayers.every((player) => player.actedThisStreet && player.currentBet === streetBet);
    },
    []
  );

  const beginNextStreet = useCallback(
    (roster: PokerPlayerState[], nextCommunityCards: Card[], nextPhase: TablePhase, board: Card[]) => {
      const refreshedRoster = roster.map((player) =>
        player.status === 'active'
          ? { ...player, currentBet: 0, actedThisStreet: false, lastAction: undefined }
          : { ...player, currentBet: 0, actedThisStreet: true }
      );

      setPokerPlayers(refreshedRoster);
      setCommunityCards(nextCommunityCards);
      setCurrentBet(0);
      setLastRaiseSize(BIG_BLIND);
      setPhase(nextPhase);

      const openerIndex = getNextEligibleIndex(refreshedRoster, dealerIndex, false);
      setCurrentTurnIndex(openerIndex);
      setHandMessage(
        nextPhase === 'flop'
          ? 'Three community cards are out. Betting starts left of the dealer.'
          : nextPhase === 'turn'
            ? 'The turn is live. Stack pressure matters more now.'
            : 'Final betting round. Set up the showdown or force folds.'
      );
      addEvent(describeStreet(nextCommunityCards), `${nextCommunityCards.length} community cards revealed`, 'neutral');

      if (nextCommunityCards.length > communityCards.length) {
        audio.cardReveal();
      }

      if (countPlayersAbleToAct(refreshedRoster) === 0) {
        const fullBoard = board.slice(0, 5);
        showdown(refreshedRoster, fullBoard);
      }
    },
    [addEvent, audio, communityCards.length, dealerIndex]
  );

  const showdown = useCallback(
    (roster: PokerPlayerState[], fullBoard: Card[]) => {
      const evaluatedRoster = roster.map((player) => {
        if (player.status === 'folded' || player.status === 'out') {
          return { ...player, handResult: undefined, winnings: 0 };
        }
        const handResult = getBestHand([...player.cards, ...fullBoard]);
        return { ...player, handResult, winnings: 0 };
      });

      const payouts: Record<string, number> = {};
      const pots = buildSidePots(evaluatedRoster);

      pots.forEach((pot) => {
        const contenders = evaluatedRoster.filter((player) => pot.eligiblePlayerIds.includes(player.id) && player.handResult);
        if (contenders.length === 0) return;

        let winners = [contenders[0]];
        for (let index = 1; index < contenders.length; index += 1) {
          const comparison = compareHands(contenders[index].handResult!, winners[0].handResult!);
          if (comparison > 0) {
            winners = [contenders[index]];
          } else if (comparison === 0) {
            winners.push(contenders[index]);
          }
        }

        const baseShare = Math.floor(pot.amount / winners.length);
        let remainder = pot.amount % winners.length;
        const orderedWinners = [...winners].sort(
          (left, right) => ((pokerPlayers.findIndex((player) => player.id === left.id) - dealerIndex + pokerPlayers.length) % pokerPlayers.length) -
            ((pokerPlayers.findIndex((player) => player.id === right.id) - dealerIndex + pokerPlayers.length) % pokerPlayers.length)
        );

        orderedWinners.forEach((winner) => {
          const bonusChip = remainder > 0 ? 1 : 0;
          remainder = Math.max(0, remainder - 1);
          payouts[winner.id] = (payouts[winner.id] ?? 0) + baseShare + bonusChip;
        });
      });

      const settledRoster = evaluatedRoster.map((player) => {
        const payout = payouts[player.id] ?? 0;
        const profit = payout - player.totalContribution;
        const nextStack = player.stack + payout;
        return {
          ...player,
          winnings: payout,
          stack: nextStack,
          sessionProfit: player.sessionProfit + profit,
          status: nextStack > 0 ? player.status : 'out'
        };
      });

      settledRoster.forEach((player, index) => {
        const original = roster[index];
        const delta = player.stack - original.stack;
        if (!player.isBot && delta !== 0) {
          syncExternalBalance(player.id, delta);
        }
      });

      const humanResult = settledRoster.find((player) => player.id === activePlayerId);
      if (humanResult) {
        const profit = (humanResult.winnings ?? 0) - humanResult.totalContribution;
        if (profit > 0) {
          audio.winSound();
          queueChipPulse(humanResult.id, humanResult.winnings ?? 0, 'fromPot', 'good');
          confetti({
            particleCount: 120,
            spread: 80,
            origin: { y: 0.72 },
            colors: ['#facc15', '#22d3ee', '#ffffff']
          });
          addHistory(humanResult.handResult?.description ?? 'Showdown win', profit, 'good');
          addEvent('Showdown won', `${humanResult.handResult?.description ?? 'Best hand'} for +$${profit}`, 'good');
        } else if (profit < 0) {
          addHistory(humanResult.handResult?.description ?? 'Showdown loss', profit, 'bad');
          addEvent('Showdown lost', `${humanResult.handResult?.description ?? 'No winning pot'} for -$${Math.abs(profit)}`, 'bad');
        } else {
          addHistory(humanResult.handResult?.description ?? 'Split pot', 0, 'neutral');
          addEvent('Pot split', humanResult.handResult?.description ?? 'Chopped pot', 'neutral');
        }
      }

      setPokerPlayers(
        settledRoster.map((player) => ({
          ...player,
          currentBet: 0,
          actedThisStreet: true,
          lastAction:
            (player.winnings ?? 0) > 0
              ? `Won $${player.winnings}`
              : player.status === 'folded'
                ? 'Folded'
                : 'No pot'
        }))
      );
      setCommunityCards(fullBoard);
      setCurrentTurnIndex(-1);
      setCurrentBet(0);
      setPhase('showdown');
      setHandMessage('Showdown complete. Main pot and side pots were settled in order.');

      if (showdownTimerRef.current) {
        window.clearTimeout(showdownTimerRef.current);
      }
      showdownTimerRef.current = window.setTimeout(() => {
        setPhase('payout');
      }, 1800);
    },
    [activePlayerId, addEvent, addHistory, audio, dealerIndex, pokerPlayers, queueChipPulse, syncExternalBalance]
  );

  const awardLastPlayer = useCallback(
    (roster: PokerPlayerState[]) => {
      const winner = roster.find((player) => player.status !== 'folded' && player.status !== 'out');
      if (!winner) return;

      const pot = roster.reduce((sum, player) => sum + player.totalContribution, 0);
      const settledRoster = roster.map((player) => {
        const payout = player.id === winner.id ? pot : 0;
        const profit = payout - player.totalContribution;
        const nextStack = player.stack + payout;
        return {
          ...player,
          winnings: payout,
          stack: nextStack,
          sessionProfit: player.sessionProfit + profit,
          handResult: player.id === winner.id && communityCards.length >= 3 ? getBestHand([...player.cards, ...communityCards]) : player.handResult
        };
      });

      settledRoster.forEach((player, index) => {
        const delta = player.stack - roster[index].stack;
        if (!player.isBot && delta !== 0) {
          syncExternalBalance(player.id, delta);
        }
      });

      const humanResult = settledRoster.find((player) => player.id === activePlayerId);
      if (humanResult) {
        const profit = (humanResult.winnings ?? 0) - humanResult.totalContribution;
        if (profit > 0) {
          audio.winSound();
          queueChipPulse(winner.id, pot, 'fromPot', 'good');
          addHistory('Fold equity', profit, 'good');
        } else if (profit < 0) {
          addHistory('Folded hand', profit, 'bad');
        }
      }

      setPokerPlayers(
        settledRoster.map((player) => ({
          ...player,
          currentBet: 0,
          actedThisStreet: true,
          lastAction: player.id === winner.id ? `Scooped $${pot}` : player.lastAction
        }))
      );
      setCurrentTurnIndex(-1);
      setCurrentBet(0);
      setPhase('payout');
      setHandMessage(`${winner.name} wins the pot uncontested.`);
      addEvent('Hand ended', `${winner.name} collected $${pot} without showdown`, winner.id === activePlayerId ? 'good' : 'neutral');
    },
    [activePlayerId, addEvent, addHistory, audio, communityCards, queueChipPulse, syncExternalBalance]
  );

  const advanceAfterAction = useCallback(
    (roster: PokerPlayerState[], nextCurrentBet: number, board: Card[]) => {
      if (countPlayersInHand(roster) === 1) {
        awardLastPlayer(roster);
        return;
      }

      if (shouldCompleteStreet(roster, nextCurrentBet)) {
        if (communityCards.length === 0) {
          beginNextStreet(roster, board.slice(0, 3), 'flop', board);
          return;
        }
        if (communityCards.length === 3) {
          beginNextStreet(roster, board.slice(0, 4), 'turn', board);
          return;
        }
        if (communityCards.length === 4) {
          beginNextStreet(roster, board.slice(0, 5), 'river', board);
          return;
        }
        showdown(roster, board.slice(0, 5));
        return;
      }

      const nextTurn = getNextEligibleIndex(roster, currentTurnIndex, false);
      setPokerPlayers(roster);
      setCurrentBet(nextCurrentBet);
      setCurrentTurnIndex(nextTurn);
    },
    [awardLastPlayer, beginNextStreet, communityCards.length, currentTurnIndex, shouldCompleteStreet, showdown]
  );

  const applyAction = useCallback(
    (playerId: string, action: PlayerAction, actionAmount?: number) => {
      const actingIndex = pokerPlayers.findIndex((player) => player.id === playerId);
      if (actingIndex < 0) return;

      const actor = pokerPlayers[actingIndex];
      if (actor.status !== 'active') return;

      const toCall = Math.max(0, currentBet - actor.currentBet);
      let nextCurrentBet = currentBet;
      let nextLastRaiseSize = lastRaiseSize;

      const nextRoster = pokerPlayers.map((player) => ({ ...player }));
      const nextActor = nextRoster[actingIndex];

      const subtractFromStack = (amount: number) => {
        const wager = Math.max(0, Math.min(nextActor.stack, amount));
        nextActor.stack -= wager;
        nextActor.currentBet += wager;
        nextActor.totalContribution += wager;
        if (!nextActor.isBot && wager > 0) {
          syncExternalBalance(nextActor.id, -wager);
        }
        if (nextActor.stack === 0) {
          nextActor.status = 'all-in';
        }
        return wager;
      };

      if (action === 'fold') {
        nextActor.status = 'folded';
        nextActor.actedThisStreet = true;
        nextActor.lastAction = 'Folded';
        if (!nextActor.isBot) audio.foldSound();
        addEvent(nextActor.name, 'Folded', nextActor.isBot ? 'neutral' : 'bad');
        setLastRaiseSize(nextLastRaiseSize);
        advanceAfterAction(nextRoster, nextCurrentBet, boardRunout);
        return;
      }

      if (action === 'check' && toCall === 0) {
        nextActor.actedThisStreet = true;
        nextActor.lastAction = 'Checked';
        addEvent(nextActor.name, 'Checked', 'neutral');
        setLastRaiseSize(nextLastRaiseSize);
        advanceAfterAction(nextRoster, nextCurrentBet, boardRunout);
        return;
      }

      if (action === 'call') {
        const paid = subtractFromStack(toCall);
        nextActor.actedThisStreet = true;
        nextActor.lastAction = paid < toCall ? `All-in for $${paid}` : `Called $${paid}`;
        queueChipPulse(nextActor.id, paid, 'toPot', nextActor.isBot ? 'neutral' : 'good');
        audio.chipPlace();
        addEvent(nextActor.name, nextActor.lastAction, 'neutral');
        setLastRaiseSize(nextLastRaiseSize);
        advanceAfterAction(nextRoster, nextCurrentBet, boardRunout);
        return;
      }

      if (action === 'all-in') {
        const paid = subtractFromStack(nextActor.stack);
        const newBet = nextActor.currentBet;
        const increase = newBet - currentBet;
        nextCurrentBet = Math.max(currentBet, newBet);
        nextActor.actedThisStreet = true;
        nextActor.lastAction = `All-in $${paid}`;
        queueChipPulse(nextActor.id, paid, 'toPot', nextActor.isBot ? 'neutral' : 'good');
        if (newBet > currentBet) {
          nextRoster.forEach((player, index) => {
            if (index !== actingIndex && player.status === 'active') {
              player.actedThisStreet = false;
            }
          });
        }
        if (increase >= Math.max(lastRaiseSize, BIG_BLIND)) {
          nextLastRaiseSize = increase;
        }
        audio.chipPlace();
        addEvent(nextActor.name, nextActor.lastAction, nextActor.isBot ? 'neutral' : 'good');
        setLastRaiseSize(nextLastRaiseSize);
        advanceAfterAction(nextRoster, nextCurrentBet, boardRunout);
        return;
      }

      if (action === 'raise') {
        const minimumRaise = currentBet === 0 ? BIG_BLIND : Math.max(lastRaiseSize, BIG_BLIND);
        const chosenRaiseAmount = Math.max(actionAmount ?? minimumRaise, minimumRaise);
        const targetBet = currentBet + chosenRaiseAmount;
        const desiredAdditional = targetBet - nextActor.currentBet;
        const paid = subtractFromStack(desiredAdditional);
        const newBet = nextActor.currentBet;
        const increase = newBet - currentBet;

        nextCurrentBet = Math.max(currentBet, newBet);
        nextActor.actedThisStreet = true;
        nextActor.lastAction = currentBet === 0 ? `Bet $${newBet}` : `Raised to $${newBet}`;
        queueChipPulse(nextActor.id, paid, 'toPot', nextActor.isBot ? 'neutral' : 'good');

        if (newBet > currentBet) {
          nextRoster.forEach((player, index) => {
            if (index !== actingIndex && player.status === 'active') {
              player.actedThisStreet = false;
            }
          });
        }
        if (increase >= minimumRaise) {
          nextLastRaiseSize = increase;
        }

        audio.chipPlace();
        addEvent(nextActor.name, nextActor.lastAction, nextActor.isBot ? 'neutral' : 'good');
        setLastRaiseSize(nextLastRaiseSize);
        advanceAfterAction(nextRoster, nextCurrentBet, boardRunout);
        return;
      }
    },
    [
      addEvent,
      advanceAfterAction,
      audio,
      boardRunout,
      currentBet,
      lastRaiseSize,
      pokerPlayers,
      queueChipPulse,
      syncExternalBalance
    ]
  );

  const startHand = useCallback(() => {
    if (showdownTimerRef.current) {
      window.clearTimeout(showdownTimerRef.current);
    }

    const activeSeats = pokerPlayers.filter((player) => player.stack > 0);
    if (activeSeats.length < 2) {
      setHandMessage('At least two funded seats are needed to start a hand.');
      return;
    }

    const deck = createDeck();
    let pointer = 0;

    const preparedRoster: PokerPlayerState[] = pokerPlayers.map((player) => ({
      ...player,
      cards: [],
      currentBet: 0,
      totalContribution: 0,
      actedThisStreet: false,
      lastAction: undefined,
      winnings: 0,
      handResult: undefined,
      status: player.stack > 0 ? 'active' : 'out'
    }));

    const nextDealer = getNextEligibleIndex(preparedRoster, dealerIndex, true);
    const smallBlindIndex = getNextEligibleIndex(preparedRoster, nextDealer, true);
    const bigBlindIndex = getNextEligibleIndex(preparedRoster, smallBlindIndex, true);
    const actionIndex = getNextEligibleIndex(preparedRoster, bigBlindIndex, false);

    preparedRoster.forEach((player) => {
      if (player.status !== 'out') {
        player.cards = [deck[pointer], deck[pointer + 1]];
        pointer += 2;
      }
    });

    const runout = deck.slice(pointer, pointer + 5);

    const postBlind = (seatIndex: number, amount: number, label: string) => {
      if (seatIndex < 0) return;
      const player = preparedRoster[seatIndex];
      const blind = Math.min(player.stack, amount);
      player.stack -= blind;
      player.currentBet = blind;
      player.totalContribution = blind;
      player.lastAction = label;
      player.status = player.stack === 0 ? 'all-in' : 'active';
      if (!player.isBot && blind > 0) {
        syncExternalBalance(player.id, -blind);
      }
      queueChipPulse(player.id, blind, 'toPot', 'neutral');
    };

    postBlind(smallBlindIndex, SMALL_BLIND, `SB $${SMALL_BLIND}`);
    postBlind(bigBlindIndex, BIG_BLIND, `BB $${BIG_BLIND}`);

    setPokerPlayers(preparedRoster);
    setDealerIndex(nextDealer);
    setCurrentTurnIndex(actionIndex);
    setCommunityCards([]);
    setBoardRunout(runout);
    setCurrentBet(BIG_BLIND);
    setLastRaiseSize(BIG_BLIND);
    setRaiseAmount(BIG_BLIND);
    setPhase('preflop');
    setHandMessage('Pre-flop action starts left of the big blind.');
    addEvent('New hand', `${preparedRoster[nextDealer]?.name ?? 'Dealer'} has the button`, 'neutral');
    addEvent('Blinds posted', `${preparedRoster[smallBlindIndex]?.name ?? 'SB'} / ${preparedRoster[bigBlindIndex]?.name ?? 'BB'}`, 'neutral');
    audio.cardReveal();
  }, [addEvent, audio, dealerIndex, pokerPlayers, queueChipPulse, syncExternalBalance]);

  const resetForNextHand = useCallback(() => {
    setPokerPlayers((previous) =>
      previous.map((player) => ({
        ...player,
        cards: [],
        currentBet: 0,
        totalContribution: 0,
        actedThisStreet: false,
        lastAction: undefined,
        winnings: 0,
        handResult: undefined,
        status: player.stack > 0 ? 'active' : 'out'
      }))
    );
    setCommunityCards([]);
    setBoardRunout([]);
    setCurrentBet(0);
    setCurrentTurnIndex(-1);
    setPhase('idle');
    setRaiseAmount(BIG_BLIND);
    setHandMessage('Hand complete. Start the next round when you are ready.');
  }, []);

  useEffect(() => {
    if (!currentTurnPlayer || !currentTurnPlayer.isBot) return;
    if (!['preflop', 'flop', 'turn', 'river'].includes(phase)) return;

    const timer = window.setTimeout(() => {
      const toCall = Math.max(0, currentBet - currentTurnPlayer.currentBet);
      const stack = currentTurnPlayer.stack;

      if (stack <= 0) {
        applyAction(currentTurnPlayer.id, 'check');
        return;
      }

      if (communityCards.length === 0) {
        const strength = getHoleCardStrength(currentTurnPlayer.cards);
        if (toCall === 0) {
          if (strength >= 30 && stack > BIG_BLIND * 2) {
            applyAction(currentTurnPlayer.id, 'raise');
          } else {
            applyAction(currentTurnPlayer.id, 'check');
          }
          return;
        }
        if (strength < 17 && toCall > BIG_BLIND) {
          applyAction(currentTurnPlayer.id, 'fold');
          return;
        }
        if (strength >= 32 && stack <= toCall + BIG_BLIND * 2) {
          applyAction(currentTurnPlayer.id, 'all-in');
          return;
        }
        if (strength >= 26 && stack > toCall + BIG_BLIND) {
          applyAction(currentTurnPlayer.id, 'raise');
          return;
        }
        if (strength >= 16 || toCall <= BIG_BLIND) {
          applyAction(currentTurnPlayer.id, 'call');
          return;
        }
        applyAction(currentTurnPlayer.id, 'fold');
        return;
      }

      const best = getBestHand([...currentTurnPlayer.cards, ...communityCards]);
      if (toCall === 0) {
        if (best.rank >= HandRank.TwoPair && stack > BIG_BLIND) {
          applyAction(currentTurnPlayer.id, 'raise');
        } else {
          applyAction(currentTurnPlayer.id, 'check');
        }
        return;
      }
      if (best.rank >= HandRank.Straight && stack <= toCall + BIG_BLIND) {
        applyAction(currentTurnPlayer.id, 'all-in');
        return;
      }
      if (best.rank >= HandRank.TwoPair && stack > toCall + BIG_BLIND) {
        applyAction(currentTurnPlayer.id, 'raise');
        return;
      }
      if (best.rank >= HandRank.Pair || toCall <= BIG_BLIND) {
        applyAction(currentTurnPlayer.id, 'call');
        return;
      }
      applyAction(currentTurnPlayer.id, 'fold');
    }, 850 + Math.random() * 500);

    return () => window.clearTimeout(timer);
  }, [applyAction, communityCards, currentBet, currentTurnPlayer, phase]);

  const humanToCall = mainHuman ? Math.max(0, currentBet - mainHuman.currentBet) : 0;
  const humanCanAct =
    Boolean(mainHuman) &&
    currentTurnPlayer?.id === mainHuman?.id &&
    ['preflop', 'flop', 'turn', 'river'].includes(phase) &&
    mainHuman.status === 'active';
  const minimumRaise = currentBet === 0 ? BIG_BLIND : Math.max(lastRaiseSize, BIG_BLIND);
  const maxRaiseAmount = mainHuman ? Math.max(BIG_BLIND, mainHuman.stack - humanToCall) : BIG_BLIND;
  const sliderMin = Math.min(minimumRaise, maxRaiseAmount);
  const sliderMax = Math.max(minimumRaise, maxRaiseAmount);
  const clampedRaiseAmount = Math.min(Math.max(raiseAmount, sliderMin), sliderMax);

  useEffect(() => {
    setRaiseAmount((previous) => {
      const next = Math.min(Math.max(previous, sliderMin), sliderMax);
      return next === previous ? previous : next;
    });
  }, [sliderMin, sliderMax]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0a0c12] text-slate-100 selection:bg-cyan-400 selection:text-black">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),transparent_30%),radial-gradient(circle_at_bottom,_rgba(250,204,21,0.08),transparent_30%)]" />

      <div className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <PokerBoard
            pokerPlayers={pokerPlayers}
            mainHuman={mainHuman}
            communityCards={communityCards}
            dealerIndex={dealerIndex}
            currentTurnId={currentTurnPlayer?.id}
            currentBet={currentBet}
            totalPot={totalPot}
            streetLabel={streetLabel}
            phaseLabel={phaseLabel}
            handMessage={getLiveInsight()}
            revealAllCards={revealAllCards}
            chipPulse={chipPulse}
          />

          <footer className="relative z-20 border-t border-white/10 bg-[#121016]/95 px-3 py-1.5 backdrop-blur-xl lg:px-5 lg:py-2">
            <div className="flex flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(240px,320px)_minmax(0,1fr)] lg:items-center lg:gap-3">
              <div className="flex min-w-0 flex-nowrap items-center gap-2 lg:gap-3">
                <button
                  onClick={onExit}
                  className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition hover:border-red-400/35 hover:bg-red-500/10 hover:text-red-300"
                >
                  <ArrowLeft size={15} />
                </button>

                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/35">Bankroll</div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeProfile?.balance ?? 0}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="mt-0.5 tabular-nums text-lg font-black tracking-tight text-cyan-300 lg:text-xl"
                    >
                      ${activeProfile?.balance.toLocaleString() ?? '0'}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/35">Current Turn</div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={currentTurnPlayer?.id ?? 'waiting'}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="mt-0.5 text-sm font-black tracking-tight text-white lg:text-base"
                    >
                      {currentTurnPlayer?.name ?? 'Waiting'}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/35">Seat Role</div>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={mainHuman ? getSeatRole(pokerPlayers.findIndex((player) => player.id === mainHuman.id), pokerPlayers) : 'Observer'}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="mt-0.5 text-sm font-black tracking-tight text-yellow-400 lg:text-base"
                    >
                      {mainHuman ? getSeatRole(pokerPlayers.findIndex((player) => player.id === mainHuman.id), pokerPlayers) : 'Observer'}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="hidden min-w-0 pl-1 xl:block">
                  <button
                    onClick={() => setShowAdviceModal(true)}
                    className="group flex h-9 w-9 items-center justify-center rounded-2xl border border-yellow-500/20 bg-yellow-500/10 text-yellow-500 transition hover:border-yellow-500/40 hover:bg-yellow-500/20"
                    title="Get Advisor Tips"
                  >
                    <Info size={16} />
                  </button>
                </div>
              </div>

              <div className="mx-auto flex w-full min-w-[240px] max-w-[320px] items-center gap-2 rounded-3xl border border-white/10 bg-white/[0.04] px-3 py-2 lg:mx-2">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
                  <Target size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.3em] text-white/35">
                        {currentBet === 0 ? 'Bet Size' : 'Raise By'}
                      </div>
                      <div className="mt-0.5 w-20 text-right text-sm font-black tracking-tight tabular-nums text-white lg:text-base">
                        +${clampedRaiseAmount.toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right text-[9px] font-black uppercase tracking-[0.2em] text-white/35">
                      <div>Min ${minimumRaise}</div>
                      <div>Max ${maxRaiseAmount.toLocaleString()}</div>
                    </div>
                  </div>
                  <input
                    type="range"
                    min={sliderMin}
                    max={sliderMax}
                    step={1}
                    value={clampedRaiseAmount}
                    onChange={(event) => setRaiseAmount(Number(event.target.value))}
                    className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-cyan-400"
                    disabled={!mainHuman || mainHuman.stack <= 0 || phase === 'idle' || phase === 'payout'}
                  />
                </div>
              </div>

              <div className="flex min-w-0 flex-nowrap items-center gap-1.5 lg:justify-end">
                {phase === 'idle' || phase === 'payout' ? (
                  <>
                    {phase === 'payout' && (
                      <button
                        onClick={resetForNextHand}
                        className="inline-flex h-9 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/10"
                      >
                        <RotateCcw size={13} />
                        Reset Table
                      </button>
                    )}
                    <button
                      onClick={startHand}
                      className="inline-flex h-9 items-center gap-2 rounded-2xl bg-cyan-400 px-4 text-[10px] font-black uppercase tracking-[0.16em] text-black shadow-[0_0_24px_rgba(34,211,238,0.25)] transition hover:bg-cyan-300"
                    >
                      <Zap size={13} />
                      {phase === 'idle' ? 'Deal New Hand' : 'Next Hand'}
                    </button>
                  </>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${phase}-${humanCanAct}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex flex-wrap items-center gap-1.5 lg:justify-end"
                    >
                      {humanCanAct ? (
                        <>
                          <button
                            onClick={() => applyAction(activePlayerId, 'fold')}
                            className="h-9 rounded-2xl border border-white/10 bg-white/5 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-white/70 transition hover:bg-white/10"
                          >
                            Fold
                          </button>
                          {humanToCall === 0 ? (
                            <button
                              onClick={() => applyAction(activePlayerId, 'check')}
                              className="h-9 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-300 transition hover:bg-emerald-500/15"
                            >
                              Check
                            </button>
                          ) : (
                            <button
                              onClick={() => applyAction(activePlayerId, 'call')}
                              className="h-9 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 transition hover:bg-cyan-500/15"
                            >
                              Call ${humanToCall}
                            </button>
                          )}
                          <button
                            onClick={() => applyAction(activePlayerId, 'raise', clampedRaiseAmount)}
                            disabled={!mainHuman || mainHuman.stack <= humanToCall}
                            className="h-9 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-yellow-300 transition hover:bg-yellow-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {currentBet === 0 ? `Bet +$${clampedRaiseAmount}` : `Raise +$${clampedRaiseAmount}`}
                          </button>
                          <button
                            onClick={() => applyAction(activePlayerId, 'all-in')}
                            className="h-9 rounded-2xl bg-yellow-500 px-3 text-[10px] font-black uppercase tracking-[0.16em] text-black transition hover:bg-yellow-400"
                          >
                            All-in
                          </button>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[10px] text-white/55">
                          {phase === 'showdown' ? 'Hands Comparison' : 'Bots Acting'}
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </div>
          </footer>
        </main>

        <aside className="hidden w-[280px] shrink-0 border-l border-white/10 bg-[#121016]/95 xl:flex xl:flex-col">
          <div className="border-b border-white/10 p-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-500/25 bg-yellow-500/10 px-3 py-1 text-[9px] font-black uppercase tracking-[0.28em] text-yellow-400">
              <ShieldCheck size={11} />
              Hold&apos;em Rules
            </div>
            <div className="mt-2 text-lg font-black tracking-tight text-white">Table Control</div>
            <p className="mt-1 text-[12px] text-white/50">
              Dealer rotates each hand, blinds are 25/50, and pots are split through main-pot then side-pot resolution.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-3.5">
              <div className="text-[8px] font-black uppercase tracking-[0.3em] text-white/35">Round State</div>
              <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2.5">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">Phase</div>
                  <div className="mt-1 text-base font-black text-cyan-300">{streetLabel}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2.5">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">Min Raise</div>
                  <div className="mt-1 text-base font-black text-yellow-400">${minimumRaise}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2.5">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">To Call</div>
                  <div className="mt-1 text-base font-black text-white">${humanToCall}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 px-3 py-2.5">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">Eligible Seats</div>
                  <div className="mt-1 text-base font-black text-white">{pokerPlayers.filter((player) => player.status !== 'out').length}</div>
                </div>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-3.5">
              <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] text-white/35">
                <Target size={10} />
                Action Feed
              </div>
              <div className="mt-2 space-y-1.5">
                {events.length > 0 ? (
                  <AnimatePresence initial={false}>
                    {events.map((event, index) => (
                      <motion.div
                        key={`${event.time}-${index}`}
                        layout
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="flex gap-2.5"
                      >
                        <div className="pt-0.5 text-[9px] font-mono text-white/30">{event.time}</div>
                        <div className="flex-1">
                          <div
                            className={cn(
                              'text-[13px] font-semibold',
                              event.tone === 'good' ? 'text-yellow-300' : event.tone === 'bad' ? 'text-red-300' : 'text-white/80'
                            )}
                          >
                            {event.label}
                          </div>
                           <div className="text-[11px] text-white/45">{event.detail}</div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                ) : (
                  <div className="text-[13px] text-white/45">No hands played yet.</div>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-3.5">
              <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] text-white/35">
                <Trophy size={10} />
                Recent Results
              </div>
              <div className="mt-2 space-y-1.5">
                {history.length > 0 ? (
                  <AnimatePresence initial={false}>
                    {history.map((entry, index) => (
                      <motion.div
                        key={`${entry.time}-${index}`}
                        layout
                        initial={{ opacity: 0, y: 10, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 px-3 py-2.5"
                      >
                        <div>
                          <div className="text-[13px] font-black text-white">{entry.result}</div>
                          <div className="text-[9px] uppercase tracking-[0.18em] text-white/35">{entry.time}</div>
                        </div>
                        <div className={cn('text-base font-black', entry.tone === 'good' ? 'text-yellow-400' : entry.tone === 'bad' ? 'text-red-300' : 'text-white')}>
                          {entry.amount > 0 ? '+' : ''}${Math.abs(entry.amount)}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                ) : (
                  <div className="text-[13px] text-white/45">Showdown summaries will land here.</div>
                )}
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-3.5">
              <div className="flex items-center gap-2 text-[8px] font-black uppercase tracking-[0.3em] text-white/35">
                <Wallet size={10} />
                Stacks
              </div>
              <div className="mt-2 space-y-1.5">
                {pokerPlayers.map((player) => (
                  <div key={player.id} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      {dealerIndex >= 0 && pokerPlayers[dealerIndex]?.id === player.id ? (
                        <Crown size={12} className="text-yellow-400" />
                      ) : player.status === 'folded' ? (
                        <Flag size={12} className="text-white/40" />
                      ) : (
                        <Zap size={12} className="text-cyan-300" />
                      )}
                      <span className="font-black text-white">{player.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-white">${player.stack.toLocaleString()}</div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-white/35">{player.status}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <AnimatePresence>
        {showAdviceModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAdviceModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-white/10 bg-[#1a1c24] p-8 shadow-2xl"
            >
              <button
                onClick={() => setShowAdviceModal(false)}
                className="absolute right-6 top-6 rounded-full border border-white/5 bg-white/5 p-2 text-white/40 transition hover:bg-white/10 hover:text-white"
              >
                <X size={20} />
              </button>

              <div className="mb-6 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 shadow-[0_0_20px_rgba(234,179,8,0.1)]">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-white italic">Elite Advisor</h3>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Strategic Live Insight</p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-6">
                <p className="text-base font-medium leading-relaxed text-yellow-400/90 italic">
                  &ldquo;{getLiveInsight()}&rdquo;
                </p>
              </div>

              <div className="mt-8 flex justify-end">
                <button
                  onClick={() => setShowAdviceModal(false)}
                  className="rounded-2xl bg-yellow-500 px-8 py-3 text-sm font-black uppercase tracking-widest text-black transition hover:bg-yellow-400"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
