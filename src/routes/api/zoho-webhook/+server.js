import { upsertToVectorDb } from '$lib/vectorDb.js';

export async function POST({ request }) {
    try {
        const data = await request.json();
        
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
        
        // --- The Big Change ---
        // Instead of saving to memory and sending to the LLM immediately,
        // we just process and store the data in our vector DB.
        if (moduleType !== 'unknown' && recordId && entityId) {
            await upsertToVectorDb(moduleType, recordId, entityId, data);
            console.log(`Successfully processed webhook for ${moduleType}-${recordId}`);
        } else {
            console.warn("Could not determine module or ID for webhook data:", data);
        }

        // We no longer need to get related data or call the LLM here.
        // The webhook's only job is to receive and store.
        
        return new Response('OK', { status: 200 });
    } catch (error) {
        console.error('Error processing webhook:', error);
        return new Response('Internal Server Error', { status: 500 });
    }
}
