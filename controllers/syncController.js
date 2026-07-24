import GoogleAdapter from '../services/GoogleAdapter.js';
import Item from '../models/Item.js';

/**
 * Sync an item to Google
 */
export const syncToGoogle = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const { itemId, type } = req.body;

    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: 'Item ID is required',
      });
    }

    const item = await Item.findOne({
      _id: itemId,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
      });
    }

    let result;

    if (type === 'task' || item.type === 'Task') {
      // Sync as Google Task
      result = await GoogleAdapter.createGoogleTask(req.user._id, {
        title: item.title,
        description: item.content,
        dueDate: item.startTime,
        subtasks: item.subtasks?.map(s => s.text) || [],
      });
    } else if (type === 'event' || item.type === 'Event') {
      // Sync as Google Calendar Event
      result = await GoogleAdapter.createCalendarEvent(req.user._id, {
        title: item.title,
        description: item.content,
        startTime: item.startTime,
        endTime: item.endTime || new Date(new Date(item.startTime).getTime() + 30 * 60000),
        location: item.location,
        timezone: req.user.timezone || 'UTC',
      });
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported item type for sync',
      });
    }

    if (result.success) {
      // Update item with sync info
      if (result.googleEventId) {
        item.googleEventId = result.googleEventId;
        item.isSynced = true;
        await item.save();
      } else if (result.googleTaskId) {
        item.googleTaskId = result.googleTaskId;
        item.isSynced = true;
        await item.save();
      }

      return res.status(200).json({
        success: true,
        message: 'Item synced to Google successfully',
        result: result,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: 'Failed to sync to Google',
        error: result.error,
      });
    }
  } catch (error) {
    console.error('❌ Sync error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * Sync all active items to Google
 */
export const syncAllToGoogle = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const items = await Item.find({
      userId: req.user._id,
      status: 'active',
      isSynced: false,
    });

    const results = {
      synced: 0,
      failed: 0,
      errors: [],
    };

    for (const item of items) {
      try {
        let result;
        if (item.type === 'Task') {
          result = await GoogleAdapter.createGoogleTask(req.user._id, {
            title: item.title,
            description: item.content,
            dueDate: item.startTime,
            subtasks: item.subtasks?.map(s => s.text) || [],
          });
          if (result.success) {
            item.googleTaskId = result.googleTaskId;
            item.isSynced = true;
            await item.save();
            results.synced++;
          }
        } else if (item.type === 'Event') {
          result = await GoogleAdapter.createCalendarEvent(req.user._id, {
            title: item.title,
            description: item.content,
            startTime: item.startTime,
            endTime: item.endTime || new Date(new Date(item.startTime).getTime() + 30 * 60000),
            location: item.location,
            timezone: req.user.timezone || 'UTC',
          });
          if (result.success) {
            item.googleEventId = result.googleEventId;
            item.isSynced = true;
            await item.save();
            results.synced++;
          }
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          itemId: item._id,
          title: item.title,
          error: error.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Synced ${results.synced} items, ${results.failed} failed`,
      results,
    });
  } catch (error) {
    console.error('❌ Sync all error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

/**
 * Get Google sync status
 */
export const getSyncStatus = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const user = await User.findById(req.user._id);
    const isConnected = !!(user?.googleAccessToken);

    const syncedCount = await Item.countDocuments({
      userId: req.user._id,
      isSynced: true,
    });

    const pendingCount = await Item.countDocuments({
      userId: req.user._id,
      isSynced: false,
      status: 'active',
    });

    return res.status(200).json({
      success: true,
      connected: isConnected,
      syncedCount,
      pendingCount,
      total: syncedCount + pendingCount,
    });
  } catch (error) {
    console.error('❌ Get sync status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};