export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export enum HandRank {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8
}

export interface HandResult {
  rank: HandRank;
  score: number;
  cards: Card[];
  description: string;
}

export type PokerSeatStatus = 'active' | 'folded' | 'all-in' | 'out';

export interface PokerPlayerState {
  id: string;
  name: string;
  isBot: boolean;
  stack: number;
  cards: Card[];
  currentBet: number;
  totalContribution: number;
  status: PokerSeatStatus;
  actedThisStreet: boolean;
  lastAction?: string;
  handResult?: HandResult;
  winnings?: number;
  sessionProfit: number;
}

export interface SidePot {
  amount: number;
  eligiblePlayerIds: string[];
}

export const SMALL_BLIND = 25;
export const BIG_BLIND = 50;

const SCORE_BASE = 15;

const RANK_VALUES: Record<Rank, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14
};

const VALUE_TO_RANK: Record<number, Rank> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A'
};

const HAND_LABELS: Record<HandRank, string> = {
  [HandRank.HighCard]: 'High Card',
  [HandRank.Pair]: 'Pair',
  [HandRank.TwoPair]: 'Two Pair',
  [HandRank.ThreeOfAKind]: 'Three of a Kind',
  [HandRank.Straight]: 'Straight',
  [HandRank.Flush]: 'Flush',
  [HandRank.FullHouse]: 'Full House',
  [HandRank.FourOfAKind]: 'Four of a Kind',
  [HandRank.StraightFlush]: 'Straight Flush'
};

export const getRankValue = (rank: Rank) => RANK_VALUES[rank];

export const createDeck = (): Card[] => {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
};

export const compareHands = (a: HandResult, b: HandResult): number => a.score - b.score;

export const getBestHand = (cards: Card[]): HandResult => {
  if (cards.length < 5) {
    throw new Error('At least 5 cards are required to evaluate a Hold’em hand.');
  }

  let best: HandResult | null = null;
  for (const combo of getCombinations(cards, 5)) {
    const current = evaluate5CardHand(combo);
    if (!best || compareHands(current, best) > 0) {
      best = current;
    }
  }

  return best!;
};

export const describeStreet = (communityCards: Card[]) => {
  if (communityCards.length === 0) return 'Pre-Flop';
  if (communityCards.length === 3) return 'Flop';
  if (communityCards.length === 4) return 'Turn';
  if (communityCards.length === 5) return 'River';
  return 'Showdown';
};

export const buildSidePots = (
  players: Pick<PokerPlayerState, 'id' | 'totalContribution' | 'status'>[]
): SidePot[] => {
  const contributors = players
    .filter((player) => player.totalContribution > 0)
    .sort((a, b) => a.totalContribution - b.totalContribution);

  if (contributors.length === 0) {
    return [];
  }

  const uniqueLevels = [...new Set(contributors.map((player) => player.totalContribution))];
  const pots: SidePot[] = [];
  let previousLevel = 0;

  for (const level of uniqueLevels) {
    const participants = contributors.filter((player) => player.totalContribution >= level);
    const increment = level - previousLevel;
    const amount = increment * participants.length;
    const eligiblePlayerIds = participants
      .filter((player) => player.status !== 'folded' && player.status !== 'out')
      .map((player) => player.id);

    if (amount > 0 && eligiblePlayerIds.length > 0) {
      pots.push({ amount, eligiblePlayerIds });
    }

    previousLevel = level;
  }

  return pots;
};

export const getNextEligibleIndex = (
  players: PokerPlayerState[],
  startIndex: number,
  includeAllIn = false
): number => {
  if (players.length === 0) {
    return -1;
  }

  for (let step = 1; step <= players.length; step += 1) {
    const index = (startIndex + step + players.length) % players.length;
    const player = players[index];
    if (
      player.status === 'active' ||
      (includeAllIn && player.status === 'all-in')
    ) {
      return index;
    }
  }

  return -1;
};

export const countPlayersInHand = (players: PokerPlayerState[]) =>
  players.filter((player) => player.status !== 'folded' && player.status !== 'out').length;

export const countPlayersAbleToAct = (players: PokerPlayerState[]) =>
  players.filter((player) => player.status === 'active').length;

export const getHoleCardStrength = (cards: Card[]): number => {
  if (cards.length < 2) {
    return 0;
  }

  const [first, second] = cards;
  const high = Math.max(getRankValue(first.rank), getRankValue(second.rank));
  const low = Math.min(getRankValue(first.rank), getRankValue(second.rank));
  const isPair = first.rank === second.rank;
  const suited = first.suit === second.suit;
  const gap = high - low;

  let score = high + low / 2;
  if (isPair) score += 14 + high;
  if (suited) score += 2.5;
  if (gap === 1) score += 1.5;
  if (gap > 4) score -= 2;
  if (high >= 13) score += 1.5;

  return score;
};

function evaluate5CardHand(cards: Card[]): HandResult {
  const sorted = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  const values = sorted.map((card) => RANK_VALUES[card.rank]);
  const counts = new Map<number, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const grouped = [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  const isFlush = sorted.every((card) => card.suit === sorted[0].suit);
  const straightHigh = getStraightHigh(values);
  const isStraight = straightHigh !== null;

  if (isFlush && isStraight) {
    return {
      rank: HandRank.StraightFlush,
      score: encodeScore(HandRank.StraightFlush, [straightHigh]),
      cards: orderStraightCards(sorted, straightHigh),
      description: `${HAND_LABELS[HandRank.StraightFlush]}, ${rankLabel(straightHigh)} high`
    };
  }

  if (grouped[0][1] === 4) {
    const fourKind = grouped[0][0];
    const kicker = grouped[1][0];
    return {
      rank: HandRank.FourOfAKind,
      score: encodeScore(HandRank.FourOfAKind, [fourKind, kicker]),
      cards: orderByGroupedValues(sorted, [fourKind, kicker]),
      description: `${HAND_LABELS[HandRank.FourOfAKind]}, ${pluralRank(fourKind)}`
    };
  }

  if (grouped[0][1] === 3 && grouped[1][1] === 2) {
    const trip = grouped[0][0];
    const pair = grouped[1][0];
    return {
      rank: HandRank.FullHouse,
      score: encodeScore(HandRank.FullHouse, [trip, pair]),
      cards: orderByGroupedValues(sorted, [trip, pair]),
      description: `${HAND_LABELS[HandRank.FullHouse]}, ${pluralRank(trip)} full of ${pluralRank(pair)}`
    };
  }

  if (isFlush) {
    return {
      rank: HandRank.Flush,
      score: encodeScore(HandRank.Flush, values),
      cards: sorted,
      description: `${HAND_LABELS[HandRank.Flush]}, ${rankLabel(values[0])} high`
    };
  }

  if (isStraight) {
    return {
      rank: HandRank.Straight,
      score: encodeScore(HandRank.Straight, [straightHigh]),
      cards: orderStraightCards(sorted, straightHigh),
      description: `${HAND_LABELS[HandRank.Straight]}, ${rankLabel(straightHigh)} high`
    };
  }

  if (grouped[0][1] === 3) {
    const trip = grouped[0][0];
    const kickers = grouped.slice(1).map(([value]) => value).sort((a, b) => b - a);
    return {
      rank: HandRank.ThreeOfAKind,
      score: encodeScore(HandRank.ThreeOfAKind, [trip, ...kickers]),
      cards: orderByGroupedValues(sorted, [trip, ...kickers]),
      description: `${HAND_LABELS[HandRank.ThreeOfAKind]}, ${pluralRank(trip)}`
    };
  }

  if (grouped[0][1] === 2 && grouped[1][1] === 2) {
    const pairValues = grouped
      .filter(([, count]) => count === 2)
      .map(([value]) => value)
      .sort((a, b) => b - a);
    const kicker = grouped.find(([, count]) => count === 1)![0];
    return {
      rank: HandRank.TwoPair,
      score: encodeScore(HandRank.TwoPair, [...pairValues, kicker]),
      cards: orderByGroupedValues(sorted, [...pairValues, kicker]),
      description: `${HAND_LABELS[HandRank.TwoPair]}, ${pluralRank(pairValues[0])} and ${pluralRank(pairValues[1])}`
    };
  }

  if (grouped[0][1] === 2) {
    const pair = grouped[0][0];
    const kickers = grouped.slice(1).map(([value]) => value).sort((a, b) => b - a);
    return {
      rank: HandRank.Pair,
      score: encodeScore(HandRank.Pair, [pair, ...kickers]),
      cards: orderByGroupedValues(sorted, [pair, ...kickers]),
      description: `${HAND_LABELS[HandRank.Pair]}, ${pluralRank(pair)}`
    };
  }

  return {
    rank: HandRank.HighCard,
    score: encodeScore(HandRank.HighCard, values),
    cards: sorted,
    description: `${HAND_LABELS[HandRank.HighCard]}, ${rankLabel(values[0])}`
  };
}

function getCombinations(cards: Card[], size: number): Card[][] {
  const result: Card[][] = [];

  function build(startIndex: number, combination: Card[]) {
    if (combination.length === size) {
      result.push([...combination]);
      return;
    }

    for (let index = startIndex; index < cards.length; index += 1) {
      combination.push(cards[index]);
      build(index + 1, combination);
      combination.pop();
    }
  }

  build(0, []);
  return result;
}

function getStraightHigh(values: number[]): number | null {
  const unique = [...new Set(values)].sort((a, b) => b - a);

  if (unique.length !== 5) {
    return null;
  }

  if (unique[0] - unique[4] === 4) {
    return unique[0];
  }

  const wheel = [14, 5, 4, 3, 2];
  if (wheel.every((value, index) => unique[index] === value)) {
    return 5;
  }

  return null;
}

function encodeScore(rank: HandRank, kickers: number[]): number {
  let encoded = rank;
  for (const kicker of kickers) {
    encoded = encoded * SCORE_BASE + kicker;
  }
  return encoded;
}

function orderByGroupedValues(cards: Card[], values: number[]): Card[] {
  const copied = [...cards];
  const ordered: Card[] = [];

  for (const value of values) {
    for (let index = copied.length - 1; index >= 0; index -= 1) {
      if (RANK_VALUES[copied[index].rank] === value) {
        ordered.push(copied[index]);
        copied.splice(index, 1);
      }
    }
  }

  return ordered;
}

function orderStraightCards(cards: Card[], straightHigh: number): Card[] {
  if (straightHigh === 5) {
    const wheelValues = [5, 4, 3, 2, 14];
    return wheelValues.map((value) => cards.find((card) => RANK_VALUES[card.rank] === value)!);
  }

  const targetValues = [straightHigh, straightHigh - 1, straightHigh - 2, straightHigh - 3, straightHigh - 4];
  return targetValues.map((value) => cards.find((card) => RANK_VALUES[card.rank] === value)!);
}

function rankLabel(value: number) {
  return value === 14 ? 'Ace' : VALUE_TO_RANK[value];
}

function pluralRank(value: number) {
  const rank = rankLabel(value);
  return rank.endsWith('x') ? `${rank}es` : `${rank}s`;
}
