import assert from 'node:assert/strict';
import test from 'node:test';
import { canTransitionJarvis } from './jarvis-voice-state';
test('Jarvis voice lifecycle follows the local wake state machine', () => { for (const [from, to] of [['idle', 'wake_listening'], ['wake_listening', 'listening'], ['listening', 'transcribing'], ['transcribing', 'thinking'], ['thinking', 'speaking'], ['speaking', 'wake_listening'], ['thinking', 'error'], ['error', 'wake_listening']] as const) assert.equal(canTransitionJarvis(from, to), true); assert.equal(canTransitionJarvis('idle', 'speaking'), false); });
