import fs from 'fs'
import libqqwry from 'lib-qqwry'
import { execa } from 'execa'

const readInfo = () => {
  const data = fs.readFileSync('./version.json', 'utf-8')
  return JSON.parse(data)
}

const parseQQWryVersion = async () => {
  const qqwry = libqqwry(true, './dist/qqwry.dat')
  const info = await qqwry.searchIP('255.255.255.255')
  return info.Area.match(/(\d+)/gi).join('')
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

const main = async () => {
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

main()