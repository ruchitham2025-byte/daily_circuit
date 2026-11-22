type Tone = {
  frequency: number;
  duration: number;
  type: OscillatorType;
  startOffset?: number;
};

let audioContext: AudioContext | undefined;
let muted = false;
let mutePreferenceLoaded = false;

const loadMutePreference = (): void => {
  if (mutePreferenceLoaded) return;
  mutePreferenceLoaded = true;

  try {
    if (typeof window !== 'undefined') {
      muted = window.sessionStorage.getItem('daily-circuit:sound-enabled') === 'false';
    }
  } catch (error) {
    console.error('Unable to restore sound setting:', error);
  }
};

export const isMuted = (): boolean => {
  loadMutePreference();
  return muted;
};

export const setMuted = (nextMuted: boolean): void => {
  muted = nextMuted;
  mutePreferenceLoaded = true;

  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('daily-circuit:sound-enabled', String(!nextMuted));
    }
  } catch (error) {
    console.error('Unable to save sound setting:', error);
  }
};

const getAudioContext = (): AudioContext | undefined => {
  if (typeof window === 'undefined' || typeof window.AudioContext !== 'function') {
    return undefined;
  }

  try {
    audioContext ??= new window.AudioContext();
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch((error: unknown) => {
        console.error('Unable to resume puzzle audio:', error);
      });
    }
    return audioContext;
  } catch (error) {
    console.error('Unable to initialize puzzle audio:', error);
    return undefined;
  }
};

const playTones = (tones: Tone[], peakGain: number): void => {
  if (isMuted()) return;

  try {
    const context = getAudioContext();
    if (!context) return;

    const startTime = context.currentTime;
    for (const tone of tones) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = startTime + (tone.startOffset ?? 0);
      const end = start + tone.duration;

      oscillator.type = tone.type;
      oscillator.frequency.setValueAtTime(tone.frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peakGain, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);
      oscillator.stop(end + 0.015);
    }
  } catch (error) {
    console.error('Unable to play puzzle sound:', error);
  }
};

export const playPlace = (): void => {
  playTones([{ frequency: 480, duration: 0.085, type: 'sine' }], 0.1);
};

export const playRotate = (): void => {
  playTones([{ frequency: 680, duration: 0.11, type: 'triangle' }], 0.09);
};

export const playSurge = (): void => {
  playTones(
    [
      { frequency: 190, duration: 0.18, type: 'sawtooth' },
      { frequency: 380, duration: 0.16, type: 'triangle', startOffset: 0.045 },
    ],
    0.08
  );
};

export const playWin = (): void => {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  playTones(
    notes.map((frequency, index) => ({
      frequency,
      duration: 0.22,
      type: 'triangle',
      startOffset: index * 0.12,
    })),
    0.11
  );
};
