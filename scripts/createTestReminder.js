import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Reminder from '../models/Reminder.js';

dotenv.config();

const createTestReminder = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/saynotes');
    
    // Get a user
    const db = mongoose.connection.db;
    const user = await db.collection('users').findOne({});
    
    if (!user) {
      console.log('❌ No user found. Please create a user first.');
      process.exit(1);
    }

    console.log(`👤 Using user: ${user.name || user.email}`);

    // Create a test reminder due in 1 minute
    const scheduledFor = new Date();
    scheduledFor.setMinutes(scheduledFor.getMinutes() + 1);

    const reminder = await Reminder.create({
      userId: user._id,
      title: '📢 Test Voice Reminder',
      message: 'This is a test of the voice reminder system with TTS! Please respond when you hear this.',
      scheduledFor,
      priority: 'high',
      category: 'Test',
      context: 'Testing TTS integration with reminders',
      followUpRequired: true,
      tags: ['test', 'voice', 'tts'],
    });

    console.log('\n✅ Test reminder created successfully!');
    console.log('📋 Reminder details:');
    console.log(`  ID: ${reminder._id}`);
    console.log(`  Title: ${reminder.title}`);
    console.log(`  Message: ${reminder.message}`);
    console.log(`  Scheduled for: ${scheduledFor.toLocaleString()}`);
    console.log(`  Follow-up required: ✅ Yes`);
    console.log(`  Priority: ${reminder.priority}`);
    
    console.log('\n⏰ The reminder will fire in 1 minute.');
    console.log('🎤 TTS will generate audio automatically.');
    console.log('📱 Check the console logs for notification details!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

createTestReminder();