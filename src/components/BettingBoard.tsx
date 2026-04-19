import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
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
    
    // Group bets by their unique drop zone and by player
    const renderChips = (type: BetType, numbers: number[]) => {
        const zoneBets = bets.filter(b => b.type === type && JSON.stringify(b.numbers) === JSON.stringify(numbers));
        if (zoneBets.length === 0) return null;

        // Group bets by player so we can show each player's contribution
        const playerBets: Record<string, number> = {};
        zoneBets.forEach(b => {
            playerBets[b.playerId] = (playerBets[b.playerId] || 0) + b.amount;
        });

        const distinctPlayerIds = Object.keys(playerBets);

        return (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden">
                <div className="flex flex-wrap items-center justify-center gap-0.5 max-w-full p-0.5">
                    {distinctPlayerIds.map(pId => {
                        const player = players.find(p => p.id === pId);
                        const amount = playerBets[pId];
                        return (
                            <motion.div 
                                key={pId}
                                initial={{ scale: 0, opacity: 0, y: -10 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                className="w-5 h-5 md:w-7 md:h-7 rounded-full flex items-center justify-center bg-white border-2 shadow-sm shrink-0"
                                style={{ borderColor: player?.color || '#fff' }}
                            >
                                <span className="text-black font-black text-[7px] md:text-[9px] leading-none">{amount}</span>
                            </motion.div>
                        );
                    })}
                </div>
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
        <div className="w-full max-w-4xl mx-auto select-none bg-red-950 p-2 md:p-4 rounded-[16px] shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] border border-red-900/50">
            {/* DESKTOP LAYOUT (Horizontal) */}
            <div className="hidden md:flex w-full flex-col gap-1">
                
                {/* Top Section: 0, Numbers, 2:1 */}
                <div className="flex gap-1 h-24 md:h-36">
                    {/* ZERO */}
                    <div 
                        className="w-8 md:w-12 border-2 border-[#facc15]/40 rounded-l-full flex items-center justify-center cursor-pointer hover:bg-[#facc15]/20 relative text-[#facc15] font-black text-xs md:text-xl hover:shadow-[0_0_15px_rgba(250,204,21,0.5)] transition-all"
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
                                            className={`flex-1 border border-red-900/40 flex items-center justify-center cursor-pointer relative text-white font-black text-xs md:text-lg hover:shadow-[inset_0_0_15px_rgba(255,42,42,0.8)] transition-all
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
                    <div className="w-8 md:w-16 flex flex-col gap-1">
                        {allRows.map((row, idx) => (
                            <div key={idx} 
                                className="flex-1 border-2 border-red-900/60 flex items-center justify-center cursor-pointer hover:bg-red-900/40 relative text-[#facc15] font-black text-[9px] md:text-sm tracking-tighter"
                                onClick={() => handleBet('COLUMN', row)}
                            >
                                2:1
                                {renderChips('COLUMN', row)}
                            </div>
                        ))}
                    </div>
                </div>

                {/* DOZENS */}
                <div className="flex gap-1 h-10 md:h-12 ml-8 md:ml-12 mr-8 md:mr-16">
                    { [
                        { label: '1st 12', nums: Array.from({length:12}, (_, i)=>i+1) },
                        { label: '2nd 12', nums: Array.from({length:12}, (_, i)=>i+13) },
                        { label: '3rd 12', nums: Array.from({length:12}, (_, i)=>i+25) }
                    ].map(dozen => (
                        <div key={dozen.label}
                            className="flex-1 border-2 border-red-900/60 flex items-center justify-center cursor-pointer hover:bg-red-900/40 relative text-white font-black tracking-tighter md:tracking-widest text-[9px] md:text-[11px] uppercase transition-colors"
                            onClick={() => handleBet('DOZEN', dozen.nums)}
                        >
                            {dozen.label}
                            {renderChips('DOZEN', dozen.nums)}
                        </div>
                    ))}
                </div>

                {/* BOTTOM OUTSIDES */}
                <div className="flex gap-1 h-12 md:h-16 ml-8 md:ml-12 mr-8 md:mr-16">
                    {[
                        { label: '1 TO 18', type: 'HALF' as BetType, nums: Array.from({length:18}, (_, i)=>i+1) },
                        { label: 'EVEN', type: 'PARITY' as BetType, nums: Array.from({length:18}, (_, i)=>(i+1)*2) },
                        { label: 'RED', type: 'COLOR' as BetType, bg: 'bg-red-800 text-white border-red-500/30', nums: Array.from({length:36}, (_, i)=>i+1).filter(n => getNumberColor(n) === 'red') },
                        { label: 'BLACK', type: 'COLOR' as BetType, bg: 'bg-black text-white border-white/10', nums: Array.from({length:36}, (_, i)=>i+1).filter(n => getNumberColor(n) === 'black') },
                        { label: 'ODD', type: 'PARITY' as BetType, nums: Array.from({length:18}, (_, i)=>(i*2)+1) },
                        { label: '19 TO 36', type: 'HALF' as BetType, nums: Array.from({length:18}, (_, i)=>i+19) },
                    ].map(out => (
                        <div key={out.label}
                            className={`flex-1 border-2 border-red-900/60 flex items-center justify-center cursor-pointer hover:bg-red-900/60 relative text-white font-black tracking-tighter md:tracking-widest text-[8px] md:text-[11px] transition-colors leading-[0.9] text-center p-1 ${out.bg || ''}`}
                            onClick={() => handleBet(out.type, out.nums)}
                        >
                            {out.bg ? '' : out.label}
                            {renderChips(out.type, out.nums)}
                        </div>
                    ))}
                </div>

            </div>

            {/* MOBILE LAYOUT (Vertical Grid) */}
            <div className="flex md:hidden w-full max-w-[320px] mx-auto aspect-[1/2.2] relative select-none">
                <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_1.5fr] gap-1 w-full h-full text-white" style={{ gridTemplateRows: 'repeat(14, 1fr)' }}>
                    
                    {/* ZERO */}
                    <div 
                        className="col-start-2 col-span-3 row-start-1 border-2 border-[#facc15]/40 rounded-t-full flex items-center justify-center cursor-pointer hover:bg-[#facc15]/20 relative text-[#facc15] font-black text-xl hover:shadow-[0_0_15px_rgba(250,204,21,0.5)] transition-all bg-red-950"
                        onClick={() => handleBet('STRAIGHT', [0])}
                    >
                        0
                        {renderChips('STRAIGHT', [0])}
                    </div>

                    {/* Left DOZENS */}
                    {[
                        { label: '1st 12', row: 2, nums: Array.from({length:12}, (_, i)=>i+1) },
                        { label: '2nd 12', row: 6, nums: Array.from({length:12}, (_, i)=>i+13) },
                        { label: '3rd 12', row: 10, nums: Array.from({length:12}, (_, i)=>i+25) }
                    ].map(d => (
                        <div key={d.label} style={{ gridRowStart: d.row, gridRowEnd: d.row + 4 }} 
                            className="col-start-1 border-2 border-red-900/60 flex items-center justify-center cursor-pointer hover:bg-red-900/40 relative text-white font-black tracking-tighter text-[10px] sm:text-xs uppercase transition-colors [writing-mode:vertical-lr] rotate-180 rounded-l-lg bg-red-950"
                            onClick={() => handleBet('DOZEN', d.nums)}>
                            {d.label}
                            {renderChips('DOZEN', d.nums)}
                        </div>
                    ))}

                    {/* Right OUTSIDES */}
                    {[
                        { label: '1-18', type: 'HALF' as BetType, row: 2, nums: Array.from({length:18}, (_, i)=>i+1) },
                        { label: 'EVEN', type: 'PARITY' as BetType, row: 4, nums: Array.from({length:18}, (_, i)=>(i+1)*2) },
                        { label: 'RED', type: 'COLOR' as BetType, row: 6, bg: 'bg-red-800 border-red-500/30', nums: Array.from({length:36}, (_, i)=>i+1).filter(n => getNumberColor(n) === 'red') },
                        { label: 'BLACK', type: 'COLOR' as BetType, row: 8, bg: 'bg-black border-white/10', nums: Array.from({length:36}, (_, i)=>i+1).filter(n => getNumberColor(n) === 'black') },
                        { label: 'ODD', type: 'PARITY' as BetType, row: 10, nums: Array.from({length:18}, (_, i)=>(i*2)+1) },
                        { label: '19-36', type: 'HALF' as BetType, row: 12, nums: Array.from({length:18}, (_, i)=>i+19) },
                    ].map(o => (
                        <div key={o.label} style={{ gridRowStart: o.row, gridRowEnd: o.row + 2 }} 
                            className={`col-start-5 border-2 border-red-900/60 flex items-center justify-center cursor-pointer hover:bg-red-900/60 relative text-white font-black tracking-tighter text-[9px] sm:text-[10px] uppercase transition-colors [writing-mode:vertical-lr] rotate-180 rounded-r-lg ${o.bg || 'bg-red-950'}`}
                            onClick={() => handleBet(o.type, o.nums)}>
                            {o.bg ? '' : o.label}
                            {renderChips(o.type, o.nums)}
                        </div>
                    ))}

                    {/* Numbers Grid */}
                    {Array.from({length: 12}).map((_, rIdx) => {
                        const nums = [rIdx*3 + 1, rIdx*3 + 2, rIdx*3 + 3];
                        const gridY = rIdx + 2;
                        return nums.map((num, cIdx) => {
                            const gridX = cIdx + 2;
                            const col = getNumberColor(num);
                            return (
                                <div key={num}
                                    style={{ gridColumnStart: gridX, gridRowStart: gridY }}
                                    className={`border border-red-900/40 flex items-center justify-center cursor-pointer relative text-white font-black text-xs hover:shadow-[inset_0_0_15px_rgba(255,42,42,0.8)] transition-all ${col === 'red' ? 'bg-red-800' : 'bg-black'}`}
                                    onClick={() => handleBet('STRAIGHT', [num])}
                                >
                                    {num}
                                    {renderChips('STRAIGHT', [num])}
                                </div>
                            );
                        });
                    })}

                    {/* Bottom 2:1 columns */}
                    {[
                        { col: 2, nums: row3 },
                        { col: 3, nums: row2 },
                        { col: 4, nums: row1 }
                    ].map(c => (
                        <div key={c.col} style={{ gridColumnStart: c.col, gridRowStart: 14 }}
                            className="border-2 border-red-900/60 flex items-center justify-center cursor-pointer hover:bg-red-900/40 relative text-[#facc15] font-black text-[10px] tracking-tighter rounded-b-lg bg-red-950"
                            onClick={() => handleBet('COLUMN', c.nums)}
                        >
                            2:1
                            {renderChips('COLUMN', c.nums)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
