## Arc Package Sar

A package for converting an arc package into a sar package for deployment into Amazon's Serverless Application Repository.

### Usage

```npm install @firstandthird/arc-package-sar```

Installs the package as well as the binare `sar` into the local repository.

When you have you arc package built and ready to push to the repository:

```npx sar```

Will read the `.arc` file, and get everything ready to push to the repository. Once complete, the script will spit out two commands to be run on the cli which will upload and do the publishing.


### Additions to arc config

`@sarStatic`

Indicates that static files are present and need to be deployed. Runs `npm build` and copies anything that gets generated into the `./public` folder to the arc-s3 endpoint.

```@sarParams
AUTH_TOKEN "Auth token used for requests, ex ?token=<AuthToken>"
WEBHOOK "Webhooks are external web hosts that page"```

Additional params that need to be passed to the functions prior to deployment of the package. Adds params to the `sam.Parameters` object.