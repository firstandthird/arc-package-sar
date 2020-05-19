#! /usr/bin/env node
/* eslint-disable no-console */
const process = require('process');
const parse = require('@architect/parser');
const deploy = require('@architect/deploy');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const utils = require('./utils');

const cwd = process.cwd();
const dir = __dirname;

const packageObj = require(`${cwd}/package.json`);
packageObj._name = utils.sanitizeName(packageObj.name);

async function command() {
  const text = fs.readFileSync('./.arc').toString();

  const arc = parse(text);
  let fingerprint = false;
  if (arc.static) {
    arc.static.forEach(r => {
      if (r[0] === 'fingerprint') {
        fingerprint = r[1];
      }
    });
  }
  console.log('Building Deploy Package...');
  let region = 'us-east-1';
  arc.aws.forEach(c => {
    if (c[0] === 'region') {
      region = c[1];
    }
  });
  process.env.AWS_REGION = region;
  await deploy.sam({ isDryRun: true, production: true });
  console.log('  Complete!');

  const sam = require(`${cwd}/sam.json`);

  // Inject Metadata
  sam.Metadata = {
    'AWS::ServerlessRepo::Application': {
      Name: packageObj._name,
      Description: packageObj.description,
      Author: packageObj.author.replace('&', 'and'),
      SpdxLicenseId: packageObj.license,
      LicenseUrl: './LICENSE',
      ReadmeUrl: './README.md',
      HomePageUrl: packageObj.homepage,
      SemanticVersion: packageObj.version,
      SourceCodeUrl: packageObj.repository.url.replace('git+', '').replace('.git', `/tree/${packageObj.version}`),
      Labels: ['upload', 's3']
    }
  };

  if (arc.sarStatic) {
    // Running npm build
    console.log('Running Build Step');
    const buildRes = await exec('npm run build');
    if (buildRes.stderr) {
      console.log('Build Errors!');
      console.log(buildRes.stderr);
    }
    console.log(buildRes.stdout);
    console.log('  Complete!');
    // Copy files
    console.log('Copying Static Files');
    const cpResult = await exec(`rm -rf ${cwd}/scripts && mkdir ${cwd}/scripts && cp -rv ${dir}/scripts/copystatic ${cwd}/scripts && rm -rf ${cwd}/scripts/copystatic/static && cp -rv ${cwd}/public ${cwd}/scripts/copystatic/static`);
    if (cpResult.stderr) {
      console.log(cpResult.stderr);
      throw new Error('Build Failed');
    }
    console.log(cpResult.stdout);
    console.log('  Complete!');

    // Initialize Script
    console.log('Initializing copy script');
    const initResult = await exec(`cd ${cwd}/scripts/copystatic && npm install`);
    if (initResult.stderr) {
      console.log(initResult.stderr);
    }
    console.log(initResult.stdout);
    if (fingerprint) {
      console.log('Asset Fingerprinting Enabled');
    }
    console.log('  Complete!');

    sam.Resources.CopyStaticAssets = {
      Type: 'AWS::Serverless::Function',
      DependsOn: [
        'StaticBucket',
        'Role'
      ],
      Properties: {
        Handler: 'index.handler',
        CodeUri: './scripts/copystatic',
        Runtime: 'nodejs12.x',
        MemorySize: 128,
        Timeout: 900,
        Environment: {
          Variables: {
            ARC_ROLE: {
              Ref: 'Role'
            },
            ARC_CLOUDFORMATION: {
              Ref: 'AWS::StackName'
            },
            ARC_APP_NAME: packageObj._name,
            ARC_HTTP: 'aws_proxy',
            NODE_ENV: 'production',
            SESSION_TABLE_NAME: 'jwe',
            ARC_STATIC_BUCKET: {
              Ref: 'StaticBucket'
            },
            S3_BUCKET: {
              Ref: 'ArcS3Bucket'
            },
            FINGERPRINT: fingerprint
          }
        },
        Role: {
          'Fn::Sub': [
            'arn:aws:iam::${AWS::AccountId}:role/${roleName}',
            {
              roleName: {
                Ref: 'Role'
              }
            }
          ]
        },
      }
    };

    sam.Resources.InvokeCopyStaticAssets = {
      Type: 'AWS::CloudFormation::CustomResource',
      DependsOn: [
        'CopyStaticAssets'
      ],
      Properties: {
        ServiceToken: { 'Fn::GetAtt': ['CopyStaticAssets', 'Arn'] }
      }
    };
  }

  if (arc.sarParams) {
    if (!sam.Parameters) {
      sam.Parameters = {};
    }
    arc.sarParams.forEach(p => {
      const [name, desc] = p;
      const objName = utils.toParam(name);
      sam.Parameters[objName] = {
        __name: name,
        Description: desc,
        Type: 'String',
        NoEcho: true,
        MinLength: 1,
        ConstraintDescription: `You must set an ${objName}.`
      };
    });
    Object.values(sam.Resources).forEach(resource => {
      if (resource.Type !== 'AWS::Serverless::Function') {
        return;
      }

      Object.keys(sam.Parameters).forEach(paramName => {
        if (!sam.Parameters[paramName].__name) {
          console.warn(`__name not set for ${paramName}`);
          return;
        }

        resource.Properties.Environment.Variables[sam.Parameters[paramName].__name] = {
          Ref: paramName
        };
      });
    });
    Object.keys(sam.Parameters).forEach(paramName => {
      // We don't want this to end up in the template
      delete sam.Parameters[paramName].__name;
    });
  }

  fs.writeFileSync('./package.sam', JSON.stringify(sam, null, 2));

  console.log('');

  console.log('Package Command:');
  console.log(`sam package --template-file package.sam --output-template-file template.yaml --s3-bucket ${packageObj._name}-template --force-upload`);

  console.log('');

  console.log('Publish Command');
  console.log('sam publish --template template.yaml --region us-east-1');

  console.log('');
  console.log('complete');
}

command();
