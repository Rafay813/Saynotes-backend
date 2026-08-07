import Reminder from '../models/Reminder.js';

// @desc    Handle "Hear Now" action
// @route   POST /api/v1/reminders/:id/hear-now
// @access  Private
export const hearNow = async (req, res) => {
  try {
    const reminder = await Reminder.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!reminder) {
      return res.status(404).json({
        success: false,
        message: 'Reminder not found',
      });
    }

    // Mark as read
    reminder.hasBeenRead = true;
    reminder.readAt = new Date();
    await reminder.save();

    // Generate TTS audio for playback
    const { textToSpeech } = await import('../services/ttsService.js');
    const ttsResult = await textToSpeech(
      `${reminder.title}. ${reminder.message}`
    );

    res.status(200).json({
      success: true,
      data: {
        reminder,
        audio: ttsResult.audioBase64 || null,
        useDeviceTTS: ttsResult.useDeviceTTS || false,
        provider: ttsResult.provider || 'unknown',
      },
      message: 'Playing reminder now',
    });
  } catch (error) {
    console.error('❌ Hear Now error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to play reminder',
      error: error.message,
    });
  }
};