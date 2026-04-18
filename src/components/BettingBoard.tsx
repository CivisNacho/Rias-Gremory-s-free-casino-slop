import React, { useMemo } from 'react';
import { BetType, RouletteBet, RoulettePlayer, getNumberColor } from '../lib/rouletteUtils';

interface BettingBoardProps {
    bets: RouletteBet[];
    players: RoulettePlayer[];
    activePlayerId: string | null;
    chipValue: number;
    onPlaceBet: (type: BetType, numbers: number[]) => void;
    disabled?: boolean;
}

export const BettingBoard: React.FC<BettingBoardProps> = ({
    bets, players, activePlayerId, chipValue, onPlaceBet, disabled
}) => {
    
    // Group bets by their unique drop zone (we can use a JSON string of numbers + type as a key)
    const renderChips = (type: BetType, numbers: number[]) => {
        const zoneBets = bets.filter(b => b.type === type && JSON.stringify(b.numbers) === JSON.stringify(numbers));
        if (zoneBets.length === 0) return null;

        // Sum up total bet for this zone, and get last player's color
        // For a more complex game, we'd render multiple stacked chips.
        const total = zoneBets.reduce((sum, b) => sum + b.amount, 0);
        const lastBetPlayer = players.find(p => p.id === zoneBets[zoneBets.length - 1].playerId);
        const color = lastBetPlayer ? lastBetPlayer.color : '#fff';

        return (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 
                            w-8 h-8 rounded-full flex items-center justify-center
                            shadow bg-white pointer-events-none z-10 border-4"
                 style={{ borderColor: color }}>
                <span className="text-black font-bold text-xs">{total}</span>
            </div>
        );
    };

    const handleBet = (type: BetType, numbers: number[]) => {
        if (disabled || !activePlayerId) return;
        onPlaceBet(type, numbers);
    };

    const row1 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
    const row2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
    const row3 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

    const allRows = [row1, row2, row3];

    return (
        <div className="w-full max-w-4xl mx-auto select-none bg-red-950 p-4 rounded-[16px] shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] overflow-x-auto border border-red-900/50">
            <div className="min-w-[700px] flex flex-col gap-1">
                
                {/* Top Section: 0, Numbers, 2:1 */}
                <div className="flex gap-1 h-36">
                    {/* ZERO */}
                    <div 
                        className="w-12 border-2 border-[#facc15]/40 rounded-l-full flex items-center justify-center cursor-pointer hover:bg-[#facc15]/20 relative text-[#facc15] font-black text-xl hover:shadow-[0_0_15px_rgba(250,204,21,0.5)] transition-all"
                        onClick={() => handleBet('STRAIGHT', [0])}
                    >
                        0
                        {renderChips('STRAIGHT', [0])}
                    </div>

                    {/* NUMBERS GRID */}
                    <div className="flex-1 flex flex-col gap-1">
                        {allRows.map((row, rIdx) => (
                            <div key={rIdx} className="flex-1 flex gap-1">
                                {row.map(num => {
                                    const col = getNumberColor(num);
                                    return (
                                        <div 
                                            key={num} 
                                            className={`flex-1 border border-red-900/40 flex items-center justify-center cursor-pointer relative text-white font-black text-lg hover:shadow-[inset_0_0_15px_rgba(255,42,42,0.8)] transition-all
                                                ${col === 'red' ? 'bg-red-800' : 'bg-black'}
                                            `}
                                            onClick={() => handleBet('STRAIGHT', [num])}
                                        >
                                            {num}
                                            {renderChips('STRAIGHT', [num])}
                                        </div>
                                    )
                                })}
                            </div>
                        ))}
                    </div>

                    {/* 2:1 COLUMNS */}
                    <div className="w-16 flex flex-col gap-1">
                        {allRows.map((row, idx) => (
                            <div key={idx} 
                                className="flex-1 border-2 border-red-900/60 flex items-center justify-center cursor-pointer hover:bg-red-900/40 relative text-[#facc15] font-black text-sm tracking-tighter"
                                onClick={() => handleBet('COLUMN', row)}
                            >
                                2:1
                                {renderChips('COLUMN', row)}
                            </div>
                        ))}
                    </div>
                </div>

                {/* DOZENS */}
                <div className="flex gap-1 h-12 ml-12 mr-16">
                    { [
                        { label: '1st 12', nums: Array.from({length:12}, (_, i)=>i+1) },
                        { label: '2nd 12', nums: Array.from({length:12}, (_, i)=>i+13) },
                        { label: '3rd 12', nums: Array.from({length:12}, (_, i)=>i+25) }
                    ].map(dozen => (
                        <div key={dozen.label}
                            className="flex-1 border-2 border-red-900/60 flex items-center justify-center cursor-pointer hover:bg-red-900/40 relative text-white font-black tracking-widest text-[11px] uppercase transition-colors"
                            onClick={() => handleBet('DOZEN', dozen.nums)}
                        >
                            {dozen.label}
                            {renderChips('DOZEN', dozen.nums)}
                        </div>
                    ))}
                </div>

                {/* BOTTOM OUTSIDES */}
                <div className="flex gap-1 h-16 ml-12 mr-16">
                    {[
                        { label: '1 TO 18', type: 'HALF' as BetType, nums: Array.from({length:18}, (_, i)=>i+1) },
                        { label: 'EVEN', type: 'PARITY' as BetType, nums: Array.from({length:18}, (_, i)=>(i+1)*2) },
                        { label: 'RED', type: 'COLOR' as BetType, bg: 'bg-red-800 text-white border-red-500/30', nums: Array.from({length:36}, (_, i)=>i+1).filter(n => getNumberColor(n) === 'red') },
                        { label: 'BLACK', type: 'COLOR' as BetType, bg: 'bg-black text-white border-white/10', nums: Array.from({length:36}, (_, i)=>i+1).filter(n => getNumberColor(n) === 'black') },
                        { label: 'ODD', type: 'PARITY' as BetType, nums: Array.from({length:18}, (_, i)=>(i*2)+1) },
                        { label: '19 TO 36', type: 'HALF' as BetType, nums: Array.from({length:18}, (_, i)=>i+19) },
                    ].map(out => (
                        <div key={out.label}
                            className={`flex-1 border-2 border-red-900/60 flex items-center justify-center cursor-pointer hover:bg-red-900/60 relative text-white font-black tracking-widest text-[11px] transition-colors ${out.bg || ''}`}
                            onClick={() => handleBet(out.type, out.nums)}
                        >
                            {out.bg ? '' : out.label}
                            {renderChips(out.type, out.nums)}
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
};
