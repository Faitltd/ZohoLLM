# Deployment Guide

## Google Cloud Platform Deployment

### Prerequisites
- Google Cloud CLI installed and authenticated
- Docker installed locally
- Project ID: `connecteam-zoho-sync`

### Option 1: Cloud Run (Recommended)

#### 1. Enable Required APIs
```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

#### 2. Set Environment Variables
```bash
gcloud run services update zoho-llm \
  --set-env-vars="OPENAI_API_KEY=your-key,ANTHROPIC_API_KEY=your-key" \
  --region=us-central1
```

#### 3. Deploy using Cloud Build
```bash
gcloud builds submit --config cloudbuild.yaml
```

#### 4. Get Service URL
```bash
gcloud run services describe zoho-llm --region=us-central1 --format="value(status.url)"
```

### Option 2: Manual Docker Deployment

#### 1. Build and Push Image
```bash
# Set project ID
export PROJECT_ID=connecteam-zoho-sync

# Build image
docker build -t gcr.io/$PROJECT_ID/zoho-llm .

# Push to Container Registry
docker push gcr.io/$PROJECT_ID/zoho-llm
```

#### 2. Deploy to Cloud Run
```bash
gcloud run deploy zoho-llm \
  --image gcr.io/$PROJECT_ID/zoho-llm \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 2Gi \
  --cpu 2 \
  --set-env-vars="NODE_ENV=production,OPENAI_API_KEY=your-key,ANTHROPIC_API_KEY=your-key"
```

### Option 3: Local Docker Development

#### 1. Create .env file
```bash
cp .env.example .env
# Edit .env with your API keys
```

#### 2. Run with Docker Compose
```bash
docker-compose up --build
```

## Environment Variables

Set these in Cloud Run or your deployment environment:

```
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
NODE_ENV=production
PORT=3000
```

## Webhook Configuration

Once deployed, configure Zoho CRM webhooks to point to:
```
https://your-cloud-run-url/api/zoho-webhook
```

## Monitoring and Logs

### View Logs
```bash
gcloud run services logs read zoho-llm --region=us-central1
```

### Monitor Performance
```bash
gcloud run services describe zoho-llm --region=us-central1
```

## Scaling Configuration

Cloud Run will automatically scale based on traffic. You can configure:

```bash
gcloud run services update zoho-llm \
  --min-instances=0 \
  --max-instances=10 \
  --concurrency=80 \
  --region=us-central1
```

## Security Considerations

1. **API Keys**: Store in Google Secret Manager for production
2. **Authentication**: Add authentication for production use
3. **CORS**: Configure CORS for your domain
4. **Rate Limiting**: Implement rate limiting for webhook endpoints

## Troubleshooting

### Common Issues

1. **ChromaDB Connection**: Ensure ChromaDB starts before the Node.js app
2. **Memory Issues**: Increase memory allocation if needed
3. **Cold Starts**: Use min-instances to reduce cold start latency

### Debug Commands
```bash
# Check service status
gcloud run services describe zoho-llm --region=us-central1

# View recent logs
gcloud run services logs tail zoho-llm --region=us-central1

# Test endpoints
curl https://your-service-url/api/health
```
