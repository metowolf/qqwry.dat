import fetch from 'node-fetch'
import fs from 'fs'
import { execa } from 'execa'
import libqqwry from 'lib-qqwry'

const globalFetchHeaders = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

const getArticles = async () => {
  const url = 'https://mp.weixin.qq.com/mp/appmsgalbum?__biz=Mzg3Mzc0NTA3NA==&action=getalbum&album_id=2329805780276838401&f=json'
  const options = {
    method: 'GET',
    headers: {
      ...globalFetchHeaders
    }
  }
  const res = await fetch(url, options)
  const json = await res.json()
  const list = json.getalbum_resp.article_list
  return list.map(item => {
    return {
      title: item.title,
      url: item.url
    }
  })
}

const parseArticle = async (articles) => {
  for (const article of articles) {
    const url = article.url
    const options = {
      method: 'GET',
      headers: {
        ...globalFetchHeaders
      }
    }
    const res = await fetch(url, options)
    const html = await res.text()
    // 匹配 https://www.cz88.net/soft/M882k846-2023-12-20.zip
    const reg = /https:\/\/www\.cz88\.net\/soft\/[a-zA-Z0-9\-]+\.zip/g
    const match = html.match(reg)
    if (match && match.length > 0) {
      return match[0]
    }
  }
  return null
}

const download = async (url) => {
  await fs.promises.mkdir('./temp', { recursive: true })
  await execa('wget', ['-U', globalFetchHeaders['user-agent'], '-O', './temp/download.zip', url])
}

const extract = async () => {
  await execa('unzip', ['./temp/download.zip', '-d', './temp'])
  await execa('innoextract', ['./temp/setup.exe', '-d', './temp'])
  await fs.promises.mkdir('./dist', { recursive: true })
  await execa('mv', ['./temp/app/qqwry.dat', './dist/qqwry.dat'])
}

const parseQQwryInfo = async () => {
  const qqwry = libqqwry(true, './dist/qqwry.dat')

  const info = {
    count: 0,
    unique: 0,
  }
  
  const unique = new Set()

  let ip = '0.0.0.0'
  while (true) {
    let data = qqwry.searchIPScope(ip, ip)[0]
    // stat
    info.count += 1
    const hashkey = `${data.Country}${data.Area}`
    if (!unique.has(hashkey)) {
      info.unique += 1
      unique.add(hashkey)
    }
    if (data.endIP === '255.255.255.255') break
    ip = libqqwry.intToIP(data.endInt + 1)
  }

  return info
}

const readInfo = () => {
  const data = fs.readFileSync('./version.json', 'utf-8')
  return JSON.parse(data)
}

const parseQQWryVersion = async () => {
  const qqwry = libqqwry(true, './dist/qqwry.dat')
  const info = await qqwry.searchIP('255.255.255.255')
  return info.Area.match(/(\d+)/gi).join('')
}

const release = async () => {
  const info = await readInfo()
  const currentVersion = await parseQQWryVersion()
  if (info.latest === currentVersion || info.versions[currentVersion]) {
    console.log('No new version, skip')
    return
  }

  const currentInfo = await parseQQwryInfo()

  if (!info.versions[currentVersion]) {
    info.versions[currentVersion] = currentInfo
    if (info.latest < currentVersion) {
      info.latest = currentVersion
    }
    fs.writeFileSync('./version.json', JSON.stringify(info, null, 2))

    console.log({
      info,
      currentVersion,
      currentInfo
    })

    await execa('gh', ['release', 'create', currentVersion, '-t', currentVersion, '-n', `QQWry version: ${currentVersion}`, './dist/qqwry.dat'])
    await execa('git', ['config', 'user.name', 'github-actions'])
    await execa('git', ['config', 'user.email', 'i@i-meto.com'])
    await execa('git', ['add', './version.json'])
    await execa('git', ['commit', '-m', `chore: update version info to ${currentVersion}`])
    await execa('git', ['push'])
  }

}

const main = async () => {
  // 1. 获取微信公众号文章列表
  const articles = await getArticles()
  console.log('文章列表:', articles)

  // 2. 解析文章内容，获取下载地址
  const url = await parseArticle(articles)
  if (!url) {
    console.log('未找到下载地址')
    return
  }
  console.log(`获取到下载地址: ${url}`)

  // 3. 下载并解压
  await download(url)
  console.log('下载完成')

  // 4. 解压获取 qqwry.dat
  await extract()
  console.log('解压完成')

  // 5. 生成版本信息
  await release()
}

main()