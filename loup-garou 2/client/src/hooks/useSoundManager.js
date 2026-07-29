import { useCallback, useEffect, useRef } from 'react';

/**
 * Central sound manager. Files are expected under /public/sounds/ (see
 * client/src/assets/sounds/README.md for the manifest). Uses the native
 * Audio API directly — no extra deps needed for one-shot SFX.
 */
const SOUND_MAP = {
  wolfHowl: '/sounds/wolf-howl.mp3',
  morningBell: '/sounds/morning-bell.mp3',
  timerTick: '/sounds/timer-tick.mp3',
  victory: '/sounds/victory.mp3',
  defeat: '/sounds/defeat.mp3',
  lynch: '/sounds/lynch-thud.mp3',
  vote: '/sounds/vote-click.mp3',
};

export function useSoundManager() {
  const mutedRef = useRef(false);
  const volumeRef = useRef(0.7);
  const tickIntervalRef = useRef(null);
  const cache = useRef({});

  const play = useCallback((name) => {
    if (mutedRef.current) return;
    const src = SOUND_MAP[name];
    if (!src) return;

    if (!cache.current[name]) {
      cache.current[name] = new Audio(src);
    }
    const base = cache.current[name];
    const instance = base.cloneNode();
    instance.volume = volumeRef.current;
    instance.play().catch(() => {
      // Autoplay can be blocked before the user's first interaction;
      // fail silently rather than throwing in the UI.
    });
  }, []);

  const stopTicking = useCallback(() => {
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
  }, []);

  const startTicking = useCallback(
    (intervalMs = 1000) => {
      stopTicking();
      tickIntervalRef.current = setInterval(() => play('timerTick'), intervalMs);
    },
    [play, stopTicking]
  );

  useEffect(() => stopTicking, [stopTicking]);

  const setMuted = useCallback((muted) => {
    mutedRef.current = muted;
  }, []);

  const setVolume = useCallback((vol) => {
    volumeRef.current = Math.max(0, Math.min(1, vol));
  }, []);

  return { play, startTicking, stopTicking, setMuted, setVolume };
}
