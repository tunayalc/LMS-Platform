const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');

const zip = new AdmZip();
const indexHtml = '<html><body><h1>Hello SCORM</h1><p>Test Content</p></body></html>';
const manifest = `<?xml version="1.0"?>
<manifest>
  <resources>
    <resource type="webcontent" href="index.html" />
  </resources>
</manifest>`;

zip.addFile("index.html", Buffer.from(indexHtml));
zip.addFile("imsmanifest.xml", Buffer.from(manifest));

const outputPath = path.resolve(__dirname, "../../mock_scorm.zip");
zip.writeZip(outputPath);
console.log("mock_scorm.zip created at " + outputPath);
