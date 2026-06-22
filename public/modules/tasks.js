// ==========================================================================
// GrindSpace Tasks Hub Controller (ES Module)
// ==========================================================================

import { state, fetchTasks, addTaskOnServer, updateTaskStatusOnServer, deleteTaskOnServer } from './state.js';
import { showToast, escapeHTML } from './utils.js';

let taskForm = null;
let taskInput = null;
let taskTabs = null;
let taskListContainer = null;
let taskCountBadge = null;

export function initTasksModule() {
  taskForm = document.getElementById('add-task-form');
  taskInput = document.getElementById('task-input');
  taskTabs = document.querySelectorAll('.segment-pill');
  taskListContainer = document.getElementById('task-list');
  taskCountBadge = document.getElementById('task-count');

  if (taskForm) taskForm.addEventListener('submit', handleAddTask);
  
  taskTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      taskTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentTab = tab.dataset.tab;
      updatePillIndicator();
      renderTasks();
    });
  });

  // Dynamic window resize adjustment for segment pill
  window.addEventListener('resize', updatePillIndicator);
}

// Segmented tab sliding pill animator
export function updatePillIndicator() {
  const activeTab = document.querySelector('.segment-pill.active');
  const indicator = document.querySelector('.pill-indicator');
  if (activeTab && indicator) {
    indicator.style.left = `${activeTab.offsetLeft}px`;
    indicator.style.width = `${activeTab.offsetWidth}px`;
  }
}

export function renderTasks() {
  if (!taskListContainer || !taskCountBadge) return;

  taskListContainer.innerHTML = '';
  const filteredTasks = state.tasks.filter(t => t.status === state.currentTab);
  
  // Update count badge
  const upNextCount = state.tasks.filter(t => t.status === 'up_next').length;
  taskCountBadge.textContent = `${upNextCount} Left`;

  if (filteredTasks.length === 0) {
    taskListContainer.innerHTML = `<div class="empty-state">No tasks here. Ready for more?</div>`;
    return;
  }

  filteredTasks.forEach(task => {
    const taskItem = document.createElement('div');
    taskItem.className = 'task-item';

    const isChecked = task.status === 'done';

    taskItem.innerHTML = `
      <div class="task-left">
        <div class="task-checkbox ${isChecked ? 'checked' : ''}" data-id="${task.id}"></div>
        <span class="task-title">${escapeHTML(task.title)}</span>
      </div>
      <div class="task-actions">
        ${task.status === 'up_next' ? `
          <button class="task-action-btn focus-action" data-id="${task.id}" title="Start Focusing">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="10 8 16 12 10 16 10 8"></polygon></svg>
          </button>
        ` : ''}
        ${task.status === 'focusing' ? `
          <button class="task-action-btn postpone-action" data-id="${task.id}" title="Move back to Up Next">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          </button>
        ` : ''}
        <button class="task-action-btn delete delete-action" data-id="${task.id}" title="Delete Task">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>
      </div>
    `;

    // Wire up events dynamically
    taskItem.querySelector('.task-checkbox').addEventListener('click', () => {
      const nextStatus = isChecked ? 'up_next' : 'done';
      updateTaskStatus(task.id, nextStatus);
    });

    const focusBtn = taskItem.querySelector('.focus-action');
    if (focusBtn) {
      focusBtn.addEventListener('click', () => updateTaskStatus(task.id, 'focusing'));
    }

    const postponeBtn = taskItem.querySelector('.postpone-action');
    if (postponeBtn) {
      postponeBtn.addEventListener('click', () => updateTaskStatus(task.id, 'up_next'));
    }

    taskItem.querySelector('.delete-action').addEventListener('click', () => deleteTask(task.id));

    taskListContainer.appendChild(taskItem);
  });
}

async function handleAddTask(e) {
  e.preventDefault();
  if (!taskInput) return;

  const title = taskInput.value.trim();
  if (!title) return;

  const tempId = Date.now();
  const newTask = {
    id: tempId,
    title: title,
    status: state.currentTab,
    priority: 0
  };

  // Optimistic insert
  state.tasks.push(newTask);
  renderTasks();
  taskInput.value = '';
  showToast('Task added', 'success');

  try {
    const savedTask = await addTaskOnServer(title, state.currentTab);
    // Swap temp id with real id
    const found = state.tasks.find(t => t.id === tempId);
    if (found) found.id = savedTask.id;
  } catch (error) {
    // Revert state
    state.tasks = state.tasks.filter(t => t.id !== tempId);
    renderTasks();
    showToast('Failed to save task', 'error');
  }
}

async function updateTaskStatus(id, nextStatus) {
  const taskIndex = state.tasks.findIndex(t => t.id === id);
  if (taskIndex === -1) return;

  const originalStatus = state.tasks[taskIndex].status;
  
  // Optimistically update status
  state.tasks[taskIndex].status = nextStatus;
  renderTasks();

  try {
    await updateTaskStatusOnServer(id, nextStatus);
  } catch (error) {
    // Revert
    state.tasks[taskIndex].status = originalStatus;
    renderTasks();
    showToast('Failed to update task status', 'error');
  }
}

async function deleteTask(id) {
  const taskIndex = state.tasks.findIndex(t => t.id === id);
  if (taskIndex === -1) return;

  const deletedTask = state.tasks[taskIndex];
  
  // Optimistically delete
  state.tasks = state.tasks.filter(t => t.id !== id);
  renderTasks();

  try {
    await deleteTaskOnServer(id);
    showToast('Task removed', 'info');
  } catch (error) {
    // Revert
    state.tasks.splice(taskIndex, 0, deletedTask);
    renderTasks();
    showToast('Failed to delete task', 'error');
  }
}
