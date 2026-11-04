// 打安卓 APK：构建网页 → 同步到 Capacitor 工程 → Gradle 打签名包 → 复制到 dist-android/
// 用法：npm run build:android          （正式签名包）
//       npm run build:android -- debug （调试包）
// Java 和 Android SDK 默认用 Unity 自带的那套，可用环境变量 ANDROID_JAVA_HOME 覆盖。
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const UNITY_ANDROID = 'D:/unity/6000.0.23f1/Editor/Data/PlaybackEngines/AndroidPlayer';
const JAVA_HOME = process.env.ANDROID_JAVA_HOME ?? `${UNITY_ANDROID}/OpenJDK`;
const debug = process.argv.includes('debug');

if (!existsSync(JAVA_HOME)) {
  console.error(`找不到 Java：${JAVA_HOME}\n请设置环境变量 ANDROID_JAVA_HOME 指向 JDK 17`);
  process.exit(1);
}
if (!debug && !existsSync('android-keys/keystore.properties')) {
  console.error('找不到签名密钥 android-keys/keystore.properties，只能打调试包：npm run build:android -- debug');
  process.exit(1);
}

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts });
// 调试包保留 window.__game，方便用 DevTools 在真机上量性能
run('npm run build', { env: debug ? { ...process.env, VITE_DEBUG_GAME: '1' } : process.env });
run('npx cap sync android');

const env = { ...process.env, JAVA_HOME, PATH: `${join(JAVA_HOME, 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}` };
// 用绝对路径：Windows 下 cmd 在含中文的目录里按相对路径找不到 gradlew.bat
const gradlew = `"${resolve('android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew')}"`;
run(`${gradlew} ${debug ? 'assembleDebug' : 'assembleRelease'}`, { cwd: 'android', env });

const variant = debug ? 'debug' : 'release';
const src = `android/app/build/outputs/apk/${variant}/app-${variant}.apk`;
const version = JSON.parse(readFileSync('package.json', 'utf-8')).version;
mkdirSync('dist-android', { recursive: true });
const dst = `dist-android/wendao-${version}-${variant}.apk`;
copyFileSync(src, dst);
console.log(`\n已生成 ${dst}`);
