const AdmZip = require('../apps/api/node_modules/adm-zip');
const fs = require('fs');

const zip = new AdmZip();
const indexHtml = '<html><body><h1>Hello SCORM</h1></body></html>';
const manifest = `<?xml version="1.0"?>
<manifest>
  <resources>
    <resource type="webcontent" href="index.html" />
  </resources>
</manifest>`;

zip.addFile("index.html", Buffer.from(indexHtml));
zip.addFile("imsmanifest.xml", Buffer.from(manifest));

zip.writeZip("mock_scorm.zip");
console.log("mock_scorm.zip created");
