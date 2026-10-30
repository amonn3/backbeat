// Vercel entry: one Node.js function serves the REST API and the Socket.IO
// WebSocket. vercel.json rewrites every /api/* request here.
import { httpServer } from "../server/app.js"

export default httpServer
