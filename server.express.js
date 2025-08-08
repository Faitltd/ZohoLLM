import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { upsertToVectorDb, queryVectorDb } from './src/lib/vectorDb.js';

// Legacy Express server (kept for reference only). Not used by SvelteKit.
// Prefer running `npm run dev` (Vite dev) or `svelte-kit preview` for the app.

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

// Chat endpoint (legacy: expects `entity`)
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

app.listen(PORT, () => {
    console.log(`Legacy Express server running on http://localhost:${PORT}`);
});

