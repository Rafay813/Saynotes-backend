import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// Ensure temp directory exists
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/**
 * TTS endpoint using edge-tts CLI (most reliable method)
 */
app.post('/v1/audio/speech', async (req, res) => {
  try {
    const { input, voice = 'en-US-JennyNeural' } = req.body;
    
    if (!input) {
      return res.status(400).json({ error: 'Missing "input" field' });
    }
    
    console.log(`🎤 TTS Request: "${input.substring(0, 50)}..."`);
    console.log(`🎤 Voice: ${voice}`);
    
    // Generate a unique filename
    const timestamp = Date.now();
    const audioFile = path.join(tempDir, `tts-${timestamp}.mp3`);
    
    // Escape special characters for the command
    const escapedText = input.replace(/"/g, '\\"').replace(/\n/g, ' ');
    
    // Use edge-tts CLI command
    const command = `npx -y edge-tts --text "${escapedText}" --voice "${voice}" --write-media "${audioFile}"`;
    
    console.log(`🎤 Running: edge-tts --voice ${voice}`);
    
    // Execute the command
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr && !stderr.includes('Warning')) {
      console.error('❌ TTS Error:', stderr);
      throw new Error(stderr);
    }
    
    // Check if file was created
    if (!fs.existsSync(audioFile)) {
      throw new Error('Audio file was not created');
    }
    
    // Read the audio file
    const audioBuffer = fs.readFileSync(audioFile);
    
    // Clean up temp file after reading
    fs.unlinkSync(audioFile);
    
    console.log(`✅ TTS generated: ${audioBuffer.length} bytes`);
    
    // Set response headers
    res.set('Content-Type', 'audio/mpeg');
    res.set('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
    
  } catch (error) {
    console.error('❌ TTS Error:', error.message);
    res.status(500).json({ 
      error: error.message,
      details: error.stack,
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'edge-tts',
    timestamp: new Date().toISOString(),
  });
});

// Start server
const PORT = process.env.TTS_PORT || 5050;
app.listen(PORT, () => {
  console.log(`✅ Edge TTS Server running on http://localhost:${PORT}`);
  console.log(`📡 Endpoint: http://localhost:${PORT}/v1/audio/speech`);
});