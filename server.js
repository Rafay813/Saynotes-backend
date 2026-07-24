import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { startAutoDeleteWorker, runInitialCleanup } from './workers/autoDeleteWorker.js';
// Add these imports
import syncRoutes from './routes/syncRoutes.js';

// Add this route
// Import routes
import authRoutes from './routes/authRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import voiceRoutes from './routes/voiceRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:19006',
    'http://localhost:19000',
    'http://localhost:5000',
    'exp://localhost:19000',
    'exp://192.168.1.*:19000',
    'https://*.ngrok-free.dev',
    process.env.FRONTEND_URL,
    process.env.EXPO_PUBLIC_API_BASE_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
};

app.use(cors(corsOptions));

// ✅ Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ✅ Logging middleware
app.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.url}`);
  next();
});

// ✅ Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/items', itemRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/voice', voiceRoutes);
app.use('/api/v1/sync', syncRoutes);

app.use('/api/v1/calendar', calendarRoutes);

// ✅ Backward compatibility
app.use('/api/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/calendar', calendarRoutes);

// ✅ Health check
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    message: 'SayNotes API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    groq: !!process.env.GROQ_API_KEY ? 'configured' : 'missing',
  });
});

// ✅ Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err : {},
  });
});

// ✅ Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/saynotes';
    await mongoose.connect(mongoURI);
    console.log('✅ MongoDB connected successfully');
    await createIndexes();
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    await db.collection('items').createIndexes([
      { key: { userId: 1, type: 1, status: 1 } },
      { key: { userId: 1, startTime: 1 } },
      { key: { userId: 1, createdAt: -1 } },
      { key: { deleteAfter: 1 } },
    ]);
    console.log('✅ Database indexes created');
  } catch (error) {
    console.error('❌ Index creation error:', error);
  }
};

// ✅ Start server
const startServer = async () => {
  try {
    await connectDB();
    console.log('✅ Database connected');
    await runInitialCleanup();
    startAutoDeleteWorker();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// ✅ Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  await mongoose.connection.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});

startServer();

export default app;