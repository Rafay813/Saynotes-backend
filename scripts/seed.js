import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Item from '../models/Item.js';
import connectDB from '../config/db.js';

const runSeed = async () => {
  try {
    // Clear existing data
    await User.deleteMany({});
    await Item.deleteMany({});

    console.log('Cleared existing database data.');

    // 1. Create a Test User
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);

    const testUser = await User.create({
      name: 'Test User',
      email: 'test@saynote.com',
      password: hashedPassword,
    });

    console.log('Created test user:', testUser.email);

    // 2. Create Mock Items for the user (Adjusted schema fields for ES module versions)
    const items = [
      {
        userId: testUser._id,
        type: 'Note',
        title: 'Project Ideas',
        content: '1. SayNote Mobile App\n2. AI Content Generator',
        status: 'active',
      },
      {
        userId: testUser._id,
        type: 'Task',
        title: 'Finish backend API',
        content: 'Complete the Node.js/Express backend for SayNote MVP.',
        status: 'pending_confirmation',
        startTime: new Date(Date.now() + 86400000), // Due in 1 day
      },
      {
        userId: testUser._id,
        type: 'Reminder',
        title: 'Buy Groceries',
        content: 'Remember to grab some milk',
        startTime: new Date(Date.now() + 3600000), // Due in 1 hour
        status: 'active',
      },
      {
        userId: testUser._id,
        type: 'Event',
        title: 'Weekly Sync',
        content: 'Sync with the team',
        startTime: new Date(Date.now() + 86400000), // Tomorrow
        endTime: new Date(Date.now() + 86400000 + 3600000), // + 1 hour
        status: 'active',
      },
    ];

    await Item.insertMany(items);
    console.log('Created mock items for testing.');

    console.log('Data Seeding Successful!');
  } catch (error) {
    console.error('Data Seeding Failed:', error);
  }
};

// If run directly via CLI
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  connectDB().then(async () => {
    await runSeed();
    process.exit();
  });
}

export default runSeed;
