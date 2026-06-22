// ==========================================================================
// GrindSpace Focus Timer & Audio Engine (ES Module)
// ==========================================================================

import { state, updatePreference, logFocusSessionOnServer, fetchStats } from './state.js';
import { renderAnalyticsChart } from './analytics.js';
import { showToast } from './utils.js';

let timerLabel = null;
let timerStatus = null;
let timerProgress = null;
let sessionBadge = null;

let btnStart = null;
let btnPause = null;
let btnSkip = null;

let soundChips = null;
let volumeSlider = null;

export function initTimerModule() {
  timerLabel = document.getElementById('timer-label');
  timerStatus = document.getElementById('timer-status');
  timerProgress = document.getElementById('timer-progress');
  sessionBadge = document.getElementById('session-badge');

  btnStart = document.getElementById('btn-start');
  btnPause = document.getElementById('btn-pause');
  btnSkip = document.getElementById('btn-skip');

  soundChips = document.querySelectorAll('.m3-chip');
  volumeSlider = document.getElementById('volume-slider');

  if (btnStart) btnStart.addEventListener('click', startTimer);
  if (btnPause) btnPause.addEventListener('click', pauseTimer);
  if (btnSkip) btnSkip.addEventListener('click', skipTimer);

  soundChips.forEach(chip => {
    chip.addEventListener('click', () => changeSoundscape(chip.dataset.sound));
  });
  if (volumeSlider) {
    volumeSlider.addEventListener('input', changeVolume);
  }
}

export function startTimer() {
  if (state.timerInterval) return;

  if (btnStart) btnStart.disabled = true;
  if (btnPause) btnPause.disabled = false;
  
  // Play active soundscape if configured
  playActiveSound();

  // Set target end time relative to current epoch timestamp
  state.endTime = Date.now() + state.timeLeft * 1000;

  state.timerInterval = setInterval(() => {
    // Verify remaining seconds based on delta calculation (immune to background throttling)
    const diff = Math.ceil((state.endTime - Date.now()) / 1000);
    state.timeLeft = Math.max(0, diff);
    updateTimerUI();

    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
      handleTimerComplete();
    }
  }, 100);
  
  showToast('Sprint started. Stay focused!', 'success');
}

export function pauseTimer() {
  if (!state.timerInterval) return;
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  if (btnStart) btnStart.disabled = false;
  if (btnPause) btnPause.disabled = true;
  
  // Pause ambient audio loops
  pauseAllSounds();
  showToast('Timer paused', 'info');
}

export function skipTimer() {
  pauseTimer();
  // Toggle timer mode
  if (state.timerMode === 'work') {
    state.timerMode = 'break';
    state.timerDuration = parseInt(state.preferences.break_duration) * 60;
    if (sessionBadge) {
      sessionBadge.textContent = 'Break';
      sessionBadge.style.color = 'var(--orange-accent)';
      sessionBadge.style.backgroundColor = 'rgba(255, 183, 77, 0.12)';
    }
  } else {
    state.timerMode = 'work';
    state.timerDuration = parseInt(state.preferences.pomodoro_duration) * 60;
    if (sessionBadge) {
      sessionBadge.textContent = 'Session';
      sessionBadge.style.color = 'var(--md-sys-color-on-primary-container)';
      sessionBadge.style.backgroundColor = 'var(--md-sys-color-primary-container)';
    }
  }
  resetTimer();
  showToast('Skipped to next cycle', 'info');
}

export function resetTimer() {
  state.timeLeft = state.timerDuration;
  updateTimerUI();
  if (btnStart) btnStart.disabled = false;
  if (btnPause) btnPause.disabled = true;
}

export function updateTimerUI() {
  if (!timerLabel || !timerStatus || !timerProgress) return;
  
  const mins = Math.floor(state.timeLeft / 60);
  const secs = state.timeLeft % 60;
  
  timerLabel.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  timerStatus.textContent = state.timerMode === 'work' ? 'Deep Focus' : 'Taking Break';

  // Update ring progress
  const ringCircumference = 596.9; // 2 * PI * 95
  const progressRatio = state.timeLeft / state.timerDuration;
  const offset = ringCircumference * (1 - progressRatio);
  timerProgress.style.strokeDashoffset = offset;
}

export function playFuturisticChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const audioCtx = new AudioContext();
    
    const playTone = (freq, startTime, duration) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.8, startTime + duration);
      
      gain.gain.setValueAtTime(0.25, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(startTime);
      osc.stop(startTime + duration);
    };
    
    const now = audioCtx.currentTime;
    playTone(523.25, now, 0.6); // C5
    playTone(659.25, now + 0.15, 0.8); // E5
    playTone(783.99, now + 0.3, 1.0); // G5
  } catch (err) {
    console.error('Failed to play synthesized chime:', err);
  }
}

async function handleTimerComplete() {
  // Trigger synthesized chime (100% offline, premium & robust)
  playFuturisticChime();

  if (state.timerMode === 'work') {
    const minsFocused = parseInt(state.preferences.pomodoro_duration);
    
    // Log to multi-tenant SQLite
    try {
      await logFocusSessionOnServer(minsFocused, 'work');
      const logs = await fetchStats();
      
      // Update DOM statistics numbers
      const metricTotalMinutes = document.getElementById('metric-total-minutes');
      const metricSessions = document.getElementById('metric-sessions');
      if (metricTotalMinutes) metricTotalMinutes.textContent = state.stats.totalMinutes;
      if (metricSessions) metricSessions.textContent = state.stats.sessionsCount;

      renderAnalyticsChart(logs);
      showToast('Focus session logged!', 'success');
    } catch (e) {
      console.error('Failed to log stats:', e);
    }
  }

  // Shift to next cycle automatically
  skipTimer();
  startTimer();
}

// Soundscape Engine with Equalizer Animation triggers
export function changeSoundscape(soundName) {
  if (!soundChips) return;
  soundChips.forEach(chip => {
    chip.classList.toggle('active', chip.dataset.sound === soundName);
  });
  
  pauseAllSounds();
  state.preferences.soundscape = soundName;
  updatePreference('soundscape', soundName);

  if (soundName !== 'none') {
    if (state.timerInterval) {
      playActiveSound();
    } else {
      showToast('Soundscape armed. Starts when timer plays!', 'info');
    }
  }
}

export function playActiveSound() {
  const soundName = state.preferences.soundscape;
  if (soundName === 'none') return;
  const audio = document.getElementById(`audio-${soundName}`);
  if (audio && volumeSlider) {
    audio.volume = parseFloat(volumeSlider.value);
    audio.play()
      .then(() => {
        toggleEqualizer(true);
        const timerCircle = document.querySelector('.timer-circle-container');
        if (timerCircle) {
          timerCircle.classList.add('pulse-active');
        }
      })
      .catch(e => {
        console.log('Playback blocked by browser autoplay policy:', e);
        showToast('Interact with the page to play ambient sounds', 'info');
      });
  }
}

export function pauseAllSounds() {
  ['rain', 'waves', 'white-noise'].forEach(sound => {
    const audio = document.getElementById(`audio-${sound}`);
    if (audio) {
      audio.pause();
    }
  });
  toggleEqualizer(false);
  const timerCircle = document.querySelector('.timer-circle-container');
  if (timerCircle) {
    timerCircle.classList.remove('pulse-active');
  }
}

function changeVolume(e) {
  const volume = e.target.value;
  const soundName = state.preferences.soundscape;
  if (soundName !== 'none') {
    const audio = document.getElementById(`audio-${soundName}`);
    if (audio) {
      audio.volume = volume;
    }
  }
  // Store volume preferences persistently
  updatePreference('volume', volume);
  updateVolumeIcon(volume);
}

export function updateVolumeIcon(volume) {
  const volIcon = document.querySelector('.vol-icon');
  if (!volIcon) return;
  const val = parseFloat(volume);
  if (val === 0) {
    volIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    `;
  } else if (val < 0.5) {
    volIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
  } else {
    volIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
  }
}

function toggleEqualizer(active) {
  const activeChip = document.querySelector('.m3-chip.active');
  
  // Remove existing equalizer divs
  document.querySelectorAll('.eq-container').forEach(el => el.remove());

  if (active && state.preferences.soundscape !== 'none' && activeChip) {
    const eq = document.createElement('div');
    eq.className = 'eq-container';
    eq.innerHTML = `
      <div class="eq-bar"></div>
      <div class="eq-bar"></div>
      <div class="eq-bar"></div>
    `;
    activeChip.appendChild(eq);
  }
}
