import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import Item, { computeDeleteAfter } from '../models/Item.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const itemsMissingField = await Item.find({ deleteAfter: { $exists: false } });
  console.log(`Found ${itemsMissingField.length} items missing deleteAfter`);

  for (const item of itemsMissingField) {
    item.deleteAfter = computeDeleteAfter({
      type: item.type,
      startTime: item.startTime,
      endTime: item.endTime,
    });
    await item.save();
    console.log(`Backfilled ${item._id} (${item.title}) -> ${item.deleteAfter.toISOString()}`);
  }

  console.log('✅ Migration complete');
  await mongoose.disconnect();
}

run().catch(console.error);

