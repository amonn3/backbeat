import { httpServer } from "./app.js"

const PORT = Number(process.env.PORT ?? 3101)

httpServer.listen(PORT, () => {
  console.log(`[backbeat] servidor em http://localhost:${PORT}`)
})
