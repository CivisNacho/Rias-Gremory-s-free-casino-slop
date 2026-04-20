import { Users, Play, Star, Zap, ChevronRight, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Page, Game } from '../types';

const games: Game[] = [
  {
    id: 'roulette',
    title: 'EUROPEAN ROULETTE',
    description: 'High-end 3D European roulette wheel',
    image: 'https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/images/roulette_icon.jpg',
    minBet: 50,
    maxBet: 10000,
    type: 'live',
    status: 'live',
    players: 412
  },
  {
    id: 'slots',
    title: 'NOCTURNAL SLOTS',
    description: 'Immersive 3D slots with Progressive Jackpots',
    image: 'https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/main/images/slot_icon.jpg',
    minBet: 10,
    maxBet: 500,
    type: 'slot',
    status: 'hot',
    players: 666,
    jackpot: '$1.25M'
  },
  {
    id: 'poker',
    title: '4 CARD POKER',
    description: 'Master the elite 4-card strategy in a high-stakes duel.',
    image: 'https://raw.githubusercontent.com/CivisNacho/Rias-Casino-Assets/refs/heads/main/images/akane_poker_icon.jpg',
    minBet: 100,
    maxBet: 50000,
    type: 'table',
    status: 'new',
    players: 128
  }
];

export const Lobby = ({ onNavigate }: { onNavigate: (p: Page) => void }) => {
  return (
    <div className="p-8 md:p-12 lg:p-16 space-y-12 pb-32">
      {/* Grid Header */}
      <div className="flex justify-between items-end border-b border-outline-variant/5 pb-8">
        <div>
          <h2 className="font-headline text-5xl font-black text-on-surface uppercase tracking-tight">CURATED <span className="text-secondary italic">SELECTION</span></h2>
          <p className="text-on-surface/30 text-[10px] mt-3 uppercase tracking-[0.3em] font-black">The finest high-stakes experiences, reserved for Rias Gremori's selection.</p>
        </div>
        <div className="flex items-center gap-2 text-secondary text-[10px] font-black tracking-[0.2em] uppercase">
          <ChevronRight size={14} /> Active Game
        </div>
      </div>

      {/* Games Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
        {games.map((game, i) => (
          <motion.div
            key={game.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => onNavigate(game.id as Page)}
            className="group relative h-[480px] rounded-[40px] overflow-hidden cursor-pointer bg-surface-container-high border-2 border-outline-variant/5 hover:border-secondary/30 transition-all hover:-translate-y-3 shadow-xl"
          >
            <div className="absolute inset-0 z-0">
              <img 
                src={game.image} 
                alt={game.title} 
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-1000 ease-in-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent opacity-90" />
            </div>

            <div className="absolute inset-0 z-10 p-8 flex flex-col justify-end">
              <div className="flex items-center gap-2 mb-4">
                {game.status && (
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                    game.status === 'live' ? "bg-red-500 text-white animate-pulse" : "bg-secondary text-surface"
                  )}>
                    {game.status}
                  </span>
                )}
                {game.players && (
                  <span className="text-[10px] text-on-surface/60 font-black uppercase tracking-widest flex items-center gap-1.5 bg-surface/40 backdrop-blur px-2 py-1 rounded-md">
                    <Users size={12} /> {game.players}
                  </span>
                )}
              </div>
              <h3 className="font-headline text-3xl font-black text-on-surface mb-2 leading-none uppercase tracking-tighter">{game.title}</h3>
              <p className="text-on-surface/40 text-xs font-medium mb-6 line-clamp-2 leading-snug">{game.description}</p>
              
              <div className="flex items-center justify-between border-t border-outline-variant/10 pt-6 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                <span className="text-[10px] text-on-surface font-black uppercase tracking-widest">
                  Min ${game.minBet}
                </span>
                <div className="w-10 h-10 rounded-2xl bg-secondary text-surface flex items-center justify-center shadow-lg group-active:scale-90 transition-transform">
                  <Play size={16} fill="currentColor" />
                </div>
              </div>
            </div>

            {game.jackpot && (
              <div className="absolute top-6 right-6 bg-surface-container-highest/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-secondary/20 flex items-center gap-2 shadow-2xl">
                <Zap size={14} className="text-secondary fill-secondary/20" />
                <span className="text-sm font-black text-secondary font-headline italic tracking-tight">{game.jackpot}</span>
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};
