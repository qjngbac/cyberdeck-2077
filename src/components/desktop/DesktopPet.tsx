import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';
import { formatCredits } from '../../utils/gameLogic';

const PET_POS_KEY = 'cyberdeck_desktop_pet_pos';

function loadSavedPetPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(PET_POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
        const minX = 10;
        const maxX = Math.max(minX, window.innerWidth - 70);
        const minY = 35;
        const maxY = Math.max(minY, window.innerHeight - 80);
        return {
          x: Math.min(maxX, Math.max(minX, parsed.x)),
          y: Math.min(maxY, Math.max(minY, parsed.y)),
        };
      }
    }
  } catch {}
  return {
    x: Math.max(40, Math.min(window.innerWidth - 100, window.innerWidth * 0.4)),
    y: Math.max(40, window.innerHeight - 110),
  };
}

export const DesktopPet: React.FC = () => {
  const { state, petPet, addCredits } = useGame();
  const pet = state.pet;

  const [pos, setPos] = useState<{ x: number; y: number }>(() => loadSavedPetPos());
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [action, setAction] = useState<'walk' | 'idle' | 'sit' | 'sleep' | 'dig' | 'happy' | 'held'>('walk');
  const [speech, setSpeech] = useState<string>('汪！本汪在巡逻桌面！');
  const [showSpeech, setShowSpeech] = useState<boolean>(true);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const speechTimerRef = useRef<number | null>(null);
  const lastMeritRef = useRef<number>(state.merit);
  const lastDigTimeRef = useRef<number>(0);
  const dragStartRef = useRef<{ startX: number; startY: number; pointerX: number; pointerY: number; moved: boolean }>({
    startX: 0,
    startY: 0,
    pointerX: 0,
    pointerY: 0,
    moved: false,
  });

  const triggerSpeech = useCallback((text: string, durationMs: number = 3500) => {
    setSpeech(text);
    setShowSpeech(true);
    if (speechTimerRef.current) clearTimeout(speechTimerRef.current);
    speechTimerRef.current = window.setTimeout(() => {
      setShowSpeech(false);
    }, durationMs);
  }, []);

  // React to wooden fish merit taps!
  useEffect(() => {
    if (pet.roamOnDesktop === false) return;
    if (state.merit > lastMeritRef.current) {
      lastMeritRef.current = state.merit;
      triggerSpeech('📿 功德+1！本汪感应到了善念！');
      setAction('happy');
    }
  }, [state.merit, pet.roamOnDesktop, triggerSpeech]);

  // Window resize protection: clamp pet coordinates to stay in viewport
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => {
        const minX = 10;
        const maxX = Math.max(minX, window.innerWidth - 70);
        const minY = 35;
        const maxY = Math.max(minY, window.innerHeight - 80);
        return {
          x: Math.min(maxX, Math.max(minX, prev.x)),
          y: Math.min(maxY, Math.max(minY, prev.y)),
        };
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Main Walking & Behavior AI Loop (paused while dragging)
  useEffect(() => {
    if (pet.roamOnDesktop === false || isDragging || action === 'held') return;

    const walkTimer = setInterval(() => {
      // If sleeping or sitting, occasional chance to stand up
      if (action === 'sleep' || action === 'sit') {
        if (Math.random() < 0.25) {
          setAction('walk');
        }
        return;
      }

      // If happy or digging, finish soon
      if (action === 'happy' || action === 'dig') {
        setAction('idle');
        return;
      }

      // Random state transitions
      const roll = Math.random();
      if (roll < 0.08) {
        // Sit down
        setAction('sit');
        triggerSpeech('呼... 坐下来看主银敲代码~');
      } else if (roll < 0.12) {
        // Sleep
        setAction('sleep');
        triggerSpeech('zzz... 正在云端待机休眠...');
      } else if (roll < 0.16) {
        // Digging treasure (with 60s cooldown to prevent exploit)
        const now = Date.now();
        if (now - lastDigTimeRef.current > 60000) {
          lastDigTimeRef.current = now;
          setAction('dig');
          const coin = 30 + Math.floor(Math.random() * 30);
          addCredits(coin);
          SoundFX.playCash();
          triggerSpeech(`🎉 哇！刨到了一枚赛博冷钱包，+${formatCredits(coin)}！`);
        } else {
          setAction('sit');
        }
      } else if (roll < 0.35) {
        // Turn around
        setDirection((d) => (d === 'left' ? 'right' : 'left'));
        setAction('walk');
      } else {
        // Walk forward
        setAction('walk');
        setPos((prev) => {
          const step = direction === 'right' ? 8 : -8;
          const nextX = prev.x + step;
          const minX = 20;
          const maxX = Math.max(minX, window.innerWidth - 80);
          if (nextX >= maxX) {
            setDirection('left');
            return { ...prev, x: maxX };
          }
          if (nextX <= minX) {
            setDirection('right');
            return { ...prev, x: minX };
          }
          return { ...prev, x: nextX };
        });
      }
    }, 1200);

    return () => clearInterval(walkTimer);
  }, [action, direction, addCredits, pet.roamOnDesktop, triggerSpeech, isDragging]);

  // Pointer Down: Start Dragging handler
  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // Only primary button
    e.preventDefault();

    dragStartRef.current = {
      startX: pos.x,
      startY: pos.y,
      pointerX: e.clientX,
      pointerY: e.clientY,
      moved: false,
    };

    const handlePointerMove = (ev: PointerEvent) => {
      const dx = ev.clientX - dragStartRef.current.pointerX;
      const dy = ev.clientY - dragStartRef.current.pointerY;

      if (!dragStartRef.current.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        dragStartRef.current.moved = true;
        setIsDragging(true);
        setAction('held');
        const dragPhrases = [
          '起飞喽！(o゜▽゜)o',
          '主银你要带本汪去哪呀~',
          '哇呀呀~ 巡逻新领地！',
          '抓稳啦！不要把本汪摔着啦~',
        ];
        triggerSpeech(dragPhrases[Math.floor(Math.random() * dragPhrases.length)], 3000);
      }

      if (dragStartRef.current.moved) {
        const minX = 10;
        const maxX = Math.max(minX, window.innerWidth - 70);
        const minY = 35;
        const maxY = Math.max(minY, window.innerHeight - 80);
        const nextX = Math.min(maxX, Math.max(minX, dragStartRef.current.startX + dx));
        const nextY = Math.min(maxY, Math.max(minY, dragStartRef.current.startY + dy));
        setPos({ x: nextX, y: nextY });
      }
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);

      if (dragStartRef.current.moved) {
        setIsDragging(false);
        setAction('sit');
        SoundFX.playKeyClick();
        const landPhrases = [
          '顺利着陆！本汪在这里值守！',
          '换了个好视角，代码都写得更快了！',
          '安全着陆~ 坐下来看主银敲代码~',
        ];
        triggerSpeech(landPhrases[Math.floor(Math.random() * landPhrases.length)], 3000);
        setPos((latestPos) => {
          try {
            localStorage.setItem(PET_POS_KEY, JSON.stringify(latestPos));
          } catch {}
          return latestPos;
        });
      }
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Click on pet: petting! (Only if not dragged)
  const handlePetClick = (e: React.MouseEvent) => {
    if (dragStartRef.current.moved) {
      dragStartRef.current.moved = false;
      return;
    }
    e.stopPropagation();
    SoundFX.playLevelUp();
    petPet();
    setAction('happy');

    // Spawn heart particle
    const heartId = Date.now();
    setHearts((prev) => [...prev, { id: heartId, x: 20, y: -20 }]);
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== heartId));
    }, 1000);

    const quotes = [
      `“主银！${pet.name}最喜欢你了汪！”`,
      '“蹭蹭~ 感觉电量与心情都回满啦！”',
      '“今天也是努力巡逻桌面的一天！”',
      '“代码写累了要多喝水、动动脖子哦！”',
      '“呼噜噜... 舒服得本汪天线都在发光~”',
    ];
    triggerSpeech(quotes[Math.floor(Math.random() * quotes.length)]);
  };

  // If roaming is disabled in state, do not render JSX
  if (pet.roamOnDesktop === false) {
    return null;
  }

  // Determine avatar icon
  let petIcon = '🐕';
  if (pet.type === 'cat') {
    petIcon = pet.stage === 1 ? '🐱' : pet.stage === 2 ? '🐈' : '🐅';
  } else if (pet.type === 'dragon') {
    petIcon = pet.stage === 1 ? '🦎' : pet.stage === 2 ? '🐉' : '🐲';
  } else {
    petIcon = pet.stage === 1 ? '🐕' : pet.stage === 2 ? '🦮' : '🐺';
  }

  return (
    <div
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transition: action === 'walk' && !isDragging ? 'left 1.2s linear' : 'none',
        touchAction: 'none',
      }}
      className={`fixed z-[9990] pointer-events-auto select-none flex flex-col items-center group cursor-grab active:cursor-grabbing ${
        isDragging ? 'cursor-grabbing' : ''
      }`}
      onPointerDown={handlePointerDown}
      onClick={handlePetClick}
    >
      {/* Speech bubble */}
      {showSpeech && (
        <div className="pointer-events-none absolute -top-14 left-1/2 -translate-x-1/2 w-48 p-2 rounded-xl bg-slate-900/95 border border-cyan-500/60 shadow-lg shadow-cyan-950/80 text-[11px] font-mono text-cyan-200 text-center animate-in zoom-in-95 duration-150 backdrop-blur-md">
          {speech}
          {/* Arrow */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 border-r border-b border-cyan-500/60 rotate-45" />
        </div>
      )}

      {/* Floating Hearts */}
      {hearts.map((h) => (
        <div
          key={h.id}
          className="absolute -top-6 text-pink-500 font-bold animate-bounce pointer-events-none"
        >
          ❤️
        </div>
      ))}

      {/* Pet Avatar Sprite */}
      <div
        style={{
          transform: direction === 'left' ? 'scaleX(-1)' : 'scaleX(1)',
        }}
        className={`text-4xl transition-all duration-200 ${
          isDragging
            ? 'scale-125 -rotate-12 filter drop-shadow-[0_10px_20px_rgba(6,182,212,0.6)] animate-pulse'
            : action === 'happy'
            ? 'animate-bounce'
            : action === 'sleep'
            ? 'opacity-80 scale-90'
            : action === 'walk'
            ? 'hover:scale-115'
            : ''
        }`}
      >
        {petIcon}
      </div>

      {/* Name tag on hover */}
      <div
        className={`mt-0.5 px-1.5 py-0.2 rounded-full bg-slate-900/80 border border-slate-700 text-[9px] text-slate-300 font-mono flex items-center gap-1 transition-opacity ${
          isDragging ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <span>{pet.name}</span>
        <span className="text-yellow-400">Lv.{pet.level}</span>
      </div>
    </div>
  );
};
