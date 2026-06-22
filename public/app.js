// ==========================================================================
// GrindSpace Frontend Orchestrator & Bootstrapper (ES Module Upgraded)
// ==========================================================================

import { 
  state, 
  loadPreferences, 
  fetchTasks, 
  fetchStats, 
  updatePreference 
} from './modules/state.js';

import { showToast } from './modules/utils.js';

import { 
  initTimerModule, 
  resetTimer, 
  changeSoundscape, 
  updateVolumeIcon 
} from './modules/timer.js';

import { 
  initTasksModule, 
  renderTasks, 
  updatePillIndicator 
} from './modules/tasks.js';

import { initPlannerModule } from './modules/planner.js';
import { initCoachModule } from './modules/coach.js';
import { initCardSpotlightEffects, initAmbientCanvas } from './modules/ambient.js';
import { renderAnalyticsChart } from './modules/analytics.js';

// DOM elements handled directly by orchestrator
const themeToggleBtn = document.getElementById('theme-toggle');
const themeIcon = document.getElementById('theme-icon');
const prefPomodoro = document.getElementById('pref-pomodoro');
const prefBreak = document.getElementById('pref-break');
const volumeSlider = document.getElementById('volume-slider');

const metricTotalMinutes = document.getElementById('metric-total-minutes');
const metricSessions = document.getElementById('metric-sessions');

// ==========================================================================
// Core Boot Sequence
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize sub-modules
  initTimerModule();
  initTasksModule();
  initPlannerModule();
  initCoachModule();
  initCardSpotlightEffects();
  initAmbientCanvas();

  // Setup orchestrator DOM event listeners
  setupOrchestratorListeners();

  // Fetch initial data from SQLite backend API
  await bootSync();
});

// Setup events that bridge multiple module actions
function setupOrchestratorListeners() {
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  if (prefPomodoro) {
    prefPomodoro.addEventListener('change', async (e) => {
      const value = e.target.value;
      await updatePreference('pomodoro_duration', value);
      if (state.timerMode === 'work') {
        state.timerDuration = parseInt(value) * 60;
        resetTimer();
      }
    });
  }

  if (prefBreak) {
    prefBreak.addEventListener('change', async (e) => {
      const value = e.target.value;
      await updatePreference('break_duration', value);
      if (state.timerMode === 'break') {
        state.timerDuration = parseInt(value) * 60;
        resetTimer();
      }
    });
  }
}

async function bootSync() {
  // 1. Sync User Preferences
  const prefs = await loadPreferences();
  
  // Apply preferences to index document root attributes
  document.documentElement.setAttribute('data-theme', prefs.theme);
  updateThemeIcon(prefs.theme);

  if (prefPomodoro) prefPomodoro.value = prefs.pomodoro_duration;
  if (prefBreak) prefBreak.value = prefs.break_duration;
  if (volumeSlider && prefs.volume !== undefined) {
    volumeSlider.value = prefs.volume;
    updateVolumeIcon(prefs.volume);
  }

  state.timerDuration = parseInt(prefs.pomodoro_duration) * 60;
  resetTimer();

  if (prefs.soundscape !== 'none') {
    changeSoundscape(prefs.soundscape);
  }

  // 2. Sync SQLite tasks list
  await fetchTasks();
  renderTasks();

  // 3. Sync and render focus duration metrics & bar chart
  await loadAndRenderStats();

  // Update layout sliders/pills
  setTimeout(updatePillIndicator, 150);
}

async function loadAndRenderStats() {
  const logs = await fetchStats();

  if (metricTotalMinutes) metricTotalMinutes.textContent = state.stats.totalMinutes;
  if (metricSessions) metricSessions.textContent = state.stats.sessionsCount;

  renderAnalyticsChart(logs);
}

// ==========================================================================
// Theme Toggling logic (Orchestrator level to redraw charts)
// ==========================================================================
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  document.documentElement.setAttribute('data-theme', nextTheme);
  updateThemeIcon(nextTheme);
  updatePreference('theme', nextTheme);
  
  showToast(`${nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1)} theme enabled`, 'info');

  // Redraw the analytics chart to update colors based on the theme
  loadAndRenderStats();
}

function updateThemeIcon(theme) {
  if (!themeIcon) return;
  if (theme === 'light') {
    // Sun Icon
    themeIcon.innerHTML = `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    `;
  } else {
    // Moon Icon
    themeIcon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
  }
}
