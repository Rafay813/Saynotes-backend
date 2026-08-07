import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import textToSpeech from '../services/ttsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env
dotenv.config({ path: path.join(__dirname, '../.env') });

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

console.log('🚀 Starting TTS Test...');
console.log(`🔑 VOICERSS_API_KEY: ${process.env.VOICERSS_API_KEY ? '✅ SET' : '❌ NOT SET'}`);
console.log('');

const testText = 'Hello! This is a test voice reminder from SayNotes. Please respond when you are ready.';
console.log(`📝 Text: "${testText}"`);
console.log('');

const result = await textToSpeech(testText);

console.log('📊 Results:');
console.log(`   Success: ${result.success}`);
console.log(`   Provider: ${result.provider || 'unknown'}`);

if (result.audioBase64) {
  const audioBuffer = Buffer.from(result.audioBase64, 'base64');
  console.log(`   Audio length: ${result.audioBase64.length} characters (base64)`);
  console.log(`   Audio size: ${audioBuffer.length} bytes`);
  console.log(`   Format: ${result.format || 'mp3'}`);
  
  // Save the audio file
  const audioPath = path.join(tempDir, 'test-audio.mp3');
  fs.writeFileSync(audioPath, audioBuffer);
  console.log(`💾 Audio saved to: ${audioPath}`);
}

if (result.useDeviceTTS) {
  console.log(`   Device TTS: Yes (fallback mode)`);
}

if (result.message) {
  console.log(`   Message: ${result.message}`);
}

console.log('\n✅ TTS test complete!');