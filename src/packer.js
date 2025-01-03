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
    this.ipTree.set(startIPInt, { endIPInt, geoOffset })
  }

  // 生成最终的二进制文件
  build() {
    // 1. 构造数据区
    const recordBuffer = Buffer.concat(this.recordList)

    // 2. 构造索引区
    const sortedIPs = Array.from(this.ipTree.keys()).sort((a, b) => a - b)
    const indexList = []
    
    for (let i = 0; i < sortedIPs.length; i++) {
      // [startIP, nextOffset]
      const startIP = sortedIPs[i]
      const { geoOffset } = this.ipTree.get(startIP)
      const indexRecord = Buffer.alloc(7)
      indexRecord.writeUInt32LE(startIP, 0)
      if (geoOffset > 0xFFFFFF) {
        throw new Error('Offset overflow')
      }
      indexRecord.writeUInt8((geoOffset >> 0) & 0xFF, 4)
      indexRecord.writeUInt8((geoOffset >> 8) & 0xFF, 5)
      indexRecord.writeUInt8((geoOffset >> 16) & 0xFF, 6)
      indexList.push(indexRecord)
    }

    // 3. 构造文件头
    const headerBuffer = Buffer.alloc(8)
    headerBuffer.writeUInt32LE(8 + recordBuffer.length, 0)
    headerBuffer.writeUInt32LE(8 + recordBuffer.length + sortedIPs.length * 7 - 7, 4)

    // 4. 合并所有部分
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
      const redirectBuf = Buffer.alloc(4)
      redirectBuf.writeUInt8(0x01, 0)
      const nextOffset = this.maxRecordOffset + 4
      redirectBuf.writeUInt8((nextOffset >> 0) & 0xFF, 1)
      redirectBuf.writeUInt8((nextOffset >> 8) & 0xFF, 2)
      redirectBuf.writeUInt8((nextOffset >> 16) & 0xFF, 3)
      this.recordList.push(redirectBuf)
      this.maxRecordOffset += redirectBuf.length

      const countryOffset = this.stringCache.get(country)
      const countryBuf = Buffer.alloc(4)
      countryBuf.writeUInt8(0x02, 0)
      countryBuf.writeUInt8((countryOffset >> 0) & 0xFF, 1)
      countryBuf.writeUInt8((countryOffset >> 8) & 0xFF, 2)
      countryBuf.writeUInt8((countryOffset >> 16) & 0xFF, 3)

      const areaOffset = this.stringCache.get(area)
      const areaBuf = Buffer.alloc(4)
      areaBuf.writeUInt8(0x02, 0)
      areaBuf.writeUInt8((areaOffset >> 0) & 0xFF, 1)
      areaBuf.writeUInt8((areaOffset >> 8) & 0xFF, 2)
      areaBuf.writeUInt8((areaOffset >> 16) & 0xFF, 3)

      this.recordList.push(countryBuf)
      this.recordList.push(areaBuf)
      this.maxRecordOffset += countryBuf.length + areaBuf.length
      // 缓存
      this.stringCache.set(`${country}\t${area}`, nextOffset)
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
    this.stringCache.set(`${country}`, currentOffset)
    this.stringCache.set(`${country}\t${area}`, currentOffset)
  }
}

export default QQWryPacker