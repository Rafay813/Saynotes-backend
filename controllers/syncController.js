import Item from '../models/Item.js';

// @desc    Sync offline items
// @route   POST /api/v1/sync
// @access  Private
export const syncItems = async (req, res) => {
  try {
    const { items } = req.body; // Array of offline items

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ message: 'Please provide an array of items' });
    }

    // Prepare bulk write operations
    const bulkOps = items.map((item) => {
      // Ensure the item belongs to the authenticated user.
      // NOTE: The Item schema field is `userId`, not `user` — using the
      // wrong field name here silently dropped ownership on synced items.
      const { _id, ...itemData } = item;
      itemData.userId = req.user._id;

      // If it has an _id, we update it. If not, we insert it.
      // Offline items usually come with a local ID or no MongoDB ID.
      // Assuming if they have an _id, it's an update. If not, it's an insert.
      if (_id) {
        return {
          updateOne: {
            filter: { _id, userId: req.user._id },
            update: { $set: itemData },
            upsert: true,
          },
        };
      } else {
        return {
          insertOne: {
            document: itemData,
          },
        };
      }
    });

    if (bulkOps.length > 0) {
      const result = await Item.bulkWrite(bulkOps);
      res.status(200).json({
        message: 'Sync successful',
        result,
      });
    } else {
      res.status(200).json({ message: 'No items to sync' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server Error during sync', error: error.message });
  }
};
