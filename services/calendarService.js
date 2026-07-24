import { google } from "googleapis";
import User from "../models/User.js";

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
      // ✅ Use the actual event title from Google Calendar
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
 * Sync a local event with Google Calendar
 */
export const syncWithGoogleCalendar = async (item) => {
  try {
    const user = await User.findById(item.userId);
    if (!user || !user.googleAccessToken) {
      console.log("⚠️ No Google token found, skipping sync");
      return { googleEventId: null };
    }

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    });

    if (item.googleEventId) {
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
            timeZone: user.timezone || "UTC",
          },
          end: {
            dateTime: item.endTime
              ? new Date(item.endTime).toISOString()
              : null,
            timeZone: user.timezone || "UTC",
          },
          location: item.location || "",
        },
      });

      console.log("✅ Google Calendar event updated:", response.data.id);
      return { googleEventId: response.data.id };
    } else {
      const response = await calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: item.title,
          description: item.content || "",
          start: {
            dateTime: item.startTime
              ? new Date(item.startTime).toISOString()
              : null,
            timeZone: user.timezone || "UTC",
          },
          end: {
            dateTime: item.endTime
              ? new Date(item.endTime).toISOString()
              : null,
            timeZone: user.timezone || "UTC",
          },
          location: item.location || "",
        },
      });

      console.log("✅ Google Calendar event created:", response.data.id);
      return { googleEventId: response.data.id };
    }
  } catch (error) {
    console.error("❌ Google Calendar sync error:", error.message);
    return { googleEventId: null };
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
  syncWithGoogleCalendar,
  deleteGoogleCalendarEvent,
  getGoogleAuthUrl,
  exchangeAuthCode,
};
