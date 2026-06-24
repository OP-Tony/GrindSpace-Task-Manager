require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./database');
const { callMcpTool } = require('./mcp-client');
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
// MULTI-AGENT COLLABORATIVE FLOWS & MCP TOOL CALLING
// ----------------------------------------------------

const mcpToolsToGeminiDeclarations = [
  {
    name: "get_tasks",
    description: "Get all user tasks for the current profile to see what is on their list.",
    parameters: {
      type: "OBJECT",
      properties: {
        client_id: { type: "STRING", description: "Client profile identifier" }
      }
    }
  },
  {
    name: "get_focus_sessions",
    description: "Get all logged focus sessions to analyze productivity history.",
    parameters: {
      type: "OBJECT",
      properties: {
        client_id: { type: "STRING", description: "Client profile identifier" }
      }
    }
  },
  {
    name: "add_task",
    description: "Create a new task in the user's task list.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "The task title/description" },
        status: { type: "STRING", enum: ["up_next", "focusing", "done"], description: "Initial status of the task" },
        client_id: { type: "STRING", description: "Client profile identifier" }
      },
      required: ["title"]
    }
  },
  {
    name: "update_task_status",
    description: "Update the status of a specific task by its ID.",
    parameters: {
      type: "OBJECT",
      properties: {
        id: { type: "NUMBER", description: "The numeric database ID of the task" },
        status: { type: "STRING", enum: ["up_next", "focusing", "done"], description: "The new status" },
        client_id: { type: "STRING", description: "Client profile identifier" }
      },
      required: ["id", "status"]
    }
  }
];

// AI DAILY PLANNER ENDPOINT (Collaborative Multi-Agent Flow)
app.post('/api/plan', async (req, res) => {
  const { rawText } = req.body;
  const clientId = req.headers['x-client-id'] || 'global';
  
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

    // 2. Scheduler Agent: Retrieve unfinished tasks using MCP Client
    let userTasks = [];
    try {
      userTasks = await callMcpTool('get_tasks', { client_id: clientId });
    } catch (err) {
      console.error('[Multi-Agent Planner] Pre-fetching tasks failed:', err.message);
    }
    
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

    const pendingTasksList = userTasks
      .filter(t => t.status !== 'done')
      .map(t => `- [ID: ${t.id}] ${t.title}`)
      .join('\n');

    const prompt = `
      You are the Scheduling Concierge for GrindSpace.
      Organize the user's input text schedule description into a clean JSON array of periods.
      Make sure all blocks cover the described periods logically and in order.

      Crucial Instructions:
      Identify if the user has any pending tasks that should be scheduled today.
      If tasks are found, allocate one or more 'work' blocks specifically to progress on those tasks.
      
      User's Pending Tasks:
      ${pendingTasksList || "(No pending tasks)"}

      Input schedule: "${sanitizedText}"
    `;

    console.log('[Multi-Agent Planner] Querying Scheduler Agent...');
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text().trim();

    let jsonSchedule = [];
    try {
      jsonSchedule = JSON.parse(responseText);
    } catch (e) {
      console.error('[Multi-Agent Planner] Failed to parse scheduler output as JSON:', responseText);
      return res.status(500).json({ 
        error: 'The AI model generated an invalid format. Please try again.',
        raw: responseText 
      });
    }

    // 3. Coach Agent: Reviews schedule output to provide motivational critique
    console.log('[Multi-Agent Planner] Querying Coach Agent for critique...');
    const coachModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `
        You are the "Grind Coach" inside GrindSpace.
        You are a motivational, direct, and pragmatic focus mentor.
        Your tone is encouraging, professional, and slightly intense.
        You are reviewing the user's structured schedule for today.
        Provide a brief, intense, and highly motivational comment/critique (max 2 sentences) to keep them locked in.
      `
    });

    const coachPrompt = `
      The scheduler generated this agenda for the user:
      ${responseText}

      User's pending tasks:
      ${pendingTasksList || "(No pending tasks)"}

      Give a direct motivational feedback comment. Be brief and intense.
    `;

    const coachResult = await coachModel.generateContent(coachPrompt);
    const coachResponse = await coachResult.response;
    const coachComment = coachResponse.text().trim();

    res.json({
      schedule: jsonSchedule,
      coach_comment: coachComment
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    res.status(500).json({ error: 'Failed to communicate with Gemini API: ' + error.message });
  }
});

// AI GRIND COACH ENDPOINT (Conversational Mentor with MCP Stdio Tools)
app.post('/api/coach', async (req, res) => {
  const { message, history } = req.body;
  const clientId = req.headers['x-client-id'] || 'global';
  
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
    
    // Instantiate flash model with custom instructions and MCP database tool access
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `
        You are the "Grind Coach" inside GrindSpace—a premium productivity companion.
        You are a motivational, direct, and pragmatic focus mentor.
        Your tone is encouraging, professional, and slightly intense.
        Always keep responses highly practical, motivating, and strictly brief (max 2-3 sentences).
        Focus on actionable time management advice, overcoming distraction, and staying focused.
        
        You have access to tools to view the user's tasks and focus history. Use these tools when the user asks about their goals, progress, what they should do next, or how they are doing.
      `,
      tools: [
        {
          functionDeclarations: mcpToolsToGeminiDeclarations
        }
      ]
    });

    const chatHistory = (history || []).map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }]
    }));

    const chat = model.startChat({
      history: chatHistory
    });

    let result = await chat.sendMessage(message);
    let response = await result.response;
    let functionCalls = response.functionCalls();
    let loopCount = 0;

    // Resolve any tool/function calls requested by Gemini via the MCP client
    while (functionCalls && functionCalls.length > 0 && loopCount < 5) {
      loopCount++;
      const responseParts = [];

      for (const call of functionCalls) {
        const { name, args } = call;
        console.log(`[Multi-Agent Coach] Gemini requested tool: ${name} with args:`, args);

        // Inject correct client isolation header
        const toolArgs = { ...args, client_id: clientId };

        try {
          const toolResult = await callMcpTool(name, toolArgs);
          responseParts.push({
            functionResponse: {
              name: name,
              response: { result: toolResult }
            }
          });
        } catch (err) {
          responseParts.push({
            functionResponse: {
              name: name,
              response: { result: `Error executing tool: ${err.message}` }
            }
          });
        }
      }

      result = await chat.sendMessage(responseParts);
      response = await result.response;
      functionCalls = response.functionCalls();
    }


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
