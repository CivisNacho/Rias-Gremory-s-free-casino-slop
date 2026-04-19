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
      <header className="h-20 flex items-center justify-between px-8 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/10 sticky top-0 z-50">
        <div className="flex items-center gap-12">
          <div 
            onClick={() => setCurrentPage('lobby')}
            className="text-2xl font-black italic text-secondary uppercase tracking-tighter mr-8 cursor-pointer hover:opacity-80 transition-opacity font-lobster"
          >
            Rias Gremori's <span className="text-white">Free Casino</span>
          </div>
        </div>

        {/* MULTIPLAYER SESSION HEADER (Universal) */}
          <div className="flex-1 flex items-center justify-center px-8">
            <div className="flex items-center gap-4 bg-surface-container/50 p-1.5 rounded-2xl border border-white/5">
                {players.map(p => (
                    <button 
                        key={p.id} 
                        onClick={() => setActivePlayerId(p.id)}
                        className={cn(
                            "flex items-center gap-3 px-4 py-2 rounded-xl transition-all relative overflow-hidden group",
                            activePlayerId === p.id ? "bg-secondary text-black shadow-lg shadow-secondary/20" : "hover:bg-white/5 text-on-surface/60"
                        )}
                    >
                        <div 
                            className="w-2.5 h-2.5 rounded-full shadow-sm" 
                            style={{ backgroundColor: activePlayerId === p.id ? '#000' : p.color }} 
                        />
                        <div className="text-left">
                            <p className={cn("text-[9px] font-black uppercase tracking-widest leading-none mb-0.5", activePlayerId === p.id ? "text-black/60" : "text-on-surface/40")}>
                                {p.name}
                            </p>
                            <p className={cn(
                              "text-sm font-black font-headline tracking-tight",
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
                        className="w-10 h-10 rounded-xl border border-dashed border-outline-variant/30 flex items-center justify-center text-on-surface/30 hover:text-secondary hover:border-secondary transition-colors"
                    >
                        <Plus size={18} />
                    </button>
                )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className="p-3 bg-surface-container hover:bg-surface-container-highest rounded-xl text-on-surface/60 hover:text-secondary transition-all active:scale-90 border border-white/5"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
          </div>
        </header>

        {/* Content Canvas */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative bg-surface-container-low scroll-smooth">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="min-h-full flex flex-col"
            >
              <div className="flex-1">
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
              </div>

              {/* Universal Footer */}
              <footer className="w-full py-16 px-12 border-t border-outline-variant/10 flex flex-col items-center justify-center space-y-8 bg-surface-container-low/50 mt-auto">
                <div className="text-secondary opacity-50 font-lobster font-black italic text-2xl uppercase tracking-[0.2em]">
                  Rias Gremori's Free Casino
                </div>
                <p className="text-[10px] font-medium text-on-surface/20 text-center uppercase tracking-widest">
                  © 2024 NOCTURNAL DEVIL. LICENSED BY GAMING CURAÇAO.
                </p>
              </footer>
            </motion.div>
          </AnimatePresence>
        </main>
    </div>
  );
}
