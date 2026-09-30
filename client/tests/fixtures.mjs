// 桌面测试基础工具：申请本地临时端口，隔离开发实例。

import net from 'node:net';

// 集成测试使用临时端口，不关闭或占用用户正在运行的桌面客户端。
export async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  // 端口 0 由系统分配；读取后释放，再由测试服务绑定，不保证长期占用。
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
