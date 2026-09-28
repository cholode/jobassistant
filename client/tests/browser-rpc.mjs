import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBrowserCommand } from '../dist-electron/electron/browser/rpc.js';

const origin = 'http://127.0.0.1:8765';
const command = { type: 'browser_command', request_id: 'test', command: 'GET_PAGE_DATA', payload: { expected_url: null } };
function browser({ changed = false, loading = false } = {}) {
  let revision = 0;
  return {
    getRevision: () => revision,
    isLoading: () => loading,
    getUrl: async () => `${origin}/mock/`,
    waitFor: async () => true,
    evaluate: async () => {
      if (changed) revision++;
      return { url: `${origin}/mock/`, kind: 'job_list' };
    },
  };
}

test('拒绝脚本、选择器和写入命令', async () => {
  const target = browser();
  target.evaluate = () => { throw new Error('不应执行任何页面脚本'); };
  for (const name of ['EVALUATE', 'CLICK', 'FILL', 'NAVIGATE']) {
    const result = await executeBrowserCommand(target, origin, { ...command, command: name });
    assert.equal(result.error.code, 'UNSUPPORTED_COMMAND');
  }
  const result = await executeBrowserCommand(target, origin, { ...command, payload: { expected_url: null, selector: 'button' } });
  assert.equal(result.error.code, 'INVALID_PAYLOAD');
});

test('读取前后都校验页面，加载中或导航后的结果不能显示', async () => {
  const old = await executeBrowserCommand(browser(), origin, { ...command, payload: { expected_url: `${origin}/mock/#job/1` } });
  assert.equal(old.error.code, 'STALE_PAGE');
  const changed = await executeBrowserCommand(browser({ changed: true }), origin, command);
  assert.equal(changed.error.code, 'STALE_PAGE');
  const loading = await executeBrowserCommand(browser({ loading: true }), origin, command);
  assert.equal(loading.error.code, 'NOT_READY');
});

test('语义命令要求正确页面类型并保留请求编号', async () => {
  const result = await executeBrowserCommand(browser(), origin, command);
  assert.equal(result.success, true);
  assert.equal(result.request_id, command.request_id);
  const wrong = await executeBrowserCommand(browser(), origin, { ...command, command: 'GET_CHAT_MESSAGES' });
  assert.equal(wrong.error.code, 'WRONG_PAGE');
});
