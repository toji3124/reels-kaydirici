const fs = require('fs');
const path = require('path');

// Basit mor bir ikonun base64 formatı
const iconBase64 = "iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAHnSURBVHhe7d2xSQRRGETRMw0jMAQDMRADMRADMRADMRADMRADMQgDMZiX+16wP/bQ1fXzHnxoXG7//P54uPz++j22v/v59ev4/fHp500B8O6mAHh3UwC8uykA3t0UAO9uCoB3NwXAu5sC4N1NAfDupgB4d1MAvLspAN7dFADvbgqAdzcFwLubAuDdTQHw7qYAeHdTALy7KQDe3RQA724KgHc3BcC7mwLg3U0B8O6mAHh3UwC8uykA3t0UAO9uCoB3NwXAu5sC4N1NAfDupgB4d1MAvLspAN7dFADvbgqAdzcFwLubAuDdTQHw7qYAeHdTALy7KQDe3RQA724KgHc3BcC7mwLg3U0B8O6mAHh3UwC8uykA3t0UAO9uCoB3NwXAu5sC4N1NAfDupgB4d1MAvLspAN7dFADvbgqAdzcFwLubAuDdTQHw7qYAeHdTALy7KQDe3RQA724KgHc3BcC7mwLg3U0B8O6mAHh3UwC8uykA3t0UAO9uCoB3NwXAu5sC4N1NAfDupgB4d1MAvLspAN7dFADvbgqAdzcFwLubAuDdTQHw7qYAeHdTALy7KQDe3RQA724KgHc3BcC7mwLg3U0B8O6mAHh3UwC8uykA3t0UAO9uCoB3NwXAu5sC4N1NAfDupgB4d1MAvLt9ff0B4n247n+gC3oAAAAASUVORK5CYII=";

const buffer = Buffer.from(iconBase64, 'base64');
const extPath = path.join(__dirname, 'extension');

fs.writeFileSync(path.join(extPath, 'icon16.png'), buffer);
fs.writeFileSync(path.join(extPath, 'icon48.png'), buffer);
fs.writeFileSync(path.join(extPath, 'icon128.png'), buffer);

console.log('İkonlar oluşturuldu.');
