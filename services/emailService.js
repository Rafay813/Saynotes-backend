import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * Send a reminder email to a client
 */
export const sendReminderEmail = async ({ to, clientName, eventTitle, startTime, videoCallLink }) => {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log('[EMAIL] Gmail credentials not configured — skipping send.');
    return { sent: false, reason: 'email_not_configured' };
  }

  const formattedTime = startTime
    ? new Date(startTime).toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })
    : 'TBD';

  const html = `
    <div style="font-family: sans-serif; padding: 16px; max-width: 600px;">
      <h2 style="color: #4F46E5;">Meeting Reminder</h2>
      <p>Hi ${clientName || 'there'},</p>
      <p>This is a reminder for your upcoming meeting: <strong>${eventTitle}</strong></p>
      <p><strong>When:</strong> ${formattedTime}</p>
      ${videoCallLink ? `<p><strong>Join here:</strong> <a href="${videoCallLink}" style="color: #4F46E5;">${videoCallLink}</a></p>` : ''}
      <p style="margin-top: 20px;">Looking forward to speaking with you.</p>
      <br/>
      <p style="color: #6B7280; font-size: 14px;">— SayNote Team</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"SayNote" <${process.env.GMAIL_USER}>`,
      to,
      subject: `Reminder: ${eventTitle}`,
      html,
    });
    console.log('✅ Reminder email sent to:', to);
    return { sent: true };
  } catch (error) {
    console.error('❌ Failed to send reminder email:', error.message);
    return { sent: false, reason: error.message };
  }
};

export default sendReminderEmail;