import Item from '../models/Item.js';
import { generateBriefingTextService } from '../services/aiService.js';
import { fetchGoogleCalendarEvents } from '../services/calendarService.js';
import { DateTime } from 'luxon';

function getDayBoundaries(timezone) {
  const now = DateTime.now().setZone(timezone);
  const today = now.startOf('day');
  const tomorrow = today.plus({ days: 1 });
  
  const todayUTC = today.toUTC().toJSDate();
  const tomorrowUTC = tomorrow.toUTC().toJSDate();
  
  console.log(`Dashboard Timezone: ${timezone}`);
  console.log(`UTC today: ${todayUTC.toISOString()}`);
  console.log(`UTC tomorrow: ${tomorrowUTC.toISOString()}`);
  
  return { todayUTC, tomorrowUTC };
}

// In-memory cache with separate summary cache
const dashboardCache = new Map();
const summaryCache = new Map();
const CACHE_TTL_MS = 30 * 1000;
const SUMMARY_TTL_MS = 5 * 60 * 1000; // 5 minutes for AI summary

// ✅ Export cache for invalidation from other controllers
export const invalidateDashboardCache = (userId) => {
  if (!userId) return;
  
  const userIdStr = userId.toString ? userId.toString() : String(userId);
  let invalidated = 0;
  
  // Invalidate all timezone variants for this user
  for (const key of dashboardCache.keys()) {
    if (key.startsWith(`${userIdStr}:`)) {
      dashboardCache.delete(key);
      invalidated++;
    }
  }
  
  // Also invalidate summary cache
  for (const key of summaryCache.keys()) {
    if (key.startsWith(`${userIdStr}:`)) {
      summaryCache.delete(key);
      invalidated++;
    }
  }
  
  if (invalidated > 0) {
    console.log(`🗑️ Dashboard cache invalidated for user ${userIdStr} (${invalidated} entries)`);
  }
  return invalidated;
};

// ✅ Helper to generate summary in background
async function generateSummaryInBackground(userId, timezone, todayItems, total) {
  const cacheKey = `${userId.toString()}:${timezone}`;
  
  try {
    let summary;
    if (todayItems.length > 0) {
      summary = await generateBriefingTextService(todayItems);
    } else if (total > 0) {
      summary = `You have ${total} active items. None are scheduled for today.`;
    } else {
      summary = 'You have no active items. Create your first task or note!';
    }
    
    summaryCache.set(cacheKey, {
      summary,
      timestamp: Date.now(),
    });
    
    console.log('✅ AI summary generated in background');
  } catch (error) {
    console.error('❌ Background summary generation failed:', error);
    summaryCache.set(cacheKey, {
      summary: `You have ${todayItems.length} items scheduled for today.`,
      timestamp: Date.now(),
    });
  }
}

/**
 * ✅ Find free time windows in user's calendar for today.
 * - Checks BOTH Google Calendar events AND existing items
 * - Uses Luxon with the actual user timezone
 * - Returns ALL windows found (past and future)
 * - Each window is capped at a MAX of 60 minutes
 * - Windows shorter than 15 minutes are dropped
 * - Past windows are marked with isPast: true
 */
async function findFreeTimeWindows(userId, timezone, date) {
  try {
    // ✅ Use Luxon with the actual user timezone
    const dt = DateTime.fromJSDate(date).setZone(timezone);
    const startOfDay = dt.startOf('day').toJSDate();
    const endOfDay = dt.endOf('day').toJSDate();
    
    console.log(`🔍 Finding free windows for ${timezone} from ${startOfDay.toISOString()} to ${endOfDay.toISOString()}`);
    
    // ✅ Fetch Google Calendar events
    const events = await fetchGoogleCalendarEvents(userId, startOfDay, endOfDay);
    console.log(`📅 Found ${events.length} calendar events`);
    
    // ✅ Fetch existing items (tasks, events, reminders) for today
    const now = new Date();
    const notExpiredClause = {
      $or: [
        { deleteAfter: null },
        { deleteAfter: { $exists: false } },
        { deleteAfter: { $gt: now } },
      ],
    };
    
    const items = await Item.find({
      userId,
      status: 'active',
      startTime: { $gte: startOfDay, $lt: endOfDay },
      ...notExpiredClause,
    })
      .select('startTime endTime type title')
      .lean();
    
    console.log(`📋 Found ${items.length} existing items for today`);
    
    // Log item details for debugging
    items.forEach((item, index) => {
      const start = item.startTime ? new Date(item.startTime).toLocaleTimeString() : 'no start';
      const end = item.endTime ? new Date(item.endTime).toLocaleTimeString() : 'not set';
      console.log(`  Item ${index + 1}: ${item.title} - ${start} to ${end}`);
    });
    
    // ✅ Combine all busy times (events + items)
    const busyTimes = [];
    
    // Add Google Calendar events
    events.forEach(e => {
      if (e.startTime && e.endTime) {
        busyTimes.push({
          start: new Date(e.startTime),
          end: new Date(e.endTime),
          source: 'calendar'
        });
      } else if (e.startTime) {
        const start = new Date(e.startTime);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        busyTimes.push({ start, end, source: 'calendar' });
      }
    });
    
    // Add items
    items.forEach(item => {
      if (item.startTime) {
        const start = new Date(item.startTime);
        let end;
        if (item.endTime) {
          end = new Date(item.endTime);
        } else {
          const duration = item.type === 'Event' ? 60 : 30;
          end = new Date(start.getTime() + duration * 60 * 1000);
        }
        busyTimes.push({ start, end, source: `item (${item.type})` });
      }
    });
    
    console.log(`📊 Total busy times: ${busyTimes.length}`);
    
    // ✅ Sort busy times by start time
    busyTimes.sort((a, b) => a.start - b.start);
    
    // ✅ Merge overlapping busy times
    const mergedBusyTimes = [];
    for (const busy of busyTimes) {
      if (mergedBusyTimes.length === 0) {
        mergedBusyTimes.push(busy);
      } else {
        const last = mergedBusyTimes[mergedBusyTimes.length - 1];
        if (busy.start <= last.end) {
          last.end = new Date(Math.max(last.end, busy.end));
        } else {
          mergedBusyTimes.push(busy);
        }
      }
    }
    
    console.log(`📊 After merging: ${mergedBusyTimes.length} busy periods`);
    mergedBusyTimes.forEach((busy, i) => {
      console.log(`  Busy ${i+1}: ${busy.start.toLocaleTimeString()} - ${busy.end.toLocaleTimeString()}`);
    });
    
    // ✅ Find free windows (gaps between busy times)
    const rawWindows = [];
    let currentTime = startOfDay;
    
    if (mergedBusyTimes.length === 0) {
      // No busy times - whole day is free
      rawWindows.push({ start: new Date(startOfDay), end: new Date(endOfDay) });
    } else {
      // Check gaps between busy periods
      for (const busy of mergedBusyTimes) {
        // Gap before this busy period
        if (busy.start > currentTime) {
          const duration = (busy.start - currentTime) / (1000 * 60);
          if (duration >= 15) {
            rawWindows.push({ start: new Date(currentTime), end: new Date(busy.start) });
          }
        }
        // Move current time to the end of this busy period
        if (busy.end > currentTime) {
          currentTime = new Date(busy.end);
        }
      }
      
      // Gap after the last busy period
      if (endOfDay > currentTime) {
        const duration = (endOfDay - currentTime) / (1000 * 60);
        if (duration >= 15) {
          rawWindows.push({ start: new Date(currentTime), end: new Date(endOfDay) });
        }
      }
    }
    
    console.log(`📊 Found ${rawWindows.length} raw windows`);
    rawWindows.forEach((w, i) => {
      const duration = (w.end - w.start) / (1000 * 60);
      console.log(`  Raw window ${i+1}: ${w.start.toLocaleTimeString()} - ${w.end.toLocaleTimeString()} (${Math.floor(duration)} min)`);
    });
    
    // ✅ Cap each window at 60 min max, drop anything under 15 min
    const MAX_WINDOW_MINUTES = 60;
    const MIN_WINDOW_MINUTES = 15;
    const now2 = new Date();
    
    const windows = rawWindows
      .map(w => {
        const rawDurationMinutes = (w.end - w.start) / (1000 * 60);
        if (rawDurationMinutes < MIN_WINDOW_MINUTES) return null;
        
        // Cap duration at MAX_WINDOW_MINUTES
        const cappedDuration = Math.min(rawDurationMinutes, MAX_WINDOW_MINUTES);
        
        // For windows longer than MAX_WINDOW_MINUTES, we need to split them into multiple 60-min windows
        const resultWindows = [];
        let currentStart = new Date(w.start);
        
        while (currentStart < w.end) {
          const remaining = (w.end - currentStart) / (1000 * 60);
          const duration = Math.min(remaining, MAX_WINDOW_MINUTES);
          const end = new Date(currentStart.getTime() + duration * 60 * 1000);
          
          // Determine if this sub-window is in the past
          const isPast = end <= now2;
          const isPartiallyPast = currentStart < now2 && end > now2;
          
          let effectiveStart = currentStart;
          let effectiveEnd = end;
          let effectiveDuration = duration;
          let isPastFlag = false;
          
          if (isPartiallyPast) {
            effectiveStart = now2;
            const remainingDuration = (end - now2) / (1000 * 60);
            if (remainingDuration < MIN_WINDOW_MINUTES) {
              currentStart = end;
              continue;
            }
            effectiveDuration = remainingDuration;
            effectiveEnd = new Date(effectiveStart.getTime() + effectiveDuration * 60 * 1000);
            isPastFlag = false;
          } else if (isPast) {
            isPastFlag = true;
          }
          
          if (effectiveDuration >= MIN_WINDOW_MINUTES) {
            resultWindows.push({
              start: effectiveStart,
              end: effectiveEnd,
              duration: Math.floor(effectiveDuration),
              isPast: isPastFlag,
              rawDuration: Math.floor(rawDurationMinutes),
            });
          }
          
          currentStart = end;
        }
        
        return resultWindows.length > 0 ? resultWindows : null;
      })
      .filter(Boolean)
      .flat()
      .sort((a, b) => a.start - b.start);
    
    // Remove duplicate windows (by checking start time)
    const uniqueWindows = [];
    const seenStarts = new Set();
    for (const w of windows) {
      const key = w.start.toISOString();
      if (!seenStarts.has(key)) {
        seenStarts.add(key);
        uniqueWindows.push(w);
      }
    }
    
    // Format for response
    const result = uniqueWindows.map(w => ({
      start: w.start.toISOString(),
      end: w.end.toISOString(),
      duration: w.duration,
      startTime: w.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      endTime: w.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      isPast: w.isPast || w.end <= new Date(),
      rawDuration: w.rawDuration,
    }));
    
    const futureCount = result.filter(w => !w.isPast).length;
    const pastCount = result.filter(w => w.isPast).length;
    
    console.log(`✅ Returning ${result.length} windows (${pastCount} past, ${futureCount} future)`);
    result.forEach((w, i) => {
      console.log(`  Window ${i+1}: ${w.startTime} - ${w.endTime} (${w.duration} min, ${w.isPast ? 'past' : 'future'})`);
    });
    
    return result;
  } catch (error) {
    console.error('❌ Error finding free time:', error);
    return [];
  }
}

export const getDashboard = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const userId = req.user._id;
    const now = new Date();
    const timezone = req.query.timezone || 'UTC';
    const cacheKey = `${userId.toString()}:${timezone}`;

    const cachedSummary = summaryCache.get(cacheKey);
    let summary = 'Good morning! You have no items scheduled for today.';
    
    if (cachedSummary && Date.now() - cachedSummary.timestamp < SUMMARY_TTL_MS) {
      summary = cachedSummary.summary;
      console.log('📦 Using cached summary');
    }

    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.status(200).json({ 
        ...cached.data, 
        summary,
        fromCache: true 
      });
    }

    const { todayUTC, tomorrowUTC } = getDayBoundaries(timezone);
    const nextWeek = new Date(todayUTC);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const notExpiredClause = {
      $or: [
        { deleteAfter: null },
        { deleteAfter: { $exists: false } },
        { deleteAfter: { $gt: now } },
      ],
    };

    const activeFilter = { userId, status: 'active', ...notExpiredClause };
    const LIST_FIELDS = 'title type status startTime endTime isClientBooking clientName subtasks createdAt';

    const [
      todayItems,
      total,
      tasks,
      events,
      notes,
      reminders,
      completed,
      upcomingItems,
      recentCompleted,
    ] = await Promise.all([
      Item.find({
        ...activeFilter,
        $or: [
          { startTime: { $gte: todayUTC, $lt: tomorrowUTC } },
          { startTime: null, createdAt: { $gte: todayUTC, $lt: tomorrowUTC } },
        ],
      }).select(LIST_FIELDS).sort({ startTime: 1 }).limit(20).lean(),

      Item.countDocuments(activeFilter),
      Item.countDocuments({ ...activeFilter, type: 'Task' }),
      Item.countDocuments({ ...activeFilter, type: 'Event' }),
      Item.countDocuments({ ...activeFilter, type: 'Note' }),
      Item.countDocuments({ ...activeFilter, type: 'Reminder' }),
      Item.countDocuments({ userId, status: 'completed', ...notExpiredClause }),

      Item.find({
        ...activeFilter,
        startTime: { $gte: tomorrowUTC, $lt: nextWeek },
      }).select(LIST_FIELDS).sort({ startTime: 1 }).limit(20).lean(),

      Item.find({ userId, status: 'completed', ...notExpiredClause })
        .select('title type completedAt')
        .sort({ completedAt: -1 })
        .limit(5)
        .lean(),
    ]);

    // ✅ FIND OVERDUE ITEMS - ALL TYPES (Task, Event, Reminder)
    const nowUTC = new Date();
    const overdueItems = await Item.find({
      userId,
      status: 'active',
      startTime: { $lt: nowUTC },
      ...notExpiredClause,
    })
      .select('title type startTime priority createdAt')
      .sort({ startTime: 1 })
      .lean();

    const overdueByType = {
      Task: overdueItems.filter(i => i.type === 'Task'),
      Event: overdueItems.filter(i => i.type === 'Event'),
      Reminder: overdueItems.filter(i => i.type === 'Reminder'),
    };

    const totalOverdue = overdueItems.length;

    // ✅ Find ALL free time windows for today (checking both calendar AND items)
    const todayDate = new Date();
    const freeWindows = await findFreeTimeWindows(userId, timezone, todayDate);

    const stats = { total, tasks, events, notes, reminders, completed, expired: 0 };

    if (!cachedSummary || Date.now() - cachedSummary.timestamp >= SUMMARY_TTL_MS) {
      generateSummaryInBackground(userId, timezone, todayItems, total);
      if (todayItems.length > 0) {
        summary = `You have ${todayItems.length} items scheduled for today.`;
      } else if (total > 0) {
        summary = `You have ${total} active items. None are scheduled for today.`;
      }
    }

    const responseData = {
      success: true,
      summary,
      stats,
      todayItems,
      upcomingItems,
      recentCompleted,
      hasTodayItems: todayItems.length > 0,
      overdueItems: overdueItems || [],
      overdueCount: totalOverdue || 0,
      overdueByType: overdueByType,
      freeWindows: freeWindows || [],
    };

    dashboardCache.set(cacheKey, { 
      data: responseData, 
      timestamp: Date.now() 
    });

    console.log(`📊 Dashboard: ${todayItems.length} today, ${total} total, ${totalOverdue} overdue, ${freeWindows.length} free windows`);
    
    res.status(200).json(responseData);
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server Error',
      errorCode: 'INTERNAL_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export default { getDashboard };