import express from 'express'
import { fileURLToPath } from 'node:url'
import { repositoriesRouter } from './repository-routes.ts'
import { createReviewRouter } from './review-routes.ts'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' })
})

app.use('/api/repositories', repositoriesRouter)
app.use('/api/ai', createReviewRouter())
app.use(express.static(fileURLToPath(new URL('../../front/dist/', import.meta.url))))

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`)
})
