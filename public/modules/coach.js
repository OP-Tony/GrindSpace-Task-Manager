// ==========================================================================
// GrindSpace AI Coach UI Module (ES Module)
// ==========================================================================

import { state } from './state.js';
import { getHeaders, showToast } from './utils.js';

let coachSidebar = null;
let coachBackdrop = null;
let coachChatForm = null;
let coachChatInput = null;
let coachChatWindow = null;

export function initCoachModule() {
  const coachToggleBtn = document.getElementById('coach-toggle');
  coachSidebar = document.getElementById('coach-sidebar');
  const btnCloseCoach = document.getElementById('btnClose-coach') || document.getElementById('btn-close-coach');
  coachChatForm = document.getElementById('coach-chat-form');
  coachChatInput = document.getElementById('coach-chat-input');
  coachChatWindow = document.getElementById('coach-chat-window');
  coachBackdrop = document.getElementById('coach-backdrop');

  if (coachToggleBtn) coachToggleBtn.addEventListener('click', toggleCoachSidebar);
  if (btnCloseCoach) btnCloseCoach.addEventListener('click', toggleCoachSidebar);
  if (coachBackdrop) coachBackdrop.addEventListener('click', toggleCoachSidebar);
  if (coachChatForm) coachChatForm.addEventListener('submit', handleCoachChatSubmit);
}

export function toggleCoachSidebar() {
  if (coachSidebar) {
    coachSidebar.classList.toggle('open');
    const isOpen = coachSidebar.classList.contains('open');
    if (coachBackdrop) {
      coachBackdrop.classList.toggle('visible', isOpen);
    }
    if (isOpen) {
      setTimeout(() => scrollToBottom(coachChatWindow), 250);
    }
  }
}

function scrollToBottom(element) {
  if (element) {
    element.scrollTop = element.scrollHeight;
  }
}

async function handleCoachChatSubmit(e) {
  e.preventDefault();
  if (!coachChatInput || !coachChatWindow) return;

  const message = coachChatInput.value.trim();
  if (!message) return;

  // Append user message bubble
  appendChatBubble(message, 'user');
  coachChatInput.value = '';
  scrollToBottom(coachChatWindow);

  // Trigger typing indicator
  const loader = showChatLoader();
  scrollToBottom(coachChatWindow);

  try {
    const res = await fetch('/api/coach', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        message: message,
        history: state.chatHistory
      })
    });
    const data = await res.json();
    loader.remove();

    if (!res.ok) throw new Error(data.error || 'Failed to communicate with API');

    // Store message thread locally
    state.chatHistory.push({ role: 'user', content: message });
    state.chatHistory.push({ role: 'model', content: data.text });

    // Append coach bubble response
    appendChatBubble(data.text, 'assistant');
    scrollToBottom(coachChatWindow);

  } catch (error) {
    loader.remove();
    console.error('Coach API Error:', error);
    appendChatBubble('Sorry, I lost my connection. Please check your Gemini key or retry.', 'assistant');
    showToast('Grind Coach failed to respond', 'error');
    scrollToBottom(coachChatWindow);
  }
}

function appendChatBubble(text, sender) {
  if (!coachChatWindow) return;
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender}`;
  bubble.textContent = text;
  coachChatWindow.appendChild(bubble);
}

function showChatLoader() {
  const loader = document.createElement('div');
  loader.className = 'chat-bubble assistant loading';
  loader.innerHTML = `<span></span><span></span><span></span>`;
  coachChatWindow.appendChild(loader);
  return loader;
}
