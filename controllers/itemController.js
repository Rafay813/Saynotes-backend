import Item from '../models/Item.js';
import { syncWithGoogleCalendar } from '../services/calendarService.js';
import { sendReminderEmail } from '../services/emailService.js';

/**
 * @desc    Get items with filtering (excludes expired by default)
 * @route   GET /api/items
 */
export const getItems = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const userId = req.user._id;
    const query = { userId };

    // ✅ Filter by type
    if (req.query.type) {
      const types = req.query.type.split(',');
      query.type = { $in: types };
    }

    // ✅ Filter by status (exclude expired by default)
    if (req.query.status) {
      const statuses = req.query.status.split(',');
      query.status = { $in: statuses };
    } else {
      // ✅ Exclude expired and cancelled by default
      query.status = { $nin: ['cancelled', 'expired'] };
    }

    // ✅ Include expired items if explicitly requested
    if (req.query.includeExpired === 'true') {
      delete query.status;
      if (req.query.status) {
        const statuses = req.query.status.split(',');
        query.status = { $in: statuses };
      }
    }

    // ✅ Filter today's items
    if (req.query.today === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      query.$or = [
        { startTime: { $gte: today, $lt: tomorrow } },
        { createdAt: { $gte: today, $lt: tomorrow }, startTime: null }
      ];
    }

    // ✅ Filter upcoming items
    if (req.query.upcoming === 'true') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      query.startTime = { $gt: today };
    }

    // ✅ Filter completed items
    if (req.query.completed === 'true') {
      query.status = 'completed';
    }

    // ✅ Filter by category
    if (req.query.category) {
      query.category = req.query.category;
    }

    // ✅ Search by title or content
    if (req.query.search) {
      const search = new RegExp(req.query.search, 'i');
      query.$or = [
        { title: search },
        { content: search },
      ];
    }

    const limit = parseInt(req.query.limit) || 100;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const items = await Item.find(query)
      .sort({ startTime: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Item.countDocuments(query);

    res.status(200).json({
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
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Get single item (always returns even if expired)
 * @route   GET /api/items/:id
 */
export const getItem = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    res.status(200).json(item);
  } catch (error) {
    console.error('❌ Get item error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Create item
 * @route   POST /api/items
 */
export const createItem = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { 
      type, title, content, status, priority, category, 
      startTime, endTime, location, repeat, 
      isClientBooking, clientName, clientEmail,
      expiryBufferMinutes,
      subtasks // ✅ Phase 2: Allow subtasks on create
    } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    console.log('📝 Creating item:', { type, title, isClientBooking, clientName, clientEmail });

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
      expiryBufferMinutes: expiryBufferMinutes || 60,
    };

    // ✅ Add client booking fields if Event
    if (type === 'Event' && isClientBooking === true) {
      itemData.isClientBooking = true;
      itemData.clientName = clientName || null;
      itemData.clientEmail = clientEmail || null;
      console.log('✅ Client booking enabled for Event');
    }

    // ✅ Phase 2: Add subtasks if provided
    if (type === 'Task' && subtasks && Array.isArray(subtasks) && subtasks.length > 0) {
      itemData.subtasks = subtasks.map(text => ({ text, done: false }));
      console.log('✅ Subtasks added:', itemData.subtasks.length);
    }

    const item = new Item(itemData);
    const savedItem = await item.save();

    // ✅ Generate video link AFTER save (so _id exists)
    if (savedItem.isClientBooking && savedItem.type === 'Event') {
      savedItem.videoCallLink = `https://meet.jit.si/SayNote-${savedItem._id}`;
      await savedItem.save();
      console.log('✅ Video call link generated:', savedItem.videoCallLink);
    }

    console.log('✅ Item created:', savedItem._id, 'Type:', savedItem.type);

    res.status(201).json(savedItem);
  } catch (error) {
    console.error('❌ Create item error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Update item (only if not expired)
 * @route   PATCH /api/items/:id
 */
export const updateItem = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // ✅ Prevent updates to expired items
    if (item.status === 'expired' || item.deletedAt) {
      return res.status(400).json({ 
        message: 'Cannot update expired items. They will be automatically deleted.' 
      });
    }

    // ✅ Prevent updates to cancelled items
    if (item.status === 'cancelled') {
      return res.status(400).json({ 
        message: 'Cannot update cancelled items.' 
      });
    }

    // ✅ FIXED: Added 'videoCallLink' to allowed updates
    const allowedUpdates = [
      'type', 'title', 'content', 'status', 'priority', 'category', 
      'startTime', 'endTime', 'location', 'repeat', 
      'isClientBooking', 'clientName', 'clientEmail', 'videoCallLink',
      'expiryBufferMinutes'
    ];
    const updates = req.body;

    console.log('📝 Updating item:', { 
      id: req.params.id, 
      isClientBooking: updates.isClientBooking,
      type: updates.type || item.type
    });

    let wasClientBookingEnabled = false;

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
      console.log('✅ Video call link generated (new):', item.videoCallLink);
    }

    // ✅ Also generate if client booking already exists but link is missing
    if (item.isClientBooking && !item.videoCallLink && item.type === 'Event') {
      item.videoCallLink = `https://meet.jit.si/SayNote-${item._id}`;
      console.log('✅ Video call link generated (missing):', item.videoCallLink);
    }

    if (updates.status === 'completed' && item.status !== 'completed') {
      item.completedAt = new Date();
    }

    if (updates.status === 'active' && item.status === 'completed') {
      item.completedAt = null;
    }

    if (item.type === 'Event' && item.status === 'active') {
      try {
        const gcalResponse = await syncWithGoogleCalendar(item);
        item.googleEventId = gcalResponse.googleEventId;
        item.isSynced = true;
      } catch (gcalError) {
        console.warn('⚠️ Google Calendar sync failed:', gcalError.message);
      }
    }

    const updatedItem = await item.save();
    console.log('✅ Item updated:', updatedItem._id);

    res.status(200).json(updatedItem);
  } catch (error) {
    console.error('❌ Update item error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Delete item (HARD DELETE - Admin only)
 * @route   DELETE /api/items/:id
 */
export const deleteItem = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    await item.deleteOne();
    console.log('🗑️ Item permanently deleted:', req.params.id);

    res.status(200).json({ message: 'Item permanently deleted' });
  } catch (error) {
    console.error('❌ Delete item error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Update item status (only if not expired)
 * @route   PATCH /api/items/:id/status
 */
export const updateItemStatus = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { status, reschedule, new_startTime } = req.body;
    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // ✅ Prevent status updates to expired items
    if (item.status === 'expired' || item.deletedAt) {
      return res.status(400).json({ 
        message: 'Cannot update expired items. They will be automatically deleted.' 
      });
    }

    if (reschedule && new_startTime) {
      item.startTime = new Date(new_startTime);
      item.status = 'active';
    } else if (status) {
      // ✅ Only allow valid statuses (not expired - that's auto-set)
      if (!['pending_confirmation', 'active', 'completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      
      item.status = status;
      if (status === 'completed') {
        item.completedAt = new Date();
      } else if (status === 'active') {
        item.completedAt = null;
      }
    }

    const updatedItem = await item.save();
    res.status(200).json(updatedItem);
  } catch (error) {
    console.error('❌ Update status error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Confirm item (voice flow - changes status to active)
 * @route   POST /api/items/confirm
 */
export const confirmItem = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { itemId, action, editedData } = req.body;

    if (!itemId || !action) {
      return res.status(400).json({ message: 'Item ID and action are required' });
    }

    const item = await Item.findOne({
      _id: itemId,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // ✅ Prevent confirmation of expired items
    if (item.status === 'expired' || item.deletedAt) {
      return res.status(400).json({ 
        message: 'Cannot confirm expired items. They will be automatically deleted.' 
      });
    }

    if (action === 'cancel') {
      item.status = 'cancelled';
      await item.save();
      return res.status(200).json({ message: 'Item cancelled', item });
    }

    if (action === 'save') {
      if (editedData) {
        const allowed = ['type', 'title', 'content', 'startTime', 'endTime', 'priority', 'category'];
        Object.keys(editedData).forEach(key => {
          if (allowed.includes(key)) {
            item[key] = editedData[key];
          }
        });
      }
      
      item.status = 'active';
      
      console.log('✅ Item confirmed - Status changed to active:', item._id);

      if (item.type === 'Event') {
        try {
          const gcalResponse = await syncWithGoogleCalendar(item);
          item.googleEventId = gcalResponse.googleEventId;
          item.isSynced = true;
        } catch (gcalError) {
          console.warn('⚠️ Google Calendar sync failed:', gcalError.message);
        }
      }

      const updatedItem = await item.save();
      console.log('✅ Item confirmed:', updatedItem._id, 'Type:', updatedItem.type, 'Status:', updatedItem.status);
      return res.status(200).json(updatedItem);
    }

    res.status(400).json({ message: 'Invalid action' });
  } catch (error) {
    console.error('❌ Confirm item error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Send a manual reminder email to the client for a booking
 * @route   POST /api/items/:id/send-reminder
 */
export const sendReminder = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const item = await Item.findOne({ _id: req.params.id, userId: req.user._id });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // ✅ Prevent reminders for expired items
    if (item.status === 'expired' || item.deletedAt) {
      return res.status(400).json({ 
        message: 'Cannot send reminder for expired items.' 
      });
    }

    if (!item.isClientBooking || !item.clientEmail) {
      return res.status(400).json({ message: 'This item has no client email to remind' });
    }

    const result = await sendReminderEmail({
      to: item.clientEmail,
      clientName: item.clientName,
      eventTitle: item.title,
      startTime: item.startTime,
      videoCallLink: item.videoCallLink,
    });

    if (!result.sent) {
      return res.status(500).json({ message: 'Failed to send email', reason: result.reason });
    }

    res.status(200).json({ message: 'Reminder sent successfully' });
  } catch (error) {
    console.error('❌ Send reminder error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

/**
 * @desc    Get expired items (admin only)
 * @route   GET /api/items/expired
 */
export const getExpiredItems = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const items = await Item.find({
      userId: req.user._id,
      status: 'expired',
      deletedAt: { $ne: null },
    }).sort({ deletedAt: -1 });

    res.status(200).json(items);
  } catch (error) {
    console.error('❌ Get expired items error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

// ✅ Phase 2: Toggle subtask done/undone
/**
 * @desc    Toggle a subtask done/undone
 * @route   PATCH /api/items/:id/subtask/:index
 * @access  Private
 */
export const toggleSubtask = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const item = await Item.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }

    // ✅ Prevent updates to expired items
    if (item.status === 'expired' || item.deletedAt) {
      return res.status(400).json({ 
        message: 'Cannot update expired items. They will be automatically deleted.' 
      });
    }

    const index = parseInt(req.params.index, 10);
    if (!item.subtasks || !item.subtasks[index]) {
      return res.status(404).json({ message: 'Subtask not found' });
    }

    // ✅ Toggle the subtask
    item.subtasks[index].done = !item.subtasks[index].done;

    // ✅ Auto-complete the whole Task when every subtask is done
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
    res.status(200).json(updated);
  } catch (error) {
    console.error('❌ Toggle subtask error:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};