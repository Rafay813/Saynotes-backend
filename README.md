# SayNotes MVP Backend

SayNotes is a voice/text note-taking application backend built on the MERN stack.

## Running Locally

The application comes configured with a MongoDB Memory Server to seamlessly run and test locally without requiring a local MongoDB installation.

### Prerequisites
- Node.js (v14 or higher)

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local server:
   ```bash
   npm run dev
   # or
   npm start
   ```

When started locally (when `NODE_ENV` is not set to `production`), the backend will automatically spin up an in-memory MongoDB instance and auto-seed the database. You will see the following logs:
```
Started MongoDB Memory Server for seamless testing.
MongoDB Connected: 127.0.0.1
Detected Memory Server. Auto-seeding database...
```

## Production Deployment on Render

To deploy the backend for production on Render (or another cloud provider), configure your environment variables exactly as below.

### Required Environment Variables
Set these variables in your Render Web Service dashboard:
- `NODE_ENV`: **Must** be set to `production` (This bypasses the MongoDB Memory Server).
- `MONGO_URI`: Your production MongoDB Atlas connection string (e.g., `mongodb+srv://<username>:<password>@cluster0.mongodb.net/SayNotes?retryWrites=true&w=majority`).
- `PORT`: (Optional) Render will automatically assign a `PORT` variable. The server will dynamically bind to it.
- `JWT_SECRET`: A strong random string for signing JWT tokens (if auth is fully implemented).
- `JWT_EXPIRE`: (e.g., `30d` or `24h`).

Once configured, your Render instance will connect directly to your Atlas cluster instead of spinning up the Memory Server, ensuring your data is safely persisted.
