// 打包 VR 版 APK：vite 构建 → 塞进 assets/www → aapt2 / javac / d8 / zipalign / apksigner
// 用法：npm run apk:vr            （加 --install 则顺便 adb 安装到已连接的头显）
// 环境变量：ANDROID_SDK（默认 C:\Android\sdk）、JAVA17_HOME（默认 C:\Android\jdk17）
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SDK = process.env.ANDROID_SDK || process.env.ANDROID_HOME || 'C:\\Android\\sdk';
const JDK = process.env.JAVA17_HOME || 'C:\\Android\\jdk17';
const BT = path.join(SDK, 'build-tools', fs.readdirSync(path.join(SDK, 'build-tools')).sort().pop());
const PLATFORM = path.join(SDK, 'platforms', fs.readdirSync(path.join(SDK, 'platforms')).sort().pop(), 'android.jar');
const ADB = path.join(SDK, 'platform-tools', 'adb.exe');
const proj = path.join(root, 'vr-apk');
const build = path.join(proj, 'build');
const out = path.join(proj, 'out');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const env = { ...process.env, JAVA_HOME: JDK, PATH: path.join(JDK, 'bin') + path.delimiter + process.env.PATH };

const run = (exe, args, opt = {}) => {
  console.log('>', path.basename(exe), args.join(' ').slice(0, 160));
  const bat = /\.(bat|cmd)$/i.test(exe);
  return execFileSync(bat ? 'cmd.exe' : exe, bat ? ['/c', exe, ...args] : args, { stdio: 'inherit', env, cwd: root, ...opt });
};
const walk = (dir, ext) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), ext) : e.name.endsWith(ext) ? [path.join(dir, e.name)] : []));

// 1. 网页构建
run('cmd.exe', ['/c', 'npx', 'vite', 'build', '--base=./']);
fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(path.join(build, 'assets'), { recursive: true });
fs.mkdirSync(out, { recursive: true });
const www = path.join(build, 'assets', 'www');
fs.cpSync(path.join(root, 'dist'), www, { recursive: true });
// 头显可能离线 / 连不上字体站：在线字体改成非阻塞加载，连不上也不卡首屏
const indexFile = path.join(www, 'index.html');
let html = fs.readFileSync(indexFile, 'utf8');
html = html.replace(/<link rel="preconnect"[^>]*>\s*/g, '')
  .replace(/<link href="(https:\/\/fonts\.googleapis\.com[^"]+)" rel="stylesheet"\s*\/?>/, '<link href="$1" rel="stylesheet" media="print" onload="this.media=\'all\'" />');
fs.writeFileSync(indexFile, html);

// 2. 资源 + 清单
run(path.join(BT, 'aapt2.exe'), ['compile', '--dir', path.join(proj, 'res'), '-o', path.join(build, 'res.zip')]);
run(path.join(BT, 'aapt2.exe'), ['link', '-o', path.join(build, 'base.apk'), '-I', PLATFORM, '--manifest', path.join(proj, 'AndroidManifest.xml'),
  '--java', path.join(build, 'gen'), '--version-name', `${version}-vr`, path.join(build, 'res.zip')]);

// 3. Java → dex
const classes = path.join(build, 'classes');
fs.mkdirSync(classes, { recursive: true });
run(path.join(JDK, 'bin', 'javac.exe'), ['-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options', '-cp', PLATFORM, '-d', classes,
  ...walk(path.join(proj, 'src'), '.java'), ...walk(path.join(build, 'gen'), '.java')]);
run(path.join(BT, 'd8.bat'), ['--release', '--min-api', '26', '--lib', PLATFORM, '--output', build, ...walk(classes, '.class')]);
// 游戏文件用 aapt 逐个加入（aapt2 的 -A 在 Windows 上会把子目录写成反斜杠路径，运行时读不到）
const assetFiles = walk(path.join(build, 'assets'), '').map((f) => path.relative(build, f).split(path.sep).join('/'));
run(path.join(BT, 'aapt.exe'), ['add', 'base.apk', 'classes.dex', ...assetFiles], { cwd: build });

// 4. 对齐 + 签名（调试签名；密钥留在本机，不进仓库）
const ks = path.join(proj, 'debug.keystore');
if (!fs.existsSync(ks)) {
  run(path.join(JDK, 'bin', 'keytool.exe'), ['-genkeypair', '-keystore', ks, '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey',
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Android Debug,O=Android,C=US']);
}
const aligned = path.join(build, 'aligned.apk');
const apk = path.join(out, `zombie-strike-vr-${version}.apk`);
run(path.join(BT, 'zipalign.exe'), ['-f', '4', path.join(build, 'base.apk'), aligned]);
run(path.join(BT, 'apksigner.bat'), ['sign', '--ks', ks, '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', apk, aligned]);
console.log(`\nAPK: ${apk}  (${(fs.statSync(apk).size / 1048576).toFixed(2)} MB)`);

if (process.argv.includes('--install')) run(ADB, ['install', '-r', apk]);
