import Item from '../models/Item.js';
import { generateBriefingTextService } from '../services/aiService.js';
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
    };

    dashboardCache.set(cacheKey, { 
      data: responseData, 
      timestamp: Date.now() 
    });

    console.log(`📊 Dashboard: ${todayItems.length} today, ${total} total, ${totalOverdue} overdue`);
    
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