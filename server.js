import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Create reusable transporter object using SMTP transport
let transporter;
try {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER, // Your email
      pass: process.env.SMTP_PASS, // Your email password or app password
    },
  });
  
  // Verify transporter configuration
  transporter.verify(function (error, success) {
    if (error) {
      console.warn('\n⚠️  SMTP configuration error:', error.message);
      if (error.code === 'EAUTH' || error.responseCode === 535) {
        console.warn('\n📧 Gmail Authentication Issue:');
        console.warn('   1. Make sure 2-Step Verification is enabled on your Google account');
        console.warn('   2. Generate an App Password:');
        console.warn('      → Go to: https://myaccount.google.com/apppasswords');
        console.warn('      → Or: Google Account → Security → 2-Step Verification → App passwords');
        console.warn('   3. Use the 16-character App Password (not your regular password) in SMTP_PASS');
        console.warn('   4. SMTP_USER should be your Gmail address (e.g., yourname@gmail.com)');
        console.warn('   5. SMTP_PASS should be the App Password (16 characters, no spaces)\n');
      } else {
        console.warn('   Server will start but email sending may fail. Please check your .env file.\n');
      }
    } else {
      console.log('✅ SMTP server is ready to send emails\n');
    }
  });
} catch (error) {
  console.warn('Failed to create email transporter:', error.message);
  console.warn('Server will start but email sending will be disabled. Please configure SMTP in .env file.');
}

// In-memory OTP storage (in production, use Redis or database)
const otpStore = new Map();

// Generate 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP email
app.post('/api/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check if SMTP is configured
    if (!transporter) {
      return res.status(503).json({ 
        error: 'Email service is not configured. Please set SMTP_USER and SMTP_PASS in your .env file.' 
      });
    }

    // Check if SMTP credentials are provided
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(503).json({ 
        error: 'SMTP credentials are missing. Please set SMTP_USER and SMTP_PASS in your .env file.' 
      });
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

    // Store OTP
    otpStore.set(email, { otp, expiresAt });

    // Email content
    const mailOptions = {
      from: `"Pro Thumbnail Generator" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Email Verification - Pro Thumbnail Generator',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #1a1a1a; color: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #fbbf24; margin: 0;">Pro Thumbnail Generator</h1>
          </div>
          <div style="background-color: #2a2a2a; padding: 30px; border-radius: 10px; border: 1px solid #3a3a3a;">
            <h2 style="color: #ffffff; margin-top: 0;">Email Verification</h2>
            <p style="color: #cccccc; font-size: 16px; line-height: 1.6;">
              Thank you for signing up! Please use the following OTP code to verify your email address:
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <div style="display: inline-block; background-color: #fbbf24; color: #000000; padding: 15px 30px; border-radius: 8px; font-size: 32px; font-weight: bold; letter-spacing: 5px;">
                ${otp}
              </div>
            </div>
            <p style="color: #cccccc; font-size: 14px; line-height: 1.6;">
              This code will expire in 10 minutes. If you didn't request this code, please ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #3a3a3a; margin: 20px 0;">
            <p style="color: #888888; font-size: 12px; margin: 0;">
              This is an automated email. Please do not reply.
            </p>
          </div>
        </div>
      `,
    };

    // Send email
    try {
      await transporter.sendMail(mailOptions);
    } catch (emailError) {
      console.error('Email sending error:', emailError);
      
      // Handle specific Gmail authentication errors
      if (emailError.code === 'EAUTH' || emailError.responseCode === 535) {
        return res.status(401).json({ 
          error: 'SMTP authentication failed. Please check your .env file:\n\n' +
                 '1. Make sure you are using an App Password (not your regular Gmail password)\n' +
                 '2. Enable 2-Step Verification on your Google account\n' +
                 '3. Generate an App Password: Google Account → Security → 2-Step Verification → App passwords\n' +
                 '4. Use the 16-character App Password in SMTP_PASS\n\n' +
                 'For Gmail: SMTP_USER should be your email, SMTP_PASS should be the App Password.'
        });
      }
      
      // Handle other email errors
      throw emailError;
    }

    // Clean up expired OTPs
    for (const [key, value] of otpStore.entries()) {
      if (value.expiresAt < Date.now()) {
        otpStore.delete(key);
      }
    }

    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error('Error sending OTP:', error);
    
    // Provide more specific error messages
    if (error.code === 'EAUTH' || error.responseCode === 535) {
      return res.status(401).json({ 
        error: 'SMTP authentication failed. Please check your .env file:\n\n' +
               '1. Make sure you are using an App Password (not your regular Gmail password)\n' +
               '2. Enable 2-Step Verification on your Google account\n' +
               '3. Generate an App Password: Google Account → Security → 2-Step Verification → App passwords\n' +
               '4. Use the 16-character App Password in SMTP_PASS\n\n' +
               'For Gmail: SMTP_USER should be your email, SMTP_PASS should be the App Password.'
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Failed to send OTP. Please check your SMTP configuration and try again.' 
    });
  }
});

// Verify OTP
app.post('/api/verify-otp', (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const storedData = otpStore.get(email);

    if (!storedData) {
      return res.status(400).json({ error: 'OTP not found or expired. Please request a new OTP.' });
    }

    if (storedData.expiresAt < Date.now()) {
      otpStore.delete(email);
      return res.status(400).json({ error: 'OTP has expired. Please request a new OTP.' });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ error: 'Invalid OTP. Please check and try again.' });
    }

    // OTP verified successfully - remove it
    otpStore.delete(email);

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: 'Failed to verify OTP. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Server is running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📧 OTP endpoint: http://localhost:${PORT}/api/send-otp`);
  console.log(`\n⚠️  Make sure to set SMTP_USER and SMTP_PASS in your .env file`);
  console.log(`   If SMTP is not configured, email sending will fail.\n`);
});

