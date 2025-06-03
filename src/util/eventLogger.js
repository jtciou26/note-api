const { PubSub } = require('@google-cloud/pubsub');

// Initialize Pub/Sub client
const pubsub = new PubSub();

const TOPIC_NAME = 'event_logs'; // Your topic name

class EventLogger {
    constructor() {
        this.topic = null;
        this.init();
    }

    async init() {
        try {
            // Get the existing topic (assuming it already exists as you mentioned)
            this.topic = pubsub.topic(TOPIC_NAME);
            console.log(`Event logger initialized with topic: ${TOPIC_NAME}`);
        } catch (error) {
            console.error('Error initializing Pub/Sub topic:', error);
        }
    }

    async logEvent(eventName, data, userContext = {}) {
        if (!this.topic) {
            console.error('Pub/Sub topic not initialized');
            return;
        }

        try {
            const eventData = {
                event_id: this.generateEventId(),
                event_name: eventName,
                timestamp: new Date().toISOString(),
                user_id: userContext.userId || data?.author || null,
                event_data: data,
                user_context: {
                    ip_address: userContext.ipAddress || null,
                    user_agent: userContext.userAgent || null,
                    device_category: this.getDeviceCategory(userContext.userAgent),
                    operating_system: this.getOperatingSystem(userContext.userAgent),
                    browser: this.getBrowser(userContext.userAgent)
                }
            };

            const message = Buffer.from(JSON.stringify(eventData));
            const messageId = await this.topic.publishMessage({ data: message });
            console.log(`Event '${eventName}' published with ID: ${messageId}`);

        } catch (error) {
            console.error('Error publishing event to Pub/Sub:', error);
        }
    }

    // Specific method for note creation events
    async logNoteCreated(noteData, userContext) {
        const eventData = {
            note_id: noteData.id || noteData._id,
            content_length: noteData.content?.length || 0,
            author_id: noteData.author,
            created_at: noteData.createdAt || new Date().toISOString(),
            favorite_count: noteData.favoriteCount || 0
        };

        await this.logEvent('note_created', eventData, userContext);
    }

    async logNoteUpdated(noteData, userContext) {
        const eventData = {
            note_id: noteData.id || noteData._id,
            content_length: noteData.content?.length || 0,
            author_id: noteData.author,
            updated_at: noteData.updatedAt || new Date().toISOString()
        };

        await this.logEvent('note_updated', eventData, userContext);
    }

    async logNoteDeleted(noteData, userContext) {
        const eventData = {
            note_id: noteData.id || noteData._id,
            author_id: noteData.author,
            deleted_at: new Date().toISOString()
        };

        await this.logEvent('note_deleted', eventData, userContext);
    }

    generateEventId() {
        return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    getDeviceCategory(userAgent) {
        if (!userAgent) return null;

        const ua = userAgent.toLowerCase();
        if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
            return 'mobile';
        } else if (ua.includes('tablet') || ua.includes('ipad')) {
            return 'tablet';
        }
        return 'desktop';
    }

    getOperatingSystem(userAgent) {
        if (!userAgent) return null;

        const ua = userAgent.toLowerCase();
        if (ua.includes('windows')) return 'Windows';
        if (ua.includes('macintosh') || ua.includes('mac os')) return 'macOS';
        if (ua.includes('linux')) return 'Linux';
        if (ua.includes('android')) return 'Android';
        if (ua.includes('iphone') || ua.includes('ipad')) return 'iOS';

        return 'Unknown';
    }

    getBrowser(userAgent) {
        if (!userAgent) return null;

        const ua = userAgent.toLowerCase();
        if (ua.includes('chrome') && !ua.includes('edg')) return 'Chrome';
        if (ua.includes('firefox')) return 'Firefox';
        if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
        if (ua.includes('edg')) return 'Edge';
        if (ua.includes('opera')) return 'Opera';

        return 'Unknown';
    }
}

// Create singleton instance
const eventLogger = new EventLogger();

module.exports = {
    eventLogger
}; 