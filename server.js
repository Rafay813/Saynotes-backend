import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import connectDB from './config/db.js';
import runSeed from './scripts/seed.js';

import authRoutes from './routes/authRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import voiceRoutes from './routes/voiceRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';

import { startCheckInWorker } from './workers/checkInWorker.js';

const app = express();

// ✅ Rate Limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests, please slow down.' },
  skip: (req) => req.path === '/',
});

app.use('/api', limiter);

// ✅ CORS - Allow all origins for development
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200,
}));

console.log('🔑 GROQ_API_KEY:', process.env.GROQ_API_KEY ? '✅ Set' : '❌ Missing');
console.log('🔑 CLERK_SECRET_KEY:', process.env.CLERK_SECRET_KEY ? '✅ Set' : '❌ Missing');
console.log('🔑 GOOGLE_REDIRECT_URI:', process.env.GOOGLE_REDIRECT_URI ? '✅ Set' : '❌ Missing');

// ✅ Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/v1/voice', voiceRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/calendar', calendarRoutes);

// ✅ Health check
app.get('/', (req, res) => {
  res.send('SayNote API is running...');
});

// ✅ Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;

connectDB().then(async (isMemory) => {
  if (isMemory) {
    console.log('Detected Memory Server. Auto-seeding database...');
    await runSeed();
  }
  
  startCheckInWorker();
  
  // ✅ Listen on all interfaces
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📍 CORS enabled for all origins`);
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`📍 Ngrok: https://reword-cone-smitten.ngrok-free.dev`);
  });
}).catch(err => {
  console.error('❌ Failed to connect to database:', err);
  process.exit(1);
});