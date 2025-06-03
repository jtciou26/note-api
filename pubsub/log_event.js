const { PubSub } = require('@google-cloud/pubsub');

// Initialize Pub/Sub client
const pubsub = new PubSub({
  projectId: 'toegazer', // Replace with your GCP project ID
});

const TOPIC_NAME = 'notes-events';

class NotesEventLogger {
  constructor() {
    this.topic = null;
    this.init();
  }

  async init() {
    try {
      // Get or create the topic
      const [topics] = await pubsub.getTopics();
      const existingTopic = topics.find(topic => topic.name.includes(TOPIC_NAME));

      if (existingTopic) {
        this.topic = existingTopic;
      } else {
        const [topic] = await pubsub.createTopic(TOPIC_NAME);
        this.topic = topic;
        console.log(`Topic ${TOPIC_NAME} created.`);
      }
    } catch (error) {
      console.error('Error initializing Pub/Sub topic:', error);
    }
  }

  async logEvent(eventName, noteData, userContext = {}) {
    if (!this.topic) {
      console.error('Pub/Sub topic not initialized');
      return;
    }

    try {
      // Convert noteData and custom parameters to the params array format
      const params = [];

      // Add note data to params
      if (noteData) {
        Object.entries(noteData).forEach(([key, value]) => {
          const param = { key };

          if (value === null || value === undefined) {
            // Skip null/undefined values
            return;
          }

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

          params.push(param);
        });
      }

      // Add custom parameters to params
      if (userContext.customParams) {
        Object.entries(userContext.customParams).forEach(([key, value]) => {
          const param = { key };

          if (value === null || value === undefined) {
            return;
          }

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
        });
      }

      const eventData = {
        event_id: this.generateEventId(),
        event: eventName,
        timestamp: new Date().toISOString(),
        user_id: userContext.userId || noteData?.author || null,
        params: params,
        user_props: {
          device_category: this.getDeviceCategory(userContext.userAgent),
          operating_system: this.getOperatingSystem(userContext.userAgent),
          browser: this.getBrowser(userContext.userAgent),
          country: userContext.country || null,
          ip_address: userContext.ipAddress || null
        }
      };

      const message = Buffer.from(JSON.stringify(eventData));
      const messageId = await this.topic.publishMessage({ data: message });
      console.log(`Event '${eventName}' published with ID: ${messageId}`);

    } catch (error) {
      console.error('Error publishing event to Pub/Sub:', error);
    }
  }

  // Specific event logging methods for notes app
  async logNoteCreated(noteData, userContext) {
    await this.logEvent('note_created', noteData, userContext);
  }

  async logNoteUpdated(noteData, userContext) {
    await this.logEvent('note_updated', noteData, userContext);
  }

  async logNoteDeleted(noteData, userContext) {
    await this.logEvent('note_deleted', noteData, userContext);
  }

  async logNoteViewed(noteData, userContext) {
    await this.logEvent('note_viewed', noteData, userContext);
  }

  async logNoteFavorited(noteData, userContext) {
    await this.logEvent('note_favorited', noteData, userContext);
  }

  async logNoteUnfavorited(noteData, userContext) {
    await this.logEvent('note_unfavorited', noteData, userContext);
  }

  async logUserAction(actionName, noteData, userContext) {
    await this.logEvent(`user_${actionName}`, noteData, userContext);
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
const notesLogger = new NotesEventLogger();

// Express middleware to capture user context
function captureUserContext(req, res, next) {
  req.userContext = {
    userId: req.user?.id || req.headers['x-user-id'],
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    country: req.headers['cf-ipcountry'] || req.headers['x-country'], // From CloudFlare or other CDN
    customParams: {}
  };
  next();
}

module.exports = {
  notesLogger,
  captureUserContext,
  NotesEventLogger
};

// Example usage in your Express routes:
/*
const express = require('express');
const { notesLogger, captureUserContext } = require('./notes-event-logger');

const app = express();

// Apply the middleware to capture user context
app.use(captureUserContext);

// Example routes with event logging
app.post('/api/notes', async (req, res) => {
  try {
    // Create the note in MongoDB
    const newNote = await createNoteInMongoDB(req.body);
    
    // Log the event
    await notesLogger.logNoteCreated(newNote, req.userContext);
    
    res.json({ success: true, note: newNote });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/notes/:id', async (req, res) => {
  try {
    const updatedNote = await updateNoteInMongoDB(req.params.id, req.body);
    
    // Log the event with the updated note data
    await notesLogger.logNoteUpdated(updatedNote, req.userContext);
    
    res.json({ success: true, note: updatedNote });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/notes/:id/favorite', async (req, res) => {
  try {
    const note = await addFavoriteToNote(req.params.id, req.userContext.userId);
    
    // Log the favorite event
    await notesLogger.logNoteFavorited(note, req.userContext);
    
    res.json({ success: true, note });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Log custom events with additional parameters
app.post('/api/notes/:id/share', async (req, res) => {
  try {
    const note = await getNoteById(req.params.id);
    
    // Add custom parameters for sharing event
    const contextWithCustomParams = {
      ...req.userContext,
      customParams: {
        share_method: req.body.method, // email, link, social
        recipient_count: req.body.recipients?.length || 0
      }
    };
    
    await notesLogger.logUserAction('share_note', note, contextWithCustomParams);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
*/