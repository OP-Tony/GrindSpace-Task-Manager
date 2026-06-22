require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./database');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Privacy Guardrail / Redaction Engine (Run 100% locally before sending to Gemini)
function runPrivacyGuardrail(text) {
  let sanitized = text;

  // 1. Redact Emails
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  sanitized = sanitized.replace(emailRegex, '[REDACTED_EMAIL]');

  // 2. Redact Phone Numbers (Simple standard international/national formats)
  const phoneRegex = /\+?[0-9]{1,4}?[-.\s]?\(?[0-9]{1,3}?\)?[-.\s]?[0-9]{3,4}[-.\s]?[0-9]{3,4}/g;
  sanitized = sanitized.replace(phoneRegex, '[REDACTED_PHONE]');

  // 3. Redact API Keys / Passwords (Detect key patterns like API_KEY="xyz", secret: 123)
  const secretsRegex = /(api[_-]?key|password|secret|token|credential|passcode)\s*[:=]\s*["']?[a-zA-Z0-9_\-]{8,}["']?/gi;
  sanitized = sanitized.replace(secretsRegex, '$1: [REDACTED_SECRET]');

  return sanitized;
}

// ----------------------------------------------------
// DATABASE API ENDPOINTS (MCP Local Persistence)
// ----------------------------------------------------

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  const clientId = req.headers['x-client-id'] || 'global';
  try {
    const tasks = await db.getTasks(clientId);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add a task
app.post('/api/tasks', async (req, res) => {
  const clientId = req.headers['x-client-id'] || 'global';
  const { title, status } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }
  try {
    const newTask = await db.addTask(title, status, clientId);
    res.json(newTask);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task status (e.g. dragging or moving between categories)
app.put('/api/tasks/:id', async (req, res) => {
  const clientId = req.headers['x-client-id'] || 'global';
  const { id } = req.params;
  const { status } = req.body;
  try {
    const updated = await db.updateTaskStatus(id, status, clientId);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  const clientId = req.headers['x-client-id'] || 'global';
  const { id } = req.params;
  try {
    const deleted = await db.deleteTask(id, clientId);
    res.json(deleted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Log a completed focus session
app.post('/api/stats', async (req, res) => {
  const clientId = req.headers['x-client-id'] || 'global';
  const { duration, type } = req.body;
  if (!duration || !type) {
    return res.status(400).json({ error: 'Duration and session type are required' });
  }
  try {
    const logged = await db.logFocusSession(duration, type, clientId);
    res.json(logged);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get focus history logs
app.get('/api/stats', async (req, res) => {
  const clientId = req.headers['x-client-id'] || 'global';
  try {
    const logs = await db.getFocusSessions(clientId);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user preferences (Adaptive Memory Profile)
app.get('/api/preferences', async (req, res) => {
  const clientId = req.headers['x-client-id'] || 'global';
  try {
    const preferences = await db.getPreferences(clientId);
    res.json(preferences);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user preference
app.put('/api/preferences', async (req, res) => {
  const clientId = req.headers['x-client-id'] || 'global';
  const { key, value } = req.body;
  if (key === undefined || value === undefined) {
    return res.status(400).json({ error: 'Key and value are required' });
  }
  try {
    const updated = await db.updatePreference(key, value, clientId);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ----------------------------------------------------
// AI DAILY PLANNER ENDPOINT (Gemini API Integration)
// ----------------------------------------------------
app.post('/api/plan', async (req, res) => {
  const { rawText } = req.body;
  
  if (!rawText) {
    return res.status(400).json({ error: 'Raw text description is required' });
  }

  // 1. Run local privacy sanitization first
  const sanitizedText = runPrivacyGuardrail(rawText);

  // Check if API key is configured
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    return res.status(400).json({ 
      error: 'Gemini API key is not configured. Please add it to your .env file.' 
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Configure Gemini with responseSchema for structured JSON output
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          description: 'A structured list of daily scheduling blocks.',
          items: {
            type: 'OBJECT',
            properties: {
              start_time: { type: 'STRING', description: 'Start time in 24h format HH:MM' },
              end_time: { type: 'STRING', description: 'End time in 24h format HH:MM' },
              activity: { type: 'STRING', description: 'Task or routine activity details' },
              type: { 
                type: 'STRING', 
                enum: ['work', 'break', 'personal', 'learning', 'leisure'],
                description: 'The type of scheduling category'
              }
            },
            required: ['start_time', 'end_time', 'activity', 'type']
          }
        }
      }
    });

    const prompt = `
      You are the Scheduling Concierge for GrindSpace.
      Organize the user's input text schedule description into a clean JSON array of periods.
      Make sure all blocks cover the described periods logically and in order.

      Input schedule: "${sanitizedText}"
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text().trim();

    try {
      const jsonSchedule = JSON.parse(responseText);
      res.json(jsonSchedule);
    } catch (e) {
      console.error('Failed to parse Gemini output as JSON:', responseText);
      res.status(500).json({ 
        error: 'The AI model generated an invalid format. Please try again.',
        raw: responseText 
      });
    }

  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: 'Failed to communicate with Gemini API: ' + error.message });
  }
});

// AI GRIND COACH ENDPOINT (Conversational Mentor)
app.post('/api/coach', async (req, res) => {
  const { message, history } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    return res.status(400).json({ 
      error: 'Gemini API key is not configured. Please add it to your .env file.' 
    });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Instantiate flash model with custom instructions
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `
        You are the "Grind Coach" inside GrindSpace—a premium productivity companion.
        You are a motivational, direct, and pragmatic focus mentor.
        Your tone is encouraging, professional, and slightly intense.
        Always keep responses highly practical, motivating, and strictly brief (max 2-3 sentences).
        Focus on actionable time management advice, overcoming distraction, and staying focused.
      `
    });

    // Map conversation log to Google's parts object structure
    const chatHistory = (history || []).map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    }));

    const chat = model.startChat({
      history: chatHistory
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    res.json({ text: response.text().trim() });

  } catch (error) {
    console.error('Grind Coach API Error:', error);
    res.status(500).json({ error: 'Grind Coach failed to respond: ' + error.message });
  }
});

// Fallback to serving the main dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Self-hosting audio loops downloader bootstrapper
async function downloadAudioAssets() {
  const soundsDir = path.join(__dirname, 'public', 'assets', 'sounds');
  if (!fs.existsSync(soundsDir)) {
    fs.mkdirSync(soundsDir, { recursive: true });
  }

  const audioAssets = [
    { name: 'rain.mp3', url: 'https://raw.githubusercontent.com/brarcher/baby-sleep-sounds/master/app/src/main/res/raw/rain.mp3' },
    { name: 'waves.mp3', url: 'https://raw.githubusercontent.com/brarcher/baby-sleep-sounds/master/app/src/main/res/raw/ocean.mp3' },
    { name: 'white-noise.mp3', url: 'https://raw.githubusercontent.com/laurakalbag/whitenoise-demo/main/noise.mp3' }
  ];

  for (const asset of audioAssets) {
    const dest = path.join(soundsDir, asset.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size === 0) {
      fs.unlinkSync(dest);
    }
    if (!fs.existsSync(dest)) {
      console.log(`[Asset Loader] Downloading self-hosted loop: ${asset.name}...`);
      try {
        const response = await fetch(asset.url);
        if (!response.ok) {
          throw new Error(`Failed to download: Status Code ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(dest, buffer);
        console.log(`[Asset Loader] Downloaded loop: ${asset.name}`);
      } catch (err) {
        console.error(`[Asset Loader] Failed to download loop ${asset.name}:`, err.message);
      }
    }
  }
}

app.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`GrindSpace Server running at: http://localhost:${PORT}`);
  console.log(`Local SQLite database is initialized and active.`);
  console.log(`====================================================`);
  
  // Auto-bootstrap local sound loops
  await downloadAudioAssets();
});
