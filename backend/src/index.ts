import express from 'express'
import { repositoriesRouter } from './repository-routes.ts'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' })
})

app.use('/api/repositories', repositoriesRouter)

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`)
})
