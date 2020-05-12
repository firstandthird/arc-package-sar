#! /usr/bin/env node
const process = require('process');
const parse = require('@architect/parser');
const pkg = require('@architect/package');
const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const utils = require('./utils');

const cwd = process.cwd();
const dir = __dirname;

const packageObj = require(`${cwd}/package.json`);

async function command() {
    const text = fs.readFileSync('./.arc').toString();
    
    const result = parse(text);

    console.log(result); 

    const sam = pkg(result);

    // Inject Metadata
    sam.Metadata = {
        'AWS::ServerlessRepo::Application': {
            Name: packageObj.name,
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

    if (result.sarStatic) {
        // Running npm build
        console.log('Running Build Step');
        const buildRes = await exec('npm run build');
        if (buildRes.stderr) {
            console.log(buildRes.stderr);
            throw new Error('Build Failed');
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
            Timeout: 5,
            Environment: {
                Variables: {
                ARC_ROLE: {
                    Ref: 'Role'
                },
                ARC_CLOUDFORMATION: {
                    Ref: 'AWS::StackName'
                },
                ARC_APP_NAME: pkg.name,
                ARC_HTTP: 'aws_proxy',
                NODE_ENV: 'production',
                SESSION_TABLE_NAME: 'jwe',
                ARC_STATIC_BUCKET: {
                    Ref: 'StaticBucket'
                },
                S3_BUCKET: {
                    Ref: 'ArcS3Bucket'
                }
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

    if (result.sarParams) {
        if (!sam.Parameters) {
            sam.Parameters = {};
        }
        result.sarParams.forEach(p => {
            const [name, req, desc] = p;
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

    console.log('complete');
}

command();