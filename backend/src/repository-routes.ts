import express from 'express'
import type { ErrorRequestHandler } from 'express'
import { ApiError } from './github.ts'
import { listBranches, resolveRepository } from './repositories.ts'
import { scanRepository } from './scan.ts'

export const repositoriesRouter = express.Router()

repositoriesRouter.post('/resolve', express.json({ limit: '8kb' }), async (request, response) => {
  response.json(await resolveRepository(request.body?.url))
})

repositoriesRouter.get('/:owner/:repo/branches', async (request, response) => {
  const page = request.query.page ?? '1'
  if (typeof page !== 'string' || !/^[1-9][0-9]*$/.test(page)) throw new ApiError('INVALID_PAGE')
  response.json(await listBranches(request.params.owner, request.params.repo, Number(page)))
})

repositoriesRouter.post('/:owner/:repo/scan', express.json({ limit: '8kb' }), async (request, response) => {
  const branch: unknown = request.body?.branch
  if (typeof branch !== 'string' || !branch.trim()) throw new ApiError('INVALID_BRANCH')
  response.json(await scanRepository(request.params.owner, request.params.repo, branch))
})

const sendError: ErrorRequestHandler = (error, _request, response, _next) => {
  const clientError = error instanceof ApiError
    ? error
    : new ApiError([400, 413, 415].includes(error?.status) ? 'INVALID_REQUEST' : 'INTERNAL_ERROR')
  if (clientError.retryAt !== undefined) {
    response.set('Retry-After', String(Math.max(1, Math.ceil((clientError.retryAt - Date.now()) / 1000))))
  }
  response.status(clientError.status).json({
    error: { code: clientError.code, message: clientError.message },
  })
}

repositoriesRouter.use(sendError)
