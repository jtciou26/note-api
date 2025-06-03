#!/usr/bin/env node

/**
 * Local test script for the Pub/Sub to BigQuery Cloud Run function
 * Usage: node test-local.js
 */

const axios = require('axios');

// Configuration
const FUNCTION_URL = 'http://localhost:8080'; // Local development server
const TEST_EVENTS = [
    {
        event_id: `test_${Date.now()}_1`,
        event: 'note_created',
        timestamp: new Date().toISOString(),
        user_id: 'user_123',
        params: [
            {
                key: 'note_title',
                string_value: 'My First Test Note'
            },
            {
                key: 'note_content_length',
                int_value: 245
            },
            {
                key: 'is_public',
                bool_value: false
            },
            {
                key: 'created_at',
                timestamp_value: new Date().toISOString()
            },
            {
                key: 'tags',
                json_value: JSON.stringify(['test', 'development', 'notes'])
            }
        ],
        user_props: {
            device_category: 'desktop',
            operating_system: 'macOS',
            browser: 'Chrome',
            country: 'US',
            ip_address: '192.168.1.100'
        }
    },
    {
        event_id: `test_${Date.now()}_2`,
        event: 'note_updated',
        timestamp: new Date().toISOString(),
        user_id: 'user_456',
        params: [
            {
                key: 'note_id',
                string_value: 'note_789'
            },
            {
                key: 'changes_count',
                int_value: 3
            },
            {
                key: 'update_duration_ms',
                float_value: 1250.5
            }
        ],
        user_props: {
            device_category: 'mobile',
            operating_system: 'iOS',
            browser: 'Safari',
            country: 'CA',
            ip_address: '10.0.0.50'
        }
    },
    {
        event_id: `test_${Date.now()}_3`,
        event: 'note_deleted',
        timestamp: new Date().toISOString(),
        user_id: 'user_789',
        params: [
            {
                key: 'note_id',
                string_value: 'note_456'
            },
            {
                key: 'soft_delete',
                bool_value: true
            }
        ],
        user_props: {
            device_category: 'tablet',
            operating_system: 'Android',
            browser: 'Chrome',
            country: 'UK',
            ip_address: '172.16.0.25'
        }
    }
];

/**
 * Create a Pub/Sub message format for testing
 */
function createPubSubMessage(eventData) {
    const messageData = Buffer.from(JSON.stringify(eventData)).toString('base64');
    return {
        message: {
            data: messageData,
            messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            publishTime: new Date().toISOString(),
            attributes: {}
        },
        subscription: 'projects/test-project/subscriptions/test-subscription'
    };
}

/**
 * Test a single event
 */
async function testEvent(event, index) {
    console.log(`\n--- Testing Event ${index + 1}: ${event.event} ---`);

    try {
        const pubsubMessage = createPubSubMessage(event);
        console.log('Sending event:', JSON.stringify(event, null, 2));

        const response = await axios.post(FUNCTION_URL, pubsubMessage, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        console.log(`✅ Success: ${response.status} - ${response.data}`);
        return true;

    } catch (error) {
        console.error(`❌ Error:`, error.response?.data || error.message);
        return false;
    }
}

/**
 * Test health check endpoint
 */
async function testHealthCheck() {
    console.log('\n--- Testing Health Check ---');

    try {
        const response = await axios.get(`${FUNCTION_URL}/healthCheck`);
        console.log(`✅ Health Check: ${response.status} - ${response.data}`);
        return true;
    } catch (error) {
        console.error(`❌ Health Check Failed:`, error.response?.data || error.message);
        return false;
    }
}

/**
 * Test invalid request formats
 */
async function testErrorCases() {
    console.log('\n--- Testing Error Cases ---');

    // Test invalid method
    try {
        await axios.get(FUNCTION_URL);
        console.log('❌ Should have failed with GET request');
    } catch (error) {
        if (error.response?.status === 405) {
            console.log('✅ Correctly rejected GET request with 405');
        } else {
            console.log(`❌ Unexpected error: ${error.response?.status}`);
        }
    }

    // Test missing message
    try {
        await axios.post(FUNCTION_URL, {});
        console.log('❌ Should have failed with empty body');
    } catch (error) {
        if (error.response?.status === 400) {
            console.log('✅ Correctly rejected empty body with 400');
        } else {
            console.log(`❌ Unexpected error: ${error.response?.status}`);
        }
    }

    // Test invalid event data
    try {
        const invalidMessage = createPubSubMessage({ invalid: 'data' });
        await axios.post(FUNCTION_URL, invalidMessage);
        console.log('❌ Should have failed with invalid event data');
    } catch (error) {
        if (error.response?.status === 400) {
            console.log('✅ Correctly rejected invalid event data with 400');
        } else {
            console.log(`❌ Unexpected error: ${error.response?.status}`);
        }
    }
}

/**
 * Main test runner
 */
async function runTests() {
    console.log('🧪 Starting Local Tests for Pub/Sub to BigQuery Function');
    console.log(`Function URL: ${FUNCTION_URL}`);
    console.log('Make sure the function is running locally with: npm run dev');

    let successCount = 0;
    let totalTests = 0;

    // Test health check
    totalTests++;
    if (await testHealthCheck()) {
        successCount++;
    }

    // Wait a bit before starting event tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test each event
    for (let i = 0; i < TEST_EVENTS.length; i++) {
        totalTests++;
        if (await testEvent(TEST_EVENTS[i], i)) {
            successCount++;
        }

        // Wait between tests to avoid overwhelming the function
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Test error cases
    await testErrorCases();

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`📊 Test Results: ${successCount}/${totalTests} tests passed`);

    if (successCount === totalTests) {
        console.log('🎉 All tests passed! The function is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Check the logs above for details.');
    }

    console.log('\n💡 Next steps:');
    console.log('1. Check BigQuery table for inserted data:');
    console.log('   bq query --use_legacy_sql=false "SELECT * FROM logs.events ORDER BY timestamp DESC LIMIT 10"');
    console.log('2. Deploy to Cloud Run: ./deploy.sh');
}

// Handle command line execution
if (require.main === module) {
    runTests().catch(error => {
        console.error('Test runner failed:', error);
        process.exit(1);
    });
}

module.exports = {
    runTests,
    testEvent,
    createPubSubMessage,
    TEST_EVENTS
}; 