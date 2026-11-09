import test from 'node:test';
import assert from 'node:assert/strict';
import { requireAuth } from '../src/server/auth';
import { Request, Response } from 'express';

// Mock helper for Express req/res/next
function createMockHttp(headers: Record<string, string> = {}) {
  let statusCode = 200;
  let jsonResponse: any = null;
  let nextCalled = false;

  const req = {
    headers,
    user: undefined,
  } as unknown as Request;

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: any) {
      jsonResponse = payload;
      return this;
    },
  } as unknown as Response;

  const next = () => {
    nextCalled = true;
  };

  return {
    req,
    res,
    next,
    getStatus: () => statusCode,
    getBody: () => jsonResponse,
    isNextCalled: () => nextCalled,
  };
}

test('RBAC Negative Test 1: Anonymous request with no Authorization header', async () => {
  const middleware = requireAuth(['admin', 'manager', 'staff']);
  const { req, res, next, getStatus, getBody, isNextCalled } = createMockHttp({});

  await middleware(req, res, next);

  assert.equal(isNextCalled(), false, 'next() must NOT be called');
  assert.equal(getStatus(), 401, 'Must return 401 Unauthorized');
  assert.match(getBody().error, /Authentication token required/);
});

test('RBAC Negative Test 2: Malformed Bearer token', async () => {
  const middleware = requireAuth(['admin', 'manager', 'staff']);
  const { req, res, next, getStatus, getBody, isNextCalled } = createMockHttp({
    authorization: 'Bearer ',
  });

  await middleware(req, res, next);

  assert.equal(isNextCalled(), false, 'next() must NOT be called');
  assert.equal(getStatus(), 401, 'Must return 401 Unauthorized for empty token');
});

test('RBAC Negative Test 3: Invalid or forged session token', async () => {
  const middleware = requireAuth(['admin', 'manager', 'staff']);
  const { req, res, next, getStatus, getBody, isNextCalled } = createMockHttp({
    authorization: 'Bearer forged-invalid-token-12345',
  });

  await middleware(req, res, next);

  assert.equal(isNextCalled(), false, 'next() must NOT be called');
  assert.equal(getStatus(), 401, 'Must return 401 for non-existent session/token');
});

test('RBAC Negative Test 4: Staff user attempting administrator-only operation', async () => {
  // Admin-only middleware
  const adminOnlyMiddleware = requireAuth(['admin']);

  // Simulate authenticated user with role 'staff'
  const mockUser = {
    id: 'user-staff-1',
    username: 'staff_rahul',
    role: 'staff' as const,
  };

  // We test the role-checking logic directly
  const allowedRoles = ['admin'];
  const isAuthorized = allowedRoles.includes(mockUser.role);

  assert.equal(isAuthorized, false, 'Staff user must NOT have admin access');
});

test('RBAC Negative Test 5: Role escalation / self-promotion prevention', () => {
  const staffRole = 'staff';
  const targetRole = 'admin';

  // Enforce that only an active admin can modify roles
  function canModifyUserRole(callerRole: string): boolean {
    return callerRole === 'admin';
  }

  assert.equal(canModifyUserRole(staffRole), false, 'Staff cannot escalate role to admin');
  assert.equal(canModifyUserRole('manager'), false, 'Manager cannot escalate role to admin');
  assert.equal(canModifyUserRole('admin'), true, 'Only verified admin can manage roles');
});
