import { queryVectorDb } from '$lib/vectorDb-vercel.js';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const requestBody = await request.json();
        console.log('Received request body:', requestBody);
        
        const { message, searchName, entity } = requestBody;
        console.log('Extracted message:', message);
        console.log('Extracted searchName:', searchName);
        console.log('Extracted entity:', entity);

        // Accept either `searchName` (old) or `entity` (new). Prefer non-empty string.
        const resolvedName = (typeof searchName === 'string' && searchName.trim())
            ? searchName.trim()
            : (typeof entity === 'string' ? entity.trim() : '');

        if (!message || !resolvedName) {
            console.log('Missing required fields - message:', !!message, 'resolvedName:', !!resolvedName);
            return json({ error: 'Message and entity are required' }, { status: 400 });
        }

        console.log(`Chat query: "${message}" for: ${resolvedName}`);

        // Get RELEVANT context from the vector DB
        const context = await queryVectorDb(message, resolvedName);
        console.log('Retrieved context:', context);
        
        // Create a prompt for the LLM
        const systemPrompt = `You are an expert CRM assistant. Answer the user's question based *only* on the following context provided. If the context doesn't contain the answer, say that you don't have enough information.

Context:
---
${context}
---
`;

        // Check if we have Anthropic API key
        if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY === 'your-anthropic-api-key-here') {
            return json({
                response: `Based on the context I found:\n\n${context}\n\nNote: Anthropic API key not configured, so I can't provide an AI-generated response. Please add your Anthropic API key to the .env file.`
            });
        }

        // Send to Anthropic API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': env.ANTHROPIC_API_KEY,
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
            return json({
                response: aiResponse.content[0].text
            });
        } else {
            console.error("Error from Anthropic API:", aiResponse);
            return json({ error: "Sorry, I encountered an error with the AI service." }, { status: 500 });
        }
    } catch (error) {
        console.error('Error in chat API:', error);
        return json({ error: 'Internal server error', details: (error as Error).message }, { status: 500 });
    }
};
