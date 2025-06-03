const { BigQuery } = require('@google-cloud/bigquery');

// Initialize BigQuery client
const bigquery = new BigQuery();

// Your BigQuery dataset and table
const DATASET_ID = 'logs';
const TABLE_ID = 'events';

/**
 * Cloud Function triggered by Pub/Sub messages
 * @param {object} message The Pub/Sub message
 * @param {object} context The event context
 */
exports.logEventToBigQuery = async (message, context) => {
    try {
        // Decode the Pub/Sub message
        const messageData = message.data
            ? JSON.parse(Buffer.from(message.data, 'base64').toString())
            : {};

        console.log('Received message:', messageData);

        // Validate required fields
        if (!messageData.event_name || !messageData.timestamp) {
            console.error('Invalid message format - missing required fields');
            return;
        }

        // Prepare the row for BigQuery insertion
        const row = {
            event_id: messageData.event_id || null,
            event_name: messageData.event_name,
            timestamp: messageData.timestamp,
            user_id: messageData.user_id || null,
            event_data: messageData.event_data ? JSON.stringify(messageData.event_data) : null,
            user_context: messageData.user_context ? JSON.stringify(messageData.user_context) : null,
            processed_at: new Date().toISOString()
        };

        // Insert the row into BigQuery
        await bigquery
            .dataset(DATASET_ID)
            .table(TABLE_ID)
            .insert([row]);

        console.log(`Successfully inserted event '${messageData.event_name}' into BigQuery`);

    } catch (error) {
        console.error('Error processing message:', error);

        // For debugging - log the full error and message
        console.error('Full error:', JSON.stringify(error, null, 2));
        if (message.data) {
            console.error('Message data:', Buffer.from(message.data, 'base64').toString());
        }

        // Re-throw to trigger retry
        throw error;
    }
};

/**
 * Transform MongoDB-style data to GA4 event format
 */
function transformToGA4Format(data) {
    const params = [];

    // If data already has params array (from the updated log_event.js), use it
    if (data.params && Array.isArray(data.params)) {
        params.push(...data.params);
    } else {
        // Legacy support: Transform MongoDB fields to GA4 params
        const fieldsToTransform = [
            '_id', 'author', 'content', 'title', 'tags', 'category',
            'isRemoved', 'favoriteCount', 'favoritedBy', 'source'
        ];

        fieldsToTransform.forEach(field => {
            if (data[field] !== undefined && data[field] !== null) {
                const param = { key: field };
                const value = data[field];

                if (typeof value === 'string') {
                    param.string_value = value;
                } else if (typeof value === 'number' && Number.isInteger(value)) {
                    param.int_value = value;
                } else if (typeof value === 'number') {
                    param.float_value = value;
                } else if (typeof value === 'boolean') {
                    param.bool_value = value;
                } else if (value instanceof Date) {
                    param.timestamp_value = value.toISOString();
                } else if (typeof value === 'object') {
                    param.json_value = JSON.stringify(value);
                } else {
                    param.string_value = String(value);
                }

                params.push(param);
            }
        });

        // Handle date fields specifically
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

        // Add any custom parameters from the event
        if (data.customParams) {
            Object.entries(data.customParams).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    const param = { key };

                    if (typeof value === 'string') {
                        param.string_value = value;
                    } else if (typeof value === 'number' && Number.isInteger(value)) {
                        param.int_value = value;
                    } else if (typeof value === 'number') {
                        param.float_value = value;
                    } else if (typeof value === 'boolean') {
                        param.bool_value = value;
                    } else if (value instanceof Date) {
                        param.timestamp_value = value.toISOString();
                    } else if (typeof value === 'object') {
                        param.json_value = JSON.stringify(value);
                    } else {
                        param.string_value = String(value);
                    }

                    params.push(param);
                }
            });
        }
    }

    // Build the row according to the new schema
    return {
        event_id: data.event_id || generateEventId(),
        event: data.event || data.event_name || 'note_action',
        timestamp: data.timestamp || new Date(data.event_timestamp || Date.now()).toISOString(),
        user_id: data.user_id || data.author || null,
        params: params,
        user_props: data.user_props || {
            device_category: data.device_category || null,
            operating_system: data.operating_system || null,
            browser: data.browser || null,
            country: data.country || null,
            ip_address: data.ip_address || null
        }
    };
}

function generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
} 