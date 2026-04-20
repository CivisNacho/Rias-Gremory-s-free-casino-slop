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
  Straight = 3,
  Flush = 4,
  ThreeOfAKind = 5,
  StraightFlush = 6,
  FourOfAKind = 7
}

export interface HandResult {
  rank: HandRank;
  score: number; // For tie-breaking
  cards: Card[]; // The 4 cards used
  description: string;
}

const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

export const createDeck = (): Card[] => {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const ranks: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
};

export const getBest4CardHand = (cards: Card[]): HandResult => {
  // Try every combination of 4 cards if we have more than 4 (e.g. 5 for player, 6 for dealer)
  // Actually, for optimization, we can just sort and evaluate subsets if needed, 
  // but with 4 from 5 (5 combinations) or 4 from 6 (15 combinations) it's small.
  
  let bestHand: HandResult | null = null;
  
  const combinations = getCombinations(cards, 4);
  
  for (const combo of combinations) {
    const hand = evaluate4CardHand(combo);
    if (!bestHand || compareHands(hand, bestHand) > 0) {
      bestHand = hand;
    }
  }
  
  return bestHand!;
};

function getCombinations(array: Card[], size: number): Card[][] {
  const result: Card[][] = [];
  function helper(start: number, combo: Card[]) {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      combo.push(array[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  }
  helper(0, []);
  return result;
}

function evaluate4CardHand(cards: Card[]): HandResult {
  const sorted = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  const ranks = sorted.map(c => RANK_VALUES[c.rank]);
  const suits = sorted.map(c => c.suit);
  
  const counts: Record<number, number> = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const countValues = Object.values(counts).sort((a, b) => b - a);
  const rankEntries = Object.entries(counts).map(([r, c]) => ({ r: parseInt(r), c })).sort((a,b) => b.c - a.c || b.r - a.r);

  const isFlush = suits.every(s => s === suits[0]);
  
  // Straight check (including A234)
  let isStraight = false;
  let straightHigh = ranks[0];
  if (ranks[0] - ranks[3] === 3 && new Set(ranks).size === 4) {
    isStraight = true;
  } else if (ranks[0] === 14 && ranks[1] === 4 && ranks[2] === 3 && ranks[3] === 2) {
    isStraight = true;
    straightHigh = 4; // Low straight
  }

  // 4 of a Kind
  if (countValues[0] === 4) {
    return { rank: HandRank.FourOfAKind, score: HandRank.FourOfAKind * 1000000 + rankEntries[0].r, cards: sorted, description: 'Four of a Kind' };
  }
  
  // Straight Flush
  if (isFlush && isStraight) {
    return { rank: HandRank.StraightFlush, score: HandRank.StraightFlush * 1000000 + straightHigh, cards: sorted, description: 'Straight Flush' };
  }
  
  // 3 of a Kind
  if (countValues[0] === 3) {
    return { rank: HandRank.ThreeOfAKind, score: HandRank.ThreeOfAKind * 1000000 + rankEntries[0].r * 100 + rankEntries[1].r, cards: sorted, description: 'Three of a Kind' };
  }
  
  // Flush
  if (isFlush) {
    return { rank: HandRank.Flush, score: HandRank.Flush * 1000000 + ranks[0] * 1000 + ranks[1] * 100 + ranks[2] * 10 + ranks[3], cards: sorted, description: 'Flush' };
  }
  
  // Straight
  if (isStraight) {
    return { rank: HandRank.Straight, score: HandRank.Straight * 1000000 + straightHigh, cards: sorted, description: 'Straight' };
  }
  
  // Two Pair
  if (countValues[0] === 2 && countValues[1] === 2) {
    return { rank: HandRank.TwoPair, score: HandRank.TwoPair * 1000000 + rankEntries[0].r * 100 + rankEntries[1].r, cards: sorted, description: 'Two Pair' };
  }
  
  // Pair
  if (countValues[0] === 2) {
    return { rank: HandRank.Pair, score: HandRank.Pair * 1000000 + rankEntries[0].r * 1000 + rankEntries[1].r * 100 + rankEntries[2].r, cards: sorted, description: `Pair of ${sorted.find(c => RANK_VALUES[c.rank] === rankEntries[0].r)?.rank}s` };
  }
  
  // High Card
  return { rank: HandRank.HighCard, score: HandRank.HighCard * 1000000 + ranks[0] * 1000 + ranks[1] * 100 + ranks[2] * 10 + ranks[3], cards: sorted, description: `High Card ${sorted[0].rank}` };
}

export const compareHands = (a: HandResult, b: HandResult): number => {
  return a.score - b.score;
};

export const dealerQualifies = (hand: HandResult): boolean => {
  // Image says "King high or better"
  if (hand.rank > HandRank.HighCard) return true;
  const highCardRank = hand.cards[0].rank;
  const rankValues: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
  return rankValues[highCardRank] >= 13; // King is 13
};

export const getAcesUpPayout = (rank: HandRank, cards: Card[]): number => {
  // Typically:
  // Pair of Aces: 1:1
  // Two Pair: 2:1
  // Straight: 5:1
  // Flush: 6:1
  // Three of a Kind: 8:1
  // Straight Flush: 40:1
  // Four of a Kind: 50:1
  
  const sorted = [...cards].sort((a, b) => RANK_VALUES[b.rank] - RANK_VALUES[a.rank]);
  const ranks = sorted.map(c => RANK_VALUES[c.rank]);

  if (rank === HandRank.FourOfAKind) return 50;
  if (rank === HandRank.StraightFlush) return 40;
  if (rank === HandRank.ThreeOfAKind) return 8;
  if (rank === HandRank.Flush) return 6;
  if (rank === HandRank.Straight) return 5;
  if (rank === HandRank.TwoPair) return 2;
  if (rank === HandRank.Pair && ranks.includes(14)) return 1;
  return 0;
};

export const getAnteBonusPayout = (rank: HandRank): number => {
  // Typically:
  // Three of a Kind: 2:1
  // Straight Flush: 20:1
  // Four of a Kind: 25:1
  if (rank === HandRank.FourOfAKind) return 25;
  if (rank === HandRank.StraightFlush) return 20;
  if (rank === HandRank.ThreeOfAKind) return 2;
  return 0;
};

export interface PokerPlayerState {
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
