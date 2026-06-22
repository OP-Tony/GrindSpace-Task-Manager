// ==========================================================================
// GrindSpace State & API Synchronizer (ES Module)
// ==========================================================================

import { getHeaders, showToast } from './utils.js';

export const state = {
  timeLeft: 1500, // default 25 mins in seconds
  timerDuration: 1500,
  timerInterval: null,
  endTime: null,
  timerMode: 'work', // 'work', 'break'
  currentTab: 'up_next', // 'up_next', 'focusing', 'done'
  tasks: [],
  preferences: {
    theme: 'dark',
    soundscape: 'none',
    pomodoro_duration: '25',
    break_duration: '5',
    volume: '0.5'
  },
  stats: {
    totalMinutes: 0,
    sessionsCount: 0
  },
  chatHistory: []
};

// --- Preferences API ---
export async function loadPreferences() {
  try {
    const res = await fetch('/api/preferences', {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to load preferences');
    const prefs = await res.json();
    state.preferences = { ...state.preferences, ...prefs };
    return state.preferences;
  } catch (error) {
    console.error('Error loading preferences:', error);
    showToast('Failed to load settings', 'error');
    return state.preferences;
  }
}

export async function updatePreference(key, value) {
  try {
    const res = await fetch('/api/preferences', {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ key, value })
    });
    if (!res.ok) throw new Error('Failed to update preference');
    state.preferences[key] = value;
    return true;
  } catch (error) {
    console.error('Error updating preference:', error);
    showToast('Settings sync failed', 'warning');
    return false;
  }
}

// --- Tasks API ---
export async function fetchTasks() {
  try {
    const res = await fetch('/api/tasks', {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to load tasks');
    state.tasks = await res.json();
    return state.tasks;
  } catch (error) {
    console.error('Error fetching tasks:', error);
    showToast('Failed to sync tasks', 'error');
    return [];
  }
}

export async function addTaskOnServer(title, status) {
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ title, status })
    });
    if (!res.ok) throw new Error('Failed to create task');
    return await res.json();
  } catch (error) {
    console.error('Error adding task:', error);
    showToast('Failed to save task', 'error');
    throw error;
  }
}

export async function updateTaskStatusOnServer(id, status) {
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Failed to update task');
    return true;
  } catch (error) {
    console.error('Error updating task status:', error);
    showToast('Failed to update task status', 'error');
    throw error;
  }
}

export async function deleteTaskOnServer(id) {
  try {
    const res = await fetch(`/api/tasks/${id}`, {
      method: 'DELETE',
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to delete task');
    return true;
  } catch (error) {
    console.error('Error deleting task:', error);
    showToast('Failed to delete task', 'error');
    throw error;
  }
}

// --- Focus Sessions (Stats) API ---
export async function logFocusSessionOnServer(duration, type) {
  try {
    const res = await fetch('/api/stats', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ duration, type })
    });
    if (!res.ok) throw new Error('Failed to log focus session');
    return await res.json();
  } catch (error) {
    console.error('Failed to log stats:', error);
    throw error;
  }
}

export async function fetchStats() {
  try {
    const res = await fetch('/api/stats', {
      headers: getHeaders()
    });
    if (!res.ok) throw new Error('Failed to load focus sessions');
    const logs = await res.json();
    
    // Process total minutes and session count
    let totalMinutes = 0;
    logs.forEach(session => {
      if (session.type === 'work') {
        totalMinutes += session.duration;
      }
    });

    state.stats.totalMinutes = totalMinutes;
    state.stats.sessionsCount = logs.filter(l => l.type === 'work').length;
    
    return logs;
  } catch (error) {
    console.error('Error fetching statistics:', error);
    return [];
  }
}
