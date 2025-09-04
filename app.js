// 🔹 Saját adatok
const region = 'eu-central-1';
const identityPoolId = 'eu-central-1:2024f636-2cea-4e5a-964a-e2ee1b2615fb';
const iotEndpoint = 'aw0jttguq1qsu-ats.iot.eu-central-1.amazonaws.com';
const topicCmd = 'postalada/SmartMailbox1/cmd';
const topicAck = 'postalada/SmartMailbox1/ack';

// AWS config
AWS.config.region = region;
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
  IdentityPoolId: identityPoolId
});

function logMessage(msg) {
  const logDiv = document.getElementById('log');
  const time = new Date().toLocaleTimeString();
  logDiv.innerHTML += `[${time}] ${msg}<br>`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

// Hitelesítő adatok betöltése
AWS.config.credentials.get(function(err) {
  if (err) {
    console.error("❌ Hiba a hitelesítésnél:", err);
    logMessage('❌ Hiba a hitelesítésnél: ' + err);
    return;
  }

  // Debug infó
  console.log("✅ IdentityId:", AWS.config.credentials.identityId);
  console.log("✅ RoleArn:", AWS.config.credentials.params?.RoleArn);
  console.log("✅ Token lejár:", AWS.config.credentials.expireTime);

  // Aláírt URL generálása
  const requestUrl = SigV4Utils.getSignedUrl(iotEndpoint, region, AWS.config.credentials);

  // MQTT kliens csatlakozás
  const client = mqtt.connect(requestUrl, {
    clientId: 'SmartMailboxWebClient-' + Math.floor(Math.random() * 100000),
    reconnectPeriod: 5000 // újracsatlakozás 5 mp után
  });

  client.on('connect', () => {
    logMessage('✅ Kapcsolódva az AWS IoT‑hoz');
    client.subscribe(topicAck, (err) => {
      if (err) {
        logMessage('❌ Hiba a subscribe-nál: ' + err.message);
      } else {
        logMessage('📡 Feliratkozva: ' + topicAck);
      }
    });
  });

  client.on('message', (topic, payload) => {
    if (topic === topicAck) {
      logMessage('📥 ACK: ' + payload.toString());
    }
  });

  client.on('error', (error) => {
    logMessage('❌ MQTT hiba: ' + error.message);
  });

  window.sendCommand = function(cmd) {
    const message = JSON.stringify({ cmd: cmd });
    client.publish(topicCmd, message, (err) => {
      if (err) {
        logMessage('❌ Hiba a publish-nál: ' + err.message);
      } else {
        logMessage('📤 Küldve: ' + message);
      }
    });
  };
});

// Segédfüggvény az aláírt URL‑hez
const SigV4Utils = {
  getSignedUrl: function(endpoint, regionName, credentials) {
    const datetime = AWS.util.date.iso8601(new Date()).replace(/[:\-]|\.\d{3}/g, '');
    const date = datetime.substr(0, 8);
    const method = 'GET';
    const protocol = 'wss';
    const uri = '/mqtt';
    const service = 'iotdevicegateway';
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = date + '/' + regionName + '/' + service + '/aws4_request';
    let canonicalQuerystring = 'X-Amz-Algorithm=' + algorithm;
    canonicalQuerystring += '&X-Amz-Credential=' + encodeURIComponent(credentials.accessKeyId + '/' + credentialScope);
    canonicalQuerystring += '&X-Amz-Date=' + datetime;
    canonicalQuerystring += '&X-Amz-SignedHeaders=host';

    const host = endpoint;
    const canonicalHeaders = 'host:' + host + '\n';
    const payloadHash = AWS.util.crypto.sha256('', 'hex');
    const canonicalRequest = method + '\n' + uri + '\n' + canonicalQuerystring + '\n' + canonicalHeaders + '\nhost\n' + payloadHash;
    const stringToSign = algorithm + '\n' + datetime + '\n' + credentialScope + '\n' + AWS.util.crypto.sha256(canonicalRequest, 'hex');
    const signingKey = SigV4Utils.getSignatureKey(credentials.secretAccessKey, date, regionName, service);
    const signature = AWS.util.crypto.hmac(signingKey, stringToSign, 'hex');
    canonicalQuerystring += '&X-Amz-Signature=' + signature;
    canonicalQuerystring += '&X-Amz-Security-Token=' + encodeURIComponent(credentials.sessionToken);
    return protocol + '://' + host + uri + '?' + canonicalQuerystring;
  },
  getSignatureKey: function(key, dateStamp, regionName, serviceName) {
    const kDate = AWS.util.crypto.hmac('AWS4' + key, dateStamp);
    const kRegion = AWS.util.crypto.hmac(kDate, regionName);
    const kService = AWS.util.crypto.hmac(kRegion, serviceName);
    return AWS.util.crypto.hmac(kService, 'aws4_request');
  }
};

