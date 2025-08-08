import { upsertToVectorDb } from '$lib/vectorDb-vercel.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    try {
        const data = await request.json();
        console.log('Received webhook data:', JSON.stringify(data, null, 2));
        
        // This logic to determine module and ID
        let moduleType = 'unknown';
        let recordId: string | null = null;
        let entityId: string | null = null; // The parent ID for association

        if (data.Lead_Name) {
            moduleType = 'leads';
            recordId = data.id || data.Lead_Id;
            entityId = recordId; // A lead is its own parent entity
        } else if (data.Deal_Name) {
            moduleType = 'deals';
            recordId = data.id || data.Deal_Id;
            entityId = data.Contact_Name?.id || data.Parent_Id || recordId; // Associate with contact/lead, or self if no parent
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
            return json({ success: true, message: 'Data processed successfully' });
        } else {
            console.warn("Could not determine module or ID for webhook data:", data);
            return json({ error: 'Could not determine module or ID' }, { status: 400 });
        }
    } catch (error) {
        console.error('Error processing webhook:', error);
        return json({ error: 'Internal server error', details: (error as Error).message }, { status: 500 });
    }
};
