import Item from '../models/Item.js';

/**
 * Create an item based on AI parsed data
 * @param {Object} parsedData - Parsed data from aiParsingService
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Saved item
 */
export const createItem = async (parsedData, userId) => {
  try {
    const { type, title, content, startTime, endTime } = parsedData;
    
    console.log('📝 Creating item with data:', { type, title, userId });
    
    // ✅ Create item data matching your Item model
    const itemData = {
      userId,
      type: type || 'Note',
      title: title || 'Untitled',
      content: content || '',
      category: 'General',
      completed: false,
    };
    
    // ✅ Add date/time if they exist
    if (startTime) {
      const dateObj = new Date(startTime);
      itemData.date = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
      itemData.time = dateObj.toTimeString().slice(0, 5); // HH:MM
    }
    
    // ✅ If it's an Event, store the end time if available
    if (type === 'Event' && endTime) {
      itemData.endTime = endTime;
    }
    
    const item = new Item(itemData);
    const savedItem = await item.save();
    
    console.log('✅ Item saved:', savedItem._id);
    return savedItem;
    
  } catch (error) {
    console.error('❌ Error creating item:', error);
    throw new Error(`Failed to create item: ${error.message}`);
  }
};