/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { 
  CircleDot, 
  Settings2, 
  Bell, 
  Volume2,
  VolumeX,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatCurrency } from './lib/utils';
import { Page } from './types';
import { PLAYER_COLORS, RoulettePlayer } from './lib/rouletteUtils';

// Real components
import { Lobby } from './components/Lobby';
import { RouletteGame } from './components/RouletteGame';
import { SlotsGame } from './components/SlotsGame';
import { PokerGame } from './components/PokerGame';
import { HorseRacingGame } from './components/HorseRacingGame';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('lobby');

  // --- Local Multiplayer State (Universal Session) ---
  const [players, setPlayers] = useState<RoulettePlayer[]>([
    { id: '1', name: 'Player 1', balance: 5000, color: PLAYER_COLORS[0] }
  ]);
  const [activePlayerId, setActivePlayerId] = useState<string>('1');
  const [isMuted, setIsMuted] = useState(false);

  const activePlayer = players.find(p => p.id === activePlayerId) || players[0];

  const addPlayer = () => {
    if (players.length >= 4) return;
    const newId = (players.length + 1).toString();
    const newPlayer = {
        id: newId,
        name: `Player ${newId}`,
        balance: 5000,
        color: PLAYER_COLORS[players.length]
    };
    setPlayers(prev => [...prev, newPlayer]);
    setActivePlayerId(newId);
  };

  return (
    <div className="flex flex-col h-screen bg-surface overflow-hidden">
      {/* Top bar */}
      <header className="h-14 flex items-center justify-between px-4 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10 sticky top-0 z-50 lg:px-5">
        <div className="flex items-center gap-6">
          <div 
            onClick={() => setCurrentPage('lobby')}
            className="text-lg font-black italic text-secondary uppercase tracking-tighter mr-2.5 cursor-pointer hover:opacity-80 transition-opacity font-lobster lg:text-xl"
          >
            Rias Gremori's <span className="text-white">Free Casino</span>
          </div>
        </div>

        {/* MULTIPLAYER SESSION HEADER (Universal) */}
          <div className="flex-1 flex items-center justify-center px-2">
            <div className="flex items-center gap-2 bg-surface-container/50 p-1 rounded-2xl border border-white/5">
                {players.map(p => (
                    <button 
                        key={p.id} 
                        onClick={() => setActivePlayerId(p.id)}
                        className={cn(
                            "flex items-center gap-2 px-2.5 py-1 rounded-xl transition-all relative overflow-hidden group",
                            activePlayerId === p.id ? "bg-secondary text-black shadow-lg shadow-secondary/20" : "hover:bg-white/5 text-on-surface/60"
                        )}
                    >
                        <div 
                            className="w-1.5 h-1.5 rounded-full shadow-sm" 
                            style={{ backgroundColor: activePlayerId === p.id ? '#000' : p.color }} 
                        />
                        <div className="text-left">
                            <p className={cn("text-[7px] font-black uppercase tracking-[0.18em] leading-none mb-0.5", activePlayerId === p.id ? "text-black/60" : "text-on-surface/40")}>
                                {p.name}
                            </p>
                            <p className={cn(
                              "text-[12px] font-black font-headline tracking-tight lg:text-[13px]",
                              p.balance < 0 ? "text-red-600" : ""
                            )}>
                                ${p.balance.toLocaleString()}
                            </p>
                        </div>
                        {activePlayerId === p.id && (
                            <motion.div layoutId="active-indicator" className="absolute bottom-0 left-0 w-full h-0.5 bg-black/20" />
                        )}
                    </button>
                ))}
                {players.length < 4 && (
                    <button 
                        onClick={addPlayer}
                        className="w-8 h-8 rounded-xl border border-dashed border-outline-variant/30 flex items-center justify-center text-on-surface/30 hover:text-secondary hover:border-secondary transition-colors"
                    >
                        <Plus size={14} />
                    </button>
                )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 bg-surface-container hover:bg-surface-container-highest rounded-xl text-on-surface/60 hover:text-secondary transition-all active:scale-90 border border-white/5"
            >
              {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
          </div>
        </header>

        {/* Content Canvas */}
        <main className="flex-1 min-h-0 relative bg-surface-container-low scroll-smooth overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "min-h-0 flex flex-col",
                currentPage === 'lobby' ? "min-h-full h-auto" : "h-full"
              )}
            >
              <div className={cn(
                "flex-1 min-h-0",
                currentPage === 'lobby' ? "h-auto" : "h-auto overflow-y-auto"
              )}>
                {currentPage === 'lobby' && <Lobby onNavigate={setCurrentPage} />}
                {currentPage === 'roulette' && (
                  <RouletteGame 
                    players={players} 
                    activePlayerId={activePlayerId} 
                    setPlayers={setPlayers} 
                    setActivePlayerId={setActivePlayerId}
                    onAddPlayer={addPlayer}
                    onExit={() => setCurrentPage('lobby')}
                  />
                )}
                {currentPage === 'slots' && (
                  <SlotsGame 
                    players={players} 
                    activePlayerId={activePlayerId} 
                    setPlayers={setPlayers} 
                    setActivePlayerId={setActivePlayerId}
                    onAddPlayer={addPlayer}
                    onExit={() => setCurrentPage('lobby')}
                  />
                )}
                {currentPage === 'poker' && (
                  <PokerGame 
                    players={players} 
                    activePlayerId={activePlayerId} 
                    setPlayers={setPlayers} 
                    setActivePlayerId={setActivePlayerId}
                    onAddPlayer={addPlayer}
                    onExit={() => setCurrentPage('lobby')}
                  />
                )}
                {currentPage === 'horseracing' && (
                  <HorseRacingGame 
                    players={players} 
                    activePlayerId={activePlayerId} 
                    setPlayers={setPlayers} 
                    onExit={() => setCurrentPage('lobby')}
                  />
                )}
              </div>

              {/* Universal Footer */}
              {currentPage === 'lobby' && (
                <footer className="w-full py-4 px-6 border-t border-outline-variant/10 flex flex-col items-center justify-center space-y-1 bg-surface-container-low/50 mt-auto lg:py-5">
                <div className="text-secondary opacity-50 font-lobster font-black italic text-base uppercase tracking-[0.16em] lg:text-lg">
                  Rias Gremori's Free Casino
                </div>
                <p className="text-[9px] font-medium text-on-surface/20 text-center uppercase tracking-widest">
                  © 2024 NOCTURNAL DEVIL. LICENSED BY GAMING CURAÇAO.
                </p>
              </footer>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
    </div>
  );
}
