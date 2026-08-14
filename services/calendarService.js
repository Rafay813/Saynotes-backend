import { google } from "googleapis";
import User from "../models/User.js";
import Item from "../models/Item.js";

// ✅ Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

// ✅ Initialize Calendar API
const calendar = google.calendar({
  version: "v3",
  auth: oauth2Client,
});

/**
 * Get Google Calendar events for a user
 * ✅ FIXED: Returns raw Google events WITHOUT creating duplicates
 */
export const fetchGoogleCalendarEvents = async (userId, startDate, endDate) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.googleAccessToken) {
      console.log("⚠️ No Google token found for user");
      return [];
    }

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    });

    const response = await calendar.events.list({
      calendarId: "primary",
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
    });

    const events = response.data.items || [];
    console.log(`📅 Google Calendar: Fetched ${events.length} events`);

    return events.map((event) => ({
      googleEventId: event.id,
      title: event.summary || "Untitled Event",
      content: event.description || "",
      startTime: event.start?.dateTime || event.start?.date,
      endTime: event.end?.dateTime || event.end?.date,
      location: event.location || null,
      status: event.status === "cancelled" ? "cancelled" : "active",
      source: "google",
      isSynced: true,
      googleData: {
        htmlLink: event.htmlLink,
        hangoutLink: event.hangoutLink,
        creator: event.creator,
        organizer: event.organizer,
        attendees: event.attendees || [],
        reminders: event.reminders,
      },
    }));
  } catch (error) {
    console.error("❌ Google Calendar fetch error:", error.message);
    return [];
  }
};

/**
 * ✅ NEW: Sync Google Calendar events to database WITHOUT duplicates
 * This should be called periodically (e.g., on dashboard load)
 */
export const syncGoogleEventsToDatabase = async (userId, startDate, endDate) => {
  try {
    console.log(`🔄 Syncing Google Calendar events for user ${userId}`);
    
    // Fetch raw Google events
    const googleEvents = await fetchGoogleCalendarEvents(userId, startDate, endDate);
    if (googleEvents.length === 0) {
      console.log('📭 No Google events to sync');
      return { added: 0, updated: 0, deleted: 0 };
    }

    // ✅ Get existing events with googleEventId
    const existingEvents = await Item.find({
      userId: userId,
      googleEventId: { $ne: null },
      type: 'Event',
    }).select('googleEventId title startTime endTime status').lean();

    const existingMap = new Map();
    existingEvents.forEach(e => existingMap.set(e.googleEventId, e));

    let added = 0;
    let updated = 0;
    let deleted = 0;

    // ✅ Process each Google event
    for (const googleEvent of googleEvents) {
      const existing = existingMap.get(googleEvent.googleEventId);

      if (!existing) {
        // ✅ NEW EVENT - Create it
        await Item.create({
          userId: userId,
          type: 'Event',
          title: googleEvent.title,
          content: googleEvent.content || `Google Calendar Event: ${googleEvent.title}`,
          startTime: googleEvent.startTime ? new Date(googleEvent.startTime) : null,
          endTime: googleEvent.endTime ? new Date(googleEvent.endTime) : null,
          location: googleEvent.location || null,
          status: googleEvent.status === 'cancelled' ? 'cancelled' : 'active',
          googleEventId: googleEvent.googleEventId,
          googleHtmlLink: googleEvent.googleData?.htmlLink || null, // ✅ Capture htmlLink on initial database sync
          isSynced: true,
          category: 'Google Calendar',
          priority: 'medium',
        });
        added++;
        console.log(`✅ Added Google event: ${googleEvent.title}`);
      } else {
        // ✅ EXISTING EVENT - Check if updated
        const needsUpdate = 
          existing.title !== googleEvent.title ||
          (existing.startTime?.toString() !== (googleEvent.startTime ? new Date(googleEvent.startTime).toString() : null)) ||
          (existing.endTime?.toString() !== (googleEvent.endTime ? new Date(googleEvent.endTime).toString() : null)) ||
          existing.location !== googleEvent.location ||
          existing.status !== (googleEvent.status === 'cancelled' ? 'cancelled' : 'active');

        if (needsUpdate) {
          await Item.findByIdAndUpdate(existing._id, {
            title: googleEvent.title,
            content: googleEvent.content || `Google Calendar Event: ${googleEvent.title}`,
            startTime: googleEvent.startTime ? new Date(googleEvent.startTime) : null,
            endTime: googleEvent.endTime ? new Date(googleEvent.endTime) : null,
            location: googleEvent.location || null,
            status: googleEvent.status === 'cancelled' ? 'cancelled' : 'active',
            googleHtmlLink: googleEvent.googleData?.htmlLink || null, // ✅ Keep link fresh
          });
          updated++;
          console.log(`🔄 Updated Google event: ${googleEvent.title}`);
        }
      }
    }

    // ✅ Delete events that no longer exist in Google Calendar
    const googleEventIds = new Set(googleEvents.map(e => e.googleEventId));
    const eventsToDelete = existingEvents.filter(e => !googleEventIds.has(e.googleEventId));
    
    if (eventsToDelete.length > 0) {
      await Item.deleteMany({
        _id: { $in: eventsToDelete.map(e => e._id) }
      });
      deleted = eventsToDelete.length;
      console.log(`🗑️ Deleted ${deleted} events no longer in Google Calendar`);
    }

    console.log(`📊 Sync complete: +${added} added, 🔄${updated} updated, 🗑️${deleted} deleted`);
    return { added, updated, deleted };

  } catch (error) {
    console.error('❌ Google Calendar sync to database error:', error.message);
    return { added: 0, updated: 0, deleted: 0 };
  }
};

/**
 * Sync a local item with Google Calendar
 */
export const syncWithGoogleCalendar = async (item) => {
  try {
    const user = await User.findById(item.userId);
    if (!user || !user.googleAccessToken) {
      console.log("⚠️ No Google token found, skipping sync");
      return { googleEventId: null, htmlLink: null };
    }

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    });

    // ✅ Check if we have a googleEventId
    if (item.googleEventId) {
      // ✅ Update existing event
      const response = await calendar.events.update({
        calendarId: "primary",
        eventId: item.googleEventId,
        requestBody: {
          summary: item.title,
          description: item.content || "",
          start: {
            dateTime: item.startTime
              ? new Date(item.startTime).toISOString()
              : null,
            timeZone: user.timezone || "Asia/Karachi",
          },
          end: {
            dateTime: item.endTime
              ? new Date(item.endTime).toISOString()
              : null,
            timeZone: user.timezone || "Asia/Karachi",
          },
          location: item.location || "",
        },
      });

      console.log("✅ Google Calendar event updated:", response.data.id);
      return { googleEventId: response.data.id, htmlLink: response.data.htmlLink }; // ✅ Return htmlLink
    } else {
      // ✅ Create new event
      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: item.title,
          description: item.content || "",
          start: {
            dateTime: item.startTime
              ? new Date(item.startTime).toISOString()
              : null,
            timeZone: user.timezone || "Asia/Karachi",
          },
          end: {
            dateTime: item.endTime
              ? new Date(item.endTime).toISOString()
              : null,
            timeZone: user.timezone || "Asia/Karachi",
          },
          location: item.location || "",
        },
      });

      console.log("✅ Google Calendar event created:", response.data.id);
      return { googleEventId: response.data.id, htmlLink: response.data.htmlLink }; // ✅ Return htmlLink
    }
  } catch (error) {
    console.error("❌ Google Calendar sync error:", error.message);
    return { googleEventId: null, htmlLink: null };
  }
};

/**
 * Delete a Google Calendar event
 */
export const deleteGoogleCalendarEvent = async (googleEventId, userId) => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.googleAccessToken) {
      return false;
    }

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    });

    await calendar.events.delete({
      calendarId: "primary",
      eventId: googleEventId,
    });

    console.log("🗑️ Google Calendar event deleted:", googleEventId);
    return true;
  } catch (error) {
    console.error("❌ Google Calendar delete error:", error.message);
    return false;
  }
};

/**
 * Get OAuth URL for Google Calendar with userId in state
 */
export const getGoogleAuthUrl = (userId) => {
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ];

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state: userId,
    response_type: "code",
  });

  return url;
};

/**
 * Exchange authorization code for tokens
 */
export const exchangeAuthCode = async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error("❌ Auth code exchange error:", error.message);
    throw error;
  }
};

export default {
  fetchGoogleCalendarEvents,
  syncGoogleEventsToDatabase,
  syncWithGoogleCalendar,
  deleteGoogleCalendarEvent,
  getGoogleAuthUrl,
  exchangeAuthCode,
};