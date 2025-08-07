# Zoho CRM AI Assistant

A smart CRM assistant that uses ChromaDB and OpenAI embeddings to provide intelligent context-aware responses about your Zoho CRM data.

## Features

- **Webhook Integration**: Receives and processes Zoho CRM webhook data
- **Vector Storage**: Uses ChromaDB to store and retrieve contextually relevant information
- **AI-Powered Chat**: Provides intelligent responses using OpenAI embeddings and Anthropic Claude
- **Entity-Based Filtering**: Groups related data by entity (leads, deals, etc.) for precise context retrieval

## Architecture

1. **Webhook Ingestion**: Zoho sends webhook data to `/api/zoho-webhook`
2. **Data Processing**: System identifies module type and creates meaningful text chunks
3. **Vector Storage**: OpenAI generates embeddings and stores them in ChromaDB
4. **Chat Interface**: Users query specific entities via `/api/chat`
5. **Context Retrieval**: System finds relevant context using vector similarity search
6. **AI Response**: Anthropic Claude generates intelligent responses based on context

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Install ChromaDB (Python)

```bash
python3 -m venv venv
source venv/bin/activate
pip install chromadb
```

### 3. Configure Environment Variables

Update `.env` file with your API keys:

```env
OPENAI_API_KEY=your-openai-api-key-here
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

### 4. Start ChromaDB Server

```bash
source venv/bin/activate
chroma run --host localhost --port 8000
```

### 5. Start the Application

```bash
npm start
```

The server will run on `http://localhost:3000`

## Usage

### Webhook Endpoint

Configure Zoho CRM to send webhooks to:
```
POST http://localhost:3000/api/zoho-webhook
```

Supported modules:
- **Leads**: Automatically processes lead information
- **Notes**: Associates notes with parent entities
- **Emails**: Processes email communications
- **Deals**: Handles deal information
- **Projects**: Manages project data

### Chat Interface

1. Open `http://localhost:3000` in your browser
2. Enter an Entity ID (e.g., `lead_123`)
3. Ask questions about that entity
4. Get AI-powered responses based on stored context

### API Endpoints

#### POST /api/zoho-webhook
Receives and processes Zoho CRM webhook data.

#### POST /api/chat
```json
{
  "message": "What do we know about John Doe?",
  "entity": "lead_123"
}
```

Returns:
```json
{
  "response": "Based on the context, John Doe is a qualified lead from Acme Corp..."
}
```

## Testing

Run the test script to simulate webhook data:

```bash
node test-webhook.js
```

This will:
1. Send sample lead data to the webhook
2. Send sample note data associated with the lead
3. Query the chat API for information about the lead

## Data Flow

1. **Zoho Webhook** → **Express Server** → **Vector DB Processing**
2. **User Question** → **Vector Search** → **Context Retrieval** → **AI Response**

## Key Benefits

- **Intelligent Context**: Only retrieves relevant information for each query
- **Scalable**: Vector database can handle large amounts of CRM data
- **Entity-Focused**: Groups related information by customer/lead/deal
- **Real-time**: Processes webhook data immediately as it arrives
- **Cost-Effective**: Uses efficient OpenAI embedding model

## File Structure

```
├── server.js                 # Express server with API endpoints
├── src/lib/vectorDb.js       # ChromaDB and OpenAI integration
├── test-webhook.js           # Test script for webhook functionality
├── .env                      # Environment variables (API keys)
└── README.md                 # This file
```

## Next Steps

1. Add your Anthropic API key to `.env` for full AI functionality
2. Configure Zoho CRM webhooks to point to your server
3. Customize the data processing logic for your specific CRM fields
4. Add authentication and security measures for production use

## Troubleshooting

- Ensure ChromaDB server is running on port 8000
- Check that all API keys are properly configured in `.env`
- Verify webhook data format matches expected structure
- Check server logs for detailed error information
