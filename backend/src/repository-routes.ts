import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { ApiError } from './github.ts'
import { listBranches, resolveRepository } from './repositories.ts'

export const repositoriesRouter = express.Router()

repositoriesRouter.post('/resolve', express.json({ limit: '8kb' }), async (request, response) => {
  response.json(await resolveRepository(request.body?.url))
})

repositoriesRouter.get('/:owner/:repo/branches', async (request, response) => {
  const page = request.query.page ?? '1'
  if (typeof page !== 'string' || !/^[1-9][0-9]*$/.test(page)) throw new ApiError('INVALID_PAGE')
  response.json(await listBranches(request.params.owner, request.params.repo, Number(page)))
})

const sendError: ErrorRequestHandler = (error, _request, response, _next) => {
  const clientError = error instanceof ApiError
    ? error
    : new ApiError([400, 413, 415].includes(error?.status) ? 'INVALID_REQUEST' : 'INTERNAL_ERROR')
  response.status(clientError.status).json({
    error: { code: clientError.code, message: clientError.message },
  })
}

repositoriesRouter.use(sendError)
