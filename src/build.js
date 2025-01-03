import fs from 'fs'
import { execa } from 'execa'
import libqqwry from 'lib-qqwry'
import Decoder from '@ipdb/czdb'
import QQWryPacker from './packer.js'

const DOWNLOAD_TOKEN = process.env.DOWNLOAD_TOKEN
const CZDB_TOKEN = process.env.CZDB_TOKEN

const download = async () => {
  const url = `https://www.cz88.net/api/communityIpAuthorization/communityIpDbFile?fn=czdb&key=${DOWNLOAD_TOKEN}`
  await fs.promises.mkdir('./temp', { recursive: true })
  await execa('wget', ['-O', './temp/download.zip', url])
  // 解压
  await execa('unzip', ['./temp/download.zip', '-d', './temp'])
}

const extract = async () => {
  const qqwryPacker = new QQWryPacker()
  const decoder = new Decoder('./temp/cz88_public_v4.czdb', CZDB_TOKEN)
  decoder.dump(info => {
    const { startIp, endIp, regionInfo } = info
    // 过滤 IPv6
    if (startIp.includes(':')) {
      return
    }
    // 分离 geo, isp
    const [geo, isp] = regionInfo.split('\t', 2)
    // 生成记录
    qqwryPacker.insert(startIp, endIp, geo, isp)
  })

  // 生成二进制文件
  const buffer = qqwryPacker.build()
  await fs.promises.mkdir('./dist', { recursive: true })
  fs.writeFileSync('./dist/qqwry.dat', buffer)
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

const parseQQWryVersion = () => {
  const qqwry = libqqwry(true, './dist/qqwry.dat')
  const info = qqwry.searchIP('255.255.255.255')
  return info.Area.match(/(\d+)/gi).join('')
}

const release = async () => {
  const info = await readInfo()
  const currentVersion = parseQQWryVersion()
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
  // 0. 下载 czdb 并解压
  await download()
  console.log('Downloaded')

  // 1. 反解压 czdb 并生成 qqwry.dat
  await extract()
  console.log('Extracted')

  // 2. 生成版本信息
  await release()
  console.log('Released')
}

main()