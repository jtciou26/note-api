# Step 1: Set up Google Cloud environment
gcloud config set project YOUR_PROJECT_ID
gcloud auth login

# Step 2: Enable required APIs
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable bigquery.googleapis.com

# Step 3: Create Pub/Sub topic (if not done programmatically)
gcloud pubsub topics create api-logs

# Step 4: Create BigQuery dataset and table
bq mk --dataset --description "Dataset for web service API logs" YOUR_PROJECT_ID:web_logs

bq mk --table \
  --description "Table for storing API request/response logs" \
  --time_partitioning_field timestamp \
  --time_partitioning_type DAY \
  --clustering_fields method,endpoint,status_code \
  YOUR_PROJECT_ID:web_logs.api_logs \
  timestamp:TIMESTAMP:REQUIRED,request_id:STRING:REQUIRED,method:STRING:REQUIRED,endpoint:STRING:REQUIRED,status_code:INTEGER:REQUIRED,response_time_ms:INTEGER,user_id:STRING,ip_address:STRING,user_agent:STRING,request_body:JSON,response_body:JSON,error_message:STRING,metadata:JSON

# Step 5: Deploy Cloud Function
# First, create a directory for your function
mkdir pubsub-to-bigquery-function
cd pubsub-to-bigquery-function

# Create package.json
cat > package.json << EOF
{
  "name": "pubsub-bigquery-logger",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@google-cloud/bigquery": "^7.0.0"
  }
}
EOF

# Copy the Cloud Function code to index.js
# (Use the first artifact content)

# Deploy the function
gcloud functions deploy processPubSubToBigQuery \
  --runtime nodejs18 \
  --trigger-topic api-logs \
  --entry-point processPubSubToBigQuery \
  --memory 256MB \
  --timeout 60s

# Step 6: Set up IAM permissions (if needed)
# Give the Cloud Function service account access to BigQuery
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/bigquery.dataEditor"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/bigquery.user"

# Step 7: Install Pub/Sub client in your Node.js backend
# In your Node.js project directory:
npm install @google-cloud/pubsub

# Step 8: Test the setup
# Publish a test message to verify the pipeline
gcloud pubsub topics publish api-logs \
  --message='{"requestId":"test123","method":"GET","endpoint":"/api/test","statusCode":200,"responseTime":150,"ipAddress":"127.0.0.1","userAgent":"test-agent"}'

# Step 9: Check BigQuery for the inserted data
bq query --use_legacy_sql=false \
'SELECT * FROM `YOUR_PROJECT_ID.web_logs.api_logs` ORDER BY timestamp DESC LIMIT 10'

# Step 10: Set up environment variables for your Node.js app
# In your .env file or environment:
# GOOGLE_CLOUD_PROJECT_ID=YOUR_PROJECT_ID
# PUBSUB_TOPIC_NAME=api-logs

# Optional: Set up authentication for local development
# Download service account key and set environment variable:
# export GOOGLE_APPLICATION_CREDENTIALS="path/to/your/service-account-key.json"