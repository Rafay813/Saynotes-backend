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

// In-memory cache
const dashboardCache = new Map();
const CACHE_TTL_MS = 30 * 1000;

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

    // Serve from cache
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return res.status(200).json({ ...cached.data, fromCache: true });
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

    // Run everything concurrently
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
      }).select(LIST_FIELDS).sort({ startTime: 1 }).limit(10).lean(),

      Item.countDocuments(activeFilter),
      Item.countDocuments({ ...activeFilter, type: 'Task' }),
      Item.countDocuments({ ...activeFilter, type: 'Event' }),
      Item.countDocuments({ ...activeFilter, type: 'Note' }),
      Item.countDocuments({ ...activeFilter, type: 'Reminder' }),
      Item.countDocuments({ userId, status: 'completed', ...notExpiredClause }),

      Item.find({
        ...activeFilter,
        startTime: { $gte: tomorrowUTC, $lt: nextWeek },
      }).select(LIST_FIELDS).sort({ startTime: 1 }).limit(10).lean(),

      Item.find({ userId, status: 'completed', ...notExpiredClause })
        .select('title type completedAt')
        .sort({ completedAt: -1 })
        .limit(5)
        .lean(),
    ]);

    const stats = { total, tasks, events, notes, reminders, completed, expired: 0 };

    let summary = 'Good morning! You have no items scheduled for today.';
    try {
      if (todayItems.length > 0) {
        summary = await generateBriefingTextService(todayItems);
      } else if (total > 0) {
        summary = `You have ${total} active items. None are scheduled for today.`;
      } else {
        summary = 'You have no active items. Create your first task or note!';
      }
    } catch (aiError) {
      console.error('AI summary generation failed:', aiError);
      summary = `You have ${todayItems.length} items scheduled for today.`;
    }

    const responseData = {
      success: true,
      summary,
      stats,
      todayItems,
      upcomingItems,
      recentCompleted,
      hasTodayItems: todayItems.length > 0,
    };

    dashboardCache.set(cacheKey, { data: responseData, timestamp: Date.now() });

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