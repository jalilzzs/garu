import { useEffect, useState } from 'react';

export default function DayNightBackdrop({ phase }) {
  const isNight = phase === 'night';
  const [displayPhase, setDisplayPhase] = useState(isNight ? 'night' : 'day');

  useEffect(() => {
    const t = setTimeout(() => setDisplayPhase(isNight ? 'night' : 'day'), 50);
    return () => clearTimeout(t);
  }, [isNight]);

  return (
    <div
      className="fixed inset-0 -z-10 transition-colors duration-[1500ms] ease-in-out"
      style={{
        background: displayPhase === 'night'
          ? 'radial-gradient(ellipse at top, #1c2138 0%, #05060a 70%)'
          : 'radial-gradient(ellipse at top, #3a2a1c 0%, #12162a 75%)',
      }}
    >
      {displayPhase === 'night' ? (
        <div className="relative w-full h-full overflow-hidden">
          <div className="absolute top-10 right-16 w-20 h-20 rounded-full bg-moonlight-200/90 shadow-glow animate-moon-rise" />
          {Array.from({ length: 40 }).map((_, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-white/70"
              style={{
                width: Math.random() * 2 + 1,
                height: Math.random() * 2 + 1,
                top: `${Math.random() * 60}%`,
                left: `${Math.random() * 100}%`,
                opacity: Math.random() * 0.6 + 0.3,
              }}
            />
          ))}
        </div>
      ) : (
        <div className="relative w-full h-full overflow-hidden">
          <div className="absolute top-16 left-1/2 -translate-x-1/2 w-28 h-28 rounded-full bg-embergold-300 shadow-glow animate-sun-rise" />
        </div>
      )}
    </div>
  );
}
