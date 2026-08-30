/**
 * @jest-environment jsdom
 */
import { checkLoginThrottle, recordLoginFailure, recordLoginSuccess } from '../js/auth/login-throttle.js';

beforeEach(() => { sessionStorage.clear(); });

test('não bloqueia nas primeiras 5 tentativas', () => {
  for (let i = 0; i < 5; i++) {
    expect(checkLoginThrottle().blocked).toBe(false);
    recordLoginFailure();
  }
});

test('bloqueia a partir da 5ª falha com cooldown', () => {
  for (let i = 0; i < 5; i++) recordLoginFailure();
  const r = checkLoginThrottle();
  expect(r.blocked).toBe(true);
  expect(r.waitSeconds).toBeGreaterThan(0);
  expect(r.waitSeconds).toBeLessThanOrEqual(30);
});

test('backoff aumenta a cada falha extra', () => {
  for (let i = 0; i < 5; i++) recordLoginFailure();
  const first = checkLoginThrottle().waitSeconds;
  recordLoginFailure();
  const second = checkLoginThrottle().waitSeconds;
  expect(second).toBeGreaterThan(first);
});

test('sucesso zera o throttle', () => {
  for (let i = 0; i < 6; i++) recordLoginFailure();
  expect(checkLoginThrottle().blocked).toBe(true);
  recordLoginSuccess();
  expect(checkLoginThrottle().blocked).toBe(false);
});
