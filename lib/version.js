// 本文件由 scripts/build-version.mjs 生成，请勿手改。
// 唯一来源：仓库根目录的 VERSION。改版本先改 VERSION，再跑 npm run build:version。
export const version = '0.1.0'
export const build = '2026-10-24'
export const channel = 'beta'
export const commit = 'c845884'

export const displayVersion = `v${version}`
export const channelLabel = '开发版 · 数据仅在本机'

export const APP_INFO = Object.freeze({
  version,
  displayVersion,
  build,
  channel,
  channelLabel,
  commit,
})
