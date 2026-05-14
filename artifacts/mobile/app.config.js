const fs = require('fs');
const path = require('path');

function parseDotenv(contents) {
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .reduce((env, line) => {
      const equalIndex = line.indexOf('=');
      if (equalIndex === -1) return env;
      const key = line.slice(0, equalIndex).trim();
      const value = line.slice(equalIndex + 1).trim();
      env[key] = value;
      return env;
    }, {});
}

function loadDotenv() {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return {};
  return parseDotenv(fs.readFileSync(envPath, 'utf8'));
}

const appJson = require('./app.json');
const env = { ...process.env, ...loadDotenv() };

const expoPublicDomain = env.EXPO_PUBLIC_DOMAIN || appJson.expo?.extra?.expoPublicDomain || '';
const apiBaseUrl = env.API_BASE_URL || (expoPublicDomain ? `https://${expoPublicDomain}` : '');

module.exports = () => ({
  ...appJson,
  expo: {
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      expoPublicDomain,
      apiBaseUrl,
    },
  },
});
