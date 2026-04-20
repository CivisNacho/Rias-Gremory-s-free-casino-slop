export type Page = 'lobby' | 'slots' | 'roulette' | 'poker';

export interface Game {
  id: string;
  title: string;
  description: string;
  image: string;
  minBet: number;
  maxBet: number;
  type: 'slot' | 'table' | 'live';
  status?: 'live' | 'hot' | 'new';
  players?: number;
  jackpot?: string;
}

export interface Bet {
  amount: number;
  type: string;
  id: string;
}
