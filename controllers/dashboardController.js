import Item from '../models/Item.js';
import { generateBriefingTextService } from '../services/aiService.js';
import { DateTime } from 'luxon';

/**
 * Helper: Get timezone-aware day boundaries (same as itemController)
 */
function getDayBoundaries(timezone) {
  const now = DateTime.now().setZone(timezone);
  const today = now.startOf('day');
  const tomorrow = today.plus({ days: 1 });
  
  const todayUTC = today.toUTC().toJSDate();
  const tomorrowUTC = tomorrow.toUTC().toJSDate();
  
  console.log(`🌍 Dashboard Timezone: ${timezone}`);
  console.log(`📅 UTC today: ${todayUTC.toISOString()}`);
  console.log(`📅 UTC tomorrow: ${tomorrowUTC.toISOString()}`);
  
  return { todayUTC, tomorrowUTC };
}

/**
 * @desc    Get dashboard data with AI-generated summary
 * @route   GET /api/dashboard
 * @access  Private
 */
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
    
    // ✅ Get timezone from query params (sent from frontend)
    const timezone = req.query.timezone || 'UTC';
    const { todayUTC, tomorrowUTC } = getDayBoundaries(timezone);

    // ✅ Get next week boundary
    const nextWeek = new Date(todayUTC);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // ✅ Base filter for active items (excludes expired)
    const activeFilter = {
      userId,
      status: 'active',
      $and: [
        {
          $or: [
            { deleteAfter: null },
            { deleteAfter: { $exists: false } },
            { deleteAfter: { $gt: now } }
          ]
        }
      ]
    };

    // ✅ Base filter for all active items (for stats)
    const statsFilter = {
      userId,
      status: 'active',
      $and: [
        {
          $or: [
            { deleteAfter: null },
            { deleteAfter: { $exists: false } },
            { deleteAfter: { $gt: now } }
          ]
        }
      ]
    };

    // ✅ Get today's items (active items for today)
    const todayItems = await Item.find({
      ...activeFilter,
      $or: [
        { startTime: { $gte: todayUTC, $lt: tomorrowUTC } },
        { startTime: null, createdAt: { $gte: todayUTC, $lt: tomorrowUTC } }
      ]
    }).sort({ startTime: 1 });

    // ✅ Get stats - apply deleteAfter filter to all counts
    const stats = {
      total: await Item.countDocuments(statsFilter),
      tasks: await Item.countDocuments({ 
        ...statsFilter, 
        type: 'Task' 
      }),
      events: await Item.countDocuments({ 
        ...statsFilter, 
        type: 'Event' 
      }),
      notes: await Item.countDocuments({ 
        ...statsFilter, 
        type: 'Note' 
      }),
      reminders: await Item.countDocuments({ 
        ...statsFilter, 
        type: 'Reminder' 
      }),
      completed: await Item.countDocuments({ 
        userId, 
        status: 'completed',
        $and: [
          {
            $or: [
              { deleteAfter: null },
              { deleteAfter: { $exists: false } },
              { deleteAfter: { $gt: now } }
            ]
          }
        ]
      }),
      expired: await Item.countDocuments({ 
        userId, 
        status: 'expired' 
      }),
    };

    // ✅ Get upcoming items (next 7 days)
    const upcomingItems = await Item.find({
      ...activeFilter,
      startTime: { $gte: tomorrowUTC, $lt: nextWeek }
    }).sort({ startTime: 1 }).limit(10);

    // ✅ Get recent completed items
    const recentCompleted = await Item.find({
      userId,
      status: 'completed',
      $and: [
        {
          $or: [
            { deleteAfter: null },
            { deleteAfter: { $exists: false } },
            { deleteAfter: { $gt: now } }
          ]
        }
      ]
    })
      .sort({ completedAt: -1 })
      .limit(5)
      .select('title type completedAt');

    // ✅ Generate AI summary
    let summary = 'Good morning! You have no items scheduled for today.';
    try {
      if (todayItems.length > 0) {
        summary = await generateBriefingTextService(todayItems);
      } else {
        // Check if there are any active items
        const hasActiveItems = await Item.countDocuments(statsFilter);
        if (hasActiveItems > 0) {
          summary = `You have ${hasActiveItems} active items. None are scheduled for today.`;
        } else {
          summary = 'You have no active items. Create your first task or note!';
        }
      }
    } catch (aiError) {
      console.error('❌ AI summary generation failed:', aiError);
      summary = `You have ${todayItems.length} items scheduled for today.`;
    }

    res.status(200).json({
      success: true,
      summary,
      stats,
      todayItems: todayItems.slice(0, 10),
      upcomingItems,
      recentCompleted,
      hasTodayItems: todayItems.length > 0,
    });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server Error',
      errorCode: 'INTERNAL_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};