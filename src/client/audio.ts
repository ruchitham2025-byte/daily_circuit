type Sound =
  | 'place'
  | 'rotate'
  | 'receiver'
  | 'hazard'
  | 'hint'
  | 'win'
  | 'laser';

let audioContext: AudioContext | undefined;
let soundEnabled = true;

try {
  if (typeof window !== 'undefined') {
    const savedSoundSetting = window.sessionStorage.getItem('daily-circuit:sound-enabled');
    if (savedSoundSetting !== null) {
      soundEnabled = savedSoundSetting === 'true';
    }
  }
} catch (error) {
  console.error('Unable to restore sound setting:', error);
}

export const getSoundEnabled = (): boolean => soundEnabled;

export const setSoundEnabled = (enabled: boolean): void => {
  soundEnabled = enabled;
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('daily-circuit:sound-enabled', String(enabled));
    }
  } catch (error) {
    console.error('Unable to save sound setting:', error);
  }
};

export const playSound = (sound: Sound): void => {
  if (!soundEnabled || typeof window === 'undefined') return;

  try {
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    audioContext ??= new AudioContextConstructor();
    const context = audioContext;
    if (context.state === 'suspended') {
      void context.resume().catch((error: unknown) => {
        console.error('Unable to start puzzle audio:', error);
      });
    }

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const soundSettings: Record<Sound, { frequency: number; duration: number; type: OscillatorType }> = {
      place: { frequency: 420, duration: 0.07, type: 'sine' },
      rotate: { frequency: 620, duration: 0.09, type: 'triangle' },
      receiver: { frequency: 880, duration: 0.13, type: 'sine' },
      hazard: { frequency: 145, duration: 0.22, type: 'sawtooth' },
      hint: { frequency: 720, duration: 0.1, type: 'triangle' },
      win: { frequency: 523.25, duration: 0.48, type: 'triangle' },
      laser: { frequency: 880, duration: 0.16, type: 'sine' },
    };
    const settings = soundSettings[sound];

    oscillator.type = settings.type;
    oscillator.frequency.setValueAtTime(settings.frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + settings.duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    if (sound === 'win') {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      oscillator.frequency.setValueAtTime(notes[0] ?? 523.25, now);
      for (let index = 1; index < notes.length; index += 1) {
        const note = notes[index];
        if (note !== undefined) {
          oscillator.frequency.setValueAtTime(note, now + index * 0.11);
        }
      }
      oscillator.start(now);
      oscillator.stop(now + settings.duration);
    } else {
      if (sound === 'receiver') {
        oscillator.frequency.exponentialRampToValueAtTime(
          settings.frequency * 1.25,
          now + settings.duration
        );
      }
      oscillator.start(now);
      oscillator.stop(now + settings.duration + 0.02);
    }
  } catch (error) {
    console.error('Unable to play puzzle sound:', error);
  }
};

export const playPlace = (): void => playSound('place');
export const playRotate = (): void => playSound('rotate');
export const playReceiverMet = (): void => playSound('receiver');
export const playHazard = (): void => playSound('hazard');
export const playHint = (): void => playSound('hint');
export const playWin = (): void => playSound('win');
