import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongoServer;

const connectDB = async () => {
  try {
    let mongoUri = process.env.MONGO_URI;

    // Use memory server if local connection to allow seamless testing without a local MongoDB installation
    if (process.env.NODE_ENV !== 'production' && (!mongoUri || mongoUri.includes('localhost') || mongoUri.includes('127.0.0.1'))) {
      mongoServer = await MongoMemoryServer.create();
      mongoUri = mongoServer.getUri();
      console.log('Started MongoDB Memory Server for seamless testing.');
    }

    const conn = await mongoose.connect(mongoUri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Return true if we used memory server so we know to seed
    return !!mongoServer;
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
