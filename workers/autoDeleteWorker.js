import cron from 'node-cron';
import Item from '../models/Item.js';

// ✅ Run every hour
export const startAutoDeleteWorker = () => {
  console.log('🔄 Auto-delete worker started - running every hour');

  cron.schedule('0 * * * *', async () => {
    console.log(`🗑️ Running auto-delete cleanup at ${new Date().toISOString()}`);
    
    try {
      const now = new Date();
      
      // ✅ Step 1: Soft delete (mark as expired)
      const softDeleteResult = await Item.updateMany(
        {
          deleteAfter: { $lte: now },
          status: { $ne: 'expired' },
        },
        {
          status: 'expired',
          deletedAt: now,
        }
      );
      
      console.log(`✅ Soft-deleted ${softDeleteResult.modifiedCount} items`);

      // ✅ Step 2: Permanently delete items soft-deleted > 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const permanentResult = await Item.deleteMany({
        deletedAt: { $lte: thirtyDaysAgo },
        status: 'expired',
      });
      
      console.log(`✅ Permanently deleted ${permanentResult.deletedCount} items`);
    } catch (error) {
      console.error('❌ Auto-delete worker error:', error);
    }
  });
};

// ✅ Run once at startup
export const runInitialCleanup = async () => {
  try {
    console.log('🔄 Running initial cleanup...');
    const now = new Date();
    
    const softDeleteResult = await Item.updateMany(
      {
        deleteAfter: { $lte: now },
        status: { $ne: 'expired' },
      },
      {
        status: 'expired',
        deletedAt: now,
      }
    );
    
    console.log(`✅ Initial cleanup: ${softDeleteResult.modifiedCount} items soft-deleted`);
  } catch (error) {
    console.error('❌ Initial cleanup error:', error);
  }
};