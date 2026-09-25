const { app, BrowserWindow, WebContentsView } = require('electron');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  const view = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.contentView.addChildView(view);
  await view.webContents.loadURL('data:text/html,<title>environment-ok</title>');
  if (view.webContents.getTitle() !== 'environment-ok') throw new Error('WebContentsView check failed');
  console.log(`PASS: Electron ${process.versions.electron}, WebContentsView`);
  view.webContents.close();
  window.destroy();
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
