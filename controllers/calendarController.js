import Item from '../models/Item.js';
import { fetchGoogleCalendarEvents } from '../services/calendarService.js';

/**
 * @desc    Get calendar agenda - Merges local + Google Calendar events
 * @route   GET /api/calendar/agenda
 * @query   start_date, end_date
 */
export const getCalendarAgenda = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ 
        message: 'start_date and end_date are required' 
      });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    endDate.setUTCHours(23, 59, 59, 999);

    console.log(`📅 Fetching calendar events from ${startDate} to ${endDate}`);

    // ✅ Get local items - ALL types (Note, Task, Reminder, Event)
    const localEvents = await Item.find({
      userId: req.user._id,
      status: 'active', // ✅ HARD filter - ONLY active items
      $or: [
        { startTime: { $gte: startDate, $lte: endDate } },
        { endTime: { $gte: startDate, $lte: endDate } },
        // ✅ Also include items with no scheduled time, if created within this range
        { startTime: null, endTime: null, createdAt: { $gte: startDate, $lte: endDate } },
      ],
    }).sort({ startTime: 1 });

    console.log(`📦 Local events found: ${localEvents.length}`);
    console.log(`📦 Event statuses:`, localEvents.map(e => ({ 
      title: e.title, 
      type: e.type,
      status: e.status,
      startTime: e.startTime,
      createdAt: e.createdAt
    })));

    // ✅ 2. Get Google Calendar events
    let googleEvents = [];
    try {
      googleEvents = await fetchGoogleCalendarEvents(req.user._id, startDate, endDate);
      console.log(`📅 Google events found: ${googleEvents.length}`);
    } catch (error) {
      console.error('❌ Google Calendar fetch error:', error.message);
    }

    // ✅ 3. Deduplicate: Remove Google events that already exist locally
    const localGoogleEventIds = new Set(
      localEvents
        .filter(e => e.googleEventId)
        .map(e => e.googleEventId)
    );

    const uniqueGoogleEvents = googleEvents.filter(
      e => !localGoogleEventIds.has(e.googleEventId)
    );

    console.log(`🔍 Unique Google events: ${uniqueGoogleEvents.length}`);

    // ✅ 4. Merge and format events
    const mergedEvents = [
      ...localEvents.map(e => ({
        _id: e._id,
        type: e.type,
        title: e.title,
        content: e.content || '',
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location || null,
        status: e.status,
        source: 'local',
        googleEventId: e.googleEventId || null,
        isClientBooking: e.isClientBooking || false,
        clientName: e.clientName || null,
        clientEmail: e.clientEmail || null,
        videoCallLink: e.videoCallLink || null,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      })),
      ...uniqueGoogleEvents.map(e => ({
        _id: `google_${e.googleEventId}`,
        type: 'Event',
        title: e.title || 'Untitled Event',
        content: e.content || '',
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location || null,
        status: 'active',
        source: 'google',
        googleEventId: e.googleEventId,
        isSynced: true,
        googleData: e.googleData || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
    ];

    // ✅ 5. Sort chronologically by startTime
    const sortedEvents = mergedEvents.sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime) : new Date(0);
      const bTime = b.startTime ? new Date(b.startTime) : new Date(0);
      return aTime - bTime;
    });

    console.log(`✅ Total events returned: ${sortedEvents.length}`);

    res.status(200).json({
      start_date,
      end_date,
      total: sortedEvents.length,
      items: sortedEvents,
    });

  } catch (error) {
    console.error('❌ Calendar agenda error:', error);
    res.status(500).json({ 
      message: 'Server Error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

/**
 * @desc    Sync a local event to Google Calendar
 * @route   POST /api/calendar/sync
 */
export const syncEventToGoogle = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { eventId } = req.body;

    if (!eventId) {
      return res.status(400).json({ message: 'eventId is required' });
    }

    const event = await Item.findOne({
      _id: eventId,
      userId: req.user._id,
      type: 'Event',
    });

    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const { syncWithGoogleCalendar } = await import('../services/calendarService.js');
    const result = await syncWithGoogleCalendar(event);

    if (result.googleEventId) {
      event.googleEventId = result.googleEventId;
      event.isSynced = true;
      await event.save();
    }

    res.status(200).json({
      success: !!result.googleEventId,
      googleEventId: result.googleEventId,
      event: event,
    });

  } catch (error) {
    console.error('❌ Sync error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};