import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../../context/GameContext';
import { SoundFX } from '../../audio/SoundFX';

export const DesktopPet: React.FC = () => {
  const { state, petPet, addCredits } = useGame();
  const pet = state.pet;

  const [x, setX] = useState<number>(window.innerWidth * 0.4);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const [action, setAction] = useState<'walk' | 'idle' | 'sit' | 'sleep' | 'dig' | 'happy'>('walk');
  const [speech, setSpeech] = useState<string>('汪！本汪在巡逻桌面！');
  const [showSpeech, setShowSpeech] = useState<boolean>(true);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);

  const speechTimerRef = useRef<number | null>(null);
  const lastMeritRef = useRef<number>(state.merit);
  const lastDigTimeRef = useRef<number>(0);

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

  // Main Walking & Behavior AI Loop
  useEffect(() => {
    if (pet.roamOnDesktop === false) return;

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
          triggerSpeech(`🎉 哇！刨到了一枚赛博冷钱包，+$${coin} 赛博币！`);
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
        setX((prev) => {
          const step = direction === 'right' ? 8 : -8;
          const next = prev + step;
          const minX = 40;
          const maxX = window.innerWidth - 100;
          if (next >= maxX) {
            setDirection('left');
            return maxX;
          }
          if (next <= minX) {
            setDirection('right');
            return minX;
          }
          return next;
        });
      }
    }, 1200);

    return () => clearInterval(walkTimer);
  }, [action, direction, addCredits, pet.roamOnDesktop, triggerSpeech]);

  // Click on pet: petting!
  const handlePetClick = (e: React.MouseEvent) => {
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

  // If roaming is disabled in state, do not render JSX (all hooks called in consistent order)
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
        left: `${x}px`,
        bottom: '48px',
        transition: action === 'walk' ? 'left 1.2s linear' : 'none',
      }}
      className="fixed z-[9990] pointer-events-auto select-none flex flex-col items-center group cursor-pointer"
      onClick={handlePetClick}
    >
      {/* Speech bubble */}
      {showSpeech && (
        <div className="pointer-events-none absolute bottom-16 -left-12 w-48 p-2 rounded-xl bg-slate-900/95 border border-cyan-500/60 shadow-lg shadow-cyan-950/80 text-[11px] font-mono text-cyan-200 text-center animate-in zoom-in-95 duration-150 backdrop-blur-md">
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
        className={`text-4xl transition-transform duration-200 ${
          action === 'happy'
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
      <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 px-1.5 py-0.2 rounded-full bg-slate-900/80 border border-slate-700 text-[9px] text-slate-300 font-mono flex items-center gap-1">
        <span>{pet.name}</span>
        <span className="text-yellow-400">Lv.{pet.level}</span>
      </div>
    </div>
  );
};
