export const sendPasswordResetEmail = async ({ to, name, code }) => {
  if (!process.env.BREVO_API_KEY) {
    console.log('[EMAIL] Brevo API key not configured — skipping send.');
    return { sent: false, reason: 'email_not_configured' };
  }

  const html = `
    <div style="font-family: sans-serif; padding: 16px; max-width: 600px;">
      <h2 style="color: #4F46E5;">Password Reset Code</h2>
      <p>Hi ${name || 'there'},</p>
      <p>Use this code to reset your SayNote password:</p>
      <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
        <h1 style="letter-spacing: 8px; font-size: 36px; color: #1F2937; margin: 0;">${code}</h1>
      </div>
      <p style="color: #6B7280;">This code expires in <strong>15 minutes</strong>.</p>
      <p style="color: #6B7280;">If you didn't request this, you can safely ignore this email.</p>
      <br/>
      <p style="color: #6B7280; font-size: 14px;">— SayNote Team</p>
    </div>
  `;

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'SayNote', email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        subject: 'Your SayNote password reset code',
        htmlContent: html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Brevo API error:', data);
      return { sent: false, reason: data.message || 'API error' };
    }

    console.log('✅ Password reset email sent to:', to, 'ID:', data.messageId);
    return { sent: true };
  } catch (error) {
    console.error('❌ Failed to send reset email:', error.message);
    return { sent: false, reason: error.message };
  }
};

export const sendReminderEmail = async ({ to, clientName, eventTitle, startTime, videoCallLink }) => {
  if (!process.env.BREVO_API_KEY) {
    console.log('[EMAIL] Brevo API key not configured — skipping send.');
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
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'SayNote', email: process.env.BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        subject: `Reminder: ${eventTitle}`,
        htmlContent: html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Brevo API error:', data);
      return { sent: false, reason: data.message || 'API error' };
    }

    console.log('✅ Reminder email sent to:', to, 'ID:', data.messageId);
    return { sent: true };
  } catch (error) {
    console.error('❌ Failed to send reminder email:', error.message);
    return { sent: false, reason: error.message };
  }
};

export default { sendReminderEmail, sendPasswordResetEmail };