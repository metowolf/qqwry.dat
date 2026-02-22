import iconv from 'iconv-lite'

class QQWryPacker {
  constructor() {
    this.indexList = []      // IP索引区
    this.recordList = []     // 记录区
    this.ipTree = new Map()  // IP树
    this.stringCache = new Map() // 字符串缓存
    this.maxRecordOffset = 8
  }

  // 插入一条IP记录
  insert(startIP, endIP, country, area) {
    const startIPInt = this._ipToInt(startIP)
    const endIPInt = this._ipToInt(endIP)
    const geoOffset = this.maxRecordOffset
    this._createRecord(endIPInt, country, area || 'CZ88.NET')
    this.ipTree.set(startIPInt, { endIPInt, geoOffset, country, area: area || 'CZ88.NET' })
  }

  // 生成最终的二进制文件
  build() {
    // 1. 构造数据区
    const recordBuffer = Buffer.concat(this.recordList)

    // 2. 合并相邻的 IP 段
    const sortedIPs = Array.from(this.ipTree.keys()).sort((a, b) => a - b)
    const mergedIPs = []

    for (let i = 0; i < sortedIPs.length; i++) {
      const currentStartIP = sortedIPs[i]
      const current = this.ipTree.get(currentStartIP)

      // 检查是否可以与上一条记录合并
      if (mergedIPs.length > 0) {
        const lastIndex = mergedIPs.length - 1
        const last = mergedIPs[lastIndex]

        // 合并条件:IP 连续且地理信息相同
        if (last.endIPInt + 1 === currentStartIP &&
            last.country === current.country &&
            last.area === current.area) {
          // 合并:扩展上一条记录的 endIP
          mergedIPs[lastIndex] = {
            startIPInt: last.startIPInt,
            endIPInt: current.endIPInt,
            geoOffset: last.geoOffset,
            country: last.country,
            area: last.area
          }
          continue
        }
      }

      // 无法合并,添加新记录
      mergedIPs.push({
        startIPInt: currentStartIP,
        endIPInt: current.endIPInt,
        geoOffset: current.geoOffset,
        country: current.country,
        area: current.area
      })
    }

    // 3. 构造索引区
    const indexList = []

    for (let i = 0; i < mergedIPs.length; i++) {
      const { startIPInt, geoOffset } = mergedIPs[i]
      const indexRecord = Buffer.alloc(7)
      indexRecord.writeUInt32LE(startIPInt, 0)
      if (geoOffset > 0xFFFFFF) {
        throw new Error('Offset overflow')
      }
      indexRecord.writeUInt8((geoOffset >> 0) & 0xFF, 4)
      indexRecord.writeUInt8((geoOffset >> 8) & 0xFF, 5)
      indexRecord.writeUInt8((geoOffset >> 16) & 0xFF, 6)
      indexList.push(indexRecord)
    }

    // 4. 构造文件头
    const headerBuffer = Buffer.alloc(8)
    headerBuffer.writeUInt32LE(8 + recordBuffer.length, 0)
    headerBuffer.writeUInt32LE(8 + recordBuffer.length + mergedIPs.length * 7 - 7, 4)

    console.log([
      '文件头长度:', headerBuffer.length,
      '记录区长度:', recordBuffer.length,
      '索引区长度:', Buffer.concat(indexList).length,
      '合并前记录数:', sortedIPs.length,
      '合并后记录数:', mergedIPs.length,
      '合并率:', ((sortedIPs.length - mergedIPs.length) / sortedIPs.length * 100).toFixed(2) + '%'
    ])

    // 5. 合并所有部分
    return Buffer.concat([
      headerBuffer,  // 文件头
      recordBuffer,  // 记录区
      ...indexList // 索引区
    ])
  }

  _ipToInt(ip) {
    const parts = ip.split('.')
    // 使用无符号右移确保结果为正数
    return ((parseInt(parts[0]) << 24) |
      (parseInt(parts[1]) << 16) |
      (parseInt(parts[2]) << 8) |
      parseInt(parts[3])) >>> 0
  }

  _createRecord(endIPInt, country, area) {
    // 写入 endIP
    const recordBuf = Buffer.alloc(4)
    recordBuf.writeUInt32LE(endIPInt, 0)
    this.recordList.push(recordBuf)
    this.maxRecordOffset += 4

    // country + area 都有的记录
    if (this.stringCache.has(`${country}\t${area}`)) {
      const redirectBuf = Buffer.alloc(4)
      redirectBuf.writeUInt8(0x01, 0)
      const offset = this.stringCache.get(`${country}\t${area}`)
      redirectBuf.writeUInt8((offset >> 0) & 0xFF, 1)
      redirectBuf.writeUInt8((offset >> 8) & 0xFF, 2)
      redirectBuf.writeUInt8((offset >> 16) & 0xFF, 3)
      this.recordList.push(redirectBuf)
      this.maxRecordOffset += 4
      return
    }

    // country, area 分开都有的记录
    if (this.stringCache.has(country) && this.stringCache.has(area)) {
      const countryOffset = this.stringCache.get(country)
      const areaOffset = this.stringCache.get(area)

      // 生成缓存键:基于两个偏移的组合
      const ptrCacheKey = `ptr:${countryOffset}:${areaOffset}`

      // 检查是否已有相同的指针组合
      if (this.stringCache.has(ptrCacheKey)) {
        // 复用:用 0x01 重定向到已有的 8 字节块
        const existingOffset = this.stringCache.get(ptrCacheKey)
        const redirectBuf = Buffer.alloc(4)
        redirectBuf.writeUInt8(0x01, 0)
        redirectBuf.writeUInt8((existingOffset >> 0) & 0xFF, 1)
        redirectBuf.writeUInt8((existingOffset >> 8) & 0xFF, 2)
        redirectBuf.writeUInt8((existingOffset >> 16) & 0xFF, 3)
        this.recordList.push(redirectBuf)
        this.maxRecordOffset += 4
        return
      }

      // 首次出现:直接写入 8 字节(省略 0x01 层)
      const currentOffset = this.maxRecordOffset

      const countryBuf = Buffer.alloc(4)
      countryBuf.writeUInt8(0x02, 0)
      countryBuf.writeUInt8((countryOffset >> 0) & 0xFF, 1)
      countryBuf.writeUInt8((countryOffset >> 8) & 0xFF, 2)
      countryBuf.writeUInt8((countryOffset >> 16) & 0xFF, 3)

      const areaBuf = Buffer.alloc(4)
      areaBuf.writeUInt8(0x02, 0)
      areaBuf.writeUInt8((areaOffset >> 0) & 0xFF, 1)
      areaBuf.writeUInt8((areaOffset >> 8) & 0xFF, 2)
      areaBuf.writeUInt8((areaOffset >> 16) & 0xFF, 3)

      this.recordList.push(countryBuf)
      this.recordList.push(areaBuf)
      this.maxRecordOffset += 8

      // 缓存这个 8 字节块的位置
      this.stringCache.set(ptrCacheKey, currentOffset)
      // 保持原有的组合缓存(用于策略 1)
      this.stringCache.set(`${country}\t${area}`, currentOffset)
      return
    }

    // country 有 area 没有的记录
    if (this.stringCache.has(country)) {
      const currentOffset = this.maxRecordOffset
      const countryOffset = this.stringCache.get(country)
      const countryBuf = Buffer.alloc(4)
      countryBuf.writeUInt8(0x02, 0)
      countryBuf.writeUInt8((countryOffset >> 0) & 0xFF, 1)
      countryBuf.writeUInt8((countryOffset >> 8) & 0xFF, 2)
      countryBuf.writeUInt8((countryOffset >> 16) & 0xFF, 3)

      const areaBuf = Buffer.concat([
        iconv.encode(area || '', 'gbk'),
        Buffer.from([0x00])
      ])

      this.recordList.push(countryBuf)
      this.recordList.push(areaBuf)
      this.maxRecordOffset += countryBuf.length + areaBuf.length

      // 缓存
      const areaOffset = currentOffset + countryBuf.length
      this.stringCache.set(area, areaOffset)
      this.stringCache.set(`${country}\t${area}`, currentOffset)
      return
    }

    // 其他情况
    const currentOffset = this.maxRecordOffset
    const countryBuf = Buffer.concat([
      iconv.encode(country || '', 'gbk'),
      Buffer.from([0x00])
    ])
    const areaBuf = Buffer.concat([
      iconv.encode(area || '', 'gbk'),
      Buffer.from([0x00])
    ])

    this.recordList.push(countryBuf)
    this.recordList.push(areaBuf)
    this.maxRecordOffset += countryBuf.length + areaBuf.length

    // 缓存
    const areaOffset = currentOffset + countryBuf.length
    this.stringCache.set(`${country}`, currentOffset)
    this.stringCache.set(area, areaOffset)
    this.stringCache.set(`${country}\t${area}`, currentOffset)
  }
}

export default QQWryPacker