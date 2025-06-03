#!/bin/bash

# Set variables
PROJECT_ID="toegazer"  # Replace with your actual project ID
SERVICE_NAME="pubsub-to-bigquery"
REGION="us-central1"
TOPIC_NAME="notes-events"

echo "Deploying Cloud Run service..."

# Deploy Cloud Run service
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --max-instances 10 \
  --timeout 300 \
  --set-env-vars DATASET_ID=logs,TABLE_ID=events \
  --project $PROJECT_ID

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)" --project=$PROJECT_ID)

echo "Cloud Run service deployed successfully!"
echo "Service URL: $SERVICE_URL"

# Create Pub/Sub push subscription to trigger the Cloud Run service
echo "Creating Pub/Sub subscription..."
gcloud pubsub subscriptions create ${SERVICE_NAME}-subscription \
  --topic=$TOPIC_NAME \
  --push-endpoint="${SERVICE_URL}/pubsubToBigQuery" \
  --project=$PROJECT_ID \
  --ack-deadline=60

echo "Deployment complete!"
echo "Service URL: $SERVICE_URL"
echo "Check logs with: gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME' --limit=20 --format=table" 