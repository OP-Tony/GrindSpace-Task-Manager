// ==========================================================================
// GrindSpace AI Daily Planner Controller (ES Module)
// ==========================================================================

import { getHeaders, showToast, escapeHTML } from './utils.js';

let promptInput = null;
let btnGeneratePlan = null;
let plannerInputView = null;
let plannerScheduleView = null;
let btnResetPlan = null;
let scheduleListContainer = null;

export function initPlannerModule() {
  promptInput = document.getElementById('prompt-input');
  btnGeneratePlan = document.getElementById('btn-generate-plan');
  plannerInputView = document.getElementById('planner-input-view');
  plannerScheduleView = document.getElementById('planner-schedule-view');
  btnResetPlan = document.getElementById('btn-reset-plan');
  scheduleListContainer = document.getElementById('schedule-list');

  if (btnGeneratePlan) btnGeneratePlan.addEventListener('click', handleGeneratePlan);
  if (btnResetPlan) {
    btnResetPlan.addEventListener('click', () => {
      plannerScheduleView.classList.add('hidden');
      plannerInputView.classList.remove('hidden');
      promptInput.value = '';
      const existing = document.getElementById('coach-plan-critique-box');
      if (existing) existing.remove();
    });
  }
}

async function handleGeneratePlan() {
  if (!promptInput || !btnGeneratePlan || !plannerInputView || !plannerScheduleView || !scheduleListContainer) return;

  const rawText = promptInput.value.trim();
  if (!rawText) return;

  btnGeneratePlan.disabled = true;
  const btnText = btnGeneratePlan.querySelector('span');
  if (btnText) btnText.textContent = 'Structuring Plan...';

  try {
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ rawText })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Server error occurred during plan generation');
    }

    const blocks = Array.isArray(data) ? data : (data.schedule || []);
    renderSchedule(blocks);

    if (data.coach_comment) {
      renderCoachComment(data.coach_comment);
    } else {
      const existing = document.getElementById('coach-plan-critique-box');
      if (existing) existing.remove();
    }

    plannerInputView.classList.add('hidden');
    plannerScheduleView.classList.remove('hidden');
    showToast('Structured agenda generated', 'success');

  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    btnGeneratePlan.disabled = false;
    if (btnText) btnText.textContent = 'Generate AI Plan';
  }
}

function renderCoachComment(comment) {
  const existing = document.getElementById('coach-plan-critique-box');
  if (existing) {
    existing.innerHTML = `<strong>Grind Coach Critique:</strong> "${escapeHTML(comment)}"`;
  } else {
    const critiqueBox = document.createElement('div');
    critiqueBox.id = 'coach-plan-critique-box';
    critiqueBox.className = 'coach-plan-critique';
    critiqueBox.innerHTML = `<strong>Grind Coach Critique:</strong> "${escapeHTML(comment)}"`;
    
    // Insert after the title row but before the schedule list
    const headRow = plannerScheduleView.querySelector('.schedule-head-row');
    if (headRow) {
      headRow.after(critiqueBox);
    } else {
      plannerScheduleView.prepend(critiqueBox);
    }
  }
}

function renderSchedule(blocks) {
  if (!scheduleListContainer) return;
  scheduleListContainer.innerHTML = '';
  
  if (!blocks || blocks.length === 0) {
    scheduleListContainer.innerHTML = '<div class="empty-state">No schedule items generated.</div>';
    return;
  }

  blocks.forEach(block => {
    const item = document.createElement('div');
    // Class names: 'schedule-item work', 'schedule-item break', etc.
    item.className = `schedule-item ${block.type || 'work'}`;
    
    item.innerHTML = `
      <div class="schedule-time">${escapeHTML(block.start_time)} - ${escapeHTML(block.end_time)}</div>
      <div class="schedule-activity">${escapeHTML(block.activity)}</div>
    `;
    scheduleListContainer.appendChild(item);
  });
}

