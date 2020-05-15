/* eslint-disable no-console, import/no-unresolved */
const AWS = require('aws-sdk');
const fs = require('fs');
const globby = require('globby');
const s3 = new AWS.S3();
const response = require('cfn-response');

const sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

exports.handler = async (event, context) => {
  // For Delete requests, immediately send a SUCCESS response.
  if (event.RequestType === 'Delete') {
    response.send(event, context, 'SUCCESS');
    await sleep(2500);
    return;
  }

  console.log(`REQUEST RECEIVED: ${JSON.stringify(event)}`);
  const files = await globby('./static/**/*');

  const fp = process.env.FINGERPRINT;
  let fpMap = {};
  if (fp) {
    fpMap = require('./static/static.json');
  }
  const promises = files.map(file => {
    const data = fs.readFileSync(file);
    console.log(`Putting file: ${file}`);
    return new Promise((resolve, reject) => {
      let key = file.replace('./static/', '');
      if (fp) {
        key = (fpMap[key]) ? fpMap[key] : key;
      }
      s3.putObject({
        Bucket: process.env.ARC_STATIC_BUCKET,
        Key: key,
        Body: Buffer.from(data, 'base64'),
        ACL: 'public-read'
      }, (err, _resp) => {
        if (err) {
          console.log(err, err.stack);
          response.send(event, context, response.FAILED, { error: err.stack });
          return reject(err);
        }

        console.log(_resp);
        console.log(`Success: ${file}`);
        return resolve();
      });
    });
  });

  await Promise.all(promises);

  response.send(event, context, response.SUCCESS, {});

  await sleep(2500);
};
