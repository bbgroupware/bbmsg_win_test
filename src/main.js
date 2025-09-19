// 앱 시작 후 제일 처음 불러지는 js, 초기설정 및 업데이트 등 진행
var fs = require('fs'),
	{app, globalShortcut, shell} = require('electron'),
//	{setJumpList} = require('./xMenu'),
	xINI = require('./xIni'), // ini설정 파일 관련 object
	createWindow = require('./createWindow'),
	xDebug = require('./xDebug'),
	xPath = require('./xPath'), // 각종 파일들의 디렉토리 설정 정보
	xUtil = require('./xUtil'),
	xUrl = require('./xUrl');

var mw, // messenger window
	domain = 'https://bb.bbgw.kr', // default domain
	isDev = xUtil.isDev,
	isSingleApp = isDev || app.requestSingleInstanceLock(); // 개발 or 첫 실행?

/* 버전 체크 https://www.electronjs.org/docs/latest/tutorial/electron-timelines
console.log(process.versions.electron); // 24.8.8
console.log(process.versions.chrome); // 112.0.5615.204
console.log(process.versions.node); // 18.14.0
//*/

// ready 이전 처리해야 될 내용
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // https통신 시 인증서 유효성 체크 안함
app.setPath('userData', xPath.cachePath); // 캐시 디렉토리 변경

// 앱 가동 준비완료 시
app.on('ready', function() {
	// rootPath 존재 안할 시 생성
	(!isDev && !fs.existsSync(xPath.rootPath)) && fs.mkdirSync(xPath.rootPath);
	xINI.getINI(domain); // INI파일 생성 or 로딩

	if (isSingleApp)
	{
		if (handleDeeplink(process.argv)) return;

		app.on('second-instance', function(event, commandLine, workingDirectory, additionalData) {
			if (handleDeeplink(commandLine)) return;
			mw && mw.show();
		});

		initApp();
	}
	else app.commandLine.hasSwitch('xbb-run-new') ? initApp() : app.quit();
});

app.on('will-quit', () => {
	globalShortcut.unregisterAll();
	isSingleApp && app.releaseSingleInstanceLock();
});

// 딥링크 실행 체크: deepLink=link string
function handleDeeplink(deepLink)
{
	const PROTOCOL_NAME = 'bbmsg';
	let link = deepLink.find(arg => arg.startsWith(PROTOCOL_NAME + '://'));

	if (link)
	{
		let {url} = new xUrl(link);
		
		switch (url.hostname) // cmd
		{
			case 'open': // open url
				shell.openExternal(url.searchParams.get('param')).then(() => {
					app.exit();
				});
				return !0;
		}
	}
}

function initApp()
{
	var lang = app.getLocale();

	if (lang != 'en')
	{
		/(ko|zh|ja|vi)/.test(lang) || (lang = 'en');
		app.commandLine.appendSwitch('lang', lang);
	}

//	app.commandLine.appendSwitch('enable-print-preview', 1); // -적용 x
	app.commandLine.appendSwitch('ignore-certificate-errors');
	app.commandLine.appendSwitch('no-sandbox');
	app.commandLine.appendSwitch('high-dpi-support', 1);
	app.commandLine.appendSwitch('force-device-scale-factor', 1);
	app.commandLine.appendSwitch('disable-web-security');
//	electron 버전 올리면 필요한거 (27버전 기준)
	/* 사양 낮은 pc에선 검은화면 출력될 수 있음
	app.commandLine.appendSwitch('disable-gpu-sandbox');
	app.commandLine.appendSwitch('use-angle', 'gl');
	//*/

	// 점프리스트 만들기
//	setJumpList({'ko': 0, 'en': 1, 'zh': 2, 'ja': 3, 'vi': 4}[lang]);

//	startApp();
	checkUpdate();
}

function checkUpdate()
{
	if (!isDev)
	{
		var cu = xUrl(xINI.getINI().url);

		// CAS 레파지토리 자동 마이그레이션용
		if (cu?.url.hostname == 'gw.casit.co.kr' && xUtil.version.lte('3.1.48'))
		{
			var xBrowserWindow = require('./xBrowserWindow');
			var {autoUpdater} = require('electron-updater');
			var xCus = require('./xCus');
			
			autoUpdater.allowDowngrade = !0;

			// 업데이트 체크 창에 들어갈 내용
			var uw = xBrowserWindow.createBrowser({tit: 'Checking for update'}, {closable: !1, resizable: !1}),
				uc = uw.webContents,
				html = '<body><span id=st></span><div class=bg><div id=pc></div></div></body><script>function setSt(s){document.getElementById("st").textContent=s};function setPc(n){document.getElementById("pc").style.width=n+"%"}</script>',
				css = '*{margin:0;box-sizing:border-box;}html,body,#pc{height:100%;user-select:none;}body{display:flex;flex-direction:column;justify-content:center;padding:8px;border-radius:4px;overflow:hidden;}.bg{width:100%;height:16px;position:relative;background-color:#ccc}#pc{position:absolute;background-color:#479aff;}#st{margin-bottom:4px;}';

			uw.setSize(xBrowserWindow.defaultSize.uw.width, xBrowserWindow.defaultSize.uw.height);
			uw.center();
			uw.on('close', (evt) => {
				evt.preventDefault();
			});
			uc.insertCSS(css);
			// setSt(String)=타이틀 설정, setPc(number)=프로세스 퍼센트 설정
			uw.loadURL('data:text/html;charset=utf-8,' + encodeURI(html)).then(function() {
				autoUpdater.on('checking-for-update', function() { // 버전 체크
					uc.executeJavaScript('setSt("Checking latest version...")');
				});
				
				autoUpdater.on('update-available', function(obj) { // 업데이트 가능
					global.xbbVersion = obj.version;
				});

				autoUpdater.on('update-not-available', function(obj) { // 업데이트 불가능
					global.xbbVersion = obj.version;
					startApp();
				});

				autoUpdater.on('error', function(obj) { // 에러
					global.xbbVersion = obj.version;
					startApp();
				});

				autoUpdater.on('download-progress', function(obj) { // 다운로드 중
					uc.executeJavaScript('setSt("Downloading update files... (' + parseInt(obj.percent) + '%)")');
					uc.executeJavaScript('setPc(' + parseInt(obj.percent) + ')');
				});

				autoUpdater.on('update-downloaded', function(obj) { // 업데이트 파일 다운로드 완료
					autoUpdater.quitAndInstall();
				});
				
				// 구축형 메신저의 경우 update 경로 변경
				let customRepository = xCus(cu.url.href);
				if (customRepository)
				{
					autoUpdater.setFeedURL({
						provider: 'generic',
						url: customRepository
					});
				}
				
				autoUpdater.checkForUpdates();
			});
		}
		else startApp();
	}
	else startApp();
}

function startApp()
{
	(mw = createWindow({isSingleApp}).mw).focus();
}

// 에러 핸들링
process.on('uncaughtException', function (error) {
	xDebug.appendWithError(error.stack || error.message);
	app.exit();
});