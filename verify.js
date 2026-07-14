import mongoose from 'mongoose';
import connectDB from './config/db.js';
import Item from './models/Item.js';
import User from './models/User.js';
import express from 'express';
import { getNotes, getNoteById, updateNote, deleteNote } from './controllers/itemController.js';

const runTests = async () => {
  console.log('--- Starting Tests ---');
  
  // Set NODE_ENV to development to use memory server
  process.env.NODE_ENV = 'development';
  process.env.MONGO_URI = 'localhost';
  
  await connectDB();
  
  // Create mock users
  const user1 = await User.create({ name: 'User 1', email: 'user1@test.com', password: 'password' });
  const user2 = await User.create({ name: 'User 2', email: 'user2@test.com', password: 'password' });
  
  // Create mock notes
  const note1 = await Item.create({
    userId: user1._id,
    type: 'Note',
    title: 'Note 1',
    content: 'Content 1',
    category: 'Work'
  });
  
  const note2 = await Item.create({
    userId: user1._id,
    type: 'Note',
    title: 'Note 2',
    content: 'Content 2',
    category: 'Personal'
  });
  
  const note3 = await Item.create({
    userId: user2._id,
    type: 'Note',
    title: 'Note 3',
    content: 'Content 3',
    category: 'Work'
  });
  
  console.log('--- Test 1: Category Filtering ---');
  // Mock Req/Res for getNotes
  let resJsonData = null;
  const mockRes = {
    status: function(s) { this.statusCode = s; return this; },
    json: function(data) { resJsonData = data; }
  };
  
  const mockReqCategory = {
    user: { _id: user1._id },
    query: { category: 'Work' }
  };
  
  await getNotes(mockReqCategory, mockRes);
  if (resJsonData && resJsonData.length === 1 && resJsonData[0].title === 'Note 1') {
    console.log('Test 1 Passed: Category filtering works.');
  } else {
    console.log('Test 1 Failed!', resJsonData);
  }
  
  console.log('--- Test 2: Security Fix - Access Another User\'s Note ---');
  const mockReqSecurity = {
    user: { id: user2._id.toString(), _id: user2._id },
    params: { id: note1._id.toString() }
  };
  
  await getNoteById(mockReqSecurity, mockRes);
  if (mockRes.statusCode === 403) {
    console.log('Test 2 Passed: 403 Forbidden correctly triggered.');
  } else {
    console.log('Test 2 Failed!', mockRes.statusCode);
  }
  
  console.log('--- Tests Finished ---');
  process.exit(0);
};

runTests();
