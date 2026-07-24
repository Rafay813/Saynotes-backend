import { google } from 'googleapis';
import User from '../models/User.js';

class GoogleAdapter {
  /**
   * Get authenticated OAuth2 client
   */
  getAuthClient(accessToken, refreshToken) {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    
    return auth;
  }

  /**
   * Get user's Google tokens from database
   */
  async getUserTokens(userId) {
    const user = await User.findById(userId);
    if (!user || !user.googleAccessToken) {
      return null;
    }
    
    return {
      accessToken: user.googleAccessToken,
      refreshToken: user.googleRefreshToken,
    };
  }

  // ==================== GOOGLE CALENDAR ====================

  /**
   * Create a calendar event
   */
  async createCalendarEvent(userId, eventData) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        throw new Error('Google account not connected');
      }

      const auth = this.getAuthClient(tokens.accessToken, tokens.refreshToken);
      const calendar = google.calendar({ version: 'v3', auth });

      const requestBody = {
        summary: eventData.title,
        description: eventData.description || '',
        start: {
          dateTime: new Date(eventData.startTime).toISOString(),
          timeZone: eventData.timezone || 'UTC',
        },
        end: {
          dateTime: new Date(eventData.endTime).toISOString(),
          timeZone: eventData.timezone || 'UTC',
        },
        location: eventData.location || '',
        reminders: {
          useDefault: true,
        },
      };

      // Add attendees if provided
      if (eventData.attendees && eventData.attendees.length > 0) {
        requestBody.attendees = eventData.attendees.map(email => ({ email }));
      }

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: requestBody,
      });

      console.log('✅ Google Calendar event created:', response.data.id);
      return {
        success: true,
        googleEventId: response.data.id,
        htmlLink: response.data.htmlLink,
        event: response.data,
      };
    } catch (error) {
      console.error('❌ Google Calendar create error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update a calendar event
   */
  async updateCalendarEvent(userId, googleEventId, eventData) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        throw new Error('Google account not connected');
      }

      const auth = this.getAuthClient(tokens.accessToken, tokens.refreshToken);
      const calendar = google.calendar({ version: 'v3', auth });

      const requestBody = {
        summary: eventData.title,
        description: eventData.description || '',
        start: {
          dateTime: new Date(eventData.startTime).toISOString(),
          timeZone: eventData.timezone || 'UTC',
        },
        end: {
          dateTime: new Date(eventData.endTime).toISOString(),
          timeZone: eventData.timezone || 'UTC',
        },
        location: eventData.location || '',
      };

      const response = await calendar.events.update({
        calendarId: 'primary',
        eventId: googleEventId,
        requestBody: requestBody,
      });

      console.log('✅ Google Calendar event updated:', response.data.id);
      return {
        success: true,
        googleEventId: response.data.id,
        event: response.data,
      };
    } catch (error) {
      console.error('❌ Google Calendar update error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteCalendarEvent(userId, googleEventId) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        throw new Error('Google account not connected');
      }

      const auth = this.getAuthClient(tokens.accessToken, tokens.refreshToken);
      const calendar = google.calendar({ version: 'v3', auth });

      await calendar.events.delete({
        calendarId: 'primary',
        eventId: googleEventId,
      });

      console.log('✅ Google Calendar event deleted:', googleEventId);
      return { success: true };
    } catch (error) {
      console.error('❌ Google Calendar delete error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List calendar events
   */
  async listCalendarEvents(userId, startDate, endDate) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        throw new Error('Google account not connected');
      }

      const auth = this.getAuthClient(tokens.accessToken, tokens.refreshToken);
      const calendar = google.calendar({ version: 'v3', auth });

      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startDate ? new Date(startDate).toISOString() : undefined,
        timeMax: endDate ? new Date(endDate).toISOString() : undefined,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      });

      return {
        success: true,
        events: response.data.items || [],
      };
    } catch (error) {
      console.error('❌ Google Calendar list error:', error.message);
      return {
        success: false,
        error: error.message,
        events: [],
      };
    }
  }

  // ==================== GOOGLE TASKS ====================

  /**
   * Create a Google Task
   */
  async createGoogleTask(userId, taskData) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        throw new Error('Google account not connected');
      }

      const auth = this.getAuthClient(tokens.accessToken, tokens.refreshToken);
      const tasks = google.tasks({ version: 'v1', auth });

      // Get or create default task list
      let taskListId = '@default';
      
      // If user has a specific task list, use it
      if (taskData.taskListId) {
        taskListId = taskData.taskListId;
      }

      const requestBody = {
        title: taskData.title,
        notes: taskData.description || '',
        due: taskData.dueDate ? new Date(taskData.dueDate).toISOString() : undefined,
        status: taskData.status || 'needsAction',
      };

      // Add subtasks if provided
      if (taskData.subtasks && taskData.subtasks.length > 0) {
        // Google Tasks API doesn't support subtasks directly,
        // we'll add them as notes
        const notes = taskData.subtasks.map((s, i) => `${i + 1}. ${s}`).join('\n');
        requestBody.notes = notes;
      }

      const response = await tasks.tasks.insert({
        tasklist: taskListId,
        requestBody: requestBody,
      });

      console.log('✅ Google Task created:', response.data.id);
      return {
        success: true,
        googleTaskId: response.data.id,
        task: response.data,
      };
    } catch (error) {
      console.error('❌ Google Task create error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update a Google Task
   */
  async updateGoogleTask(userId, taskListId, googleTaskId, taskData) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        throw new Error('Google account not connected');
      }

      const auth = this.getAuthClient(tokens.accessToken, tokens.refreshToken);
      const tasks = google.tasks({ version: 'v1', auth });

      const requestBody = {
        title: taskData.title,
        notes: taskData.description || '',
        due: taskData.dueDate ? new Date(taskData.dueDate).toISOString() : undefined,
        status: taskData.status || 'needsAction',
      };

      const response = await tasks.tasks.update({
        tasklist: taskListId || '@default',
        task: googleTaskId,
        requestBody: requestBody,
      });

      console.log('✅ Google Task updated:', response.data.id);
      return {
        success: true,
        googleTaskId: response.data.id,
        task: response.data,
      };
    } catch (error) {
      console.error('❌ Google Task update error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete a Google Task
   */
  async deleteGoogleTask(userId, taskListId, googleTaskId) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        throw new Error('Google account not connected');
      }

      const auth = this.getAuthClient(tokens.accessToken, tokens.refreshToken);
      const tasks = google.tasks({ version: 'v1', auth });

      await tasks.tasks.delete({
        tasklist: taskListId || '@default',
        task: googleTaskId,
      });

      console.log('✅ Google Task deleted:', googleTaskId);
      return { success: true };
    } catch (error) {
      console.error('❌ Google Task delete error:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * List Google Tasks
   */
  async listGoogleTasks(userId, taskListId = '@default') {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        throw new Error('Google account not connected');
      }

      const auth = this.getAuthClient(tokens.accessToken, tokens.refreshToken);
      const tasks = google.tasks({ version: 'v1', auth });

      const response = await tasks.tasks.list({
        tasklist: taskListId,
        showHidden: false,
        maxResults: 100,
      });

      return {
        success: true,
        tasks: response.data.items || [],
      };
    } catch (error) {
      console.error('❌ Google Tasks list error:', error.message);
      return {
        success: false,
        error: error.message,
        tasks: [],
      };
    }
  }

  /**
   * Get all task lists
   */
  async getTaskLists(userId) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        throw new Error('Google account not connected');
      }

      const auth = this.getAuthClient(tokens.accessToken, tokens.refreshToken);
      const tasks = google.tasks({ version: 'v1', auth });

      const response = await tasks.tasklists.list();
      return {
        success: true,
        taskLists: response.data.items || [],
      };
    } catch (error) {
      console.error('❌ Google Task Lists error:', error.message);
      return {
        success: false,
        error: error.message,
        taskLists: [],
      };
    }
  }
}

export default new GoogleAdapter();