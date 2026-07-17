import cron from 'node-cron';
import Item from '../models/Item.js';

// ✅ Run every hour
export const startAutoDeleteWorker = () => {
  console.log('🔄 Auto-delete worker started - running every hour at minute 0');
  
  // Run at minute 0 of every hour
  cron.schedule('0 * * * *', async () => {
    console.log(`🗑️ Running auto-delete cleanup at ${new Date().toISOString()}`);
    try {
      // Soft delete expired items
      const deletedIds = await Item.cleanupExpiredItems();
      console.log(`✅ Soft-deleted ${deletedIds.length} items`);
      
      // Permanently remove items that were soft-deleted > 30 days ago
      const permanentResult = await Item.permanentCleanup(30);
      console.log(`✅ Permanently removed ${permanentResult.deletedCount} old items`);
      
    } catch (error) {
      console.error('❌ Auto-delete worker error:', error);
    }
  });
};

// ✅ Run once at startup for immediate cleanup
export const runInitialCleanup = async () => {
  try {
    console.log('🔄 Running initial cleanup at startup...');
    const deletedIds = await Item.cleanupExpiredItems();
    console.log(`✅ Initial cleanup: ${deletedIds.length} items soft-deleted`);
    
    // Also clean up old permanent items
    const permanentResult = await Item.permanentCleanup(30);
    console.log(`✅ Initial permanent cleanup: ${permanentResult.deletedCount} old items removed`);
  } catch (error) {
    console.error('❌ Initial cleanup error:', error);
  }
};

// ✅ Manual cleanup function (can be called from API)
export const manualCleanup = async () => {
  console.log('🔄 Running manual cleanup...');
  try {
    const deletedIds = await Item.cleanupExpiredItems();
    const permanentResult = await Item.permanentCleanup(30);
    return {
      softDeleted: deletedIds.length,
      permanentDeleted: permanentResult.deletedCount,
    };
  } catch (error) {
    console.error('❌ Manual cleanup error:', error);
    throw error;
  }
};