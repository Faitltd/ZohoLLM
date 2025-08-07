import { queryVectorDb } from '$lib/vectorDb.js';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export async function POST({ request }) {
    try {
        const { message, entity } = await request.json();
        
        if (!message || !entity) {
            return json({ error: 'Message and entity are required' }, { status: 400 });
        }
        
        // 1. Get RELEVANT context from the vector DB, not ALL data
        const context = await queryVectorDb(message, entity);
        
        // 2. Create a new, more efficient prompt
        const systemPrompt = `You are an expert CRM assistant. Answer the user's question based *only* on the following context provided. If the context doesn't contain the answer, say that you don't have enough information.

Context:
---
${context}
---
`;

        // 3. Send to LLM with the focused context
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-sonnet-20240229', // Sonnet is faster and cheaper, good for chat
                system: systemPrompt,
                messages: [{
                    role: 'user',
                    content: message // The user's original question
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
            return json({ response: "Sorry, I encountered an error." }, { status: 500 });
        }
    } catch (error) {
        console.error('Error in chat API:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
}
