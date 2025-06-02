const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

const DATASET_ID = 'logs';
const TABLE_ID = 'log';

/**
 * Cloud Function triggered by Pub/Sub message
 * Processes event data and transforms it to GA4-style format for BigQuery
 */
exports.processPubSubToBigQuery = async (message, context) => {
  try {
    // Decode the Pub/Sub message
    const eventData = JSON.parse(Buffer.from(message.data, 'base64').toString());
    
    console.log('Received event:', eventData);
    
    // Transform data to GA4-style format
    const row = transformToGA4Format(eventData);
    
    // Insert the row into BigQuery
    const dataset = bigquery.dataset(DATASET_ID);
    const table = dataset.table(TABLE_ID);
    
    await table.insert([row]);
    console.log(`Successfully inserted event: ${eventData.event_name}`);
    
  } catch (error) {
    console.error('Error processing Pub/Sub message:', error);
    throw error;
  }
};

/**
 * Transform MongoDB-style data to GA4 event format
 */
function transformToGA4Format(data) {
  const params = [];
  
  // Transform MongoDB fields to GA4 params
  if (data._id) {
    params.push({ key: '_id', string_value: data._id });
  }
  
  if (data.author) {
    params.push({ key: 'author', string_value: data.author });
  }
  
  if (data.content) {
    params.push({ key: 'content', string_value: data.content });
  }
  
  if (data.createdAt) {
    params.push({ 
      key: 'createdAt', 
      timestamp_value: new Date(data.createdAt).toISOString() 
    });
  }
  
  if (data.updatedAt) {
    params.push({ 
      key: 'updatedAt', 
      timestamp_value: new Date(data.updatedAt).toISOString() 
    });
  }
  
  if (data.isRemoved !== undefined) {
    params.push({ 
      key: 'isRemoved', 
      bool_value: data.isRemoved === 'true' || data.isRemoved === true 
    });
  }
  
  if (data.favoriteCount !== undefined) {
    params.push({ key: 'favoriteCount', int_value: parseInt(data.favoriteCount) });
  }
  
  if (data.favoritedBy) {
    params.push({ key: 'favoritedBy', json_value: data.favoritedBy });
  }
  
  // Add any custom parameters from the event
  if (data.customParams) {
    Object.entries(data.customParams).forEach(([key, value]) => {
      const param = { key };
      
      if (typeof value === 'string') {
        param.string_value = value;
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) {
          param.int_value = value;
        } else {
          param.float_value = value;
        }
      } else if (typeof value === 'boolean') {
        param.bool_value = value;
      } else if (value instanceof Date) {
        param.timestamp_value = value.toISOString();
      } else {
        param.json_value = value;
      }
      
      params.push(param);
    });
  }
  
  // Build the GA4-style row
  return {
    event_id: data.event_id || generateEventId(),
    event_name: data.event_name || 'note_action',
    timestamp: new Date(data.event_timestamp || Date.now()).toISOString(),
    user_id: data.user_id || data.author || null,
    params: params,
    device_category: data.device_category || null,
    operating_system: data.operating_system || null,
    browser: data.browser || null,
    country: data.country || null,
    ip_address: data.ip_address || null,
    source: data.source || 'notes_app'
  };
}

function generateEventId() {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Package.json dependencies
/*
{
  "name": "pubsub-bigquery-logger",
  "version": "1.0.0",
  "dependencies": {
    "@google-cloud/bigquery": "^7.0.0"
  }
}
*/