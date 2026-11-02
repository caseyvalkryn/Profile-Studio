// Build site.kmz from site.kml: one DEFLATED entry `doc.kml`, as Google Earth writes it. The
// entry sets the data descriptor flag (bit 3), so its local header carries zero sizes and a reader
// must take them from the central directory. Run: node fixtures/kml/build-kmz.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';

const dir = new URL('.', import.meta.url);
const data = readFileSync(new URL('site.kml', dir));
const packed = deflateRawSync(data, { level: 9 });
const name = Buffer.from('doc.kml');
const crc = crc32(data);
const FLAGS = 0x0008; // bit 3: sizes and CRC follow the data
const DEFLATE = 8;
const TIME = 0; // 00:00:00
const DATE = (2026 - 1980) << 9 | 1 << 5 | 1; // 2026-01-01

const local = Buffer.alloc(30);
local.writeUInt32LE(0x04034b50, 0);
local.writeUInt16LE(20, 4); // version needed
local.writeUInt16LE(FLAGS, 6);
local.writeUInt16LE(DEFLATE, 8);
local.writeUInt16LE(TIME, 10);
local.writeUInt16LE(DATE, 12);
// crc, compressed and uncompressed sizes stay 0: they are in the data descriptor
local.writeUInt16LE(name.length, 26);
local.writeUInt16LE(0, 28);

const descriptor = Buffer.alloc(16);
descriptor.writeUInt32LE(0x08074b50, 0);
descriptor.writeUInt32LE(crc, 4);
descriptor.writeUInt32LE(packed.length, 8);
descriptor.writeUInt32LE(data.length, 12);

const central = Buffer.alloc(46);
central.writeUInt32LE(0x02014b50, 0);
central.writeUInt16LE(20, 4); // version made by
central.writeUInt16LE(20, 6); // version needed
central.writeUInt16LE(FLAGS, 8);
central.writeUInt16LE(DEFLATE, 10);
central.writeUInt16LE(TIME, 12);
central.writeUInt16LE(DATE, 14);
central.writeUInt32LE(crc, 16);
central.writeUInt32LE(packed.length, 20);
central.writeUInt32LE(data.length, 24);
central.writeUInt16LE(name.length, 28);
// extra, comment, disk, attributes and the local header offset (0) stay 0

const cdOffset = local.length + name.length + packed.length + descriptor.length;
const cdSize = central.length + name.length;
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(1, 8); // entries on this disk
end.writeUInt16LE(1, 10); // entries in all
end.writeUInt32LE(cdSize, 12);
end.writeUInt32LE(cdOffset, 16);

writeFileSync(
  new URL('site.kmz', dir),
  Buffer.concat([local, name, packed, descriptor, central, name, end]),
);
