# Server Setup Instructions

## Quick Start

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Create `.env` file** in the root directory:
   ```env
   PORT=3001
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   VITE_API_URL=http://localhost:3001
   ```

3. **Start the backend server** (in Terminal 1):
   ```bash
   npm run server
   ```
   You should see: `✅ Server is running on port 3001`

4. **Start the frontend** (in Terminal 2):
   ```bash
   npm run dev
   ```

## Gmail SMTP Setup (IMPORTANT)

**You CANNOT use your regular Gmail password!** You must use an App Password.

### Step-by-Step Instructions:

1. **Enable 2-Step Verification** (if not already enabled):
   - Go to: https://myaccount.google.com/security
   - Enable "2-Step Verification"

2. **Generate an App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Or: Google Account → Security → 2-Step Verification → App passwords
   - Select "Mail" as the app
   - Select "Other (Custom name)" as device → Enter "Pro Thumbnail Generator"
   - Click "Generate"
   - **Copy the 16-character password** (it will look like: `abcd efgh ijkl mnop`)

3. **Update your `.env` file**:
   ```env
   SMTP_USER=your-email@gmail.com        # Your Gmail address
   SMTP_PASS=abcdefghijklmnop            # The 16-character App Password (remove spaces)
   ```

4. **Important Notes**:
   - Use the **App Password** (16 characters), NOT your regular Gmail password
   - Remove any spaces from the App Password
   - The App Password is different from your Google account password
   - If you get "Invalid login" error, you're using the wrong password

### Alternative: Use Other Email Providers

If Gmail doesn't work, you can use:
- **Outlook/Hotmail**: `smtp-mail.outlook.com`, port `587`
- **Yahoo**: `smtp.mail.yahoo.com`, port `587`
- **Custom SMTP**: Any SMTP server that supports authentication

## Troubleshooting

- **ERR_CONNECTION_REFUSED**: Make sure the server is running (`npm run server`)
- **Email not sending**: Check your `.env` file has correct SMTP credentials
- **Port already in use**: Change `PORT` in `.env` to a different port (e.g., 3002)

