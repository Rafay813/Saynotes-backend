import Item from '../models/Item.js';
import { generateBriefingTextService } from '../services/aiService.js';

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

    // ✅ Get today's items
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
    };

    // ✅ Generate summary
    const summary = await generateBriefingTextService(todayItems);

    res.status(200).json({
      summary,
      stats,
      todayItems: todayItems.slice(0, 10),
    });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};