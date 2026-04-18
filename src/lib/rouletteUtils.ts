export type BetType = 
    | 'STRAIGHT' | 'SPLIT' | 'STREET' | 'CORNER' | 'LINE' 
    | 'COLUMN' | 'DOZEN' | 'COLOR' | 'PARITY' | 'HALF';

export interface RoulettePlayer {
    id: string;
    name: string;
    balance: number;
    color: string;
}

export interface RouletteBet {
    id: string;
    playerId: string;
    type: BetType;
    numbers: number[];
    amount: number;
}

export const PAYOUTS: Record<BetType, number> = {
    STRAIGHT: 35,
    SPLIT: 17,
    STREET: 11,
    CORNER: 8,
    LINE: 5,
    COLUMN: 2,
    DOZEN: 2,
    COLOR: 1,
    PARITY: 1,
    HALF: 1
};

export const RED_NUMBERS = new Set([
    1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36
]);

export function getNumberColor(num: number): 'red' | 'black' | 'green' {
    if (num === 0) return 'green';
    return RED_NUMBERS.has(num) ? 'red' : 'black';
}

export const PLAYER_COLORS = [
    '#3b82f6', // blue
    '#ef4444', // red
    '#10b981', // green
    '#f59e0b', // yellow
    '#8b5cf6', // purple
    '#ec4899', // pink
];

// Helper to calculate payouts
export function calculatePayouts(resultNumber: number, bets: RouletteBet[]): { playerId: string, winnings: number, returned: number }[] {
    const payouts: Record<string, { winnings: number, returned: number }> = {};
    
    bets.forEach(bet => {
        if (!payouts[bet.playerId]) {
            payouts[bet.playerId] = { winnings: 0, returned: 0 };
        }
        
        const isWin = bet.numbers.includes(resultNumber);
        if (isWin) {
            const multiplier = PAYOUTS[bet.type];
            payouts[bet.playerId].winnings += bet.amount * multiplier;
            payouts[bet.playerId].returned += bet.amount; // Returned original bet
        }
    });

    return Object.entries(payouts).map(([playerId, amts]) => ({
        playerId,
        ...amts
    }));
}
