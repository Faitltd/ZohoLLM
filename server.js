import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { upsertToVectorDb, queryVectorDb } from './src/lib/vectorDb.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use(express.static('public'));

// Webhook endpoint
app.post('/api/zoho-webhook', async (req, res) => {
    try {
        const data = req.body;
        console.log('Received webhook data:', JSON.stringify(data, null, 2));
        
        // This logic to determine module and ID
        let moduleType = 'unknown';
        let recordId = null;
        let entityId = null; // The parent ID for association

        if (data.Lead_Name) {
            moduleType = 'leads';
            recordId = data.id || data.Lead_Id;
            entityId = recordId; // A lead is its own parent entity
        } else if (data.Deal_Name) {
            moduleType = 'deals';
            recordId = data.id || data.Deal_Id;
            entityId = data.Contact_Name?.id || data.Parent_Id; // Associate with contact/lead
        } else if (data.Project_Name) {
            moduleType = 'projects';
            recordId = data.id || data.Project_Id;
            entityId = data.Deal_Name?.id || data.Parent_Id; // Associate with deal
        } else if (data.Subject && data.From) {
            moduleType = 'emails';
            recordId = data.id || data.Email_Id;
            entityId = data.Parent_Id || data.Related_To;
        } else if (data.Note_Content) {
            moduleType = 'chats'; // Or 'notes'
            recordId = data.id || data.Note_Id;
            entityId = data.Parent_Id;
        }
        
        // Process and store the data in our vector DB
        if (moduleType !== 'unknown' && recordId && entityId) {
            await upsertToVectorDb(moduleType, recordId, entityId, data);
            console.log(`Successfully processed webhook for ${moduleType}-${recordId}`);
            res.status(200).json({ success: true, message: 'Data processed successfully' });
        } else {
            console.warn("Could not determine module or ID for webhook data:", data);
            res.status(400).json({ error: 'Could not determine module or ID' });
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
    try {
        const { message, entity } = req.body;
        
        if (!message || !entity) {
            return res.status(400).json({ error: 'Message and entity are required' });
        }
        
        console.log(`Chat query: "${message}" for entity: ${entity}`);
        
        // Get RELEVANT context from the vector DB
        const context = await queryVectorDb(message, entity);
        console.log('Retrieved context:', context);
        
        // Create a prompt for the LLM
        const systemPrompt = `You are an expert CRM assistant. Answer the user's question based *only* on the following context provided. If the context doesn't contain the answer, say that you don't have enough information.

Context:
---
${context}
---
`;

        // Check if we have Anthropic API key
        if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-anthropic-api-key-here') {
            return res.json({
                response: `Based on the context I found:\n\n${context}\n\nNote: Anthropic API key not configured, so I can't provide an AI-generated response. Please add your Anthropic API key to the .env file.`
            });
        }

        // Send to Anthropic API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                system: systemPrompt,
                messages: [{
                    role: 'user',
                    content: message
                }],
                max_tokens: 1000
            })
        });
        
        const aiResponse = await response.json();
        
        if (aiResponse.content && aiResponse.content.length > 0) {
            res.json({
                response: aiResponse.content[0].text
            });
        } else {
            console.error("Error from Anthropic API:", aiResponse);
            res.status(500).json({ error: "Sorry, I encountered an error with the AI service." });
        }
    } catch (error) {
        console.error('Error in chat API:', error);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Simple HTML page for testing
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Zoho CRM AI Assistant</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                .container { margin-bottom: 20px; }
                input, textarea, button { padding: 10px; margin: 5px; }
                textarea { width: 100%; height: 100px; }
                button { background: #007cba; color: white; border: none; cursor: pointer; }
                .response { background: #f0f0f0; padding: 15px; margin: 10px 0; border-radius: 5px; }
            </style>
        </head>
        <body>
            <h1>Zoho CRM AI Assistant</h1>
            
            <div class="container">
                <h3>Test Chat</h3>
                <input type="text" id="entity" placeholder="Entity ID (e.g., lead_123)" style="width: 200px;">
                <br>
                <textarea id="message" placeholder="Ask a question about your CRM data..."></textarea>
                <br>
                <button onclick="sendMessage()">Send Message</button>
                <div id="response" class="response" style="display: none;"></div>
            </div>

            <script>
                async function sendMessage() {
                    const entity = document.getElementById('entity').value;
                    const message = document.getElementById('message').value;
                    const responseDiv = document.getElementById('response');
                    
                    if (!entity || !message) {
                        alert('Please enter both entity ID and message');
                        return;
                    }
                    
                    responseDiv.style.display = 'block';
                    responseDiv.innerHTML = 'Thinking...';
                    
                    try {
                        const response = await fetch('/api/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message, entity })
                        });
                        
                        const data = await response.json();
                        responseDiv.innerHTML = '<strong>AI Response:</strong><br>' + (data.response || data.error);
                    } catch (error) {
                        responseDiv.innerHTML = 'Error: ' + error.message;
                    }
                }
            </script>
        </body>
        </html>
    `);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Webhook endpoint: POST /api/zoho-webhook');
    console.log('Chat endpoint: POST /api/chat');
});
