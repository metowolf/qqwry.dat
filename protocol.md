# File Structure

All integers are stored in little-endian format.

```
┌─────────────────────────────────┐
│           File Header           │ 8 bytes
├─────────────────────────────────┤
│          Record Zone            │ Variable length
├─────────────────────────────────┤
│           Index Zone            │ 7 bytes × n entries
└─────────────────────────────────┘
```

## File Header Detail

```
┌───────────────┬───────────────┐
│ First Index   │  Last Index   │
│   Offset      │    Offset     │
│   4 bytes     │    4 bytes    │
└───────────────┴───────────────┘
```

## Record Zone Entry Detail

All strings are GBK encoded and null-terminated.

```
┌──────────┬───────────┬──────────┐
│  End IP  │  Country  │   Area   │
│ 4 bytes  │ Variable  │ Variable │
└──────────┴───────────┴──────────┘

A. Direct String:
┌─────────────┬───┐
│   String    │ 0 │ 
└─────────────┴───┘

B. Redirect Mode 1 (0x01):
┌────┬───────────┐
│ 01 │  Offset   │ → Points to [Country][Area]
└────┴───────────┘
     3 bytes

C. Redirect Mode 2 (0x02):
┌────┬───────────┐
│ 02 │  Offset   │
└────┴───────────┘
     3 bytes
```

## Index Zone Entry Detail

```
┌──────────────┬─────────────┐
│   Start IP   │   Offset    │
│   4 bytes    │   3 bytes   │
└──────────────┴─────────────┘
                 Points to Record Zone
```

## Link

- https://web.archive.org/web/20140423114336/http://lumaqq.linuxsir.org/article/qqwry_format_detail.html