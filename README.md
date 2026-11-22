# Tila

Tila is a React safety app with server-backed accounts, trusted contacts, location sharing, SOS SMS, and persistent safety timers.

## Requirements

- Node.js 22.12 or newer
- A Twilio account and an SMS-enabled sender (a Twilio phone number or Messaging Service)
- A persistent disk for the SQLite database when deployed

## Local setup

1. Install packages with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and exactly one of `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`.
4. Start the combined Vite and API server with `npm run dev`.
5. Open `http://localhost:5173` and create an account with your name, username, and password. No email address or phone number is required at sign-up. When signing in, enter your own phone number to save it to your account. Ethiopian mobile formats `09…`, `9…`, `+251…`, and `251…` are accepted and saved as `+251…`; other countries' international numbers are also accepted. Accounts migrated from an older version receive a username based on the part of their email before `@`.
6. Only add contacts who have explicitly agreed to receive emergency texts. Ethiopian mobile formats `09…` and `+251…` are accepted for contacts and normalized to international format.

Keep the `.env` file private. Twilio secrets belong only in the Node server environment; never put them in `VITE_*` variables, browser storage, or source control. The server requires HTTPS in production for secure session cookies.

## Alerts and timers

- One-tap SOS immediately sends an SMS to every consented contact in rank order.
- When a timer reaches zero, the app gives the user a 1-minute response window. Tapping **I'm okay — add 5 minutes** restarts the timer; no response queues the SOS SMS when trusted contacts are available.
- Timers are persisted and processed by the Node server, even if the browser closes or the user navigates to another screen. A countdown works without Twilio or trusted contacts, but SOS texts require both Twilio configuration and at least one trusted contact. If no contact is available at expiry, the app records that it could not send a text; the in-browser alarm and response prompt require the app to be open. Keep one server instance running and use persistent disk storage; the built-in SQLite database and in-process scheduler are not configured for serverless or multi-replica deployments.
- SOS requests try to get a fresh GPS fix before sending and include a Google Maps link. If location permission is unavailable, the server uses the last saved coordinates and includes their update time, or clearly says when no location is available. An in-app notification appears at the top with the delivery status and whether a location link was included.
- Tila sends SMS only. It does not automatically call contacts or emergency services. Twilio delivery depends on account status, sender configuration, recipient availability, and regional messaging rules. The app shows delivery status and errors.
- The emergency feature is not a substitute for contacting local emergency services.

## Production

Build the client with `npm run build`, then run `npm start` with `NODE_ENV=production`, the Twilio environment variables, and a persistent `TILA_DB_PATH`. Deploy the app and API on the same HTTPS origin. Use a single Node instance for the SQLite database and timer scheduler.

## Validation

- `npm run lint`
- `npm run build`
