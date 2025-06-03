# Pub/Sub to BigQuery Cloud Run Function

This Cloud Run function processes Pub/Sub messages containing event data from your notes web application and inserts them into a BigQuery table for analytics and monitoring.

## Architecture

```
Notes Web App → Pub/Sub Topic → Cloud Run Function → BigQuery Table
```

1. **Web App**: Publishes events to Pub/Sub using the `NotesEventLogger` class
2. **Pub/Sub**: Delivers messages to the Cloud Run function via push subscription
3. **Cloud Run Function**: Processes and validates event data
4. **BigQuery**: Stores processed events in the `logs.events` table

## Prerequisites

- Google Cloud Project with billing enabled
- BigQuery API enabled
- Pub/Sub API enabled
- Cloud Run API enabled
- `gcloud` CLI installed and authenticated

## BigQuery Setup

1. Create the BigQuery dataset and table:

```bash
# Create dataset
bq mk --dataset --location=US logs

# Create table with schema
bq mk --table logs.events ./log_schema.json
```

2. Verify the table was created:
```bash
bq show logs.events
```

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set environment variables:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="path/to/your/service-account-key.json"
export DATASET_ID="logs"
export TABLE_ID="events"
```

3. Start the function locally:
```bash
npm run dev
```

4. Test the function with a sample event:
```bash
curl -X POST http://localhost:8080 \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "data": "'$(echo '{
        "event_id": "test_123",
        "event": "note_created",
        "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
        "user_id": "user_456",
        "params": [
          {
            "key": "note_title",
            "string_value": "My Test Note"
          },
          {
            "key": "note_length",
            "int_value": 145
          }
        ],
        "user_props": {
          "device_category": "desktop",
          "operating_system": "Windows",
          "browser": "Chrome",
          "country": "US",
          "ip_address": "192.168.1.1"
        }
      }' | base64 -w 0)'"
    }
  }'
```

## Deployment

1. Update the project ID in `deploy.sh`:
```bash
PROJECT_ID="your-project-id"
```

2. Make the deploy script executable and run it:
```bash
chmod +x deploy.sh
./deploy.sh
```

This will:
- Deploy the Cloud Run service
- Create a Pub/Sub push subscription
- Configure the subscription to send messages to your Cloud Run function

## Function Endpoints

- `POST /pubsubToBigQuery` - Main endpoint for processing Pub/Sub messages
- `GET /healthCheck` - Health check endpoint for monitoring

## Event Data Schema

The function expects events with the following structure:

```json
{
  "event_id": "string (required)",
  "event": "string (required)", 
  "timestamp": "ISO datetime string (required)",
  "user_id": "string (optional)",
  "params": [
    {
      "key": "string",
      "string_value": "string (optional)",
      "int_value": 123 (optional),
      "float_value": 12.34 (optional),
      "bool_value": true (optional),
      "timestamp_value": "ISO datetime (optional)",
      "json_value": "JSON string (optional)"
    }
  ],
  "user_props": {
    "device_category": "string (optional)",
    "operating_system": "string (optional)", 
    "browser": "string (optional)",
    "country": "string (optional)",
    "ip_address": "string (optional)"
  }
}
```

## Error Handling

The function includes comprehensive error handling:

- **400 Bad Request**: Invalid message format or missing required fields
- **405 Method Not Allowed**: Non-POST requests
- **500 Internal Server Error**: BigQuery insertion errors or other processing failures

All errors are logged to Cloud Logging for debugging.

## Monitoring

### Logs
```bash
# View recent logs
gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=pubsub-to-bigquery' --limit=20

# Follow logs in real-time
gcloud logging tail 'resource.type=cloud_run_revision AND resource.labels.service_name=pubsub-to-bigquery'
```

### BigQuery Queries
```sql
-- Recent events
SELECT * FROM `logs.events` 
ORDER BY timestamp DESC 
LIMIT 100;

-- Events by type
SELECT event, COUNT(*) as count
FROM `logs.events`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
GROUP BY event
ORDER BY count DESC;

-- User activity
SELECT user_id, COUNT(*) as event_count
FROM `logs.events`
WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
  AND user_id IS NOT NULL
GROUP BY user_id
ORDER BY event_count DESC;
```

## Integration with Notes App

The notes web application uses the `NotesEventLogger` class to publish events:

```javascript
const { notesLogger } = require('./log_event');

// Log note creation
await notesLogger.logNoteCreated(noteData, userContext);

// Log custom events
await notesLogger.logEvent('custom_action', data, userContext);
```

## Troubleshooting

### Common Issues

1. **BigQuery table not found**
   - Ensure the dataset and table exist
   - Verify the `DATASET_ID` and `TABLE_ID` environment variables

2. **Authentication errors**
   - Ensure the Cloud Run service has the necessary IAM permissions
   - Required roles: `BigQuery Data Editor`, `BigQuery User`

3. **Pub/Sub message format issues**
   - Check that messages are properly base64 encoded
   - Verify the JSON structure matches the expected schema

### Service Account Permissions

Ensure your Cloud Run service account has these permissions:
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:SERVICE_ACCOUNT_EMAIL" \
  --role="roles/bigquery.user"
```

## Performance Considerations

- **Concurrency**: Configured for up to 10 concurrent instances
- **Memory**: 512Mi allocated per instance  
- **Timeout**: 300 seconds maximum execution time
- **Batch Processing**: Consider implementing batching for high-volume scenarios

## Security

- Authentication handled by Pub/Sub push subscription
- Cloud Run service allows unauthenticated requests (secured by Pub/Sub)
- Sensitive data should be sanitized before logging
- Consider implementing request rate limiting for production use 