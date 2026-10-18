import React, { useState } from 'react';
import { CheckSquare, Square, Plus, Trash2, StickyNote, ChevronRight, ChevronLeft, Eraser } from 'lucide-react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';

export const StickyNotes: React.FC = () => {
  // Todos live in the global save so they survive reloads.
  // It's a "today" list: checked items auto-reset on a new day (handled by the save loader & main loop).
  const { state, addTodo, toggleTodo, removeTodo, clearDoneTodos } = useGame();
  const todos = state.todos || [];
  const [newText, setNewText] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const doneCount = todos.filter((t) => t.done).length;
  const dateLabel = new Date().toLocaleDateString([], { month: 'numeric', day: 'numeric' });

  const onToggle = (id: string) => {
    SoundFX.playKeyClick();
    toggleTodo(id);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    SoundFX.playCash();
    addTodo(newText.trim());
    setNewText('');
  };

  const onRemove = (id: string) => {
    SoundFX.playKeyClick();
    removeTodo(id);
  };

  const onClearDone = () => {
    SoundFX.playKeyClick();
    clearDoneTodos();
  };

  return (
    <aside
      className={`fixed top-12 right-3 z-30 transition-all duration-300 font-mono text-xs select-none ${
        isCollapsed ? 'translate-x-[calc(100%-32px)]' : 'translate-x-0'
      }`}
    >
      <div className="w-64 sm:w-72 rounded-xl bg-amber-950/40 border border-yellow-500/40 backdrop-blur-md shadow-2xl p-3 text-yellow-100 flex flex-col">
        {/* Header with Collapse Toggle */}
        <div className="flex items-center justify-between pb-2 border-b border-yellow-500/30 mb-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1.5 font-bold text-yellow-300 hover:text-yellow-200"
          >
            <StickyNote size={14} className="text-yellow-400" />
            <span>今日摸鱼代办清单</span>
            <span className="text-[9px] font-normal text-yellow-500/80">{dateLabel} · {doneCount}/{todos.length}</span>
          </button>
          <div className="flex items-center gap-0.5">
            {doneCount > 0 && (
              <button
                onClick={onClearDone}
                title="清空已完成的条目"
                className="p-1 rounded hover:bg-yellow-900/40 text-yellow-400/80 hover:text-green-300"
              >
                <Eraser size={13} />
              </button>
            )}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 rounded hover:bg-yellow-900/40 text-yellow-300"
            >
              {isCollapsed ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
        </div>

        {/* Todo Items */}
        {!isCollapsed && (
          <>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-center justify-between gap-2 p-1.5 rounded bg-yellow-950/30 hover:bg-yellow-900/30 border border-yellow-500/20 group"
                >
                  <button
                    onClick={() => onToggle(todo.id)}
                    className="flex items-center gap-2 text-left truncate flex-1"
                  >
                    {todo.done ? (
                      <CheckSquare size={13} className="text-green-400 shrink-0" />
                    ) : (
                      <Square size={13} className="text-yellow-400/70 shrink-0" />
                    )}
                    <span
                      className={`truncate text-[11px] ${
                        todo.done ? 'line-through text-yellow-400/50' : 'text-yellow-200'
                      }`}
                    >
                      {todo.text}
                    </span>
                  </button>

                  <button
                    onClick={() => onRemove(todo.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 p-0.5"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add Input */}
            <form onSubmit={onSubmit} className="flex items-center gap-1.5 mt-2 pt-2 border-t border-yellow-500/20">
              <input
                type="text"
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="添加新的摸鱼事项..."
                className="flex-1 px-2 py-1 rounded bg-yellow-950/60 border border-yellow-500/30 text-[10px] text-yellow-200 placeholder:text-yellow-500/50 outline-none"
              />
              <button
                type="submit"
                className="p-1 rounded bg-yellow-500 hover:bg-yellow-400 text-slate-950 font-bold"
              >
                <Plus size={13} />
              </button>
            </form>
          </>
        )}
      </div>
    </aside>
  );
};
