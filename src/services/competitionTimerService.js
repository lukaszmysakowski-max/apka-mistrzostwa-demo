const STORAGE_KEY = "omrm-competition-timer-v1";
const DEFAULT_DURATION_SECONDS = 10 * 60;
const DEFAULT_WARNING_SECONDS = 2 * 60;

export class CompetitionTimerService {
  constructor() {
    this.state = this.load();
    this.listeners = new Set();
    this.intervalId = null;
    this.audioContext = null;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    if (this.state.running) this.ensureTicker();
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    const remainingSeconds = this.getRemainingSeconds();
    return {
      ...this.state,
      remainingSeconds,
      display: formatTime(remainingSeconds),
      elapsedSeconds: this.state.durationSeconds - remainingSeconds,
      elapsedDisplay: formatTime(this.state.durationSeconds - remainingSeconds),
      resetLabel: `Reset ${formatTime(this.state.durationSeconds)}`,
      isWarning: remainingSeconds <= this.state.warningThresholdSeconds && remainingSeconds > 0,
      isFinished: remainingSeconds === 0
    };
  }

  configure({ durationSeconds = DEFAULT_DURATION_SECONDS, warningThresholdSeconds = DEFAULT_WARNING_SECONDS } = {}) {
    const normalizedDuration = Math.max(1, Number(durationSeconds) || DEFAULT_DURATION_SECONDS);
    const normalizedWarning = Math.max(0, Number(warningThresholdSeconds) || DEFAULT_WARNING_SECONDS);
    this.state = {
      ...this.state,
      durationSeconds: normalizedDuration,
      warningThresholdSeconds: Math.min(normalizedWarning, normalizedDuration),
      remainingSeconds: this.state.running ? this.getRemainingSeconds() : normalizedDuration,
      endAt: this.state.running ? this.state.endAt : null,
      finished: false,
      warningPlayed: false
    };
    this.persist();
    this.emit();
  }

  start() {
    const remainingSeconds = this.getRemainingSeconds() || this.state.durationSeconds;
    this.state = {
      ...this.state,
      remainingSeconds,
      running: true,
      endAt: Date.now() + remainingSeconds * 1000,
      startedAt: this.state.startedAt || Date.now(),
      finished: false,
      soundActivationMessage: "",
      warningPlayed: remainingSeconds <= this.state.warningThresholdSeconds ? this.state.warningPlayed : false
    };
    this.persist();
    this.ensureTicker();
    this.emit();
    this.tryActivateSound();
  }

  pause() {
    this.state = {
      ...this.state,
      remainingSeconds: this.getRemainingSeconds(),
      running: false,
      endAt: null
    };
    this.persist();
    this.stopTicker();
    this.emit();
  }

  resume() {
    this.start();
  }

  reset() {
    this.state = {
      ...this.state,
      remainingSeconds: this.state.durationSeconds,
      running: false,
      endAt: null,
      startedAt: null,
      finished: false,
      warningPlayed: false,
      soundActivationMessage: ""
    };
    this.persist();
    this.stopTicker();
    this.emit();
  }

  setSoundEnabled(enabled) {
    this.state = { ...this.state, soundEnabled: enabled, soundActivationMessage: "" };
    this.persist();
    this.emit();
  }

  tick() {
    const remainingSeconds = this.getRemainingSeconds();

    if (this.state.running && remainingSeconds <= this.state.warningThresholdSeconds && !this.state.warningPlayed) {
      this.state = { ...this.state, warningPlayed: true };
      this.persist();
      this.playWarningSound();
    }

    if (this.state.running && remainingSeconds === 0) {
      this.state = {
        ...this.state,
        running: false,
        endAt: null,
        remainingSeconds: 0,
        finished: true
      };
      this.persist();
      this.stopTicker();
    }

    this.emit();
  }

  ensureTicker() {
    if (this.intervalId) return;
    this.intervalId = window.setInterval(() => this.tick(), 250);
  }

  stopTicker() {
    if (!this.intervalId) return;
    window.clearInterval(this.intervalId);
    this.intervalId = null;
  }

  getRemainingSeconds() {
    if (this.state.running && this.state.endAt) {
      return Math.max(0, Math.ceil((this.state.endAt - Date.now()) / 1000));
    }
    return Math.max(0, Math.round(this.state.remainingSeconds ?? this.state.durationSeconds));
  }

  tryActivateSound() {
    if (!this.state.soundEnabled) return;
    try {
      const context = this.getAudioContext();
      context.resume?.().catch(() => {
        this.setSoundMessage();
      });
    } catch {
      this.setSoundMessage();
    }
  }

  playWarningSound() {
    if (!this.state.soundEnabled) return;
    try {
      const context = this.getAudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.24, context.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.28);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.3);
    } catch {
      this.setSoundMessage();
    }
  }

  getAudioContext() {
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error("Audio API unavailable");
      this.audioContext = new AudioContextClass();
    }
    return this.audioContext;
  }

  setSoundMessage() {
    this.state = { ...this.state, soundActivationMessage: "Kliknij Start, aby aktywować dźwięk" };
    this.persist();
    this.emit();
  }

  emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  load() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return createInitialState();
    }

    try {
      return { ...createInitialState(), ...JSON.parse(saved) };
    } catch {
      return createInitialState();
    }
  }

  persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }
}

function createInitialState() {
  return {
    remainingSeconds: DEFAULT_DURATION_SECONDS,
    durationSeconds: DEFAULT_DURATION_SECONDS,
    warningThresholdSeconds: DEFAULT_WARNING_SECONDS,
    running: false,
    endAt: null,
    startedAt: null,
    finished: false,
    warningPlayed: false,
    soundEnabled: true,
    soundActivationMessage: ""
  };
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}
