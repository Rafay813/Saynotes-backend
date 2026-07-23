import Item from '../models/Item.js';
import { syncWithGoogleCalendar } from '../services/calendarService.js';
import { sendReminderEmail } from '../services/emailService.js';
import { DateTime } from 'luxon';

/**
 * Helper: Get timezone-aware day boundaries
 */
function getDayBoundaries(timezone) {
  const now = DateTime.now().setZone(timezone);
  const today = now.startOf('day');
  const tomorrow = today.plus({ days: 1 });
  
  const todayUTC = today.toUTC().toJSDate();
  const tomorrowUTC = tomorrow.toUTC().toJSDate();
  
  console.log(`🌍 Timezone: ${timezone}`);
  console.log(`📅 UTC today: ${todayUTC.toISOString()}`);
  console.log(`📅 UTC tomorrow: ${tomorrowUTC.toISOString()}`);
  
  return { todayUTC, tomorrowUTC };
}

/**
 * Build base query conditions
 */
function buildBaseQuery(req) {
  const userId = req.user._id;
  const now = new Date();
  const conditions = [{ userId }];

  // ✅ Exclude items past deleteAfter - supports older documents
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
 * Build Today filter - startTime today OR created today with no time
 */
function buildTodayFilter(req, conditions) {
  const timezone = req.query.timezone || 'UTC';
  const { todayUTC, tomorrowUTC } = getDayBoundaries(timezone);
  
  // ✅ Status: exclude expired and cancelled
  conditions.push({ status: { $nin: ['expired', 'cancelled'] } });
  
  // ✅ Today: startTime today OR created today with no time
  conditions.push({
    $or: [
      { startTime: { $gte: todayUTC, $lt: tomorrowUTC } },
      { startTime: null, createdAt: { $gte: todayUTC, $lt: tomorrowUTC } },
    ]
  });
  
  return { query: { $and: conditions }, sort: { startTime: 1, createdAt: -1 } };
}

/**
 * Build Upcoming filter - startTime >= tomorrow
 */
function buildUpcomingFilter(req, conditions) {
  const timezone = req.query.timezone || 'UTC';
  const { tomorrowUTC } = getDayBoundaries(timezone);
  
  // ✅ Status: exclude expired and cancelled
  conditions.push({ status: { $nin: ['expired', 'cancelled'] } });
  
  // ✅ Upcoming: startTime >= tomorrow
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
  // ✅ Status filter if provided, otherwise exclude cancelled/expired
  if (req.query.status) {
    conditions.push({ status: req.query.status });
  } else {
    conditions.push({ status: { $nin: ['cancelled', 'expired'] } });
  }
  return { query: { $and: conditions }, sort: { startTime: 1, createdAt: -1 } };
}

/**
 * @desc    Get items with filtering
 * @route   GET /api/items
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

    console.log('📥 GET /api/items');
    console.log('📥 Query params:', JSON.stringify(req.query, null, 2));

    // ✅ Build base conditions
    const conditions = buildBaseQuery(req);

    // ✅ Filter by type
    if (req.query.type) {
      const types = req.query.type.split(',');
      conditions.push({ type: { $in: types } });
    }

    // ✅ Filter by search
    if (req.query.search) {
      conditions.push({
        $or: [
          { title: { $regex: req.query.search, $options: 'i' } },
          { content: { $regex: req.query.search, $options: 'i' } },
        ],
      });
    }

    // ✅ Route to appropriate filter
    let result;
    if (req.query.today === 'true') {
      console.log('📥 Filter: TODAY');
      result = buildTodayFilter(req, conditions);
    } else if (req.query.upcoming === 'true') {
      console.log('📥 Filter: UPCOMING');
      result = buildUpcomingFilter(req, conditions);
    } else if (req.query.completed === 'true') {
      console.log('📥 Filter: COMPLETED');
      result = buildCompletedFilter(req, conditions);
    } else {
      console.log('📥 Filter: ALL');
      result = buildAllFilter(req, conditions);
    }

    const { query, sort } = result;

    const limit = parseInt(req.query.limit) || 100;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    console.log('📥 Final query:', JSON.stringify(query, null, 2));

    // ✅ PERFORMANCE OPTIMIZATION: Added .lean() to reduce Mongoose document overhead
    const [items, total] = await Promise.all([
      Item.find(query).sort(sort).skip(skip).limit(limit).lean(),
      Item.countDocuments(query),
    ]);

    console.log('📥 Items found:', items.length);

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
 * @route   GET /api/items/:id
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
 * @route   POST /api/items
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

    console.log('📝 Creating item:', { type, title, startTime, endTime });

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

    console.log('✅ Item created:', savedItem._id);
    console.log('📅 StartTime:', savedItem.startTime);
    console.log('📅 Delete after:', savedItem.deleteAfter);

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
 * @route   PATCH /api/items/:id
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
        message: 'Cannot update expired items. They will be automatically deleted.',
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

    console.log('📝 Updating item:', { id: req.params.id });

    let wasClientBookingEnabled = false;

    // ✅ Track previous status
    const previousStatus = item.status;

    // ✅ Apply updates
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        item[key] = updates[key];
        if (key === 'isClientBooking' && updates[key] === true) {
          wasClientBookingEnabled = true;
        }
      }
    });

    // ✅ Generate video link if client booking was just enabled
    if (wasClientBookingEnabled && item.type === 'Event') {
      item.videoCallLink = `https://meet.jit.si/SayNote-${item._id}`;
      console.log('✅ Video call link generated:', item.videoCallLink);
    }

    // ✅ Generate if client booking exists but link is missing
    if (item.isClientBooking && !item.videoCallLink && item.type === 'Event') {
      item.videoCallLink = `https://meet.jit.si/SayNote-${item._id}`;
      console.log('✅ Video call link generated (missing):', item.videoCallLink);
    }

    // ✅ Set completedAt correctly
    if (previousStatus !== 'completed' && item.status === 'completed') {
      item.completedAt = new Date();
    }

    if (previousStatus === 'completed' && item.status === 'active') {
      item.completedAt = null;
    }

    // ✅ Save and respond immediately — don't block on Google Calendar
    const updatedItem = await item.save();
    console.log('✅ Item updated:', updatedItem._id);
    console.log('📅 Delete after recalculated:', updatedItem.deleteAfter);

    // Send response immediately
    res.status(200).json({ success: true, item: updatedItem });

    // ✅ Sync to Google Calendar in the background, after the response is already sent
    if (updatedItem.type === 'Event' && updatedItem.status === 'active') {
      (async () => {
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
      })();
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
 * @route   DELETE /api/items/:id
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
 * @route   PATCH /api/items/:id/status
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
        message: 'Cannot update expired items. They will be automatically deleted.',
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
    console.log('✅ Status updated:', updatedItem.status);

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
 * @desc    Confirm item (voice flow)
 * @route   POST /api/items/confirm
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

    const item = await Item.findOne({
      _id: itemId,
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
        message: 'Cannot confirm expired items. They will be automatically deleted.',
        errorCode: 'ITEM_EXPIRED',
      });
    }

    if (action === 'cancel') {
      item.status = 'cancelled';
      await item.save();
      return res.status(200).json({
        success: true,
        message: 'Item cancelled',
        item,
      });
    }

    if (action === 'save') {
      // ✅ Only update fields that are actually provided
      if (editedData) {
        const allowed = ['type', 'title', 'content', 'startTime', 'endTime', 'priority', 'category'];
        console.log('📝 Editing item with data:', JSON.stringify(editedData, null, 2));
        
        Object.keys(editedData).forEach(key => {
          // ✅ Only update if the field is allowed AND the value is not undefined
          if (allowed.includes(key) && editedData[key] !== undefined) {
            item[key] = editedData[key];
            console.log(`✅ Updated ${key} to:`, editedData[key]);
          }
        });
      }
      
      item.status = 'active';
      
      console.log('✅ Item confirmed - Status changed to active:', item._id);
      console.log('📅 StartTime after confirm:', item.startTime);
      console.log('📅 EndTime after confirm:', item.endTime);

      // ✅ Save and respond immediately — don't block the response on Google Calendar
      const updatedItem = await item.save();

      console.log('✅ Item confirmed:', updatedItem._id, 'Type:', updatedItem.type, 'Status:', updatedItem.status);
      console.log('📅 Final startTime:', updatedItem.startTime);
      console.log('📅 Final endTime:', updatedItem.endTime);

      // Send response immediately
      res.status(200).json({ success: true, item: updatedItem });

      // ✅ Sync to Google Calendar in the background, after the response is already sent
      if (updatedItem.type === 'Event') {
        (async () => {
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
        })();
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
 * @route   POST /api/items/:id/send-reminder
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
 * @route   GET /api/items/expired
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
 * @route   PATCH /api/items/:id/subtask/:index
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
        message: 'Cannot update expired items. They will be automatically deleted.',
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