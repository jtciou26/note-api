# Pub/Sub to BigQuery Pipeline Setup Guide

This guide will help you set up the complete pipeline to log note creation events from your note-taking app to BigQuery via Pub/Sub.

## Prerequisites

1. Google Cloud Project with billing enabled
2. BigQuery dataset `logs` with table `events` 
3. Pub/Sub topic `event_logs`
4. Cloud Function `log-event`

## 1. BigQuery Table Schema

Your `logs.events` table should have the following schema:

```sql
CREATE TABLE `your-project.logs.events` (
  event_id STRING,
  event_name STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  user_id STRING,
  event_data JSON,
  user_context JSON,
  processed_at TIMESTAMP
);
```

## 2. Backend Setup

### Install Dependencies

```bash
cd note-api
npm install @google-cloud/pubsub
```

### Environment Variables

Add to your `.env` file:

```bash
# Google Cloud Project ID (if different from default credentials)
GOOGLE_CLOUD_PROJECT_ID=your-project-id

# Optional: Path to service account key file
GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account-key.json
```

### Authentication

Ensure your backend has proper Google Cloud authentication:

1. **Local Development**: Use `gcloud auth application-default login`
2. **Production**: Use service account with appropriate permissions:
   - Pub/Sub Publisher
   - BigQuery Data Editor (if needed for the function)

## 3. Cloud Function Deployment

### Update package.json

Create/update `note-api/pubsub-to-bigquery-function/package.json`:

```json
{
  "name": "pubsub-to-bigquery-function",
  "version": "1.0.0",
  "description": "Cloud Function to process Pub/Sub messages and insert into BigQuery",
  "main": "index.js",
  "dependencies": {
    "@google-cloud/bigquery": "^7.0.0"
  },
  "engines": {
    "node": "20"
  }
}
```

### Deploy the Cloud Function

```bash
cd note-api/pubsub-to-bigquery-function

# Deploy the function (replace with your actual project and region)
gcloud functions deploy log-event \
  --runtime nodejs20 \
  --trigger-topic event_logs \
  --entry-point logEventToBigQuery \
  --region us-central1 \
  --memory 256MB \
  --timeout 540s
```

## 4. Testing the Pipeline

### Test Note Creation

1. Start your backend server:
   ```bash
   cd note-api
   npm run dev
   ```

2. Create a new note through your frontend or GraphQL playground:
   ```graphql
   mutation {
     newNote(content: "Test note for pub/sub pipeline") {
       id
       content
       createdAt
       author {
         username
       }
     }
   }
   ```

3. Check the logs:
   - Backend console: Should show "Event 'note_created' published with ID: ..."
   - Cloud Function logs: Should show successful BigQuery insertion
   - BigQuery: Query your `logs.events` table to see the logged event

### Sample BigQuery Query

```sql
SELECT 
  event_id,
  event_name,
  timestamp,
  user_id,
  JSON_EXTRACT_SCALAR(event_data, '$.note_id') as note_id,
  JSON_EXTRACT_SCALAR(event_data, '$.content_length') as content_length,
  JSON_EXTRACT_SCALAR(user_context, '$.device_category') as device_category,
  JSON_EXTRACT_SCALAR(user_context, '$.browser') as browser,
  processed_at
FROM `your-project.logs.events`
WHERE event_name = 'note_created'
ORDER BY timestamp DESC
LIMIT 10;
```

## 5. Monitoring and Troubleshooting

### View Cloud Function Logs

```bash
gcloud functions logs read log-event --limit 50
```

### Common Issues

1. **Authentication Errors**: Ensure proper service account permissions
2. **Topic Not Found**: Verify the topic name matches exactly (`event_logs`)
3. **BigQuery Schema Errors**: Check that your table schema matches the expected format
4. **Network Issues**: Ensure your backend can reach Google Cloud APIs

### Required IAM Permissions

Your service account needs:
- `pubsub.topics.publish` on the topic
- `bigquery.tables.create` and `bigquery.data.create` on the dataset

## 6. Event Data Structure

Events logged to BigQuery will have this structure:

```json
{
  "event_id": "evt_1234567890_abc123def",
  "event_name": "note_created",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "user_id": "user123",
  "event_data": {
    "note_id": "note456",
    "content_length": 150,
    "author_id": "user123",
    "created_at": "2024-01-15T10:30:00.000Z",
    "favorite_count": 0
  },
  "user_context": {
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0...",
    "device_category": "desktop",
    "operating_system": "Windows",
    "browser": "Chrome"
  },
  "processed_at": "2024-01-15T10:30:01.000Z"
}
```

## 7. Scaling Considerations

- **Rate Limits**: Pub/Sub can handle high throughput, but consider batching for very high volumes
- **Cost**: Monitor BigQuery storage and query costs
- **Retention**: Set up table partitioning and automatic deletion for old events
- **Error Handling**: Set up dead letter queues for failed messages

## 8. Next Steps

Consider extending the pipeline to log other events:
- Note updates
- Note deletions  
- User favorites
- Search queries
- Page views

Each event type can provide valuable analytics insights for your application. 