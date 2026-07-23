import Item from '../models/Item.js';
import { syncWithGoogleCalendar } from '../services/calendarService.js';
import { sendReminderEmail } from '../services/emailService.js';
import { DateTime } from 'luxon';

// ✅ Dashboard cache for invalidation
const dashboardCache = new Map();

// Helper to get cache key
function getCacheKey(userId, timezone) {
  return `${userId.toString()}:${timezone}`;
}

// ✅ Helper to invalidate dashboard cache
export const invalidateDashboardCache = (userId) => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const key = getCacheKey(userId, timezone);
  dashboardCache.delete(key);
  console.log(`🗑️ Dashboard cache invalidated for user ${userId}`);
};

/**
 * Helper: Get timezone-aware day boundaries
 */
function getDayBoundaries(timezone) {
  const now = DateTime.now().setZone(timezone);
  const today = now.startOf('day');
  const tomorrow = today.plus({ days: 1 });
  
  const todayUTC = today.toUTC().toJSDate();
  const tomorrowUTC = tomorrow.toUTC().toJSDate();
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🌍 Timezone: ${timezone}`);
    console.log(`📅 UTC today: ${todayUTC.toISOString()}`);
    console.log(`📅 UTC tomorrow: ${tomorrowUTC.toISOString()}`);
  }
  
  return { todayUTC, tomorrowUTC };
}

/**
 * Build base query conditions
 */
function buildBaseQuery(req) {
  const userId = req.user._id;
  const now = new Date();
  const conditions = [{ userId }];

  conditions.push({
    $or: [
      { deleteAfter: null },
      { deleteAfter: { $exists: false } },
      { deleteAfter: { $gt: now } },
    ]
  });

  return conditions;
}

/**
 * Build Today filter
 */
function buildTodayFilter(req, conditions) {
  const timezone = req.query.timezone || 'UTC';
  const { todayUTC, tomorrowUTC } = getDayBoundaries(timezone);
  
  conditions.push({ status: { $nin: ['expired', 'cancelled'] } });
  
  conditions.push({
    $or: [
      { startTime: { $gte: todayUTC, $lt: tomorrowUTC } },
      { startTime: null, createdAt: { $gte: todayUTC, $lt: tomorrowUTC } },
    ]
  });
  
  return { query: { $and: conditions }, sort: { startTime: 1, createdAt: -1 } };
}

/**
 * Build Upcoming filter
 */
function buildUpcomingFilter(req, conditions) {
  const timezone = req.query.timezone || 'UTC';
  const { tomorrowUTC } = getDayBoundaries(timezone);
  
  conditions.push({ status: { $nin: ['expired', 'cancelled'] } });
  conditions.push({ startTime: { $gte: tomorrowUTC } });
  
  return { query: { $and: conditions }, sort: { startTime: 1, createdAt: -1 } };
}

/**
 * Build Completed filter
 */
function buildCompletedFilter(req, conditions) {
  conditions.push({ status: 'completed' });
  return { query: { $and: conditions }, sort: { completedAt: -1 } };
}

/**
 * Build All filter
 */
function buildAllFilter(req, conditions) {
  if (req.query.status) {
    conditions.push({ status: req.query.status });
  } else {
    conditions.push({ status: { $nin: ['cancelled', 'expired'] } });
  }
  return { query: { $and: conditions }, sort: { startTime: 1, createdAt: -1 } };
}

/**
 * @desc    Get items with filtering
 * @route   GET /api/v1/items
 */
export const getItems = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('📥 GET /api/v1/items');
      console.log('📥 Query params:', JSON.stringify(req.query, null, 2));
    }

    const conditions = buildBaseQuery(req);

    if (req.query.type) {
      const types = req.query.type.split(',');
      conditions.push({ type: { $in: types } });
    }

    if (req.query.search) {
      conditions.push({
        $or: [
          { title: { $regex: req.query.search, $options: 'i' } },
          { content: { $regex: req.query.search, $options: 'i' } },
        ],
      });
    }

    let result;
    if (req.query.today === 'true') {
      result = buildTodayFilter(req, conditions);
    } else if (req.query.upcoming === 'true') {
      result = buildUpcomingFilter(req, conditions);
    } else if (req.query.completed === 'true') {
      result = buildCompletedFilter(req, conditions);
    } else {
      result = buildAllFilter(req, conditions);
    }

    const { query, sort } = result;
    const limit = parseInt(req.query.limit) || 100;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Item.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Item.countDocuments(query),
    ]);

    if (process.env.NODE_ENV === 'development') {
      console.log('📥 Items found:', items.length);
    }

    return res.status(200).json({
      success: true,
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('❌ Get items error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch items',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

/**
 * @desc    Get single item
 * @route   GET /api/v1/items/:id
 */
export const getItem = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.user._id,
    }).lean();

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
        errorCode: 'NOT_FOUND',
      });
    }

    return res.status(200).json({ success: true, item });
  } catch (error) {
    console.error('❌ Get item error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch item',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

/**
 * @desc    Create item
 * @route   POST /api/v1/items
 */
export const createItem = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const { 
      type, title, content, status, priority, category, 
      startTime, endTime, location, repeat, 
      isClientBooking, clientName, clientEmail,
      subtasks
    } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required',
        errorCode: 'MISSING_TITLE',
      });
    }

    const itemData = {
      userId: req.user._id,
      type: type || 'Note',
      title,
      content: content || '',
      status: status || 'active',
      priority: priority || 'medium',
      category: category || 'General',
      startTime: startTime || null,
      endTime: endTime || null,
      location: location || null,
      repeat: repeat || 'none',
    };

    if (type === 'Event' && isClientBooking === true) {
      itemData.isClientBooking = true;
      itemData.clientName = clientName || null;
      itemData.clientEmail = clientEmail || null;
    }

    if (type === 'Task' && subtasks && Array.isArray(subtasks) && subtasks.length > 0) {
      itemData.subtasks = subtasks.map(text => ({ text, done: false }));
    }

    const item = new Item(itemData);
    const savedItem = await item.save();

    if (savedItem.isClientBooking && savedItem.type === 'Event') {
      savedItem.videoCallLink = `https://meet.jit.si/SayNote-${savedItem._id}`;
      await savedItem.save();
    }

    // ✅ Invalidate dashboard cache on create
    invalidateDashboardCache(req.user._id);

    return res.status(201).json({ success: true, item: savedItem });
  } catch (error) {
    console.error('❌ Create item error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create item',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

/**
 * @desc    Update item (only if not expired)
 * @route   PATCH /api/v1/items/:id
 */
export const updateItem = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
        errorCode: 'NOT_FOUND',
      });
    }

    if (item.status === 'expired' || item.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update expired items.',
        errorCode: 'ITEM_EXPIRED',
      });
    }

    if (item.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update cancelled items.',
        errorCode: 'ITEM_CANCELLED',
      });
    }

    const allowedUpdates = [
      'type', 'title', 'content', 'status', 'priority', 'category', 
      'startTime', 'endTime', 'location', 'repeat', 
      'isClientBooking', 'clientName', 'clientEmail', 'videoCallLink',
    ];
    const updates = req.body;

    let wasClientBookingEnabled = false;
    const previousStatus = item.status;

    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        item[key] = updates[key];
        if (key === 'isClientBooking' && updates[key] === true) {
          wasClientBookingEnabled = true;
        }
      }
    });

    if (wasClientBookingEnabled && item.type === 'Event') {
      item.videoCallLink = `https://meet.jit.si/SayNote-${item._id}`;
    }

    if (item.isClientBooking && !item.videoCallLink && item.type === 'Event') {
      item.videoCallLink = `https://meet.jit.si/SayNote-${item._id}`;
    }

    if (previousStatus !== 'completed' && item.status === 'completed') {
      item.completedAt = new Date();
    }

    if (previousStatus === 'completed' && item.status === 'active') {
      item.completedAt = null;
    }

    const updatedItem = await item.save();

    // ✅ Invalidate dashboard cache on update
    invalidateDashboardCache(req.user._id);

    // Send response immediately
    res.status(200).json({ success: true, item: updatedItem });

    // ✅ Background Google Calendar sync
    if (updatedItem.type === 'Event' && updatedItem.status === 'active') {
      setImmediate(async () => {
        try {
          const gcalResponse = await syncWithGoogleCalendar(updatedItem);
          if (gcalResponse && gcalResponse.googleEventId) {
            updatedItem.googleEventId = gcalResponse.googleEventId;
            updatedItem.isSynced = true;
            await updatedItem.save();
            console.log('✅ Google Calendar synced (background):', gcalResponse);
          }
        } catch (gcalError) {
          console.warn('⚠️ Google Calendar sync failed (non-fatal, background):', gcalError.message);
        }
      });
    }

    return;
  } catch (error) {
    console.error('❌ Update item error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update item',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

/**
 * @desc    Delete item (HARD DELETE)
 * @route   DELETE /api/v1/items/:id
 */
export const deleteItem = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
        errorCode: 'NOT_FOUND',
      });
    }

    await item.deleteOne();
    
    // ✅ Invalidate dashboard cache on delete
    invalidateDashboardCache(req.user._id);
    
    console.log('🗑️ Item permanently deleted:', req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Item permanently deleted',
    });
  } catch (error) {
    console.error('❌ Delete item error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete item',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

/**
 * @desc    Update item status
 * @route   PATCH /api/v1/items/:id/status
 */
export const updateItemStatus = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const { status, reschedule, new_startTime } = req.body;
    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
        errorCode: 'NOT_FOUND',
      });
    }

    if (item.status === 'expired' || item.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update expired items.',
        errorCode: 'ITEM_EXPIRED',
      });
    }

    if (reschedule && new_startTime) {
      item.startTime = new Date(new_startTime);
      item.status = 'active';
    } else if (status) {
      if (!['pending_confirmation', 'active', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status',
          errorCode: 'INVALID_STATUS',
        });
      }
      
      const previousStatus = item.status;
      item.status = status;
      
      if (previousStatus !== 'completed' && item.status === 'completed') {
        item.completedAt = new Date();
      } else if (previousStatus === 'completed' && item.status === 'active') {
        item.completedAt = null;
      }
    }

    const updatedItem = await item.save();

    // ✅ Invalidate dashboard cache on status update
    invalidateDashboardCache(req.user._id);

    return res.status(200).json({ success: true, item: updatedItem });
  } catch (error) {
    console.error('❌ Update status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update status',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

/**
 * @desc    Confirm item (voice flow) - Optimized with findOneAndUpdate
 * @route   POST /api/v1/items/confirm
 */
export const confirmItem = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const { itemId, action, editedData } = req.body;

    if (!itemId || !action) {
      return res.status(400).json({
        success: false,
        message: 'Item ID and action are required',
        errorCode: 'MISSING_PARAMS',
      });
    }

    if (action === 'cancel') {
      // ✅ Optimized: findOneAndUpdate for cancel
      const updatedItem = await Item.findOneAndUpdate(
        {
          _id: itemId,
          userId: req.user._id,
          status: { $nin: ['expired', 'cancelled'] },
        },
        {
          $set: { status: 'cancelled' },
        },
        {
          new: true,
        }
      );

      if (!updatedItem) {
        return res.status(404).json({
          success: false,
          message: 'Item not found or already cancelled/expired',
          errorCode: 'NOT_FOUND',
        });
      }

      invalidateDashboardCache(req.user._id);

      return res.status(200).json({
        success: true,
        message: 'Item cancelled',
        item: updatedItem,
      });
    }

    if (action === 'save') {
      // ✅ Build update object
      const updateData = {
        status: 'active',
      };

      if (editedData) {
        const allowed = ['type', 'title', 'content', 'startTime', 'endTime', 'priority', 'category'];
        Object.keys(editedData).forEach(key => {
          if (allowed.includes(key) && editedData[key] !== undefined) {
            updateData[key] = editedData[key];
          }
        });
      }

      // ✅ Optimized: findOneAndUpdate for save
      const updatedItem = await Item.findOneAndUpdate(
        {
          _id: itemId,
          userId: req.user._id,
          status: { $nin: ['expired', 'cancelled'] },
        },
        {
          $set: updateData,
        },
        {
          new: true,
        }
      );

      if (!updatedItem) {
        return res.status(404).json({
          success: false,
          message: 'Item not found or already cancelled/expired',
          errorCode: 'NOT_FOUND',
        });
      }

      console.log('✅ Item confirmed:', updatedItem._id);

      // ✅ Invalidate dashboard cache
      invalidateDashboardCache(req.user._id);

      // Send response immediately
      res.status(200).json({ success: true, item: updatedItem });

      // ✅ Background Google Calendar sync
      if (updatedItem.type === 'Event') {
        setImmediate(async () => {
          try {
            const gcalResponse = await syncWithGoogleCalendar(updatedItem);
            if (gcalResponse && gcalResponse.googleEventId) {
              updatedItem.googleEventId = gcalResponse.googleEventId;
              updatedItem.isSynced = true;
              await updatedItem.save();
              console.log('✅ Google Calendar synced (background):', gcalResponse);
            }
          } catch (gcalError) {
            console.warn('⚠️ Google Calendar sync failed (non-fatal, background):', gcalError.message);
          }
        });
      }

      return;
    }

    return res.status(400).json({
      success: false,
      message: 'Invalid action',
      errorCode: 'INVALID_ACTION',
    });
  } catch (error) {
    console.error('❌ Confirm item error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to confirm item',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

/**
 * @desc    Send reminder email to client
 * @route   POST /api/v1/items/:id/send-reminder
 */
export const sendReminder = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const item = await Item.findOne({ _id: req.params.id, userId: req.user._id });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
        errorCode: 'NOT_FOUND',
      });
    }

    if (item.status === 'expired' || item.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send reminder for expired items.',
        errorCode: 'ITEM_EXPIRED',
      });
    }

    if (!item.isClientBooking || !item.clientEmail) {
      return res.status(400).json({
        success: false,
        message: 'This item has no client email to remind',
        errorCode: 'NO_CLIENT_EMAIL',
      });
    }

    const result = await sendReminderEmail({
      to: item.clientEmail,
      clientName: item.clientName,
      eventTitle: item.title,
      startTime: item.startTime,
      videoCallLink: item.videoCallLink,
    });

    if (!result.sent) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send email',
        errorCode: 'EMAIL_FAILED',
        reason: result.reason,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Reminder sent successfully',
    });
  } catch (error) {
    console.error('❌ Send reminder error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send reminder',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

/**
 * @desc    Get expired items
 * @route   GET /api/v1/items/expired
 */
export const getExpiredItems = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const items = await Item.find({
      userId: req.user._id,
      status: 'expired',
      deletedAt: { $ne: null },
    }).sort({ deletedAt: -1 }).lean();

    return res.status(200).json({ success: true, items });
  } catch (error) {
    console.error('❌ Get expired items error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch expired items',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

/**
 * @desc    Toggle a subtask done/undone
 * @route   PATCH /api/v1/items/:id/subtask/:index
 */
export const toggleSubtask = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found',
        errorCode: 'NOT_FOUND',
      });
    }

    if (item.status === 'expired' || item.deletedAt) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update expired items.',
        errorCode: 'ITEM_EXPIRED',
      });
    }

    const index = parseInt(req.params.index, 10);
    if (!item.subtasks || !item.subtasks[index]) {
      return res.status(404).json({
        success: false,
        message: 'Subtask not found',
        errorCode: 'SUBTASK_NOT_FOUND',
      });
    }

    item.subtasks[index].done = !item.subtasks[index].done;

    const allDone = item.subtasks.every(s => s.done);
    if (allDone && item.status !== 'completed') {
      item.status = 'completed';
      item.completedAt = new Date();
      console.log('✅ All subtasks done - auto-completing task');
    } else if (!allDone && item.status === 'completed') {
      item.status = 'active';
      item.completedAt = null;
      console.log('🔄 Subtask unchecked - reopening task');
    }

    const updated = await item.save();

    // ✅ Invalidate dashboard cache on subtask toggle
    invalidateDashboardCache(req.user._id);

    return res.status(200).json({ success: true, item: updated });
  } catch (error) {
    console.error('❌ Toggle subtask error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to toggle subtask',
      errorCode: 'INTERNAL_ERROR',
    });
  }
};

export default {
  getItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  updateItemStatus,
  confirmItem,
  sendReminder,
  getExpiredItems,
  toggleSubtask,
};