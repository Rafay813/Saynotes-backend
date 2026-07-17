import Item from '../models/Item.js';
import { generateBriefingTextService } from '../services/aiService.js';

/**
 * @desc    Get dashboard data with AI-generated summary
 * @route   GET /api/dashboard
 * @access  Private
 */
export const getDashboard = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const userId = req.user._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // ✅ Get today's items (active items for today)
    const todayItems = await Item.find({
      userId,
      status: 'active',
      $or: [
        { startTime: { $gte: today, $lt: tomorrow } },
        { createdAt: { $gte: today, $lt: tomorrow }, startTime: null }
      ]
    }).sort({ startTime: 1 });

    // ✅ Get stats
    const stats = {
      total: await Item.countDocuments({ userId, status: 'active' }),
      tasks: await Item.countDocuments({ userId, type: 'Task', status: 'active' }),
      events: await Item.countDocuments({ userId, type: 'Event', status: 'active' }),
      notes: await Item.countDocuments({ userId, type: 'Note', status: 'active' }),
      reminders: await Item.countDocuments({ userId, type: 'Reminder', status: 'active' }),
      completed: await Item.countDocuments({ userId, status: 'completed' }),
      expired: await Item.countDocuments({ userId, status: 'expired' }),
    };

    // ✅ Get upcoming items (next 7 days)
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const upcomingItems = await Item.find({
      userId,
      status: 'active',
      startTime: { $gte: tomorrow, $lt: nextWeek }
    }).sort({ startTime: 1 }).limit(10);

    // ✅ Get recent completed items
    const recentCompleted = await Item.find({
      userId,
      status: 'completed'
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
        const hasActiveItems = await Item.countDocuments({ 
          userId, 
          status: 'active' 
        });
        if (hasActiveItems > 0) {
          summary = `You have ${hasActiveItems} active items. None are scheduled for today.`;
        } else {
          summary = 'You have no active items. Create your first task or note!';
        }
      }
    } catch (aiError) {
      console.error('❌ AI summary generation failed:', aiError);
      // Fallback summary
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
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};