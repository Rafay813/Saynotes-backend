import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Reminder from '../models/Reminder.js';

dotenv.config();

const testReminder = async () => {
  try {
    // Connect to MongoDB
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/saynotes';
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB');

    // Get a user from the database
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({});
    
    if (!user) {
      console.log('❌ No user found. Please create a user first.');
      console.log('💡 Run: POST /api/v1/auth/register to create a user');
      process.exit(1);
    }

    console.log(`👤 Using user: ${user.name || user.email} (${user._id})`);

    // Create a test reminder due in 1 minute
    const scheduledFor = new Date();
    scheduledFor.setMinutes(scheduledFor.getMinutes() + 1);

    const reminder = await Reminder.create({
      userId: user._id,
      title: 'Test Voice Reminder',
      message: 'This is a test voice reminder from SayNotes! Please respond.',
      scheduledFor,
      priority: 'high',
      category: 'Test',
      context: 'This reminder was created by the test script',
      followUpRequired: true,
      tags: ['test', 'voice-reminder'],
    });

    console.log('\n✅ Test reminder created successfully!');
    console.log('📋 Reminder details:');
    console.log(`  ID: ${reminder._id}`);
    console.log(`  Title: ${reminder.title}`);
    console.log(`  Message: ${reminder.message}`);
    console.log(`  Scheduled for: ${scheduledFor.toLocaleString()}`);
    console.log(`  Follow-up required: ${reminder.followUpRequired ? '✅ Yes' : '❌ No'}`);
    console.log(`  Priority: ${reminder.priority}`);
    console.log(`  Category: ${reminder.category}`);
    console.log('\n⏰ The reminder will fire in 1 minute.');
    console.log('📱 Check your push notifications or console logs!');
    console.log('\n💡 To test the API manually:');
    console.log(`  GET http://localhost:5000/api/v1/reminders`);
    console.log(`  POST http://localhost:5000/api/v1/reminders/${reminder._id}/complete`);
    console.log(`  POST http://localhost:5000/api/v1/reminders/${reminder._id}/snooze`);
    console.log('   Body: { "minutes": 10 }');

    // Wait a moment to see the worker process it
    console.log('\n🔄 Worker will check every minute...');
    console.log('⌛ Press Ctrl+C to stop');

    // Keep the process alive to see the reminder fire
    await new Promise(resolve => setTimeout(resolve, 70000));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

testReminder();