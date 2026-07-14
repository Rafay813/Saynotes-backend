# SayNote MVP Backend - API Walkthrough

Use this guide to test the backend endpoints locally using Postman or cURL.

## 1. Authentication Endpoints

### Register a New User
* **URL:** `POST /api/v1/auth/register`
* **Body (JSON):**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "mysecurepassword"
}
```
* **cURL:**
```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
-H "Content-Type: application/json" \
-d '{"name": "Jane Doe", "email": "jane@example.com", "password": "mysecurepassword"}'
```

### Login
* **URL:** `POST /api/v1/auth/login`
* **Body (JSON):**
```json
{
  "email": "jane@example.com",
  "password": "mysecurepassword"
}
```
* **cURL:**
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
-H "Content-Type: application/json" \
-d '{"email": "jane@example.com", "password": "mysecurepassword"}'
```
> [!IMPORTANT]
> The login response will include a `token`. You need this token for the `Authorization` header in the protected routes below.
> Format: `Authorization: Bearer <your_token>`

## 2. Sync Endpoints

### Sync Offline Items
* **URL:** `POST /api/v1/sync`
* **Headers:** `Authorization: Bearer <your_token>`
* **Body (JSON):**
```json
{
  "items": [
    {
      "itemType": "Note",
      "title": "My first offline note",
      "content": "This is the content of the note"
    },
    {
      "itemType": "Task",
      "title": "Buy milk",
      "priority": "High",
      "dueDate": "2026-06-25T10:00:00.000Z"
    }
  ]
}
```
* **cURL:**
```bash
curl -X POST http://localhost:5000/api/v1/sync \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <your_token>" \
-d '{"items": [{"itemType": "Note", "title": "My first offline note", "content": "This is the content of the note"}]}'
```

## 3. Background Notifications

### Schedule a Delayed Notification
* **URL:** `POST /api/v1/notifications/schedule`
* **Headers:** `Authorization: Bearer <your_token>`
* **Body (JSON):**
```json
{
  "title": "Reminder Alert",
  "message": "Don't forget to review the pull requests!",
  "delayMs": 5000
}
```
* **cURL:**
```bash
curl -X POST http://localhost:5000/api/v1/notifications/schedule \
-H "Content-Type: application/json" \
-H "Authorization: Bearer <your_token>" \
-d '{"title": "Reminder Alert", "message": "Check PRs!", "delayMs": 5000}'
```
> [!NOTE]
> After executing this endpoint, check your Node.js console terminal. You will see a log indicating the notification has been scheduled, and after 5 seconds, a simulated alert log will appear.
