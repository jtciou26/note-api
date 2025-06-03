const { BigQuery } = require('@google-cloud/bigquery');

// Initialize BigQuery client
const bigquery = new BigQuery();

// Your BigQuery dataset and table
const DATASET_ID = 'logs';
const TABLE_ID = 'events';

/**
 * Cloud Run function triggered by Pub/Sub messages
 * Handles HTTP POST requests containing Pub/Sub message data
 */
exports.pubsubToBigQuery = async (req, res) => {
    try {
        // Validate the request
        if (req.method !== 'POST') {
            console.error('Only POST requests are accepted');
            return res.status(405).send('Only POST requests are accepted');
        }

        // Validate that this is a valid Pub/Sub message
        if (!req.body || !req.body.message) {
            console.error('Bad Request: no Pub/Sub message received');
            return res.status(400).send('Bad Request: no Pub/Sub message received');
        }

        const pubsubMessage = req.body.message;

        // Decode the Pub/Sub message data
        let eventData;
        try {
            const messageData = pubsubMessage.data
                ? Buffer.from(pubsubMessage.data, 'base64').toString()
                : '{}';
            eventData = JSON.parse(messageData);
            console.log('Received event data:', JSON.stringify(eventData, null, 2));
        } catch (parseError) {
            console.error('Error parsing message data:', parseError);
            return res.status(400).send('Invalid JSON in message data');
        }

        // Validate required fields according to BigQuery schema
        // Handle both old format (event) and new format (event_name)
        const eventName = eventData.event || eventData.event_name;
        if (!eventData.event_id || !eventName || !eventData.timestamp) {
            console.error('Missing required fields in event data');
            return res.status(400).send('Missing required fields: event_id, event/event_name, timestamp');
        }

        // Transform and validate the data for BigQuery insertion
        const transformedData = transformEventData(eventData);

        // Insert data into BigQuery
        await insertIntoBigQuery(transformedData);

        console.log(`Successfully processed event: ${eventData.event_id}`);
        res.status(200).send('Event processed successfully');

    } catch (error) {
        console.error('Error processing Pub/Sub message:', error);
        res.status(500).send('Internal server error');
    }
};

/**
 * Transform event data to match BigQuery schema
 */
function transformEventData(eventData) {
    const transformed = {
        event_id: eventData.event_id,
        event: eventData.event || eventData.event_name, // Handle both formats
        timestamp: eventData.timestamp,
        user_id: eventData.user_id || null,
        params: [],
        user_props: null
    };

    // Transform params array if present (old format)
    if (eventData.params && Array.isArray(eventData.params)) {
        transformed.params = eventData.params.map(param => {
            const transformedParam = { key: param.key };

            // Add only the relevant value field based on what's provided
            if (param.string_value !== undefined) transformedParam.string_value = param.string_value;
            if (param.int_value !== undefined) transformedParam.int_value = param.int_value;
            if (param.float_value !== undefined) transformedParam.float_value = param.float_value;
            if (param.double_value !== undefined) transformedParam.double_value = param.double_value;
            if (param.bool_value !== undefined) transformedParam.bool_value = param.bool_value;
            if (param.timestamp_value !== undefined) transformedParam.timestamp_value = param.timestamp_value;
            if (param.json_value !== undefined) transformedParam.json_value = param.json_value;

            return transformedParam;
        });
    }

    // Transform event_data object to params array (new format)
    if (eventData.event_data && typeof eventData.event_data === 'object') {
        Object.entries(eventData.event_data).forEach(([key, value]) => {
            if (value === null || value === undefined) {
                return; // Skip null/undefined values
            }

            const param = { key };

            // Determine the appropriate value type based on the value
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
                // Default to string for other types
                param.string_value = String(value);
            }

            transformed.params.push(param);
        });
    }

    // Transform user_props if present (old format)
    if (eventData.user_props) {
        transformed.user_props = {
            device_category: eventData.user_props.device_category || null,
            operating_system: eventData.user_props.operating_system || null,
            browser: eventData.user_props.browser || null,
            country: eventData.user_props.country || null,
            ip_address: eventData.user_props.ip_address || null
        };
    }

    // Transform user_context to user_props (new format)
    if (eventData.user_context) {
        transformed.user_props = {
            device_category: eventData.user_context.device_category || null,
            operating_system: eventData.user_context.operating_system || null,
            browser: eventData.user_context.browser || null,
            country: eventData.user_context.country || null,
            ip_address: eventData.user_context.ip_address || null
        };
    }

    return transformed;
}

/**
 * Insert data into BigQuery
 */
async function insertIntoBigQuery(data) {
    try {
        const dataset = bigquery.dataset(DATASET_ID);
        const table = dataset.table(TABLE_ID);

        // Insert the row
        const [insertErrors] = await table.insert([data], {
            // Skip invalid rows and continue with valid ones
            skipInvalidRows: false,
            // Don't ignore unknown values - this helps catch schema mismatches
            ignoreUnknownValues: false,
        });

        if (insertErrors && insertErrors.length > 0) {
            console.error('BigQuery insert errors:', JSON.stringify(insertErrors, null, 2));
            throw new Error(`BigQuery insert failed: ${insertErrors.map(err => err.message).join(', ')}`);
        }

        console.log(`Successfully inserted event ${data.event_id} into BigQuery`);

    } catch (error) {
        console.error('Error inserting into BigQuery:', error);

        // Check if it's a table not found error
        if (error.message && error.message.includes('Not found: Table')) {
            console.error(`Table ${DATASET_ID}.${TABLE_ID} not found. Please ensure it exists.`);
        }

        throw error;
    }
}

/**
 * Health check endpoint for Cloud Run
 */
exports.healthCheck = (req, res) => {
    res.status(200).send('OK');
};

// For local testing - export the main function with different name for HTTP trigger
if (process.env.NODE_ENV === 'development') {
    exports.main = exports.pubsubToBigQuery;
}
