<script lang="ts">
let message = '';
let searchName = '';
let chatHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
let loading = false;

async function sendMessage() {
if (!message.trim() || !searchName.trim()) {
alert('Please enter both a message and search name');
return;
}

loading = true;

// Add user message to chat history
chatHistory = [...chatHistory, { role: 'user', content: message }];

try {
const response = await fetch('/api/chat', {
method: 'POST',
headers: {
'Content-Type': 'application/json'
},
body: JSON.stringify({ message, searchName })
});

const data = await response.json();

if (data.response) {
// Add AI response to chat history
chatHistory = [...chatHistory, { role: 'assistant', content: data.response }];
} else {
chatHistory = [...chatHistory, { role: 'assistant', content: 'Sorry, I encountered an error.' }];
}
} catch (error) {
console.error('Error sending message:', error);
chatHistory = [...chatHistory, { role: 'assistant', content: 'Sorry, I encountered an error.' }];
}

message = '';
loading = false;
}

function handleKeyPress(event: KeyboardEvent) {
if (event.key === 'Enter' && !event.shiftKey) {
event.preventDefault();
sendMessage();
}
}
</script>

<main>
<div class="container">
<h1>🤖 Zoho CRM AI Assistant</h1>
<p class="subtitle">Intelligent context-aware responses powered by vector search and AI</p>

<div class="search-input">
<label for="searchName">Lead Name, Deal Name, or Company:</label>
<input 
id="searchName"
type="text" 
bind:value={searchName} 
placeholder="Enter Lead Name, Deal Name, or Company (e.g., John Doe, Q4 Sales Deal, Acme Corp)"
/>
</div>

<div class="chat-container">
<div class="chat-history">
{#if chatHistory.length === 0}
<div class="welcome-message">
<h3>👋 Welcome!</h3>
<p>Enter a <strong>Lead Name</strong>, <strong>Deal Name</strong>, or <strong>Company Name</strong> above and ask questions about your CRM data.</p>
<div class="examples">
<h4>📝 Search Examples:</h4>
<ul>
<li><strong>Lead Name:</strong> "John Doe", "Jane Smith"</li>
<li><strong>Deal Name:</strong> "Q4 Sales Deal", "Enterprise Contract"</li>
<li><strong>Company:</strong> "Acme Corp", "Tech Solutions Inc"</li>
</ul>
</div>
<div class="questions">
<h4>💬 Question Examples:</h4>
<ul>
<li>"What do we know about this lead?"</li>
<li>"What's the latest update on this deal?"</li>
<li>"Show me all communications with this company"</li>
<li>"What's the status of this opportunity?"</li>
</ul>
</div>
<div class="demo-section">
<h4>🧪 Try the Demo:</h4>
<ol>
<li>First, send some test data to the webhook</li>
<li>Then use <code>John Doe</code> (Lead Name) or <code>Acme Corp</code> (Company) to ask questions</li>
</ol>
<div class="webhook-info">
<p><strong>Webhook URL:</strong></p>
<code>POST /api/zoho-webhook</code>
<p><strong>Sample Data:</strong> Send JSON with Lead_Name, Deal_Name, Company, and other Zoho fields</p>
</div>
</div>
</div>
{/if}

{#each chatHistory as chat}
<div class="message {chat.role}">
<div class="message-header">
<strong>{chat.role === 'user' ? '👤 You' : '🤖 AI Assistant'}</strong>
</div>
<div class="message-content">
{chat.content}
</div>
</div>
{/each}

{#if loading}
<div class="message assistant loading">
<div class="message-header">
<strong>🤖 AI Assistant</strong>
</div>
<div class="message-content">
<div class="typing-indicator">
<span></span>
<span></span>
<span></span>
</div>
Thinking...
</div>
</div>
{/if}
</div>

<div class="input-container">
<textarea
bind:value={message}
on:keypress={handleKeyPress}
placeholder="Ask a question about your CRM data..."
disabled={loading}
></textarea>
<button on:click={sendMessage} disabled={loading || !message.trim() || !searchName.trim()}>
{loading ? '⏳' : '📤'} Send
</button>
</div>
</div>
</div>
</main>

<style>
.container {
max-width: 800px;
margin: 0 auto;
padding: 20px;
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
text-align: center;
color: #333;
margin-bottom: 10px;
font-size: 2.5rem;
}

.subtitle {
text-align: center;
color: #666;
margin-bottom: 30px;
font-size: 1.1rem;
}

.search-input {
margin-bottom: 20px;
}

.search-input label {
display: block;
margin-bottom: 8px;
font-weight: 600;
color: #333;
}

.search-input input {
width: 100%;
padding: 12px;
border: 2px solid #e1e5e9;
border-radius: 8px;
font-size: 16px;
transition: border-color 0.2s;
}

.search-input input:focus {
outline: none;
border-color: #007cba;
}

.chat-container {
border: 2px solid #e1e5e9;
border-radius: 12px;
height: 500px;
display: flex;
flex-direction: column;
overflow: hidden;
box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.chat-history {
flex: 1;
overflow-y: auto;
padding: 20px;
background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
}

.welcome-message {
text-align: center;
padding: 20px;
color: #666;
}

.welcome-message h3 {
margin-bottom: 15px;
color: #333;
}

.examples, .questions {
margin: 20px 0;
text-align: left;
background: white;
padding: 15px;
border-radius: 8px;
box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.examples h4, .questions h4 {
margin-bottom: 10px;
color: #333;
font-size: 1rem;
}

.examples ul, .questions ul {
margin: 0;
padding-left: 20px;
}

.examples li, .questions li {
margin-bottom: 8px;
color: #555;
}

.demo-section {
margin-top: 30px;
text-align: left;
background: white;
padding: 20px;
border-radius: 8px;
box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.webhook-info {
background: #f8f9fa;
padding: 15px;
border-radius: 6px;
margin-top: 15px;
}

.webhook-info code {
background: #e9ecef;
padding: 4px 8px;
border-radius: 4px;
font-family: 'Monaco', 'Consolas', monospace;
}

.message {
margin-bottom: 20px;
padding: 15px;
border-radius: 12px;
max-width: 85%;
animation: fadeIn 0.3s ease-in;
}

.message.user {
background: linear-gradient(135deg, #007cba 0%, #005a87 100%);
color: white;
margin-left: auto;
border-bottom-right-radius: 4px;
}

.message.assistant {
background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
color: white;
margin-right: auto;
border-bottom-left-radius: 4px;
}

.message-header {
margin-bottom: 8px;
font-size: 0.9rem;
opacity: 0.9;
}

.message-content {
line-height: 1.5;
white-space: pre-wrap;
}

.typing-indicator {
display: inline-flex;
gap: 4px;
margin-right: 8px;
}

.typing-indicator span {
width: 8px;
height: 8px;
border-radius: 50%;
background-color: rgba(255, 255, 255, 0.7);
animation: typing 1.4s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
.typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
40% { transform: scale(1); opacity: 1; }
}

@keyframes fadeIn {
from { opacity: 0; transform: translateY(10px); }
to { opacity: 1; transform: translateY(0); }
}

.input-container {
display: flex;
padding: 20px;
border-top: 2px solid #e1e5e9;
background: white;
gap: 12px;
}

textarea {
flex: 1;
padding: 12px;
border: 2px solid #e1e5e9;
border-radius: 8px;
resize: vertical;
min-height: 60px;
font-family: inherit;
font-size: 14px;
transition: border-color 0.2s;
}

textarea:focus {
outline: none;
border-color: #007cba;
}

button {
padding: 12px 24px;
background: linear-gradient(135deg, #007cba 0%, #005a87 100%);
color: white;
border: none;
border-radius: 8px;
cursor: pointer;
font-size: 14px;
font-weight: 600;
transition: all 0.2s;
white-space: nowrap;
}

button:hover:not(:disabled) {
transform: translateY(-1px);
box-shadow: 0 4px 8px rgba(0, 124, 186, 0.3);
}

button:disabled {
background: #ccc;
cursor: not-allowed;
transform: none;
box-shadow: none;
}
</style>
