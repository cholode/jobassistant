import test from 'node:test';
import assert from 'node:assert/strict';
import { executeBrowserCommand } from '../dist-electron/electron/browser/rpc.js';
import { searchJobs } from '../dist-electron/electron/browser/search-rpc.js';

const origin = 'http://127.0.0.1:8765';

test('自主搜索仅接受受限参数，暂停时不导航，过期页面不返回候选', async () => {
  let url = 'https://www.zhipin.com/web/geek/job';
  let calls = 0;
  let stale = false;
  let revision = 0;
  const target = {
    navigate: async (value) => {
      url = value;
      calls++;
    },
    getUrl: async () => url,
    getRevision: () => revision,
    evaluate: async () => {
      if (stale) revision++;
      return { url, kind: 'job_list', jobs: [] };
    },
  };
  for (const payload of [
    { keyword: 'Go', page: 1, url: 'https://evil.test' },
    { keyword: 'Go', page: 0 },
    { keyword: 'Go', page: 31 },
    { keyword: '', page: 1 },
  ]) {
    expectFailure(await searchJobs(target, { request_id: 'test', payload }, () => true));
  }
  const message = { request_id: 'test', payload: { keyword: 'Go & Java', page: 2 } };
  expectFailure(await searchJobs(target, message, () => false));
  assert.equal(calls, 0);
  const valid = await searchJobs(target, message, () => true);
  assert.equal(valid.success, true);
  assert.equal(new URL(url).searchParams.get('query'), 'Go & Java');
  assert.equal(new URL(url).searchParams.get('page'), '2');
  stale = true;
  expectFailure(await searchJobs(target, message, () => true));
});

function expectFailure(result) {
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'SEARCH_FAILED');
}
const command = {
  type: 'browser_command',
  request_id: 'test',
  command: 'GET_PAGE_DATA',
  payload: { expected_url: null },
};
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
  target.evaluate = () => {
    throw new Error('不应执行任何页面脚本');
  };
  for (const name of ['EVALUATE', 'CLICK', 'FILL', 'NAVIGATE']) {
    const result = await executeBrowserCommand(target, origin, {
      ...command,
      command: name,
    });
    assert.equal(result.error.code, 'UNSUPPORTED_COMMAND');
  }
  const result = await executeBrowserCommand(target, origin, {
    ...command,
    payload: { expected_url: null, selector: 'button' },
  });
  assert.equal(result.error.code, 'INVALID_PAYLOAD');
});

test('读取前后都校验页面，加载中或导航后的结果不能显示', async () => {
  const old = await executeBrowserCommand(browser(), origin, {
    ...command,
    payload: { expected_url: `${origin}/mock/#job/1` },
  });
  assert.equal(old.error.code, 'STALE_PAGE');
  const changed = await executeBrowserCommand(
    browser({ changed: true }),
    origin,
    command,
  );
  assert.equal(changed.error.code, 'STALE_PAGE');
  const loading = await executeBrowserCommand(
    browser({ loading: true }),
    origin,
    command,
  );
  assert.equal(loading.error.code, 'NOT_READY');
});

test('语义命令要求正确页面类型并保留请求编号', async () => {
  const result = await executeBrowserCommand(browser(), origin, command);
  assert.equal(result.success, true);
  assert.equal(result.request_id, command.request_id);
  const wrong = await executeBrowserCommand(browser(), origin, {
    ...command,
    command: 'GET_CHAT_MESSAGES',
  });
  assert.equal(wrong.error.code, 'WRONG_PAGE');
});
