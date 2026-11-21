# ColdChain Pulse backend

Backend MVP for MedSwift Logistics Ltd. by 41_B1 (Non Major). The backend uses Node.js, Express, and MongoDB. It provides the REST API for the React screens in the [Figma prototype](https://alone-tan-83805626.figma.site/).

## Run with MongoDB Atlas

Use Node.js 24 or later. Create an Atlas cluster and a MongoDB database user with read/write access to the `coldchain` database. Add the IP address of the machine running the backend to the Atlas project IP access list. In the cluster's Connect dialog, choose Drivers and copy the Node.js connection string. Replace the username and password placeholders with the database user's credentials, percent-encoding reserved characters in the username and password. [Atlas connection instructions](https://www.mongodb.com/docs/atlas/connect-to-database-deployment/?interface=atlas-ui)

In `.env` beside `server.mjs`, fill in `MONGODB_URI`, `ADMIN_PASSWORD`, and `REPORT_KEY`. Git ignores this file. Generate a signing key in PowerShell and paste the output into `REPORT_KEY`.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Then install dependencies and start the server from the backend folder.

```powershell
npm.cmd ci
npm.cmd start
```

The server listens at `http://127.0.0.1:3000`. Open `/health` to check startup. Sign in through `POST /api/login` as `admin` with the password chosen above. The first startup creates the MongoDB collections, indexes, and application admin account. The MongoDB database user and application admin are separate accounts. Keep the connection string and report signing key private. Reuse the signing key across restarts to verify previous reports. Set `PORT` for a different port and `FRONTEND_ORIGIN` to the exact frontend origin, such as `http://localhost:5173`.

A local MongoDB replica set also works. Configure `MONGODB_URI` with its connection string, for example `mongodb://127.0.0.1:27017/?replicaSet=rs0`. Handoff transitions, telemetry ingestion, and report snapshots use transactions, which require a replica set or sharded cluster. [MongoDB Node.js transaction guide](https://www.mongodb.com/docs/drivers/node/v6.x/crud/transactions/)

Run `npm.cmd test` for the alert timing unit test. Set `MONGODB_TEST_URI` in `.env` to a disposable MongoDB replica set to include integration tests. The test credential must be allowed to create and drop the randomly named `coldchain_test_*` databases. The integration tests cover RBAC, failed login audit records, concurrent telemetry replay, handoff sequencing, signed exports, and simulator and API pagination with 500 active shipments.

## REST API

Send JSON with `Content-Type: application/json` and use `Authorization: Bearer <token>` after login. Requests use camelCase fields and timestamps in Unix milliseconds. Database-backed response records use snake_case. Sessions last 12 hours. Drivers and clinic receivers can only access shipments assigned to them.

| Method and path | Roles | Input or behavior |
| --- | --- | --- |
| GET `/health` | Public | Returns server status |
| POST `/api/login` | Public | `username`, `password`. Returns `token` and `user` |
| GET `/api/me` | All signed-in roles | Current user's ID, username, and role |
| GET `/api/dashboard` | Admin, Dispatcher, Auditor | Shipment counts by state, total critical alerts and vehicles, and ten recent alerts and handoffs |
| POST `/api/users` | Admin | `username`, `password` (12–256 characters), `role`. Returns `id` |
| GET `/api/users` | Admin, Dispatcher | Driver and clinic receiver IDs for assignment. Admin can use `?all=true` to view all accounts |
| GET / POST `/api/vehicles` | Admin, Dispatcher | List vehicles or create with `plate` |
| POST `/api/shipments` | Admin, Dispatcher | `batch`, `origin`, `destination`, `vehicleId`, `driverId`, `receiverId`, `minTemp`, `maxTemp`, `eta`, `pickupPin`, `deliveryPin`. Returns `id`, `pickupQr`, `deliveryQr` |
| GET `/api/shipments?limit=50&after=0` | All signed-in roles | Optional `status` and `q` filters. Search accepts numeric ID, batch, destination, or product. Returns `items` and `nextAfter`, which is null on the last page. Includes latest temperature, humidity, location, and ETA when available |
| GET `/api/shipments/:id` | All signed-in roles | Shipment details |
| PATCH `/api/shipments/:id/eta` | Admin, Dispatcher, assigned Driver | Updated `eta` for an active shipment |
| PATCH `/api/shipments/:id/location` | Admin, Dispatcher, assigned Driver | `latitude`, `longitude`, `recordedAt` for an in-transit shipment. An older update returns 409 |
| GET `/api/shipments/:id/telemetry?after=0` | All signed-in roles | Up to 100 readings in insertion order |
| POST `/api/shipments/:id/telemetry` | Admin, Dispatcher, assigned Driver | `eventId`, `recordedAt`, `temperature`, `humidity` |
| GET `/api/shipments/:id/handoffs?after=0` | All signed-in roles | Up to 100 handoff records in insertion order |
| POST `/api/shipments/:id/handoffs` | Assigned Driver for pickup or delivery, assigned Receiver for delivery | `eventId`, `stage` (`pickup` or `delivery`), `qr`, `pin`, `recordedAt`, `latitude`, `longitude`, `condition` |
| GET `/api/alerts?after=0` | Admin, Dispatcher, assigned Driver, Auditor | Poll for up to 100 new Warning and Critical alerts |
| GET `/api/batches/:batch/report.csv` or `report.pdf` | Admin, Dispatcher, Auditor | Batch temperature history, handoffs, and alerts. Percent-encode the batch value |
| GET `/api/audit` | Admin, Auditor | Latest 100 failed login attempts |

Valid role values are `admin`, `dispatcher`, `driver`, `receiver`, and `auditor`. Cursor endpoints for telemetry, handoffs, and alerts return `{items, nextAfter}`. Poll again using the latest cursor. An empty page retains the previous cursor. Errors return `{error}` with the appropriate HTTP status.

Shipment creation also accepts optional `product`, `category`, `humidityWarning` (0–100 percent), and `criticalMinutes` (1–120, default 10). Humidity above the configured limit can start a Warning. Critical alerts still require a sustained temperature excursion, with a gap over 60 seconds breaking continuity. Older shipment documents use the 10-minute default.

Set `FRONTEND_ORIGIN` to the React app's origin. For multiple environments use a comma-separated list such as `http://localhost:5173,https://frontend.example`. The React client can use login and `/api/me` for navigation, `/api/dashboard` and the shipment list for Overview, and shipment location for Live Tracking. GPS points are supplied by the driver or dispatcher. The published Figma prototype uses demo data and needs React API integration to display live data.

## Demo flow

1. Create a driver, a clinic receiver, and a vehicle. Use their IDs to create a shipment with a range such as 2°C to 8°C and separate numeric PINs of 4–8 digits.
2. Use the returned QR values as the QR payloads and provide the stage-specific PIN to the party confirming each handoff. The driver submits pickup to move the shipment to `in_transit`. A vehicle can carry one active shipment in this MVP.
3. The server samples in-transit shipments every 30 seconds. A reading at or within 0.5°C of a limit (less for narrow ranges), or outside the range, opens a Warning. A sustained same-side breach strictly longer than 10 minutes triggers a Critical alert. A gap longer than 60 seconds breaks continuity. Some shipment IDs generate recurring excursions. Dispatchers and drivers poll the alerts endpoint.
4. Generate unique event IDs in the driver UI and queue telemetry and handoffs with the original captured timestamps. Replay pickup before delivery. A new event returns 201, an identical replay returns 200, and conflicting reuse returns 409. Prefix `sim-` is reserved. Late readings are inserted and replayed chronologically to calculate alerts. Previously issued alerts stay in the append-only history even when later data changes the reconstructed timeline.
5. Confirm delivery and download the batch report. Save the `X-Report-HMAC-SHA256` header alongside the unchanged file. A trusted verifier can recompute the HMAC over the file bytes with the report key to check for changes. The PDF uses a basic ASCII font. The CSV preserves Unicode.

## Hosting and migration

Local development uses HTTP. For shared use, run the Node process behind HTTPS and connect it to MongoDB Atlas or another persistent MongoDB deployment. The 30-second simulator uses a long-running Node process. A serverless deployment requires a separate runner for the simulator. ETA is supplied by drivers or dispatchers through the API.

The API exposes telemetry, handoffs, alerts, and login audit records as append-only. For database-level enforcement, initialize collections and indexes once with a provisioning credential. Then set `MONGODB_INITIALIZE=false` and run with a custom MongoDB role scoped to this database. Grant `find` and `insert` on `telemetry`, `handoffs`, `alerts`, `audit`, `users`, `vehicles`, and `sessions`. Grant `find`, `insert`, and `update` on `shipments` and `alert_state`, plus `find` and `update` on `counters`. Use the runtime credential in `MONGODB_URI`. A broad database read/write role permits direct database edits.

MongoDB starts with its own data. Any existing SQLite database file can be kept separately. Importing existing SQLite records requires a data migration.

## Connect the existing React frontend

The sibling frontend uses the browser API contract in `frontend/src/api/index.ts`. It sends
`Accept: application/json` and calls `/api/auth/login`, `/api/auth/me`, `/api/stats/overview`,
`/api/handoffs`, and `/api/temperature-logs`. Shared list and detail routes return the frontend's
camelCase objects and string IDs to that client. The earlier cursor API remains available to clients
using the cursor parameters or the default fetch Accept header.

Start the backend with `npm.cmd start` in this folder. Set `FRONTEND_ORIGIN=http://localhost:5173`
in the backend's `.env` for local Vite access. In a separate PowerShell terminal at the repository
root, use these process settings when starting the existing frontend:

```powershell
$env:VITE_USE_MOCK_API = 'false'
$env:VITE_API_BASE_URL = 'http://127.0.0.1:3000/api'
npm.cmd --prefix frontend run dev
```

Use your backend `admin` account to sign in. Provision a driver, a clinic receiver (backend
role `receiver`), and a vehicle through the admin APIs. The current create-shipment form has no
receiver selector. With a single clinic receiver, the backend assigns that account. With multiple
receivers, set `FRONTEND_RECEIVER_ID` in the backend environment to the intended numeric user ID.

The manager-only `GET /api/shipments/:id/handoff-credentials` route returns the label payload
and stage-specific PINs for a shipment created through the React contract. Use the returned
`CCP:<id>` as the QR payload and give each PIN privately to the party confirming that stage.
Keep the report signing key stable so previously generated PINs remain recoverable. Handoff
history preserves the signature and GPS when supplied. Response records omit the PIN value.
The React audit UI exports its own files. Server-signed batch exports remain available through
the CSV and PDF endpoints above.

If running with a restricted MongoDB credential, provision the `alert_acknowledgements`
collection and grant its runtime credential `find` and `insert` on that collection.
