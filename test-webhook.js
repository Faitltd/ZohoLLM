// Test script to simulate Zoho webhook data
import fetch from 'node-fetch';

const testLeadData = {
    Lead_Name: "John Doe",
    Company: "Acme Corp",
    Lead_Status: "Qualified",
    Email: "john.doe@acme.com",
    id: "lead_123",
    Phone: "+1-555-0123"
};

const testNoteData = {
    Note_Title: "Follow-up call",
    Note_Content: "Customer is interested in our premium package. Scheduled demo for next week.",
    id: "note_456",
    Parent_Id: "lead_123"
};

async function testWebhook() {
    console.log('Testing webhook with lead data...');
    
    try {
        // Test lead creation
        const leadResponse = await fetch('http://localhost:3000/api/zoho-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testLeadData)
        });
        
        console.log('Lead webhook response:', leadResponse.status);
        
        // Wait a moment for processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test note creation
        console.log('Testing webhook with note data...');
        const noteResponse = await fetch('http://localhost:3000/api/zoho-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testNoteData)
        });
        
        console.log('Note webhook response:', noteResponse.status);
        
        // Wait a moment for processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test chat query
        console.log('Testing chat query...');
        const chatResponse = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: "What do we know about John Doe?",
                searchName: "John Doe"
            })
        });
        
        const chatResult = await chatResponse.json();
        console.log('Chat response:', chatResult);
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testWebhook();
